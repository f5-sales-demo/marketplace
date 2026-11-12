import { AsyncLocalStorage } from 'node:async_hooks';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import { canonicalSha256 } from './canonical';

type Operation = { kind: 'apply'; planSha256: string; operation: string } | { kind: 'retire'; cloudPlanSha256: string };
const leases = new AsyncLocalStorage<{
  directory: string;
  ownerSha256: string;
  cloudPlanSha256?: string;
  active: boolean;
}>();
/** Serialize native mutation; only the exact coordinator child may enter an active lease. */
export async function withAwsNativeOperation<T>(
  storage: CeDeploymentStore,
  operation: Operation,
  execute: () => Promise<T>,
): Promise<T> {
  await storage.verify();
  if (
    storage.owner.engine !== 'native' ||
    storage.owner.provider !== 'aws' ||
    !/^[a-f0-9]{64}$/.test(operation.kind === 'apply' ? operation.planSha256 : operation.cloudPlanSha256)
  )
    throw Error('Native operation owner or plan identity differs');
  const ownerSha256 = canonicalSha256(storage.owner),
    current = leases.getStore();
  if (
    current?.active &&
    current.directory === storage.directory &&
    current.ownerSha256 === ownerSha256 &&
    operation.kind === 'apply' &&
    operation.operation === 'teardown' &&
    current.cloudPlanSha256 === operation.planSha256
  )
    return execute();
  const release = await acquireProcessLock(join(storage.directory, '.aws-native-operation-lock'));
  const lease = {
    directory: storage.directory,
    ownerSha256,
    cloudPlanSha256: operation.kind === 'retire' ? operation.cloudPlanSha256 : undefined,
    active: true,
  };
  try {
    if (operation.kind === 'apply' && operation.operation !== 'teardown') {
      try {
        await storage.read('aws-native-lifecycle-retirement.json');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return await leases.run(lease, execute);
        throw Error('Native retirement evidence is unavailable or malformed');
      }
      throw Error('The native deployment is retiring or retired; application cannot resume');
    }
    return await leases.run(lease, execute);
  } finally {
    lease.active = false;
    await release();
  }
}
