import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge, register } from 'prom-client';

function getOrCreateCounter(
  name: string,
  help: string,
  labelNames: string[],
): Counter<string> {
  const existing = register.getSingleMetric(name) as
    | Counter<string>
    | undefined;
  return existing ?? new Counter({ name, help, labelNames });
}

function getOrCreateHistogram(
  name: string,
  help: string,
  labelNames: string[],
  buckets?: number[],
): Histogram<string> {
  const existing = register.getSingleMetric(name) as
    | Histogram<string>
    | undefined;
  return existing ?? new Histogram({ name, help, labelNames, buckets });
}

function getOrCreateGauge(
  name: string,
  help: string,
  labelNames: string[],
): Gauge<string> {
  const existing = register.getSingleMetric(name) as Gauge<string> | undefined;
  return existing ?? new Gauge({ name, help, labelNames });
}

interface ProcessedEventSample {
  timestamp: number;
  status: 'success' | 'failed';
  targetSystem: string;
}

@Injectable()
export class MetricsService {
  private readonly processedWindow: ProcessedEventSample[] = [];
  private readonly windowMs = 5 * 60 * 1000;

  readonly httpRequestsTotal = getOrCreateCounter(
    'idmmw_http_requests_total',
    'Total HTTP requests',
    ['method', 'route', 'status'],
  );

  readonly httpRequestDuration = getOrCreateHistogram(
    'idmmw_http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method', 'route'],
    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  );

  readonly connectorErrors = getOrCreateCounter(
    'idmmw_connector_errors_total',
    'Total connector errors',
    ['connector', 'operation'],
  );

  readonly dlqSize = getOrCreateGauge(
    'idmmw_dlq_size',
    'Current DLQ size by status',
    ['status'],
  );

  readonly eventsProcessed = getOrCreateCounter(
    'idmmw_events_processed_total',
    'Total events processed',
    ['status', 'targetSystem'],
  );

  readonly eventsProcessedLast5m = getOrCreateGauge(
    'idmmw_events_processed_last_5m',
    'Events processed during the last five minutes',
    ['status', 'targetSystem'],
  );

  recordConnectorError(connector: string, operation: string): void {
    this.connectorErrors.inc({ connector, operation });
  }

  setDlqSize(status: string, count: number): void {
    this.dlqSize.set({ status }, count);
  }

  recordEvent(status: 'success' | 'failed', targetSystem = 'unknown'): void {
    this.eventsProcessed.inc({ status, targetSystem });
    this.processedWindow.push({
      timestamp: Date.now(),
      status,
      targetSystem,
    });
    this.refreshProcessedWindow();
  }

  processedLast5Minutes(): {
    total: number;
    byStatus: Record<string, number>;
    byTargetSystem: Record<string, Record<string, number>>;
  } {
    this.refreshProcessedWindow();
    const byStatus: Record<string, number> = {};
    const byTargetSystem: Record<string, Record<string, number>> = {};
    for (const sample of this.processedWindow) {
      byStatus[sample.status] = (byStatus[sample.status] ?? 0) + 1;
      byTargetSystem[sample.targetSystem] ??= {};
      byTargetSystem[sample.targetSystem][sample.status] =
        (byTargetSystem[sample.targetSystem][sample.status] ?? 0) + 1;
    }
    return {
      total: this.processedWindow.length,
      byStatus,
      byTargetSystem,
    };
  }

  private refreshProcessedWindow(): void {
    const cutoff = Date.now() - this.windowMs;
    while (
      this.processedWindow.length > 0 &&
      this.processedWindow[0].timestamp < cutoff
    ) {
      this.processedWindow.shift();
    }

    this.eventsProcessedLast5m.reset();
    for (const [targetSystem, byStatus] of Object.entries(
      this.processedLast5MinutesRaw(),
    )) {
      for (const [status, count] of Object.entries(byStatus)) {
        this.eventsProcessedLast5m.set({ status, targetSystem }, count);
      }
    }
  }

  private processedLast5MinutesRaw(): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};
    for (const sample of this.processedWindow) {
      result[sample.targetSystem] ??= {};
      result[sample.targetSystem][sample.status] =
        (result[sample.targetSystem][sample.status] ?? 0) + 1;
    }
    return result;
  }
}
