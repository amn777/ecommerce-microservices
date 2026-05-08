const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { User } = require('../models/User');
const { redisClient } = require('../config/redis');
const { publishEvent } = require('../config/kafka');
const { logger } = require('../config/logger');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  const refreshToken = jwt.sign(
    { id: user.id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  return { accessToken, refreshToken };
};

// POST /api/v1/auth/register
const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone } = req.body;

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ status: 'error', message: 'Email already registered' });
    }

    const user = await User.create({ firstName, lastName, email, password, phone });
    const { accessToken, refreshToken } = generateTokens(user);

    // Store refresh token
    await user.update({ refreshToken });

    // Cache user session in Redis (24hr)
    await redisClient.setex(
      `session:${user.id}`,
      86400,
      JSON.stringify({ id: user.id, email: user.email, role: user.role })
    );

    // Publish user-registered event to Kafka
    await publishEvent('user-events', {
      type: 'USER_REGISTERED',
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      timestamp: new Date().toISOString(),
    });

    logger.info(`User registered: ${user.email}`, { userId: user.id });

    res.status(201).json({
      status: 'success',
      message: 'User registered successfully',
      data: {
        user: user.toSafeJSON(),
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logger.error('Register error', { error: error.message });
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: error.errors.map(e => ({ field: e.path, message: e.message })),
      });
    }
    res.status(500).json({ status: 'error', message: 'Registration failed' });
  }
};

// POST /api/v1/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user || !user.isActive) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      logger.warn(`Failed login attempt for: ${email}`);
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user);
    await user.update({ refreshToken, lastLoginAt: new Date() });

    // Cache session in Redis
    await redisClient.setex(
      `session:${user.id}`,
      86400,
      JSON.stringify({ id: user.id, email: user.email, role: user.role })
    );

    // Publish login event
    await publishEvent('user-events', {
      type: 'USER_LOGGED_IN',
      userId: user.id,
      email: user.email,
      timestamp: new Date().toISOString(),
    });

    logger.info(`User logged in: ${user.email}`, { userId: user.id });

    res.json({
      status: 'success',
      data: {
        user: user.toSafeJSON(),
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({ status: 'error', message: 'Login failed' });
  }
};

// POST /api/v1/auth/logout
const logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const userId = req.headers['x-user-id'];

    if (token) {
      // Blacklist token in Redis until expiry
      const decoded = jwt.decode(token);
      const ttl = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 86400;
      if (ttl > 0) {
        await redisClient.setex(`blacklist:${token}`, ttl, '1');
      }
    }

    // Clear session cache
    if (userId) {
      await redisClient.del(`session:${userId}`);
      await User.update({ refreshToken: null }, { where: { id: userId } });
    }

    res.json({ status: 'success', message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error', { error: error.message });
    res.status(500).json({ status: 'error', message: 'Logout failed' });
  }
};

// POST /api/v1/auth/refresh
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      return res.status(400).json({ status: 'error', message: 'Refresh token required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ status: 'error', message: 'Invalid refresh token' });
    }

    const user = await User.findOne({ where: { id: decoded.id, refreshToken: token } });
    if (!user) {
      return res.status(401).json({ status: 'error', message: 'Invalid refresh token' });
    }

    const tokens = generateTokens(user);
    await user.update({ refreshToken: tokens.refreshToken });

    res.json({ status: 'success', data: tokens });
  } catch (error) {
    res.status(401).json({ status: 'error', message: 'Invalid or expired refresh token' });
  }
};

module.exports = { register, login, logout, refreshToken };
