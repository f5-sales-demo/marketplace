import { readdir } from 'node:fs/promises';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

/** Read historical enrollment identities from the owning private token registry.
 * This joins private records only; it establishes neither current tokens nor CE freshness.
 * JWT material remains private and is never returned to the caller. */
export async function collectAzureHistoricalEnrollmentTokens(
  request: AzureCePlan,
  storage: Pick<CeDeploymentStore, 'verify' | 'read' | 'owner' | 'directory'>,
  signal?: AbortSignal,
): Promise<Array<{ node: string; name: string }>> {
  signal?.throwIfAborted();
  const plan = structuredClone(request),
    binding = azureUpgradeBinding(plan),
    owner = canonicalSha256(storage.owner),
    directory = storage.directory,
    verify = storage.verify,
    read = storage.read;
  verifyAzureCePlan(plan);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    if (
      canonicalSha256(request) !== canonicalSha256(plan) ||
      canonicalSha256(storage.owner) !== owner ||
      owner !== canonicalSha256(binding.owner) ||
      storage.directory !== directory ||
      storage.verify !== verify ||
      storage.read !== read
    )
      throw Error('Azure historical enrollment owning context differs');
  };
  const bounded = async <T>(work: () => Promise<T>): Promise<T> => {
    seal();
    const canceled = Promise.withResolvers<never>(),
      onAbort = () => canceled.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      deadline.throwIfAborted();
      const result = await Promise.race([work(), canceled.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  seal();
  await bounded(() => verify.call(storage));
  seal();
  const initial = await bounded(() => readdir(directory, { withFileTypes: true })),
    names = initial.map((entry) => entry.name).sort(),
    records = new Map<string, string>(),
    tokens: Array<{ node: string; name: string }> = [];
  for (const [index, node] of binding.nodes.entries()) {
    const prefixes = [
      `${plan.deploymentName.slice(0, 40)}-${index + 1}-`,
      `${plan.siteName.slice(0, 36)}-${index + 1}-r-`,
    ];
    for (const entry of initial) {
      const prefix = prefixes.find((value) => entry.name.startsWith(value));
      if (!prefix || !/^[a-f0-9]{12}\.json$/.test(entry.name.slice(prefix.length))) continue;
      seal();
      if (!entry.isFile()) throw Error('Azure historical enrollment artifact is not a regular file');
      const raw = await bounded(() => read.call(storage, entry.name));
      seal();
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw Error('Azure historical enrollment record is malformed');
      const value = raw as Record<string, unknown>;
      if (
        Object.keys(value).sort().join(',') !== 'jwt,node,siteName,tokenName' ||
        value.tokenName !== entry.name.slice(0, -5) ||
        value.siteName !== binding.siteName ||
        value.node !== node ||
        typeof value.jwt !== 'string' ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.jwt) ||
        records.has(entry.name)
      )
        throw Error('Azure historical enrollment identity or schema differs');
      records.set(entry.name, canonicalSha256(raw));
      tokens.push({ node, name: String(value.tokenName) });
    }
  }
  seal();
  if (canonicalSha256((await bounded(() => readdir(directory))).sort()) !== canonicalSha256(names))
    throw Error('Azure historical enrollment namespace changed');
  for (const [name, digest] of records) {
    if (canonicalSha256(await bounded(() => read.call(storage, name))) !== digest)
      throw Error('Azure historical enrollment record changed');
    seal();
  }
  await bounded(() => verify.call(storage));
  seal();
  if (canonicalSha256((await bounded(() => readdir(directory))).sort()) !== canonicalSha256(names))
    throw Error('Azure historical enrollment namespace changed');
  seal();
  return tokens.sort((a, b) => a.name.localeCompare(b.name));
}
