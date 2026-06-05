import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { CoreModule } from '../core/core.module';
import { KafkaModule } from '../kafka/kafka.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [CoreModule, KafkaModule, MetricsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
