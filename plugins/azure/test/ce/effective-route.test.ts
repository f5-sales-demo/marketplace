import { expect, test } from 'bun:test';
import {
  type AzureEffectiveRoute,
  collectAzureNetworkEffectiveRoutes,
  parseAzureEffectiveRoutes,
} from '../../src/ce/effective-route';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { networkUpdateFixture } from './network-update-fixture';

const route = (): AzureEffectiveRoute => ({
  name: 'ce-route-1',
  source: 'User',
  state: 'Active',
  addressPrefix: ['10.253.0.0/24'],
  nextHopIpAddress: ['10.20.1.5'],
  nextHopType: 'VirtualAppliance',
  disableBgpRoutePropagation: false,
});
test('preserves exact Azure route spellings, grouped prefixes and explicit Invalid activity', () => {
  const active = route(),
    invalid = { ...route(), name: 'backup', state: 'Invalid' as const, nextHopIpAddress: ['10.20.1.6'] };
  expect(parseAzureEffectiveRoutes({ value: [active, invalid] })).toEqual([active, invalid]);
});
for (const source of ['Unknown', 'User', 'VirtualNetworkGateway', 'Default'] as const)
  for (const nextHopType of ['VirtualNetworkGateway', 'VnetLocal', 'Internet', 'VirtualAppliance', 'None'] as const)
    test(`preserves documented ${source}/${nextHopType}`, () => {
      const value = {
        ...route(),
        source,
        nextHopType,
        nextHopIpAddress: nextHopType === 'VirtualAppliance' ? ['10.20.1.5'] : [],
      };
      expect(parseAzureEffectiveRoutes({ value: [value] })).toEqual([value]);
    });
for (const [label, value] of Object.entries({
  missing: {},
  ack: { status: 'Succeeded' },
  partial: { value: [route()], nextLink: 'https://next' },
  malformedPage: { value: [route()], nextLink: 7 },
  errors: { value: [route()], error: { message: 'SECRET_SENTINEL' } },
  duplicate: { value: [route(), route()] },
  missingState: { value: [{ ...route(), state: undefined }] },
  badState: { value: [{ ...route(), state: 'Down' }] },
  badSource: { value: [{ ...route(), source: 'BGP' }] },
  badHop: { value: [{ ...route(), nextHopType: 'virtualappliance' }] },
  badPrefix: { value: [{ ...route(), addressPrefix: ['10.253.0.0/33'] }] },
  noPrefix: { value: [{ ...route(), addressPrefix: [] }] },
  duplicatePrefix: { value: [{ ...route(), addressPrefix: ['10.253.0.0/24', '10.253.0.0/24'] }] },
  badIp: { value: [{ ...route(), nextHopIpAddress: ['__PRIVATE_IP__'] }] },
  noApplianceIp: { value: [{ ...route(), nextHopIpAddress: [] }] },
  duplicateIp: { value: [{ ...route(), nextHopIpAddress: ['10.20.1.5', '10.20.1.5'] }] },
  badBoolean: { value: [{ ...route(), disableBgpRoutePropagation: 'false' }] },
}))
  test(`rejects ${label} route evidence`, () => expect(() => parseAzureEffectiveRoutes(value)).toThrow());

test('empty complete route inventory remains observed inventory, without forwarding acceptance', () => {
  expect(parseAzureEffectiveRoutes({ value: [], nextLink: '' })).toEqual([]);
});

async function fixture(ha = false) {
  const f = networkUpdateFixture(ha, 'terraform', true, false);
  const inventory = await captureAzureNetworkUpdateInventory(f.plan, f.api);
  const selectedId = inventory.nodes['1'].nics['1'].resourceId;
  const state = { calls: 0, fail: false, malformed: false, change: false, foreign: false };
  const api = {
    async exec(command: string, args: string[], options?: { signal?: AbortSignal }) {
      if (args.includes('show-effective-route-table')) {
        state.calls++;
        expect(command).toBe('az');
        expect(args).toEqual([
          'network',
          'nic',
          'show-effective-route-table',
          '--ids',
          selectedId,
          '--subscription',
          f.plan.subscription.id,
          '--output',
          'json',
        ]);
        if (state.foreign)
          f.sliNic.tags = { ...(f.sliNic.tags as Record<string, string>), 'xcsh-plan-sha256': 'a'.repeat(64) };
        return {
          exitCode: state.fail ? 1 : 0,
          stderr: 'SECRET_SENTINEL',
          stdout: state.malformed
            ? 'SECRET_SENTINEL'
            : JSON.stringify({
                value: [{ ...route(), state: state.change && state.calls > 1 ? 'Invalid' : 'Active' }],
              }),
        };
      }
      return f.api.exec(command, args, options);
    },
  };
  const run = (signal?: AbortSignal) =>
    collectAzureNetworkEffectiveRoutes(f.plan, inventory, { node: 1, index: 1 }, api, signal);
  return { ...f, inventory, state, api, run };
}
for (const ha of [false, true])
  test(`joins current ${ha ? 'HA' : 'single'} owned NIC before and after terminal route reads`, async () => {
    const f = await fixture(ha),
      result = await f.run();
    expect(result.status).toBe('observed');
    expect(result).toMatchObject({
      scope: 'azure-nic-effective-route-inventory',
      freshness: 'unqualified',
      forwarding: 'unknown',
      interfaceState: 'unknown',
    });
    expect(result.routes).toEqual([route()]);
    expect(result.nic).toEqual(f.inventory.nodes['1'].nics['1']);
    expect(f.state.calls).toBe(2);
    expect(f.mutations()).toBe(0);
    expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL');
  });
for (const key of ['fail', 'malformed', 'change', 'foreign'] as const)
  test(`returns unknown for ${key} current route observation`, async () => {
    const f = await fixture();
    f.state[key] = true;
    const result = await f.run();
    expect(result.status).toBe('unknown');
    expect(result.routes).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL');
    expect(f.mutations()).toBe(0);
  });
test('rejects unresolved selector before any route command', async () => {
  const f = await fixture();
  await expect(collectAzureNetworkEffectiveRoutes(f.plan, f.inventory, { node: 4, index: 1 }, f.api)).rejects.toThrow();
  expect(f.state.calls).toBe(0);
});
test('caller cancellation bounds an executor ignoring cancellation', async () => {
  const f = await fixture();
  const controller = new AbortController();
  const pending = collectAzureNetworkEffectiveRoutes(
    f.plan,
    f.inventory,
    { node: 1, index: 1 },
    {
      async exec(command, args, options) {
        if (args.includes('show-effective-route-table')) {
          controller.abort(Error('cancel-test'));
          return new Promise(() => {});
        }
        return f.api.exec(command, args, options);
      },
    },
    controller.signal,
  );
  await expect(pending).rejects.toThrow('cancel-test');
});

test('caller objects are snapshotted before asynchronous cloud reads', async () => {
  const f = await fixture(),
    selection = { node: 1, index: 1 };
  let mutated = false;
  const result = await collectAzureNetworkEffectiveRoutes(f.plan, f.inventory, selection, {
    async exec(command, args, options) {
      if (!mutated) {
        mutated = true;
        f.plan.region = 'foreign';
        selection.node = 3;
        f.inventory.nodes['1'].nics['1'].mac = 'foreign';
      }
      return f.api.exec(command, args, options);
    },
  });
  expect(result.status).toBe('observed');
  expect(result.node).toBe(1);
  expect(result.nic.mac).not.toBe('foreign');
});
test('rejects foreign expected cloud owner before any execution', async () => {
  const f = await fixture();
  f.inventory.nodes['1'].nics['1'].ownerPlanSha256 = 'f'.repeat(64);
  const calls = f.cloudCalls();
  await expect(f.run()).rejects.toThrow();
  expect(f.cloudCalls()).toBe(calls);
  expect(f.state.calls).toBe(0);
});
test('an unavailable account leaves current routes unknown without calling the route endpoint', async () => {
  const f = await fixture();
  const original = f.api.exec;
  f.api.exec = async (command, args, options) =>
    args[0] === 'account' ? { exitCode: 1, stdout: '', stderr: 'SECRET_SENTINEL' } : original(command, args, options);
  expect((await f.run()).status).toBe('unknown');
  expect(f.state.calls).toBe(0);
});
test('pre-aborted calls do not execute cloud commands', async () => {
  const f = await fixture();
  const calls = f.cloudCalls();
  await expect(f.run(AbortSignal.abort(Error('already-aborted')))).rejects.toThrow('already-aborted');
  expect(f.cloudCalls()).toBe(calls);
});

test('rejects an executor changed during its first route read without calling the replacement', async () => {
  const f = await fixture();
  let replacementCalls = 0;
  const execute = f.api.exec;
  f.api.exec = async (command, args, options) => {
    const result = await execute(command, args, options);
    if (args.includes('show-effective-route-table'))
      f.api.exec = async () => {
        replacementCalls++;
        return { exitCode: 0, stdout: JSON.stringify({ value: [route()] }), stderr: '' };
      };
    return result;
  };
  const result = await f.run();
  expect(result.status).toBe('unknown');
  expect(replacementCalls).toBe(0);
});
