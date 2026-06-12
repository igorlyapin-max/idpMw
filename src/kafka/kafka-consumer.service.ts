import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer } from 'kafkajs';
import {
  ProcessingService,
  ProcessingPayload,
} from '../core/processing.service';
import { KafkaProducerService } from './kafka-producer.service';
import { EncryptionService } from '../security/encryption.service';
import { TlsOptionsFactory } from '../security/tls-options.factory';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer: Consumer | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly processing: ProcessingService,
    private readonly producer: KafkaProducerService,
    @Optional() private readonly tlsOptions?: TlsOptionsFactory,
    @Optional() private readonly encryption?: EncryptionService,
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
    const clientId = `${this.config.get<string>('KAFKA_CLIENT_ID') ?? 'idmmw'}-consumer`;
    const groupId =
      this.config.get<string>('KAFKA_CONSUMER_GROUP_ID') ??
      'idmmw-worker-group';
    const retryTopic =
      this.config.get<string>('KAFKA_TOPIC_DLQ_RETRY') ?? 'idm.dlq.retry';
    const eventsInTopic =
      this.config.get<string>('KAFKA_TOPIC_EVENTS_IN') ?? 'idm.events.in';
    const processingMode =
      this.config.get<string>('IDMMW_PROCESSING_MODE') ?? 'sync';

    const kafka = new Kafka(
      this.tlsOptions?.kafkaConfig(clientId, brokers) ?? { clientId, brokers },
    );
    this.consumer = kafka.consumer({ groupId });

    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: retryTopic,
      fromBeginning: false,
    });
    if (processingMode === 'async') {
      await this.consumer.subscribe({
        topic: eventsInTopic,
        fromBeginning: false,
      });
    }

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        this.logger.log(`Received message from ${topic}[${partition}]`);
        try {
          const rawMessage = message.value?.toString() ?? '{}';
          const messageValue =
            this.encryption?.decodeKafkaMessage<
              ProcessingPayload & { dlqItemId?: string }
            >(rawMessage) ??
            (JSON.parse(rawMessage) as ProcessingPayload & {
              dlqItemId?: string;
            });
          const { dlqItemId, ...payload } = messageValue;
          if (dlqItemId) {
            await this.processing.processRetry(payload, dlqItemId);
          } else {
            await this.processing.process(payload);
          }
          await this.producer.send(
            this.config.get<string>('KAFKA_TOPIC_EVENTS_OUT') ??
              'idm.events.out',
            {
              eventId: payload.eventId,
              operation: payload.operation,
              targetSystem: payload.targetSystem,
              status: 'success',
              sourceTopic: topic,
            },
          );
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to process Kafka message: ${msg}`);
          await this.producer
            .send(
              this.config.get<string>('KAFKA_TOPIC_EVENTS_OUT') ??
                'idm.events.out',
              {
                status: 'failed',
                sourceTopic: topic,
                error: msg,
              },
            )
            .catch((producerError: unknown) => {
              const producerMsg =
                producerError instanceof Error
                  ? producerError.message
                  : String(producerError);
              this.logger.error(
                `Failed to publish Kafka failure status: ${producerMsg}`,
              );
            });
        }
      },
    });

    this.logger.log(
      `Kafka consumer started for ${processingMode === 'async' ? `${eventsInTopic}, ` : ''}${retryTopic}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.disconnect();
  }
}
