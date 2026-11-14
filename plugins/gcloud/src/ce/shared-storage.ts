import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { GcpBootstrapOwner, GcpBootstrapStore } from './bootstrap-checkout';

/** Adapter uses the shared restricted ownership ledger and portable process lock. */
export async function openGcpDeploymentStorage(
  root: string,
  owner: GcpBootstrapOwner,
  region: string,
): Promise<GcpBootstrapStore> {
  if (!/^[a-z]+(?:-[a-z]+)+\d$/.test(region)) throw new Error('Explicit GCP storage region required');
  const store = await CeDeploymentStore.open(root, {
    deploymentId: owner.deploymentName,
    provider: 'gcp',
    account: owner.project,
    region,
    engine: owner.engine,
  });
  return {
    read: (name) => store.read(name),
    write: (name, value) => store.write(name, value),
    async exclusive<T>(fn: () => Promise<T>): Promise<T> {
      await store.verify();
      const release = await acquireProcessLock(join(store.directory, '.gcp-bootstrap-lock'));
      try {
        await store.verify();
        return await fn();
      } finally {
        await release();
      }
    },
  };
}
