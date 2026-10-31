import { fingerprint } from './discovery';
import type { GcpTerraformTeardownRuntime } from './terraform-teardown';
import type { GcpCeIntent } from './types';

/** Bind the actual API destination while allowing credential rotation at that destination. */
export function publicTerraformContextHash(intent: GcpCeIntent, apiUrl: string | undefined) {
  if (!apiUrl) throw new Error('Scoped Terraform context endpoint unavailable');
  const base = new URL(apiUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash)
    throw new Error('Scoped Terraform context endpoint differs');
  return fingerprint({ platformContext: intent.platformContext, apiUrl: base.href });
}

export async function assertPublicTerraformContext(runtime: GcpTerraformTeardownRuntime, intent: GcpCeIntent) {
  const saved = (await runtime.store.read('gcp-tf-public-platform-context.json')) as {
    schemaVersion: number;
    contextHash: string;
  };
  if (
    saved.schemaVersion !== 1 ||
    saved.contextHash !== publicTerraformContextHash(intent, runtime.environment.XCSH_API_URL)
  )
    throw new Error('Original public Terraform context endpoint changed');
  return saved.contextHash;
}
