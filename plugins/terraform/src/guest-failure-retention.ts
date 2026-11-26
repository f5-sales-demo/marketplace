import { isOriginalApplyLifetimeEnd, type OriginalApplyCallbackContext } from './installed-apply-controller';

/** Failure bookkeeping only. Fresh after sources and original leases must still
 * be verified by the installed binder before any transfer or final command. */
export function createOriginalGuestFailureRetention() {
  let failed = false,
    permanentFailure = false,
    lifetimeFailures = 0;
  const refusals = new WeakSet<object>();
  const refuse = (): never => {
    const error = new Error('Original guest binding source refused; failure retained');
    refusals.add(error);
    throw error;
  };
  return Object.freeze({
    record(error: unknown, callback: OriginalApplyCallbackContext) {
      // Repeated refusal cannot turn an already retained temporal end into a
      // new integrity failure. Copied or caller-forged errors remain permanent.
      if (error && typeof error === 'object' && refusals.has(error)) return;
      failed = true;
      if (isOriginalApplyLifetimeEnd(error, callback)) lifetimeFailures++;
      else permanentFailure = true;
    },
    assertUsable() {
      if (failed) refuse();
    },
    assertUsableForTransfer() {
      if (permanentFailure) refuse();
    },
    evidence: () => Object.freeze({ failed, permanentFailure, lifetimeFailures }),
  });
}
