import { Module } from '@nestjs/common';
import { DispatcherService } from './dispatcher.service';
import { CoreModule } from '../core/core.module';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [CoreModule, KafkaModule],
  providers: [DispatcherService],
  exports: [DispatcherService],
})
export class OutboundModule {}
