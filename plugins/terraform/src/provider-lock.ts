import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const XCSH_PROVIDER_VERSION = '8.0.0';
export const XCSH_PROVIDER_LOCK_SHA256 = 'a9ccc898377e32d9e7193a1fbc1c2bcedda88eaabf80633ae5f86a1456ad76d1';

/** Load the immutable XC provider lock shared by cloud-specific lifecycle translators. */
export async function loadXcshProviderLock(): Promise<string> {
  const value = await readFile(new URL('../locks/xcsh-provider.hcl', import.meta.url), 'utf8');
  if (createHash('sha256').update(value).digest('hex') !== XCSH_PROVIDER_LOCK_SHA256)
    throw new Error('Published XC provider lock changed');
  return value;
}
