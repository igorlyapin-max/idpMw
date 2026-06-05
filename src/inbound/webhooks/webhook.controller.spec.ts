import { Test, TestingModule } from '@nestjs/testing';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { PrismaService } from '../../database/prisma.service';
import { JsonHelper } from '../../database/json.helper';

describe('WebhookController', () => {
  let controller: WebhookController;
  let service: { processWebhook: jest.Mock };

  beforeEach(async () => {
    service = { processWebhook: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: WebhookService, useValue: service },
        { provide: PrismaService, useValue: {} },
        { provide: JsonHelper, useValue: {} },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
  });

  it('should receive and process webhook', async () => {
    service.processWebhook.mockResolvedValue(true);
    const result = await controller.receiveWebhook({
      eventId: 'e1',
      operation: 'create',
      targetSystem: 'zabbix',
      payload: {},
    });
    expect(result.received).toBe(true);
    expect(result.processed).toBe(true);
  });
});
