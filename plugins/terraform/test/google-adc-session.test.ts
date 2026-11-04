import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmod, link, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type GoogleAdcLease, openGoogleAdcSession } from '../src/google-adc-session';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const principal = 'principal@example.com';
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'google-adc-session-'));
  roots.push(directory);
  const owner = {
    deploymentId: 'ce-fixture',
    provider: 'gcp' as const,
    engine: 'terraform' as const,
    account: 'example-project',
    region: 'us-central1',
  };
  const snapshotPath = join(directory, 'adc.private.json');
  const bytes = JSON.stringify({
    type: 'authorized_user',
    client_id: 'fixture-client',
    client_secret: 'synthetic-client-secret',
    refresh_token: 'synthetic-refresh-token',
    quota_project_id: owner.account,
  });
  await writeFile(snapshotPath, bytes, { mode: 0o400 });
  let latched = false;
  let checks = 0;
  const lease: GoogleAdcLease = {
    schemaVersion: 1,
    kind: 'google-adc-snapshot',
    owner,
    snapshotPath,
    snapshotSha256: hash(bytes),
    accountSha256: hash('principal@example.com'),
    audienceSha256: hash('fixture-client'),
    authenticationReceiptSha256: hash('fresh-authentication'),
    qualificationSha256: hash('reviewed-linux-expiry'),
    verifiedAt: Date.now(),
    expiresNoEarlierThan: Date.now() + 3600000,
    closeAfterExecutorExit: async () => {},
    assertOriginal: async () => {
      checks++;
      if (latched) throw new Error('original input monitor refused');
    },
  };
  const expected = {
    owner,
    directory,
    accountSha256: lease.accountSha256,
    audienceSha256: lease.audienceSha256,
    qualificationSha256: lease.qualificationSha256,
  };
  return {
    directory,
    bytes,
    lease,
    expected,
    latch: () => {
      latched = true;
    },
    checks: () => checks,
  };
}
test('owned reviewed ADC returns only its snapshot path and validates both invocation boundaries', async () => {
  const f = await fixture();
  const session = await openGoogleAdcSession(f.lease, f.expected);
  expect(session.environment()).toEqual({ GOOGLE_APPLICATION_CREDENTIALS: f.lease.snapshotPath });
  expect(JSON.stringify(session.environment())).not.toContain('synthetic-refresh-token');
  await session.verify({ PATH: '/usr/bin', ...session.environment() });
  await session.verify({ ...session.environment() });
  expect(f.checks()).toBeGreaterThanOrEqual(3);
});
test('wrong owner principal audience qualification and stale or future authentication refuse', async () => {
  const f = await fixture();
  for (const changed of [
    { owner: { ...f.lease.owner, engine: 'native' } },
    { owner: { ...f.lease.owner, account: 'example-foreign-project' } },
    { accountSha256: hash('foreign') },
    { audienceSha256: hash('foreign') },
    { qualificationSha256: hash('foreign') },
    { verifiedAt: Date.now() - 300001 },
    { verifiedAt: Date.now() + 60000 },
    { expiresNoEarlierThan: Date.now() + 60000 },
  ])
    await expect(openGoogleAdcSession({ ...f.lease, ...changed } as GoogleAdcLease, f.expected)).rejects.toThrow();
});
test('static credentials alternate sources and wrong snapshot paths refuse before execution', async () => {
  const f = await fixture();
  const session = await openGoogleAdcSession(f.lease, f.expected);
  for (const key of [
    'GOOGLE_OAUTH_ACCESS_TOKEN',
    'GOOGLE_ACCESS_TOKEN',
    'GOOGLE_CREDENTIALS',
    'GOOGLE_IMPERSONATE_SERVICE_ACCOUNT',
    'GOOGLE_IMPERSONATE_SERVICE_ACCOUNT_DELEGATES',
    'GCLOUD_KEYFILE_JSON',
    'GOOGLE_CLOUD_KEYFILE_JSON',
  ]) {
    await expect(session.verify({ ...session.environment(), [key]: 'foreign-value' })).rejects.toThrow();
    await expect(session.verify({ ...session.environment(), [key]: '' })).rejects.toThrow();
  }
  await expect(session.verify({ GOOGLE_APPLICATION_CREDENTIALS: '/foreign/adc.json' })).rejects.toThrow();
});
test('rotation restore symlinks hardlinks and permission changes retain refusal', async () => {
  for (const change of ['rotation', 'restore', 'symlink', 'hardlink', 'permissions', 'monitor']) {
    const f = await fixture();
    const session = await openGoogleAdcSession(f.lease, f.expected);
    if (change === 'rotation' || change === 'restore') {
      await chmod(f.lease.snapshotPath, 0o600);
      await writeFile(f.lease.snapshotPath, 'changed');
      if (change === 'restore') {
        await writeFile(f.lease.snapshotPath, f.bytes);
        await chmod(f.lease.snapshotPath, 0o400);
      }
    }
    if (change === 'symlink') {
      const other = join(f.directory, 'other');
      await writeFile(other, f.bytes, { mode: 0o400 });
      await rm(f.lease.snapshotPath);
      await symlink(other, f.lease.snapshotPath);
    }
    if (change === 'hardlink') await link(f.lease.snapshotPath, join(f.directory, 'alias'));
    if (change === 'permissions') await chmod(f.lease.snapshotPath, 0o644);
    if (change === 'monitor') f.latch();
    await expect(session.verify(session.environment())).rejects.toThrow();
  }
});
test('unsupported ADC types or project and client mismatches cannot consume reviewed hashes', async () => {
  const f = await fixture();
  for (const change of [
    { type: 'service_account' },
    { type: 'external_account' },
    { client_id: 'foreign-client' },
    { quota_project_id: 'example-foreign-project' },
    { refresh_token: '' },
  ]) {
    const bytes = JSON.stringify({ ...JSON.parse(f.bytes), ...change });
    await chmod(f.lease.snapshotPath, 0o600);
    await writeFile(f.lease.snapshotPath, bytes);
    await chmod(f.lease.snapshotPath, 0o400);
    await expect(openGoogleAdcSession({ ...f.lease, snapshotSha256: hash(bytes) }, f.expected)).rejects.toThrow();
  }
});
test('snapshot outside owned workspace and replaced private directory are refused', async () => {
  const f = await fixture();
  const foreign = join(f.directory, 'foreign');
  await mkdir(foreign, { mode: 0o700 });
  await expect(openGoogleAdcSession(f.lease, { ...f.expected, directory: foreign })).rejects.toThrow();
  const session = await openGoogleAdcSession(f.lease, f.expected);
  await chmod(f.directory, 0o755);
  await expect(session.verify(session.environment())).rejects.toThrow();
});

test('disposal requires independent original executor closure and remains retired after a refusal', async () => {
  const f = await fixture();
  let originalClosed = false;
  let closureChecks = 0;
  Object.assign(f.lease, {
    closeAfterExecutorExit: async () => {
      closureChecks++;
      if (!originalClosed) throw new Error('original executor group remains live');
    },
  });
  const session = await openGoogleAdcSession(f.lease, f.expected);
  expect(typeof session.close).toBe('function');
  await expect(session.close()).rejects.toThrow('remains live');
  await expect(session.verify(session.environment())).rejects.toThrow();
  originalClosed = true;
  await session.close();
  await session.close();
  expect(closureChecks).toBe(2);
  await expect(session.verify(session.environment())).rejects.toThrow();
});
test('latched input failure still allows independently proven closure without clearing refusal', async () => {
  const f = await fixture();
  let closures = 0;
  Object.assign(f.lease, {
    closeAfterExecutorExit: async () => {
      closures++;
    },
  });
  const session = await openGoogleAdcSession(f.lease, f.expected);
  f.latch();
  await expect(session.verify(session.environment())).rejects.toThrow();
  await Promise.all([session.close(), session.close()]);
  expect(closures).toBe(1);
  await expect(session.verify(session.environment())).rejects.toThrow();
});

test('unqualified ADC token endpoints domains principals and control characters refuse reviewed hashes', async () => {
  for (const change of [
    { token_uri: 'https://foreign.example.test/token' },
    { token_uri: null },
    { universe_domain: 'foreign.example.test' },
    { account: 'EXAMPLE_FOREIGN_ACCOUNT' },
    { account: false },
    { client_secret: 'synthetic\nclient-secret' },
    { refresh_token: 'synthetic\rrefresh-token' },
    { refresh_token: 'synthetic\u0000refresh-token' },
  ]) {
    const f = await fixture();
    const bytes = JSON.stringify({ ...JSON.parse(f.bytes), ...change });
    await chmod(f.lease.snapshotPath, 0o600);
    await writeFile(f.lease.snapshotPath, bytes);
    await chmod(f.lease.snapshotPath, 0o400);
    await expect(openGoogleAdcSession({ ...f.lease, snapshotSha256: hash(bytes) }, f.expected)).rejects.toThrow(
      'verification failed',
    );
  }
});
test('documented ADC defaults and independently matched optional account remain supported', async () => {
  const f = await fixture();
  const bytes = JSON.stringify({
    ...JSON.parse(f.bytes),
    token_uri: 'https://oauth2.googleapis.com/token',
    universe_domain: 'googleapis.com',
    account: principal,
  });
  await chmod(f.lease.snapshotPath, 0o600);
  await writeFile(f.lease.snapshotPath, bytes);
  await chmod(f.lease.snapshotPath, 0o400);
  const session = await openGoogleAdcSession({ ...f.lease, snapshotSha256: hash(bytes) }, f.expected);
  await session.verify(session.environment());
  await session.close();
});
