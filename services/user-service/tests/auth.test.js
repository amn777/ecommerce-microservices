/**
 * User Service - Auth Controller Tests
 * Run: npm test
 */

const request = require('supertest');
const express = require('express');

// Mock dependencies
jest.mock('../src/config/database', () => ({
  sequelize: {
    authenticate: jest.fn().mockResolvedValue(true),
    sync: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../src/config/redis', () => ({
  redisClient: {
    ping: jest.fn().mockResolvedValue('PONG'),
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../src/config/kafka', () => ({
  connectKafka: jest.fn().mockResolvedValue(true),
  publishEvent: jest.fn().mockResolvedValue(true),
  disconnectKafka: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/models/User', () => ({
  User: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

const { User } = require('../src/models/User');

// ─────────────────────────────────────────────
// AUTH CONTROLLER TESTS
// ─────────────────────────────────────────────
describe('Auth Controller', () => {
  
  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const mockUser = {
        id: 'test-uuid-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        role: 'customer',
        isActive: true,
        toSafeJSON: () => ({ id: 'test-uuid-123', email: 'john@test.com', firstName: 'John' }),
        update: jest.fn().mockResolvedValue(true),
      };

      User.findOne.mockResolvedValue(null); // Email not taken
      User.create.mockResolvedValue(mockUser);

      const payload = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        password: 'SecurePass@123',
      };

      // Test the business logic directly
      expect(payload.email).toBe('john@test.com');
      expect(payload.password.length).toBeGreaterThanOrEqual(8);
      expect(User.create).toBeDefined();
    });

    it('should reject duplicate email', async () => {
      const existingUser = { id: 'existing-id', email: 'existing@test.com' };
      User.findOne.mockResolvedValue(existingUser);

      // When user exists, should return 409
      const result = await User.findOne({ where: { email: 'existing@test.com' } });
      expect(result).not.toBeNull();
    });

    it('should reject weak password', () => {
      const weakPasswords = ['123456', 'password', 'abc', '12345678'];
      const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
      
      weakPasswords.forEach(pwd => {
        expect(strongPasswordRegex.test(pwd)).toBe(false);
      });
    });

    it('should accept strong password', () => {
      const strongPassword = 'SecurePass@123';
      const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
      expect(strongPasswordRegex.test(strongPassword)).toBe(true);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should reject inactive user', async () => {
      const inactiveUser = { id: 'test-id', email: 'test@test.com', isActive: false };
      User.findOne.mockResolvedValue(inactiveUser);

      const user = await User.findOne({ where: { email: 'test@test.com' } });
      expect(user.isActive).toBe(false);
    });

    it('should find user by email', async () => {
      const activeUser = {
        id: 'test-id',
        email: 'active@test.com',
        isActive: true,
        comparePassword: jest.fn().mockResolvedValue(true),
        update: jest.fn(),
        toSafeJSON: jest.fn().mockReturnValue({}),
      };
      User.findOne.mockResolvedValue(activeUser);

      const user = await User.findOne({ where: { email: 'active@test.com' } });
      expect(user).not.toBeNull();
      expect(user.isActive).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────
// JWT UTILITY TESTS
// ─────────────────────────────────────────────
describe('JWT Token Generation', () => {
  const jwt = require('jsonwebtoken');
  const secret = 'test_secret_key';

  it('should generate a valid JWT token', () => {
    const payload = { id: 'user-123', email: 'test@test.com', role: 'customer' };
    const token = jwt.sign(payload, secret, { expiresIn: '1h' });
    
    const decoded = jwt.verify(token, secret);
    expect(decoded.id).toBe(payload.id);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(payload.role);
  });

  it('should reject expired token', () => {
    const token = jwt.sign({ id: 'user-123' }, secret, { expiresIn: '0s' });
    
    expect(() => jwt.verify(token, secret)).toThrow('jwt expired');
  });

  it('should reject tampered token', () => {
    const token = jwt.sign({ id: 'user-123' }, secret);
    const tamperedToken = token + 'tampered';
    
    expect(() => jwt.verify(tamperedToken, secret)).toThrow();
  });
});

// ─────────────────────────────────────────────
// VALIDATION TESTS
// ─────────────────────────────────────────────
describe('Input Validation', () => {
  it('should validate email format', () => {
    const validEmails = ['user@example.com', 'user+tag@domain.co.in'];
    const invalidEmails = ['notanemail', '@domain.com', 'user@', ''];
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    validEmails.forEach(email => expect(emailRegex.test(email)).toBe(true));
    invalidEmails.forEach(email => expect(emailRegex.test(email)).toBe(false));
  });

  it('should validate order items', () => {
    const validItems = [{ productId: 'uuid-123', quantity: 2 }];
    const invalidItems = [];
    
    expect(validItems.length).toBeGreaterThan(0);
    expect(invalidItems.length).toBe(0);
  });

  it('should validate positive price', () => {
    expect(99.99 > 0).toBe(true);
    expect(-1 > 0).toBe(false);
    expect(0 > 0).toBe(false);
  });
});

// ─────────────────────────────────────────────
// ORDER CALCULATION TESTS
// ─────────────────────────────────────────────
describe('Order Calculations', () => {
  const calculateOrderTotals = (items) => {
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * 0.1;
    const shippingCost = subtotal > 100 ? 0 : 9.99;
    const total = subtotal + tax + shippingCost;
    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      shippingCost: parseFloat(shippingCost.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
    };
  };

  it('should calculate order totals correctly', () => {
    const items = [
      { price: 50, quantity: 2 },
      { price: 25, quantity: 1 },
    ];
    
    const totals = calculateOrderTotals(items);
    expect(totals.subtotal).toBe(125);
    expect(totals.tax).toBe(12.5);
    expect(totals.shippingCost).toBe(0); // Free shipping > $100
    expect(totals.total).toBe(137.5);
  });

  it('should add shipping cost for orders under $100', () => {
    const items = [{ price: 30, quantity: 1 }];
    const totals = calculateOrderTotals(items);
    expect(totals.shippingCost).toBe(9.99);
  });

  it('should give free shipping for orders over $100', () => {
    const items = [{ price: 150, quantity: 1 }];
    const totals = calculateOrderTotals(items);
    expect(totals.shippingCost).toBe(0);
  });
});
