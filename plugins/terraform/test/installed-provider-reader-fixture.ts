import { afterEach } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInstalledCaptureContext } from '../src/installed-capture-context';
import { inspectInstalledCaptureScripts } from '../src/installed-runtime';
import pins from '../src/installed-runtime-pins.json';
import { linuxMonotonicMs } from '../src/linux-clock';
import type { Executor } from '../src/runner';
import type { ExecutionCaptureAdmission, SignalFreeExecutionPolicy } from '../src/signal-free-executor';

export const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
export const parent = { pid: 1234, group: 1234, start: '100', boot: '00000000-0000-4000-8000-000000000001' };
export const sdk = { pid: 2345, group: 2345, start: '101', boot: parent.boot };
export const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export async function fixture(latest: boolean | '811' | '1172' = false, executorIdentity = parent) {
  const parent = executorIdentity;
  const terraformHash =
    latest === '1172'
      ? 'dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e'
      : latest
        ? '1eaecd79a92a0114d70017b5d5e274c12e5b4561d971ff0b5e24073cddd287dc'
        : pins.terraformSha256;
  const googleHash =
    latest === '811' || latest === '1172'
      ? 'f6c7080ca82f5ecc2f279f9b6edf152ec366890f76ab0a97a1667bdf17331ef5'
      : latest
        ? 'f792c2ebae7abfc9123e9506b641fa789335b8905caa34effd899595e93e40a9'
        : pins.googleProviderSha256;
  const googleVersion = latest === '811' || latest === '1172' ? '8.11.0' : latest ? '8.10.0' : '8.7.0';

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
      terraform: binding('/example/terraform', terraformHash),
      adc: binding(join(root, 'adc'), 'c'.repeat(64)),
      platform: binding(join(root, 'platform'), 'd'.repeat(64)),
    },
    assertInputs: async () => {},
    assertWithinDeadline: async () => {},
    readProviderInputs: async () =>
      Object.fromEntries(
        [
          'registry.terraform.io/hashicorp/google:LICENSE.txt',
          `registry.terraform.io/hashicorp/google:terraform-provider-google_v${googleVersion}_x5`,
          'registry.terraform.io/f5-sales-demo/xcsh:CHANGELOG.md',
          'registry.terraform.io/f5-sales-demo/xcsh:LICENSE',
          'registry.terraform.io/f5-sales-demo/xcsh:README.md',
          'registry.terraform.io/f5-sales-demo/xcsh:terraform-provider-xcsh_v15.13.0',
        ].map((name, index) => [
          name,
          binding(
            join(root, `provider-${index}`),
            name.includes('terraform-provider-google') ? googleHash : 'e'.repeat(64),
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
  let windowClock = now;
  let finishWindow: () => void = () => {};
  let mutateReady: (value: Record<string, unknown>) => void = () => {};
  let prematureWindow = false;

  let substituteRequest = false;
  let aliasResult = false;
  let mutate: (result: Record<string, unknown>) => void = () => {};
  let mutateCapture: (capture: Record<string, unknown>) => void = () => {};
  const factory =
    (policy: SignalFreeExecutionPolicy): Executor =>
    async (invocation) => {
      executions++;
      const readerActor = {
        ...sdk,
        boot: parent.boot,
        pid: sdk.pid + (executions - 1) * 100,
        group: sdk.group + (executions - 1) * 100,
        start: String(Number(sdk.start) + executions - 1),
      };
      const originalRequest = invocation.args[invocation.args.indexOf('--request') + 1];
      if (substituteRequest) {
        const bytes = await readFile(originalRequest);
        await rename(originalRequest, `${originalRequest}.original`);
        await writeFile(originalRequest, bytes, { flag: 'wx', mode: 0o400 });
      }
      await policy.assertOriginal();
      await policy.beforeRelease?.({
        ...admission,
        directory: invocation.cwd,
        args: invocation.args,
        identity: readerActor,
        startupDeadlineMs: windowClock + 15000,
      });
      await policy.assertOriginal();
      const path = invocation.args[invocation.args.indexOf('--request') + 1];
      const bytes = await readFile(path);
      const request = JSON.parse(bytes.toString());
      const result: Record<string, unknown> = {
        schemaVersion: 1,
        kind: 'original-provider-cohort',
        requestSha256: hash(bytes),
        executor: request.executor,
        reader: readerActor,
        candidates: [3456, 4567].map((pid) => ({
          pid,
          group: parent.group,
          start: String(pid),
          boot: parent.boot,
          parent: parent.pid,
          executable_sha256: googleHash,
        })),
        executorAvailable: true,
        executorGroupClosed: false,
        applyPhaseQualified: false,
        signalsSent: false,
        cloudSubmissions: 0,
      };
      if (request.schemaVersion === 3 || request.schemaVersion === 4) {
        const windowStartedMs = windowClock;
        const windowDeadlineMs = Math.min(windowStartedMs + 45000, request.deadlineMs);
        const ready: Record<string, unknown> = {
          schemaVersion: request.schemaVersion,
          kind: 'original-provider-stderr-ready',
          requestSha256: hash(bytes),
          executor: request.executor,
          reader: readerActor,
          windowStartedMs,
          windowDeadlineMs,
          applyPhaseQualified: false,
          signalsSent: false,
          cloudSubmissions: 0,
        };
        mutateReady(ready);
        const barrier = new Promise<void>((resolve) => {
          finishWindow = () => {
            windowClock = windowDeadlineMs;
            resolve();
          };
        });
        await writeFile(join(invocation.cwd, 'provider-ready.private.json'), JSON.stringify(ready), {
          flag: 'wx',
          mode: 0o400,
        });
        await barrier;
        Object.assign(result, {
          schemaVersion: request.schemaVersion,
          kind: request.kind,
          windowStartedMs,
          windowDeadlineMs,
          finishedMs: prematureWindow ? now : windowDeadlineMs,
          samplingWindowComplete: true,
          observations: (result.candidates as Array<Record<string, unknown>>).map((candidate) => ({
            candidate,
            stderr: {
              providerFd: 2,
              parentFd: 10,
              device: '14',
              inode: String(candidate.pid),
              providerFlags: 1,
              parentFlags: 526336,
            },
            firstObservedMs: windowStartedMs,
            lastObservedMs: windowStartedMs,
            presentAtLastSample: true,
          })),
        });
        if (request.schemaVersion === 4)
          Object.assign(result, { verificationPolicy: 'completed-before-window-end', boundaryAttempts: 0 });
        delete result.candidates;
      }
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
      const capture = {
        invocationStartedMs: now,
        finalStartedMs: now,
        finalDeadlineMs: now + 300_000,
        originalDeadlineMs: admission.originalDeadlineMs,
        finishedMs: now,
        stdoutPath: join(invocation.cwd, 'stdout'),
        stderrPath: join(invocation.cwd, 'stderr'),
        identity: readerActor,
        pid: readerActor.pid,
        submitted: true,
        actualExitCode: 0,
        originalGroupClosed: true,
        signalsSent: false as const,
      };
      mutateCapture(capture);
      await policy.finalCapture(capture);
      return { code: 0, stdout: '' };
    };
  return {
    root,
    clock: () => windowClock,
    releaseWindow: () => finishWindow(),
    mutateReady: (fn: typeof mutateReady) => {
      mutateReady = fn;
    },
    prematureWindow: () => {
      prematureWindow = true;
    },
    context,
    admission,
    factory,
    mutateCapture: (fn: typeof mutateCapture) => {
      mutateCapture = fn;
    },
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
