const jwt = require('jsonwebtoken');
const { redisClient } = require('../config/redis');
const { logger } = require('../config/logger');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Access token required',
        requestId: req.requestId,
      });
    }

    const token = authHeader.split(' ')[1];

    // Check if token is blacklisted (logged out)
    const isBlacklisted = await redisClient.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        status: 'error',
        message: 'Token has been revoked',
        requestId: req.requestId,
      });
    }

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check cached user session
    const cachedUser = await redisClient.get(`session:${decoded.id}`);
    if (cachedUser) {
      req.user = JSON.parse(cachedUser);
    } else {
      req.user = { id: decoded.id, email: decoded.email, role: decoded.role };
    }

    logger.info(`Auth: User ${req.user.id} accessed ${req.method} ${req.path}`, {
      requestId: req.requestId,
      userId: req.user.id,
    });

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token has expired',
        requestId: req.requestId,
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token',
        requestId: req.requestId,
      });
    }
    logger.error('Auth middleware error', { error: error.message, requestId: req.requestId });
    return res.status(500).json({
      status: 'error',
      message: 'Authentication service error',
      requestId: req.requestId,
    });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Admin access required',
      requestId: req.requestId,
    });
  }
  next();
};

module.exports = { authMiddleware, adminMiddleware };
