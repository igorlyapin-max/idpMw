import { Injectable, Logger } from '@nestjs/common';

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

const defaultOptions: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: true,
};

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  async execute<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {},
  ): Promise<T> {
    const opts = { ...defaultOptions, ...options };
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === opts.maxRetries) {
          this.logger.error(`All ${opts.maxRetries} retries exhausted`);
          throw lastError ?? new Error('Unknown error');
        }
        const delay = this.calculateDelay(attempt, opts);
        this.logger.warn(
          `Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`,
        );
        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error('Retry exhausted');
  }

  private calculateDelay(attempt: number, opts: RetryOptions): number {
    const exponential = opts.baseDelayMs * Math.pow(2, attempt);
    const capped = Math.min(exponential, opts.maxDelayMs);
    if (!opts.jitter) return capped;
    return Math.floor(capped * (0.5 + Math.random() * 0.5));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
