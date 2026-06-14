// Shared shape for background workers: a `tick` (one iteration, also the unit of
// test) plus start/stop around a setInterval. Tick errors are logged, never throw
// out of the timer.

export interface Worker {
  tick(): Promise<void>;
  start(): void;
  stop(): void;
}

export function intervalWorker(
  name: string,
  tick: () => Promise<void>,
  intervalMs: number,
): Worker {
  let timer: ReturnType<typeof setInterval> | null = null;
  const safeTick = async () => {
    try {
      await tick();
    } catch (err) {
      console.error(`[worker:${name}] tick failed`, err);
    }
  };
  return {
    tick: safeTick,
    start() {
      if (timer) return;
      timer = setInterval(() => void safeTick(), intervalMs);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
