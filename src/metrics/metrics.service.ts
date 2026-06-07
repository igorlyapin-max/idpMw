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

@Injectable()
export class MetricsService {
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
    ['status'],
  );

  recordConnectorError(connector: string, operation: string): void {
    this.connectorErrors.inc({ connector, operation });
  }

  setDlqSize(status: string, count: number): void {
    this.dlqSize.set({ status }, count);
  }

  recordEvent(status: 'success' | 'failed'): void {
    this.eventsProcessed.inc({ status });
  }
}
