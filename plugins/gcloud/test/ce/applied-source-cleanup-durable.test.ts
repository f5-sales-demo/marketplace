/** Source evidence only: real immutable storage and synthetic cloud/XC observations. */
import { expect, spyOn, test } from 'bun:test';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as durable from '../../src/ce/applied-source-cleanup-durable';
import { resumeGcpAppliedSourceTeardownOrigin } from '../../src/ce/applied-source-teardown-origin';
import { fingerprint } from '../../src/ce/discovery';
import { assertPublicTerraformContext } from '../../src/ce/terraform-context';
import {
  type PublicTerraformCleanupReview,
  readPublicTerraformCleanupOwnership,
} from '../../src/ce/terraform-public-teardown';
import { appliedSourceDurableFixture as fixture } from './applied-source-durable-fixtures';

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
