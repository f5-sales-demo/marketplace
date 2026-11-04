import { isAbsolute, resolve } from 'node:path';
import { googleCredentialAlternatives } from '../../../terraform/src/google-adc-session';
import type { TerraformSession } from '../../../terraform/src/service';
import type { GcloudExecApi } from '../gcloud/exec';
import type { GcpCeIntent } from './types';

/** Server-owned credentials only; an explicitly selected ADC policy never falls back. */
export async function googleTerraformEnvironment(
  session: TerraformSession,
  api: GcloudExecApi,
  intent: Pick<GcpCeIntent, 'engine' | 'project'>,
  ambient: Record<string, string | undefined>,
  signal?: AbortSignal,
): Promise<Record<string, string | undefined>> {
  if (intent.engine !== 'terraform') throw new Error('Explicit Terraform owning engine required');
  signal?.throwIfAborted();
  if (session.googleAdcEnvironment) {
    const snapshot = await session.googleAdcEnvironment();
    signal?.throwIfAborted();
    if (
      !snapshot ||
      Object.keys(snapshot).join(',') !== 'GOOGLE_APPLICATION_CREDENTIALS' ||
      typeof snapshot.GOOGLE_APPLICATION_CREDENTIALS !== 'string' ||
      !isAbsolute(snapshot.GOOGLE_APPLICATION_CREDENTIALS) ||
      resolve(snapshot.GOOGLE_APPLICATION_CREDENTIALS) !== snapshot.GOOGLE_APPLICATION_CREDENTIALS
    )
      throw new Error('Trusted original Google ADC environment unavailable');
    const environment = { ...ambient };
    for (const key of [...googleCredentialAlternatives, 'GOOGLE_APPLICATION_CREDENTIALS']) delete environment[key];
    return { ...environment, ...snapshot };
  }
  // Existing installed sessions retain their original credential path and cleanup.
  const access = await api.exec('gcloud', ['auth', 'print-access-token', `--project=${intent.project}`, '--quiet'], {
    signal,
  });
  if (access.exitCode !== 0 || !access.stdout.trim() || /\s/.test(access.stdout.trim()))
    throw new Error('Scoped Terraform Google authentication unavailable');
  return { ...ambient, GOOGLE_OAUTH_ACCESS_TOKEN: access.stdout.trim() };
}
