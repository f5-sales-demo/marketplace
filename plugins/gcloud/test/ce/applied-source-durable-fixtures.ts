/** Source evidence only: real immutable storage and synthetic cloud/XC observations. */
import { expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOwnedInstalledInput } from '../../../terraform/src/installed-runtime';
import type { OriginalInputBinding } from '../../../terraform/src/original-input-monitor';
import { TerraformRunner } from '../../../terraform/src/runner';
import * as durable from '../../src/ce/applied-source-cleanup-durable';
import { fingerprint } from '../../src/ce/discovery';
import type { PublicTerraformCleanupReview } from '../../src/ce/terraform-public-teardown';
import { appliedSourceFixture } from './applied-source-fixtures';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export async function appliedSourceDurableFixture() {
  const config = Buffer.from('{"resource":{}}'),
    lock = Buffer.from('original-provider-lock');
  const create = Buffer.from('original-source-create');
  const f = await appliedSourceFixture(undefined, {
    configurationSha256: hash(config),
    providerLockSha256: hash(lock),
    planSha256: hash(create),
  });
  const root = await mkdtemp(join(tmpdir(), 'gcp-applied-durable-'));
  const directory = join(root, f.i.deploymentName);
  const deployment = {
    schemaVersion: 1 as const,
    engine: 'terraform' as const,
    deploymentId: f.i.deploymentName,
    scope: { cloud: 'gcp' as const, account: f.i.project, region: f.i.region },
    terraformVersion: '1.17.2',
    configuration: config.toString(),
    providerLock: lock.toString(),
    backendIdentity: f.receipt.backendIdentity,
  };
  await new TerraformRunner(root, async () => {
    throw new Error('Fixture preparation cannot execute Terraform');
  }).prepare(deployment);
  const state = {
    version: 4,
    lineage: 'original',
    serial: 1,
    resources: f.addresses.map((address, n) => ({
      mode: 'managed',
      type: address.split('.')[0],
      name: address.split('.')[1],
      instances: [
        { attributes: { id: n < f.scope.length ? String(f.live.get(f.scope[n].selfLink)?.id) : fingerprint(address) } },
      ],
    })),
  };
  const stateIdentity = async () => ({
    sha256: hash(await readFile(join(directory, 'terraform.tfstate'))),
    lineage: state.lineage,
    serial: state.serial,
  });
  const refreshState = () => writeFile(join(directory, 'terraform.tfstate'), JSON.stringify(state), { mode: 0o600 });
  await refreshState();
  const read = f.runtime.session.readApplyAttemptResourceFields;
  if (!read) throw new Error('Original synthetic source reader required');
  f.runtime.session.readApplyAttemptResourceFields = async (...args) => ({
    ...(await read(...args)),
    stateSha256: (await stateIdentity()).sha256,
  });
  f.runtime.session.readStateIdentity = stateIdentity;
  await writeFile(join(directory, 'saved.tfplan'), create, { mode: 0o600 });
  await writeFile(join(directory, 'plan-receipt.json'), JSON.stringify({ state: 'applied', receipt: f.receipt }), {
    mode: 0o600,
  });
  const readerPath = join(f.worker, 'original-reader-set.private.json');
  await writeFile(readerPath, JSON.stringify({ fixture: 'synthetic-independent-original-readers' }), { mode: 0o400 });
  const readerInputs: Record<string, OriginalInputBinding> = {
    readerSet: (await readOwnedInstalledInput(readerPath)).binding,
  };
  let closed = true;
  const common = {
    intent: f.i,
    executionDirectory: directory,
    source: f.args.source,
    environment: f.runtime.environment,
    api: f.runtime.api,
    observePlatform: f.runtime.observePlatform,
    assertIndependentClosure: async (bindings: Readonly<Record<string, OriginalInputBinding>>) => {
      expect(bindings).toEqual(readerInputs);
      if (!closed) throw new Error('Original reader is live');
    },
  };
  const origin = await f.open();
  const persisted = await durable.persistGcpAppliedSourceCleanupOrigin({
    ...common,
    origin,
    receipt: f.receipt,
    readerInputs,
  });
  origin.close();
  const args = () => ({ ...common, reference: persisted.reference });
  const review = async (ageMs = 0) => {
    const planBytes = Buffer.from(`reviewed-delete-${state.serial}`);
    const receipt = {
      ...f.receipt,
      operation: 'destroy' as const,
      noChanges: state.resources.length === 0,
      planSha256: hash(planBytes),
      changes: state.resources.map((row) => ({
        address: `${row.type}.${row.name}`,
        type: row.type,
        actions: ['delete'],
      })),
    };
    await writeFile(join(directory, 'saved.tfplan'), planBytes);
    await writeFile(join(directory, 'plan-receipt.json'), JSON.stringify({ state: 'planned', receipt }));
    const body = {
      schemaVersion: 3,
      operation: 'teardown',
      engine: 'terraform',
      intentFingerprint: fingerprint(f.i),
      originalAuthorization: persisted.original,
      ownershipHash: fingerprint(persisted.ownership),
      state: await stateIdentity(),
      savedPlan: receipt,
      remaining: receipt.changes.map((row) => row.address),
      projectionHash: fingerprint(f.fields),
      createdAt: new Date(Date.now() - ageMs).toISOString(),
    };
    const reviewed = { ...body, planHash: fingerprint(body) } as unknown as PublicTerraformCleanupReview;
    const recorded = await durable.persistGcpAppliedSourceCleanupReview({ ...args(), review: reviewed });
    return { receipt, recorded, reviewed };
  };
  const remove = async (all = false) => {
    const removed = all ? f.addresses : [f.addresses[0]];
    state.resources = state.resources.filter((row) => !removed.includes(`${row.type}.${row.name}`));
    state.serial++;
    for (const address of removed) {
      f.fields[address] = null;
      const index = f.addresses.indexOf(address);
      if (index < f.scope.length) f.live.delete(f.scope[index].selfLink);
    }
    await refreshState();
  };
  return {
    ...f,
    common,
    args,
    persisted,
    directory,
    deployment,
    state,
    refreshState,
    review,
    remove,
    readerPath,
    readerLive: () => {
      closed = false;
    },
  };
}
