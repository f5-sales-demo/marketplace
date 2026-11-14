import { expect, test } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { recheckAzureTerraformNetworkRetiredBootstrapPackets } from '../../src/ce/terraform-network-sensitive-packet-retirement';
import {
  captureAzureTerraformTerminalSnapshot,
  matchesAzureTerraformTerminalSnapshot,
  sealAzureTerraformTerminalSnapshot,
} from '../../src/ce/terraform-terminal-snapshot';

test('sealed terminal copy keeps the exact digest and freezes every nested value', () => {
  const source = { phase: 'retired', nested: { rows: [{ owner: 'owned' }], optional: undefined } };
  const digest = canonicalSha256({ value: source });
  const sealed = sealAzureTerraformTerminalSnapshot(source);
  expect(canonicalSha256({ value: sealed })).toBe(digest);
  expect(matchesAzureTerraformTerminalSnapshot(sealed, digest)).toBe(true);
  expect(matchesAzureTerraformTerminalSnapshot(sealed, 'f'.repeat(64))).toBe(false);
  expect(matchesAzureTerraformTerminalSnapshot(sealed, canonicalSha256(source), 'raw')).toBe(true);
  expect(Object.isFrozen(sealed)).toBe(true);
  const nested = sealed.nested as { rows: Array<{ owner: string }> };
  expect(Object.isFrozen(nested)).toBe(true);
  expect(Object.isFrozen(nested.rows)).toBe(true);
  const row = nested.rows[0];
  if (!row) throw Error('nested fixture row required');
  expect(Object.isFrozen(row)).toBe(true);
  expect(() => {
    row.owner = 'foreign';
  }).toThrow();
  source.nested.rows[0] = { owner: 'foreign' };
  expect(matchesAzureTerraformTerminalSnapshot(source, digest)).toBe(false);
  expect(matchesAzureTerraformTerminalSnapshot(sealed, digest)).toBe(true);
});

test('unregistered mutable clones keep full digest checking', () => {
  const sealed = sealAzureTerraformTerminalSnapshot({ phase: 'retired', nested: { uid: 'original' } });
  const digest = canonicalSha256({ value: sealed });
  const clone = structuredClone(sealed) as { nested: { uid: string } };
  expect(matchesAzureTerraformTerminalSnapshot(clone, digest)).toBe(true);
  clone.nested.uid = 'foreign';
  expect(matchesAzureTerraformTerminalSnapshot(clone, digest)).toBe(false);
});

test('custom accessors, prototypes, proxies, cycles and JSON overrides never enter the sealed map', () => {
  let reads = 0;
  const accessor = {
    get value() {
      reads++;
      return 'secret';
    },
  };
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  for (const value of [
    accessor,
    cycle,
    new Proxy({}, {}),
    new Date(),
    { value: () => 'custom' },
    {
      toJSON() {
        return {};
      },
    },
    { value: Number.NaN },
    { value: Symbol('foreign') },
    Object.assign([], { custom: true }),
    null,
    undefined,
    'foreign',
  ]) {
    expect(() => sealAzureTerraformTerminalSnapshot(value)).toThrow();
  }
  expect(reads).toBe(0);
});

test('sealed digest is equality only and provides no retirement authority', async () => {
  const fake = sealAzureTerraformTerminalSnapshot({
    status: 'runner-artifacts-retired',
    nativeServicesQualified: true,
  });
  expect(matchesAzureTerraformTerminalSnapshot(fake, canonicalSha256({ value: fake }))).toBe(true);
  await expect(
    recheckAzureTerraformNetworkRetiredBootstrapPackets(
      fake,
      {} as never,
      {} as never,
      {} as never,
      {},
      {} as never,
      {} as never,
      {} as never,
    ),
  ).rejects.toThrow('genuine owning completed bootstrap observation required');
});

test('captured terminal equality rechecks mutable callers and accepts only identical sealed bytes', () => {
  const source = { nested: { owner: 'owned' }, optional: undefined };
  const matches = captureAzureTerraformTerminalSnapshot(source);
  const clone = structuredClone(source);
  const sealed = sealAzureTerraformTerminalSnapshot(source);
  expect(matches(source)).toBe(true);
  expect(matches(clone)).toBe(true);
  expect(matches(sealed)).toBe(true);
  source.nested.owner = 'foreign';
  clone.nested.owner = 'foreign';
  expect(matches(source)).toBe(false);
  expect(matches(clone)).toBe(false);
  expect(matches(sealed)).toBe(true);
  expect(matches(sealAzureTerraformTerminalSnapshot(source))).toBe(false);
  clone.nested.owner = 'owned';
  expect(matches(clone)).toBe(true);
  expect(matches(undefined)).toBe(false);
  expect(() => matches({ nested: { owner: 1n } })).toThrow();
});
