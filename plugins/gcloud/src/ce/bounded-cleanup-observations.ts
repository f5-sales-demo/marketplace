/** Only compiled native producers issue read concurrency. Tool arguments,
 * receipts and copied API payloads cannot manufacture this capability. */
const readConcurrency = new WeakMap<object, 1 | 3>();
export function bindCleanupObservationConcurrency<T extends object>(api: T, concurrency: 1 | 3): T {
  if (concurrency !== 1 && concurrency !== 3) throw new Error('Qualified cleanup read concurrency required');
  readConcurrency.set(api, concurrency);
  return api;
}
export function readCleanupObservationConcurrency(api: unknown): 1 | 3 {
  return api !== null && (typeof api === 'object' || typeof api === 'function') ? (readConcurrency.get(api) ?? 1) : 1;
}
/** Preserve order and drain each started batch before any refusal. The original
 * caller signal controls every batch; no deadline or authorization is issued. */
export async function mapCleanupObservations<T, R>(
  values: readonly T[],
  observe: (value: T, index: number) => Promise<R>,
  signal?: AbortSignal,
  concurrency: 1 | 3 = 1,
): Promise<R[]> {
  if (concurrency !== 1 && concurrency !== 3) throw new Error('Qualified cleanup read concurrency required');
  const original = [...values];
  const result: R[] = [];
  signal?.throwIfAborted();
  for (let offset = 0; offset < original.length; offset += concurrency) {
    signal?.throwIfAborted();
    const batch = original.slice(offset, offset + concurrency);
    const settled = await Promise.allSettled(
      batch.map((value, index) => Promise.resolve().then(() => observe(value, offset + index))),
    );
    for (const row of settled) if (row.status === 'rejected') throw row.reason;
    signal?.throwIfAborted();
    for (const row of settled) if (row.status === 'fulfilled') result.push(row.value);
  }
  signal?.throwIfAborted();
  return result;
}
