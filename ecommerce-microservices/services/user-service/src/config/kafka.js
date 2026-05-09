const { Kafka, Partitioners } = require('kafkajs');
const { logger } = require('./logger');

const kafka = new Kafka({
  clientId: 'user-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  retry: {
    initialRetryTime: 300,
    retries: 8,
  },
});

const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
});

const consumer = kafka.consumer({ groupId: 'user-service-group' });

const connectKafka = async () => {
  await producer.connect();
  await consumer.connect();
  
  // Subscribe to relevant topics
  await consumer.subscribe({ topics: ['order-events', 'payment-events'], fromBeginning: false });
  
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        logger.info(`Received event: ${event.type}`, { topic, partition });
        
        switch (event.type) {
          case 'ORDER_COMPLETED':
            logger.info(`Order completed for user: ${event.userId}`);
            break;
          case 'PAYMENT_FAILED':
            logger.warn(`Payment failed for user: ${event.userId}`);
            break;
        }
      } catch (error) {
        logger.error('Error processing Kafka message', { error: error.message });
      }
    },
  });
  
  logger.info('✅ Kafka producer and consumer connected');
};

const publishEvent = async (topic, event) => {
  try {
    await producer.send({
      topic,
      messages: [{
        key: event.userId || event.id || 'default',
        value: JSON.stringify(event),
        headers: {
          'correlation-id': event.correlationId || Date.now().toString(),
          'source-service': 'user-service',
        },
      }],
    });
    logger.info(`Published event: ${event.type}`, { topic });
  } catch (error) {
    logger.error('Failed to publish Kafka event', { error: error.message, topic, event });
  }
};

const disconnectKafka = async () => {
  await producer.disconnect();
  await consumer.disconnect();
};

module.exports = { connectKafka, publishEvent, disconnectKafka };
