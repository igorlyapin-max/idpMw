import { Injectable, Logger } from '@nestjs/common';
import { ConnectorRegistry } from '../connectors/connector.registry';
import { RetryService } from './retry/retry.service';
import { DlqService } from './dlq/dlq.service';
import { MetricsService } from '../metrics/metrics.service';

export interface ProcessingPayload {
  eventId: string;
  operation: string;
  targetSystem: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly retry: RetryService,
    private readonly dlq: DlqService,
    private readonly metrics: MetricsService,
  ) {}

  async process(dto: ProcessingPayload): Promise<void> {
    const connector = this.registry.get(dto.targetSystem);
    if (!connector) {
      this.logger.error(
        `No connector found for target system: ${dto.targetSystem}`,
      );
      throw new Error(`Unsupported target system: ${dto.targetSystem}`);
    }

    try {
      const result = await this.retry.execute(
        () =>
          connector.execute({
            operation: dto.operation,
            targetSystem: dto.targetSystem,
            payload: dto.payload,
          }),
        { maxRetries: 3, baseDelayMs: 1000 },
      );
      if (!result.success) {
        this.metrics.recordConnectorError(dto.targetSystem, dto.operation);
        throw new Error(result.error ?? 'Connector returned failure');
      }
      this.logger.log(`Processing succeeded for event ${dto.eventId}`);
      this.metrics.recordEvent('success');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Processing failed for event ${dto.eventId}: ${msg}`);
      this.metrics.recordEvent('failed');
      await this.dlq.add({
        eventId: dto.eventId,
        operation: dto.operation,
        targetSystem: dto.targetSystem,
        payload: dto.payload,
        error: msg,
        retryCount: 3,
      });
    }
  }
}
