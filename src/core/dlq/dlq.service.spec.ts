import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { JsonHelper } from '../../database/json.helper';
import { DlqService } from './dlq.service';

describe('DlqService', () => {
  let service: DlqService;
  let prisma: {
    dlqItem: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      dlqItem: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    service = new DlqService(
      prisma as unknown as PrismaService,
      { toJson: jest.fn((v: unknown) => v) } as unknown as JsonHelper,
      {
        get: jest.fn((key: string) =>
          key === 'DLQ_RETRY_LEASE_SECONDS' ? 300 : undefined,
        ),
      } as unknown as ConfigService,
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
    prisma.dlqItem.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.retry('dlq-1')).resolves.toBe(true);

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
});
