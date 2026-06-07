import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';
import { IdempotencyService } from '../../core/idempotency/idempotency.service';
import { DispatcherService } from '../../outbound/dispatcher.service';
import { ProcessingService } from '../../core/processing.service';

describe('WebhookService', () => {
  let service: WebhookService;
  let idempotency: { checkAndLock: jest.Mock };
  let dispatcher: { dispatch: jest.Mock };
  let processing: { processWithResult: jest.Mock };

  beforeEach(async () => {
    idempotency = { checkAndLock: jest.fn() };
    dispatcher = { dispatch: jest.fn() };
    processing = { processWithResult: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: IdempotencyService, useValue: idempotency },
        { provide: DispatcherService, useValue: dispatcher },
        { provide: ProcessingService, useValue: processing },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  it('should process new write webhook', async () => {
    idempotency.checkAndLock.mockResolvedValue(true);
    dispatcher.dispatch.mockResolvedValue(undefined);

    const result = await service.processWebhook({
      eventId: 'e1',
      operation: 'user.create',
      targetSystem: 'zabbix',
      payload: {},
    });

    expect(result).toEqual({ processed: true });
    expect(dispatcher.dispatch).toHaveBeenCalled();
  });

  it('should process new read webhook and return data', async () => {
    idempotency.checkAndLock.mockResolvedValue(true);
    processing.processWithResult.mockResolvedValue({
      success: true,
      data: { id: 'user-1' },
    });

    const result = await service.processWebhook(
      {
        eventId: 'e1',
        operation: 'user.get',
        targetSystem: 'zabbix',
        payload: {},
      },
      true,
    );

    expect(result).toEqual({ processed: true, data: { id: 'user-1' } });
    expect(processing.processWithResult).toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('should ignore duplicate webhook', async () => {
    idempotency.checkAndLock.mockResolvedValue(false);

    const result = await service.processWebhook({
      eventId: 'e1',
      operation: 'user.create',
      targetSystem: 'zabbix',
      payload: {},
    });

    expect(result).toEqual({ processed: false });
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('should propagate dispatch error', async () => {
    idempotency.checkAndLock.mockResolvedValue(true);
    dispatcher.dispatch.mockRejectedValue(new Error('dispatch fail'));

    await expect(
      service.processWebhook({
        eventId: 'e1',
        operation: 'user.create',
        targetSystem: 'zabbix',
        payload: {},
      }),
    ).rejects.toThrow('dispatch fail');
  });
});
