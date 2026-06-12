import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { JsonHelper } from '../../database/json.helper';
import { MetricsService } from '../../metrics/metrics.service';
import { RetryPolicyService } from '../retry/retry-policy.service';

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
    private readonly metrics: MetricsService,
    private readonly retryPolicy: RetryPolicyService,
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
    await this.updateMetrics();
  }

  async retry(id: string): Promise<boolean> {
    const item = await this.prisma.dlqItem.findUnique({
      where: { id },
      select: { targetSystem: true },
    });
    const targetPolicy = item
      ? await this.retryPolicy.forTarget(item.targetSystem)
      : undefined;
    const effectiveLeaseSeconds =
      targetPolicy?.dlqLeaseSeconds ??
      this.config.get<number>('DLQ_RETRY_LEASE_SECONDS') ??
      300;
    const now = new Date();
    const expiredBefore = new Date(Date.now() - effectiveLeaseSeconds * 1000);
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
    if (result.count === 1) {
      await this.updateMetrics();
    }
    return result.count === 1;
  }

  async skip(id: string): Promise<void> {
    await this.prisma.dlqItem.update({
      where: { id },
      data: { status: 'skipped', lockedAt: null, lockedBy: null },
    });
    await this.updateMetrics();
  }

  async resolve(id: string): Promise<void> {
    await this.prisma.dlqItem.update({
      where: { id },
      data: { status: 'resolved', lockedAt: null, lockedBy: null },
    });
    await this.updateMetrics();
  }

  async markRetryFailed(id: string, error: string): Promise<void> {
    await this.prisma.dlqItem.update({
      where: { id },
      data: {
        status: 'pending',
        error,
        lockedAt: null,
        lockedBy: null,
      },
    });
    await this.updateMetrics();
  }

  async updateMetrics(): Promise<void> {
    const counts = await this.prisma.dlqItem.groupBy({
      by: ['status'],
      _count: { status: true },
    });
    for (const status of ['pending', 'retrying', 'skipped', 'resolved']) {
      const count =
        counts.find((row) => row.status === status)?._count.status ?? 0;
      this.metrics.setDlqSize(status, count);
    }
  }
}
