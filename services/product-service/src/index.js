require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { sequelize } = require('./config/database');
const { redisClient } = require('./config/redis');
const { connectKafka, disconnectKafka } = require('./config/kafka');
const { logger } = require('./config/logger');
const { getProducts, getProduct, createProduct, updateProduct, updateStock, deleteProduct, getCategories } = require('./controllers/productController');
const { body, param } = require('express-validator');
const { validate } = require('./middleware/validate');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  const checks = { service: 'product-service' };
  try { await sequelize.authenticate(); checks.database = 'healthy'; } catch { checks.database = 'unhealthy'; }
  try { await redisClient.ping(); checks.redis = 'healthy'; } catch { checks.redis = 'unhealthy'; }
  res.json({ status: 'OK', ...checks, timestamp: new Date().toISOString() });
});

// Routes
app.get('/api/v1/products/categories', getCategories);
app.get('/api/v1/products', getProducts);
app.get('/api/v1/products/:id', getProduct);

app.post('/api/v1/products',
  [
    body('name').notEmpty().trim(),
    body('price').isFloat({ min: 0 }),
    body('sku').notEmpty().trim(),
    body('category').notEmpty().trim(),
    body('stock').optional().isInt({ min: 0 }),
  ],
  validate,
  createProduct
);

app.put('/api/v1/products/:id', updateProduct);
app.patch('/api/v1/products/:id/stock', updateStock);
app.delete('/api/v1/products/:id', deleteProduct);

app.use((err, req, res, next) => {
  logger.error(err.message);
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

const start = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    await connectKafka();
    app.listen(PORT, () => logger.info(`🚀 Product Service running on port ${PORT}`));
  } catch (error) {
    logger.error('Startup failed', { error: error.message });
    process.exit(1);
  }
};

process.on('SIGTERM', async () => {
  await disconnectKafka();
  await redisClient.quit();
  await sequelize.close();
  process.exit(0);
});

start();
module.exports = app;
