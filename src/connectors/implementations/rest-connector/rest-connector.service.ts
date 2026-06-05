import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import {
  Connector,
  ConnectorPayload,
  ConnectorResult,
} from '../../connector.interface';

@Injectable()
export class RestConnectorService implements Connector {
  readonly name = 'rest';
  private readonly logger = new Logger(RestConnectorService.name);

  constructor(private readonly httpService: HttpService) {}

  async execute(payload: ConnectorPayload): Promise<ConnectorResult> {
    const targetUrl = payload.payload['url'] as string | undefined;
    if (!targetUrl) {
      return { success: false, error: 'Missing target URL in payload' };
    }

    try {
      const response = await lastValueFrom(
        this.httpService.post(targetUrl, payload.payload['data'] ?? {}),
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
}
