import { Test, TestingModule } from '@nestjs/testing';
import { ProcessingService } from './processing.service';
import { ConnectorRegistry } from '../connectors/connector.registry';
import { RetryService } from './retry/retry.service';
import { RetryPolicyService } from './retry/retry-policy.service';
import { DlqService } from './dlq/dlq.service';
import { MetricsService } from '../metrics/metrics.service';

describe('ProcessingService', () => {
  let service: ProcessingService;
  let registry: { get: jest.Mock };
  let retry: { execute: jest.Mock };
  let retryPolicy: { forTarget: jest.Mock };
  let dlq: { add: jest.Mock };
  let metrics: { recordEvent: jest.Mock; recordConnectorError: jest.Mock };

  beforeEach(async () => {
    registry = { get: jest.fn() };
    retry = { execute: jest.fn() };
    retryPolicy = {
      forTarget: jest.fn().mockResolvedValue({
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitter: true,
        dlqLeaseSeconds: 300,
      }),
    };
    dlq = { add: jest.fn() };
    metrics = { recordEvent: jest.fn(), recordConnectorError: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessingService,
        { provide: ConnectorRegistry, useValue: registry },
        { provide: RetryService, useValue: retry },
        { provide: RetryPolicyService, useValue: retryPolicy },
        { provide: DlqService, useValue: dlq },
        { provide: MetricsService, useValue: metrics },
      ],
    }).compile();

    service = module.get<ProcessingService>(ProcessingService);
  });

  it('should process successfully', async () => {
    const connector = {
      execute: jest.fn().mockResolvedValue({ success: true }),
    };
    registry.get.mockReturnValue(connector);
    retry.execute.mockImplementation(async (fn: unknown) =>
      (fn as () => Promise<unknown>)(),
    );

    await service.process({
      eventId: 'e1',
      operation: 'create',
      targetSystem: 'zabbix',
      payload: {},
    });

    expect(retryPolicy.forTarget).toHaveBeenCalledWith('zabbix');
    expect(metrics.recordEvent).toHaveBeenCalledWith('success', 'zabbix');
  });

  it('should throw when connector not found', async () => {
    registry.get.mockReturnValue(undefined);
    await expect(
      service.process({
        eventId: 'e1',
        operation: 'create',
        targetSystem: 'missing',
        payload: {},
      }),
    ).rejects.toThrow('Unsupported target system: missing');
  });

  it('should send to DLQ when retry exhausted', async () => {
    const connector = {
      execute: jest.fn().mockResolvedValue({ success: false, error: 'fail' }),
    };
    registry.get.mockReturnValue(connector);
    retry.execute.mockImplementation(async (fn: unknown) =>
      (fn as () => Promise<unknown>)(),
    );

    await expect(
      service.process({
        eventId: 'e1',
        operation: 'create',
        targetSystem: 'zabbix',
        payload: { data: 1 },
      }),
    ).rejects.toThrow('fail');

    expect(metrics.recordConnectorError).toHaveBeenCalledWith(
      'zabbix',
      'create',
    );
    expect(dlq.add).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'e1',
        targetSystem: 'zabbix',
        error: 'fail',
      }),
    );
  });

  it('should send to DLQ on exception', async () => {
    const connector = {
      execute: jest.fn().mockRejectedValue(new Error('boom')),
    };
    registry.get.mockReturnValue(connector);
    retry.execute.mockImplementation(async (fn: unknown) =>
      (fn as () => Promise<unknown>)(),
    );

    await expect(
      service.process({
        eventId: 'e1',
        operation: 'create',
        targetSystem: 'zabbix',
        payload: {},
      }),
    ).rejects.toThrow('boom');

    expect(metrics.recordEvent).toHaveBeenCalledWith('failed', 'zabbix');
    expect(dlq.add).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'e1',
        error: 'boom',
        retryCount: 3,
      }),
    );
  });

  it('should return connector data for read processing', async () => {
    const connector = {
      execute: jest.fn().mockResolvedValue({
        success: true,
        data: { id: 'user-1', username: 'jdoe' },
      }),
    };
    registry.get.mockReturnValue(connector);

    const result = await service.processWithResult({
      eventId: 'e-read-1',
      operation: 'user.get',
      targetSystem: 'fake',
      payload: { params: { id: 'user-1' } },
    });

    expect(result).toEqual({
      success: true,
      data: { id: 'user-1', username: 'jdoe' },
    });
    expect(metrics.recordEvent).toHaveBeenCalledWith('success', 'fake');
    expect(dlq.add).not.toHaveBeenCalled();
  });
});
