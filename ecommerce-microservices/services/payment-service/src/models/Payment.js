const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  orderId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'USD',
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'),
    defaultValue: 'pending',
  },
  method: {
    type: DataTypes.ENUM('card', 'bank_transfer', 'wallet', 'cod'),
    allowNull: true,
  },
  provider: {
    type: DataTypes.STRING(50),
    defaultValue: 'stripe',
  },
  providerPaymentId: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  providerClientSecret: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  providerMetadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
  failureReason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  refundId: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  refundedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'payments',
  timestamps: true,
});

module.exports = { Payment };
