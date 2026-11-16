import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runPeriodically } from './run-periodically.js';

describe('runPeriodically', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs the task at once, then every interval until stopped', async () => {
    const task = vi.fn(async () => {});
    const stop = runPeriodically(task, 1000, () => {});

    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2500);
    expect(task).toHaveBeenCalledTimes(3);

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('reports a failure and keeps running', async () => {
    const failure = new Error('database locked');
    const task = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const onError = vi.fn();
    const stop = runPeriodically(task, 1000, onError);

    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(task).toHaveBeenCalledTimes(2);
    stop();
  });
});
