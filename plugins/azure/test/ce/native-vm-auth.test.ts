import { afterEach, expect, test } from 'bun:test';
import { createPrivateKey, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { AzExecApi } from '../../src/az/exec';
import { canonicalSha256 } from '../../src/ce/canonical';
import { persistAzureNativeSource } from '../../src/ce/native-action-evidence';
import { observeAzureNativeVmAuthentication, prepareAzureNativeVmAuthentication } from '../../src/ce/native-vm-auth';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ce-native-vm-auth-'));
  roots.push(root);
  const plan = compileAzureCePlan(
    { ...intent, engine: 'native', topology: { ha: false } },
    structuredClone(observation),
  );
  const store = await CeDeploymentStore.open(join(root, 'state'), azureUpgradeBinding(plan).owner);
  await persistAzureNativeSource(plan, store);
  await store.write('native-site.json', {
    siteName: plan.siteName,
    uid: '00000000-0000-0000-0000-000000000099',
    owner: store.owner,
    contractFingerprint: 'sha256:' + 'a'.repeat(64),
  });
  const action = plan.actions.find((a) => a.kind === 'vm-create');
  if (!action) throw Error('Fixture requires an actual planned VM-create action');
  return { root, plan, store, action };
}

test('prepares a private owned RSA4096 credential and an independently readable OpenSSH public key', async () => {
  const f = await fixture();
  const auth = await prepareAzureNativeVmAuthentication(f.plan, f.action, f.store);
  expect(auth.adminUsername).toBe('azureuser');
  expect(auth.publicKey).toMatch(/^ssh-rsa [A-Za-z0-9+/]+=*$/);
  expect(auth.profileId).toMatch(/^[a-f0-9]{64}$/);
  expect('privateKey' in auth).toBe(false);
  expect(JSON.stringify(auth)).not.toContain('PRIVATE KEY');
  const record = (await f.store.read(auth.recordName)) as {
    privateKey: string;
    publicKey: string;
    binding: unknown;
    phase: string;
  };
  expect(createPrivateKey(record.privateKey).asymmetricKeyDetails?.modulusLength).toBe(4096);
  expect(record.publicKey).toBe(auth.publicKey);
  expect(record.phase).toBe('prepared');
  const pub = join(f.root, 'synthetic-owned.pub');
  await writeFile(pub, auth.publicKey + '\n', { mode: 0o600 });
  const sshKeygen = Bun.which('ssh-keygen');
  if (!sshKeygen) throw new Error('Independent RSA4096 validation requires ssh-keygen on PATH');
  const parsed = Bun.spawnSync([sshKeygen, '-l', '-f', pub, '-E', 'sha256']);
  expect(parsed.exitCode).toBe(0);
  expect(parsed.stdout.toString()).toMatch(/^4096 SHA256:/);
});

test('resumes the same profile without generating or rewriting another credential', async () => {
  const f = await fixture();
  const first = await prepareAzureNativeVmAuthentication(f.plan, f.action, f.store);
  const before = canonicalSha256(await f.store.read(first.recordName));
  const second = await prepareAzureNativeVmAuthentication(f.plan, f.action, f.store);
  expect(second).toEqual(first);
  expect(canonicalSha256(await f.store.read(first.recordName))).toBe(before);
});

test('rejects foreign owner metadata without replacing the recorded credential', async () => {
  const f = await fixture();
  const auth = await prepareAzureNativeVmAuthentication(f.plan, f.action, f.store);
  const record = (await f.store.read(auth.recordName)) as Record<string, unknown>;
  record.binding = {
    ...(record.binding as Record<string, unknown>),
    owner: { ...f.store.owner, account: randomUUID() },
  };
  await f.store.write(auth.recordName, record);
  const before = canonicalSha256(record);
  await expect(prepareAzureNativeVmAuthentication(f.plan, f.action, f.store)).rejects.toThrow(
    /authentication.*(binding|owner)/i,
  );
  expect(canonicalSha256(await f.store.read(auth.recordName))).toBe(before);
});

test('rejects a changed public key rather than falling back to an execution-user key', async () => {
  const f = await fixture();
  const auth = await prepareAzureNativeVmAuthentication(f.plan, f.action, f.store);
  const record = (await f.store.read(auth.recordName)) as Record<string, unknown>;
  record.publicKey = 'synthetic-invalid-public-key';
  await f.store.write(auth.recordName, record);
  await expect(prepareAzureNativeVmAuthentication(f.plan, f.action, f.store)).rejects.toThrow(/authentication.*key/i);
});

test('rejects a source-registry mismatch before any credential is created', async () => {
  const f = await fixture();
  await f.store.write('native-source-' + f.plan.planSha256 + '.json', { kind: 'foreign' });
  const before = (await readdir(f.store.directory)).sort();
  await expect(prepareAzureNativeVmAuthentication(f.plan, f.action, f.store)).rejects.toThrow(
    /authentication.*source/i,
  );
  expect((await readdir(f.store.directory)).sort()).toEqual(before);
});

test('refuses credential generation after native lifecycle retirement begins', async () => {
  const f = await fixture();
  await f.store.write('azure-native-lifecycle-retirement.json', { schemaVersion: 1 });
  const before = (await readdir(f.store.directory)).sort();
  await expect(prepareAzureNativeVmAuthentication(f.plan, f.action, f.store)).rejects.toThrow(/authentication.*retir/i);
  expect((await readdir(f.store.directory)).sort()).toEqual(before);
});

test('does not generate another key when the private credential disappears after issuance', async () => {
  const f = await fixture();
  const auth = await prepareAzureNativeVmAuthentication(f.plan, f.action, f.store);
  await f.store.remove(auth.recordName);
  const before = (await readdir(f.store.directory)).sort();
  await expect(prepareAzureNativeVmAuthentication(f.plan, f.action, f.store)).rejects.toThrow(
    /authentication.*(missing|unavailable)/i,
  );
  expect((await readdir(f.store.directory)).sort()).toEqual(before);
});

test('rejects unrecognized secret-bearing fields in a credential record', async () => {
  const f = await fixture();
  const auth = await prepareAzureNativeVmAuthentication(f.plan, f.action, f.store);
  const record = (await f.store.read(auth.recordName)) as Record<string, unknown>;
  record.unrecognizedSecretCopy = record.privateKey;
  await f.store.write(auth.recordName, record);
  await expect(prepareAzureNativeVmAuthentication(f.plan, f.action, f.store)).rejects.toThrow(
    /authentication.*fields/i,
  );
});

async function installedVmFixture() {
  const f = await fixture();
  const auth = await prepareAzureNativeVmAuthentication(f.plan, f.action, f.store);
  const vm = {
    id: f.action.resourceId,
    name: `${f.plan.deploymentName}-${f.action.node}`,
    location: f.plan.region,
    vmId: '00000000-0000-0000-0000-000000000071',
    tags: {
      'xcsh-managed-by': 'azure-ce',
      'xcsh-execution-engine': 'native',
      'xcsh-deployment-id': f.plan.deploymentName,
      'xcsh-plan-sha256': f.plan.planSha256,
    },
    osProfile: {
      adminUsername: 'azureuser',
      linuxConfiguration: {
        disablePasswordAuthentication: true,
        ssh: {
          publicKeys: [{ path: posix.join('/home', 'azureuser', '.ssh', 'authorized_keys'), keyData: auth.publicKey }],
        },
      },
    },
  };
  const api: AzExecApi = {
    exec: async (_command, args) => {
      expect(args).toContain(f.action.resourceId as string);
      expect(args).toContain(f.plan.subscription.id);
      return { exitCode: 0, stdout: JSON.stringify(vm), stderr: '' };
    },
  };
  return { ...f, auth, vm, api };
}

test('records installed credential identity only after exact VM and OS-profile observations', async () => {
  const f = await installedVmFixture();
  const observed = await observeAzureNativeVmAuthentication(f.plan, f.action, f.store, f.api);
  expect(observed.status).toBe('installed');
  expect(observed.vmId).toBe(f.vm.vmId);
  const record = (await f.store.read(f.auth.recordName)) as Record<string, unknown>;
  expect(record.phase).toBe('installed');
  expect(record.vmId).toBe(f.vm.vmId);
  expect(await prepareAzureNativeVmAuthentication(f.plan, f.action, f.store)).toEqual(f.auth);
});
for (const corruption of ['key', 'administrator', 'owner', 'uuid', 'password'] as const)
  test(`rejects ${corruption} mismatch without publishing installed identity`, async () => {
    const f = await installedVmFixture();
    if (corruption === 'key') f.vm.osProfile.linuxConfiguration.ssh.publicKeys[0].keyData = 'synthetic-foreign-key';
    if (corruption === 'administrator') f.vm.osProfile.adminUsername = 'foreign-user';
    if (corruption === 'owner') f.vm.tags['xcsh-plan-sha256'] = 'b'.repeat(64);
    if (corruption === 'uuid') f.vm.vmId = 'unresolved';
    if (corruption === 'password') f.vm.osProfile.linuxConfiguration.disablePasswordAuthentication = false;
    await expect(observeAzureNativeVmAuthentication(f.plan, f.action, f.store, f.api)).rejects.toThrow(
      /authentication/i,
    );
    expect(((await f.store.read(f.auth.recordName)) as Record<string, unknown>).phase).toBe('prepared');
  });

test('does not create credentials when an installation observation cannot read the issued key', async () => {
  const f = await fixture();
  const before = (await readdir(f.store.directory)).sort();
  let called = false;
  const api: AzExecApi = {
    exec: async () => {
      called = true;
      throw Error('unexpected provider read');
    },
  };
  await expect(observeAzureNativeVmAuthentication(f.plan, f.action, f.store, api)).rejects.toThrow(
    /authentication.*(missing|unavailable)/i,
  );
  expect(called).toBe(false);
  expect((await readdir(f.store.directory)).sort()).toEqual(before);
});

test('retains the original immutable VM UUID across a repeated installation read', async () => {
  const f = await installedVmFixture();
  await observeAzureNativeVmAuthentication(f.plan, f.action, f.store, f.api);
  f.vm.vmId = '00000000-0000-0000-0000-000000000072';
  await expect(observeAzureNativeVmAuthentication(f.plan, f.action, f.store, f.api)).rejects.toThrow(
    /authentication.*identity/i,
  );
  expect(((await f.store.read(f.auth.recordName)) as Record<string, unknown>).vmId).toBe(
    '00000000-0000-0000-0000-000000000071',
  );
});

test('native VM-create plans carry explicit owned authentication instead of CLI user defaults', async () => {
  const f = await fixture();
  const args = f.action.args as string[];
  const value = (name: string) => args[args.indexOf(name) + 1];
  expect(args).toContain('--admin-username');
  expect(value('--admin-username')).toBe('azureuser');
  expect(value('--authentication-type')).toBe('ssh');
  expect(value('--ssh-key-values')).toBe(`__NODE_${f.action.node}_SSH_PUBLIC_KEY__`);
  expect(args).not.toContain('--generate-ssh-keys');
});

for (const operation of ['prepare', 'observe'] as const) {
  test(`native VM credential ${operation} shares the parent lifecycle mutation lock`, async () => {
    const f = await installedVmFixture();
    const { acquireProcessLock } = await import('../../../platform/src/ce/process-lock');
    const unlock = await acquireProcessLock(join(f.store.directory, '.azure-relay-native-mutation-lock'));
    const before = canonicalSha256(await f.store.read(f.auth.recordName));
    let providerCalled = false;
    const api: AzExecApi = {
      exec: async () => {
        providerCalled = true;
        return { exitCode: 0, stdout: JSON.stringify(f.vm), stderr: '' };
      },
    };
    try {
      const pending =
        operation === 'prepare'
          ? prepareAzureNativeVmAuthentication(f.plan, f.action, f.store)
          : observeAzureNativeVmAuthentication(f.plan, f.action, f.store, api);
      await expect(pending).rejects.toThrow(/lock.*live process/);
      expect(providerCalled).toBe(false);
      expect(canonicalSha256(await f.store.read(f.auth.recordName))).toBe(before);
    } finally {
      await unlock();
    }
  });
}

test('installation observer preserves the safe native MFA category without public stderr', async () => {
  const f = await installedVmFixture();
  const api: AzExecApi = {
    exec: async () => ({ exitCode: 1, stdout: '', stderr: 'AADSTS50076 synthetic-private-marker' }),
  };
  let caught: unknown;
  try {
    await observeAzureNativeVmAuthentication(f.plan, f.action, f.store, api);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect((caught as { errorType?: string }).errorType).toBe('auth_required');
  expect((caught as { vendorCode?: string }).vendorCode).toBe('AADSTS50076');
  expect(String(caught)).not.toContain('synthetic-private-marker');
  expect(((await f.store.read(f.auth.recordName)) as Record<string, unknown>).phase).toBe('prepared');
});
for (const boundary of ['before-private', 'after-private', 'before-issuer', 'after-issuer'] as const) {
  test(`native credential preparation resumes after ${boundary} interruption without replacing persisted key material`, async () => {
    const f = await fixture();
    const write = f.store.write.bind(f.store);
    const reserve = f.store.reserve.bind(f.store);
    let interrupted = false;
    f.store.write = async (name, value, signal) => {
      const selected = name.startsWith('native-vm-auth-') && !name.endsWith('-issued.json');
      if (selected && boundary === 'before-private' && !interrupted) {
        interrupted = true;
        throw Error('synthetic interrupted credential preparation');
      }
      await write(name, value, signal);
      if (selected && boundary === 'after-private' && !interrupted) {
        interrupted = true;
        throw Error('synthetic interrupted credential preparation');
      }
    };
    f.store.reserve = async (name, value) => {
      const selected = name.startsWith('native-vm-auth-') && name.endsWith('-issued.json');
      if (selected && boundary === 'before-issuer' && !interrupted) {
        interrupted = true;
        throw Error('synthetic interrupted credential preparation');
      }
      const result = await reserve(name, value);
      if (selected && boundary === 'after-issuer' && !interrupted) {
        interrupted = true;
        throw Error('synthetic interrupted credential preparation');
      }
      return result;
    };
    await expect(prepareAzureNativeVmAuthentication(f.plan, f.action, f.store)).rejects.toThrow(
      'synthetic interrupted credential preparation',
    );
    expect(interrupted).toBe(true);
    f.store.write = write;
    f.store.reserve = reserve;
    const recordName = `native-vm-auth-${f.plan.planSha256}-${f.action.node}.json`;
    let prior: Record<string, unknown> | undefined;
    try {
      prior = (await f.store.read(recordName)) as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const resumed = await prepareAzureNativeVmAuthentication(f.plan, f.action, f.store);
    expect(resumed.adminUsername).toBe('azureuser');
    expect(resumed.publicKey).toMatch(/^ssh-rsa [A-Za-z0-9+/]+=*$/);
    if (prior) {
      expect(resumed.publicKey).toBe(prior.publicKey);
      expect(canonicalSha256(await f.store.read(recordName))).toBe(canonicalSha256(prior));
    }
    expect(await prepareAzureNativeVmAuthentication(f.plan, f.action, f.store)).toEqual(resumed);
  });
}

test('refuses to publish a public key whose private record disappeared during preparation', async () => {
  const f = await fixture();
  const write = f.store.write.bind(f.store);
  f.store.write = async (name, value, signal) => {
    await write(name, value, signal);
    if (name.startsWith('native-vm-auth-') && !name.endsWith('-issued.json')) await f.store.remove(name);
  };
  await expect(prepareAzureNativeVmAuthentication(f.plan, f.action, f.store)).rejects.toThrow(
    /issued key is unavailable/,
  );
  f.store.write = write;
  await expect(prepareAzureNativeVmAuthentication(f.plan, f.action, f.store)).rejects.toThrow(
    /issued key is unavailable/,
  );
});

test('does not recreate issuance proof for an installed credential whose issuance proof disappeared', async () => {
  const f = await installedVmFixture();
  await observeAzureNativeVmAuthentication(f.plan, f.action, f.store, f.api);
  const before = canonicalSha256(await f.store.read(f.auth.recordName));
  await f.store.remove(f.auth.recordName.replace('.json', '-issued.json'));
  await expect(prepareAzureNativeVmAuthentication(f.plan, f.action, f.store)).rejects.toThrow(
    /unissued credential phase differs/,
  );
  expect(canonicalSha256(await f.store.read(f.auth.recordName))).toBe(before);
});
