import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

export interface MockIdmEvent {
  eventId: string;
  operation: 'create' | 'update' | 'delete' | 'enable' | 'disable';
  targetSystem: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class MockIdpService {
  private readonly logger = new Logger(MockIdpService.name);

  constructor(private readonly httpService: HttpService) {}

  generateEvent(
    operation: MockIdmEvent['operation'],
    eventId?: string,
    fail = false,
  ): MockIdmEvent {
    const ts = Date.now();
    return {
      eventId:
        eventId ?? `mock-${ts}-${Math.random().toString(36).slice(2, 7)}`,
      operation,
      targetSystem: 'rest',
      payload: {
        url: fail
          ? 'http://localhost:9999/fail'
          : 'http://localhost:3010/health',
        data: {
          username: `user_${ts}`,
          email: `user_${ts}@example.com`,
          firstName: 'Test',
          lastName: 'User',
        },
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
