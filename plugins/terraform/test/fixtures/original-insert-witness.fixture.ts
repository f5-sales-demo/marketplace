/** Real output/plan issuers with explicitly simulated UI, HTTP and provider process observations. */
import { afterEach } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GCP_XCSH15173_TERRAFORM_ARTIFACTS as GCP_PUBLIC_TERRAFORM_ARTIFACTS,
  GCP_XCSH15176_TERRAFORM_ARTIFACTS,
  GCP_XCSH15178_TERRAFORM_ARTIFACTS,
} from '../../../gcloud/src/ce/terraform-public-artifacts';
import { GoogleHttpRpcTraceParser, type OriginalGoogleHttpResponseObservation } from '../../src/gcp-http-rpc-trace';
import { inspectOriginalGcpInsertBodies } from '../../src/gcp-insert-evidence';
import { GoogleProviderLifecycleParser } from '../../src/google-provider-lifecycle';
import { type InstalledProviderWindow, openInstalledProviderReader } from '../../src/installed-provider-reader';
import { linuxMonotonicMs } from '../../src/linux-clock';
import type { OriginalExecutionOutput } from '../../src/original-output-stream';
import {
  type Deployment,
  type OriginalTerraformPlanProjection,
  readOriginalTerraformPlanSource,
  TerraformRunner,
} from '../../src/runner';
import { type ExecutionCaptureAdmission, signalFreeTerraformExecutor } from '../../src/signal-free-executor';
import { TerraformApplyHookParser } from '../../src/terraform-apply-hooks';
import { fixture as windowFixture } from '../installed-provider-reader-fixture';
import { operationFixture, requestFixture, scope, sourceJoinFixture, traceFixture } from './gcp-insert.fixture';

export const currentBinding = {
  terraformVersion: '1.17.2',
  providerLockSha256: 'ddd3bbbad292cc08b82014de3060fcf800c02fb2113311c06f50720c1075d615',
};
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
export type WitnessInput = {
  earlyResponse: OriginalGoogleHttpResponseObservation;
  originalPlan: OriginalTerraformPlanProjection;
  configuration: string;
  providerPath: string;
  binding: typeof currentBinding;
  insert: ReturnType<typeof inspectOriginalGcpInsertBodies>;
  started: ReturnType<TerraformApplyHookParser['pushOriginal']>[number];
  completed: ReturnType<TerraformApplyHookParser['pushOriginal']>[number];
  rpc: ReturnType<GoogleProviderLifecycleParser['pushOriginal']>[number];
  window: InstalledProviderWindow;
  allWindows: readonly InstalledProviderWindow[];
  bodies: ReturnType<GoogleHttpRpcTraceParser['consumeBodies']>;
};

export async function withInsertWitnesses(
  check: (value: WitnessInput, output: OriginalExecutionOutput, admission: ExecutionCaptureAdmission) => Promise<void>,
  timestampMode = 'normal',
  googleVersion: '8.11.0' | '8.12.0' = '8.11.0',
  windowMode: 'single' | 'overlap' | 'gap' | 'one-ms-gap' | 'changed-fifo' = 'single',
) {
  const root = await mkdtemp(join(tmpdir(), 'original-insert-witness-'));
  roots.push(root);
  const versionBinding =
    googleVersion === '8.12.0'
      ? {
          terraformVersion: '1.17.2',
          providerLockSha256:
            windowMode === 'single'
              ? 'f77a17ac8bfb5a808da63d887e8427c8663a460600174842e9b534dabf4419a5'
              : '74834870028124a9006ab8d34d49517b71b7a7e3ea5a3c1004b3899dacca3b4b',
        }
      : currentBinding;
  const original = sourceJoinFixture(versionBinding, googleVersion);
  const configuration = original.configuration;
  if (!GCP_PUBLIC_TERRAFORM_ARTIFACTS) throw new Error('Current authenticated profile required');
  const deployment: Deployment = {
    schemaVersion: 1,
    deploymentId: 'example-deployment',
    engine: 'terraform',
    scope: { cloud: 'gcp', account: 'example-project', region: 'us-central1' },
    terraformVersion: '1.17.2',
    configuration,
    providerLock: (googleVersion === '8.12.0'
      ? windowMode === 'single'
        ? GCP_XCSH15176_TERRAFORM_ARTIFACTS
        : GCP_XCSH15178_TERRAFORM_ARTIFACTS
      : GCP_PUBLIC_TERRAFORM_ARTIFACTS
    ).providerLock,
    backendIdentity: 'local:example-deployment',
  };
  let witnessParent: ExecutionCaptureAdmission | undefined;
  const runner = new TerraformRunner(
    root,
    async (request) => {
      if (request.args[0] === 'plan')
        await writeFile(join(request.cwd, 'saved.tfplan'), 'original-simulated-plan', { mode: 0o600 });
      if (request.args[0] !== 'apply')
        return {
          code: 0,
          stdout:
            request.args[0] === 'version'
              ? JSON.stringify({ terraform_version: '1.17.2' })
              : request.args[0] === 'show'
                ? JSON.stringify({
                    format_version: '1.2',
                    terraform_version: '1.17.2',
                    complete: true,
                    errored: false,
                    applyable: true,
                    resource_changes: [
                      {
                        address: 'google_compute_instance.node',
                        type: 'google_compute_instance',
                        mode: 'managed',
                        change: {
                          actions: ['create'],
                          after: { name: 'example-node', project: 'example-project', zone: 'us-central1-a' },
                          after_unknown: { id: true },
                        },
                      },
                    ],
                    output_changes: {},
                  })
                : '',
        }; // codespell:ignore applyable
      const originalPlan = await readOriginalTerraformPlanSource(request.originalPlanSource, {
        directory: request.cwd,
        engine: 'terraform',
        deploymentId: deployment.deploymentId,
        scope: deployment.scope,
        terraformVersion: deployment.terraformVersion,
        backendIdentity: deployment.backendIdentity,
      });
      const profilePlan = originalPlan.receipt;
      const python = await realpath(process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '');
      const executable = { path: python, sha256: hash(await readFile(python)) };
      const script = join(request.cwd, 'simulated-insert.py');
      await writeFile(script, 'pass\n', { mode: 0o600 });
      let window: WitnessInput['window'] | undefined;
      const windows: InstalledProviderWindow[] = [];
      let providerReader: Awaited<ReturnType<typeof openInstalledProviderReader>> | undefined;
      const providerPath = `/example/provider/terraform-provider-google_v${googleVersion}_x5`;
      const start = linuxMonotonicMs();
      const execute = signalFreeTerraformExecutor({
        python: executable,
        executable,
        originalStartMs: start,
        originalDeadlineMs: start + 7200000,
        assertOriginal: async () => {},
        beforeRelease: async (admission) => {
          witnessParent = admission;
          const baseEpoch = Date.now();
          for (const [index, offset] of (windowMode === 'single'
            ? [0]
            : [0, windowMode === 'gap' ? 45000 : windowMode === 'one-ms-gap' ? 44900 : 30000]
          ).entries()) {
            const run = await windowFixture(googleVersion === '8.12.0' ? '812' : '1172', admission.identity);
            const baseMono = run.clock();
            run.mutate((value) => {
              const observation = (value.observations as Array<Record<string, unknown>>)[0];
              const current: Record<string, unknown> = {
                ...observation,
                firstObservedMs: baseMono + 100,
                lastObservedMs: baseMono + 44999,
              };
              if (index === 1 && windowMode === 'changed-fifo')
                current.stderr = { ...(current.stderr as Record<string, unknown>), inode: '999' };
              value.observations = [current];
            });
            providerReader = await openInstalledProviderReader(run.context, run.admission, {
              executorFactory: run.factory,
              clock: run.clock,
              epochClock: () => baseEpoch + offset + run.clock() - baseMono,
            });
            const pending = providerReader.startStderrWindow();
            await pending.ready;
            run.releaseWindow();
            windows.push(await pending.complete);
          }
          window = windows[0];
          const row = (time: number, message: string, fields: object = {}) =>
            `${JSON.stringify({ '@timestamp': new Date(baseEpoch + time).toISOString(), '@module': 'provider', '@level': 'debug', '@message': message, ...fields })}\n`;
          const trace = traceFixture(requestFixture(), operationFixture(), googleVersion)
            .trimEnd()
            .split('\n')
            .map((raw) => {
              const value = JSON.parse(raw);
              const offset =
                value['@message'] === 'Received request'
                  ? 1000
                  : value['@message'] === 'Served request'
                    ? windowMode === 'single'
                      ? 1100
                      : 70000
                    : 1050;
              value['@timestamp'] = new Date(baseEpoch + offset).toISOString();
              return `${JSON.stringify(value)}\n`;
            })
            .join('');
          const stderr =
            row(-1, 'starting plugin', { path: providerPath, args: [providerPath] }) +
            row(0, 'plugin started', { path: providerPath, pid: 3456 }) +
            trace +
            row(windowMode === 'single' ? 60000 : 90000, 'plugin process exited', { plugin: providerPath, id: '3456' });
          const resource = {
            addr: 'google_compute_instance.node',
            module: '',
            resource: 'google_compute_instance.node',
            implied_provider: 'google',
            resource_type: 'google_compute_instance',
            resource_name: 'node',
            resource_key: null,
          };
          const ui = (time: number, type: string, fields: object = {}) =>
            row(time, 'simulated original UI', { '@module': 'terraform.ui', '@level': 'info', type, ...fields });
          const begin = timestampMode === 'late-start' ? 1150 : 900,
            end = timestampMode === 'early-complete' ? 1050 : windowMode === 'single' ? 1200 : 70100;
          const stdout =
            ui(0, 'version', { terraform: '1.17.2', ui: '1.3' }) +
            ui(begin, 'apply_start', { hook: { resource, action: 'create' } }) +
            ui(end, 'apply_complete', {
              hook: {
                resource,
                action: 'create',
                elapsed_seconds: 1,
                id_key: 'id',
                id_value: 'projects/example-project/zones/us-central1-a/instances/example-node',
              },
            });
          await writeFile(
            script,
            `import sys\nsys.stdout.buffer.write(bytes.fromhex("${Buffer.from(stdout).toString('hex')}"))\nsys.stderr.buffer.write(bytes.fromhex("${Buffer.from(stderr).toString('hex')}"))\n`,
          );
        },
        finalCapture: async () => {
          if (!witnessParent || !window) throw new Error('Original descriptor/window fixture required');
          const ui = new TerraformApplyHookParser(profilePlan, versionBinding, configuration);
          const lifecycle = new GoogleProviderLifecycleParser(
            { providerPath, planSha256: originalPlan.receipt.planSha256 },
            versionBinding,
          );
          const http = new GoogleHttpRpcTraceParser(
            { ...scope, planSha256: originalPlan.receipt.planSha256 },
            versionBinding,
          );
          const actions: WitnessInput['started'][] = [],
            rpcs: WitnessInput['rpc'][] = [];
          const httpCandidates: ReturnType<GoogleHttpRpcTraceParser['pushOriginal']>[number][] = [];
          for (const channel of ['stdout', 'stderr'] as const)
            for (;;) {
              const chunk = await witnessParent.output.read(channel);
              if (!chunk) break;
              if (channel === 'stdout') actions.push(...ui.pushOriginal(witnessParent.output, chunk));
              else {
                rpcs.push(...lifecycle.pushOriginal(witnessParent.output, chunk));
                httpCandidates.push(...http.pushOriginal(witnessParent.output, chunk));
              }
            }
          const earlyResponse = http.takeOriginalResponses()[0];
          if (!earlyResponse) throw new Error('Original early response fixture required');
          const completion = await witnessParent.output.finish();
          ui.finishOriginal(witnessParent.output, completion);
          lifecycle.finishOriginal(witnessParent.output, completion);
          http.finishOriginal(witnessParent.output, completion);
          const bodies = http.consumeBodies(httpCandidates[0]);
          const insert = inspectOriginalGcpInsertBodies(bodies, versionBinding);
          await check(
            {
              earlyResponse,
              originalPlan,
              configuration,
              providerPath,
              binding: versionBinding,
              insert,
              started: actions[0],
              completed: actions[1],
              rpc: rpcs[0],
              window,
              allWindows: windows,
              bodies,
            },
            witnessParent.output,
            witnessParent,
          );
          await providerReader?.close();
        },
      });
      return execute({ cwd: request.cwd, args: [script], env: {} });
    },
    undefined,
    'gcp-resource-plan-v1',
  );
  try {
    await runner.prepare(deployment);
    const plan = await runner.plan({});
    await runner.apply(plan, {});
  } catch (error) {
    const index = roots.indexOf(root);
    if (index >= 0) roots.splice(index, 1);
    await writeFile(
      join(witnessParent?.directory ?? root, 'fixture-failure.private.json'),
      JSON.stringify({
        retainedRoot: root,
        errorType: error instanceof Error ? error.name : typeof error,
        cloudResources: 0,
        originalInsertQualified: false,
      }),
      { flag: 'wx', mode: 0o400 },
    );
    throw error;
  }
}
