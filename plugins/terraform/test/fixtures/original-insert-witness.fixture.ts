/** Real output/plan issuers with explicitly simulated UI, HTTP and provider process observations. */
import { afterEach } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GCP_PUBLIC_TERRAFORM_ARTIFACTS } from '../../../gcloud/src/ce/terraform-public-artifacts';
import { GoogleHttpRpcTraceParser } from '../../src/gcp-http-rpc-trace';
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
  originalPlan: OriginalTerraformPlanProjection;
  configuration: string;
  providerPath: string;
  binding: typeof currentBinding;
  insert: ReturnType<typeof inspectOriginalGcpInsertBodies>;
  started: ReturnType<TerraformApplyHookParser['pushOriginal']>[number];
  completed: ReturnType<TerraformApplyHookParser['pushOriginal']>[number];
  rpc: ReturnType<GoogleProviderLifecycleParser['pushOriginal']>[number];
  window: InstalledProviderWindow;
};

export async function withInsertWitnesses(
  check: (value: WitnessInput, output: OriginalExecutionOutput, admission: ExecutionCaptureAdmission) => Promise<void>,
  timestampMode = 'normal',
) {
  const root = await mkdtemp(join(tmpdir(), 'original-insert-witness-'));
  roots.push(root);
  const original = sourceJoinFixture(currentBinding, '8.11.0');
  const configuration = original.configuration;
  if (!GCP_PUBLIC_TERRAFORM_ARTIFACTS) throw new Error('Current authenticated profile required');
  const deployment: Deployment = {
    schemaVersion: 1,
    deploymentId: 'example-deployment',
    engine: 'terraform',
    scope: { cloud: 'gcp', account: 'example-project', region: 'us-central1' },
    terraformVersion: '1.17.2',
    configuration,
    providerLock: GCP_PUBLIC_TERRAFORM_ARTIFACTS.providerLock,
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
      let providerReader: Awaited<ReturnType<typeof openInstalledProviderReader>> | undefined;
      const providerPath = '/example/provider/terraform-provider-google_v8.11.0_x5';
      const start = linuxMonotonicMs();
      const execute = signalFreeTerraformExecutor({
        python: executable,
        executable,
        originalStartMs: start,
        originalDeadlineMs: start + 7200000,
        assertOriginal: async () => {},
        beforeRelease: async (admission) => {
          witnessParent = admission;
          const run = await windowFixture('1172', admission.identity),
            baseMono = run.clock(),
            baseEpoch = Date.now();
          run.mutate((value) => {
            const observation = (value.observations as Array<Record<string, unknown>>)[0];
            value.observations = [
              { ...observation, firstObservedMs: baseMono + 100, lastObservedMs: baseMono + 44999 },
            ];
          });
          providerReader = await openInstalledProviderReader(run.context, run.admission, {
            executorFactory: run.factory,
            clock: run.clock,
            epochClock: () => baseEpoch + run.clock() - baseMono,
          });
          const pending = providerReader.startStderrWindow();
          await pending.ready;
          run.releaseWindow();
          window = await pending.complete;
          const row = (time: number, message: string, fields: object = {}) =>
            `${JSON.stringify({ '@timestamp': new Date(baseEpoch + time).toISOString(), '@module': 'provider', '@level': 'debug', '@message': message, ...fields })}\n`;
          const trace = traceFixture(requestFixture(), operationFixture(), '8.11.0')
            .trimEnd()
            .split('\n')
            .map((raw) => {
              const value = JSON.parse(raw);
              const offset =
                value['@message'] === 'Received request' ? 1000 : value['@message'] === 'Served request' ? 1100 : 1050;
              value['@timestamp'] = new Date(baseEpoch + offset).toISOString();
              return `${JSON.stringify(value)}\n`;
            })
            .join('');
          const stderr =
            row(-1, 'starting plugin', { path: providerPath, args: [providerPath] }) +
            row(0, 'plugin started', { path: providerPath, pid: 3456 }) +
            trace +
            row(60000, 'plugin process exited', { plugin: providerPath, id: '3456' });
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
            end = timestampMode === 'early-complete' ? 1050 : 1200;
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
          const ui = new TerraformApplyHookParser(profilePlan, currentBinding, configuration);
          const lifecycle = new GoogleProviderLifecycleParser(
            { providerPath, planSha256: originalPlan.receipt.planSha256 },
            currentBinding,
          );
          const http = new GoogleHttpRpcTraceParser(
            { ...scope, planSha256: originalPlan.receipt.planSha256 },
            currentBinding,
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
          const completion = await witnessParent.output.finish();
          ui.finishOriginal(witnessParent.output, completion);
          lifecycle.finishOriginal(witnessParent.output, completion);
          http.finishOriginal(witnessParent.output, completion);
          const insert = inspectOriginalGcpInsertBodies(http.consumeBodies(httpCandidates[0]), currentBinding);
          await check(
            {
              originalPlan,
              configuration,
              providerPath,
              binding: currentBinding,
              insert,
              started: actions[0],
              completed: actions[1],
              rpc: rpcs[0],
              window,
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
  await runner.prepare(deployment);
  const plan = await runner.plan({});
  await runner.apply(plan, {});
}
