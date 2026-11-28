/** Source qualification: real original files/storage/runner guards; synthetic GCP/XC observations. */
import { expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { readOwnedInstalledInput } from '../../../terraform/src/installed-runtime';
import type { OriginalInputBinding } from '../../../terraform/src/original-input-monitor';
import { TerraformRunner } from '../../../terraform/src/runner';
import * as admissionSource from '../../src/ce/capture-cleanup-admission';
import {
  persistGcpCaptureCleanupOrigin,
  persistGcpCaptureCleanupReview,
  resumeGcpCaptureCleanupOrigin,
} from '../../src/ce/capture-cleanup-durable';
import { fingerprint } from '../../src/ce/discovery';
import type { PublicTerraformCleanupReview } from '../../src/ce/terraform-public-teardown';
import { gcpCleanupAdmissionFixture } from './capture-cleanup-admission.test';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function fixture(subset: 'all' | 'empty' = 'all') {
  const f = await gcpCleanupAdmissionFixture();
  if (subset === 'empty') {
    f.state.resources = [];
    for (const address of f.addresses) f.fields[address] = null;
    f.live.clear();
    await f.refreshState();
  }
  const readerInputs: Record<string, OriginalInputBinding> = {};
  for (const name of ['claim.json', 'lifetime.json', 'capture-unresolved.json'])
    readerInputs[`lock:${name}`] = (await readOwnedInstalledInput(join(f.lock, name))).binding;
  const environment = { XCSH_API_URL: 'https://tenant.example.test' };
  f.inspection.environment = environment;
  const common = {
    intent: f.i,
    executionDirectory: f.directory,
    environment,
    api: f.api,
    observePlatform: f.runtime.observePlatform,
    assertIndependentClosure: async (bindings: typeof readerInputs) => {
      expect(bindings).toEqual(readerInputs);
    },
  };
  const persisted = await persistGcpCaptureCleanupOrigin({ ...common, inspection: f.inspection, readerInputs });
  const args = () => ({ ...common, reference: persisted.reference });
  const review = async (ageMs = 0) => {
    const stateBytes = await readFile(join(f.directory, 'terraform.tfstate'));
    const planBytes = Buffer.from('reviewed-source-destroy');
    const receipt = {
      ...f.receipt,
      operation: 'destroy' as const,
      noChanges: f.state.resources.length === 0,
      planSha256: hash(planBytes),
      changes: f.state.resources.map((row) => ({
        address: `${row.type}.${row.name}`,
        type: row.type,
        actions: ['delete'],
      })),
    };
    await writeFile(join(f.directory, 'saved.tfplan'), planBytes, { mode: 0o600 });
    await writeFile(join(f.directory, 'plan-receipt.json'), JSON.stringify({ state: 'planned', receipt }), {
      mode: 0o600,
    });
    const body = {
      schemaVersion: 3,
      operation: 'teardown',
      engine: 'terraform',
      intentFingerprint: fingerprint(f.i),
      ownershipHash: fingerprint(persisted.ownership),
      state: { sha256: hash(stateBytes), lineage: f.state.lineage, serial: f.state.serial },
      savedPlan: receipt,
      remaining: receipt.changes.map((row) => row.address),
      projectionHash: fingerprint(f.fields),
      originalAuthorization: {
        planHash: fingerprint('original-source-review'),
        receiptFingerprint: fingerprint(f.receipt),
        intentFingerprint: fingerprint(f.i),
      },
      createdAt: new Date(Date.now() - ageMs).toISOString(),
    };
    const reviewed = { ...body, planHash: fingerprint(body) } as unknown as PublicTerraformCleanupReview;
    const recorded = await persistGcpCaptureCleanupReview({ ...args(), review: reviewed });
    return { recorded, reviewed, receipt };
  };
  return { ...f, common, persisted, args, review };
}

test('durable original GCP admission resumes through new storage and source instances without any Terraform submission', async () => {
  const f = await fixture(),
    before = f.commands.length,
    lock = await readFile(join(f.lock, 'capture-unresolved.json'));
  const first = await resumeGcpCaptureCleanupOrigin(f.args());
  try {
    expect(first.mode).toBe('original');
    expect(first.recovery.resources).toHaveLength(21);
    expect(first.executionAuthorized).toBe(false);
  } finally {
    first.close();
  }
  const second = await resumeGcpCaptureCleanupOrigin(f.args());
  second.close();
  expect(f.commands).toHaveLength(before);
  expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toEqual(lock);
});

test('durable planned cleanup preserves reviewed state and refuses restoration of a replaced original record', async () => {
  const f = await fixture(),
    { recorded } = await f.review();
  const resumed = await resumeGcpCaptureCleanupOrigin({ ...f.args(), reviewReference: recorded.reference });
  expect(resumed.mode).toBe('planned-destroy');
  expect(resumed.recovery.resources).toHaveLength(21);
  resumed.close();
  const path = f.persisted.reference.binding.path,
    bytes = await readFile(path);
  await rename(path, `${path}.original`);
  await writeFile(path, bytes, { mode: 0o400, flag: 'wx' });
  await expect(resumeGcpCaptureCleanupOrigin(f.args())).rejects.toThrow();
});

test('interrupted partial cleanup resumes only its original surviving subset and cannot replay the applying destroy receipt', async () => {
  const f = await fixture(),
    { recorded, receipt } = await f.review();
  const removed = f.addresses[0];
  f.state.resources = f.state.resources.filter((row) => `${row.type}.${row.name}` !== removed);
  f.state.serial++;
  f.fields[removed] = null;
  f.live.delete(f.scope[0].selfLink);
  await f.refreshState();
  await writeFile(join(f.directory, 'plan-receipt.json'), JSON.stringify({ state: 'applying', receipt }), {
    mode: 0o600,
  });
  const before = f.commands.length;
  const resumed = await resumeGcpCaptureCleanupOrigin({ ...f.args(), reviewReference: recorded.reference });
  try {
    expect(resumed.mode).toBe('partial-replan-required');
    expect(resumed.requiresNewReviewedPlan).toBe(true);
    expect(resumed.recovery.resources).toHaveLength(20);
    const runner = new TerraformRunner(dirname(f.directory), f.inspection.execute, resumed.recovery);
    await runner.resume(f.i.deploymentName);
    await expect(runner.apply(receipt, {})).rejects.toThrow();
    expect(f.commands).toHaveLength(before);
  } finally {
    resumed.close();
  }
});

test('observed completed cleanup recovers an effect proof without rewriting the applying journal or submitting apply', async () => {
  const f = await fixture(),
    { recorded, receipt } = await f.review();
  f.state.resources = [];
  f.state.serial++;
  for (const address of f.addresses) f.fields[address] = null;
  f.live.clear();
  await f.refreshState();
  await writeFile(join(f.directory, 'plan-receipt.json'), JSON.stringify({ state: 'applying', receipt }), {
    mode: 0o600,
  });
  const journal = await readFile(join(f.directory, 'plan-receipt.json')),
    before = f.commands.length;
  const resumed = await resumeGcpCaptureCleanupOrigin({ ...f.args(), reviewReference: recorded.reference });
  try {
    expect(resumed.mode).toBe('completed-readonly');
    expect(resumed.recovery.verification?.kind).toBe('applied-destroy-state-verification');
    const runner = new TerraformRunner(dirname(f.directory), f.inspection.execute, resumed.recovery);
    await runner.resume(f.i.deploymentName);
    await expect(runner.apply(receipt, {})).rejects.toThrow('verification');
    expect(f.commands).toHaveLength(before);
    expect(await readFile(join(f.directory, 'plan-receipt.json'))).toEqual(journal);
  } finally {
    resumed.close();
  }
});

for (const mode of [
  'replacement',
  'foreign-state',
  'rollback',
  'reader-live',
  'wrong-owner',
  'missing-review',
] as const)
  test(`durable resume refuses unresolved source or ownership changes: ${mode}`, async () => {
    const f = await fixture(),
      { recorded, receipt } = await f.review();
    if (mode === 'replacement') {
      const value = f.live.get(f.scope[0].selfLink);
      if (!value) throw new Error('Original fixture VM required');
      value.id = '999999';
    }
    if (mode === 'foreign-state') {
      f.state.resources[0].instances[0].attributes.id = 'foreign';
      f.state.serial++;
      await f.refreshState();
    }
    if (mode === 'rollback') {
      f.state.serial = 0;
      await f.refreshState();
    }
    if (mode === 'reader-live')
      f.common.assertIndependentClosure = async () => {
        throw new Error('Original reader remains live');
      };
    if (mode === 'wrong-owner') f.i.project = 'foreign-project';
    if (mode === 'missing-review') {
      f.state.resources = [];
      f.state.serial++;
      for (const address of f.addresses) f.fields[address] = null;
      f.live.clear();
      await f.refreshState();
      await writeFile(join(f.directory, 'plan-receipt.json'), JSON.stringify({ state: 'applying', receipt }), {
        mode: 0o600,
      });
    }
    const before = f.commands.length;
    await expect(
      resumeGcpCaptureCleanupOrigin({
        ...f.args(),
        ...(mode !== 'missing-review' ? { reviewReference: recorded.reference } : {}),
      }),
    ).rejects.toThrow();
    expect(f.commands).toHaveLength(before);
  });

test('durable GCP snapshots use shared immutable Platform storage', async () => {
  const f = await fixture();
  const store = await CeDeploymentStore.open(join(f.directory, 'capture-cleanup-verification', 'admissions'), {
    provider: 'gcp',
    engine: 'terraform',
    account: f.i.project,
    region: f.i.region,
    deploymentId: f.i.deploymentName,
  });
  expect(await store.readImmutableBytes(f.persisted.reference)).toBeDefined();
});

test('durable original context accepts credential rotation at the same endpoint and rejects a changed destination', async () => {
  const f = await fixture();
  Object.assign(f.common.environment, { XCSH_API_TOKEN: 'synthetic-rotated-credential' });
  const resumed = await resumeGcpCaptureCleanupOrigin(f.args());
  resumed.close();
  f.common.environment.XCSH_API_URL = 'https://different.example.test';
  await expect(resumeGcpCaptureCleanupOrigin(f.args())).rejects.toThrow('context');
});

test('immutable cleanup reviews refuse stale and future timestamps without creating authority', async () => {
  const f = await fixture();
  await expect(f.review(600001)).rejects.toThrow('stale');
  await expect(f.review(-10000)).rejects.toThrow('stale');
});

test('concurrent durable resumes cannot claim the same original recovery while one observer is running', async () => {
  const f = await fixture();
  let entered: (() => void) | undefined, release: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = f.api.exec;
  let blocked = true;
  f.api.exec = async (...args) => {
    if (blocked) {
      blocked = false;
      entered?.();
      await gate;
    }
    return original(...args);
  };
  const first = resumeGcpCaptureCleanupOrigin(f.args());
  await waiting;
  try {
    await expect(resumeGcpCaptureCleanupOrigin(f.args())).rejects.toThrow();
  } finally {
    release?.();
    (await first).close();
  }
});

test('a new Bun process reconstructs original GCP source admission from persisted evidence without Terraform execution', async () => {
  const f = await fixture();
  const path = join(f.directory, 'source-resume-child.private.ts'),
    config = join(f.directory, 'source-resume-child.private.json');
  await writeFile(
    config,
    JSON.stringify({
      intent: f.i,
      reference: f.persisted.reference,
      executionDirectory: f.directory,
      environment: f.common.environment,
      fields: f.fields,
      live: [...f.live.entries()],
    }),
    { mode: 0o600, flag: 'wx' },
  );
  const module = new URL('../../src/ce/capture-cleanup-durable.ts', import.meta.url).href;
  const text = `import { readFile } from 'node:fs/promises';
import { resumeGcpCaptureCleanupOrigin } from ${JSON.stringify(module)};
const f = JSON.parse(await readFile(process.argv[2], 'utf8'));
const live = new Map(f.live);
const api = { exec: async (_command, args) => {
  if (args.includes('operations')) {
    const link = args[args.indexOf('--filter') + 1].split('targetLink=')[1], body = live.get(link);
    return { exitCode: 0, stdout: JSON.stringify(body ? [{ operationType: 'insert', status: 'DONE', targetLink: link,
      targetId: body.id, insertTime: '2026-11-11T23:59:59Z', startTime: '2026-11-12T00:00:00Z', endTime: '2026-11-12T00:00:01Z' }] : []), stderr: '' };
  }
  const name = args[args.indexOf('describe') + 1], collection = args.includes('instances') ? 'instances' : args.includes('disks') ? 'disks' : args.includes('firewall-rules') ? 'firewalls' : args.includes('subnets') ? 'subnetworks' : 'networks';
  const body = [...live.values()].find(row => row.selfLink.endsWith('/' + collection + '/' + name));
  return body ? { exitCode: 0, stdout: JSON.stringify(body), stderr: '' } : { exitCode: 1, stdout: '', stderr: 'not found' };
} };
const result = await resumeGcpCaptureCleanupOrigin({ intent: f.intent, reference: f.reference,
  executionDirectory: f.executionDirectory, environment: f.environment, api,
  observePlatform: async (site, token) => {
    const siteRow = f.fields['xcsh_securemesh_site_v2.' + site.replaceAll('-', '_')], tokenRow = f.fields['xcsh_token.' + token.replace('-token', '').replaceAll('-', '_')];
    return { siteName: site, tokenName: token, siteAbsent: !siteRow, tokenAbsent: !tokenRow,
      siteIdentitySha256: siteRow?.creation_identity_sha256, tokenIdentitySha256: tokenRow?.creation_identity_sha256 };
  }, assertIndependentClosure: async () => {} });
console.log(JSON.stringify({ mode: result.mode, resources: result.recovery.resources.length, executionAuthorized: result.executionAuthorized }));
result.close();
`;
  await writeFile(path, text, { mode: 0o600, flag: 'wx' });
  const before = f.commands.length;
  const child = Bun.spawn([process.execPath, path, config], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  const stdout = await new Response(child.stdout).text(),
    stderr = await new Response(child.stderr).text();
  expect(await child.exited).toBe(0);
  expect(stderr).toBe('');
  expect(JSON.parse(stdout)).toEqual({ mode: 'original', resources: 21, executionAuthorized: false });
  expect(f.commands).toHaveLength(before);
});

test('durable original empty state resumes twice behind an empty destroy without submission or serial invention', async () => {
  const f = await fixture('empty'),
    { recorded } = await f.review();
  const before = f.commands.length;
  const resumed = await resumeGcpCaptureCleanupOrigin({ ...f.args(), reviewReference: recorded.reference });
  try {
    expect(resumed.recovery.emptyOriginal?.kind).toBe('original-empty-create-state-verification');
    const runner = new TerraformRunner(dirname(f.directory), f.inspection.execute, resumed.recovery);
    for (let n = 0; n < 2; n++) {
      const result = await runner.resumeCompletedCleanupReadOnly(f.i.deploymentName);
      expect(result.executorSubmissions).toBe(0);
      expect(result.stateSerial).toBe(f.state.serial);
    }
    expect(f.commands).toHaveLength(before);
  } finally {
    resumed.close();
  }
});

test('durable original empty evidence refuses any invented serial change before recovery', async () => {
  const f = await fixture('empty');
  f.state.serial++;
  await f.refreshState();
  await expect(resumeGcpCaptureCleanupOrigin(f.args())).rejects.toThrow();
});

test('failed durable publication retires the issued transient admission before returning an error', async () => {
  const f = await fixture();
  const original = admissionSource.openGcpCaptureCleanupAdmission;
  let issued: Awaited<ReturnType<typeof original>> | undefined;
  const intercepted = spyOn(admissionSource, 'openGcpCaptureCleanupAdmission').mockImplementation(async (...args) => {
    issued = await original(...args);
    return issued;
  });
  const readerInputs: Record<string, OriginalInputBinding> = {
    reader: { ...(await readOwnedInstalledInput(join(f.lock, 'claim.json'))).binding, sha256: 'f'.repeat(64) },
  };
  try {
    await expect(
      persistGcpCaptureCleanupOrigin({ ...f.common, inspection: f.inspection, readerInputs }),
    ).rejects.toThrow();
    if (!issued) throw new Error('Original admission issuer was not reached');
    await expect(issued.recovery.assertIndependentClosure()).rejects.toThrow('retired');
  } finally {
    issued?.close();
    intercepted.mockRestore();
  }
});
