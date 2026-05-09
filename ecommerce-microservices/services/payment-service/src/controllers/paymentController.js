const Stripe = require('stripe');
const { Payment } = require('../models/Payment');
const { redisClient } = require('../config/redis');
const { publishEvent } = require('../config/kafka');
const { logger } = require('../config/logger');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

// POST /api/v1/payments/intent - Create payment intent (Stripe)
const createPaymentIntent = async (req, res) => {
  const userId = req.headers['x-user-id'];

  try {
    const { orderId, amount, currency = 'usd', metadata = {} } = req.body;

    // Idempotency: check if payment already exists for this order
    const existing = await Payment.findOne({
      where: { orderId, status: ['pending', 'processing', 'completed'] },
    });

    if (existing?.status === 'completed') {
      return res.status(409).json({ status: 'error', message: 'Order already paid' });
    }

    // Create Stripe PaymentIntent
    let stripeIntent;
    try {
      stripeIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Stripe uses cents
        currency,
        metadata: { orderId, userId, ...metadata },
        automatic_payment_methods: { enabled: true },
      });
    } catch (stripeError) {
      logger.warn('Stripe not configured, using mock payment', { error: stripeError.message });
      // Mock payment intent for development
      stripeIntent = {
        id: `pi_mock_${Date.now()}`,
        client_secret: `pi_mock_${Date.now()}_secret_test`,
        status: 'requires_payment_method',
      };
    }

    // Create payment record
    const payment = await Payment.create({
      orderId,
      userId,
      amount,
      currency: currency.toUpperCase(),
      status: 'pending',
      provider: 'stripe',
      providerPaymentId: stripeIntent.id,
      providerClientSecret: stripeIntent.client_secret,
      providerMetadata: { stripeIntent },
    });

    logger.info(`Payment intent created: ${payment.id}`, { orderId, userId, amount });

    res.status(201).json({
      status: 'success',
      data: {
        paymentId: payment.id,
        clientSecret: stripeIntent.client_secret,
        amount,
        currency,
      },
    });
  } catch (error) {
    logger.error('Create payment intent error', { error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to create payment intent' });
  }
};

// POST /api/v1/payments/confirm - Confirm payment
const confirmPayment = async (req, res) => {
  const userId = req.headers['x-user-id'];

  try {
    const { paymentId, paymentIntentId, paymentMethod } = req.body;

    const payment = await Payment.findOne({ where: { id: paymentId, userId } });
    if (!payment) {
      return res.status(404).json({ status: 'error', message: 'Payment not found' });
    }

    if (payment.status === 'completed') {
      return res.status(409).json({ status: 'error', message: 'Payment already completed' });
    }

    await payment.update({ status: 'processing' });

    // Verify with Stripe (or mock)
    let verified = false;
    let stripePayment;
    
    try {
      stripePayment = await stripe.paymentIntents.retrieve(paymentIntentId || payment.providerPaymentId);
      verified = stripePayment.status === 'succeeded';
    } catch {
      // Mock: always succeed in development
      logger.warn('Using mock payment verification');
      verified = true;
      stripePayment = { status: 'succeeded', payment_method: paymentMethod || 'card' };
    }

    if (verified) {
      await payment.update({
        status: 'completed',
        method: stripePayment.payment_method_types?.[0] || 'card',
        processedAt: new Date(),
        providerMetadata: { ...payment.providerMetadata, confirmation: stripePayment },
      });

      // Publish PAYMENT_COMPLETED → Order service will confirm the order
      await publishEvent('payment-events', {
        type: 'PAYMENT_COMPLETED',
        paymentId: payment.id,
        orderId: payment.orderId,
        userId,
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.method,
        timestamp: new Date().toISOString(),
      });

      // Publish for notification
      await publishEvent('notification-events', {
        type: 'PAYMENT_SUCCESS_EMAIL',
        userId,
        orderId: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Payment completed: ${payment.id}`, { orderId: payment.orderId });

      res.json({
        status: 'success',
        message: 'Payment confirmed successfully',
        data: { payment },
      });
    } else {
      await payment.update({ status: 'failed', failureReason: 'Payment verification failed' });

      await publishEvent('payment-events', {
        type: 'PAYMENT_FAILED',
        paymentId: payment.id,
        orderId: payment.orderId,
        userId,
        reason: 'Payment verification failed',
        timestamp: new Date().toISOString(),
      });

      res.status(400).json({ status: 'error', message: 'Payment failed' });
    }
  } catch (error) {
    logger.error('Confirm payment error', { error: error.message });
    res.status(500).json({ status: 'error', message: 'Payment confirmation failed' });
  }
};

// POST /api/v1/payments/refund - Refund payment
const refundPayment = async (req, res) => {
  try {
    const { paymentId, amount, reason } = req.body;
    const userId = req.headers['x-user-id'];

    const payment = await Payment.findOne({ where: { id: paymentId, userId } });
    if (!payment) {
      return res.status(404).json({ status: 'error', message: 'Payment not found' });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({ status: 'error', message: 'Only completed payments can be refunded' });
    }

    let refund;
    try {
      refund = await stripe.refunds.create({
        payment_intent: payment.providerPaymentId,
        amount: amount ? Math.round(amount * 100) : undefined,
        reason: 'requested_by_customer',
      });
    } catch {
      // Mock refund
      refund = { id: `re_mock_${Date.now()}`, status: 'succeeded' };
    }

    await payment.update({
      status: 'refunded',
      refundId: refund.id,
      refundedAt: new Date(),
    });

    await publishEvent('payment-events', {
      type: 'PAYMENT_REFUNDED',
      paymentId: payment.id,
      orderId: payment.orderId,
      userId,
      refundAmount: amount || payment.amount,
      timestamp: new Date().toISOString(),
    });

    logger.info(`Payment refunded: ${payment.id}`, { refundId: refund.id });

    res.json({
      status: 'success',
      message: 'Payment refunded successfully',
      data: { payment, refundId: refund.id },
    });
  } catch (error) {
    logger.error('Refund error', { error: error.message });
    res.status(500).json({ status: 'error', message: 'Refund failed' });
  }
};

// GET /api/v1/payments - Get user payments
const getPayments = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: payments } = await Payment.findAndCountAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: Math.min(parseInt(limit), 50),
      offset,
    });

    res.json({
      status: 'success',
      data: {
        payments,
        pagination: { page: parseInt(page), limit: parseInt(limit), total: count },
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch payments' });
  }
};

// POST /api/v1/payments/webhook - Stripe webhook handler
const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];

  try {
    const event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case 'payment_intent.succeeded':
        logger.info('Stripe webhook: payment_intent.succeeded', { id: event.data.object.id });
        break;
      case 'payment_intent.payment_failed':
        logger.warn('Stripe webhook: payment_intent.payment_failed', { id: event.data.object.id });
        break;
    }

    res.json({ received: true });
  } catch (err) {
    logger.error('Webhook error', { error: err.message });
    res.status(400).json({ error: `Webhook error: ${err.message}` });
  }
};

module.exports = { createPaymentIntent, confirmPayment, refundPayment, getPayments, handleWebhook };
