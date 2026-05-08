const axios = require('axios');
const { Order } = require('../models/Order');
const { redisClient } = require('../config/redis');
const { publishEvent } = require('../config/kafka');
const { logger } = require('../config/logger');

const PRODUCT_SERVICE = process.env.PRODUCT_SERVICE_URL || 'http://product-service:3002';

// Helper to calculate order totals
const calculateOrderTotals = (items) => {
  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = subtotal * 0.1; // 10% tax
  const shippingCost = subtotal > 100 ? 0 : 9.99; // Free shipping over $100
  const total = subtotal + tax + shippingCost;
  return { subtotal: parseFloat(subtotal.toFixed(2)), tax: parseFloat(tax.toFixed(2)), shippingCost: parseFloat(shippingCost.toFixed(2)), total: parseFloat(total.toFixed(2)) };
};

// POST /api/v1/orders - Create order
const createOrder = async (req, res) => {
  const userId = req.headers['x-user-id'];
  
  try {
    const { items, shippingAddress, billingAddress, shippingMethod, notes } = req.body;

    // Validate and fetch products
    const validatedItems = [];
    for (const item of items) {
      try {
        const { data } = await axios.get(`${PRODUCT_SERVICE}/api/v1/products/${item.productId}`);
        const product = data.data.product;
        
        if (!product.isActive) {
          return res.status(400).json({ status: 'error', message: `Product ${product.name} is not available` });
        }
        
        const available = product.stock - product.reservedStock;
        if (available < item.quantity) {
          return res.status(400).json({
            status: 'error',
            message: `Insufficient stock for ${product.name}. Available: ${available}`,
          });
        }

        validatedItems.push({
          productId: product.id,
          name: product.name,
          sku: product.sku,
          image: product.images?.[0]?.url || null,
          price: parseFloat(product.price),
          quantity: item.quantity,
          subtotal: parseFloat(product.price) * item.quantity,
        });
      } catch (err) {
        if (err.response?.status === 404) {
          return res.status(400).json({ status: 'error', message: `Product ${item.productId} not found` });
        }
        throw err;
      }
    }

    const totals = calculateOrderTotals(validatedItems);

    // Create order in DB
    const order = await Order.create({
      userId,
      items: validatedItems,
      ...totals,
      shippingAddress,
      billingAddress: billingAddress || shippingAddress,
      shippingMethod,
      notes,
    });

    // Reserve stock for each item
    for (const item of validatedItems) {
      await axios.patch(`${PRODUCT_SERVICE}/api/v1/products/${item.productId}/stock`, {
        productId: item.productId,
        quantity: item.quantity,
        operation: 'reserve',
      }).catch(err => logger.warn(`Failed to reserve stock for ${item.productId}`, { error: err.message }));
    }

    // Cache order
    await redisClient.setex(`order:${order.id}`, 1800, JSON.stringify(order));

    // Publish ORDER_CREATED event (triggers payment flow)
    await publishEvent('order-events', {
      type: 'ORDER_CREATED',
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId,
      items: validatedItems,
      total: order.total,
      timestamp: new Date().toISOString(),
    });

    logger.info(`Order created: ${order.orderNumber}`, { orderId: order.id, userId });

    res.status(201).json({
      status: 'success',
      message: 'Order created successfully',
      data: { order },
    });
  } catch (error) {
    logger.error('Create order error', { error: error.message, userId });
    res.status(500).json({ status: 'error', message: 'Failed to create order' });
  }
};

// GET /api/v1/orders - Get user's orders
const getOrders = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { page = 1, limit = 10, status } = req.query;

    const where = { userId };
    if (status) where.status = status;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows: orders } = await Order.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Math.min(parseInt(limit), 50),
      offset,
    });

    res.json({
      status: 'success',
      data: {
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          totalPages: Math.ceil(count / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error('Get orders error', { error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to fetch orders' });
  }
};

// GET /api/v1/orders/:id - Get single order
const getOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];

    // Check cache
    const cached = await redisClient.get(`order:${id}`);
    if (cached) {
      const order = JSON.parse(cached);
      if (order.userId !== userId) {
        return res.status(403).json({ status: 'error', message: 'Access denied' });
      }
      return res.json({ status: 'success', data: { order, source: 'cache' } });
    }

    const order = await Order.findOne({ where: { id, userId } });
    if (!order) {
      return res.status(404).json({ status: 'error', message: 'Order not found' });
    }

    await redisClient.setex(`order:${id}`, 1800, JSON.stringify(order));
    res.json({ status: 'success', data: { order } });
  } catch (error) {
    logger.error('Get order error', { error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to fetch order' });
  }
};

// PATCH /api/v1/orders/:id/status - Update order status (internal/admin)
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, trackingNumber, cancelReason } = req.body;

    const order = await Order.findByPk(id);
    if (!order) {
      return res.status(404).json({ status: 'error', message: 'Order not found' });
    }

    const allowedTransitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['shipped', 'cancelled'],
      shipped: ['delivered'],
      delivered: ['refunded'],
      cancelled: [],
      refunded: [],
    };

    if (!allowedTransitions[order.status]?.includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: `Cannot transition from ${order.status} to ${status}`,
      });
    }

    const updateData = { status };
    if (trackingNumber) updateData.trackingNumber = trackingNumber;
    if (cancelReason) updateData.cancelReason = cancelReason;
    if (status === 'delivered') updateData.deliveredAt = new Date();

    await order.update(updateData);
    await redisClient.del(`order:${id}`);

    // Publish status change event
    await publishEvent('order-events', {
      type: 'ORDER_STATUS_UPDATED',
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      previousStatus: order.status,
      newStatus: status,
      trackingNumber,
      timestamp: new Date().toISOString(),
    });

    // Release reserved stock if cancelled
    if (status === 'cancelled') {
      for (const item of order.items) {
        await axios.patch(`${PRODUCT_SERVICE}/api/v1/products/${item.productId}/stock`, {
          productId: item.productId,
          quantity: item.quantity,
          operation: 'release',
        }).catch(err => logger.warn(`Failed to release stock for ${item.productId}`, { error: err.message }));
      }
    }

    logger.info(`Order ${order.orderNumber} status: ${order.status} → ${status}`);
    res.json({ status: 'success', data: { order } });
  } catch (error) {
    logger.error('Update order status error', { error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to update order status' });
  }
};

// DELETE /api/v1/orders/:id - Cancel order
const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];
    const { reason } = req.body;

    const order = await Order.findOne({ where: { id, userId } });
    if (!order) {
      return res.status(404).json({ status: 'error', message: 'Order not found' });
    }

    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({
        status: 'error',
        message: `Cannot cancel order with status: ${order.status}`,
      });
    }

    await order.update({ status: 'cancelled', cancelReason: reason });
    await redisClient.del(`order:${id}`);

    // Release stock
    for (const item of order.items) {
      await axios.patch(`${PRODUCT_SERVICE}/api/v1/products/${item.productId}/stock`, {
        productId: item.productId,
        quantity: item.quantity,
        operation: 'release',
      }).catch(err => logger.warn('Stock release failed', { error: err.message }));
    }

    await publishEvent('order-events', {
      type: 'ORDER_CANCELLED',
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId,
      reason,
      timestamp: new Date().toISOString(),
    });

    res.json({ status: 'success', message: 'Order cancelled successfully', data: { order } });
  } catch (error) {
    logger.error('Cancel order error', { error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to cancel order' });
  }
};

// GET /api/v1/orders/stats - Order statistics
const getOrderStats = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const cacheKey = `order:stats:${userId}`;
    
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.json({ status: 'success', data: JSON.parse(cached) });

    const [totalOrders, pendingOrders, totalSpent] = await Promise.all([
      Order.count({ where: { userId } }),
      Order.count({ where: { userId, status: 'pending' } }),
      Order.sum('total', { where: { userId, paymentStatus: 'paid' } }),
    ]);

    const stats = { totalOrders, pendingOrders, totalSpent: totalSpent || 0 };
    await redisClient.setex(cacheKey, 300, JSON.stringify(stats));
    
    res.json({ status: 'success', data: stats });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch stats' });
  }
};

module.exports = { createOrder, getOrders, getOrder, updateOrderStatus, cancelOrder, getOrderStats };
