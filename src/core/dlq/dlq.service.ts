import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { JsonHelper } from '../../database/json.helper';

export interface DlqItemData {
  eventId: string;
  operation: string;
  targetSystem: string;
  payload: Record<string, unknown>;
  error: string;
  retryCount?: number;
}

@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jsonHelper: JsonHelper,
    private readonly config: ConfigService,
  ) {}

  async add(item: DlqItemData): Promise<void> {
    await this.prisma.dlqItem.create({
      data: {
        eventId: item.eventId,
        operation: item.operation,
        targetSystem: item.targetSystem,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        payload: this.jsonHelper.toJson(item.payload) as any,
        error: item.error,
        retryCount: item.retryCount ?? 0,
        status: 'pending',
      },
    });
    this.logger.log(`Event ${item.eventId} moved to DLQ`);
  }

  async retry(id: string): Promise<boolean> {
    const leaseSeconds =
      this.config.get<number>('DLQ_RETRY_LEASE_SECONDS') ?? 300;
    const now = new Date();
    const expiredBefore = new Date(Date.now() - leaseSeconds * 1000);
    const lockedBy = `${process.pid}`;

    const result = await this.prisma.dlqItem.updateMany({
      where: {
        id,
        status: { notIn: ['skipped', 'resolved'] },
        OR: [
          { status: { not: 'retrying' } },
          { lockedAt: null },
          { lockedAt: { lt: expiredBefore } },
        ],
      },
      data: {
        status: 'retrying',
        retryCount: { increment: 1 },
        lockedAt: now,
        lockedBy,
      },
    });
    return result.count === 1;
  }

  async skip(id: string): Promise<void> {
    await this.prisma.dlqItem.update({
      where: { id },
      data: { status: 'skipped', lockedAt: null, lockedBy: null },
    });
  }

  async resolve(id: string): Promise<void> {
    await this.prisma.dlqItem.update({
      where: { id },
      data: { status: 'resolved', lockedAt: null, lockedBy: null },
    });
  }
}
