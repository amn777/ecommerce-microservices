const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  orderNumber: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM(
      'pending',       // Order created, awaiting payment
      'confirmed',     // Payment confirmed
      'processing',    // Being prepared
      'shipped',       // Dispatched
      'delivered',     // Delivered to customer
      'cancelled',     // Cancelled
      'refunded'       // Refunded
    ),
    defaultValue: 'pending',
  },
  items: {
    type: DataTypes.JSONB,
    allowNull: false,
    validate: {
      notEmpty(value) {
        if (!Array.isArray(value) || value.length === 0) {
          throw new Error('Order must have at least one item');
        }
      },
    },
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  tax: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  shippingCost: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  discount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'USD',
  },
  shippingAddress: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
  billingAddress: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  paymentMethod: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  paymentId: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  paymentStatus: {
    type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'),
    defaultValue: 'pending',
  },
  shippingMethod: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  trackingNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  cancelReason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  estimatedDelivery: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  deliveredAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'orders',
  timestamps: true,
  hooks: {
    beforeCreate: (order) => {
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substr(2, 4).toUpperCase();
      order.orderNumber = `ORD-${timestamp}-${random}`;
    },
  },
});

module.exports = { Order };
