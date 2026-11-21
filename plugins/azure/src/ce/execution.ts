import type { AzExecApi } from '../az/exec';

/** One deadline spans discovery, ownership checks, mutations, and convergence. */
export function withAzureCeExecution(
  api: AzExecApi,
  cancellation?: AbortSignal,
  timeoutMs = 2 * 60 * 60_000,
): AzExecApi {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2 * 60 * 60_000)
    throw new Error('Invalid Azure CE execution deadline');
  const deadline = AbortSignal.timeout(timeoutMs);
  const operation = cancellation ? AbortSignal.any([cancellation, deadline]) : deadline;
  const assertLive = (signal: AbortSignal) => {
    if (signal.aborted)
      throw new Error(deadline.aborted ? 'Azure CE execution deadline exceeded' : 'Azure CE execution cancelled');
  };
  return {
    async exec(command, args, options) {
      const signal = options?.signal ? AbortSignal.any([operation, options.signal]) : operation;
      assertLive(signal);
      try {
        const result = await api.exec(command, args, { ...options, signal });
        // Preserve successful mutation responses for checkpointing. The next command
        // rejects cancellation before it can spawn; interrupted commands fail here.
        if (result.exitCode !== 0) assertLive(signal);
        return result;
      } catch (error) {
        assertLive(signal);
        throw error;
      }
    },
  };
}
