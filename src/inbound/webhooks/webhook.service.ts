import { Injectable, Logger } from '@nestjs/common';
import { IdempotencyService } from '../../core/idempotency/idempotency.service';
import { DispatcherService } from '../../outbound/dispatcher.service';
import type { AvanpostWebhookDto } from './webhook.controller';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly dispatcher: DispatcherService,
  ) {}

  async processWebhook(dto: AvanpostWebhookDto): Promise<boolean> {
    const idempotencyKey = `avanpost:${dto.eventId}`;
    const isNew = await this.idempotency.checkAndLock(idempotencyKey, 3600);

    if (!isNew) {
      this.logger.warn(`Duplicate webhook ignored: ${dto.eventId}`);
      return false;
    }

    try {
      await this.dispatcher.dispatch(dto);
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to process webhook ${dto.eventId}: ${msg}`);
      throw error;
    }
  }
}
