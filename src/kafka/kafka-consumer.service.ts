import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer } from 'kafkajs';
import {
  ProcessingService,
  ProcessingPayload,
} from '../core/processing.service';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer: Consumer | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly processing: ProcessingService,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled = this.config.get<boolean>('KAFKA_ENABLED') ?? false;
    if (!enabled) {
      this.logger.log('Kafka consumer is disabled');
      return;
    }

    const brokers = (
      this.config.get<string>('KAFKA_BROKERS') ?? 'localhost:9092'
    ).split(',');
    const kafka = new Kafka({ clientId: 'idpmw-consumer', brokers });
    this.consumer = kafka.consumer({ groupId: 'idpmw-dlq-retry-group' });

    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: 'idm.dlq.retry',
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        this.logger.log(`Received message from ${topic}[${partition}]`);
        try {
          const payload = JSON.parse(
            message.value?.toString() ?? '{}',
          ) as ProcessingPayload;
          await this.processing.process(payload);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to process retry message: ${msg}`);
        }
      },
    });

    this.logger.log('Kafka DLQ retry consumer started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.disconnect();
  }
}
