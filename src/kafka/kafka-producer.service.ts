import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit {
  private readonly logger = new Logger(KafkaProducerService.name);
  private producer: Producer | undefined;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const enabled = this.config.get<boolean>('KAFKA_ENABLED') ?? false;
    if (!enabled) {
      this.logger.log('Kafka producer is disabled');
      return;
    }

    const brokers = (
      this.config.get<string>('KAFKA_BROKERS') ?? 'localhost:9092'
    ).split(',');
    const kafka = new Kafka({ clientId: 'idmmw-producer', brokers });
    this.producer = kafka.producer();
    await this.producer.connect();
    this.logger.log(`Kafka producer connected to ${brokers.join(', ')}`);
  }

  async send(topic: string, message: Record<string, unknown>): Promise<void> {
    if (!this.producer) {
      this.logger.warn('Kafka producer not available, message dropped');
      return;
    }

    await this.producer.send({
      topic,
      messages: [{ value: JSON.stringify(message) }],
    });
  }
}
