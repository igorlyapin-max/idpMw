import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { JsonHelper } from '../database/json.helper';
import { DlqService } from '../core/dlq/dlq.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jsonHelper: JsonHelper,
    private readonly dlq: DlqService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly metrics: MetricsService,
  ) {}

  async findDlqItems(params: {
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    return this.prisma.dlqItem.findMany({
      where: params.status ? { status: params.status } : undefined,
      take: params.limit ?? 50,
      skip: params.offset ?? 0,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateDlqMetrics(): Promise<void> {
    const counts = await this.prisma.dlqItem.groupBy({
      by: ['status'],
      _count: { status: true },
    });
    for (const row of counts) {
      this.metrics.setDlqSize(row.status, row._count.status);
    }
  }

  async retry(id: string): Promise<void> {
    await this.dlq.retry(id);
    const item = await this.prisma.dlqItem.findUnique({ where: { id } });
    if (item) {
      await this.kafkaProducer.send('idm.dlq.retry', {
        eventId: item.eventId,
        operation: item.operation,
        targetSystem: item.targetSystem,
        payload: this.jsonHelper.fromJson(item.payload),
      });
    }
    await this.updateDlqMetrics();
  }

  async skip(id: string): Promise<void> {
    await this.dlq.skip(id);
    await this.updateDlqMetrics();
  }
}
