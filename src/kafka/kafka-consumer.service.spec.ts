import { ConfigService } from '@nestjs/config';
import { Kafka } from 'kafkajs';
import { ProcessingService } from '../core/processing.service';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';

jest.mock('kafkajs', () => ({
  Kafka: jest.fn(),
}));

const kafkaMock = Kafka as unknown as jest.Mock;
const consumerConnect = jest.fn();
const consumerSubscribe = jest.fn();
const consumerRun = jest.fn();
const consumerDisconnect = jest.fn();
type ConsumerRunArgs = {
  eachMessage: (payload: {
    topic: string;
    partition: number;
    message: { value: Buffer };
  }) => Promise<void>;
};

function createService(values: Record<string, unknown>) {
  const processing = { process: jest.fn(), processRetry: jest.fn() };
  const producer = { send: jest.fn() };
  const config = {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
  const service = new KafkaConsumerService(
    config,
    processing as unknown as ProcessingService,
    producer as unknown as KafkaProducerService,
  );
  return { service, processing, producer };
}

describe('KafkaConsumerService', () => {
  beforeEach(() => {
    kafkaMock.mockReset();
    consumerConnect.mockReset();
    consumerSubscribe.mockReset();
    consumerRun.mockReset();
    consumerDisconnect.mockReset();
    consumerConnect.mockResolvedValue(undefined);
    consumerSubscribe.mockResolvedValue(undefined);
    consumerRun.mockResolvedValue(undefined);
    consumerDisconnect.mockResolvedValue(undefined);
    kafkaMock.mockImplementation(() => ({
      consumer: () => ({
        connect: consumerConnect,
        subscribe: consumerSubscribe,
        run: consumerRun,
        disconnect: consumerDisconnect,
      }),
    }));
  });

  it('does not start when Kafka is disabled', async () => {
    const { service } = createService({ KAFKA_ENABLED: false });

    await service.onModuleInit();

    expect(kafkaMock).not.toHaveBeenCalled();
  });

  it('subscribes to retry and events-in topics in async mode', async () => {
    const { service } = createService({
      KAFKA_ENABLED: true,
      KAFKA_BROKERS: '127.0.0.1:9092',
      KAFKA_CLIENT_ID: 'idmmw-test',
      KAFKA_CONSUMER_GROUP_ID: 'idmmw-test-group',
      KAFKA_TOPIC_DLQ_RETRY: 'idmmw.test.dlq.retry',
      KAFKA_TOPIC_EVENTS_IN: 'idmmw.test.events.in',
      IDMMW_PROCESSING_MODE: 'async',
    });

    await service.onModuleInit();

    expect(consumerSubscribe).toHaveBeenCalledWith({
      topic: 'idmmw.test.dlq.retry',
      fromBeginning: false,
    });
    expect(consumerSubscribe).toHaveBeenCalledWith({
      topic: 'idmmw.test.events.in',
      fromBeginning: false,
    });
  });

  it('processes Kafka messages and emits success status', async () => {
    const { service, processing, producer } = createService({
      KAFKA_ENABLED: true,
      KAFKA_BROKERS: '127.0.0.1:9092',
      KAFKA_TOPIC_DLQ_RETRY: 'idmmw.test.dlq.retry',
      KAFKA_TOPIC_EVENTS_OUT: 'idmmw.test.events.out',
      IDMMW_PROCESSING_MODE: 'sync',
    });
    processing.processRetry.mockResolvedValue(undefined);

    await service.onModuleInit();
    const runCalls = consumerRun.mock.calls as Array<[ConsumerRunArgs]>;
    const runArgs = runCalls[0][0];
    await runArgs.eachMessage({
      topic: 'idmmw.test.dlq.retry',
      partition: 0,
      message: {
        value: Buffer.from(
          JSON.stringify({
            dlqItemId: 'dlq-1',
            eventId: 'e1',
            operation: 'user.create',
            targetSystem: 'fake',
            payload: {},
          }),
        ),
      },
    });

    expect(processing.processRetry).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'e1' }),
      'dlq-1',
    );
    expect(producer.send).toHaveBeenCalledWith(
      'idmmw.test.events.out',
      expect.objectContaining({ eventId: 'e1', status: 'success' }),
    );
  });
});
