import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockIdmService } from './mock-idm.service';
import type { MockIdmEvent } from './mock-idm.service';
import { AVANPOST_OPERATION_VALUES } from '../inbound/webhooks/avanpost-operation.enum';

const SPECIAL_SCENARIOS = new Set([
  'duplicate',
  'malformed',
  'fail',
  'send-event',
]);

const OP_KEBAB_TO_DOT: Record<string, string> = {
  'user-create': 'user.create',
  'user-update': 'user.update',
  'user-delete': 'user.delete',
  'user-get': 'user.get',
  'user-search': 'user.search',
  'user-enable': 'user.enable',
  'user-disable': 'user.disable',
  'user-lock': 'user.lock',
  'user-unlock': 'user.unlock',
  'user-resolve': 'user.resolve',
  'user-add-attributes': 'user.addAttributes',
  'user-remove-attributes': 'user.removeAttributes',
  'group-create': 'group.create',
  'group-update': 'group.update',
  'group-delete': 'group.delete',
  'group-get': 'group.get',
  'group-search': 'group.search',
  'group-add-member': 'group.addMember',
  'group-remove-member': 'group.removeMember',
  'system-test': 'system.test',
  'schema-get': 'schema.get',
  'sync-full': 'sync.full',
  'sync-incremental': 'sync.incremental',
};

function kebabToDot(name: string): string | undefined {
  if (SPECIAL_SCENARIOS.has(name)) {
    return name;
  }

  // Try exact lookup first.
  const direct = OP_KEBAB_TO_DOT[name];
  if (direct) {
    return direct;
  }

  // Fallback: find an operation whose dot-to-kebab form matches the name
  // (case-insensitive). This handles the credential-change operation whose
  // kebab form keeps an uppercase letter.
  return AVANPOST_OPERATION_VALUES.find((op) => {
    const kebab = op.replace(/\./g, '-');
    return kebab === name || kebab.toLowerCase() === name.toLowerCase();
  });
}

@Controller('mock-idm')
export class MockIdmController {
  private readonly logger = new Logger(MockIdmController.name);

  constructor(
    private readonly mockIdmService: MockIdmService,
    private readonly config: ConfigService,
  ) {}

  private getMiddlewareUrl(): string {
    const configured = this.config.get<string>('MOCK_IDM_MIDDLEWARE_URL');
    if (configured) {
      return configured;
    }
    const scheme =
      (this.config.get<boolean>('HTTP_TLS_ENABLED') ?? false)
        ? 'https'
        : 'http';
    const port = this.config.get<number>('PORT') ?? 3010;
    return `${scheme}://127.0.0.1:${port}`;
  }

  private resolveOperation(name: string): string {
    const op = kebabToDot(name);
    if (!op) {
      throw new BadRequestException(`Unknown scenario: ${name}`);
    }
    if (!SPECIAL_SCENARIOS.has(op) && !AVANPOST_OPERATION_VALUES.includes(op)) {
      throw new BadRequestException(`Unsupported operation: ${op}`);
    }
    return op;
  }

  @Post('scenario/:name')
  @HttpCode(200)
  async runScenario(
    @Param('name') name: string,
  ): Promise<{ success: boolean; event: MockIdmEvent; data?: unknown }> {
    const operation = this.resolveOperation(name);
    const url = this.getMiddlewareUrl();

    if (operation === 'duplicate') {
      const event = this.mockIdmService.generateEvent('user.create');
      await this.mockIdmService.sendEventToMiddleware(event, url);
      await this.mockIdmService.sendEventToMiddleware(
        this.mockIdmService.generateDuplicateEvent(event),
        url,
      );
      return { success: true, event };
    }

    if (operation === 'malformed') {
      const event = this.mockIdmService.generateEvent('user.create');
      event.payload = this.mockIdmService.generateMalformedPayload();
      await this.mockIdmService.sendEventToMiddleware(event, url);
      return { success: true, event };
    }

    if (operation === 'fail') {
      const event = this.mockIdmService.generateEvent(
        'user.create',
        undefined,
        'fake',
        true,
      );
      await this.mockIdmService.sendEventToMiddleware(event, url);
      return { success: true, event };
    }

    const event = this.mockIdmService.generateEvent(operation);
    await this.mockIdmService.sendEventToMiddleware(event, url);

    return { success: true, event };
  }

  @Post('send-event')
  @HttpCode(200)
  async sendEvent(@Body() event: MockIdmEvent): Promise<{ success: boolean }> {
    await this.mockIdmService.sendEventToMiddleware(
      event,
      this.getMiddlewareUrl(),
    );
    return { success: true };
  }
}
