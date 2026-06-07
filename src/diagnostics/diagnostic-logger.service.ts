import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DebugLoggingLevel } from '../config/logging.config';

const SENSITIVE_KEY_RE =
  /(password|passwd|token|secret|authorization|cookie|apiKey|key)$/i;

@Injectable()
export class DiagnosticLoggerService {
  private readonly logger = new Logger(DiagnosticLoggerService.name);

  constructor(private readonly config: ConfigService) {}

  basic(event: string, fields: Record<string, unknown> = {}): void {
    if (!this.enabled()) return;
    this.logger.log({
      diagnostic: true,
      diagnosticLevel: 'Basic',
      event,
      ...this.redactRecord(fields, false),
    });
  }

  verbose(event: string, fields: Record<string, unknown> = {}): void {
    if (!this.enabled() || this.level() !== 'Verbose') return;
    this.logger.debug({
      diagnostic: true,
      diagnosticLevel: 'Verbose',
      event,
      ...this.redactRecord(fields, true),
    });
  }

  isEnabled(): boolean {
    return this.enabled();
  }

  level(): DebugLoggingLevel {
    const value =
      this.config.get<string>('DebugLogging__Level') ??
      this.config.get<string>('DEBUG_LOGGING_LEVEL');
    return value === 'Verbose' ? 'Verbose' : 'Basic';
  }

  private enabled(): boolean {
    return (
      (this.config.get<boolean>('DebugLogging__Enabled') ?? false) ||
      (this.config.get<boolean>('DEBUG_LOGGING_ENABLED') ?? false)
    );
  }

  private redactRecord(
    value: Record<string, unknown>,
    keepStructure: boolean,
  ): Record<string, unknown> {
    return this.redact(value, keepStructure) as Record<string, unknown>;
  }

  private redact(value: unknown, keepStructure: boolean): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redact(item, keepStructure));
    }

    if (value === null || typeof value !== 'object') {
      return value;
    }

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        result[key] = '[REDACTED]';
        continue;
      }
      if (!keepStructure && typeof item === 'object' && item !== null) {
        result[key] = '[omitted]';
        continue;
      }
      result[key] = this.redact(item, keepStructure);
    }
    return result;
  }
}
