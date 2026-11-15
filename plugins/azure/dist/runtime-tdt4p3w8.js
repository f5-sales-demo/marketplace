// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
// plugins/azure/src/ce/execution.ts
function withAzureCeExecution(api, cancellation, timeoutMs = 2 * 60 * 60000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2 * 60 * 60000)
    throw new Error('Invalid Azure CE execution deadline');
  const deadline = AbortSignal.timeout(timeoutMs);
  const operation = cancellation ? AbortSignal.any([cancellation, deadline]) : deadline;
  const assertLive = (signal) => {
    if (signal.aborted)
      throw new Error(deadline.aborted ? 'Azure CE execution deadline exceeded' : 'Azure CE execution cancelled');
  };
  return {
    async exec(command, args, options) {
      const signal = options?.signal ? AbortSignal.any([operation, options.signal]) : operation;
      assertLive(signal);
      try {
        const result = await api.exec(command, args, { ...options, signal });
        if (result.exitCode !== 0) assertLive(signal);
        return result;
      } catch (error) {
        assertLive(signal);
        throw error;
      }
    },
  };
}

export { withAzureCeExecution };
