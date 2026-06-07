import { Injectable, Logger, Optional } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import {
  Connector,
  ConnectorPayload,
  ConnectorResult,
} from '../../connector.interface';
import {
  TlsConnectionConfig,
  TlsOptionsFactory,
} from '../../../security/tls-options.factory';

interface RestConnectorConfig {
  baseUrl?: string;
  tls?: TlsConnectionConfig;
}

@Injectable()
export class RestConnectorService implements Connector {
  readonly name = 'rest';
  private readonly logger = new Logger(RestConnectorService.name);

  constructor(
    private readonly httpService: HttpService,
    @Optional() private readonly tlsOptions?: TlsOptionsFactory,
  ) {}

  async execute(payload: ConnectorPayload): Promise<ConnectorResult> {
    const targetUrl = payload.payload['url'] as string | undefined;
    const config = payload.payload['config'] as RestConnectorConfig | undefined;
    if (!targetUrl) {
      return { success: false, error: 'Missing target URL in payload' };
    }

    try {
      const response = await lastValueFrom(
        this.httpService.post(targetUrl, payload.payload['data'] ?? {}, {
          ...(this.tlsOptions?.axiosConfig(
            targetUrl,
            config?.tls,
            'REST target',
          ) ?? {}),
        }),
      );
      this.logger.log(
        `REST call to ${targetUrl} succeeded: ${response.status}`,
      );
      return { success: true, data: response.data };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`REST call to ${targetUrl} failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async testConnection(
    config: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }> {
    const cfg = config as unknown as RestConnectorConfig;
    const baseUrl = cfg.baseUrl;
    if (!baseUrl) {
      return { success: false, message: 'Missing baseUrl in config' };
    }

    try {
      const response = await lastValueFrom(
        this.httpService.get(baseUrl, {
          timeout: 10000,
          ...(this.tlsOptions?.axiosConfig(baseUrl, cfg.tls, 'REST target') ??
            {}),
        }),
      );
      return {
        success: true,
        message: `REST endpoint reachable (status ${response.status})`,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `REST connection failed: ${msg}` };
    }
  }
}
