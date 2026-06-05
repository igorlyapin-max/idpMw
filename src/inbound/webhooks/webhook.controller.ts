import {
  Controller,
  Post,
  Body,
  Logger,
  UseInterceptors,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { AuditInterceptor } from '../../core/audit/audit.interceptor';

/**
 * Payload from Avanpost IDM (or any compatible IDM system).
 *
 * Flow:
 *   Avanpost IDM ──POST /webhooks/avanpost──► WebhookController
 *                                               │
 *                                               ▼
 *                                         WebhookService
 *                                               │
 *                                               ▼
 *                                       Idempotency check
 *                                               │
 *                                               ▼
 *                                       DispatcherService
 *                                               │
 *                                               ▼
 *                                       ProcessingService
 *                                               │
 *                                               ▼
 *                                       ConnectorRegistry.get(targetSystem)
 *                                               │
 *                                               ▼
 *                                       Concrete Connector (zabbix, cmdbuild, fake, ...)
 *
 * The `targetSystem` field is the key routing field. It must match either:
 *   1. A static connector name (e.g. 'rest', 'db') — legacy mode
 *   2. A TargetSystem.name from the DB (e.g. 'zabbix-prod') — multi-instance mode
 */
export interface AvanpostWebhookDto {
  /** Unique event identifier — used for idempotency/deduplication */
  eventId: string;

  /** Operation name — passed as-is to the connector (e.g. 'user.create', 'host.update') */
  operation: string;

  /**
   * Routing key for the connector registry.
   * In multi-instance mode this is the TargetSystem.name from the DB.
   * In legacy mode this is the static connector type ('rest', 'db', ...).
   */
  targetSystem: string;

  /** Free-form payload — forwarded to the connector inside payload.data */
  payload: Record<string, unknown>;
}

/**
 * Inbound webhook endpoint.
 *
 * Receives events from Avanpost IDM and forwards them through the processing pipeline.
 * Every request is audited via AuditInterceptor (writes to AuditLog table).
 */
@Controller('webhooks/avanpost')
@UseInterceptors(AuditInterceptor)
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  async receiveWebhook(
    @Body() dto: AvanpostWebhookDto,
  ): Promise<{ received: boolean; processed: boolean }> {
    this.logger.log(
      `Received webhook: ${dto.eventId}, operation: ${dto.operation}, targetSystem: ${dto.targetSystem}`,
    );
    const processed = await this.webhookService.processWebhook(dto);
    return { received: true, processed };
  }
}
