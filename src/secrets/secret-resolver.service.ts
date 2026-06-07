import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IndeedPamAapmClient } from './indeed-pam-aapm.client';

@Injectable()
export class SecretResolverService {
  private readonly logger = new Logger(SecretResolverService.name);
  private readonly cache = new Map<string, string>();

  constructor(
    private readonly config: ConfigService,
    private readonly pamClient: IndeedPamAapmClient,
  ) {}

  async resolveAll(): Promise<void> {
    const provider =
      this.config.get<string>('SECRETS_PROVIDER') ??
      this.config.get<string>('Secrets.Provider') ??
      'None';
    if (provider === 'None') {
      this.logger.log('Secrets provider is None — skipping resolution');
      return;
    }

    if (provider !== 'IndeedPamAapm') {
      throw new Error(
        `Configuration contains PAM references, but Secrets.Provider is '${provider}'.`,
      );
    }

    const allKeys = Object.keys(process.env).filter(
      (k) => !k.startsWith('Secrets:') && this.isReference(process.env[k]),
    );

    if (allKeys.length === 0) {
      this.logger.log('No PAM references found in configuration');
      return;
    }

    for (const key of allKeys) {
      const refId = this.extractRefId(process.env[key]!);
      if (!refId) continue;

      if (this.cache.has(refId)) {
        process.env[key] = this.cache.get(refId)!;
        continue;
      }

      try {
        const resolved = await this.pamClient.getValue(refId);
        this.cache.set(refId, resolved);
        process.env[key] = resolved;
        this.logger.log(`Resolved PAM ref for ${key}`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to resolve PAM ref '${refId}' for ${key}: ${msg}`,
        );
        throw error;
      }
    }
  }

  private isReference(value: string | undefined): boolean {
    if (!value) return false;
    const trimmed = value.trim();
    return (
      trimmed.startsWith('secret://') ||
      trimmed.startsWith('aapm://') ||
      trimmed.startsWith('SECRET://') ||
      trimmed.startsWith('AAPM://')
    );
  }

  private extractRefId(value: string): string | undefined {
    const trimmed = value.trim();
    for (const prefix of ['secret://', 'aapm://', 'SECRET://', 'AAPM://']) {
      if (trimmed.toLowerCase().startsWith(prefix)) {
        return trimmed.slice(prefix.length).trim();
      }
    }
    return undefined;
  }
}
