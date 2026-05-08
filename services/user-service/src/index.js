require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { sequelize } = require('./config/database');
const { redisClient } = require('./config/redis');
const { connectKafka, disconnectKafka } = require('./config/kafka');
const { logger } = require('./config/logger');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const checks = { service: 'user-service', status: 'healthy' };
  
  try {
    await sequelize.authenticate();
    checks.database = 'healthy';
  } catch { checks.database = 'unhealthy'; }

  try {
    await redisClient.ping();
    checks.redis = 'healthy';
  } catch { checks.redis = 'unhealthy'; }

  const isHealthy = Object.values(checks).every(v => v === 'healthy' || v === 'user-service');
  res.status(isHealthy ? 200 : 503).json({ ...checks, timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);

// ─────────────────────────────────────────────
// ERROR HANDLER
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

// ─────────────────────────────────────────────
// STARTUP
// ─────────────────────────────────────────────
const start = async () => {
  try {
    await sequelize.authenticate();
    logger.info('✅ PostgreSQL connected');
    await sequelize.sync({ alter: true });
    logger.info('✅ Database synced');
    
    await connectKafka();
    logger.info('✅ Kafka connected');
    
    await redisClient.ping();
    logger.info('✅ Redis connected');

    app.listen(PORT, () => logger.info(`🚀 User Service running on port ${PORT}`));
  } catch (error) {
    logger.error('Failed to start user service', { error: error.message });
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await disconnectKafka();
  await redisClient.quit();
  await sequelize.close();
  process.exit(0);
});

start();
module.exports = app;
