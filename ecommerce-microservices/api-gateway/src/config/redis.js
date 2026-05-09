const Redis = require('ioredis');
const { logger } = require('./logger');

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis connection retry attempt ${times}, delay: ${delay}ms`);
    return delay;
  },
  reconnectOnError: (err) => {
    logger.error(`Redis error: ${err.message}`);
    return true;
  },
  lazyConnect: false,
  maxRetriesPerRequest: 3,
});

redisClient.on('connect', () => logger.info('✅ Redis connected'));
redisClient.on('error', (err) => logger.error(`Redis error: ${err.message}`));
redisClient.on('reconnecting', () => logger.warn('Redis reconnecting...'));

module.exports = { redisClient };
