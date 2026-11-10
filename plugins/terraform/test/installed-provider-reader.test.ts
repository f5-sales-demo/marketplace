import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInstalledCaptureContext } from '../src/installed-capture-context';
import { openInstalledProviderReader } from '../src/installed-provider-reader';
import { inspectInstalledCaptureScripts } from '../src/installed-runtime';
import pins from '../src/installed-runtime-pins.json';
import { linuxMonotonicMs } from '../src/linux-clock';
import type { Executor } from '../src/runner';
import type { ExecutionCaptureAdmission, SignalFreeExecutionPolicy } from '../src/signal-free-executor';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
const parent = { pid: 1234, group: 1234, start: '100', boot: '00000000-0000-4000-8000-000000000001' };
const sdk = { pid: 2345, group: 2345, start: '101', boot: parent.boot };
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ce-installed-provider-'));
  roots.push(root);
  const source = await inspectInstalledCaptureScripts();
  const sample = source['script:__init__.py'];
  const binding = (path: string, sha256: string) => ({ ...sample, path, sha256 });
  const now = linuxMonotonicMs();
  const context = createInstalledCaptureContext({
    authentication: { accountSha256: 'a'.repeat(64), audienceSha256: 'b'.repeat(64), snapshotSha256: 'c'.repeat(64) },
    owner: {
      provider: 'gcp',
      engine: 'terraform',
      account: 'example-project',
      region: 'us-central1',
      deploymentId: 'example-deployment',
    },
    executionDirectory: root,
    budget: { start: now, deadline: now + 7_200_000 },
    environment: {
      GOOGLE_APPLICATION_CREDENTIALS: join(root, 'adc'),
      XCSH_API_URL: 'https://example.com',
      XCSH_API_TOKEN: 'example-token',
    },
    inputs: {
      ...source,
      python: binding('/example/python', pins.pythonSha256),
      terraform: binding('/example/terraform', pins.terraformSha256),
      adc: binding(join(root, 'adc'), 'c'.repeat(64)),
      platform: binding(join(root, 'platform'), 'd'.repeat(64)),
    },
    assertInputs: async () => {},
    assertWithinDeadline: async () => {},
    readProviderInputs: async () =>
      Object.fromEntries(
        [
          'registry.terraform.io/hashicorp/google:LICENSE.txt',
          'registry.terraform.io/hashicorp/google:terraform-provider-google_v8.7.0_x5',
          'registry.terraform.io/f5-sales-demo/xcsh:CHANGELOG.md',
          'registry.terraform.io/f5-sales-demo/xcsh:LICENSE',
          'registry.terraform.io/f5-sales-demo/xcsh:README.md',
          'registry.terraform.io/f5-sales-demo/xcsh:terraform-provider-xcsh_v15.13.0',
        ].map((name, index) => [
          name,
          binding(
            join(root, `provider-${index}`),
            name.includes('terraform-provider-google') ? pins.googleProviderSha256 : 'e'.repeat(64),
          ),
        ]),
      ),
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
    directory: root,
    args: ['apply', 'saved.tfplan'],
    identity: parent,
    stdoutPath: join(root, 'stdout'),
    stderrPath: join(root, 'stderr'),
    originalStartMs: now,
    originalDeadlineMs: now + 7_200_000,
    startupDeadlineMs: now + 15_000,
  };
  let executions = 0;
  let substituteRequest = false;
  let aliasResult = false;
  let mutate: (result: Record<string, unknown>) => void = () => {};
  const factory =
    (policy: SignalFreeExecutionPolicy): Executor =>
    async (invocation) => {
      executions++;
      const originalRequest = invocation.args[invocation.args.indexOf('--request') + 1];
      if (substituteRequest) {
        const bytes = await readFile(originalRequest);
        await rename(originalRequest, `${originalRequest}.original`);
        await writeFile(originalRequest, bytes, { flag: 'wx', mode: 0o400 });
      }
      await policy.assertOriginal();
      await policy.beforeRelease?.({ ...admission, directory: invocation.cwd, args: invocation.args, identity: sdk });
      await policy.assertOriginal();
      const path = invocation.args[invocation.args.indexOf('--request') + 1];
      const bytes = await readFile(path);
      const request = JSON.parse(bytes.toString());
      const result: Record<string, unknown> = {
        schemaVersion: 1,
        kind: 'original-provider-cohort',
        requestSha256: hash(bytes),
        executor: request.executor,
        reader: sdk,
        candidates: [3456, 4567].map((pid) => ({
          pid,
          group: parent.group,
          start: String(pid),
          boot: parent.boot,
          parent: parent.pid,
          executable_sha256: pins.googleProviderSha256,
        })),
        executorAvailable: true,
        executorGroupClosed: false,
        applyPhaseQualified: false,
        signalsSent: false,
        cloudSubmissions: 0,
      };
      mutate(result);
      await writeFile(join(invocation.cwd, 'provider-result.private.json'), JSON.stringify(result), {
        flag: 'wx',
        mode: 0o400,
      });
      if (aliasResult) {
        const path = join(invocation.cwd, 'provider-result.private.json');
        const foreign = join(root, 'foreign-result.private.json');
        await rename(path, foreign);
        await symlink(foreign, path);
      }
      await policy.finalCapture({
        invocationStartedMs: now,
        finalStartedMs: now,
        finalDeadlineMs: now + 300_000,
        originalDeadlineMs: admission.originalDeadlineMs,
        finishedMs: now,
        stdoutPath: join(invocation.cwd, 'stdout'),
        stderrPath: join(invocation.cwd, 'stderr'),
        identity: sdk,
        pid: sdk.pid,
        submitted: true,
        actualExitCode: 0,
        originalGroupClosed: true,
        signalsSent: false,
      });
      return { code: 0, stdout: '' };
    };
  return {
    root,
    context,
    admission,
    factory,
    executions: () => executions,
    mutate: (fn: typeof mutate) => {
      mutate = fn;
    },
    substituteRequest: () => {
      substituteRequest = true;
    },
    aliasResult: () => {
      aliasResult = true;
    },
  };
}

test('installed provider bridge preserves all original candidates without qualifying cloud apply', async () => {
  const run = await fixture();
  const reader = await openInstalledProviderReader(run.context, run.admission, { executorFactory: run.factory });
  const cohort = await reader.read();
  expect(cohort.candidates).toHaveLength(2);
  expect(cohort.applyPhaseQualified).toBe(false);
  expect(cohort.executor).toEqual(parent);
  expect(run.executions()).toBe(1);
});

test('wrong original executor directory and budget refuse before reader execution', async () => {
  const run = await fixture();
  for (const admission of [
    { ...run.admission, directory: '/example/foreign' },
    { ...run.admission, originalDeadlineMs: run.admission.originalDeadlineMs + 1 },
  ]) {
    await expect(openInstalledProviderReader(run.context, admission, { executorFactory: run.factory })).rejects.toThrow(
      /[Oo]riginal/,
    );
  }
  expect(run.executions()).toBe(0);
});

test('foreign candidates and changed request attribution retire capture without a retry', async () => {
  const run = await fixture();
  run.mutate((result) => {
    (result.candidates as Array<Record<string, unknown>>)[0].parent = 9999;
  });
  const reader = await openInstalledProviderReader(run.context, run.admission, { executorFactory: run.factory });
  await expect(reader.read()).rejects.toThrow();
  await expect(reader.read()).rejects.toThrow('retired');
  expect(run.executions()).toBe(1);
});

test('missing admitted script sources cannot be replaced by a name-only lookup', async () => {
  const run = await fixture();
  const inputs = { ...run.context.inputs };
  delete inputs['script:gcp_provider_reader.py'];
  await expect(
    openInstalledProviderReader({ ...run.context, inputs }, run.admission, { executorFactory: run.factory }),
  ).rejects.toThrow('source');
  expect(run.executions()).toBe(0);
});

test('same-byte request replacement refuses before the original SDK is released', async () => {
  const run = await fixture();
  run.substituteRequest();
  const reader = await openInstalledProviderReader(run.context, run.admission, { executorFactory: run.factory });
  await expect(reader.read()).rejects.toThrow();
});

test('a foreign aliased result cannot inherit an original SDK capture', async () => {
  const run = await fixture();
  run.aliasResult();
  const reader = await openInstalledProviderReader(run.context, run.admission, { executorFactory: run.factory });
  await expect(reader.read()).rejects.toThrow();
});

test('an expired original operation refuses even when a fixture deadline callback is a no-op', async () => {
  const run = await fixture();
  const deadline = linuxMonotonicMs() - 1;
  const budget = { start: deadline - 7_200_000, deadline };
  const context = { ...run.context, budget };
  const admission = { ...run.admission, originalStartMs: budget.start, originalDeadlineMs: budget.deadline };
  const reader = await openInstalledProviderReader(context, admission, { executorFactory: run.factory });
  await expect(reader.read()).rejects.toThrow(AggregateError);
  expect(run.executions()).toBe(0);
});

test('provider getter replacement during capture is refused by the final original-snapshot check', async () => {
  const run = await fixture();
  let changed = false;
  run.mutate(() => {
    changed = true;
  });
  const context = {
    ...run.context,
    readProviderInputs: async () => {
      const original = await run.context.readProviderInputs();
      if (!changed) return original;
      const name = 'registry.terraform.io/hashicorp/google:LICENSE.txt';
      return { ...original, [name]: { ...original[name], path: `${original[name].path}-foreign` } };
    },
  };
  const reader = await openInstalledProviderReader(context, run.admission, { executorFactory: run.factory });
  await expect(reader.read()).rejects.toThrow('admission changed');
  await expect(reader.read()).rejects.toThrow('retired');
});
