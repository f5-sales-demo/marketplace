import { AsyncLocalStorage } from 'node:async_hooks';

/** Offline clock shifts belong to one observation, never its independent executor. */
export function createIsolatedFixtureClock(original: () => number) {
  const offsets = new AsyncLocalStorage<number>();
  return {
    read: () => original() + (offsets.getStore() ?? 0),
    withOffset: <T>(offset: number, run: () => T): T => offsets.run(offset, run),
  };
}
