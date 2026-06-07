import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import type { AvanpostOperation } from '../inbound/webhooks/avanpost-operation.enum';
import { getPayloadTemplate } from './payloads';

export interface MockIdmEvent {
  eventId: string;
  operation: AvanpostOperation;
  targetSystem: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class MockIdmService {
  private readonly logger = new Logger(MockIdmService.name);

  constructor(private readonly httpService: HttpService) {}

  generateEvent(
    operation: AvanpostOperation,
    eventId?: string,
    targetSystem = 'fake',
    fail = false,
  ): MockIdmEvent {
    const ts = Date.now();
    const template = getPayloadTemplate(operation);

    return {
      eventId:
        eventId ?? `mock-${ts}-${Math.random().toString(36).slice(2, 7)}`,
      operation,
      targetSystem,
      payload: {
        ...template,
        url: fail
          ? 'http://localhost:9999/fail'
          : 'http://localhost:3010/health',
      },
    };
  }

  generateDuplicateEvent(baseEvent: MockIdmEvent): MockIdmEvent {
    return { ...baseEvent };
  }

  generateMalformedPayload(): Record<string, unknown> {
    return { invalid: true, missingRequiredField: null };
  }

  async sendEventToMiddleware(
    event: MockIdmEvent,
    middlewareUrl: string,
  ): Promise<void> {
    try {
      const response = await lastValueFrom(
        this.httpService.post(`${middlewareUrl}/webhooks/avanpost`, event),
      );
      this.logger.log(
        `Event ${event.eventId} sent. Status: ${response.status}`,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send event ${event.eventId}: ${msg}`);
      throw error;
    }
  }
}
