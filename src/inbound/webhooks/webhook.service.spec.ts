import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';
import { IdempotencyService } from '../../core/idempotency/idempotency.service';
import { DispatcherService } from '../../outbound/dispatcher.service';

describe('WebhookService', () => {
  let service: WebhookService;
  let idempotency: { checkAndLock: jest.Mock };
  let dispatcher: { dispatch: jest.Mock };

  beforeEach(async () => {
    idempotency = { checkAndLock: jest.fn() };
    dispatcher = { dispatch: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: IdempotencyService, useValue: idempotency },
        { provide: DispatcherService, useValue: dispatcher },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  it('should process new webhook', async () => {
    idempotency.checkAndLock.mockResolvedValue(true);
    dispatcher.dispatch.mockResolvedValue(undefined);

    const result = await service.processWebhook({
      eventId: 'e1',
      operation: 'create',
      targetSystem: 'zabbix',
      payload: {},
    });

    expect(result).toBe(true);
    expect(dispatcher.dispatch).toHaveBeenCalled();
  });

  it('should ignore duplicate webhook', async () => {
    idempotency.checkAndLock.mockResolvedValue(false);

    const result = await service.processWebhook({
      eventId: 'e1',
      operation: 'create',
      targetSystem: 'zabbix',
      payload: {},
    });

    expect(result).toBe(false);
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('should propagate dispatch error', async () => {
    idempotency.checkAndLock.mockResolvedValue(true);
    dispatcher.dispatch.mockRejectedValue(new Error('dispatch fail'));

    await expect(
      service.processWebhook({
        eventId: 'e1',
        operation: 'create',
        targetSystem: 'zabbix',
        payload: {},
      }),
    ).rejects.toThrow('dispatch fail');
  });
});
