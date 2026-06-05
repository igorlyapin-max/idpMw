import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProcessingService } from '../core/processing.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import type { AvanpostWebhookDto } from '../inbound/webhooks/webhook.controller';

/**
 * DispatcherService — the bridge between inbound webhooks and the processing layer.
 *
 * Responsibilities:
 *   1. Call ProcessingService to execute the event against the target connector
 *   2. Emit an async Kafka message (only when KAFKA_ENABLED=true)
 *
 * In lightweight mode (LIGHTWEIGHT_MODE=true) Kafka is disabled;
 * the dispatcher works synchronously without losing functionality.
 */
@Injectable()
export class DispatcherService {
  private readonly logger = new Logger(DispatcherService.name);

  constructor(
    private readonly processing: ProcessingService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Dispatch an event to the target system.
   *
   * Flow:
   *   dto.targetSystem ──► ConnectorRegistry.get(name)
   *                            │
   *                            ▼
   *                       ProcessingService.process()
   *                            │
   *                            ├── success ──► metrics ++
   *                            └── failure ──► DLQ + metrics ++
   *
   * After processing (success or failure) an optional Kafka message
   * is sent to topic `idm.events.out` for downstream consumers.
   */
  async dispatch(dto: AvanpostWebhookDto): Promise<void> {
    const kafkaEnabled = this.config.get<boolean>('KAFKA_ENABLED') ?? false;

    try {
      // Core execution: route to the concrete connector via registry lookup.
      await this.processing.process({
        eventId: dto.eventId,
        operation: dto.operation,
        targetSystem: dto.targetSystem,
        payload: dto.payload,
      });
      this.logger.log(`Dispatch succeeded for event ${dto.eventId}`);

      // Optional: emit async success event for external consumers.
      if (kafkaEnabled) {
        await this.kafkaProducer.send('idm.events.out', {
          eventId: dto.eventId,
          operation: dto.operation,
          targetSystem: dto.targetSystem,
          status: 'success',
        });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Dispatch failed for event ${dto.eventId}: ${msg}`);

      // Optional: emit async failure event for external consumers / alerting.
      if (kafkaEnabled) {
        await this.kafkaProducer.send('idm.events.out', {
          eventId: dto.eventId,
          operation: dto.operation,
          targetSystem: dto.targetSystem,
          status: 'failed',
          error: msg,
        });
      }
    }
  }
}
