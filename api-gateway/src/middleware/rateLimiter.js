const rateLimit = require('express-rate-limit');
const { redisClient } = require('../config/redis');
const { logger } = require('../config/logger');

// Custom Redis store for rate limiting
class RedisStore {
  constructor(client) {
    this.client = client;
    this.prefix = 'rl:';
  }

  async increment(key) {
    const redisKey = `${this.prefix}${key}`;
    const multi = this.client.multi();
    multi.incr(redisKey);
    multi.expire(redisKey, Math.ceil(parseInt(process.env.RATE_LIMIT_WINDOW_MS || 900000) / 1000));
    const results = await multi.exec();
    const totalHits = Array.isArray(results?.[0]) ? results[0][1] : results[0];
    return {
      totalHits: Number(totalHits),
      resetTime: new Date(Date.now() + parseInt(process.env.RATE_LIMIT_WINDOW_MS || 900000)),
    };
  }

  async decrement(key) {
    await this.client.decr(`${this.prefix}${key}`);
  }

  async resetKey(key) {
    await this.client.del(`${this.prefix}${key}`);
  }
}

const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(redisClient),
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded`, {
      ip: req.ip,
      userId: req.user?.id,
      path: req.path,
      requestId: req.requestId,
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many requests. Please try again later.',
      retryAfter: res.getHeader('Retry-After'),
      requestId: req.requestId,
    });
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  },
});

// Stricter limiter for auth endpoints
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Only 10 attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(redisClient),
  keyGenerator: (req) => `auth:${req.ip}`,
  handler: (req, res) => {
    logger.warn(`Auth rate limit exceeded`, { ip: req.ip, requestId: req.requestId });
    res.status(429).json({
      status: 'error',
      message: 'Too many authentication attempts. Please try again in 15 minutes.',
      requestId: req.requestId,
    });
  },
});

module.exports = { rateLimiter, authRateLimiter };
