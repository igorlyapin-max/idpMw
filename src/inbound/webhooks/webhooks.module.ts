import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { CoreModule } from '../../core/core.module';
import { OutboundModule } from '../../outbound/outbound.module';

@Module({
  imports: [CoreModule, OutboundModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhooksModule {}
