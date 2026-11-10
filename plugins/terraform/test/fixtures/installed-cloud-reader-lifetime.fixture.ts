import { afterEach, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { admitFinalReaderReserve, type FinalReaderReserve } from '../../src/reader-final-reserve';
import type { ExecutionCaptureAdmission } from '../../src/signal-free-executor';

mock.module('../../src/linux-clock', () => ({ linuxMonotonicMs: () => 10000000 }));
const { openGcpCloudSerialReader, openInstalledGcpCloudSerialReader } = await import(
  '../../src/gcp-cloud-serial-reader'
);
const { createInstalledCaptureContext } = await import('../../src/installed-capture-context');
const { linuxMonotonicMs } = await import('../../src/linux-clock');
const { monitorOriginalInputs } = await import('../../src/original-input-monitor');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const credential = {
  type: 'authorized_user',
  client_id: 'synthetic-client',
  client_secret: 'synthetic-secret',
  refresh_token: 'synthetic-refresh',
  quota_project_id: 'example-project',
};
const info = {
  email: 'principal@example.com',
  verified_email: true,
  audience: credential.client_id,
  issued_to: credential.client_id,
  expires_in: 3599,
  scope: 'https://www.googleapis.com/auth/cloud-platform',
};
const vm = {
  id: '4996011480491275420',
  name: 'example-node',
  zone: 'https://www.googleapis.com/compute/v1/projects/example-project/zones/us-central1-a',
  creationTimestamp: '2026-11-09T00:00:00Z',
  metadata: { fingerprint: 'original-metadata', items: [] },
  networkInterfaces: [{ networkIP: '10.1.0.2' }, { networkIP: '10.2.0.2' }],
};
const retained: string[] = [];
afterEach(() => {
  retained.splice(0);
});
async function fixture(values: Array<Response | Record<string, unknown>> = [], onCompute?: () => void) {
  const root = await mkdtemp(join(tmpdir(), 'ce-cloud-serial-'));
  retained.push(root); // Diagnostics are deliberately preserved.
  const calls: Array<{ url: string; options?: RequestInit }> = [];
  let guards = 0;
  let changed = false;
  const fetcher = (async (url: string | URL | Request, options?: RequestInit) => {
    calls.push({ url: String(url), options });
    const pathname = new URL(String(url)).pathname;
    if (pathname === '/token')
      return Response.json({ access_token: 'synthetic-access', token_type: 'Bearer', expires_in: 3599 });
    if (pathname === '/oauth2/v2/tokeninfo') return Response.json(info);
    if (pathname === '/v1/projects/example-project')
      return Response.json({ projectId: 'example-project', lifecycleState: 'ACTIVE' });
    const value = values.shift();
    if (!value) throw new Error('unexpected request');
    onCompute?.();
    return value instanceof Response ? value : Response.json(value);
  }) as typeof fetch;
  const reader = await openGcpCloudSerialReader(
    {
      root,
      region: 'us-central1',
      authentication: {
        credentialBytes: Buffer.from(JSON.stringify(credential)),
        project: 'example-project',
        accountSha256: hash(info.email),
        audienceSha256: hash(credential.client_id),
        assertOriginal: async () => {
          guards++;
          if (changed) throw new Error('private credential rotated');
        },
      },
    },
    undefined,
    fetcher,
  );
  return {
    reader,
    root,
    calls,
    fetcher,
    guards: () => guards,
    change: () => {
      changed = true;
    },
  };
}

let nextPid = 740000;
async function installedFixture(past = false) {
  let expired = false;
  let onCompute = () => {};
  const f = await fixture([vm, vm, { start: '0', next: '14', contents: 'original boot\n' }, vm], () => onCompute());
  const adc = join(f.root, 'adc.private.json');
  const platform = join(f.root, 'platform.private.json');
  await writeFile(adc, JSON.stringify(credential), { mode: 0o400 });
  await writeFile(platform, '{}', { mode: 0o400 });
  const binding = async (path: string) => {
    const info = await lstat(path, { bigint: true });
    const parent = await lstat(dirname(path), { bigint: true });
    return {
      path,
      sha256: hash(await readFile(path, 'utf8')),
      expectedIdentity: Object.fromEntries(
        ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'].map((key) => [
          key,
          String(info[key as keyof typeof info]),
        ]),
      ) as Record<'dev' | 'ino' | 'uid' | 'nlink' | 'mode' | 'size' | 'mtimeNs' | 'ctimeNs', string>,
      expectedParentIdentity: {
        dev: String(parent.dev),
        ino: String(parent.ino),
        uid: String(parent.uid),
        mode: String(parent.mode),
      },
    };
  };
  const inputs = { adc: await binding(adc), platform: await binding(platform) };
  const monitor = await monitorOriginalInputs(inputs);
  const providers: Record<string, Awaited<ReturnType<typeof binding>>> = {};
  for (let i = 0; i < 6; i++) {
    const path = join(f.root, `offline-provider-${i}.private`);
    await writeFile(path, `synthetic-provider-${i}`, { mode: 0o400 });
    providers[`offline:${i}`] = await binding(path);
  }
  const start = linuxMonotonicMs() - (past ? 7201000 : 0);
  const context = createInstalledCaptureContext({
    authentication: {
      accountSha256: hash(info.email),
      audienceSha256: hash(credential.client_id),
      snapshotSha256: inputs.adc.sha256,
    },
    owner: {
      provider: 'gcp',
      engine: 'terraform',
      account: 'example-project',
      region: 'us-central1',
      deploymentId: 'ce-fixture',
    },
    executionDirectory: f.root,
    budget: { start, deadline: start + 7200000 },
    environment: {
      GOOGLE_APPLICATION_CREDENTIALS: adc,
      XCSH_API_URL: 'https://example.test',
      XCSH_API_TOKEN: 'EXAMPLE_API_TOKEN',
    },
    inputs,
    assertInputs: () => monitor.assertOriginal(),
    assertWithinDeadline: async () => {
      if (expired) throw new Error('Original installed operation deadline exhausted');
      await monitor.assertOriginal();
    },
    readProviderInputs: async () => {
      return providers;
    },
  });
  const admission: ExecutionCaptureAdmission = {
    output: Object.freeze({
      read: async () => {
        throw new Error('Synthetic fixture has no original output capability');
      },
      finish: async () => {
        throw new Error('Synthetic fixture has no original output capability');
      },
    }),
    directory: context.executionDirectory,
    args: ['apply', 'reviewed.plan'],
    stdoutPath: join(f.root, 'apply.stdout.private'),
    stderrPath: join(f.root, 'apply.stderr.private'),
    startupDeadlineMs: linuxMonotonicMs() + 15000,
    identity: { pid: ++nextPid, group: nextPid, start: '100', boot: '00000000-0000-0000-0000-000000000001' },
    originalStartMs: context.budget.start,
    originalDeadlineMs: context.budget.deadline,
  };
  return {
    f,
    context,
    monitor,
    admission,
    expire: () => {
      expired = true;
    },
    expireDuringRead: () => {
      onCompute = () => {
        expired = true;
      };
    },
    reserve: () => {
      const finalStartedMs = linuxMonotonicMs();
      return admitFinalReaderReserve({
        identity: admission.identity,
        originalStartMs: context.budget.start,
        originalDeadlineMs: context.budget.deadline,
        finalStartedMs,
        finalDeadlineMs: finalStartedMs + 300000,
        assertOriginal: context.assertInputs,
      });
    },
  };
}

test('installed cloud reads check the original deadline again before every request', async () => {
  const f = await installedFixture();
  try {
    const reader = await openInstalledGcpCloudSerialReader(f.context, undefined, f.f.fetcher);
    const calls = f.f.calls.length;
    f.expire();
    await expect(reader.instance('us-central1-a', 'example-node')).rejects.toThrow();
    expect(f.f.calls).toHaveLength(calls);
    await expect(reader.instance('us-central1-a', 'example-node')).rejects.toThrow('retired');
  } finally {
    f.monitor.close();
  }
});

test('expiry during a cloud response preserves the original body as incomplete evidence', async () => {
  const f = await installedFixture();
  try {
    const reader = await openInstalledGcpCloudSerialReader(f.context, undefined, f.f.fetcher);
    f.expireDuringRead();
    await expect(reader.instance('us-central1-a', 'example-node')).rejects.toThrow();
    const root = (await readdir(f.f.root)).find((n) => n.startsWith('gcp-cloud-capture-'));
    if (!root) throw new Error('Original capture directory required');
    const path = join(f.f.root, root);
    const receipt = (await readdir(path)).find((n) => n.endsWith('.receipt.private.json'));
    if (!receipt) throw new Error('Incomplete capture receipt required');
    const evidence = JSON.parse(await readFile(join(path, receipt), 'utf8'));
    expect(evidence.complete).toBe(false);
    expect(await readFile(evidence.path, 'utf8')).toBe(JSON.stringify(vm));
  } finally {
    f.monitor.close();
  }
});

test('an expired original clock refuses even when an input-only callback still succeeds', async () => {
  const f = await installedFixture(true);
  try {
    const calls = f.f.calls.length;
    await expect(openInstalledGcpCloudSerialReader(f.context, undefined, f.f.fetcher)).rejects.toThrow();
    expect(f.f.calls).toHaveLength(calls);
  } finally {
    f.monitor.close();
  }
});

test('an admitted fixed parent reserve permits final cloud and serial reads after operation expiry', async () => {
  const f = await installedFixture(true);
  try {
    f.expire();
    const reader = await openInstalledGcpCloudSerialReader(f.context, undefined, f.f.fetcher, {
      admission: f.admission,
      reserve: f.reserve(),
    });
    const original = await reader.instance('us-central1-a', 'example-node');
    if (!original.present) throw new Error('Original VM required');
    expect((await reader.serial(original, '0')).instanceId).toBe(vm.id);
    expect(f.context.budget.deadline).toBe(f.admission.originalDeadlineMs);
  } finally {
    f.monitor.close();
  }
});

test('cloned reserves and foreign original admissions refuse before authentication', async () => {
  const f = await installedFixture();
  try {
    const reserve = f.reserve();
    const calls = f.f.calls.length;
    for (const final of [
      { admission: f.admission, reserve: { ...reserve } as FinalReaderReserve },
      { admission: { ...f.admission, directory: '/tmp/foreign' }, reserve },
      { admission: { ...f.admission, args: ['plan'] }, reserve },
      { admission: { ...f.admission, identity: { ...f.admission.identity, pid: nextPid + 1 } }, reserve },
      { admission: { ...f.admission, originalDeadlineMs: f.admission.originalDeadlineMs + 1 }, reserve },
    ]) {
      await expect(openInstalledGcpCloudSerialReader(f.context, undefined, f.f.fetcher, final)).rejects.toThrow();
      expect(f.f.calls).toHaveLength(calls);
    }
  } finally {
    f.monitor.close();
  }
});
