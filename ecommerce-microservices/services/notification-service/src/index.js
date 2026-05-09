require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { Kafka, Partitioners } = require('kafkajs');
const { redisClient } = require('./config/redis');
const { logger } = require('./config/logger');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// EMAIL TRANSPORT
// ─────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    await transporter.sendMail({
      from: `"E-Commerce Platform" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text,
    });
    logger.info(`Email sent to ${to}: ${subject}`);
    return true;
  } catch (error) {
    logger.error(`Email send failed to ${to}`, { error: error.message });
    // Don't throw - notifications shouldn't break the flow
    return false;
  }
};

// ─────────────────────────────────────────────
// EMAIL TEMPLATES
// ─────────────────────────────────────────────
const templates = {
  ORDER_CREATED: (data) => ({
    subject: `Order Confirmed - ${data.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333;">Order Confirmed! 🎉</h1>
        <p>Hi there! Your order <strong>${data.orderNumber}</strong> has been placed successfully.</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3>Order Summary</h3>
          <p><strong>Total:</strong> $${data.total}</p>
          <p><strong>Status:</strong> ${data.status}</p>
        </div>
        <p>We'll notify you when your order ships!</p>
        <p style="color: #666; font-size: 12px;">This is an automated email from E-Commerce Platform.</p>
      </div>
    `,
  }),

  ORDER_SHIPPED: (data) => ({
    subject: `Your Order ${data.orderNumber} Has Shipped! 📦`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333;">Your Order is On Its Way! 🚚</h1>
        <p>Great news! Order <strong>${data.orderNumber}</strong> has been shipped.</p>
        ${data.trackingNumber ? `<p><strong>Tracking Number:</strong> ${data.trackingNumber}</p>` : ''}
        <p>Estimated delivery: ${data.estimatedDelivery || '3-5 business days'}</p>
      </div>
    `,
  }),

  PAYMENT_SUCCESS: (data) => ({
    subject: 'Payment Successful ✅',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #28a745;">Payment Successful!</h1>
        <p>Your payment of <strong>$${data.amount} ${data.currency}</strong> was processed successfully.</p>
        <p><strong>Order ID:</strong> ${data.orderId}</p>
      </div>
    `,
  }),

  USER_REGISTERED: (data) => ({
    subject: 'Welcome to E-Commerce Platform! 🎊',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333;">Welcome, ${data.firstName}! 👋</h1>
        <p>Your account has been created successfully with email: <strong>${data.email}</strong></p>
        <p>Start shopping and enjoy exclusive deals!</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" 
           style="background: #007bff; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; display: inline-block; margin-top: 15px;">
          Start Shopping
        </a>
      </div>
    `,
  }),

  LOW_STOCK_ALERT: (data) => ({
    subject: `⚠️ Low Stock Alert: ${data.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #dc3545;">Low Stock Alert!</h1>
        <p>Product <strong>${data.name}</strong> is running low.</p>
        <p><strong>Current Stock:</strong> ${data.currentStock} units</p>
        <p><strong>Threshold:</strong> ${data.threshold} units</p>
        <p>Please restock to avoid stockouts.</p>
      </div>
    `,
  }),
};

// ─────────────────────────────────────────────
// NOTIFICATION PROCESSOR
// ─────────────────────────────────────────────
const processNotification = async (event) => {
  const { type, userId } = event;

  // Deduplication: avoid sending same notification twice
  const dedupKey = `notification:dedup:${type}:${event.orderId || event.userId}`;
  const isDuplicate = await redisClient.get(dedupKey);
  if (isDuplicate) {
    logger.warn(`Duplicate notification skipped: ${type}`);
    return;
  }

  // Set deduplication flag (5 min TTL)
  await redisClient.setex(dedupKey, 300, '1');

  // Store notification in Redis for history
  const notificationRecord = {
    id: `notif_${Date.now()}`,
    type,
    userId,
    data: event,
    createdAt: new Date().toISOString(),
    status: 'processing',
  };
  
  await redisClient.lpush(`notifications:${userId}`, JSON.stringify(notificationRecord));
  await redisClient.ltrim(`notifications:${userId}`, 0, 99); // Keep last 100

  // Get user email from Redis session (set by user service)
  const userSession = await redisClient.get(`session:${userId}`);
  const userEmail = userSession ? JSON.parse(userSession).email : null;

  if (!userEmail) {
    logger.warn(`No email found for user ${userId}, skipping email notification`);
    return;
  }

  let emailData;

  switch (type) {
    case 'USER_REGISTERED':
      emailData = templates.USER_REGISTERED(event);
      break;
    case 'ORDER_CREATED':
    case 'ORDER_CONFIRMED':
      emailData = templates.ORDER_CREATED(event);
      break;
    case 'ORDER_SHIPPED':
      emailData = templates.ORDER_SHIPPED(event);
      break;
    case 'PAYMENT_SUCCESS_EMAIL':
    case 'PAYMENT_COMPLETED':
      emailData = templates.PAYMENT_SUCCESS(event);
      break;
    case 'PRODUCT_LOW_STOCK':
      emailData = templates.LOW_STOCK_ALERT(event);
      break;
    default:
      logger.info(`No email template for event type: ${type}`);
      return;
  }

  await sendEmail({ to: userEmail, ...emailData });
  
  notificationRecord.status = 'sent';
  logger.info(`Notification processed: ${type} for user ${userId}`);
};

// ─────────────────────────────────────────────
// KAFKA SETUP
// ─────────────────────────────────────────────
const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  retry: { initialRetryTime: 300, retries: 8 },
});

const consumer = kafka.consumer({ groupId: 'notification-service-group' });

const setupKafkaConsumer = async () => {
  await consumer.connect();
  await consumer.subscribe({
    topics: ['user-events', 'order-events', 'payment-events', 'product-events', 'notification-events'],
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        logger.info(`Processing notification: ${event.type}`, { topic });
        await processNotification(event);
      } catch (error) {
        logger.error('Notification processing error', { error: error.message });
      }
    },
  });

  logger.info('✅ Notification Kafka consumer connected and listening');
};

// ─────────────────────────────────────────────
// REST API (get notifications history)
// ─────────────────────────────────────────────
app.get('/health', async (req, res) => {
  let redisStatus = 'unhealthy';
  try { await redisClient.ping(); redisStatus = 'healthy'; } catch {}
  res.json({ status: 'OK', service: 'notification-service', redis: redisStatus, timestamp: new Date().toISOString() });
});

app.get('/api/v1/notifications', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const notifications = await redisClient.lrange(`notifications:${userId}`, 0, 49);
    res.json({
      status: 'success',
      data: { notifications: notifications.map(n => JSON.parse(n)) },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch notifications' });
  }
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
const start = async () => {
  try {
    await redisClient.ping();
    logger.info('✅ Redis connected');
    await setupKafkaConsumer();
    app.listen(PORT, () => logger.info(`🚀 Notification Service running on port ${PORT}`));
  } catch (error) {
    logger.error('Startup failed', { error: error.message });
    process.exit(1);
  }
};

process.on('SIGTERM', async () => {
  await consumer.disconnect();
  await redisClient.quit();
  process.exit(0);
});

start();
module.exports = app;
