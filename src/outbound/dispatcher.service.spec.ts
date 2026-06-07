import { Test, TestingModule } from '@nestjs/testing';
import { DispatcherService } from './dispatcher.service';
import { ProcessingService } from '../core/processing.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { ConfigService } from '@nestjs/config';

describe('DispatcherService', () => {
  let service: DispatcherService;
  let processing: { process: jest.Mock };
  let kafkaProducer: { send: jest.Mock };
  let configGet: jest.Mock;

  beforeEach(async () => {
    processing = { process: jest.fn() };
    kafkaProducer = { send: jest.fn() };
    configGet = jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        KAFKA_ENABLED: false,
        IDMMW_PROCESSING_MODE: 'sync',
        KAFKA_TOPIC_EVENTS_IN: 'idm.test.events.in',
        KAFKA_TOPIC_EVENTS_OUT: 'idm.test.events.out',
      };
      return values[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatcherService,
        { provide: ProcessingService, useValue: processing },
        { provide: KafkaProducerService, useValue: kafkaProducer },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    service = module.get<DispatcherService>(DispatcherService);
  });

  it('should dispatch success and send kafka message', async () => {
    configGet.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        KAFKA_ENABLED: true,
        IDMMW_PROCESSING_MODE: 'sync',
        KAFKA_TOPIC_EVENTS_OUT: 'idm.test.events.out',
      };
      return values[key];
    });
    processing.process.mockResolvedValue(undefined);

    await service.dispatch({
      eventId: 'e1',
      operation: 'user.create',
      targetSystem: 'zabbix',
      payload: {},
    });

    expect(processing.process).toHaveBeenCalled();
    expect(kafkaProducer.send).toHaveBeenCalledWith(
      'idm.test.events.out',
      expect.objectContaining({ status: 'success' }),
    );
  });

  it('should send failed kafka message on error', async () => {
    configGet.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        KAFKA_ENABLED: true,
        IDMMW_PROCESSING_MODE: 'sync',
        KAFKA_TOPIC_EVENTS_OUT: 'idm.test.events.out',
      };
      return values[key];
    });
    processing.process.mockRejectedValue(new Error('fail'));

    await expect(
      service.dispatch({
        eventId: 'e1',
        operation: 'user.create',
        targetSystem: 'zabbix',
        payload: {},
      }),
    ).rejects.toThrow('fail');

    expect(kafkaProducer.send).toHaveBeenCalledWith(
      'idm.test.events.out',
      expect.objectContaining({ status: 'failed', error: 'fail' }),
    );
  });

  it('should skip kafka when disabled', async () => {
    processing.process.mockResolvedValue(undefined);

    await service.dispatch({
      eventId: 'e1',
      operation: 'user.create',
      targetSystem: 'zabbix',
      payload: {},
    });

    expect(kafkaProducer.send).not.toHaveBeenCalled();
  });

  it('should enqueue write events in async mode', async () => {
    configGet.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        KAFKA_ENABLED: true,
        IDMMW_PROCESSING_MODE: 'async',
        KAFKA_TOPIC_EVENTS_IN: 'idm.test.events.in',
      };
      return values[key];
    });

    await service.dispatch({
      eventId: 'e1',
      operation: 'user.create',
      targetSystem: 'zabbix',
      payload: { data: { username: 'jdoe' } },
    });

    expect(processing.process).not.toHaveBeenCalled();
    expect(kafkaProducer.send).toHaveBeenCalledWith(
      'idm.test.events.in',
      expect.objectContaining({ eventId: 'e1', targetSystem: 'zabbix' }),
    );
  });

  it('should fail async mode when Kafka is disabled', async () => {
    configGet.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        KAFKA_ENABLED: false,
        IDMMW_PROCESSING_MODE: 'async',
      };
      return values[key];
    });

    await expect(
      service.dispatch({
        eventId: 'e1',
        operation: 'user.create',
        targetSystem: 'zabbix',
        payload: {},
      }),
    ).rejects.toThrow('Async processing mode requires KAFKA_ENABLED=true');
  });
});
