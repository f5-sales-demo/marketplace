import { createHash } from 'node:crypto';
import { bindAwsCloudInit } from '../../../platform/src/ce/bootstrap';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const digest = (v: string) => createHash('sha256').update(v).digest('hex');
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
function require(v: unknown, message: string): asserts v {
  if (!v) throw Error(`Azure Terraform network replacement enrollment: ${message}`);
}
/** Private current enrollment gate for an unsubmitted mutation. Saved material remains immutable;
 * an unavailable/expired current token yields pending, and no token is created or silently renewed. */
export async function observeAzureTerraformNetworkReplacementEnrollment(
  request: AzureCePlan,
  bootstrap: string,
  expectedBootstrapSha256: string,
  store: CeDeploymentStore,
  runtime: Pick<CeRuntime, 'engine' | 'observeIssuedBootstrapToken'>,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const plan = structuredClone(request),
    owner = structuredClone(store.owner);
  verifyAzureCePlan(plan);
  verifyAzureTerraformNetworkReplacementProfile(plan);
  const binding = azureUpgradeBinding(plan),
    node = `${plan.deploymentName}-${plan.intent.replacementNode}`,
    tokenName = `${plan.deploymentName.slice(0, 40)}-${plan.intent.replacementNode}-${plan.planSha256.slice(0, 12)}`;
  require(runtime.engine === 'terraform' &&
    same(owner, binding.owner) &&
    /^[a-f0-9]{64}$/.test(expectedBootstrapSha256) &&
    digest(bootstrap) === expectedBootstrapSha256, 'resolved owning bootstrap and engine required');
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bounded = async <T>(task: () => Promise<T>): Promise<T> => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const verify = async () => {
    require(same(plan, request) &&
      same(owner, store.owner) &&
      runtime.engine === 'terraform', 'owning enrollment context changed');
    await bounded(() => store.verify());
    require(same(plan, request) && same(owner, store.owner), 'owning enrollment context changed');
  };
  await verify();
  let raw: unknown;
  try {
    raw = await bounded(() => store.read(`${tokenName}.json`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await verify();
      return undefined;
    }
    throw error;
  }
  require(raw && typeof raw === 'object' && !Array.isArray(raw), 'complete owning private token required');
  const token = raw as { tokenName: string; node: string; siteName: string; jwt: string };
  require(Object.keys(token).sort().join(',') === 'jwt,node,siteName,tokenName' &&
    token.tokenName === tokenName &&
    token.node === node &&
    token.siteName === plan.siteName &&
    typeof token.jwt === 'string', 'owning private token identity differs');
  require(bindAwsCloudInit({ cloud_init_config: bootstrap }, token.jwt) ===
    bootstrap, 'private JWT differs from frozen compiled bootstrap');
  const privateTokenSha256 = canonicalSha256(token),
    tokenSha256 = digest(token.jwt);
  let witness: Awaited<ReturnType<CeRuntime['observeIssuedBootstrapToken']>> | undefined;
  try {
    const current = await bounded(() =>
      runtime.observeIssuedBootstrapToken(binding, node, tokenName, tokenSha256, deadline),
    );
    require(current &&
      Object.keys(current).sort().join(',') ===
        'expiresAt,kind,node,owner,schemaVersion,siteName,tokenName,tokenSha256' &&
      current.schemaVersion === 1 &&
      current.kind === 'ce-issued-bootstrap-current' &&
      same(current.owner, owner) &&
      current.node === node &&
      current.tokenName === tokenName &&
      current.siteName === plan.siteName &&
      current.tokenSha256 === tokenSha256 &&
      Number.isFinite(current.expiresAt) &&
      current.expiresAt > Date.now() + 60000, 'complete current enrollment witness required');
    witness = structuredClone(current);
  } catch {
    deadline.throwIfAborted();
  }
  // Mutable private material and context are sealed outside the API-unavailability catch.
  await verify();
  require(canonicalSha256(await bounded(() => store.read(`${tokenName}.json`))) ===
    privateTokenSha256, 'private token changed during current observation');
  require(same(plan, request) &&
    same(owner, store.owner) &&
    runtime.engine === 'terraform', 'owning enrollment context changed');
  deadline.throwIfAborted();
  if (!witness || witness.expiresAt <= Date.now() + 60000) return undefined;
  return {
    schemaVersion: 1 as const,
    kind: 'azure-terraform-network-replacement-current-enrollment' as const,
    planSha256: plan.planSha256,
    bootstrapSha256: expectedBootstrapSha256,
    privateTokenSha256,
    witness,
  };
}
