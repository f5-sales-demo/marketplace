import { expect, test } from 'bun:test';
import {
  captureAzureNetworkUpdateInventory,
  validateAzureNetworkUpdateInventory,
  verifyAzureNetworkUpdateProgress,
} from '../../src/ce/network-update';
import { networkUpdateFixture } from './network-update-fixture';

for (const ha of [false, true])
  test(`private inventory plan snapshot rejects late caller mutation (${ha ? 'HA' : 'single'})`, async () => {
    const f = networkUpdateFixture(ha, 'terraform');
    const inventory = await captureAzureNetworkUpdateInventory(f.plan, f.api),
      nodes = inventory.nodes;
    let changed = false;
    Object.defineProperty(inventory, 'nodes', {
      enumerable: true,
      get() {
        changed = true;
        f.plan.region = 'foreign-region';
        return nodes;
      },
    });
    expect(() => validateAzureNetworkUpdateInventory(f.plan, inventory)).toThrow();
    expect(changed).toBe(true);
    expect(f.mutations()).toBe(0);
  });

for (const ha of [false, true])
  test(`synchronous progress scope sharing rejects caller mutation (${ha ? 'HA' : 'single'})`, async () => {
    const f = networkUpdateFixture(ha, 'terraform');
    const before = await captureAzureNetworkUpdateInventory(f.plan, f.api),
      current = structuredClone(before),
      nodes = current.nodes;
    let changed = false;
    Object.defineProperty(current, 'nodes', {
      enumerable: true,
      get() {
        changed = true;
        f.plan.region = 'foreign-region';
        return nodes;
      },
    });
    expect(() => verifyAzureNetworkUpdateProgress(f.plan, before, current, [])).toThrow(/plan changed/);
    expect(changed).toBe(true);
    expect(f.mutations()).toBe(0);
  });
