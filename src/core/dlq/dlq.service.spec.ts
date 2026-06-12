import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { JsonHelper } from '../../database/json.helper';
import { MetricsService } from '../../metrics/metrics.service';
import { RetryPolicyService } from '../retry/retry-policy.service';
import { DlqService } from './dlq.service';

describe('DlqService', () => {
  let service: DlqService;
  let prisma: {
    dlqItem: {
      create: jest.Mock;
      findUnique: jest.Mock;
      groupBy: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let metrics: { setDlqSize: jest.Mock };
  let retryPolicy: { forTarget: jest.Mock };

  beforeEach(() => {
    prisma = {
      dlqItem: {
        create: jest.fn(),
        findUnique: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    metrics = { setDlqSize: jest.fn() };
    retryPolicy = {
      forTarget: jest.fn().mockResolvedValue({
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitter: true,
        dlqLeaseSeconds: 120,
      }),
    };
    service = new DlqService(
      prisma as unknown as PrismaService,
      { toJson: jest.fn((v: unknown) => v) } as unknown as JsonHelper,
      {
        get: jest.fn((key: string) =>
          key === 'DLQ_RETRY_LEASE_SECONDS' ? 300 : undefined,
        ),
      } as unknown as ConfigService,
      metrics as unknown as MetricsService,
      retryPolicy as unknown as RetryPolicyService,
    );
  });

  it('adds items as pending', async () => {
    prisma.dlqItem.create.mockResolvedValue({ id: '1' });

    await service.add({
      eventId: 'e1',
      operation: 'user.create',
      targetSystem: 'fake',
      payload: { data: { username: 'jdoe' } },
      error: 'fail',
    });

    expect(prisma.dlqItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ status: 'pending' }),
      }),
    );
  });

  it('claims retry lease atomically', async () => {
    prisma.dlqItem.findUnique.mockResolvedValue({ targetSystem: 'zabbix' });
    prisma.dlqItem.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.retry('dlq-1')).resolves.toBe(true);

    expect(retryPolicy.forTarget).toHaveBeenCalledWith('zabbix');
    expect(prisma.dlqItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          id: 'dlq-1',
          status: { notIn: ['skipped', 'resolved'] },
        }),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          status: 'retrying',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          lockedBy: expect.any(String),
        }),
      }),
    );
  });

  it('returns false when retry lease is already claimed', async () => {
    prisma.dlqItem.findUnique.mockResolvedValue({ targetSystem: 'zabbix' });
    prisma.dlqItem.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.retry('dlq-1')).resolves.toBe(false);
  });

  it('clears lease when skipped or resolved', async () => {
    prisma.dlqItem.update.mockResolvedValue({ id: 'dlq-1' });

    await service.skip('dlq-1');
    await service.resolve('dlq-1');

    expect(prisma.dlqItem.update).toHaveBeenCalledWith({
      where: { id: 'dlq-1' },
      data: { status: 'skipped', lockedAt: null, lockedBy: null },
    });
    expect(prisma.dlqItem.update).toHaveBeenCalledWith({
      where: { id: 'dlq-1' },
      data: { status: 'resolved', lockedAt: null, lockedBy: null },
    });
  });

  it('returns failed retry to pending and clears lease', async () => {
    prisma.dlqItem.update.mockResolvedValue({ id: 'dlq-1' });

    await service.markRetryFailed('dlq-1', 'retry failed');

    expect(prisma.dlqItem.update).toHaveBeenCalledWith({
      where: { id: 'dlq-1' },
      data: {
        status: 'pending',
        error: 'retry failed',
        lockedAt: null,
        lockedBy: null,
      },
    });
  });
});
