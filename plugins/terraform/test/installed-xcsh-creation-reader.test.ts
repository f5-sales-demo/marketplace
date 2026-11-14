import { expect, test } from 'bun:test';
import type { InstalledCaptureContext } from '../src/installed-capture-context';
import type { ExecutionCaptureAdmission } from '../src/signal-free-executor';

function fixtureOutput() {
  return Object.freeze({
    read: async () => {
      throw new Error('Offline fixture has no original output capability');
    },
    finish: async () => {
      throw new Error('Offline fixture has no original output capability');
    },
  });
}

async function bridge() {
  return import('../src/installed-xcsh-creation-reader');
}

test('xcsh bridge rejects deserialized authority before filesystem or executor work', async () => {
  const { openInstalledXcshCreationReader } = await bridge();
  let executions = 0;
  const context = {
    schemaVersion: 2,
    kind: 'original-installed-gcp-capture-context',
    owner: { provider: 'gcp', engine: 'terraform' },
    executionDirectory: '/private/foreign',
    budget: { start: 100, deadline: 7200100 },
  } as InstalledCaptureContext;
  const admission = {
    output: fixtureOutput(),
    stdoutPath: join(context.executionDirectory, 'stdout.private'),
    stderrPath: join(context.executionDirectory, 'stderr.private'),
    directory: context.executionDirectory,
    args: ['apply', 'saved.tfplan'],
    identity: { pid: 123, group: 123, start: '100', boot: '11111111-1111-1111-1111-111111111111' },
    originalStartMs: 100,
    originalDeadlineMs: 7200100,
    startupDeadlineMs: 15100,
  } as ExecutionCaptureAdmission;
  await expect(
    openInstalledXcshCreationReader(
      context,
      admission,
      JSON.parse(JSON.stringify({ schemaVersion: 1, kind: 'prepared-original-creation-scope' })),
      {
        executorFactory: () => {
          executions++;
          throw new Error('must not execute');
        },
        clock: () => 200,
      },
    ),
  ).rejects.toThrow();
  expect(executions).toBe(0);
});

test('xcsh bridge cannot accept copied reader results as original evidence', async () => {
  const { readOriginalInstalledXcshCreation } = await bridge();
  for (const value of [{}, { schemaVersion: 1, kind: 'original-xcsh-creation-result', complete: true }])
    await expect(readOriginalInstalledXcshCreation(value as never)).rejects.toThrow('original');
});

test('xcsh bridge production cannot substitute an offline clock', async () => {
  const { openInstalledXcshCreationReader } = await bridge();
  await expect(
    openInstalledXcshCreationReader(
      {} as InstalledCaptureContext,
      {} as ExecutionCaptureAdmission,
      {},
      { clock: () => 0 },
    ),
  ).rejects.toThrow('clock');
});

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInstalledCaptureContext } from '../src/installed-capture-context';
import { inspectInstalledCaptureScripts, readOwnedInstalledInput } from '../src/installed-runtime';
import { linuxMonotonicMs } from '../src/linux-clock';
import { closePreparedCreationScope, prepareOriginalCreationScope } from '../src/prepared-creation-scope';
import { type Deployment, type Invocation, readOriginalTerraformPlanSource, TerraformRunner } from '../src/runner';
import type { SignalFreeExecutionPolicy } from '../src/signal-free-executor';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function scoped(
  run: (context: InstalledCaptureContext, admission: ExecutionCaptureAdmission, packet: unknown) => Promise<void>,
  includeSite = false,
) {
  const root = await mkdtemp(join(tmpdir(), 'xcsh-bridge-fixture-'));
  const deployment: Deployment = {
    schemaVersion: 1,
    deploymentId: 'ce-bridge-test',
    engine: 'terraform',
    scope: { cloud: 'gcp', account: 'example-project', region: 'us-central1' },
    terraformVersion: '1.17.2',
    configuration: '{"terraform":{"required_version":"= 1.17.2"}}',
    providerLock: '# fixture lock',
    backendIdentity: 'local:ce-bridge-test',
  };
  const runner = new TerraformRunner(
    root,
    async (request: Invocation) => {
      if (request.args[0] === 'plan')
        await writeFile(join(request.cwd, 'saved.tfplan'), 'original-bridge-plan', { mode: 0o600 });
      if (request.args[0] === 'apply') {
        const adc = join(request.cwd, 'adc.private'),
          platform = join(request.cwd, 'platform.private');
        await writeFile(
          adc,
          JSON.stringify({
            type: 'authorized_user',
            client_id: 'example-client',
            client_secret: 'example-secret',
            refresh_token: 'example-refresh',
            quota_project_id: 'example-project',
          }),
          { mode: 0o400 },
        );
        await writeFile(platform, 'original-platform', { mode: 0o400 });
        // Offline executor fixtures simulate already-verified binary labels; no binary is executed.
        const fakeBinding = async (path: string, digest: string) => {
          await writeFile(path, 'synthetic-offline-binary', { mode: 0o500 });
          return { ...(await readOwnedInstalledInput(path)).binding, sha256: digest };
        };
        const inputs = {
          ...(await inspectInstalledCaptureScripts()),
          python: await fakeBinding(
            join(request.cwd, 'python.fixture'),
            'aac3ade3f7d90fbf63e3ea0c46120a0cfbd159e1e503dde04721979507a1548b',
          ),
          terraform: await fakeBinding(
            join(request.cwd, 'terraform.fixture'),
            'dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e',
          ),
          adc: (await readOwnedInstalledInput(adc)).binding,
          platform: (await readOwnedInstalledInput(platform)).binding,
          'workspace:main.tf.json': (await readOwnedInstalledInput(join(request.cwd, 'main.tf.json'))).binding,
          'workspace:.terraform.lock.hcl': (await readOwnedInstalledInput(join(request.cwd, '.terraform.lock.hcl')))
            .binding,
        };
        const providerDirectory = join(
          request.cwd,
          '.terraform/providers/registry.terraform.io/f5-sales-demo/xcsh/15.16.2/linux_amd64',
        );
        await mkdir(providerDirectory, { recursive: true, mode: 0o700 });
        const ownedProvider = join(providerDirectory, 'terraform-provider-xcsh_v15.16.2');
        const provider = await fakeBinding(
          ownedProvider,
          '542d99d1905fe03fadce8a889390751b3ad1531f367ef678cf03d97204ef7cc1',
        );
        const started = linuxMonotonicMs();
        const context = createInstalledCaptureContext({
          owner: {
            provider: 'gcp',
            engine: 'terraform',
            account: 'example-project',
            region: 'us-central1',
            deploymentId: deployment.deploymentId,
          },
          executionDirectory: request.cwd,
          budget: { start: started, deadline: started + 7200000 },
          environment: {
            GOOGLE_APPLICATION_CREDENTIALS: adc,
            XCSH_API_URL: 'https://example.com',
            XCSH_API_TOKEN: 'example-token',
          },
          authentication: {
            accountSha256: sha(Buffer.from('principal@example.com')),
            audienceSha256: sha(Buffer.from('example-client')),
            snapshotSha256: inputs.adc.sha256,
          },
          inputs,
          assertInputs: async () => {},
          assertWithinDeadline: async () => {},
          readProviderInputs: async () => ({
            'registry.terraform.io/f5-sales-demo/xcsh:terraform-provider-xcsh_v15.16.2': provider,
          }),
          readOriginalPlanSource: () =>
            readOriginalTerraformPlanSource(request.originalPlanSource, {
              directory: request.cwd,
              engine: 'terraform',
              deploymentId: deployment.deploymentId,
              scope: deployment.scope,
              terraformVersion: deployment.terraformVersion,
              backendIdentity: deployment.backendIdentity,
            }),
        });
        const packet = await prepareOriginalCreationScope(context);
        const admission = {
          output: fixtureOutput(),
          stdoutPath: join(request.cwd, 'stdout.private'),
          stderrPath: join(request.cwd, 'stderr.private'),
          directory: request.cwd,
          args: request.args,
          identity: { pid: 1234, group: 1234, start: '100', boot: '11111111-1111-1111-1111-111111111111' },
          originalStartMs: started,
          originalDeadlineMs: started + 7200000,
          startupDeadlineMs: started + 15000,
        } as ExecutionCaptureAdmission;
        try {
          await run(context, admission, packet);
        } finally {
          closePreparedCreationScope(packet);
        }
      }
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
                  applyable: true, // codespell:ignore applyable -- exact Terraform JSON field
                  resource_changes: [
                    {
                      address: 'xcsh_token.token',
                      type: 'xcsh_token',
                      mode: 'managed',
                      change: {
                        actions: ['create'],
                        after: { name: 'example-token', namespace: 'system' },
                        after_unknown: {},
                      },
                    },
                  ],
                  ...(includeSite
                    ? {
                        resource_changes: [
                          {
                            address: 'xcsh_token.token',
                            type: 'xcsh_token',
                            mode: 'managed',
                            change: {
                              actions: ['create'],
                              after: { name: 'example-token', namespace: 'system' },
                              after_unknown: {},
                            },
                          },
                          {
                            address: 'xcsh_securemesh_site_v2.site',
                            type: 'xcsh_securemesh_site_v2',
                            mode: 'managed',
                            change: {
                              actions: ['create'],
                              after: { name: 'example-site', namespace: 'system' },
                              after_unknown: {},
                            },
                          },
                        ],
                      }
                    : {}),
                  output_changes: {},
                })
              : '',
      };
    },
    undefined,
    'gcp-resource-plan-v1',
  );
  try {
    await runner.prepare(deployment);
    const plan = await runner.plan({});
    await runner.apply(plan, {});
  } finally {
    await rm(root, { recursive: true });
  }
}

const fakeExecutor =
  (mutate: (value: Record<string, unknown>) => void = () => {}) =>
  (policy: SignalFreeExecutionPolicy) =>
  async (invocation: Invocation) => {
    await policy.assertOriginal();
    const reader = { pid: 2234, group: 2234, start: '101', boot: '11111111-1111-1111-1111-111111111111' };
    const path = invocation.args[invocation.args.indexOf('--request') + 1];
    const raw = await readFile(path),
      request = JSON.parse(raw.toString());
    await policy.beforeRelease?.({ identity: reader } as ExecutionCaptureAdmission);
    const began = linuxMonotonicMs();
    const base = {
      schemaVersion: 1,
      requestSha256: sha(raw),
      executor: request.executor,
      reader,
      scopeSha256: request.scope.planSha256,
      scopeFileSha256: request.scope.sha256,
      windowStartedMs: began,
      windowDeadlineMs: Math.min(began + 45000, request.deadlineMs),
      executionAuthorized: false,
      signalsSent: false,
      cloudSubmissions: 0,
    };
    await writeFile(
      join(invocation.cwd, 'xcsh-ready.private.json'),
      JSON.stringify({ ...base, kind: 'original-xcsh-creation-ready' }),
      { mode: 0o400, flag: 'wx' },
    );
    await Bun.sleep(50);
    const result = {
      ...base,
      kind: 'original-xcsh-creation-result',
      finishedMs: linuxMonotonicMs(),
      complete: true,
      targetCount: 1,
      witnessCount: 1,
      incompletePids: [],
      receipts: [
        {
          schema_version: 1,
          scope_sha256: request.scope.planSha256,
          scope_file_sha256: request.scope.sha256,
          target: request.scope.targets[0],
          nonce: 'a'.repeat(32),
          creation_identity_sha256: 'b'.repeat(64),
          process: {
            pid: 3334,
            parent_pid: request.executor.pid,
            start_ticks: '102',
            boot_id_sha256: sha(Buffer.from(`${request.executor.boot}\n`)),
            executable_sha256: request.executables.xcsh.sha256,
            executable_device: 1,
            executable_inode: 2,
          },
        },
      ],
    };
    mutate(result);
    await writeFile(join(invocation.cwd, 'xcsh-result.private.json'), JSON.stringify(result), {
      mode: 0o400,
      flag: 'wx',
    });
    await policy.finalCapture({
      identity: reader,
      pid: reader.pid,
      submitted: true,
      actualExitCode: 0,
      originalGroupClosed: true,
      signalsSent: false,
      originalDeadlineMs: policy.originalDeadlineMs,
      invocationStartedMs: began,
      finalStartedMs: linuxMonotonicMs(),
      finalDeadlineMs: linuxMonotonicMs() + 300000,
      finishedMs: linuxMonotonicMs(),
      stdoutPath: join(invocation.cwd, 'out'),
      stderrPath: join(invocation.cwd, 'err'),
    });
    return { code: 0, stdout: '' };
  };

test('source-issued scope produces an opaque reader result and preserves private raw evidence', async () => {
  await scoped(async (context, admission, packet) => {
    const module = await bridge();
    const reader = await module.openInstalledXcshCreationReader(context, admission, packet, {
      executorFactory: fakeExecutor(),
    });
    const ready = await reader.ready;
    expect(ready.executor).toEqual(admission.identity);
    const result = await reader.completed;
    expect(result.complete).toBe(true);
    const raw = await module.readOriginalInstalledXcshCreation(result);
    expect(JSON.parse(raw.toString()).receipts).toHaveLength(1);
    await expect(module.readOriginalInstalledXcshCreation({ ...result })).rejects.toThrow('original');
    await reader.closeAfterExecutorExit();
    await expect(module.readOriginalInstalledXcshCreation(result)).rejects.toThrow('retired');
  });
});

test('same-shaped capture context cannot inherit the prepared scope authority', async () => {
  await scoped(async (context, admission, packet) => {
    const module = await bridge();
    await expect(
      module.openInstalledXcshCreationReader({ ...context }, admission, packet, { executorFactory: fakeExecutor() }),
    ).rejects.toThrow();
  });
});

for (const mutation of ['wrong-parent', 'wrong-scope', 'unsafe-pid', 'duplicate-target', 'authority-flag'] as const) {
  test(`xcsh reader result rejects ${mutation}`, async () => {
    await scoped(async (context, admission, packet) => {
      const module = await bridge();
      const reader = await module.openInstalledXcshCreationReader(context, admission, packet, {
        executorFactory: fakeExecutor((value) => {
          if (mutation === 'wrong-parent') (value.executor as { pid: number }).pid++;
          if (mutation === 'wrong-scope') value.scopeSha256 = 'd'.repeat(64);
          if (mutation === 'unsafe-pid')
            (value.receipts as { process: { pid: number } }[])[0].process.pid = Number.MAX_SAFE_INTEGER + 1;
          if (mutation === 'duplicate-target') (value.receipts as unknown[]).push((value.receipts as unknown[])[0]);
          if (mutation === 'authority-flag') value.executionAuthorized = true;
        }),
      });
      await reader.ready;
      await expect(reader.completed).rejects.toThrow();
      await expect(reader.closeAfterExecutorExit()).rejects.toThrow();
    });
  });
}

test('xcsh bridge allows only one reader opening for an original prepared scope', async () => {
  await scoped(async (context, admission, packet) => {
    const module = await bridge();
    let executions = 0;
    const factory = (policy: SignalFreeExecutionPolicy) => {
      executions++;
      return fakeExecutor()(policy);
    };
    const opened = await Promise.allSettled([
      module.openInstalledXcshCreationReader(context, admission, packet, { executorFactory: factory }),
      module.openInstalledXcshCreationReader(context, admission, packet, { executorFactory: factory }),
    ]);
    for (const result of opened) {
      if (result.status === 'fulfilled') {
        await result.value.ready;
        await result.value.completed;
        await result.value.closeAfterExecutorExit();
      }
    }
    expect(opened.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    expect(executions).toBe(1);
    await expect(
      module.openInstalledXcshCreationReader(context, admission, packet, { executorFactory: factory }),
    ).rejects.toThrow('opened');
  });
});

for (const phase of ['factory', 'invocation'] as const) {
  test(`xcsh bridge retains startup failure and refuses replay after synchronous ${phase} failure`, async () => {
    await scoped(async (context, admission, packet) => {
      const module = await bridge();
      let executions = 0;
      const failure = new Error(`fixture ${phase} startup failure`);
      const reader = await module.openInstalledXcshCreationReader(context, admission, packet, {
        executorFactory: () => {
          executions++;
          if (phase === 'factory') throw failure;
          return () => {
            throw failure;
          };
        },
      });
      await expect(reader.ready).rejects.toThrow('startup failure');
      await expect(reader.completed).rejects.toThrow('startup failure');
      await expect(reader.assertOriginal()).rejects.toThrow('retired');
      const directories = await (await import('node:fs/promises')).readdir(context.executionDirectory);
      expect(directories.filter((name) => name.startsWith('xcsh-creation-readers-'))).toHaveLength(1);
      const failureDirectory = directories.find((name) => name.startsWith('xcsh-creation-readers-'));
      if (!failureDirectory) throw new Error('Original failure directory missing');
      const retained = await readOwnedInstalledInput(
        join(context.executionDirectory, failureDirectory, 'bridge-failure.private.json'),
      );
      const evidence = JSON.parse(retained.bytes.toString());
      expect(evidence.kind).toBe('original-xcsh-bridge-failure');
      expect(evidence.requestSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(evidence.executor).toEqual(admission.identity);
      expect(evidence.complete).toBe(false);
      expect(evidence.executionAuthorized).toBe(false);
      expect(evidence.signalsSent).toBe(false);
      expect(evidence.error.message).toBe(failure.message);
      expect(Number(retained.binding.expectedIdentity?.mode) % 512).toBe(0o400);
      await expect(
        module.openInstalledXcshCreationReader(context, admission, packet, {
          executorFactory: () => {
            executions++;
            throw failure;
          },
        }),
      ).rejects.toThrow('opened');
      expect(executions).toBe(1);
    });
  });
}

import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { originalGcpBootstrapSource } from '../../platform/src/ce/gcp-bootstrap-evidence';
import { createGcpLifecycleHttpPort } from '../../platform/src/ce/gcp-http';
import { openGcpLifecycleHttpCapture } from '../../platform/src/ce/gcp-http-capture';

test('original creation body joins require original reader and HTTP issuers before apply finishes', async () => {
  await scoped(async (context, admission, packet) => {
    const module = await import('../src/xcsh-creation-body');
    const uid = 'synthetic-original-creation-uid';
    const reader = await (await bridge()).openInstalledXcshCreationReader(context, admission, packet, {
      executorFactory: fakeExecutor((result) => {
        (result.receipts as { creation_identity_sha256: string }[])[0].creation_identity_sha256 = sha(Buffer.from(uid));
      }),
    });
    await reader.ready;
    const result = await reader.completed;
    const storeRoot = await mkdtemp(join(tmpdir(), 'creation-body-store-'));
    try {
      const store = await CeDeploymentStore.open(storeRoot, context.owner);
      const capture = await openGcpLifecycleHttpCapture(store, context.assertInputs, {
        siteNames: [],
        tokenNames: ['example-token'],
      });
      const port = createGcpLifecycleHttpPort(
        context.environment.XCSH_API_URL,
        context.environment.XCSH_API_TOKEN,
        async () =>
          Response.json({
            metadata: { name: 'example-token', namespace: 'system' },
            system_metadata: { uid },
            spec: { content: 'synthetic-private-bootstrap' },
          }),
        capture,
      );
      const response = await port.read('/api/register/namespaces/system/tokens/example-token');
      if (!response) throw new Error('Original fixture response missing');
      const body = await capture.read(capture.evidenceFor(response));
      const input = {
        context,
        packet,
        result,
        platform: originalGcpBootstrapSource,
        body,
        target: { type_name: 'xcsh_token' as const, namespace: 'system' as const, name: 'example-token' },
      };
      const evidence = await module.joinOriginalXcshCreationBody(input);
      expect(evidence.originalCreationCorroborated).toBe(true);
      expect(evidence.bootstrapOwnershipQualified).toBe(false);
      expect(evidence.creationIdentitySha256).toBe(sha(Buffer.from(uid)));
      expect(JSON.stringify(evidence)).not.toContain('synthetic-private-bootstrap');
      expect(await module.readOriginalXcshCreationBody(evidence)).toBe(body);
      await expect(module.readOriginalXcshCreationBody({ ...evidence })).rejects.toThrow('Original');
      for (const change of [
        { ...input, result: { ...result } },
        { ...input, context: { ...context } },
        { ...input, body: { ...body } },
        { ...input, target: { ...input.target, name: 'foreign-token' } },
      ])
        await expect(module.joinOriginalXcshCreationBody(change)).rejects.toThrow();
      for (const [origin, credential] of [
        ['https://foreign.example.com', context.environment.XCSH_API_TOKEN],
        [context.environment.XCSH_API_URL, 'rotated-platform-credential'],
      ]) {
        const other = createGcpLifecycleHttpPort(
          origin,
          credential,
          async () =>
            Response.json({ metadata: { name: 'example-token', namespace: 'system' }, system_metadata: { uid } }),
          capture,
        );
        const value = await other.read('/api/register/namespaces/system/tokens/example-token');
        if (!value) throw new Error('Original fixture response missing');
        const foreignBody = await capture.read(capture.evidenceFor(value));
        await expect(module.joinOriginalXcshCreationBody({ ...input, body: foreignBody })).rejects.toThrow(
          'authenticated',
        );
      }
      const wallClock = Date.now;
      try {
        Date.now = () => Date.parse(body.evidence.startedAt) + 300000;
        await expect(module.joinOriginalXcshCreationBody(input)).rejects.toThrow('freshness');
      } finally {
        Date.now = wallClock;
      }
      body.bytes[0] ^= 1;
      await expect(module.readOriginalXcshCreationBody(evidence)).rejects.toThrow();
      body.bytes[0] ^= 1;
      await expect(module.readOriginalXcshCreationBody(evidence)).rejects.toThrow('retired');
    } finally {
      await reader.closeAfterExecutorExit();
      await rm(storeRoot, { recursive: true });
    }
  });
});

test('a fresh authenticated body cannot replace the original creation UID', async () => {
  await scoped(async (context, admission, packet) => {
    const module = await import('../src/xcsh-creation-body');
    const reader = await (await bridge()).openInstalledXcshCreationReader(context, admission, packet, {
      executorFactory: fakeExecutor(),
    });
    await reader.ready;
    const result = await reader.completed;
    const storeRoot = await mkdtemp(join(tmpdir(), 'creation-body-replacement-'));
    try {
      const store = await CeDeploymentStore.open(storeRoot, context.owner);
      const capture = await openGcpLifecycleHttpCapture(store, context.assertInputs, {
        siteNames: [],
        tokenNames: ['example-token'],
      });
      const port = createGcpLifecycleHttpPort(
        context.environment.XCSH_API_URL,
        context.environment.XCSH_API_TOKEN,
        async () =>
          Response.json({
            metadata: { name: 'example-token', namespace: 'system' },
            system_metadata: { uid: 'foreign-original-uid' },
          }),
        capture,
      );
      const response = await port.read('/api/register/namespaces/system/tokens/example-token');
      if (!response) throw new Error('Original fixture response missing');
      const body = await capture.read(capture.evidenceFor(response));
      await expect(
        module.joinOriginalXcshCreationBody({
          context,
          packet,
          result,
          platform: originalGcpBootstrapSource,
          body,
          target: { type_name: 'xcsh_token', namespace: 'system', name: 'example-token' },
        }),
      ).rejects.toThrow('identity');
    } finally {
      await reader.closeAfterExecutorExit();
      await rm(storeRoot, { recursive: true });
    }
  });
});

for (const finalWriteFailure of [false, true]) {
  test(`preapply bootstrap original checkout and source retirement (final write failure: ${finalWriteFailure})`, async () => {
    await scoped(async (context, admission, packet) => {
      const module = await import('../src/gcp-preapply-bootstrap');
      const bodyModule = await import('../src/xcsh-creation-body');
      const uids = { site: 'synthetic-original-site-uid', token: 'synthetic-original-token-uid' };
      const reader = await (await bridge()).openInstalledXcshCreationReader(context, admission, packet, {
        executorFactory: fakeExecutor((value) => {
          const receipt = (value.receipts as Record<string, unknown>[])[0];
          value.targetCount = 2;
          value.receipts = [
            {
              ...receipt,
              target: { type_name: 'xcsh_securemesh_site_v2', name: 'example-site', namespace: 'system' },
              nonce: 'a'.repeat(32),
              creation_identity_sha256: sha(Buffer.from(uids.site)),
            },
            {
              ...receipt,
              target: { type_name: 'xcsh_token', name: 'example-token', namespace: 'system' },
              nonce: 'b'.repeat(32),
              creation_identity_sha256: sha(Buffer.from(uids.token)),
            },
          ];
        }),
      });
      await reader.ready;
      const result = await reader.completed;
      const storeRoot = await mkdtemp(join(tmpdir(), 'preapply-bootstrap-'));
      try {
        const store = await CeDeploymentStore.open(storeRoot, context.owner);
        const capture = await openGcpLifecycleHttpCapture(store, context.assertInputs, {
          siteNames: ['example-site'],
          tokenNames: ['example-token'],
        });
        const labels = { 'xcsh-deployment': context.owner.deploymentId, 'xcsh-engine': 'terraform' };
        const jwt = [
          Buffer.from('{}').toString('base64url'),
          Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
          Buffer.from('synthetic-signature').toString('base64url'),
        ].join('.');
        const siteValue = {
          metadata: {
            name: 'example-site',
            namespace: 'system',
            labels: { ...labels, 'ves.io/provider': 'ves-io-GOOGLE' },
          },
          system_metadata: { uid: uids.site },
          spec: { gcp: { not_managed: { node_list: [] } } },
        };
        const tokenValue = {
          metadata: { name: 'example-token', namespace: 'system', labels: { ...labels, 'xcsh-node': 'example-node' } },
          system_metadata: { uid: uids.token },
          spec: { site_name: 'example-site', type: 1, content: jwt },
        };
        const port = createGcpLifecycleHttpPort(
          context.environment.XCSH_API_URL,
          context.environment.XCSH_API_TOKEN,
          async (url) => Response.json(String(url).includes('/tokens/') ? tokenValue : siteValue),
          capture,
        );
        const siteResponse = await port.read('/api/config/namespaces/system/securemesh_site_v2s/example-site');
        const tokenResponse = await port.read('/api/register/namespaces/system/tokens/example-token');
        if (!siteResponse || !tokenResponse) throw new Error('Original fixture response missing');
        const site = await bodyModule.joinOriginalXcshCreationBody({
          context,
          packet,
          result,
          platform: originalGcpBootstrapSource,
          body: await capture.read(capture.evidenceFor(siteResponse)),
          target: { type_name: 'xcsh_securemesh_site_v2', name: 'example-site', namespace: 'system' },
        });
        const token = await bodyModule.joinOriginalXcshCreationBody({
          context,
          packet,
          result,
          platform: originalGcpBootstrapSource,
          body: await capture.read(capture.evidenceFor(tokenResponse)),
          target: { type_name: 'xcsh_token', name: 'example-token', namespace: 'system' },
        });
        const input = {
          site,
          token,
          platform: originalGcpBootstrapSource,
          binding: {
            owner: context.owner,
            deploymentName: context.owner.deploymentId,
            siteName: 'example-site',
            nodeName: 'example-node',
            tokenName: 'example-token',
          },
        };
        const value = await module.collectOriginalGcpPreapplyBootstrap(input);
        await module.assertOriginalGcpPreapplyBootstrapContext(value, context);
        await expect(module.assertOriginalGcpPreapplyBootstrapContext(value, { ...context })).rejects.toThrow(
          'Original',
        );
        await expect(module.assertOriginalGcpPreapplyBootstrapContext({ ...value }, context)).rejects.toThrow(
          'Original',
        );
        expect(value.schemaVersion).toBe(3);
        expect(value.xcshProviderVersion).toBe('15.16.2');
        expect(value.bootstrapOwnershipQualified).toBe(false);
        expect(JSON.stringify(value)).not.toContain(jwt);
        expect(await module.readOriginalGcpPreapplyBootstrapJwt(value)).toBe(jwt);
        await expect(module.readOriginalGcpPreapplyBootstrapJwt({ ...value })).rejects.toThrow('Original');
        for (const foreign of [
          { ...input, site: { ...site } },
          { ...input, token: { ...token } },
          { ...input, binding: { ...input.binding, nodeName: 'foreign-node' } },
          { ...input, binding: { ...input.binding, owner: { ...context.owner, engine: 'native' as const } } },
        ])
          await expect(module.collectOriginalGcpPreapplyBootstrap(foreign)).rejects.toThrow();
        const vmModule = await import('../src/gcp-bootstrap-vm-binding');
        const { auditJoinFixture } = await import('./fixtures/gcp-insert.fixture');
        const { formatGcpUserData } = await import('../../gcloud/src/ce/bootstrap');
        const request = {
          name: 'example-node',
          canIpForward: true,
          deletionProtection: false,
          machineType: 'projects/example-project/zones/us-central1-a/machineTypes/e2-standard-8',
          labels: {
            'xcsh-deployment': context.owner.deploymentId,
            'xcsh-engine': 'terraform',
            'xcsh-site': 'example-site',
            'xcsh-node': 'example-node',
          },
          metadata: {
            items: [
              { key: 'VmDnsSetting', value: 'ZonePreferred' },
              { key: 'user-data', value: formatGcpUserData({ ...value.bootstrap, jwt }) },
            ],
          },
          networkInterfaces: [
            {
              network: 'projects/example-project/global/networks/example-outside',
              subnetwork: 'projects/example-project/regions/us-central1/subnetworks/example-outside',
            },
            {
              network: 'projects/example-project/global/networks/example-inside',
              subnetwork: 'projects/example-project/regions/us-central1/subnetworks/example-inside',
            },
          ],
          disks: [{ boot: true, autoDelete: true, initializeParams: { sourceImage: 'example-reviewed-image' } }],
        };
        const version = {
          terraformVersion: '1.17.2',
          providerLockSha256: '05b1685de902eec100da53ec973895b04f5faa5b81b3f5257de09caeace531bc',
        };
        const cloud = await auditJoinFixture(undefined, version, '8.11.0', request, value.planSha256);
        const bound = await vmModule.joinOriginalGcpBootstrapVm({ context, bootstrap: value, cloud });
        expect(bound.bootstrapCorroborated).toBe(true);
        expect(bound.originalInsertQualified).toBe(false);
        expect(bound.interfaces).toHaveLength(2);
        for (const material of [
          request.metadata.items[1].value.replace(jwt, 'foreignheader.foreignpayload.foreignsignature'),
          `${request.metadata.items[1].value}runcmd:\n  - echo forbidden\n`,
        ]) {
          const changed = {
            ...request,
            metadata: { items: [request.metadata.items[0], { key: 'user-data', value: material }] },
          };
          const foreign = await auditJoinFixture(undefined, version, '8.11.0', changed, value.planSha256);
          await expect(
            vmModule.joinOriginalGcpBootstrapVm({ context, bootstrap: value, cloud: foreign }),
          ).rejects.toThrow();
        }
        const wrongPlan = await auditJoinFixture(undefined, version, '8.11.0', request, 'a'.repeat(64));
        await expect(
          vmModule.joinOriginalGcpBootstrapVm({ context, bootstrap: value, cloud: wrongPlan }),
        ).rejects.toThrow('scope');

        expect(JSON.stringify(bound)).not.toContain(jwt);
        await expect(
          vmModule.joinOriginalGcpBootstrapVm({ context: { ...context }, bootstrap: value, cloud }),
        ).rejects.toThrow('Original');
        await expect(vmModule.joinOriginalGcpBootstrapVm({ context, bootstrap: { ...value }, cloud })).rejects.toThrow(
          'Original',
        );
        const checkout = await import('../src/gcp-preapply-checkout');
        if (finalWriteFailure) {
          const originalWrite = store.write.bind(store);
          store.write = async (name, record) => {
            if (name.startsWith('gcp-preapply-bootstrap-') && (record as { state: string }).state === 'consumed')
              throw new Error('fixture final checkpoint failed');
            return originalWrite(name, record);
          };
          try {
            await expect(checkout.checkoutOriginalGcpPreapplyBootstrap(value, store)).rejects.toThrow(
              'checkpoint failed',
            );
          } finally {
            store.write = originalWrite;
          }
          expect(((await store.read('gcp-bootstrap-example-node.json')) as { state: string; jwt: string }).jwt).toBe(
            '',
          );
          expect(((await store.read('gcp-preapply-bootstrap-example-node.json')) as { state: string }).state).toBe(
            'claiming',
          );
          await expect(checkout.checkoutOriginalGcpPreapplyBootstrap(value, store)).rejects.toThrow('claimed');
        } else {
          const outcomes = await Promise.allSettled([
            checkout.checkoutOriginalGcpPreapplyBootstrap(value, store),
            checkout.checkoutOriginalGcpPreapplyBootstrap(value, store),
          ]);
          const successful = outcomes.filter((result) => result.status === 'fulfilled');
          expect(successful).toHaveLength(1);
          if (successful[0].status !== 'fulfilled') throw new Error('Original checkout did not complete');
          expect(successful[0].value).toContain(jwt);
          expect(((await store.read('gcp-bootstrap-example-node.json')) as { state: string; jwt: string }).jwt).toBe(
            '',
          );
          const resumed = await CeDeploymentStore.open(storeRoot, context.owner);
          await expect(checkout.checkoutOriginalGcpPreapplyBootstrap(value, resumed)).rejects.toThrow('claimed');
          await expect(checkout.checkoutOriginalGcpPreapplyBootstrap({ ...value }, store)).rejects.toThrow('Original');
        }
        const changes = [
          { site: { ...siteValue, spec: { gcp: { managed: {} } } }, token: tokenValue },
          {
            site: {
              ...siteValue,
              metadata: { ...siteValue.metadata, labels: { ...siteValue.metadata.labels, foreign: 'owner' } },
            },
            token: tokenValue,
          },
          { site: siteValue, token: { ...tokenValue, spec: { ...tokenValue.spec, site_name: 'foreign-site' } } },
          { site: siteValue, token: { ...tokenValue, spec: { ...tokenValue.spec, type: 2 } } },
        ];
        for (const change of changes) {
          const changedPort = createGcpLifecycleHttpPort(
            context.environment.XCSH_API_URL,
            context.environment.XCSH_API_TOKEN,
            async (url) => Response.json(String(url).includes('/tokens/') ? change.token : change.site),
            capture,
          );
          const currentSite = await changedPort.read('/api/config/namespaces/system/securemesh_site_v2s/example-site');
          const currentToken = await changedPort.read('/api/register/namespaces/system/tokens/example-token');
          if (!currentSite || !currentToken) throw new Error('Original fixture response missing');
          const changedSite = await bodyModule.joinOriginalXcshCreationBody({
            context,
            packet,
            result,
            platform: originalGcpBootstrapSource,
            body: await capture.read(capture.evidenceFor(currentSite)),
            target: { type_name: 'xcsh_securemesh_site_v2', name: 'example-site', namespace: 'system' },
          });
          const changedToken = await bodyModule.joinOriginalXcshCreationBody({
            context,
            packet,
            result,
            platform: originalGcpBootstrapSource,
            body: await capture.read(capture.evidenceFor(currentToken)),
            target: { type_name: 'xcsh_token', name: 'example-token', namespace: 'system' },
          });
          await expect(
            module.collectOriginalGcpPreapplyBootstrap({ ...input, site: changedSite, token: changedToken }),
          ).rejects.toThrow();
        }
        await reader.closeAfterExecutorExit();
        await expect(module.readOriginalGcpPreapplyBootstrapJwt(value)).rejects.toThrow();
      } finally {
        // A second successful close is idempotent for this source reader.
        await reader.closeAfterExecutorExit();
        await rm(storeRoot, { recursive: true });
      }
    }, true);
  });
}
