const requireEnv = (key) => {
  if (!process.env[key]) {
    throw new Error(`❌ Missing ENV variable: ${key}`);
  }
  return process.env[key];
};

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

const { authMiddleware } = require('./middleware/auth');
const { rateLimiter } = require('./middleware/rateLimiter');
const { logger } = require('./config/logger');
const { redisClient } = require('./config/redis');

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────
// SECURITY MIDDLEWARE
// ─────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

// ─────────────────────────────────────────────
// REQUEST TRACKING
// ─────────────────────────────────────────────
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// ─────────────────────────────────────────────
// LOGGING
// ─────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────────
// RATE LIMITING
// ─────────────────────────────────────────────
app.use('/api/', rateLimiter);

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const services = {
    gateway: 'healthy',
    redis: 'unknown',
  };

  try {
    await redisClient.ping();
    services.redis = 'healthy';
  } catch {
    services.redis = 'unhealthy';
  }

  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'api-gateway',
    version: '1.0.0',
    uptime: process.uptime(),
    services,
  });
});

// ─────────────────────────────────────────────
// PROXY CONFIGURATION
// ─────────────────────────────────────────────
const proxyOptions = (target, pathRewrite = {}) => ({
  target,
  changeOrigin: true,
  pathRewrite,
  onError: (err, req, res) => {
    logger.error(`Proxy error: ${err.message}`, { requestId: req.requestId, target });
    res.status(503).json({
      status: 'error',
      message: 'Service temporarily unavailable',
      requestId: req.requestId,
    });
  },
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('X-Request-ID', req.requestId);
    if (req.user) {
      proxyReq.setHeader('X-User-ID', req.user.id);
      proxyReq.setHeader('X-User-Role', req.user.role);
    }

    if (req.body && Object.keys(req.body).length > 0) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }
  },
});

// ─────────────────────────────────────────────
// PUBLIC ROUTES (No Auth Required)
// ─────────────────────────────────────────────

// Auth routes (register/login)
app.use('/api/v1/auth',
  createProxyMiddleware(proxyOptions(
    requireEnv('USER_SERVICE_URL'),
    { '^/api/v1/auth': '/api/v1/auth' }
  ))
);

// Public product browsing
app.use('/api/v1/products',
  createProxyMiddleware(proxyOptions(
    process.env.PRODUCT_SERVICE_URL,
    { '^/api/v1/products': '/api/v1/products' }
  ))
);

// ─────────────────────────────────────────────
// PROTECTED ROUTES (Auth Required)
// ─────────────────────────────────────────────
app.use('/api/v1/users', authMiddleware,
  createProxyMiddleware(proxyOptions(
    requireEnv('USER_SERVICE_URL'),
    { '^/api/v1/users': '/api/v1/users' }
  ))
);

app.use('/api/v1/orders', authMiddleware,
  createProxyMiddleware(proxyOptions(
    process.env.ORDER_SERVICE_URL,
    { '^/api/v1/orders': '/api/v1/orders' }
  ))
);

app.use('/api/v1/payments', authMiddleware,
  createProxyMiddleware(proxyOptions(
    process.env.PAYMENT_SERVICE_URL,
    { '^/api/v1/payments': '/api/v1/payments' }
  ))
);

app.use('/api/v1/notifications', authMiddleware,
  createProxyMiddleware(proxyOptions(
    process.env.NOTIFICATION_SERVICE_URL,
    { '^/api/v1/notifications': '/api/v1/notifications' }
  ))
);

// ─────────────────────────────────────────────
// 404 HANDLER
// ─────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`,
    requestId: req.requestId,
  });
});

// ─────────────────────────────────────────────
// GLOBAL ERROR HANDLER
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack, requestId: req.requestId });
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    requestId: req.requestId,
  });
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`🚀 API Gateway running on port ${PORT}`);
  logger.info(`📡 User Service: ${requireEnv('USER_SERVICE_URL')}`);
  logger.info(`📦 Product Service: ${requireEnv('PRODUCT_SERVICE_URL')}`);
  logger.info(`🛒 Order Service: ${requireEnv('ORDER_SERVICE_URL')}`);
  logger.info(`💳 Payment Service: ${requireEnv('PAYMENT_SERVICE_URL')}`);
  logger.info(`🔔 Notification Service: ${requireEnv('NOTIFICATION_SERVICE_URL')}`);
});

module.exports = app;
