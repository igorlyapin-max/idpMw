import { RetryService } from './retry.service';

describe('RetryService', () => {
  let service: RetryService;

  beforeEach(() => {
    service = new RetryService();
  });

  it('should succeed on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await service.execute(fn, {
      maxRetries: 2,
      baseDelayMs: 10,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry and eventually succeed', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');
    const result = await service.execute(fn, {
      maxRetries: 2,
      baseDelayMs: 10,
      jitter: false,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    await expect(
      service.execute(fn, { maxRetries: 1, baseDelayMs: 10, jitter: false }),
    ).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
