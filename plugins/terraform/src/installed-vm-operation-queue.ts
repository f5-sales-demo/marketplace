import { assertOriginalApplyCallback } from './installed-apply-controller';
import type { openInstalledVmCapture } from './installed-vm-capture';
import { linuxMonotonicMs } from './linux-clock';

import { inspectFinalReaderReserve } from './reader-final-reserve';

/** Queue scheduling only. The factory supplies timing from its source-issued
 * reserve; this helper cannot issue or renew capture authority. */
export async function drainInstalledVmCaptureQueue(pending: Promise<void>, deadline: number): Promise<void> {
  if (!Number.isSafeInteger(deadline) || deadline <= linuxMonotonicMs())
    throw new Error('Original VM queue final deadline exhausted or invalid');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Original VM queue remains unresolved in final reserve')),
          Math.max(0, deadline - linuxMonotonicMs()),
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

type Stage = Awaited<ReturnType<typeof openInstalledVmCapture>>;
/** Factory-only ordering over the same actual source object. No source proof,
 * clock, target, transport or failure flag is replaced by this adapter. */
export function serializeInstalledVmCapture(stage: Stage): Stage {
  let tail: Promise<void> = Promise.resolve();
  let sealed = false;
  let final: ReturnType<Stage['finalCapture']> | undefined;
  const enqueue = <T>(operation: () => Promise<T>, after = false): Promise<T> => {
    if (sealed && !after) return Promise.reject(new Error('Original VM queue before lifetime retired'));
    const pending = tail.then(operation);
    tail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  };
  return Object.freeze({
    ...stage,
    admitCe: (...args: Parameters<Stage['admitCe']>) => enqueue(() => stage.admitCe(...args)),
    admitObserver: (...args: Parameters<Stage['admitObserver']>) => enqueue(() => stage.admitObserver(...args)),
    reconcile: (...args: Parameters<Stage['reconcile']>) => enqueue(() => stage.reconcile(...args)),
    captureSerial: (...args: Parameters<Stage['captureSerial']>) => enqueue(() => stage.captureSerial(...args)),
    readSerialPacket: (...args: Parameters<Stage['readSerialPacket']>) =>
      enqueue(() => stage.readSerialPacket(...args), args[1].phase === 'after'),
    async finalCapture(callback, reader) {
      await stage.assertFinalAdmission(callback, reader);
      if (sealed) return Promise.reject(new Error('Original VM queue final capture already claimed'));
      const reserve = callback.reserve;
      if (!reserve) throw new Error('Original VM queue final reserve required');
      sealed = true;
      const pending = tail;
      final = (async () => {
        await assertOriginalApplyCallback(callback);
        if (callback.phase !== 'after' || !callback.reserve)
          throw new Error('Original VM queue final reserve required');
        await drainInstalledVmCaptureQueue(pending, inspectFinalReaderReserve(reserve).finalDeadlineMs);
        await assertOriginalApplyCallback(callback);
        return stage.finalCapture(callback, reader);
      })();
      tail = final.then(
        () => undefined,
        () => undefined,
      );
      return final;
    },
  });
}
