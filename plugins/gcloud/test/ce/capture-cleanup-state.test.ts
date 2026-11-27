import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readGcpCaptureCleanupStateCandidate } from '../../src/ce/capture-cleanup-state';
import { publicTerraformAddresses } from '../../src/ce/terraform-public-ownership';
import { intent } from './fixtures';

for (const mode of ['receipt-version', 'missing-nochanges', 'malformed-actions'] as const)
  test(`cleanup candidate refuses invalid reviewed receipt shape: ${mode}`, () => {
    const f = setup();
    if (mode === 'receipt-version') Object.assign(f.receipt, { schemaVersion: 2 });
    if (mode === 'missing-nochanges') Object.assign(f.receipt, { noChanges: undefined });
    if (mode === 'malformed-actions') Object.assign(f.receipt, { actionInvocations: {} });
    expect(() => f.run()).toThrow('Original declared GCP capture cleanup state required');
  });

function setup() {
  const i = intent();
  i.engine = 'terraform';
  i.schemaVersion = 2;
  i.routing.destinationCidrs = [];
  i.sites[0].nodes = ['a', 'b', 'c'].map((suffix) => ({
    ...structuredClone(i.sites[0].nodes[0]),
    name: `node-${suffix}`,
    zone: `${i.region}-${suffix}`,
  }));
  const key = (byte: number) =>
    `ssh-ed25519 ${Buffer.concat([Buffer.from('0000000b7373682d6564323535313900000020', 'hex'), Buffer.alloc(32, byte)]).toString('base64')}`;
  i.initialAccess = { schemaVersion: 1, profile: 'site-ssh-sli', publicKey: key(1) };
  i.observer = { schemaVersion: 1, profile: 'original-ha-observer', publicKey: key(2), sshSourceCidr: '192.0.2.4/32' };
  const addresses = publicTerraformAddresses(i);
  const state = {
    version: 4,
    lineage: 'example-original',
    serial: 1,
    resources: addresses.map((address, n) => {
      const [type, name] = address.split('.');
      return {
        mode: 'managed',
        type,
        name,
        instances: [{ attributes: { id: `original-${n}`, content: 'private-example-content' } }],
      };
    }),
  };
  const receipt = {
    schemaVersion: 1 as const,
    deploymentId: i.deploymentName,
    engine: 'terraform' as const,
    backendIdentity: `local:${i.deploymentName}`,
    configurationSha256: 'a'.repeat(64),
    providerLockSha256: 'b'.repeat(64),
    planSha256: 'c'.repeat(64),
    noChanges: false,
    changes: addresses.map((address) => ({ address, type: address.split('.')[0], actions: ['create'] })),
  };
  const run = () => {
    const bytes = Buffer.from(JSON.stringify(state));
    return readGcpCaptureCleanupStateCandidate({
      intent: i,
      createReceipt: receipt,
      bytes,
      expectedStateSha256: createHash('sha256').update(bytes).digest('hex'),
    });
  };
  return { i, state, receipt, addresses, run };
}

test('cleanup state decoding uses the same immutable byte snapshot as its verified hash', () => {
  const f = setup();
  const bytes = Buffer.from(JSON.stringify(f.state));
  const expected = createHash('sha256').update(bytes).digest('hex');
  const offset = bytes.indexOf('"serial":1');
  expect(offset).toBeGreaterThan(0);
  const candidate = readGcpCaptureCleanupStateCandidate({
    intent: f.i,
    createReceipt: f.receipt,
    bytes,
    get expectedStateSha256() {
      bytes[offset + '"serial":'.length] = '9'.charCodeAt(0);
      return expected;
    },
  });
  expect(candidate.state.serial).toBe(1);
  expect(candidate.state.sha256).toBe(expected);
});

test('capture cleanup state joins all21declared original addresses without exporting private resource attributes or granting authority', () => {
  const f = setup(),
    candidate = f.run();
  expect(candidate.resources).toHaveLength(21);
  expect(candidate.resources.map((row) => row.address).sort()).toEqual(f.addresses.slice().sort());
  expect(JSON.stringify(candidate)).not.toContain('private-example-content');
  expect(candidate.liveOwnershipVerified).toBe(false);
  expect(candidate.readerClosureVerified).toBe(false);
  expect(candidate.executionAuthorized).toBe(false);
});

test('capture cleanup candidate admits the original observer disk as a partial subset without guest registration', () => {
  const f = setup();
  f.state.resources = f.state.resources.filter(
    (row) => row.type === 'google_compute_disk' && row.name.endsWith('_observer'),
  );
  expect(f.run().resources).toHaveLength(1);
});

for (const mode of [
  'foreign',
  'deposed',
  'multiple',
  'module',
  'missing-id',
  'wrong-engine',
  'wrong-owner',
  'bad-serial',
  'wrong-action',
] as const)
  test(`capture cleanup candidate refuses ambiguous or foreign source state: ${mode}`, () => {
    const f = setup();
    if (mode === 'foreign') f.state.resources[0].name = 'foreign';
    if (mode === 'deposed') Object.assign(f.state.resources[0].instances[0], { deposed: 'old' });
    if (mode === 'multiple') f.state.resources[0].instances.push(f.state.resources[0].instances[0]);
    if (mode === 'module') Object.assign(f.state.resources[0], { module: 'module.foreign' });
    if (mode === 'missing-id') f.state.resources[0].instances[0].attributes.id = '';
    if (mode === 'wrong-engine') f.i.engine = 'native';
    if (mode === 'wrong-owner') f.receipt.deploymentId = 'foreign';
    if (mode === 'bad-serial') f.state.serial = -1;
    if (mode === 'wrong-action') f.receipt.changes[0].actions = ['delete', 'create'];
    expect(() => f.run()).toThrow();
  });

test('cleanup candidate verifies original state bytes before exposing any IDs', () => {
  const f = setup(),
    bytes = Buffer.from(JSON.stringify(f.state));
  expect(() =>
    readGcpCaptureCleanupStateCandidate({
      intent: f.i,
      createReceipt: f.receipt,
      bytes,
      expectedStateSha256: 'f'.repeat(64),
    }),
  ).toThrow();
});

test('empty and data-only original state remain inspection candidates without deletion authority', () => {
  const f = setup();
  f.state.resources = [];
  expect(f.run().resources).toHaveLength(0);
  f.state.resources.push({
    mode: 'data',
    type: 'google_compute_image',
    name: 'observer',
    instances: [{ attributes: { id: 'data-only', content: 'private-example-content' } }],
  });
  const result = f.run();
  expect(result.resources).toHaveLength(0);
  expect(result.executionAuthorized).toBe(false);
  expect(JSON.stringify(result)).not.toContain('private-example-content');
});

for (const mode of ['duplicate-address', 'duplicate-id', 'indexed', 'unsafe-id', 'bad-state-version'] as const)
  test(`cleanup candidate refuses malformed original identity binding: ${mode}`, () => {
    const f = setup();
    if (mode === 'duplicate-address') f.state.resources.push(f.state.resources[0]);
    if (mode === 'duplicate-id') {
      const first = f.state.resources[0],
        second = f.state.resources.find((row) => row !== first && row.type === first.type);
      if (!second) throw new Error('Independent same-type original fixture required');
      second.instances[0].attributes.id = first.instances[0].attributes.id;
    }
    if (mode === 'indexed') Object.assign(f.state.resources[0].instances[0], { index_key: 0 });
    if (mode === 'unsafe-id') f.state.resources[0].instances[0].attributes.id = 'original\nforeign';
    if (mode === 'bad-state-version') f.state.version = 3;
    expect(() => f.run()).toThrow();
  });
