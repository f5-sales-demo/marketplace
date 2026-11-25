/** Source evidence only: real immutable storage and synthetic cloud/XC observations. */
import { expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOwnedInstalledInput } from '../../../terraform/src/installed-runtime';
import type { OriginalInputBinding } from '../../../terraform/src/original-input-monitor';
import * as durable from '../../src/ce/applied-source-cleanup-durable';
import { resumeGcpAppliedSourceTeardownOrigin } from '../../src/ce/applied-source-teardown-origin';
import { fingerprint } from '../../src/ce/discovery';
import { assertPublicTerraformContext } from '../../src/ce/terraform-context';
import {
  type PublicTerraformCleanupReview,
  readPublicTerraformCleanupOwnership,
} from '../../src/ce/terraform-public-teardown';
import { appliedSourceFixture } from './applied-source-fixtures';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const config = Buffer.from('{"resource":{}}'),
    lock = Buffer.from('original-provider-lock');
  const create = Buffer.from('original-source-create');
  const f = await appliedSourceFixture(undefined, {
    configurationSha256: hash(config),
    providerLockSha256: hash(lock),
    planSha256: hash(create),
  });
  const root = await mkdtemp(join(tmpdir(), 'gcp-applied-durable-'));
  const directory = join(root, f.i.deploymentName);
  await mkdir(directory, { mode: 0o700 });
  const state = {
    version: 4,
    lineage: 'original',
    serial: 1,
    resources: f.addresses.map((address, n) => ({
      mode: 'managed',
      type: address.split('.')[0],
      name: address.split('.')[1],
      instances: [
        { attributes: { id: n < f.scope.length ? String(f.live.get(f.scope[n].selfLink)?.id) : fingerprint(address) } },
      ],
    })),
  };
  const stateIdentity = async () => ({
    sha256: hash(await readFile(join(directory, 'terraform.tfstate'))),
    lineage: state.lineage,
    serial: state.serial,
  });
  const refreshState = () => writeFile(join(directory, 'terraform.tfstate'), JSON.stringify(state), { mode: 0o600 });
  await refreshState();
  const read = f.runtime.session.readApplyAttemptResourceFields;
  if (!read) throw new Error('Original synthetic source reader required');
  f.runtime.session.readApplyAttemptResourceFields = async (...args) => ({
    ...(await read(...args)),
    stateSha256: (await stateIdentity()).sha256,
  });
  f.runtime.session.readStateIdentity = stateIdentity;
  for (const [name, bytes] of [
    ['main.tf.json', config],
    ['.terraform.lock.hcl', lock],
    ['saved.tfplan', create],
    ['deployment.tfrc', Buffer.from('provider_installation {}')],
    [
      'deployment.json',
      Buffer.from(
        JSON.stringify({
          owner: {
            provider: 'gcp',
            engine: 'terraform',
            account: f.i.project,
            region: f.i.region,
            deploymentId: f.i.deploymentName,
          },
        }),
      ),
    ],
  ] as const)
    await writeFile(join(directory, name), bytes, { mode: 0o600 });
  await writeFile(join(directory, 'plan-receipt.json'), JSON.stringify({ state: 'applied', receipt: f.receipt }), {
    mode: 0o600,
  });
  const readerPath = join(f.worker, 'original-reader-set.private.json');
  await writeFile(readerPath, JSON.stringify({ fixture: 'synthetic-independent-original-readers' }), { mode: 0o400 });
  const readerInputs: Record<string, OriginalInputBinding> = {
    readerSet: (await readOwnedInstalledInput(readerPath)).binding,
  };
  let closed = true;
  const common = {
    intent: f.i,
    executionDirectory: directory,
    source: f.args.source,
    environment: f.runtime.environment,
    api: f.runtime.api,
    observePlatform: f.runtime.observePlatform,
    assertIndependentClosure: async (bindings: Readonly<Record<string, OriginalInputBinding>>) => {
      expect(bindings).toEqual(readerInputs);
      if (!closed) throw new Error('Original reader is live');
    },
  };
  const origin = await f.open();
  const persisted = await durable.persistGcpAppliedSourceCleanupOrigin({
    ...common,
    origin,
    receipt: f.receipt,
    readerInputs,
  });
  origin.close();
  const args = () => ({ ...common, reference: persisted.reference });
  const review = async (ageMs = 0) => {
    const planBytes = Buffer.from(`reviewed-delete-${state.serial}`);
    const receipt = {
      ...f.receipt,
      operation: 'destroy' as const,
      noChanges: state.resources.length === 0,
      planSha256: hash(planBytes),
      changes: state.resources.map((row) => ({
        address: `${row.type}.${row.name}`,
        type: row.type,
        actions: ['delete'],
      })),
    };
    await writeFile(join(directory, 'saved.tfplan'), planBytes);
    await writeFile(join(directory, 'plan-receipt.json'), JSON.stringify({ state: 'planned', receipt }));
    const body = {
      schemaVersion: 3,
      operation: 'teardown',
      engine: 'terraform',
      intentFingerprint: fingerprint(f.i),
      originalAuthorization: persisted.original,
      ownershipHash: fingerprint(persisted.ownership),
      state: await stateIdentity(),
      savedPlan: receipt,
      remaining: receipt.changes.map((row) => row.address),
      projectionHash: fingerprint(f.fields),
      createdAt: new Date(Date.now() - ageMs).toISOString(),
    };
    const reviewed = { ...body, planHash: fingerprint(body) } as unknown as PublicTerraformCleanupReview;
    const recorded = await durable.persistGcpAppliedSourceCleanupReview({ ...args(), review: reviewed });
    return { receipt, recorded, reviewed };
  };
  const remove = async (all = false) => {
    const removed = all ? f.addresses : [f.addresses[0]];
    state.resources = state.resources.filter((row) => !removed.includes(`${row.type}.${row.name}`));
    state.serial++;
    for (const address of removed) {
      f.fields[address] = null;
      const index = f.addresses.indexOf(address);
      if (index < f.scope.length) f.live.delete(f.scope[index].selfLink);
    }
    await refreshState();
  };
  return {
    ...f,
    common,
    args,
    persisted,
    directory,
    state,
    refreshState,
    review,
    remove,
    readerPath,
    readerLive: () => {
      closed = false;
    },
  };
}

test('successful-source origin resumes after process lifetime without substitute deployment journals or failed flags', async () => {
  const f = await fixture();
  for (let n = 0; n < 2; n++) {
    const resumed = await resumeGcpAppliedSourceTeardownOrigin(f.args());
    try {
      expect(resumed.mode).toBe('original');
      expect(resumed.executionAuthorized).toBe(false);
      const runtime = { ...f.runtime, appliedSourceTeardownOrigin: resumed.origin };
      const proof = await readPublicTerraformCleanupOwnership(runtime, f.i);
      expect(proof.original).toEqual(f.persisted.original);
      expect(proof.owned.addresses).toHaveLength(21);
      await assertPublicTerraformContext(runtime, f.i);
    } finally {
      resumed.close();
    }
  }
  expect(await Bun.file(join(f.directory, '.terraform-executor-lock/capture-unresolved.json')).exists()).toBe(false);
  expect(await Bun.file(join(f.directory, 'gcp-tf-public-deployment.json')).exists()).toBe(false);
});
test('successful-source durable origin survives reviewed destroy replacing the create checkpoint', async () => {
  const f = await fixture(),
    { recorded } = await f.review();
  const resumed = await resumeGcpAppliedSourceTeardownOrigin({ ...f.args(), reviewReference: recorded.reference });
  try {
    expect(resumed.mode).toBe('planned-destroy');
    expect(resumed.requiresNewReviewedPlan).toBe(false);
    expect(
      (await readPublicTerraformCleanupOwnership({ ...f.runtime, appliedSourceTeardownOrigin: resumed.origin }, f.i))
        .owned.addresses,
    ).toHaveLength(21);
  } finally {
    resumed.close();
  }
});
test('interrupted destroy retains the surviving original subset and requires a new reviewed plan', async () => {
  const f = await fixture(),
    { recorded, receipt } = await f.review();
  await f.remove();
  await writeFile(join(f.directory, 'plan-receipt.json'), JSON.stringify({ state: 'applying', receipt }));
  const before = await readFile(join(f.directory, 'plan-receipt.json'));
  const resumed = await resumeGcpAppliedSourceTeardownOrigin({ ...f.args(), reviewReference: recorded.reference });
  try {
    expect(resumed.mode).toBe('partial-replan-required');
    expect(resumed.requiresNewReviewedPlan).toBe(true);
    expect(resumed.remaining).toHaveLength(20);
  } finally {
    resumed.close();
  }
  expect(await readFile(join(f.directory, 'plan-receipt.json'))).toEqual(before);
});
test('completed destroy resumes twice without rewriting original applying evidence or submitting Terraform', async () => {
  const f = await fixture(),
    { recorded, receipt } = await f.review();
  await f.remove(true);
  await writeFile(join(f.directory, 'plan-receipt.json'), JSON.stringify({ state: 'applying', receipt }));
  const before = await readFile(join(f.directory, 'plan-receipt.json'));
  for (let n = 0; n < 2; n++) {
    const resumed = await resumeGcpAppliedSourceTeardownOrigin({ ...f.args(), reviewReference: recorded.reference });
    try {
      expect(resumed.mode).toBe('completed-readonly');
      expect(resumed.absent).toHaveLength(21);
      expect(resumed.executionAuthorized).toBe(false);
    } finally {
      resumed.close();
    }
  }
  expect(await readFile(join(f.directory, 'plan-receipt.json'))).toEqual(before);
});
test('completed cleanup remains read-only after final empty destroy overwrites its original checkpoint', async () => {
  const f = await fixture(),
    { recorded } = await f.review();
  await f.remove(true);
  const { receipt } = await f.review();
  expect(receipt.noChanges).toBe(true);
  const resumed = await resumeGcpAppliedSourceTeardownOrigin({ ...f.args(), reviewReference: recorded.reference });
  try {
    expect(resumed.mode).toBe('completed-readonly');
    expect(resumed.remaining).toEqual([]);
  } finally {
    resumed.close();
  }
});
for (const mode of [
  'replacement',
  'foreign-state',
  'rollback',
  'missing-review',
  'reader-live',
  'replaced-origin',
  'replaced-source',
  'endpoint',
  'context-race',
  'future-review',
] as const)
  test(`durable successful-source cleanup refuses changed evidence: ${mode}`, async () => {
    const f = await fixture(),
      { recorded, receipt } = await f.review();
    if (mode === 'replacement') {
      const row = f.live.get(f.scope[0].selfLink);
      if (!row) throw new Error('Original fixture required');
      row.id = '999999';
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
    if (mode === 'missing-review') {
      await f.remove(true);
      await writeFile(join(f.directory, 'plan-receipt.json'), JSON.stringify({ state: 'applying', receipt }));
    }
    if (mode === 'reader-live') f.readerLive();
    if (mode === 'replaced-origin' || mode === 'replaced-source') {
      const path = mode === 'replaced-origin' ? f.persisted.reference.binding.path : f.paths.authorization;
      const bytes = await readFile(path);
      await rename(path, `${path}.original`);
      await writeFile(path, bytes, { mode: 0o400 });
    }
    if (mode === 'endpoint') f.common.environment.XCSH_API_URL = 'https://foreign.example.test';
    if (mode === 'context-race')
      f.common.assertIndependentClosure = async () => {
        f.common.environment.XCSH_API_URL = 'https://foreign.example.test';
      };
    if (mode === 'future-review') await expect(f.review(-10000)).rejects.toThrow();
    else
      await expect(
        resumeGcpAppliedSourceTeardownOrigin({
          ...f.args(),
          ...(mode === 'missing-review' ? {} : { reviewReference: recorded.reference }),
        }),
      ).rejects.toThrow();
  });
test('credentials rotate within the original endpoint and live closure remains required after resuming', async () => {
  const f = await fixture();
  f.common.environment.XCSH_API_TOKEN = 'synthetic-rotation';
  const resumed = await resumeGcpAppliedSourceTeardownOrigin(f.args());
  try {
    await assertPublicTerraformContext({ ...f.runtime, appliedSourceTeardownOrigin: resumed.origin }, f.i);
    f.readerLive();
    await expect(
      readPublicTerraformCleanupOwnership({ ...f.runtime, appliedSourceTeardownOrigin: resumed.origin }, f.i),
    ).rejects.toThrow();
  } finally {
    resumed.close();
  }
});
test('normal GCloud exports successful-source durable publication and reconstruction', async () => {
  const module = await import('../../src/index');
  expect(typeof module.persistGcpAppliedSourceCleanupOrigin).toBe('function');
  expect(typeof module.persistGcpAppliedSourceCleanupReview).toBe('function');
  expect(typeof module.resumeGcpAppliedSourceTeardownOrigin).toBe('function');
});

test('durable success refuses a malformed Terraform action invocation collection', async () => {
  const f = await fixture(),
    { reviewed } = await f.review();
  const { planHash: _hash, ...body } = reviewed;
  const receipt = { ...reviewed.savedPlan, actionInvocations: {} };
  const modified = { ...body, savedPlan: receipt };
  await writeFile(join(f.directory, 'plan-receipt.json'), JSON.stringify({ state: 'planned', receipt }));
  await expect(
    durable.persistGcpAppliedSourceCleanupReview({
      ...f.args(),
      review: { ...modified, planHash: fingerprint(modified) } as unknown as PublicTerraformCleanupReview,
    }),
  ).rejects.toThrow();
});
test('a stale retained planned destroy needs a fresh review without discarding its original provenance', async () => {
  const f = await fixture(),
    { recorded } = await f.review();
  const now = Date.now(),
    time = spyOn(Date, 'now').mockImplementation(() => now + 300001);
  try {
    const resumed = await resumeGcpAppliedSourceTeardownOrigin({ ...f.args(), reviewReference: recorded.reference });
    try {
      expect(resumed.mode).toBe('planned-destroy');
      expect(resumed.requiresNewReviewedPlan).toBe(true);
    } finally {
      resumed.close();
    }
  } finally {
    time.mockRestore();
  }
});
test('concurrent successful-source resumes reject a second claim while original observation is running', async () => {
  const f = await fixture();
  let enter: (() => void) | undefined, unblock: (() => void) | undefined;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  const original = f.runtime.api.exec;
  let waiting = true;
  f.runtime.api.exec = async (...args) => {
    if (waiting) {
      waiting = false;
      enter?.();
      await gate;
    }
    return original(...args);
  };
  const first = resumeGcpAppliedSourceTeardownOrigin(f.args());
  await entered;
  try {
    await expect(resumeGcpAppliedSourceTeardownOrigin(f.args())).rejects.toThrow();
  } finally {
    unblock?.();
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
  const module = new URL('../../src/ce/applied-source-teardown-origin.ts', import.meta.url).href;
  const text = `import { readFile } from 'node:fs/promises';
import { resumeGcpAppliedSourceTeardownOrigin } from ${JSON.stringify(module)};
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
const result = await resumeGcpAppliedSourceTeardownOrigin({ intent: f.intent, reference: f.reference,
  executionDirectory: f.executionDirectory, environment: f.environment, api,
  observePlatform: async (site, token) => {
    const siteRow = f.fields['xcsh_securemesh_site_v2.' + site.replaceAll('-', '_')], tokenRow = f.fields['xcsh_token.' + token.replace('-token', '').replaceAll('-', '_')];
    return { siteName: site, tokenName: token, siteAbsent: !siteRow, tokenAbsent: !tokenRow,
      siteIdentitySha256: siteRow?.creation_identity_sha256, tokenIdentitySha256: tokenRow?.creation_identity_sha256 };
  }, assertIndependentClosure: async () => {} });
console.log(JSON.stringify({ mode: result.mode, resources: result.remaining.length, executionAuthorized: result.executionAuthorized }));
result.close();
`;
  await writeFile(path, text, { mode: 0o600, flag: 'wx' });
  const child = Bun.spawn([process.execPath, path, config], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  const stdout = await new Response(child.stdout).text(),
    stderr = await new Response(child.stderr).text();
  expect(await child.exited).toBe(0);
  expect(stderr).toBe('');
  expect(JSON.parse(stdout)).toEqual({ mode: 'original', resources: 21, executionAuthorized: false });
});
