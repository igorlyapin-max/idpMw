import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { TargetSystemController } from './target-system.controller';
import { TargetSystemService } from './target-system.service';
import { CoreModule } from '../core/core.module';
import { KafkaModule } from '../kafka/kafka.module';
import { MetricsModule } from '../metrics/metrics.module';
import { ConnectorsModule } from '../connectors/connectors.module';

@Module({
  imports: [CoreModule, KafkaModule, MetricsModule, ConnectorsModule],
  controllers: [AdminController, TargetSystemController],
  providers: [AdminService, TargetSystemService],
})
export class AdminModule {}
