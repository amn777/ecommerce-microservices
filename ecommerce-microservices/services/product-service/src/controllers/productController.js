const { Op } = require('sequelize');
const { Product } = require('../models/Product');
const { redisClient } = require('../config/redis');
const { publishEvent } = require('../config/kafka');
const { logger } = require('../config/logger');

const CACHE_TTL = 300; // 5 minutes

// GET /api/v1/products - List products with filtering, pagination, search
const getProducts = async (req, res) => {
  try {
    const {
      page = 1, limit = 20, category, brand, search,
      minPrice, maxPrice, sort = 'createdAt', order = 'DESC',
      featured, inStock
    } = req.query;

    const cacheKey = `products:${JSON.stringify(req.query)}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.json({ ...JSON.parse(cached), source: 'cache' });
    }

    const where = { isActive: true };
    if (category) where.category = category;
    if (brand) where.brand = brand;
    if (featured === 'true') where.isFeatured = true;
    if (inStock === 'true') where.stock = { [Op.gt]: 0 };

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price[Op.gte] = parseFloat(minPrice);
      if (maxPrice) where.price[Op.lte] = parseFloat(maxPrice);
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
        { brand: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const validSorts = ['price', 'createdAt', 'rating', 'reviewCount', 'name'];
    const sortField = validSorts.includes(sort) ? sort : 'createdAt';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: products } = await Product.findAndCountAll({
      where,
      order: [[sortField, sortOrder]],
      limit: Math.min(parseInt(limit), 100),
      offset,
    });

    const response = {
      status: 'success',
      data: {
        products,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          totalPages: Math.ceil(count / parseInt(limit)),
          hasNext: offset + products.length < count,
          hasPrev: parseInt(page) > 1,
        },
      },
    };

    await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(response));
    res.json(response);
  } catch (error) {
    logger.error('Get products error', { error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to fetch products' });
  }
};

// GET /api/v1/products/:id
const getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `product:${id}`;
    
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.json({ status: 'success', data: { product: JSON.parse(cached), source: 'cache' } });
    }

    const product = await Product.findOne({
      where: { [Op.or]: [{ id }, { slug: id }], isActive: true },
    });

    if (!product) {
      return res.status(404).json({ status: 'error', message: 'Product not found' });
    }

    await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(product));
    res.json({ status: 'success', data: { product } });
  } catch (error) {
    logger.error('Get product error', { error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to fetch product' });
  }
};

// POST /api/v1/products - Create product (admin/vendor)
const createProduct = async (req, res) => {
  try {
    const product = await Product.create({
      ...req.body,
      vendorId: req.headers['x-user-id'],
    });

    // Invalidate product list cache
    await invalidateProductCache();

    // Publish event
    await publishEvent('product-events', {
      type: 'PRODUCT_CREATED',
      productId: product.id,
      name: product.name,
      price: product.price,
      stock: product.stock,
      timestamp: new Date().toISOString(),
    });

    logger.info(`Product created: ${product.id}`, { name: product.name });
    res.status(201).json({ status: 'success', data: { product } });
  } catch (error) {
    logger.error('Create product error', { error: error.message });
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ status: 'error', message: 'SKU or slug already exists' });
    }
    res.status(500).json({ status: 'error', message: 'Failed to create product' });
  }
};

// PUT /api/v1/products/:id - Update product
const updateProduct = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ status: 'error', message: 'Product not found' });
    }

    const oldStock = product.stock;
    await product.update(req.body);

    // Invalidate caches
    await redisClient.del(`product:${req.params.id}`);
    await invalidateProductCache();

    // Publish stock update event if stock changed
    if (req.body.stock !== undefined && req.body.stock !== oldStock) {
      await publishEvent('product-events', {
        type: 'PRODUCT_STOCK_UPDATED',
        productId: product.id,
        oldStock,
        newStock: product.stock,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ status: 'success', data: { product } });
  } catch (error) {
    logger.error('Update product error', { error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to update product' });
  }
};

// PATCH /api/v1/products/:id/stock - Update stock (called by order service)
const updateStock = async (req, res) => {
  try {
    const { productId, quantity, operation } = req.body; // operation: 'reserve' | 'release' | 'deduct'
    
    const product = await Product.findByPk(productId || req.params.id);
    if (!product) {
      return res.status(404).json({ status: 'error', message: 'Product not found' });
    }

    let updateData = {};
    
    switch (operation) {
      case 'reserve':
        if (product.availableStock() < quantity) {
          return res.status(400).json({ status: 'error', message: 'Insufficient stock' });
        }
        updateData.reservedStock = product.reservedStock + quantity;
        break;
      case 'release':
        updateData.reservedStock = Math.max(0, product.reservedStock - quantity);
        break;
      case 'deduct':
        updateData.stock = Math.max(0, product.stock - quantity);
        updateData.reservedStock = Math.max(0, product.reservedStock - quantity);
        break;
      default:
        return res.status(400).json({ status: 'error', message: 'Invalid operation' });
    }

    await product.update(updateData);
    await redisClient.del(`product:${product.id}`);

    // Low stock alert
    if (product.stock <= product.lowStockThreshold) {
      await publishEvent('product-events', {
        type: 'PRODUCT_LOW_STOCK',
        productId: product.id,
        name: product.name,
        currentStock: product.stock,
        threshold: product.lowStockThreshold,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ status: 'success', data: { product } });
  } catch (error) {
    logger.error('Update stock error', { error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to update stock' });
  }
};

// DELETE /api/v1/products/:id
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ status: 'error', message: 'Product not found' });
    }

    // Soft delete
    await product.update({ isActive: false });
    await redisClient.del(`product:${req.params.id}`);
    await invalidateProductCache();

    res.json({ status: 'success', message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to delete product' });
  }
};

// GET /api/v1/products/categories - Get all categories
const getCategories = async (req, res) => {
  try {
    const cacheKey = 'products:categories';
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.json({ status: 'success', data: { categories: JSON.parse(cached) } });
    }

    const categories = await Product.findAll({
      attributes: ['category', [Product.sequelize.fn('COUNT', Product.sequelize.col('id')), 'count']],
      where: { isActive: true },
      group: ['category'],
      raw: true,
    });

    await redisClient.setex(cacheKey, 600, JSON.stringify(categories));
    res.json({ status: 'success', data: { categories } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch categories' });
  }
};

const invalidateProductCache = async () => {
  const keys = await redisClient.keys('products:*');
  if (keys.length > 0) {
    await redisClient.del(...keys);
  }
};

module.exports = { getProducts, getProduct, createProduct, updateProduct, updateStock, deleteProduct, getCategories };
