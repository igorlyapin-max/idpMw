import { Controller, Post, Body, Logger, Req, HttpCode } from '@nestjs/common';
import type { Request } from 'express';
import { MockIdpService } from './mock-idp.service';
import type { MockIdmEvent } from './mock-idp.service';

@Controller('mock-idp')
export class MockIdpController {
  private readonly logger = new Logger(MockIdpController.name);

  constructor(private readonly mockIdpService: MockIdpService) {}

  private getMiddlewareUrl(req: Request): string {
    const host = req.get('host') ?? 'localhost:3010';
    return `${req.protocol}://${host}`;
  }

  @Post('scenario/create-user')
  @HttpCode(200)
  async createUser(
    @Req() req: Request,
  ): Promise<{ success: boolean; event: MockIdmEvent }> {
    const event = this.mockIdpService.generateEvent('create');
    await this.mockIdpService.sendEventToMiddleware(
      event,
      this.getMiddlewareUrl(req),
    );
    return { success: true, event };
  }

  @Post('scenario/update-user')
  @HttpCode(200)
  async updateUser(
    @Req() req: Request,
  ): Promise<{ success: boolean; event: MockIdmEvent }> {
    const event = this.mockIdpService.generateEvent('update');
    await this.mockIdpService.sendEventToMiddleware(
      event,
      this.getMiddlewareUrl(req),
    );
    return { success: true, event };
  }

  @Post('scenario/delete-user')
  @HttpCode(200)
  async deleteUser(
    @Req() req: Request,
  ): Promise<{ success: boolean; event: MockIdmEvent }> {
    const event = this.mockIdpService.generateEvent('delete');
    await this.mockIdpService.sendEventToMiddleware(
      event,
      this.getMiddlewareUrl(req),
    );
    return { success: true, event };
  }

  @Post('scenario/duplicate')
  @HttpCode(200)
  async duplicate(
    @Req() req: Request,
  ): Promise<{ success: boolean; event: MockIdmEvent }> {
    const event = this.mockIdpService.generateEvent('create');
    const url = this.getMiddlewareUrl(req);
    await this.mockIdpService.sendEventToMiddleware(event, url);
    await this.mockIdpService.sendEventToMiddleware(
      this.mockIdpService.generateDuplicateEvent(event),
      url,
    );
    return { success: true, event };
  }

  @Post('scenario/malformed')
  @HttpCode(200)
  async malformed(
    @Req() req: Request,
  ): Promise<{ success: boolean; event: MockIdmEvent }> {
    const event = this.mockIdpService.generateEvent('create');
    event.payload = this.mockIdpService.generateMalformedPayload();
    await this.mockIdpService.sendEventToMiddleware(
      event,
      this.getMiddlewareUrl(req),
    );
    return { success: true, event };
  }

  @Post('scenario/fail')
  @HttpCode(200)
  async fail(
    @Req() req: Request,
  ): Promise<{ success: boolean; event: MockIdmEvent }> {
    const event = this.mockIdpService.generateEvent('create', undefined, true);
    await this.mockIdpService.sendEventToMiddleware(
      event,
      this.getMiddlewareUrl(req),
    );
    return { success: true, event };
  }

  @Post('send-event')
  @HttpCode(200)
  async sendEvent(
    @Req() req: Request,
    @Body() event: MockIdmEvent,
  ): Promise<{ success: boolean }> {
    await this.mockIdpService.sendEventToMiddleware(
      event,
      this.getMiddlewareUrl(req),
    );
    return { success: true };
  }
}
