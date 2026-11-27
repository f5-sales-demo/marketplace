/** Offline consistency projection only; no source or guest authority is minted. */
import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { projectGcpGuestBinding } from '../src/gcp-guest-binding-projection';

test('projected binding satisfies the actual pinned Python guest contract without starting SSH', () => {
  const python = process.env.CE_TEST_PYTHON;
  if (!python) throw new Error('Original Python fixture required');
  const value = projectGcpGuestBinding(fixture(), Date.now()).binding;
  const program = `import json,sys,time\nfrom pathlib import Path\nsys.path.insert(0,sys.argv[1])\nfrom scripts.gcp_guest_session import GuestBinding\nv=json.loads(sys.stdin.read())\nv['original_interfaces']=tuple(v['original_interfaces'])\nfor name in ('observer_key','ce_key','observer_hosts','ce_hosts'): v[name]=Path(v[name])\nGuestBinding(**v).validate(time.time())\nprint('validated')\n`;
  const child = Bun.spawnSync([python, '-I', '-B', '-c', program, resolve(import.meta.dir, '..')], {
    stdin: Buffer.from(JSON.stringify(value)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  expect(child.exitCode).toBe(0);
  expect(child.stdout.toString().trim()).toBe('validated');
  const incompatible = Bun.spawnSync([python, '-I', '-B', '-c', program, resolve(import.meta.dir, '..')], {
    stdin: Buffer.from(JSON.stringify({ ...value, ce_algorithm: 'ssh-rsa' })),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(incompatible.exitCode).not.toBe(0);
  expect(incompatible.stderr.toString()).toContain('Original serial-verified SSH algorithms required');
});

const fixture = () => ({
  owner: {
    provider: 'gcp' as const,
    engine: 'terraform' as const,
    account: 'example-project',
    region: 'us-central1',
    deploymentId: 'example-deploy',
  },
  vm: {
    project: 'example-project',
    zone: 'us-central1-a',
    nodeName: 'node-a',
    siteName: 'example-site',
    instanceId: '1234',
    interfaces: ['10.1.0.2', '10.2.0.2'],
    expiresAt: '2030-01-01T00:00:00Z',
    jwtSha256: 'a'.repeat(64),
    ownershipSha256: 'b'.repeat(64),
  },
  observer: {
    project: 'example-project',
    zone: 'us-central1-b',
    name: 'observer-a',
    instanceId: '5678',
    externalAddress: '192.0.2.7',
  },
  target: {
    project: 'example-project',
    zone: 'us-central1-a',
    nodeName: 'node-a',
    instanceId: '1234',
    address: '10.2.0.2',
    interfaceIndex: 1 as const,
    role: 'sli' as const,
  },
  paths: {
    observer_key: '/example/observer-key',
    ce_key: '/example/ce-key',
    observer_hosts: '/example/observer-hosts',
    ce_hosts: '/example/ce-hosts',
  },
});
test('consistent views produce all22 immutable guest fields without authority', () => {
  const input = fixture(),
    projected = projectGcpGuestBinding(input, 1700000000000);
  expect(Object.keys(projected.binding)).toHaveLength(22);
  expect(projected.binding.address).toBe(input.vm.interfaces[1]);
  expect(projected.binding.token_node).toBe(input.vm.nodeName);
  expect(projected.binding.token_site).toBe(input.vm.siteName);
  expect(projected.binding.token_sha256).toBe(input.vm.jwtSha256);
  expect(projected.binding.ownership_sha256).toBe(input.vm.ownershipSha256);
  expect(projected.commandsAuthorized).toBe(false);
  expect(projected.guestAcceptanceComplete).toBe(false);
  expect(Object.isFrozen(projected.binding)).toBe(true);
  expect(Object.isFrozen(projected.binding.original_interfaces)).toBe(true);
  input.vm.interfaces[1] = '10.2.0.9';
  expect(projected.binding.address).toBe('10.2.0.2');
});
test('foreign identity, network, expiry and unsafe paths never project a valid binding', () => {
  const modes = [
    'project',
    'observer-project',
    'same-id',
    'unsafe-id',
    'target-id',
    'target-address',
    'interfaces',
    'expired',
    'expiry',
    'hash',
    'path',
    'same-path',
    'observer-interface',
    'uppercase-name',
  ];
  for (const mode of modes) {
    const input = fixture();
    if (mode === 'project') input.vm.project = 'foreign-project';
    if (mode === 'observer-project') input.observer.project = 'foreign-project';
    if (mode === 'same-id') input.observer.instanceId = input.vm.instanceId;
    if (mode === 'unsafe-id') input.vm.instanceId = '18446744073709551616';
    if (mode === 'target-id') input.target.instanceId = '9999';
    if (mode === 'target-address') input.target.address = '10.2.0.9';
    if (mode === 'interfaces') input.vm.interfaces = ['10.1.0.2'];
    if (mode === 'expired') input.vm.expiresAt = '2000-01-01T00:00:00Z';
    if (mode === 'expiry') input.vm.expiresAt = 'invalid';
    if (mode === 'hash') input.vm.jwtSha256 = 'not-a-hash';
    if (mode === 'path') input.paths.ce_hosts = '/example/../foreign';
    if (mode === 'same-path') input.paths.ce_key = input.paths.observer_key;
    if (mode === 'observer-interface') input.observer.externalAddress = input.vm.interfaces[0];
    if (mode === 'uppercase-name') input.vm.nodeName = 'Foreign-Node';
    expect(() => projectGcpGuestBinding(input, 1700000000000)).toThrow();
  }
});
