/**
 * Runs `task` now and then every `intervalMs`, reporting failures to `onError` without stopping.
 * The timer does not keep the process alive. Returns a function that stops it.
 */
export const runPeriodically = (
  task: () => Promise<unknown>,
  intervalMs: number,
  onError: (error: unknown) => void,
): (() => void) => {
  const run = () => void task().catch(onError);
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
};
