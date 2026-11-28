/** Share only a pending scan of the same source-owned original input set.
 * Full byte admission and identity checks have separate slots. No completed
 * result is cached; every caller retains availability checks and first refusal. */
export function sharePendingOriginalVerification(
  verify: (verifyBytes: boolean) => Promise<void>,
  assertAvailable: () => void,
): (verifyBytes?: boolean) => Promise<void> {
  if (typeof verify !== 'function' || typeof assertAvailable !== 'function')
    throw new Error('Original verification and availability guards required');
  const slots: { full?: Promise<void>; identity?: Promise<void> } = {};
  let refused = false;
  let refusal: unknown;
  const latch = (error: unknown) => {
    if (!refused) {
      refused = true;
      refusal = error;
    }
    return refusal;
  };
  const check = () => {
    if (refused) throw refusal;
    try {
      assertAvailable();
    } catch (error) {
      throw latch(error);
    }
  };
  return async (verifyBytes = true) => {
    if (typeof verifyBytes !== 'boolean') throw new Error('Original verification mode required');
    check();
    const mode = verifyBytes ? 'full' : 'identity';
    let pending = slots[mode];
    if (!pending) {
      pending = Promise.resolve()
        .then(async () => {
          check();
          await verify(verifyBytes);
          check();
        })
        .catch((error) => {
          throw latch(error);
        });
      slots[mode] = pending;
      const current = pending;
      const clear = () => {
        if (slots[mode] === current) delete slots[mode];
      };
      void pending.then(clear, clear);
    }
    await pending;
    check();
  };
}
