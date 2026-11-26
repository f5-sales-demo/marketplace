import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { translateGcpTerraformObserverSiteCompute } from '../../gcloud/src/ce/observer-plan';
import { createGcpTerraformRequestReason } from '../../gcloud/src/ce/request-reason';
import { GCP_XCSH15178_OBSERVER_ARTIFACTS } from '../../gcloud/src/ce/terraform-public-artifacts';
import { originalGcpBootstrapSource } from '../../platform/src/ce/gcp-bootstrap-evidence';
import { openOriginalGcpBootstrapObservation } from '../../platform/src/ce/gcp-bootstrap-observation';
import { createInstalledApplyController } from '../src/installed-apply-controller';
import { createInstalledCaptureContext, type InstalledCaptureContext } from '../src/installed-capture-context';
import { admitFinalReaderReserve } from '../src/reader-final-reserve';
import type { CeTerraformRuntimeRequest } from '../src/service';
import { signalFreeTerraformExecutor } from '../src/signal-free-executor';
import { fixture } from './installed-provider-reader-fixture';
import { authInfo, roots as originalRoots, fixture as withOriginalPlan } from './original-gcp-inventory-fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

for (const mode of ['missing-plan', 'copied-plan', 'wrong-engine', 'wrong-directory', 'changed-budget'] as const)
  test(`complete installed capture factory refuses unbound prerequisites before cloud work: ${mode}`, async () => {
    const { createInstalledGcpCaptureFactory } = await import('../src/installed-capture-factory');
    const run = await fixture('812');
    let storageCalls = 0;
    const base = createInstalledCaptureContext({
      ...run.context,
      executionDirectory: join(run.context.executionDirectory, run.context.owner.deploymentId),
    });
    const context =
      mode === 'copied-plan'
        ? {
            ...base,
            readOriginalPlanSource: async () => ({ schemaVersion: 1, kind: 'original-terraform-plan' }) as never,
          }
        : mode === 'changed-budget'
          ? { ...base, budget: { ...base.budget, deadline: base.budget.deadline + 1 } }
          : base;
    const request = {
      owner: { ...context.owner, ...(mode === 'wrong-engine' ? { engine: 'native' } : {}) },
      directory: mode === 'wrong-directory' ? '/example/foreign' : run.context.executionDirectory,
      deployment: {
        deploymentId: context.owner.deploymentId,
        engine: 'terraform',
        scope: {
          cloud: 'gcp',
          account: context.owner.account,
          region: context.owner.region,
        },
      },
      resume: false,
      platform: {
        storage: async () => {
          storageCalls++;
          throw new Error('Cloud/storage work must not start');
        },
      },
    } as unknown as CeTerraformRuntimeRequest;
    await expect(
      (async () => {
        const capture = createInstalledGcpCaptureFactory()(request, context as InstalledCaptureContext);
        await capture.prepare?.(context as InstalledCaptureContext);
      })(),
    ).rejects.toThrow(/[Oo]riginal/);
    expect(storageCalls).toBe(0);
    expect(run.executions()).toBe(0);
  });

for (const preparationMode of [
  'never-prepared',
  'close-during-preparation',
  'complete',
  'assembled-retention-failure',
  'trace-mapping-preparation-failure',
  'actor-start-failure',
  'compiled-actor-startup',
  'compiled-actor-execution',
  'after-runner-retirement',
] as const)
  test(`complete factory original21resource preflight lifecycle: ${preparationMode}`, async () => {
    const { createInstalledGcpCaptureFactory } = await import('../src/installed-capture-factory');
    const originalFetch = globalThis.fetch;
    const originalSshClientsDirectory = process.env.XCSH_TERRAFORM_SSH_CLIENTS_DIR;
    const sshFixture = await mkdtemp(join(tmpdir(), 'factory-gcp-ssh-'));
    const calls: string[] = [];
    const nativeFiles =
      (preparationMode.startsWith('compiled-actor-') || preparationMode === 'never-prepared') &&
      process.env.CE_TEST_NATIVE_GCP_FILES
        ? (JSON.parse(await readFile(process.env.CE_TEST_NATIVE_GCP_FILES, 'utf8')) as {
            terraform: string;
            providers: string;
          })
        : undefined;
    let closeAfterRunnerRetirement: (() => Promise<void>) | undefined;
    let unpreparedCoverageVerified = false;
    const fakeFetch = (async (value: string | URL | Request) => {
      const url = new URL(String(value));
      calls.push(url.pathname);
      if (url.pathname === '/token')
        return Response.json({ access_token: 'synthetic', token_type: 'Bearer', expires_in: 3599 });
      if (url.pathname === '/oauth2/v2/tokeninfo') return Response.json(authInfo);
      if (url.pathname === '/v1/projects/example-project')
        return Response.json({ projectId: 'example-project', lifecycleState: 'ACTIVE' });
      if (url.pathname.endsWith('/images/ubuntu-2404-noble-amd64-v20261021'))
        return Response.json({
          kind: 'compute#image',
          id: '4996011480491275419',
          name: 'ubuntu-2404-noble-amd64-v20261021',
          selfLink:
            'https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20261021',
          status: 'READY',
          architecture: 'X86_64',
          creationTimestamp: '2026-10-21T00:00:00.000Z',
        });
      if (
        url.pathname.startsWith('/compute/v1/projects/example-project/') ||
        /^\/api\/(config\/namespaces\/system\/securemesh_site_v2s|register\/namespaces\/system\/tokens)\//.test(
          url.pathname,
        )
      )
        return Response.json({ error: { code: 404, errors: [{ reason: 'notFound' }] } }, { status: 404 });
      throw new Error('Unexpected fixture request');
    }) as typeof fetch;
    globalThis.fetch = fakeFetch;
    try {
      const python = process.env.CE_TEST_PYTHON;
      if (!python) throw new Error('Original test Python prerequisite required');
      const clientsDirectory = join(sshFixture, 'clients');
      const installer = Bun.spawn(
        [
          python,
          '-I',
          '-B',
          join(import.meta.dir, '../scripts/install_ssh_clients.py'),
          '--clients-dir',
          clientsDirectory,
        ],
        { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(installer.stdout).text(),
        new Response(installer.stderr).text(),
        installer.exited,
      ]);
      expect(exitCode).toBe(0);
      expect(stderr).toBe('');
      expect(JSON.parse(stdout).status).toBe('ready');
      process.env.XCSH_TERRAFORM_SSH_CLIENTS_DIR = clientsDirectory;
      const originalFixture = withOriginalPlan(
        async (context, store, owningInvocation) => {
          const originalWrite = store.write.bind(store);
          let rejectedAssembly = false;
          let assemblyReached: () => void = () => {};
          let releaseAssembly: () => void = () => {};
          const reached = new Promise<void>((resolve) => {
            assemblyReached = resolve;
          });
          const release = new Promise<void>((resolve) => {
            releaseAssembly = resolve;
          });
          store.write = async (name, value) => {
            if (
              preparationMode === 'close-during-preparation' &&
              value &&
              typeof value === 'object' &&
              (value as { phase?: string }).phase === 'assembled'
            ) {
              assemblyReached();
              await release;
            }
            if (
              preparationMode === 'assembled-retention-failure' &&
              !rejectedAssembly &&
              value &&
              typeof value === 'object' &&
              (value as { phase?: string }).phase === 'assembled'
            ) {
              rejectedAssembly = true;
              throw new Error('Synthetic assembled retention failure');
            }
            return originalWrite(name, value);
          };
          const platform = {
            storage: async () => store,
            gcpBootstrapSource: () => originalGcpBootstrapSource,
            gcpBootstrapObservation: async (
              _owner: unknown,
              _name: string,
              input: {
                origin: string;
                targets: Parameters<typeof openOriginalGcpBootstrapObservation>[0]['targets'];
                assertOriginal(): Promise<void>;
              },
            ) =>
              openOriginalGcpBootstrapObservation(
                {
                  store,
                  origin: input.origin,
                  credential: context.environment.XCSH_API_TOKEN,
                  targets: input.targets,
                  assertOriginal: input.assertOriginal,
                },
                { fetcher: fakeFetch },
              ),
          };
          const request = {
            owner: context.owner,
            directory: store.directory,
            resume: false,
            platform,
            deployment: {
              deploymentId: context.owner.deploymentId,
              engine: 'terraform',
              scope: { cloud: 'gcp', account: context.owner.account, region: context.owner.region },
            },
          } as unknown as CeTerraformRuntimeRequest;
          const originalFactory = createInstalledGcpCaptureFactory()(request, context);
          const capture =
            preparationMode === 'after-runner-retirement'
              ? (await import('../src/installed-apply-controller')).createInstalledApplyController(
                  context,
                  originalFactory,
                  { persist: async () => {} },
                )
              : originalFactory;
          if (preparationMode === 'close-during-preparation') {
            const preparing = capture.prepare?.(context);
            if (!preparing) throw new Error('Original preparation source required');
            await reached;
            let closed = false;
            const originalClosure = capture.closeAfterExecutorExit();
            expect(capture.closeAfterExecutorExit()).toBe(originalClosure);
            const closure = originalClosure.then(() => {
              closed = true;
            });
            try {
              await Bun.sleep(25);
              expect(closed).toBe(false);
              await expect(capture.prepare?.(context)).rejects.toThrow('closed');
              await expect(capture.prepare?.({ ...context })).rejects.toThrow('Original');
            } finally {
              releaseAssembly();
              await Promise.all([preparing, closure]);
            }
            expect(closed).toBe(true);
            await expect(capture.assertOriginal()).rejects.toThrow('closed');
            await expect(capture.start({} as never)).rejects.toThrow('closed');
            await retainOwnedTestCapture(store.directory, 'complete-factory-concurrent-preflight-closure', 'success');
            return;
          }
          if (preparationMode === 'never-prepared') {
            const closure = capture.closeAfterExecutorExit();
            expect(capture.closeAfterExecutorExit()).toBe(closure);
            if (!nativeFiles) {
              // Symbolic executable labels deliberately differ from the pinned
              // native digests and cannot prove durable original input closure.
              await expect(closure).rejects.toThrow('closure');
              await expect(capture.readClosedReaderGroupInputs?.()).rejects.toThrow('unavailable');
              await expect(capture.prepare?.(context)).rejects.toThrow('closed');
              expect(calls).toHaveLength(0);
              await retainOwnedTestCapture(store.directory, 'complete-factory-symbolic-unprepared-refusal', 'success');
              return;
            }
            await closure;
            await expect(capture.prepare?.(context)).rejects.toThrow('closed');
            expect(calls).toHaveLength(0);
            if (!capture.readClosedReaderGroupInputs) throw new Error('Original unprepared source accessor required');
            const inputs = await capture.readClosedReaderGroupInputs();
            const { readFile } = await import('node:fs/promises');
            expect(Object.values(inputs)).toHaveLength(1);
            const record = JSON.parse(await readFile(Object.values(inputs)[0].path, 'utf8'));
            expect(record.requiredSources).toEqual(['factory-preparation']);
            expect(record.sources).toEqual([{ name: 'factory-preparation', attemptCount: 0, witnesses: [] }]);
            expect(record.executionAccepted).toBe(false);
            expect(record.guestAcceptanceComplete).toBe(false);
            const { assertOriginalReaderGroupInputs } = await import('../src/original-reader-group-closure');
            await assertOriginalReaderGroupInputs({
              inputs,
              owner: context.owner,
              requiredSources: ['factory-preparation'],
            });
            unpreparedCoverageVerified = true;
            const { writeFile } = await import('node:fs/promises');
            await writeFile(
              context.inputs['workspace:gcp-terraform-input-identity.json'].path,
              'foreign original input',
            );
            await expect(capture.readClosedReaderGroupInputs()).rejects.toThrow('Original');
            await retainOwnedTestCapture(store.directory, 'complete-factory-never-prepared', 'success');
            return;
          }
          if (preparationMode === 'trace-mapping-preparation-failure') {
            let outcome: 'success' | 'failure' = 'failure';
            try {
              await expect(capture.prepare?.(context)).rejects.toThrow(
                'Original saved request reason fingerprint differs',
              );
              const closing = capture.closeAfterExecutorExit();
              expect(capture.closeAfterExecutorExit()).toBe(closing);
              await closing;
              const readInputs = capture.readClosedReaderGroupInputs;
              if (!readInputs) throw new Error('Original pre-start factory source accessor required');
              const inputs = await readInputs();
              const bindings = Object.values(inputs);
              expect(bindings).toHaveLength(1);
              const groupSet = JSON.parse(await readFile(bindings[0].path, 'utf8'));
              expect(groupSet.kind).toBe('original-reader-group-set');
              expect(groupSet.requiredSources).toHaveLength(29);
              expect(groupSet.sources).toHaveLength(29);
              expect(
                groupSet.sources.every(
                  (row: { attemptCount: number; witnesses: unknown[] }) =>
                    row.attemptCount === 0 && row.witnesses.length === 0,
                ),
              ).toBe(true);
              expect(groupSet.executionAccepted).toBe(false);
              expect(groupSet.guestAcceptanceComplete).toBe(false);
              const { assertOriginalReaderGroupInputs } = await import('../src/original-reader-group-closure');
              await assertOriginalReaderGroupInputs({
                inputs,
                owner: context.owner,
                requiredSources: groupSet.requiredSources,
              });
              await expect(capture.prepare?.(context)).rejects.toThrow('closed');
              outcome = 'success';
            } finally {
              await retainOwnedTestCapture(
                store.directory,
                'complete-factory-trace-mapping-preparation-failure',
                outcome,
              );
            }
            return;
          }
          if (preparationMode === 'assembled-retention-failure')
            await expect(capture.prepare?.(context)).rejects.toThrow('Synthetic assembled retention failure');
          else await capture.prepare?.(context);
          if (preparationMode === 'complete')
            await expect(capture.prepare?.({ ...context })).rejects.toThrow('Original');
          expect(calls.some((path) => path.endsWith('/images/ubuntu-2404-noble-amd64-v20261021'))).toBe(true);
          expect(
            calls.filter(
              (path) => path.startsWith('/compute/v1/projects/example-project/') && !path.includes('/images/'),
            ),
          ).toHaveLength(preparationMode === 'assembled-retention-failure' ? 0 : 17);
          if (preparationMode === 'after-runner-retirement') {
            const originalPlan = await context.readOriginalPlanSource?.();
            closeAfterRunnerRetirement = async () => {
              const { assertOriginalTerraformPlanProjection } = await import('../src/runner');
              await expect(assertOriginalTerraformPlanProjection(originalPlan)).rejects.toThrow('retired');
              let outcome: 'success' | 'failure' = 'failure';
              try {
                await capture.closeAfterExecutorExit();
                const { readdir } = await import('node:fs/promises');
                const events = await Promise.all(
                  (await readdir(store.directory))
                    .filter((name) => name.startsWith('gcp-complete-factory-'))
                    .map((name) => store.read(name) as Promise<{ phase?: string; stage?: string }>),
                );
                expect(
                  events
                    .filter((event) => event.phase === 'stage-closed')
                    .map((event) => event.stage)
                    .sort(),
                ).toEqual(['access', 'bootstrap', 'correspondence', 'guest', 'inventory', 'provider', 'trace', 'vm']);
                const guestSources = events.filter(
                  (event) => event.phase === 'guest-reader-groups',
                ) as unknown as Array<{ source: string; attemptCount: number; witnesses: unknown[] }>;
                expect(guestSources.map((event) => event.source).sort()).toEqual(['guest-before', 'guest-final']);
                for (const event of guestSources) {
                  expect(event.attemptCount).toBe(0);
                  expect(event.witnesses).toEqual([]);
                }
                const readClosedInputs = capture.readClosedReaderGroupInputs;
                if (!readClosedInputs) throw new Error('Original factory durable source accessor unavailable');
                const inputs = await readClosedInputs();
                const records = Object.values(inputs);
                expect(records).toHaveLength(1);
                const record = JSON.parse(await readFile(records[0].path, 'utf8'));
                expect(record.kind).toBe('original-reader-group-set');
                expect(
                  record.sources.every(
                    (source: { attemptCount: number; witnesses: unknown[] }) =>
                      source.attemptCount === 0 && source.witnesses.length === 0,
                  ),
                ).toBe(true);
                expect(record.requiredSources).toContain('provider');
                expect(record.requiredSources).toContain('xcsh');
                expect(record.requiredSources).toContain('bootstrap-publisher');
                expect(record.requiredSources).toContain('guest-before');
                expect(record.requiredSources).toContain('before-observer-wire');
                expect(record.requiredSources).toContain('final-observer-renewal');
                const { assertOriginalReaderGroupInputs } = await import('../src/original-reader-group-closure');
                await assertOriginalReaderGroupInputs({
                  inputs,
                  owner: context.owner,
                  requiredSources: record.requiredSources,
                });
                await expect(capture.assertOriginal()).rejects.toThrow('closed');
                outcome = 'success';
              } finally {
                await retainOwnedTestCapture(store.directory, 'complete-factory-after-runner-retirement', outcome);
              }
            };
            return;
          }
          if (preparationMode === 'actor-start-failure' || preparationMode.startsWith('compiled-actor-')) {
            const sourceRoot = originalRoots.find((root) => store.directory.startsWith(`${root}/`));
            if (!sourceRoot) throw new Error('Original native fixture source root required');
            let actorOutcome: 'success' | 'failure' = 'failure';
            try {
              const python = await realpath(context.inputs.python.path);
              const executable = {
                path: python,
                sha256: createHash('sha256')
                  .update(await readFile(python))
                  .digest('hex'),
              };
              const script = join(context.executionDirectory, 'apply');
              await writeFile(script, 'raise SystemExit(0)\n', { mode: 0o600 });
              const events: Readonly<Record<string, unknown>>[] = [];
              const controller = createInstalledApplyController(context, capture, {
                persist: async (event) => {
                  events.push(event);
                },
              });
              await controller.prepare?.(context);
              let compiledInvocation = { cwd: context.executionDirectory, args: ['apply', 'saved.tfplan'], env: {} };
              if (preparationMode.startsWith('compiled-actor-')) {
                const { prepareOriginalCreationScope } = await import('../src/prepared-creation-scope');
                const { createInstalledGcpInvocationCompiler } = await import('../src/installed-gcp-invocation');
                const packet = await prepareOriginalCreationScope(context);
                const environment = {
                  HOME: process.env.HOME as string,
                  PATH: process.env.PATH as string,
                  ...context.environment,
                };
                const compile = createInstalledGcpInvocationCompiler({
                  directory: context.executionDirectory,
                  environment,
                  readPreparedCreationScope: () => packet,
                });
                compiledInvocation = compile({ ...owningInvocation, env: { ...owningInvocation.env, ...environment } });
              }
              let parentFinal: import('../src/signal-free-executor').FinalExecutionCapture | undefined;
              let started = false,
                finalAttempted = false;
              const execute = signalFreeTerraformExecutor({
                python: executable,
                executable,
                originalStartMs: context.budget.start,
                originalDeadlineMs: context.budget.deadline,
                assertOriginal: context.assertInputs,
                beforeRelease: async (admission) => {
                  started = true;
                  await controller.start(admission);
                  if (preparationMode === 'compiled-actor-startup')
                    throw new Error('Intentional qualified startup refusal before submission');
                },
                finalCapture: async (finished) => {
                  finalAttempted = true;
                  parentFinal = finished;
                  await writeFile(
                    join(context.executionDirectory, 'factory-parent-final.private.json'),
                    JSON.stringify(finished),
                    { mode: 0o400, flag: 'wx' },
                  );
                  if (!finished.identity) throw new Error('Original actor identity required');
                  const reserve = admitFinalReaderReserve({
                    identity: finished.identity,
                    originalStartMs: context.budget.start,
                    originalDeadlineMs: context.budget.deadline,
                    finalStartedMs: finished.finalStartedMs,
                    finalDeadlineMs: finished.finalDeadlineMs,
                    assertOriginal: context.assertInputs,
                  });
                  let finalFailure: unknown;
                  try {
                    await controller.finalCapture(finished, reserve);
                  } catch (error) {
                    finalFailure = error;
                  }
                  const encodeFailure = (error: unknown): unknown =>
                    error instanceof Error
                      ? {
                          name: error.name,
                          message: error.message,
                          ...(error instanceof AggregateError ? { errors: error.errors.map(encodeFailure) } : {}),
                          ...(error.cause ? { cause: encodeFailure(error.cause) } : {}),
                        }
                      : { type: typeof error };
                  await writeFile(
                    join(context.executionDirectory, 'factory-final-failure.private.json'),
                    JSON.stringify(encodeFailure(finalFailure)),
                    { mode: 0o400, flag: 'wx' },
                  );
                  expect(finalFailure).toBeInstanceOf(Error);
                },
              });
              const result = await execute(compiledInvocation);
              if (preparationMode === 'compiled-actor-startup') {
                const startupPath = parentFinal?.startupFailureEvidence?.find(
                  (record) => record.phase === 'callback',
                )?.path;
                if (!startupPath) throw new Error('Original startup failure evidence required');
                const diagnostic = JSON.parse(await readFile(startupPath, 'utf8'));
                expect(diagnostic.error.message).toBe(
                  nativeFiles
                    ? 'Intentional qualified startup refusal before submission'
                    : 'Original xcsh reader closure incomplete',
                );
                const { readdir } = await import('node:fs/promises');
                const stageEvents = await Promise.all(
                  (await readdir(store.directory))
                    .filter((name) => name.startsWith('gcp-complete-factory-'))
                    .map((name) => store.read(name) as Promise<{ phase?: string; stage?: string }>),
                );
                expect(
                  stageEvents
                    .filter((event) => event.phase === 'started')
                    .map((event) => event.stage)
                    .sort(),
                ).toEqual(
                  nativeFiles
                    ? ['inventory', 'bootstrap', 'provider', 'vm', 'trace', 'correspondence', 'access', 'guest'].sort()
                    : ['inventory'],
                );
              }
              if (preparationMode === 'compiled-actor-execution' && nativeFiles) {
                // The disposable Python actor actually passed release; no cloud
                // provider ran. Its natural exit cannot qualify guest capture.
                expect(result.code).toBe(0);
                expect(parentFinal?.startupFailureEvidence ?? []).toEqual([]);
                expect(parentFinal?.actualExitCode).toBe(0);
                expect(parentFinal?.signalsSent).toBe(false);
                const { readdir } = await import('node:fs/promises');
                const stageEvents = await Promise.all(
                  (await readdir(store.directory))
                    .filter((name) => name.startsWith('gcp-complete-factory-'))
                    .map((name) => store.read(name) as Promise<{ phase?: string; stage?: string }>),
                );
                expect(
                  stageEvents
                    .filter((event) => event.phase === 'started')
                    .map((event) => event.stage)
                    .sort(),
                ).toEqual(
                  ['inventory', 'bootstrap', 'provider', 'vm', 'trace', 'correspondence', 'access', 'guest'].sort(),
                );
                expect(
                  stageEvents.some((event) => event.phase === 'final-captured' && event.stage === 'inventory'),
                ).toBe(true);
                const finalStages = stageEvents
                  .filter((event) => ['final-refused', 'final-captured'].includes(event.phase ?? ''))
                  .map((event) => event.stage);
                expect([...new Set(finalStages)].sort()).toEqual(
                  ['inventory', 'bootstrap', 'provider', 'vm', 'trace', 'correspondence', 'access', 'guest'].sort(),
                );
              } else expect(result.code).toBe(1);
              expect(started).toBe(true);
              expect(finalAttempted).toBe(true);
              expect(events.some((event) => event.phase === 'final-failed')).toBe(true);
              let closureFailure: unknown;
              try {
                await controller.closeAfterExecutorExit();
              } catch (error) {
                closureFailure = error;
              }
              const failureTree = (error: unknown): unknown =>
                error instanceof Error
                  ? {
                      name: error.name,
                      message: error.message,
                      ...(error instanceof AggregateError ? { errors: error.errors.map(failureTree) } : {}),
                      ...(error.cause ? { cause: failureTree(error.cause) } : {}),
                    }
                  : { type: typeof error };
              await writeFile(
                join(context.executionDirectory, 'factory-closure-failure.private.json'),
                JSON.stringify(failureTree(closureFailure)),
                { mode: 0o400, flag: 'wx' },
              );
              expect(closureFailure).toBeInstanceOf(Error);
              if (nativeFiles) {
                const readInputs = controller.readClosedReaderGroupInputs;
                if (!readInputs) throw new Error('Original native factory cleanup source accessor required');
                const inputs = await readInputs();
                const records = Object.values(inputs);
                expect(records).toHaveLength(1);
                const groupSet = JSON.parse(await readFile(records[0].path, 'utf8'));
                expect(groupSet.kind).toBe('original-reader-group-set');
                expect(groupSet.owner).toEqual(context.owner);
                expect(groupSet.executionAccepted).toBe(false);
                expect(groupSet.guestAcceptanceComplete).toBe(false);
                expect(groupSet.sources).toHaveLength(29);
                expect(groupSet.requiredSources).toHaveLength(29);
                const sources = groupSet.sources as Array<{
                  name: string;
                  attemptCount: number;
                  witnesses: Array<{
                    physicalGroupAbsent: boolean;
                    producerReportedClosed: boolean;
                    captureComplete: boolean;
                    executionAccepted: boolean;
                  }>;
                }>;
                for (const name of ['provider', 'xcsh']) {
                  const source = sources.find((row) => row.name === name);
                  if (!source) throw new Error('Original native reader source required');
                  expect(source.attemptCount).toBe(1);
                  expect(source.witnesses).toHaveLength(1);
                  expect(source.witnesses[0].physicalGroupAbsent).toBe(true);
                  expect(source.witnesses[0].producerReportedClosed).toBe(true);
                  const nativeWitness = source
                    .witnesses[0] as unknown as import('../src/original-reader-group-closure').OriginalReaderGroupClosure;
                  const originalCompletion = JSON.parse(await readFile(nativeWitness.inputs.completion.path, 'utf8'));
                  expect(source.witnesses[0].captureComplete).toBe(originalCompletion.captureClosed);
                  expect(originalCompletion.originalGroupClosed).toBe(true);
                  expect(originalCompletion.signalsSent).toBe(false);
                  expect(originalCompletion.identity).toEqual(nativeWitness.identity);
                  // Normal child output can complete without an observed cloud
                  // provider or any accepted guest evidence. The original typed
                  // reader-group verifier below revalidates the native fact.

                  expect(source.witnesses[0].executionAccepted).toBe(false);
                }
                expect(
                  sources
                    .filter((source) => !['provider', 'xcsh'].includes(source.name))
                    .every((source) => source.attemptCount === 0 && source.witnesses.length === 0),
                ).toBe(true);
                const { assertOriginalReaderGroupInputs } = await import('../src/original-reader-group-closure');
                await assertOriginalReaderGroupInputs({
                  inputs,
                  owner: context.owner,
                  requiredSources: groupSet.requiredSources,
                });
                const { createInstalledReaderInputRetention } = await import('../src/installed-reader-input-retention');
                const retainInputs = createInstalledReaderInputRetention({
                  store,
                  owner: context.owner,
                  executionDirectory: context.executionDirectory,
                  readInputs,
                });
                await Promise.all([retainInputs(), retainInputs()]);
                await retainInputs();
                const { readdir } = await import('node:fs/promises');
                const retainedNames = (await readdir(store.directory)).filter((name) =>
                  name.startsWith('immutable-installed-reader-inputs-'),
                );
                expect(retainedNames).toHaveLength(1);
                const retained = (await store.read(retainedNames[0])) as {
                  kind: string;
                  readerInputs: unknown;
                  executionAccepted: boolean;
                  guestAcceptanceComplete: boolean;
                };
                expect(retained.kind).toBe('original-installed-reader-inputs');
                expect(retained.readerInputs).toEqual(inputs);
                expect(retained.executionAccepted).toBe(false);
                expect(retained.guestAcceptanceComplete).toBe(false);
                await expect(controller.closeAfterExecutorExit()).rejects.toThrow();
                expect(events.some((event) => event.phase === 'final-failed')).toBe(true);
              }
              actorOutcome = 'success';
            } finally {
              originalRoots.splice(originalRoots.indexOf(sourceRoot), 1);
              await retainOwnedTestCapture(sourceRoot, `complete-factory-${preparationMode}`, actorOutcome);
            }
          } else {
            await capture.closeAfterExecutorExit();
            await retainOwnedTestCapture(store.directory, `complete-factory-${preparationMode}`, 'success');
          }
        },
        preparationMode === 'trace-mapping-preparation-failure' ? 'missing-request-reason-fingerprint' : '',
        true,
        () => false,
        (intent) =>
          JSON.stringify(
            translateGcpTerraformObserverSiteCompute(
              intent,
              GCP_XCSH15178_OBSERVER_ARTIFACTS.versions,
              intent.observer as NonNullable<typeof intent.observer>,
              createGcpTerraformRequestReason(intent),
            ).configuration,
          ),
        undefined,
        GCP_XCSH15178_OBSERVER_ARTIFACTS.providerLock,
        true,
        7200000,
        preparationMode === 'after-runner-retirement'
          ? async () => {
              if (!closeAfterRunnerRetirement) throw new Error('Original complete factory retirement closure required');
              await closeAfterRunnerRetirement();
            }
          : undefined,
        nativeFiles,
      );
      if (preparationMode === 'never-prepared' && nativeFiles) {
        // Deliberate post-closure mutation also trips the owning fixture's
        // final original-input guard. Both boundaries must retain refusal.
        await expect(originalFixture).rejects.toThrow('Original input monitor detected');
        expect(unpreparedCoverageVerified).toBe(true);
      } else await originalFixture;
    } finally {
      globalThis.fetch = originalFetch;
      if (originalSshClientsDirectory === undefined) delete process.env.XCSH_TERRAFORM_SSH_CLIENTS_DIR;
      else process.env.XCSH_TERRAFORM_SSH_CLIENTS_DIR = originalSshClientsDirectory;
      await rm(sshFixture, { recursive: true, force: true });
    }
  }, 60000);
