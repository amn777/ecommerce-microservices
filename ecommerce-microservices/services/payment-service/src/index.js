require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { body } = require('express-validator');
const { sequelize } = require('./config/database');
const { redisClient } = require('./config/redis');
const { connectKafka, disconnectKafka } = require('./config/kafka');
const { logger } = require('./config/logger');
const { createPaymentIntent, confirmPayment, refundPayment, getPayments, handleWebhook } = require('./controllers/paymentController');
const { validate } = require('./middleware/validate');

const app = express();
const PORT = process.env.PORT || 3004;

app.use(helmet());
app.use(cors());

// Raw body needed for Stripe webhooks
app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

app.get('/health', async (req, res) => {
  const checks = { service: 'payment-service' };
  try { await sequelize.authenticate(); checks.database = 'healthy'; } catch { checks.database = 'unhealthy'; }
  try { await redisClient.ping(); checks.redis = 'healthy'; } catch { checks.redis = 'unhealthy'; }
  res.json({ status: 'OK', ...checks, timestamp: new Date().toISOString() });
});

// Routes
app.get('/api/v1/payments', getPayments);

app.post('/api/v1/payments/intent',
  [
    body('orderId').isUUID().withMessage('Valid order ID required'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Valid amount required'),
    body('currency').optional().isLength({ min: 3, max: 3 }),
  ],
  validate,
  createPaymentIntent
);

app.post('/api/v1/payments/confirm',
  [body('paymentId').isUUID()],
  validate,
  confirmPayment
);

app.post('/api/v1/payments/refund',
  [
    body('paymentId').isUUID(),
    body('amount').optional().isFloat({ min: 0.01 }),
  ],
  validate,
  refundPayment
);

app.post('/api/v1/payments/webhook', handleWebhook);

app.use((err, req, res, next) => {
  logger.error(err.message);
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

const start = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    await connectKafka();
    app.listen(PORT, () => logger.info(`🚀 Payment Service running on port ${PORT}`));
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
