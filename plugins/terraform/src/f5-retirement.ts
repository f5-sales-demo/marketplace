import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../platform/src/ce/process-lock';
import type { CeOwner } from '../../platform/src/ce/runtime';
import type { CePlatformService } from '../../platform/src/ce/service';
import { loadXcshProviderLock, XCSH_PROVIDER_VERSION } from './provider-lock';
import type { PlanReceipt } from './runner';
import type { CeTerraformService } from './service';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Malformed F5 stage retirement evidence');
  return value as Record<string, unknown>;
};
const sameOwner = (value: unknown, owner: CeOwner) => {
  const candidate = object(value);
  return ['deploymentId', 'engine', 'provider', 'account', 'region'].every(
    (key) => candidate[key] === owner[key as keyof CeOwner],
  );
};
async function optional(store: CeDeploymentStore, name: string) {
  try {
    return await store.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
export async function requireF5StageActive(store: CeDeploymentStore) {
  if ((await optional(store, 'terraform-f5-stage-retirement.json')) !== undefined)
    throw Error('F5 stage retirement has started; resource execution is prohibited');
}
/** Exact existing F5 stage template. No provider execution or credentials are acquired here. */
export async function f5StageDeployment(owner: CeOwner) {
  return {
    schemaVersion: 1 as const,
    deploymentId: owner.deploymentId,
    stage: 'f5-resources',
    engine: 'terraform' as const,
    scope: { cloud: owner.provider, account: owner.account, region: owner.region },
    terraformVersion: '1.16.5',
    configuration: JSON.stringify({
      terraform: {
        required_version: '= 1.16.5',
        required_providers: { xcsh: { source: 'f5-sales-demo/xcsh', version: `= ${XCSH_PROVIDER_VERSION}` } },
      },
      provider: { xcsh: {} },
    }),
    providerLock: await loadXcshProviderLock(),
    backendIdentity: `local:${owner.deploymentId}:stage:f5-resources`,
  };
}
/** Internal stage cleanup. Caller must separately qualify complete live cloud/F5 absence and bind its digest. */
export async function retireF5TerraformStage(
  platform: CePlatformService,
  terraform: CeTerraformService,
  owner: CeOwner,
  sourcePlanSha256: string,
  evidenceSha256: string,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  owner = structuredClone(owner);
  env = { ...env };
  signal?.throwIfAborted();
  if (owner.engine !== 'terraform' || !sha(sourcePlanSha256) || !sha(evidenceSha256))
    throw Error('F5 stage retirement binding is unresolved');
  const store = await platform.storage(owner);
  const release = await acquireProcessLock(join(store.directory, '.f5-resource-lock'));
  try {
    const deployment = await f5StageDeployment(owner);
    const validate = async () => {
      signal?.throwIfAborted();
      await store.verify();
      const auth = object(await store.read('terraform-authorization.json'));
      if (
        auth.schemaVersion !== 1 ||
        auth.engine !== 'terraform' ||
        auth.mutations !== true ||
        auth.f5StateOwner !== 'terraform' ||
        auth.planSha256 !== sourcePlanSha256
      )
        throw Error('F5 stage retirement authorization differs');
      if ((await optional(store, 'terraform-f5-cancellation-pending.json')) !== undefined)
        throw Error('F5 cancellation must finish before retirement');
      const book = object(await store.read('terraform-f5-resources.json'));
      if (
        book.schemaVersion !== 1 ||
        !sameOwner(book.owner, owner) ||
        Object.keys(object(book.resources)).length ||
        book.pending !== undefined ||
        book.configurationSha256 !== hash(deployment.configuration)
      )
        throw Error('F5 stage retirement requires exact empty bookkeeping');
    };
    await validate();
    let checkpoint = await optional(store, 'terraform-f5-stage-retirement.json');
    const validateReceipt = (receipt: Record<string, unknown>) => {
      if (
        receipt.schemaVersion !== 1 ||
        receipt.engine !== 'terraform' ||
        receipt.deploymentId !== owner.deploymentId ||
        receipt.backendIdentity !== deployment.backendIdentity ||
        receipt.configurationSha256 !== hash(deployment.configuration) ||
        receipt.providerLockSha256 !== hash(deployment.providerLock) ||
        !receipt.noChanges ||
        !Array.isArray(receipt.changes) ||
        receipt.changes.length ||
        !sha(receipt.planSha256) ||
        receipt.operation ||
        receipt.actionInvocations ||
        receipt.imports ||
        receipt.relinquishments
      )
        throw Error('F5 stage final plan is not an exact ordinary no-change plan');
    };
    const validateCheckpoint = (value: unknown) => {
      const bound = object(value),
        receipt = object(bound.receipt);
      if (
        bound.schemaVersion !== 1 ||
        !['retiring', 'retired'].includes(String(bound.status)) ||
        !sameOwner(bound.owner, owner) ||
        bound.sourcePlanSha256 !== sourcePlanSha256 ||
        bound.evidenceSha256 !== evidenceSha256 ||
        bound.deploymentSha256 !== hash(JSON.stringify(deployment)) ||
        bound.receiptSha256 !== hash(JSON.stringify(receipt))
      )
        throw Error('F5 stage retirement checkpoint differs');
      validateReceipt(receipt);
      return { bound, receipt };
    };
    if (checkpoint !== undefined) validateCheckpoint(checkpoint);
    const session = await terraform.open(owner, deployment, 'current');
    if (!session.retireArtifacts || !session.readConfigurationSha256)
      throw Error('Owning F5 stage retirement capability unavailable');
    if (checkpoint === undefined) {
      if ((await session.readConfigurationSha256()) !== hash(deployment.configuration))
        throw Error('F5 stage configuration differs from empty bookkeeping');
      const receipt = await session.plan(env, signal);
      validateReceipt(receipt as unknown as Record<string, unknown>);
      await validate();
      checkpoint = {
        schemaVersion: 1,
        status: 'retiring',
        owner,
        sourcePlanSha256,
        evidenceSha256,
        deploymentSha256: hash(JSON.stringify(deployment)),
        receipt,
        receiptSha256: hash(JSON.stringify(receipt)),
      };
      await store.write('terraform-f5-stage-retirement.json', checkpoint);
    }
    const { bound, receipt } = validateCheckpoint(checkpoint);
    await validate();
    const result = await session.retireArtifacts(receipt as unknown as PlanReceipt, evidenceSha256, env, signal);
    if (
      result.status !== 'runner-artifacts-retired' ||
      result.evidenceSha256 !== evidenceSha256 ||
      result.finalPlanSha256 !== receipt.planSha256
    )
      throw Error('F5 stage retirement result differs');
    await store.write('terraform-f5-stage-retirement.json', { ...bound, status: 'retired', result });
    return result;
  } finally {
    await release();
  }
}
