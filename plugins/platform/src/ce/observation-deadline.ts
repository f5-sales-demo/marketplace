/** Bound an observational read even when its transport ignores the supplied abort signal.
 * The underlying request retains its own signal; late fulfillment cannot publish an accepted result.
 */
export async function readCeObservation<T>(signal: AbortSignal, read: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  const cancelled = Promise.withResolvers<never>();
  const onAbort = () => cancelled.reject(signal.reason);
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    const value = await Promise.race([read(), cancelled.promise]);
    signal.throwIfAborted();
    return value;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
