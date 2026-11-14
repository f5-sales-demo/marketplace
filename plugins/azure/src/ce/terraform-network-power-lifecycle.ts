import { join } from 'node:path';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';

export type AzureTerraformPowerSettlement = {
  mutationSettlements: Array<'fulfilled' | 'rejected'>;
  locksReleased: boolean;
  failures: string[];
};
export class AzureTerraformPowerLifecycleInterrupted extends Error {
  constructor(readonly completion: Promise<AzureTerraformPowerSettlement>) {
    super('Azure Terraform network power lifecycle: interrupted mutation retains owning locks until settlement');
  }
}
export type AzureTerraformPowerStep = <T>(action: () => Promise<T>, mutation?: boolean) => Promise<T>;

/** Acquire driver before power when owning that lock; serial callers already own the driver.
 * Abort observations promptly, but retain locks until every ignored mutation actually settles.
 */
export async function withAzureTerraformPowerLifecycle<T>(
  directory: string,
  deadline: AbortSignal,
  seal: () => void,
  run: (step: AzureTerraformPowerStep) => Promise<T>,
  options: {
    lockDriver?: boolean;
    beforeLock?: (step: AzureTerraformPowerStep) => Promise<unknown>;
    interrupted?: (completion: Promise<AzureTerraformPowerSettlement>) => Error;
    releaseFailure?: () => never;
  } = {},
): Promise<T> {
  const pending = new Set<Promise<unknown>>();
  const step: AzureTerraformPowerStep = async (action, mutation = false) => {
    deadline.throwIfAborted();
    seal();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const promise = action();
      if (mutation) {
        pending.add(promise);
        void promise.then(
          () => pending.delete(promise),
          () => pending.delete(promise),
        );
      }
      const result = await Promise.race([promise, aborted.promise]);
      deadline.throwIfAborted();
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  deadline.throwIfAborted();
  seal();
  await options.beforeLock?.(step);
  let unlockDriver: (() => Promise<void>) | undefined,
    unlockPower: (() => Promise<void>) | undefined,
    deferredRelease = false;
  const releaseLocks = async () => {
    const failures: string[] = [];
    if (unlockPower) {
      try {
        await unlockPower();
      } catch {
        failures.push('power-lock-release-failed');
      }
    }
    if (unlockDriver) {
      try {
        await unlockDriver();
      } catch {
        failures.push('driver-lock-release-failed');
      }
    }
    return { locksReleased: failures.length === 0, failures };
  };
  const failRelease = (): never => {
    if (options.releaseFailure) return options.releaseFailure();
    throw Error('Azure Terraform network power lifecycle: owning locks could not be released');
  };
  try {
    if (options.lockDriver !== false)
      unlockDriver = await acquireProcessLock(join(directory, '.terraform-network-driver-lock'));
    deadline.throwIfAborted();
    seal();
    unlockPower = await acquireProcessLock(join(directory, '.terraform-network-power-lock'));
    deadline.throwIfAborted();
    seal();
    const value = await run(step);
    deadline.throwIfAborted();
    seal();
    return value;
  } catch (error) {
    if (pending.size) {
      deferredRelease = true;
      const completion = Promise.allSettled([...pending]).then(async (results) => ({
        mutationSettlements: results.map((result) => result.status),
        ...(await releaseLocks()),
      }));
      throw options.interrupted?.(completion) ?? new AzureTerraformPowerLifecycleInterrupted(completion);
    }
    throw error;
  } finally {
    if (!deferredRelease && !(await releaseLocks()).locksReleased) failRelease();
  }
}
