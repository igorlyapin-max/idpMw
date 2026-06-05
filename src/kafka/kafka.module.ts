import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { CoreModule } from '../core/core.module';

@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: 'KAFKA_ENABLED',
      useFactory: (config: ConfigService) =>
        config.get<boolean>('KAFKA_ENABLED') ?? false,
      inject: [ConfigService],
    },
    KafkaProducerService,
    KafkaConsumerService,
  ],
  exports: [KafkaProducerService, KafkaConsumerService],
})
export class KafkaModule {}
