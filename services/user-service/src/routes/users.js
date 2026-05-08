const express = require('express');
const { body, param } = require('express-validator');
const { User } = require('../models/User');
const { redisClient } = require('../config/redis');
const { logger } = require('../config/logger');
const { validate } = require('../middleware/validate');

const router = express.Router();

// GET /api/v1/users/me - Get current user profile
router.get('/me', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    
    // Check Redis cache first
    const cached = await redisClient.get(`user:profile:${userId}`);
    if (cached) {
      return res.json({ status: 'success', data: { user: JSON.parse(cached), source: 'cache' } });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const safeUser = user.toSafeJSON();
    
    // Cache profile for 5 min
    await redisClient.setex(`user:profile:${userId}`, 300, JSON.stringify(safeUser));

    res.json({ status: 'success', data: { user: safeUser } });
  } catch (error) {
    logger.error('Get profile error', { error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to fetch profile' });
  }
});

// PUT /api/v1/users/me - Update profile
router.put('/me',
  [
    body('firstName').optional().trim().isLength({ min: 2, max: 100 }),
    body('lastName').optional().trim().isLength({ min: 2, max: 100 }),
    body('phone').optional().isMobilePhone(),
    body('address').optional().isObject(),
  ],
  validate,
  async (req, res) => {
    try {
      const userId = req.headers['x-user-id'];
      const { firstName, lastName, phone, address, avatar } = req.body;

      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      await user.update({ firstName, lastName, phone, address, avatar });
      
      // Invalidate cache
      await redisClient.del(`user:profile:${userId}`);

      logger.info(`Profile updated for user: ${userId}`);
      res.json({ status: 'success', data: { user: user.toSafeJSON() } });
    } catch (error) {
      logger.error('Update profile error', { error: error.message });
      res.status(500).json({ status: 'error', message: 'Failed to update profile' });
    }
  }
);

// PUT /api/v1/users/me/password - Change password
router.put('/me/password',
  [
    body('currentPassword').notEmpty().withMessage('Current password required'),
    body('newPassword').isLength({ min: 8 }).withMessage('Min 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Must contain uppercase, lowercase, number'),
  ],
  validate,
  async (req, res) => {
    try {
      const userId = req.headers['x-user-id'];
      const { currentPassword, newPassword } = req.body;

      const user = await User.findByPk(userId);
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ status: 'error', message: 'Current password is incorrect' });
      }

      await user.update({ password: newPassword });
      res.json({ status: 'success', message: 'Password changed successfully' });
    } catch (error) {
      res.status(500).json({ status: 'error', message: 'Failed to change password' });
    }
  }
);

// GET /api/v1/users/:id - Get user by ID (admin/internal)
router.get('/:id',
  [param('id').isUUID().withMessage('Invalid user ID')],
  validate,
  async (req, res) => {
    try {
      const user = await User.findByPk(req.params.id);
      if (!user) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }
      res.json({ status: 'success', data: { user: user.toSafeJSON() } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: 'Failed to fetch user' });
    }
  }
);

module.exports = router;
