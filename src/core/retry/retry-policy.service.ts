import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { JsonHelper } from '../../database/json.helper';
import type { RetryOptions } from './retry.service';

export interface TargetRetryPolicy extends Partial<RetryOptions> {
  dlqLeaseSeconds?: number;
}

const DEFAULT_RETRY_POLICY: Required<TargetRetryPolicy> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: true,
  dlqLeaseSeconds: 300,
};

@Injectable()
export class RetryPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jsonHelper: JsonHelper,
    private readonly config: ConfigService,
  ) {}

  async forTarget(targetSystem: string): Promise<Required<TargetRetryPolicy>> {
    const item = await this.prisma.targetSystem
      .findUnique({ where: { name: targetSystem }, select: { config: true } })
      .catch(() => null);
    const config =
      item?.config === undefined
        ? {}
        : (this.jsonHelper.fromJson<Record<string, unknown>>(item.config) ??
          {});
    const policy = this.normalizePolicy(config['retryPolicy']);
    return {
      ...DEFAULT_RETRY_POLICY,
      dlqLeaseSeconds:
        this.config.get<number>('DLQ_RETRY_LEASE_SECONDS') ??
        DEFAULT_RETRY_POLICY.dlqLeaseSeconds,
      ...policy,
    };
  }

  private normalizePolicy(value: unknown): TargetRetryPolicy {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    const raw = value as Record<string, unknown>;
    return {
      ...(this.positiveInteger(raw['maxRetries']) !== undefined
        ? { maxRetries: this.positiveInteger(raw['maxRetries']) }
        : {}),
      ...(this.positiveInteger(raw['baseDelayMs']) !== undefined
        ? { baseDelayMs: this.positiveInteger(raw['baseDelayMs']) }
        : {}),
      ...(this.positiveInteger(raw['maxDelayMs']) !== undefined
        ? { maxDelayMs: this.positiveInteger(raw['maxDelayMs']) }
        : {}),
      ...(typeof raw['jitter'] === 'boolean' ? { jitter: raw['jitter'] } : {}),
      ...(this.positiveInteger(raw['dlqLeaseSeconds']) !== undefined
        ? { dlqLeaseSeconds: this.positiveInteger(raw['dlqLeaseSeconds']) }
        : {}),
    };
  }

  private positiveInteger(value: unknown): number | undefined {
    const numberValue = Number(value);
    return Number.isInteger(numberValue) && numberValue > 0
      ? numberValue
      : undefined;
  }
}
