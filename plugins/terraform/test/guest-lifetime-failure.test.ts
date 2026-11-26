/** Actual original native apply/callback issuers with offline cloud responses.
 * Failure retention is consistency only, never guest or live acceptance. */
import { expect, test } from 'bun:test';
import * as callbacks from '../src/installed-apply-controller';
import { withApplyInventory } from './fixtures/original-apply-inventory.fixture';

test('an in-flight before check retains retirement while a fresh final transfer remains possible', async () => {
  let before: callbacks.OriginalApplyCallbackContext | undefined;
  let release: (() => void) | undefined;
  let pending: Promise<unknown> | undefined;
  await withApplyInventory(
    async (input) => {
      before = input.before;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      pending = (async () => {
        await gate;
        try {
          await callbacks.assertOriginalApplyLifetime(input.before);
          throw new Error('Retired before source unexpectedly accepted');
        } catch (error) {
          return error;
        }
      })();
    },
    true,
    async ({ final }) => {
      if (!before || !release || !pending) throw new Error('Original in-flight before source required');
      release();
      const error = await pending;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe('OriginalApplyBeforeRetiredError');
      expect(callbacks.isOriginalApplyLifetimeEnd(error, before)).toBe(true);
      expect(callbacks.isOriginalApplyLifetimeEnd(error, { ...before })).toBe(false);
      expect(callbacks.isOriginalApplyLifetimeEnd(error, final)).toBe(false);
      expect(callbacks.isOriginalApplyLifetimeEnd(new Error((error as Error).message), before)).toBe(false);
      await callbacks.assertOriginalApplyCallback(final);
      const { createOriginalGuestFailureRetention } = await import('../src/guest-failure-retention');
      const retained = createOriginalGuestFailureRetention();
      retained.record(error, before);
      expect(retained.evidence()).toEqual({ failed: true, permanentFailure: false, lifetimeFailures: 1 });
      expect(() => retained.assertUsable()).toThrow('retained');
      for (let index = 0; index < 3; index++) {
        try {
          retained.assertUsable();
        } catch (refusal) {
          retained.record(refusal, before);
        }
      }
      expect(retained.evidence().permanentFailure).toBe(false);
      expect(() => retained.assertUsableForTransfer()).not.toThrow();
      // Successful final validation does not erase the original failure receipt.
      await callbacks.assertOriginalApplyCallback(final);
      expect(retained.evidence().failed).toBe(true);
      const forged = createOriginalGuestFailureRetention();
      forged.record(Object.assign(new Error('Original operation retired'), { name: (error as Error).name }), before);
      expect(() => forged.assertUsableForTransfer()).toThrow('retained');
      const copied = createOriginalGuestFailureRetention();
      copied.record(error, { ...before });
      expect(copied.evidence().permanentFailure).toBe(true);
      // A subsequent integrity failure cannot be concealed by temporal failure.
      retained.record(new Error('Original key identity changed'), before);
      expect(retained.evidence()).toEqual({ failed: true, permanentFailure: true, lifetimeFailures: 1 });
      expect(() => retained.assertUsableForTransfer()).toThrow('retained');
      retained.record(error, before);
      expect(retained.evidence().permanentFailure).toBe(true);
    },
  );
}, 120000);
