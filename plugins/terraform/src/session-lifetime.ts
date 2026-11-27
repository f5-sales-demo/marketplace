import type { TerraformSession } from './service';

/** Retain both an operation failure and its independently detected final-check failure. */
export async function withFinalCheck<T>(
  operation: () => Promise<T>,
  finalCheck: () => Promise<void>,
  combinedFailureMessage: string,
): Promise<T> {
  const outcome = await (async () => {
    try {
      return { succeeded: true as const, value: await operation() };
    } catch (error) {
      return { succeeded: false as const, error };
    }
  })();
  try {
    await finalCheck();
  } catch (failure) {
    if (!outcome.succeeded) throw new AggregateError([outcome.error, failure], combinedFailureMessage);
    throw failure;
  }
  if (!outcome.succeeded) throw outcome.error;
  return outcome.value;
}

/** Retire a completed session on every outcome; failed closure cannot report apparent success. */
export function withTerraformSession<T>(
  session: Pick<TerraformSession, 'closeGoogleAdc'>,
  operation: () => Promise<T>,
): Promise<T> {
  return withFinalCheck(
    operation,
    async () => {
      await session.closeGoogleAdc?.();
    },
    'Original Terraform operation and ADC closure failed',
  );
}
