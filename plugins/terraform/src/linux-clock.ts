import { dlopen, FFIType, ptr } from 'bun:ffi';

let sample: (() => number) | undefined;
/** Linux CLOCK_MONOTONIC, shared with the original Python/controller budget. */
export function linuxMonotonicMs(): number {
  if (process.platform !== 'linux') throw new Error('Original Linux monotonic clock is unavailable');
  if (!sample) {
    const libc = dlopen('libc.so.6', {
      clock_gettime: { args: [FFIType.i32, FFIType.ptr], returns: FFIType.i32 },
    });
    const value = new BigInt64Array(2);
    sample = () => {
      if (
        libc.symbols.clock_gettime(1, ptr(value)) !== 0 ||
        value[0] < 0n ||
        value[1] < 0n ||
        value[1] >= 1_000_000_000n
      )
        throw new Error('Original Linux monotonic clock capture failed');
      const result = value[0] * 1000n + value[1] / 1_000_000n;
      if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Original monotonic clock exceeds safe bound');
      return Number(result);
    };
  }
  return sample();
}
