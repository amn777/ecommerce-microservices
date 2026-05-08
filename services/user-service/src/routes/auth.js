const express = require('express');
const { body } = require('express-validator');
const { register, login, logout, refreshToken } = require('../controllers/authController');
const { validate } = require('../middleware/validate');

const router = express.Router();

router.post('/register',
  [
    body('firstName').trim().isLength({ min: 2, max: 100 }).withMessage('First name must be 2-100 chars'),
    body('lastName').trim().isLength({ min: 2, max: 100 }).withMessage('Last name must be 2-100 chars'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number'),
    body('phone').optional().isMobilePhone().withMessage('Invalid phone number'),
  ],
  validate,
  register
);

router.post('/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  validate,
  login
);

router.post('/logout', logout);

router.post('/refresh',
  [body('refreshToken').notEmpty().withMessage('Refresh token required')],
  validate,
  refreshToken
);

module.exports = router;
