import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { EncryptionService } from '../security/encryption.service';
import { TlsOptionsFactory } from '../security/tls-options.factory';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private readonly enabled: boolean;
  private producer: Producer | undefined;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly tlsOptions?: TlsOptionsFactory,
    @Optional() private readonly encryption?: EncryptionService,
  ) {
    this.enabled = this.config.get<boolean>('KAFKA_ENABLED') ?? false;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('Kafka producer is disabled');
      return;
    }

    const brokers = (
      this.config.get<string>('KAFKA_BROKERS') ?? 'localhost:9092'
    ).split(',');
    const clientId = `${this.config.get<string>('KAFKA_CLIENT_ID') ?? 'idmmw'}-producer`;
    const kafka = new Kafka(
      this.tlsOptions?.kafkaConfig(clientId, brokers) ?? { clientId, brokers },
    );
    this.producer = kafka.producer();
    await this.producer.connect();
    this.logger.log(`Kafka producer connected to ${brokers.join(', ')}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer?.disconnect();
  }

  async send(topic: string, message: Record<string, unknown>): Promise<void> {
    if (!this.producer) {
      if (this.enabled) {
        throw new Error('Kafka producer is enabled but not available');
      }
      this.logger.warn('Kafka producer not available, message dropped');
      return;
    }

    await this.producer.send({
      topic,
      messages: [
        {
          value:
            this.encryption?.encodeKafkaMessage(message) ??
            JSON.stringify(message),
        },
      ],
    });
  }
}
