import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { JsonHelper } from '../database/json.helper';
import { DlqService } from '../core/dlq/dlq.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { MetricsService } from '../metrics/metrics.service';
import { ProcessingService } from '../core/processing.service';

interface RetryManyParams {
  targetSystem?: string;
  status?: string;
  limit?: number;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jsonHelper: JsonHelper,
    private readonly dlq: DlqService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly metrics: MetricsService,
    private readonly processing: ProcessingService,
    private readonly config: ConfigService,
  ) {}

  async findDlqItems(params: {
    status?: string;
    targetSystem?: string;
    limit?: number;
    offset?: number;
  }) {
    const items = await this.prisma.dlqItem.findMany({
      where: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.targetSystem ? { targetSystem: params.targetSystem } : {}),
      },
      take: this.limit(params.limit, 50, 200),
      skip: this.offset(params.offset),
      orderBy: { createdAt: 'desc' },
    });
    return items.map((item) => ({
      ...item,
      payload: this.jsonHelper.fromJson(item.payload),
    }));
  }

  async updateDlqMetrics(): Promise<void> {
    await this.dlq.updateMetrics();
  }

  async stats(): Promise<{
    dlq: Record<string, number>;
    processedLast5Minutes: ReturnType<MetricsService['processedLast5Minutes']>;
    infrastructure: {
      kafkaEnabled: boolean;
      redisEnabled: boolean;
      processingMode: string;
    };
  }> {
    const counts = await this.prisma.dlqItem.groupBy({
      by: ['status'],
      _count: { status: true },
    });
    const dlq = Object.fromEntries(
      ['pending', 'retrying', 'skipped', 'resolved'].map((status) => [
        status,
        counts.find((row) => row.status === status)?._count.status ?? 0,
      ]),
    );
    return {
      dlq,
      processedLast5Minutes: this.metrics.processedLast5Minutes(),
      infrastructure: {
        kafkaEnabled: this.config.get<boolean>('KAFKA_ENABLED') ?? false,
        redisEnabled: this.config.get<boolean>('REDIS_ENABLED') ?? false,
        processingMode:
          this.config.get<string>('IDMMW_PROCESSING_MODE') ?? 'sync',
      },
    };
  }

  async retry(id: string): Promise<void> {
    const claimed = await this.dlq.retry(id);
    if (!claimed) {
      throw new Error(
        `DLQ item ${id} is already retrying, skipped, or resolved`,
      );
    }
    const item = await this.prisma.dlqItem.findUnique({ where: { id } });
    if (item) {
      await this.retryItem(item);
    }
    await this.updateDlqMetrics();
  }

  async retryMany(params: RetryManyParams): Promise<{
    requested: number;
    queued: number;
    skipped: number;
    errors: Array<{ id: string; error: string }>;
  }> {
    const items = await this.prisma.dlqItem.findMany({
      where: {
        status: params.status ?? 'pending',
        ...(params.targetSystem ? { targetSystem: params.targetSystem } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: this.limit(params.limit, 25, 100),
    });
    let queued = 0;
    let skipped = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const item of items) {
      try {
        const claimed = await this.dlq.retry(item.id);
        if (!claimed) {
          skipped += 1;
          continue;
        }
        await this.retryItem(item);
        queued += 1;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push({ id: item.id, error: msg });
      }
    }

    await this.updateDlqMetrics();
    return {
      requested: items.length,
      queued,
      skipped,
      errors,
    };
  }

  async skip(id: string): Promise<void> {
    await this.dlq.skip(id);
    await this.updateDlqMetrics();
  }

  private async retryItem(item: {
    id: string;
    eventId: string;
    operation: string;
    targetSystem: string;
    payload: unknown;
  }): Promise<void> {
    const payload =
      this.jsonHelper.fromJson<Record<string, unknown>>(item.payload) ?? {};
    if (this.config.get<boolean>('KAFKA_ENABLED') ?? false) {
      await this.kafkaProducer.send(
        this.config.get<string>('KAFKA_TOPIC_DLQ_RETRY') ?? 'idm.dlq.retry',
        {
          dlqItemId: item.id,
          eventId: item.eventId,
          operation: item.operation,
          targetSystem: item.targetSystem,
          payload,
        },
      );
      return;
    }

    await this.processing.processRetry(
      {
        eventId: item.eventId,
        operation: item.operation,
        targetSystem: item.targetSystem,
        payload,
      },
      item.id,
    );
  }

  private limit(
    value: number | undefined,
    defaultValue: number,
    maxValue: number,
  ): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return defaultValue;
    }
    return Math.min(parsed, maxValue);
  }

  private offset(value: number | undefined): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  }
}
