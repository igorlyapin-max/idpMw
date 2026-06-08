import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../database/prisma.service';
import { JsonHelper } from '../database/json.helper';
import { DlqService } from '../core/dlq/dlq.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { MetricsService } from '../metrics/metrics.service';
import { ConfigService } from '@nestjs/config';
import { ProcessingService } from '../core/processing.service';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: {
    dlqItem: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      groupBy: jest.Mock;
    };
  };
  let jsonHelper: { fromJson: jest.Mock };
  let dlq: {
    retry: jest.Mock;
    skip: jest.Mock;
    resolve: jest.Mock;
    updateMetrics: jest.Mock;
  };
  let kafkaProducer: { send: jest.Mock };
  let metrics: { processedLast5Minutes: jest.Mock };
  let processing: { process: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      dlqItem: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    jsonHelper = { fromJson: jest.fn((v: unknown) => v) };
    dlq = {
      retry: jest.fn().mockResolvedValue(true),
      skip: jest.fn(),
      resolve: jest.fn(),
      updateMetrics: jest.fn(),
    };
    kafkaProducer = { send: jest.fn() };
    metrics = {
      processedLast5Minutes: jest.fn().mockReturnValue({
        total: 0,
        byStatus: {},
        byTargetSystem: {},
      }),
    };
    processing = { process: jest.fn().mockResolvedValue(undefined) };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'KAFKA_ENABLED') return true;
        if (key === 'KAFKA_TOPIC_DLQ_RETRY') return 'idm.test.dlq.retry';
        if (key === 'IDMMW_PROCESSING_MODE') return 'sync';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: JsonHelper, useValue: jsonHelper },
        { provide: DlqService, useValue: dlq },
        { provide: KafkaProducerService, useValue: kafkaProducer },
        { provide: MetricsService, useValue: metrics },
        { provide: ProcessingService, useValue: processing },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('findDlqItems should delegate to prisma', async () => {
    prisma.dlqItem.findMany.mockResolvedValue([{ id: '1', payload: '{}' }]);
    const result = await service.findDlqItems({ status: 'pending' });
    expect(prisma.dlqItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'pending' },
      }),
    );
    expect(result).toEqual([{ id: '1', payload: '{}' }]);
  });

  it('retry should call dlq.retry and send kafka message', async () => {
    prisma.dlqItem.findUnique.mockResolvedValue({
      id: '1',
      eventId: 'e1',
      operation: 'create',
      targetSystem: 'zabbix',
      payload: '{}',
    });
    await service.retry('1');
    expect(dlq.retry).toHaveBeenCalledWith('1');
    expect(kafkaProducer.send).toHaveBeenCalledWith(
      'idm.test.dlq.retry',
      expect.objectContaining({ dlqItemId: '1', eventId: 'e1' }),
    );
  });

  it('retry should process synchronously when kafka is disabled', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'KAFKA_ENABLED') return false;
      if (key === 'IDMMW_PROCESSING_MODE') return 'sync';
      return undefined;
    });
    prisma.dlqItem.findUnique.mockResolvedValue({
      id: '1',
      eventId: 'e1',
      operation: 'create',
      targetSystem: 'zabbix',
      payload: { username: 'jdoe' },
    });

    await service.retry('1');

    expect(processing.process).toHaveBeenCalledWith({
      eventId: 'e1',
      operation: 'create',
      targetSystem: 'zabbix',
      payload: { username: 'jdoe' },
    });
    expect(dlq.resolve).toHaveBeenCalledWith('1');
    expect(kafkaProducer.send).not.toHaveBeenCalled();
  });

  it('retry should reject already claimed DLQ item', async () => {
    dlq.retry.mockResolvedValue(false);

    await expect(service.retry('1')).rejects.toThrow(
      'DLQ item 1 is already retrying',
    );

    expect(kafkaProducer.send).not.toHaveBeenCalled();
  });

  it('skip should call dlq.skip', async () => {
    await service.skip('1');
    expect(dlq.skip).toHaveBeenCalledWith('1');
  });

  it('updateDlqMetrics should set metrics', async () => {
    await service.updateDlqMetrics();
    expect(dlq.updateMetrics).toHaveBeenCalled();
  });
});
