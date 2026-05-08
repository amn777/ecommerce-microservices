require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { body } = require('express-validator');
const { sequelize } = require('./config/database');
const { redisClient } = require('./config/redis');
const { connectKafka, disconnectKafka, consumer, publishEvent } = require('./config/kafka');
const { logger } = require('./config/logger');
const { createOrder, getOrders, getOrder, updateOrderStatus, cancelOrder, getOrderStats } = require('./controllers/orderController');
const { validate } = require('./middleware/validate');
const { Order } = require('./models/Order');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  const checks = { service: 'order-service' };
  try { await sequelize.authenticate(); checks.database = 'healthy'; } catch { checks.database = 'unhealthy'; }
  try { await redisClient.ping(); checks.redis = 'healthy'; } catch { checks.redis = 'unhealthy'; }
  res.json({ status: 'OK', ...checks, timestamp: new Date().toISOString() });
});

// Routes
app.get('/api/v1/orders/stats', getOrderStats);
app.get('/api/v1/orders', getOrders);
app.get('/api/v1/orders/:id', getOrder);

app.post('/api/v1/orders',
  [
    body('items').isArray({ min: 1 }).withMessage('At least one item required'),
    body('items.*.productId').isUUID().withMessage('Valid product ID required'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('shippingAddress').isObject().withMessage('Shipping address required'),
    body('shippingAddress.street').notEmpty(),
    body('shippingAddress.city').notEmpty(),
    body('shippingAddress.country').notEmpty(),
  ],
  validate,
  createOrder
);

app.patch('/api/v1/orders/:id/status',
  [body('status').isIn(['confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'])],
  validate,
  updateOrderStatus
);

app.delete('/api/v1/orders/:id', cancelOrder);

app.use((err, req, res, next) => {
  logger.error(err.message);
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

// Kafka consumer - listen for payment events
const setupKafkaConsumer = async () => {
  await consumer.subscribe({ topics: ['payment-events'], fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        logger.info(`Order service received: ${event.type}`);

        switch (event.type) {
          case 'PAYMENT_COMPLETED': {
            const order = await Order.findByPk(event.orderId);
            if (order) {
              await order.update({
                status: 'confirmed',
                paymentStatus: 'paid',
                paymentId: event.paymentId,
                paymentMethod: event.paymentMethod,
              });
              await publishEvent('order-events', {
                type: 'ORDER_CONFIRMED',
                orderId: order.id,
                orderNumber: order.orderNumber,
                userId: order.userId,
                timestamp: new Date().toISOString(),
              });
              logger.info(`Order confirmed after payment: ${order.orderNumber}`);
            }
            break;
          }
          case 'PAYMENT_FAILED': {
            const order = await Order.findByPk(event.orderId);
            if (order) {
              await order.update({ status: 'cancelled', paymentStatus: 'failed', cancelReason: 'Payment failed' });
              logger.warn(`Order cancelled due to payment failure: ${event.orderId}`);
            }
            break;
          }
        }
      } catch (error) {
        logger.error('Kafka message processing error', { error: error.message });
      }
    },
  });
};

const start = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    await connectKafka();
    await setupKafkaConsumer();
    app.listen(PORT, () => logger.info(`🚀 Order Service running on port ${PORT}`));
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
