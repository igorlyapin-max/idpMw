import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../database/prisma.service';
import { JsonHelper } from '../database/json.helper';
import { DlqService } from '../core/dlq/dlq.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { MetricsService } from '../metrics/metrics.service';
import { ConfigService } from '@nestjs/config';

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
  let dlq: { retry: jest.Mock; skip: jest.Mock };
  let kafkaProducer: { send: jest.Mock };
  let metrics: { setDlqSize: jest.Mock };
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
    dlq = { retry: jest.fn().mockResolvedValue(true), skip: jest.fn() };
    kafkaProducer = { send: jest.fn() };
    metrics = { setDlqSize: jest.fn() };
    config = {
      get: jest.fn((key: string) =>
        key === 'KAFKA_TOPIC_DLQ_RETRY' ? 'idm.test.dlq.retry' : undefined,
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: JsonHelper, useValue: jsonHelper },
        { provide: DlqService, useValue: dlq },
        { provide: KafkaProducerService, useValue: kafkaProducer },
        { provide: MetricsService, useValue: metrics },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('findDlqItems should delegate to prisma', async () => {
    prisma.dlqItem.findMany.mockResolvedValue([{ id: '1' }]);
    const result = await service.findDlqItems({ status: 'pending' });
    expect(prisma.dlqItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'pending' } }),
    );
    expect(result).toEqual([{ id: '1' }]);
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
    prisma.dlqItem.groupBy.mockResolvedValue([
      { status: 'pending', _count: { status: 5 } },
    ]);
    await service.updateDlqMetrics();
    expect(metrics.setDlqSize).toHaveBeenCalledWith('pending', 5);
  });
});
