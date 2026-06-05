import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProcessingService } from '../core/processing.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import type { AvanpostWebhookDto } from '../inbound/webhooks/webhook.controller';

@Injectable()
export class DispatcherService {
  private readonly logger = new Logger(DispatcherService.name);

  constructor(
    private readonly processing: ProcessingService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly config: ConfigService,
  ) {}

  async dispatch(dto: AvanpostWebhookDto): Promise<void> {
    const kafkaEnabled = this.config.get<boolean>('KAFKA_ENABLED') ?? false;

    try {
      await this.processing.process({
        eventId: dto.eventId,
        operation: dto.operation,
        targetSystem: dto.targetSystem,
        payload: dto.payload,
      });
      this.logger.log(`Dispatch succeeded for event ${dto.eventId}`);

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
