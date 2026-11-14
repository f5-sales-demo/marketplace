import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import type { CePlatformService } from '../../platform/src/ce/service';
import { createInstalledCaptureContext } from '../src/installed-capture-context';
import { createInstalledGcpInvocationCompiler } from '../src/installed-gcp-invocation';
import { type Deployment, type Invocation, readOriginalTerraformPlanSource, TerraformRunner } from '../src/runner';
import { createCeTerraformService } from '../src/service';

const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true });
});
async function fixture(
  duringApply: (
    request: Invocation,
    expected: ReturnType<typeof expectation>,
    runner: TerraformRunner,
  ) => Promise<void>,
  cloud: Deployment['scope']['cloud'] = 'gcp',
  changeOverrides: Record<string, unknown> = {},
  enableSource = true,
) {
  const root = await mkdtemp(join(tmpdir(), 'owning-plan-source-'));
  directories.push(root);
  const deployment: Deployment = {
    schemaVersion: 1,
    deploymentId: 'ce-test',
    engine: 'terraform',
    scope: { cloud, account: 'example-project', region: 'us-central1' },
    terraformVersion: '1.17.2',
    configuration: '{"terraform":{"required_version":"= 1.17.2"}}',
    providerLock: '# original lock',
    backendIdentity: 'local:ce-test',
  };
  const calls: Invocation[] = [];
  const runner = new TerraformRunner(
    root,
    async (request) => {
      calls.push(request);
      if (request.args[0] === 'plan')
        await writeFile(join(request.cwd, 'saved.tfplan'), 'original-binary-plan', { mode: 0o600 });
      if (request.args[0] === 'apply') await duringApply(request, expectation(request.cwd, deployment), runner);
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
                  applyable: true, // codespell:ignore applyable
                  resource_changes: [
                    {
                      address: 'google_compute_instance.ce',
                      mode: 'managed',
                      type: 'google_compute_instance',
                      change: {
                        actions: ['create'],
                        after: {
                          name: 'ce-original',
                          project: 'example-project',
                          zone: 'us-central1-a',
                          id: null,
                          metadata: { 'user-data': 'PRIVATE_BOOTSTRAP' },
                          secret: 'PRIVATE_OTHER',
                        },
                        after_unknown: { id: true },
                        after_sensitive: { metadata: true },
                        ...changeOverrides,
                      },
                    },
                  ],
                  output_changes: {},
                })
              : '',
      };
    },
    undefined,
    enableSource ? 'gcp-resource-plan-v1' : undefined,
  );
  await runner.prepare(deployment);
  const receipt = await runner.plan({});
  return { root, runner, deployment, receipt, calls, expected: expectation(join(root, 'ce-test'), deployment) };
}
function expectation(directory: string, deployment: Deployment) {
  return {
    directory,
    engine: deployment.engine,
    deploymentId: deployment.deploymentId,
    scope: deployment.scope,
    terraformVersion: deployment.terraformVersion,
    backendIdentity: deployment.backendIdentity,
  };
}

test('same owning runner publishes a frozen nonsensitive projection while ordinary inspections refuse overlap', async () => {
  let retained: Invocation['originalPlanSource'];
  const f = await fixture(async (request, expected, runner) => {
    retained = request.originalPlanSource;
    expect(retained).toBeDefined();
    const projection = await readOriginalTerraformPlanSource(retained, expected);
    expect(projection.executionAuthorized).toBe(false);
    expect(projection.receipt.planSha256).toBe(f.receipt.planSha256);
    expect(projection.resources).toHaveLength(1);
    expect(projection.resources[0]).toMatchObject({
      address: 'google_compute_instance.ce',
      actions: ['create'],
      fields: {
        name: { status: 'known', value: 'ce-original' },
        id: { status: 'unknown' },
        region: { status: 'unavailable' },
      },
    });
    expect(JSON.stringify(projection)).not.toContain('PRIVATE_');
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.receipt.changes)).toBe(true);
    expect(Object.isFrozen(projection.resources[0].fields)).toBe(true);
    await expect(runner.readApplyCheckpoint(f.receipt)).rejects.toThrow('already running');
    expect((await readOriginalTerraformPlanSource(retained, expected)).receipt).toEqual(projection.receipt);
  });
  await f.runner.apply(f.receipt, {});
  await expect(readOriginalTerraformPlanSource(retained, f.expected)).rejects.toThrow();
  expect(f.calls.filter((c) => c.args[0] === 'apply')).toHaveLength(1);
  expect(f.calls.filter((c) => c.args[0] !== 'apply').every((c) => c.originalPlanSource === undefined)).toBe(true);
});

test('copies, JSON, proxies and sources from another ownership scope cannot substitute for the issuer', async () => {
  const f = await fixture(async (request, expected) => {
    const source = request.originalPlanSource;
    if (!source) throw new Error('Original source missing');
    for (const foreign of [{ ...source }, JSON.parse(JSON.stringify(source)), new Proxy(source, {})])
      await expect(readOriginalTerraformPlanSource(foreign, expected)).rejects.toThrow();
    for (const changed of [
      { ...expected, engine: 'native' },
      { ...expected, directory: `${expected.directory}-other` },
      { ...expected, deploymentId: 'foreign' },
      { ...expected, scope: { ...expected.scope, account: 'example-foreign-project' } },
      { ...expected, scope: { ...expected.scope, cloud: 'aws' } },
      { ...expected, terraformVersion: '1.17.1' },
      { ...expected, backendIdentity: 'local:foreign' },
    ])
      await expect(readOriginalTerraformPlanSource(source, changed as never)).rejects.toThrow();
    expect((await readOriginalTerraformPlanSource(source, expected)).executionAuthorized).toBe(false);
  });
  await f.runner.apply(f.receipt, {});
});

test('a refused original input remains refused after byte restoration and no source is usable after executor failure', async () => {
  let retained: Invocation['originalPlanSource'];
  const f = await fixture(async (request, expected) => {
    retained = request.originalPlanSource;
    const path = join(request.cwd, 'saved.tfplan'),
      raw = await readFile(path);
    await writeFile(path, 'changed-plan');
    await expect(readOriginalTerraformPlanSource(retained, expected)).rejects.toThrow();
    await writeFile(path, raw);
    await expect(readOriginalTerraformPlanSource(retained, expected)).rejects.toThrow();
    throw new Error('retained original executor failure');
  });
  await expect(f.runner.apply(f.receipt, {})).rejects.toThrow('retained original executor failure');
  await expect(readOriginalTerraformPlanSource(retained, f.expected)).rejects.toThrow();
  await expect(f.runner.apply(f.receipt, {})).rejects.toThrow('consumed');
  expect(f.calls.filter((c) => c.args[0] === 'apply')).toHaveLength(1);
});

test('legacy non-GCP execution receives no source and preserves original invocation behavior', async () => {
  const f = await fixture(async (request) => expect(request.originalPlanSource).toBeUndefined(), 'aws');
  await f.runner.apply(f.receipt, {});
});

test('sensitive identity projection refuses before the original saved plan is consumed', async () => {
  let submitted = false;
  const f = await fixture(
    async () => {
      submitted = true;
    },
    'gcp',
    { after_sensitive: { name: true } },
  );
  await expect(f.runner.apply(f.receipt, {})).rejects.toThrow('sensitive');
  expect(submitted).toBe(false);
  expect(JSON.parse(await readFile(join(f.root, 'ce-test', 'plan-receipt.json'), 'utf8')).state).toBe('planned');
});

test('compiler preserves the same source object while refusing source attachment to non-apply commands', async () => {
  const f = await fixture(async (request, expected) => {
    const compile = createInstalledGcpInvocationCompiler({
      directory: request.cwd,
      environment: {
        HOME: tmpdir(),
        PATH: '/usr/bin:/bin',
        GOOGLE_APPLICATION_CREDENTIALS: join(request.cwd, 'adc.private.json'),
        XCSH_API_URL: 'https://tenant.example.test',
        XCSH_API_TOKEN: 'synthetic',
      },
    });
    const env = {
      ...request.env,
      GOOGLE_APPLICATION_CREDENTIALS: join(request.cwd, 'adc.private.json'),
      XCSH_API_URL: 'https://tenant.example.test',
      XCSH_API_TOKEN: 'synthetic',
    };
    const compiled = compile({ ...request, env });
    expect(compiled.originalPlanSource).toBe(request.originalPlanSource);
    expect((await readOriginalTerraformPlanSource(compiled.originalPlanSource, expected)).executionAuthorized).toBe(
      false,
    );
    expect(() => compile({ ...request, args: ['version', '-json'], env })).toThrow();
  });
  await f.runner.apply(f.receipt, {});
});

test('caller receipt mutation during apply cannot rewrite the original source or persisted receipt', async () => {
  const f = await fixture(async (request, expected) => {
    f.receipt.changes[0].address = 'foreign.resource';
    const source = await readOriginalTerraformPlanSource(request.originalPlanSource, expected);
    expect(source.receipt.changes[0].address).toBe('google_compute_instance.ce');
  });
  await f.runner.apply(f.receipt, {});
  const stored = JSON.parse(await readFile(join(f.root, 'ce-test', 'plan-receipt.json'), 'utf8'));
  expect(stored.receipt.changes[0].address).toBe('google_compute_instance.ce');
});

test('older GCP runners retain their original opt-out behavior', async () => {
  const f = await fixture(async (request) => expect(request.originalPlanSource).toBeUndefined(), 'gcp', {}, false);
  await f.runner.apply(f.receipt, {});
});
test('malformed nested sensitivity cannot become a known identity', async () => {
  const f = await fixture(
    async () => {
      throw new Error('unexpected submission');
    },
    'gcp',
    { after_sensitive: { name: { nested: true } } },
  );
  await expect(f.runner.apply(f.receipt, {})).rejects.toThrow('sensitive');
  expect(f.calls.some((request) => request.args[0] === 'apply')).toBe(false);
});
test('the Platform-owned service passes its selected producer to the same guarded runner', async () => {
  const f = await fixture(async () => {});
  const root = await mkdtemp(join(tmpdir(), 'owning-source-service-'));
  directories.push(root);
  const owner = {
    deploymentId: 'ce-service',
    engine: 'terraform' as const,
    provider: 'gcp' as const,
    account: 'example-project',
    region: 'us-central1',
  };
  const deployment = { ...f.deployment, deploymentId: owner.deploymentId, backendIdentity: 'local:ce-service' };
  let observed = false;
  const originalExecute = f.runner.execute;
  const execute = async (request: Invocation) => {
    if (request.args[0] === 'apply') {
      const value = await readOriginalTerraformPlanSource(
        request.originalPlanSource,
        expectation(request.cwd, deployment),
      );
      observed = value.executionAuthorized === false && value.receipt.deploymentId === owner.deploymentId;
    }
    return originalExecute(request);
  };
  const platform = { storage: (o: typeof owner) => CeDeploymentStore.open(root, o) } as CePlatformService;
  const service = createCeTerraformService(async () => platform, {
    execute,
    planSource: 'gcp-resource-plan-v1',
  } as never);
  const session = await service.open(owner, deployment, false);
  const receipt = await session.plan({});
  await session.apply(receipt, {});
  expect(observed).toBe(true);
});
test('unqualified source policies refuse before storage or runtime execution', async () => {
  let touched = false;
  const platform = async () => {
    touched = true;
    throw new Error('unexpected platform call');
  };
  expect(() => createCeTerraformService(platform, { planSource: 'gcp-resource-plan-v1' } as never)).toThrow();
  expect(() =>
    createCeTerraformService(platform, {
      execute: async () => ({ code: 0, stdout: '' }),
      planSource: 'unqualified',
    } as never),
  ).toThrow();
  expect(touched).toBe(false);
});
test('installed capture context consumes the actual source and wraps reads with the original lifetime guards', async () => {
  const f = await fixture(async (request, expected) => {
    const sha = 'a'.repeat(64),
      adc = join(request.cwd, 'adc.private.json'),
      platform = join(request.cwd, 'platform.private.json');
    const identity = {
      dev: '1',
      ino: '2',
      uid: '1000',
      nlink: '1',
      mode: '33152',
      size: '3',
      mtimeNs: '4',
      ctimeNs: '5',
    };
    const parent = { dev: '1', ino: '6', uid: '1000', mode: '16832' };
    const binding = (path: string) => ({
      path,
      sha256: sha,
      expectedIdentity: identity,
      expectedParentIdentity: parent,
    });
    let checks = 0,
      expired = false;
    const context = createInstalledCaptureContext({
      owner: {
        deploymentId: expected.deploymentId,
        engine: 'terraform',
        provider: 'gcp',
        account: expected.scope.account,
        region: expected.scope.region,
      },
      authentication: { accountSha256: sha, audienceSha256: sha, snapshotSha256: sha },
      executionDirectory: request.cwd,
      budget: { start: 0, deadline: 7200000 },
      environment: {
        GOOGLE_APPLICATION_CREDENTIALS: adc,
        XCSH_API_URL: 'https://tenant.example.test',
        XCSH_API_TOKEN: 'synthetic',
      },
      inputs: { adc: binding(adc), platform: binding(platform) },
      assertInputs: async () => {
        checks++;
      },
      assertWithinDeadline: async () => {
        if (expired) throw new Error('original deadline exhausted');
      },
      readProviderInputs: async () => ({ provider: binding(join(request.cwd, 'provider')) }),
      readOriginalPlanSource: () => readOriginalTerraformPlanSource(request.originalPlanSource, expected),
    });
    expect(typeof context.readOriginalPlanSource).toBe('function');
    if (!context.readOriginalPlanSource) throw new Error('Owning source callback missing');
    expect((await context.readOriginalPlanSource()).executionAuthorized).toBe(false);
    expect(checks).toBeGreaterThanOrEqual(2);
    const originalRead = context.readOriginalPlanSource;
    let counterfeit = true;
    const copiedContext = createInstalledCaptureContext({
      ...context,
      readOriginalPlanSource: async () => {
        const value = await originalRead();
        return counterfeit ? JSON.parse(JSON.stringify(value)) : value;
      },
    });
    if (!copiedContext.readOriginalPlanSource) throw new Error('Copied source test missing callback');
    await expect(copiedContext.readOriginalPlanSource()).rejects.toThrow();
    counterfeit = false;
    await expect(copiedContext.readOriginalPlanSource()).rejects.toThrow();
    expired = true;
    await expect(context.readOriginalPlanSource()).rejects.toThrow('original deadline exhausted');
  });
  await f.runner.apply(f.receipt, {});
});

test('malformed unknown markers cannot silently produce known identities', async () => {
  for (const unknown of ['false', { name: 'false' }, null]) {
    const f = await fixture(
      async () => {
        throw new Error('unexpected submission');
      },
      'gcp',
      { after_unknown: unknown },
    );
    await expect(f.runner.apply(f.receipt, {})).rejects.toThrow('unknown marker');
    expect(f.calls.some((request) => request.args[0] === 'apply')).toBe(false);
  }
});

test('replacement with identical bytes cannot preserve original file identity', async () => {
  const f = await fixture(async (request, expected) => {
    const original = join(request.cwd, 'main.tf.json'),
      replacement = join(request.cwd, 'replacement.private');
    await writeFile(replacement, await readFile(original), { mode: 0o600 });
    await rename(replacement, original);
    await expect(readOriginalTerraformPlanSource(request.originalPlanSource, expected)).rejects.toThrow();
    throw new Error('changed original identity retained');
  });
  await expect(f.runner.apply(f.receipt, {})).rejects.toThrow('changed original identity retained');
});
