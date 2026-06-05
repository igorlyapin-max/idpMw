import { Injectable, Logger } from '@nestjs/common';
import { IdempotencyService } from '../../core/idempotency/idempotency.service';
import { DispatcherService } from '../../outbound/dispatcher.service';
import type { AvanpostWebhookDto } from './webhook.controller';

/**
 * WebhookService — orchestrates inbound event processing.
 *
 * Two-layer safety net:
 *   1. Idempotency — deduplicates events by eventId (Redis or PostgreSQL advisory lock)
 *   2. Dispatcher — routes the event to the correct target system
 *
 * If the same eventId arrives twice, the second call returns processed=false
 * and the Dispatcher is never invoked.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly dispatcher: DispatcherService,
  ) {}

  /**
   * Process a webhook from Avanpost IDM.
   *
   * @returns true  — first-time event, dispatched successfully
   * @returns false — duplicate event, ignored
   * @throws        — dispatch failed (will be retried/DLQed upstream)
   */
  async processWebhook(dto: AvanpostWebhookDto): Promise<boolean> {
    const idempotencyKey = `avanpost:${dto.eventId}`;

    // Check if we already processed this eventId.
    // TTL = 3600 sec — duplicates within 1 hour are silently ignored.
    const isNew = await this.idempotency.checkAndLock(idempotencyKey, 3600);

    if (!isNew) {
      this.logger.warn(`Duplicate webhook ignored: ${dto.eventId}`);
      return false;
    }

    try {
      // Forward to the outbound dispatcher.
      // Dispatcher → ProcessingService → ConnectorRegistry → Concrete Connector
      await this.dispatcher.dispatch(dto);
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to process webhook ${dto.eventId}: ${msg}`);
      throw error;
    }
  }
}
