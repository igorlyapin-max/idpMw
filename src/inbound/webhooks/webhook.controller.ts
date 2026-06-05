import {
  Controller,
  Post,
  Body,
  Logger,
  UseInterceptors,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { AuditInterceptor } from '../../core/audit/audit.interceptor';

export interface AvanpostWebhookDto {
  eventId: string;
  operation: string;
  targetSystem: string;
  payload: Record<string, unknown>;
}

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
      `Received webhook: ${dto.eventId}, operation: ${dto.operation}`,
    );
    const processed = await this.webhookService.processWebhook(dto);
    return { received: true, processed };
  }
}
