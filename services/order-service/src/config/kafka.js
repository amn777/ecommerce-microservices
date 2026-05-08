const { Kafka, Partitioners } = require('kafkajs');
const { logger } = require('./logger');

const kafka = new Kafka({
  clientId: 'order-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  retry: { initialRetryTime: 300, retries: 8 },
});

const producer = kafka.producer({ createPartitioner: Partitioners.LegacyPartitioner });
const consumer = kafka.consumer({ groupId: 'order-service-group' });

const connectKafka = async () => {
  await producer.connect();
  logger.info('Kafka producer connected for order-service');
};

const publishEvent = async (topic, event) => {
  try {
    await producer.send({
      topic,
      messages: [{ key: event.userId || event.id || 'default', value: JSON.stringify(event) }],
    });
  } catch (error) {
    logger.error('Kafka publish error', { error: error.message });
  }
};

const disconnectKafka = async () => { await producer.disconnect(); };

module.exports = { connectKafka, publishEvent, disconnectKafka, consumer, kafka };
