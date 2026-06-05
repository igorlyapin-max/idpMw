import { Injectable, Logger } from '@nestjs/common';
import { ConnectorRegistry } from '../connectors/connector.registry';
import { RetryService } from './retry/retry.service';
import { DlqService } from './dlq/dlq.service';
import { MetricsService } from '../metrics/metrics.service';

/**
 * Payload handed from DispatcherService to ProcessingService.
 *
 * `targetSystem` is the routing key — it must match a registered
 * connector name (either a static connector or a DB-backed proxy).
 */
export interface ProcessingPayload {
  eventId: string;
  operation: string;
  targetSystem: string;
  payload: Record<string, unknown>;
}

/**
 * ProcessingService — executes the event against the concrete connector.
 *
 * Flow:
 *   1. Look up connector by `dto.targetSystem` name in ConnectorRegistry
 *   2. Wrap connector.execute() in RetryService (max 3 attempts, exponential backoff)
 *   3. On success → record metrics
 *   4. On failure (retry exhausted or exception) → send to DLQ + record metrics
 *
 * The connector receives:
 *   {
 *     operation: dto.operation,     // e.g. 'user.create'
 *     targetSystem: dto.targetSystem, // e.g. 'zabbix-prod'
 *     payload: {                     // merged with DB config by ConnectorRegistry proxy
 *       ...dto.payload,
 *       config: { baseUrl, apiKey, ... }  // ← injected by createProxy()
 *     }
 *   }
 */
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
    // Step 1: resolve the connector by name.
    // In multi-instance mode `dto.targetSystem` is the TargetSystem.name from DB.
    // In legacy mode it is the static connector type ('rest', 'db', ...).
    const connector = this.registry.get(dto.targetSystem);
    if (!connector) {
      this.logger.error(
        `No connector found for target system: ${dto.targetSystem}`,
      );
      throw new Error(`Unsupported target system: ${dto.targetSystem}`);
    }

    try {
      // Step 2: execute with retry logic.
      // If the connector returns { success: false }, we treat it as a failure
      // and throw so that the catch block sends it to DLQ.
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

      // Step 3: dead-letter the event for manual review / replay.
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
