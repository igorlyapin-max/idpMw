import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka } from 'kafkajs';
import { PrismaService } from '../database/prisma.service';
import { JsonHelper } from '../database/json.helper';
import { EncryptionService } from './encryption.service';
import { TlsOptionsFactory } from './tls-options.factory';

interface EncryptionStateRow {
  activeKeyId: string;
  previousKeyIds: string;
}

@Injectable()
export class EncryptionRotationService {
  private readonly logger = new Logger(EncryptionRotationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jsonHelper: JsonHelper,
    private readonly encryption: EncryptionService,
    private readonly config: ConfigService,
    private readonly tlsOptions: TlsOptionsFactory,
  ) {}

  async rotateToActiveKey(): Promise<void> {
    if (!this.encryption.isEnabled()) {
      throw new Error('ENCRYPTION_ENABLED=true is required for key rotation');
    }
    this.encryption.validateConfiguration();

    const state = await this.loadState();
    const nextKeyId = this.encryption.activeKeyId();
    if (state.activeKeyId === nextKeyId) {
      this.logger.log(`Encryption already uses active key '${nextKeyId}'`);
      return;
    }

    await this.assertNoActiveProcessing();
    await this.markRotation('running', state.activeKeyId, state.previousKeyIds);

    try {
      await this.rotateAuditLogs();
      await this.rotateDlqItems();
      await this.rotateTargetSystems();
      await this.completeRotation(state.activeKeyId, state.previousKeyIds);
      this.logger.log(
        `Encryption key rotation completed: ${state.activeKeyId} -> ${nextKeyId}`,
      );
    } catch (error: unknown) {
      await this.markRotation(
        'failed',
        state.activeKeyId,
        state.previousKeyIds,
      );
      throw error;
    }
  }

  private async assertNoActiveProcessing(): Promise<void> {
    const [dlqActive, idempotencyActive, kafkaLag] = await Promise.all([
      this.prisma.dlqItem.count({
        where: { status: { in: ['pending', 'retrying'] } },
      }),
      this.prisma.idempotencyKey.count({
        where: { expiresAt: { gt: new Date() } },
      }),
      this.kafkaLag(),
    ]);

    const blockers: string[] = [];
    if (dlqActive > 0) blockers.push(`DLQ pending/retrying=${dlqActive}`);
    if (idempotencyActive > 0) {
      blockers.push(`active idempotency keys=${idempotencyActive}`);
    }
    if (kafkaLag > 0) blockers.push(`Kafka lag=${kafkaLag}`);

    if (blockers.length > 0) {
      throw new Error(
        `Cannot rotate encryption key while processing is active: ${blockers.join(
          ', ',
        )}`,
      );
    }
  }

  private async kafkaLag(): Promise<number> {
    const kafkaEnabled = this.config.get<boolean>('KAFKA_ENABLED') ?? false;
    const skipLagCheck =
      this.config.get<string>('ENCRYPTION_ROTATION_SKIP_KAFKA_LAG_CHECK') ===
      'true';
    if (!kafkaEnabled || skipLagCheck) {
      return 0;
    }

    const brokers = (
      this.config.get<string>('KAFKA_BROKERS') ?? 'localhost:9092'
    ).split(',');
    const clientId = `${this.config.get<string>('KAFKA_CLIENT_ID') ?? 'idmmw'}-rotation`;
    const groupId =
      this.config.get<string>('KAFKA_CONSUMER_GROUP_ID') ??
      'idmmw-worker-group';
    const topics = [
      this.config.get<string>('KAFKA_TOPIC_EVENTS_IN') ?? 'idm.events.in',
      this.config.get<string>('KAFKA_TOPIC_DLQ_RETRY') ?? 'idm.dlq.retry',
    ].filter((topic, index, values) => values.indexOf(topic) === index);

    const kafka = new Kafka(this.tlsOptions.kafkaConfig(clientId, brokers));
    const admin = kafka.admin();
    await admin.connect();
    try {
      let lag = 0;
      for (const topic of topics) {
        const [topicOffsets, groupOffsets] = await Promise.all([
          admin.fetchTopicOffsets(topic),
          admin.fetchOffsets({ groupId, topics: [topic] }),
        ]);
        const groupPartitions =
          groupOffsets.find((item) => item.topic === topic)?.partitions ?? [];
        for (const partition of topicOffsets) {
          const group = groupPartitions.find(
            (item) => item.partition === partition.partition,
          );
          const end = Number(partition.offset);
          const committed = group ? Number(group.offset) : -1;
          lag += Math.max(0, end - Math.max(committed, 0));
        }
      }
      return lag;
    } finally {
      await admin.disconnect();
    }
  }

  private async rotateAuditLogs(): Promise<void> {
    const rows = await this.prisma.auditLog.findMany({
      select: { id: true, payload: true, response: true },
    });
    for (const row of rows) {
      await this.prisma.auditLog.update({
        where: { id: row.id },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          payload: this.jsonHelper.toJson(
            this.jsonHelper.fromJson(row.payload),
          ) as any,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          response:
            row.response === null
              ? null
              : (this.jsonHelper.toJson(
                  this.jsonHelper.fromJson(row.response),
                ) as any),
        },
      });
    }
  }

  private async rotateDlqItems(): Promise<void> {
    const rows = await this.prisma.dlqItem.findMany({
      select: { id: true, payload: true },
    });
    for (const row of rows) {
      await this.prisma.dlqItem.update({
        where: { id: row.id },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          payload: this.jsonHelper.toJson(
            this.jsonHelper.fromJson(row.payload),
          ) as any,
        },
      });
    }
  }

  private async rotateTargetSystems(): Promise<void> {
    const rows = await this.prisma.targetSystem.findMany({
      select: { id: true, config: true },
    });
    for (const row of rows) {
      await this.prisma.targetSystem.update({
        where: { id: row.id },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          config: this.jsonHelper.toJson(
            this.jsonHelper.fromJson(row.config),
          ) as any,
        },
      });
    }
  }

  private async loadState(): Promise<EncryptionStateRow> {
    const rows = await this.prisma.$queryRaw<EncryptionStateRow[]>`
      SELECT "activeKeyId", "previousKeyIds"
      FROM "EncryptionState"
      WHERE "id" = 'default'
      LIMIT 1
    `;
    if (!rows[0]) {
      throw new Error('EncryptionState is missing; enable encryption first');
    }
    return rows[0];
  }

  private async markRotation(
    status: string,
    previousActiveKeyId: string,
    previousKeyIdsRaw: string,
  ): Promise<void> {
    const previousKeyIds = this.previousKeyIds(
      previousActiveKeyId,
      previousKeyIdsRaw,
    );
    await this.prisma.$executeRaw`
      UPDATE "EncryptionState"
      SET "rotationStatus" = ${status},
          "previousKeyIds" = ${JSON.stringify(previousKeyIds)},
          "updatedAt" = ${new Date()}
      WHERE "id" = 'default'
    `;
  }

  private async completeRotation(
    previousActiveKeyId: string,
    previousKeyIdsRaw: string,
  ): Promise<void> {
    const previousKeyIds = this.previousKeyIds(
      previousActiveKeyId,
      previousKeyIdsRaw,
    );
    await this.prisma.$executeRaw`
      UPDATE "EncryptionState"
      SET "activeKeyId" = ${this.encryption.activeKeyId()},
          "previousKeyIds" = ${JSON.stringify(previousKeyIds)},
          "rotationStatus" = 'completed',
          "rotatedAt" = ${new Date()},
          "updatedAt" = ${new Date()}
      WHERE "id" = 'default'
    `;
  }

  private previousKeyIds(
    previousActiveKeyId: string,
    previousKeyIdsRaw: string,
  ): string[] {
    const parsed = JSON.parse(previousKeyIdsRaw || '[]') as string[];
    return [...new Set([previousActiveKeyId, ...parsed])];
  }
}
