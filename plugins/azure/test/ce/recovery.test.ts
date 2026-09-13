import { describe, expect, it } from 'bun:test';
import type { AzExecApi } from '../../src/az/exec';
import { compileAzureCePlan } from '../../src/ce/planner';
import {
  collectAzureAbsentDeletionTail,
  reconcileAzureNativeDeletionPrefix,
  validateAzureDeletionTail,
} from '../../src/ce/recovery';
import type { AzureCeObservation, AzureCePlan } from '../../src/ce/types';
import { intent, observation, subscriptionId } from './fixtures';

const alternateTenantId = ['33333333', '3333', '4333', '8333', '333333333333'].join('-');

function teardownFixture() {
  const groupId = `/subscriptions/${subscriptionId}/resourceGroups/${intent.resourceGroup}`;
  const vmId = `${groupId}/providers/Microsoft.Compute/virtualMachines/${intent.deploymentName}-1`;
  const vnetId = `${groupId}/providers/Microsoft.Network/virtualNetworks/${intent.deploymentName}-vnet`;
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'native',
    'xcsh-deployment-id': intent.deploymentName,
  };
  const previous = structuredClone(observation);
  previous.resources = [vmId, vnetId, groupId].map((id) => ({
    id,
    exists: true,
    owned: true,
    tags,
    state: {},
  }));
  const plan = compileAzureCePlan({ ...intent, operation: 'teardown' }, previous);
  const deletes = plan.actions.filter((action) => action.kind === 'resource-delete');
  expect(deletes.map((action) => action.resourceId)).toEqual([vmId, vnetId, groupId]);
  return { plan, previous, deletes, groupId, vmId, vnetId };
}

function without(observation: AzureCeObservation, ...ids: string[]) {
  const removed = new Set(ids.map((id) => id.toLowerCase()));
  const current = structuredClone(observation);
  current.resources = current.resources.filter((resource) => !removed.has(resource.id.toLowerCase()));
  return current;
}

describe('Azure native deletion recovery', () => {
  it('advances only a consecutive absent prefix and ignores capacity-only observation changes', () => {
    const { plan, previous, deletes, groupId, vmId } = teardownFixture();
    const current = without(previous, vmId);
    current.regions[0].quotaAvailable += 8;
    current.regions[0].rank = 2;
    current.regions[0].eligible = false;
    current.regions[0].reasons = ['quota'];
    const group = current.resources.find((resource) => resource.id.toLowerCase() === groupId.toLowerCase());
    if (!group) throw new Error('fixture has no resource group');
    group.etag = 'changed-by-child-deletion';
    group.state = { provisioningState: 'Updating' };
    expect(reconcileAzureNativeDeletionPrefix(plan, [], previous, current, [vmId.toUpperCase()])).toEqual([
      deletes[0].id,
    ]);
    expect(reconcileAzureNativeDeletionPrefix(plan, [], previous, previous, [])).toEqual([]);
  });

  it('advances the exact ordered tail after a resource-group cascade', () => {
    const { plan, previous, deletes, groupId, vmId, vnetId } = teardownFixture();
    const current = structuredClone(previous);
    current.resources = [{ id: groupId, exists: false, owned: false, tags: {}, state: {} }];
    expect(reconcileAzureNativeDeletionPrefix(plan, [], previous, current, [vmId, vnetId, groupId])).toEqual(
      deletes.map((action) => action.id),
    );
  });

  it('rejects scope, inventory, duplicate, non-delete, and out-of-order tails before probing', async () => {
    const { plan, deletes, vmId } = teardownFixture();
    const crossScope = structuredClone(plan) as AzureCePlan;
    const originalId = crossScope.actions[0].resourceId;
    if (!originalId) throw new Error('fixture has no first delete target');
    crossScope.actions[0].resourceId = originalId.replace(
      `/resourceGroups/${intent.resourceGroup}`,
      '/resourceGroups/other',
    );
    expect(() => validateAzureDeletionTail(crossScope, [])).toThrow(/subscription and resource-group scope/);
    let probeCalls = 0;
    await expect(
      collectAzureAbsentDeletionTail(crossScope, [], {
        async exec() {
          probeCalls++;
          return { exitCode: 0, stdout: '{}', stderr: '' };
        },
      }),
    ).rejects.toThrow(/subscription and resource-group scope/);
    expect(probeCalls).toBe(0);

    const missingInventory = structuredClone(plan) as AzureCePlan;
    missingInventory.ownershipInventory = missingInventory.ownershipInventory.filter(
      (item) => item.resourceId.toLowerCase() !== vmId.toLowerCase(),
    );
    expect(() => validateAzureDeletionTail(missingInventory, [])).toThrow(/ownership inventory/);

    const duplicate = structuredClone(plan) as AzureCePlan;
    duplicate.actions[1].resourceId = duplicate.actions[0].resourceId;
    expect(() => validateAzureDeletionTail(duplicate, [])).toThrow(/duplicate resource IDs/);

    const nonDelete = structuredClone(plan) as AzureCePlan;
    nonDelete.actions[1].kind = 'brownfield-restore';
    expect(() => validateAzureDeletionTail(nonDelete, [])).toThrow(/uninterrupted/);
    expect(() => validateAzureDeletionTail(plan, [deletes[1].id])).toThrow(/ordered unique prefix/);
  });

  it('rejects unrelated and out-of-order observation drift', () => {
    const { plan, previous, vmId, vnetId } = teardownFixture();
    for (const mutate of [
      (value: AzureCeObservation) => {
        value.subscription.tenantId = alternateTenantId;
      },
      (value: AzureCeObservation) => {
        value.image.version = '1.0.1';
      },
      (value: AzureCeObservation) => {
        value.research.sharedContract.normalizedSha256 = '4'.repeat(64);
      },
      (value: AzureCeObservation) => {
        value.regions[0].routeServerSupported = false;
      },
      (value: AzureCeObservation) => {
        value.resources.push({
          id: `${vmId}/extensions/unexpected`,
          exists: true,
          owned: true,
          tags: {},
          state: {},
        });
      },
    ]) {
      const current = without(previous, vmId);
      mutate(current);
      expect(() => reconcileAzureNativeDeletionPrefix(plan, [], previous, current, [vmId])).toThrow();
    }

    const outOfOrder = without(previous, vmId, vnetId);
    expect(() => reconcileAzureNativeDeletionPrefix(plan, [], previous, outOfOrder, [vmId])).toThrow(
      /outside the immutable delete tail/,
    );
    expect(() => reconcileAzureNativeDeletionPrefix(plan, [], previous, outOfOrder, [vnetId])).toThrow(
      /out of action order/,
    );
  });

  it('retains exact brownfield observations during delete recovery', () => {
    const { previous, vmId } = teardownFixture();
    const brownfieldId = `/subscriptions/${subscriptionId}/resourceGroups/network/providers/Microsoft.Network/routeTables/shared`;
    const selected = structuredClone(previous);
    selected.resources.push({ id: brownfieldId, exists: true, owned: false, tags: {}, state: { routes: [] } });
    const plan = compileAzureCePlan(
      {
        ...intent,
        operation: 'teardown',
        brownfield: { resourceIds: [brownfieldId], routeChanges: [] },
      },
      selected,
    );
    const current = without(selected, vmId);
    const brownfield = current.resources.find((resource) => resource.id === brownfieldId);
    if (!brownfield) throw new Error('fixture has no brownfield resource');
    brownfield.state = { routes: [{ name: 'changed' }] };
    expect(() => reconcileAzureNativeDeletionPrefix(plan, [], selected, current, [vmId])).toThrow(
      /outside the immutable delete tail/,
    );
  });

  it('uses group exists only for the exact selected group and accepts case-normalized returned IDs', async () => {
    const { plan, groupId, vmId, vnetId } = teardownFixture();
    const calls: string[][] = [];
    const absent = await collectAzureAbsentDeletionTail(plan, [], {
      async exec(_command, args) {
        calls.push(args);
        const id = args[0] === 'resource' ? String(args[3]) : groupId;
        if (id.toLowerCase() === vmId.toLowerCase()) {
          return { exitCode: 1, stdout: '', stderr: '(ResourceNotFound) missing\nCode: ResourceNotFound' };
        }
        return { exitCode: 0, stdout: JSON.stringify({ id: vnetId.toUpperCase() }), stderr: '' };
      },
    });
    expect(absent).toEqual([vmId]);
    expect(calls.map((args) => args[0])).toEqual(['resource', 'resource']);

    const allAbsent = await collectAzureAbsentDeletionTail(plan, [], {
      async exec(_command, args) {
        if (args[0] === 'group') return { exitCode: 0, stdout: 'false', stderr: '' };
        return { exitCode: 1, stdout: '', stderr: JSON.stringify({ error: { code: 'ResourceGroupNotFound' } }) };
      },
    });
    expect(allAbsent.map((id) => id.toLowerCase())).toEqual([vmId, vnetId, groupId].map((id) => id.toLowerCase()));
  });

  it('fails closed for authorization, expiry, throttling, malformed, transient, and substituted probe results', async () => {
    const { plan, vnetId } = teardownFixture();
    const failure = (stderr: string, stdout = ''): AzExecApi => ({
      async exec() {
        return { exitCode: 1, stdout, stderr };
      },
    });
    for (const stderr of [
      '(AuthorizationFailed) denied\nCode: AuthorizationFailed',
      '(ExpiredAuthenticationToken) expired\nCode: ExpiredAuthenticationToken',
      '(TooManyRequests) throttled\nCode: TooManyRequests',
      'connection reset by peer',
      'authorization failed after text mentioning ResourceNotFound',
    ]) {
      await expect(collectAzureAbsentDeletionTail(plan, [], failure(stderr))).rejects.toThrow(/unavailable/);
    }
    await expect(
      collectAzureAbsentDeletionTail(plan, [], {
        async exec() {
          return { exitCode: 0, stdout: '{', stderr: '' };
        },
      }),
    ).rejects.toThrow(/Malformed/);
    await expect(
      collectAzureAbsentDeletionTail(plan, [], {
        async exec() {
          return { exitCode: 0, stdout: JSON.stringify({ id: `${vnetId}-substituted` }), stderr: '' };
        },
      }),
    ).rejects.toThrow(/different resource identity/);
  });
});
