import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const XCSH_PROVIDER_VERSION = '15.12.1';
export const XCSH_PROVIDER_LOCK_SHA256 = '6d9fd709ee430d66bfa6de99dbbbafca2801eb8471201e6c282102fb3bd1a782';

/** Load the immutable XC provider lock shared by cloud-specific lifecycle translators. */
export async function loadXcshProviderLock(): Promise<string> {
  const value = await readFile(new URL('../locks/xcsh-provider.hcl', import.meta.url), 'utf8');
  if (createHash('sha256').update(value).digest('hex') !== XCSH_PROVIDER_LOCK_SHA256)
    throw new Error('Published XC provider lock changed');
  return value;
}
