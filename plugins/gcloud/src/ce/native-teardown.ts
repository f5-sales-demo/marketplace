import type { GcloudExecApi } from '../gcloud/exec';
import type { GcpBootstrapStore } from './bootstrap-checkout';
import { fingerprint } from './discovery';
import { type GcpOperationBinding, reconcileGcpOperation, recordGcpOperation } from './native-operation';
import { assertGcpResourceOwnership, readGcpResourceInventory } from './ownership';
import { planGcpOwnedTeardown } from './teardown-plan';
/** Internal cloud-only teardown; Platform drain/token/site and restoration remain outer lifecycle gates. */
export async function applyGcpNativeTeardown(
  store: GcpBootstrapStore,
  api: GcloudExecApi,
  plan: ReturnType<typeof planGcpOwnedTeardown>,
  approvedHash: string,
  signal?: AbortSignal,
) {
  const expected = planGcpOwnedTeardown(plan.resources, plan.scope);
  if (plan.scope.engine !== 'native' || approvedHash !== expected.sha256 || plan.sha256 !== expected.sha256)
    throw new Error('Reviewed native teardown differs');
  signal?.throwIfAborted();
  return store.exclusive(async () => {
    const owned = await readGcpResourceInventory(store, plan.scope);
    if (
      fingerprint(owned.slice().sort((a, b) => a.selfLink.localeCompare(b.selfLink))) !==
      fingerprint(plan.resources.slice().sort((a, b) => a.selfLink.localeCompare(b.selfLink)))
    )
      throw new Error('Complete teardown ledger differs');
    const filename = `gcp-teardown-${plan.sha256.slice(7)}.json`;
    let checkpoint: { planHash: string; resources: Record<string, 'submitting' | 'done'> };
    try {
      checkpoint = (await store.read(filename)) as typeof checkpoint;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      checkpoint = { planHash: plan.sha256, resources: {} };
    }
    if (checkpoint.planHash !== approvedHash || !checkpoint.resources) throw new Error('Teardown checkpoint differs');
    for (const resource of plan.resources) {
      signal?.throwIfAborted();
      const parts = resource.selfLink.split('/'),
        scope = parts[7],
        location = scope === 'global' ? undefined : parts[8],
        name = parts.at(-1) as string;
      const base =
        resource.kind === 'subnetwork'
          ? ['compute', 'networks', 'subnets']
          : [
              'compute',
              resource.kind === 'instance'
                ? 'instances'
                : resource.kind === 'network'
                  ? 'networks'
                  : resource.kind === 'disk'
                    ? 'disks'
                    : resource.kind === 'address'
                      ? 'addresses'
                      : resource.kind === 'firewall'
                        ? 'firewall-rules'
                        : resource.kind === 'router'
                          ? 'routers'
                          : 'routes',
            ];
      const flags = [
        `--project=${plan.scope.project}`,
        ...(scope === 'zones' ? [`--zone=${location}`] : scope === 'regions' ? [`--region=${location}`] : []),
      ];
      const observe = async () => {
        const r = await api.exec('gcloud', [...base, 'describe', name, ...flags, '--format=json(id,selfLink)'], {
          signal,
        });
        if (r.exitCode !== 0) {
          if (/\b404\b|was not found|not found/i.test(r.stderr)) return null;
          throw new Error('Teardown observation unavailable');
        }
        let v: { id: string; selfLink: string };
        try {
          v = JSON.parse(r.stdout);
        } catch {
          throw new Error('Malformed teardown identity');
        }
        return v;
      };
      const id = `delete-${fingerprint({ plan: plan.sha256, resource: resource.selfLink }).slice(7, 47)}`;
      const binding: GcpOperationBinding = {
        project: plan.scope.project,
        deploymentName: plan.scope.deploymentName,
        engine: 'native',
        actionId: id,
        ...(scope === 'zones'
          ? { zone: location }
          : scope === 'regions'
            ? { region: location }
            : { global: true as const }),
      };
      const live = await observe();
      if (!live) {
        checkpoint.resources[resource.selfLink] = 'done';
        await store.write(filename, checkpoint);
        continue;
      }
      await assertGcpResourceOwnership(store, resource, live);
      if (checkpoint.resources[resource.selfLink] === 'done') throw new Error('Deleted resource reappeared');
      if (!checkpoint.resources[resource.selfLink]) {
        checkpoint.resources[resource.selfLink] = 'submitting';
        await store.write(filename, checkpoint);
        const r = await api.exec('gcloud', [...base, 'delete', name, ...flags, '--async', '--quiet', '--format=json'], {
          signal,
        });
        if (r.exitCode !== 0) throw new Error('Teardown submission requires reconciliation');
        let v: unknown;
        try {
          v = JSON.parse(r.stdout);
        } catch {
          throw new Error('Teardown operation receipt missing');
        }
        await recordGcpOperation(store, binding, Array.isArray(v) ? v[0] : v);
      }
      let operation: unknown;
      try {
        operation = await store.read(`gcp-operation-${id}.json`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (!operation) throw new Error('Ambiguous deletion requires exact receipt reconciliation');
      const result = await reconcileGcpOperation(store, api, binding, signal);
      if (result.state === 'failed') throw new Error('Cloud teardown operation failed');
      if (result.state !== 'done' || (await observe())) return { state: 'pending', resource: resource.selfLink };
      checkpoint.resources[resource.selfLink] = 'done';
      await store.write(filename, checkpoint);
    }
    return { state: 'done', absence: 'cloud-observed', independentAbsence: 'not-established', planHash: plan.sha256 };
  });
}
