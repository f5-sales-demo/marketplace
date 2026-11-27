import { afterEach, expect, test } from 'bun:test';
import { chmod, link, mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retirePrivateArtifacts } from '../src/artifact-retirement';
import { type CleanupRequest, encode, hash, type IndependentCleanupEvidence } from '../src/cleanup-verifier-worker';
import { type Deployment, type Invocation, TerraformRunner } from '../src/runner';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const deployment: Deployment = {
  schemaVersion: 1,
  deploymentId: 'retirement-test',
  engine: 'terraform',
  scope: { cloud: 'aws', account: 'example-account', region: 'us-east-1' },
  terraformVersion: '1.14.0',
  configuration: '{"terraform":{"required_version":"= 1.14.0"}}',
  providerLock: '# fixture lock',
  backendIdentity: 'local:retirement-test',
};
async function fixture(
  planOverrides: Record<string, unknown> = {},
  stateOverrides: Record<string, unknown> = {},
  verifierOverrides: Record<string, unknown> = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'tf-retirement-'));
  roots.push(root);
  const calls: Invocation[] = [];
  const verifications: CleanupRequest[] = [];
  let verifierFailure = false;
  const runner = new TerraformRunner(
    root,
    async (request) => {
      calls.push(request);
      if (request.args[0] === 'plan')
        await writeFile(join(request.cwd, 'saved.tfplan'), 'private-plan', { mode: 0o600 });
      return {
        code: 0,
        executable: { path: '/example/terraform', sha256: 'c'.repeat(64) },
        stdout: JSON.stringify(
          request.args[0] === 'version'
            ? { terraform_version: deployment.terraformVersion }
            : request.args[0] === 'show' && request.args.length === 2
              ? {
                  format_version: '1.0',
                  terraform_version: deployment.terraformVersion,
                  values: { root_module: { resources: [] } },
                  ...stateOverrides,
                }
              : {
                  format_version: '1.2',
                  terraform_version: deployment.terraformVersion,
                  errored: false,
                  complete: true,
                  applyable: false, // codespell:ignore applyable
                  resource_changes: [],
                  output_changes: {},
                  planned_values: { root_module: {} },
                  ...planOverrides,
                },
        ),
      };
    },
    async (request) => {
      verifications.push(request);
      if (verifierFailure) throw Error('Independent verifier unavailable');
      return {
        schemaVersion: 1,
        status: 'independently-verified',
        nonce: request.nonce,
        requestSha256: hash(encode(request)),
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        executorPid: process.pid + 1,
        parentPid: process.pid,
        manifestSha256: request.manifestSha256,
        evidenceSha256: request.evidenceSha256,
        finalPlanSha256: request.finalPlanSha256,
        planReceiptSha256: request.planReceiptSha256,
        inputInventorySha256: hash(encode(request.inputs)),
        terraformExecutableSha256: request.terraform.sha256,
        terraformExecutablePathSha256: hash(request.terraform.path),
        interpreterSha256: request.interpreter.sha256,
        workerSha256: request.workerSha256,
        terraformVersion: deployment.terraformVersion,
        stateJsonSha256: 'd'.repeat(64),
        originalPlanJsonSha256: 'e'.repeat(64),
        refreshedPlanSha256: 'f'.repeat(64),
        refreshedPlanJsonSha256: 'a'.repeat(64),
        commands: [
          ['version', '-json'],
          ['show', '-json', 'saved.tfplan'],
          ['show', '-json'],
          [
            'plan',
            '-input=false',
            '-lock=true',
            '-lock-timeout=60s',
            '-refresh=true',
            `-out=independent-cleanup-${request.nonce}.tfplan`,
          ],
          ['show', '-json', `independent-cleanup-${request.nonce}.tfplan`],
        ],
        ...verifierOverrides,
      } satisfies IndependentCleanupEvidence;
    },
  );
  await runner.prepare(deployment);
  return {
    root,
    runner,
    calls,
    verifications,
    failVerifier: () => {
      verifierFailure = true;
    },
    directory: join(root, deployment.deploymentId),
  };
}
test('terminal retirement removes private archives and permanently rejects execution', async () => {
  const { runner, root, directory, calls } = await fixture();
  await mkdir(join(directory, 'revisions', 'fixture'), { recursive: true, mode: 0o700 });
  await writeFile(join(directory, 'revisions', 'fixture', 'main.tf.json'), 'PRIVATE_ARCHIVE', { mode: 0o600 });
  const receipt = await runner.plan({});
  const result = await runner.retireArtifacts(receipt, 'a'.repeat(64), {});
  expect(result.status).toBe('runner-artifacts-retired');
  expect(result.finalPlanSha256).toBe(receipt.planSha256);
  expect((await readdir(directory)).sort()).toEqual(['artifact-retirement.json', 'deployment.json']);
  expect(JSON.stringify(result)).not.toContain('PRIVATE_ARCHIVE');
  expect(calls.some((call) => call.args[0] === 'apply')).toBe(false);
  const count = calls.length;
  await expect(runner.plan({})).rejects.toThrow('retired');
  await expect(runner.apply(receipt, {})).rejects.toThrow('retired');
  await expect(runner.readConfiguration(receipt.configurationSha256)).rejects.toThrow('retired');
  expect(await runner.retireArtifacts(receipt, 'a'.repeat(64), {})).toEqual(result);
  expect(calls).toHaveLength(count);
  const resumed = new TerraformRunner(root, async () => {
    throw Error('No executor permitted');
  });
  await resumed.resume(deployment.deploymentId, deployment, 'current');
  expect(await resumed.retireArtifacts(receipt, 'a'.repeat(64), {})).toEqual(result);
  await expect(resumed.plan({})).rejects.toThrow('retired');
  await expect(resumed.retireArtifacts(receipt, 'b'.repeat(64), {})).rejects.toThrow();
});
for (const [label, plan, state] of [
  [
    'mutating plan',
    {
      resource_changes: [{ address: 'terraform_data.ce', type: 'terraform_data', change: { actions: ['create'] } }],
      applyable: true, // codespell:ignore applyable
    },
    {},
  ], // codespell:ignore applyable
  ['planned resource', { planned_values: { root_module: { resources: [{}] } } }, {}],
  ['state resource', {}, { values: { root_module: { resources: [{}] } } }],
  ['state output', {}, { values: { root_module: {}, outputs: { private: {} } } }],
  ['malformed state', {}, { format_version: null }],
  ['partial state', {}, { values: { root_module: { resources: 'missing' } } }],
] as const)
  test(`terminal retirement rejects ${label} without deletion or marker`, async () => {
    const { runner, directory } = await fixture(plan, state);
    const receipt = await runner.plan({});
    await expect(runner.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow();
    expect(await readFile(join(directory, 'main.tf.json'), 'utf8')).toContain('required_version');
    expect(await readdir(directory)).not.toContain('artifact-retirement.json');
  });
test('terminal retirement requires exact plan and external evidence bindings', async () => {
  const { runner, directory } = await fixture();
  const receipt = await runner.plan({});
  await expect(runner.retireArtifacts(receipt, 'unresolved', {})).rejects.toThrow();
  await expect(
    runner.retireArtifacts({ ...receipt, backendIdentity: 'local:foreign' }, 'a'.repeat(64), {}),
  ).rejects.toThrow();
  await writeFile(join(directory, 'saved.tfplan'), 'substituted', { mode: 0o600 });
  await expect(runner.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow();
  expect(await readdir(directory)).not.toContain('artifact-retirement.json');
});
test('archive links are removed without following them outside the deployment', async () => {
  const { runner, root, directory } = await fixture();
  await writeFile(join(root, 'external-private'), 'EXTERNAL_PRIVATE', { mode: 0o600 });
  await symlink(join(root, 'external-private'), join(directory, 'archive-link'));
  const receipt = await runner.plan({});
  await runner.retireArtifacts(receipt, 'a'.repeat(64), {});
  expect(await readFile(join(root, 'external-private'), 'utf8')).toBe('EXTERNAL_PRIVATE');
});
test('interrupted digest-bound retirement resumes but rejects substituted or newly added artifacts', async () => {
  const { runner, root, directory } = await fixture();
  await writeFile(join(directory, 'private.txt'), 'PRIVATE_FIXTURE', { mode: 0o600 });
  const receipt = await runner.plan({});
  await runner.retireArtifacts(receipt, 'a'.repeat(64), {});
  const marker = JSON.parse(await readFile(join(directory, 'artifact-retirement.json'), 'utf8'));
  marker.status = 'retiring';
  await writeFile(join(directory, 'artifact-retirement.json'), JSON.stringify(marker), { mode: 0o600 });
  await writeFile(join(directory, 'private.txt'), 'SUBSTITUTED', { mode: 0o600 });
  const resumed = new TerraformRunner(root, async () => {
    throw Error('No executor permitted');
  });
  await resumed.resume(deployment.deploymentId, deployment, 'current');
  await expect(resumed.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow();
  await writeFile(join(directory, 'private.txt'), 'PRIVATE_FIXTURE', { mode: 0o600 });
  await writeFile(join(directory, 'unexpected.txt'), 'UNBOUND', { mode: 0o600 });
  await expect(resumed.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow();
  await rm(join(directory, 'unexpected.txt'));
  expect((await resumed.retireArtifacts(receipt, 'a'.repeat(64), {})).status).toBe('runner-artifacts-retired');
  expect((await readdir(directory)).sort()).toEqual(['artifact-retirement.json', 'deployment.json']);
});
test('terminal retirement rejects a substituted deployment directory before removal', async () => {
  const { runner, directory, root } = await fixture();
  const receipt = await runner.plan({});
  const external = join(root, 'external-deployment');
  await rename(directory, external);
  await symlink(external, directory);
  await expect(runner.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow('ownership');
  expect(await readdir(external)).not.toContain('artifact-retirement.json');
  expect(await readFile(join(external, 'main.tf.json'), 'utf8')).toBe(deployment.configuration);
});
test('terminal retirement rejects hard-linked artifacts and pre-aborted requests without marking retirement', async () => {
  const { runner, directory, root } = await fixture();
  const receipt = await runner.plan({});
  const controller = new AbortController();
  controller.abort();
  await expect(runner.retireArtifacts(receipt, 'a'.repeat(64), {}, controller.signal)).rejects.toThrow();
  await link(join(directory, 'main.tf.json'), join(root, 'shared-configuration'));
  await expect(runner.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow('ownership');
  expect(await readdir(directory)).not.toContain('artifact-retirement.json');
});

test('separate verifier failure retains all original inputs and no retirement marker', async () => {
  const { runner, directory, failVerifier, verifications } = await fixture();
  const receipt = await runner.plan({});
  failVerifier();
  await expect(runner.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow('Independent');
  expect(verifications).toHaveLength(1);
  expect(await readFile(join(directory, 'saved.tfplan'), 'utf8')).toBe('private-plan');
  expect(await readdir(directory)).not.toContain('artifact-retirement.json');
});
test('completed retirement retains independent sanitized execution before deleting original inputs', async () => {
  const { runner, directory, verifications } = await fixture();
  const receipt = await runner.plan({});
  await runner.retireArtifacts(receipt, 'a'.repeat(64), {});
  expect(verifications).toHaveLength(1);
  const marker = JSON.parse(await readFile(join(directory, 'artifact-retirement.json'), 'utf8'));
  expect(marker.independentCleanup.status).toBe('independently-verified');
  expect(marker.independentCleanupSha256).toBe(hash(encode(marker.independentCleanup)));
  expect(JSON.stringify(marker.independentCleanup)).not.toContain('/example/terraform');
});

for (const [name, override] of [
  ['foreign nonce', { nonce: 'f'.repeat(64) }],
  ['stale receipt', { completedAt: '2020-01-01T00:00:00Z' }],
  ['foreign plan', { finalPlanSha256: 'f'.repeat(64) }],
  ['same process', { executorPid: process.pid }],
  ['extra payload', { sensitivePayload: 'PRIVATE_SYNTHETIC_INPUT' }],
  ['missing hash', { stateJsonSha256: undefined }],
  ['missing refresh', { commands: [] }],
] as const)
  test(`independent ${name} rejects before deletion`, async () => {
    const { runner, directory } = await fixture({}, {}, override);
    const receipt = await runner.plan({});
    await expect(runner.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow('Independent');
    expect(await readdir(directory)).not.toContain('artifact-retirement.json');
    expect(await readFile(join(directory, 'saved.tfplan'), 'utf8')).toBe('private-plan');
  });

for (const mode of [
  'refresh-disabled',
  'refresh-missing',
  'target',
  'missing-arguments',
  'extra-execution-key',
  'extra-journal-key',
] as const)
  test(`original final retirement journal rejects ${mode} before executor or independent cleanup`, async () => {
    const f = await fixture(),
      receipt = await f.runner.plan({});
    const path = join(f.directory, 'plan-receipt.json');
    const journal = JSON.parse((await readFile(path)).toString());
    if (mode === 'refresh-disabled')
      journal.execution.planArgs = journal.execution.planArgs.map((arg: string) =>
        arg === '-refresh=true' ? '-refresh=false' : arg,
      );
    if (mode === 'refresh-missing')
      journal.execution.planArgs = journal.execution.planArgs.filter((arg: string) => arg !== '-refresh=true');
    if (mode === 'target') journal.execution.planArgs.push('-target=terraform_data.foreign');
    if (mode === 'missing-arguments') delete journal.execution.planArgs;
    if (mode === 'extra-execution-key') journal.execution.foreign = true;
    if (mode === 'extra-journal-key') journal.foreign = true;
    await writeFile(path, JSON.stringify(journal), { mode: 0o600 });
    const calls = [...f.calls],
      bytes = await readFile(path);
    await expect(f.runner.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow();
    expect(f.calls).toEqual(calls);
    expect(f.verifications).toHaveLength(0);
    expect(await readFile(path)).toEqual(bytes);
    expect(await readdir(f.directory)).not.toContain('artifact-retirement.json');
  });

test('retirement provenance reports absent without Terraform or independent execution', async () => {
  const { runner, directory, calls, verifications } = await fixture();
  const receipt = await runner.plan({});
  const before = (await readdir(directory)).sort();
  const count = calls.length;
  expect(await runner.readArtifactRetirement(receipt, 'a'.repeat(64))).toEqual({ status: 'absent' });
  expect(calls).toHaveLength(count);
  expect(verifications).toHaveLength(0);
  expect((await readdir(directory)).sort()).toEqual(before);
});

test('retirement provenance recovers a lost response after permanent retirement without CLI', async () => {
  const { runner, root, calls, verifications } = await fixture();
  const receipt = await runner.plan({});
  const retired = await runner.retireArtifacts(receipt, 'a'.repeat(64), {});
  const count = calls.length;
  const observed = await runner.readArtifactRetirement(receipt, 'a'.repeat(64));
  expect(observed.status).toBe('runner-artifacts-retired');
  if (observed.status !== 'runner-artifacts-retired') throw Error('Retired provenance missing');
  expect(observed.receipt).toEqual(retired);
  expect(observed.markerSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(calls).toHaveLength(count);
  expect(verifications).toHaveLength(1);
  const resumed = new TerraformRunner(
    root,
    async () => {
      throw Error('No CLI permitted');
    },
    async () => {
      throw Error('No verifier permitted');
    },
  );
  await resumed.resume(deployment.deploymentId, deployment, 'current');
  expect(await resumed.readArtifactRetirement(receipt, 'a'.repeat(64))).toEqual(observed);
  await expect(resumed.plan({})).rejects.toThrow('retired');
});

test('retirement provenance preserves partial removal as retiring without repair', async () => {
  const { runner, directory, calls, verifications } = await fixture();
  await writeFile(join(directory, 'private.txt'), 'PRIVATE_FIXTURE', { mode: 0o600 });
  const receipt = await runner.plan({});
  await runner.retireArtifacts(receipt, 'a'.repeat(64), {});
  const path = join(directory, 'artifact-retirement.json');
  const marker = JSON.parse(await readFile(path, 'utf8'));
  marker.status = 'retiring';
  await writeFile(path, JSON.stringify(marker), { mode: 0o600 });
  await writeFile(join(directory, 'private.txt'), 'PRIVATE_FIXTURE', { mode: 0o600 });
  const before = await readFile(path);
  const count = calls.length;
  const observed = await runner.readArtifactRetirement(receipt, 'a'.repeat(64));
  expect(observed.status).toBe('retiring');
  if (observed.status !== 'retiring') throw Error('Partial provenance missing');
  expect(observed.remainingArtifacts).toBe(1);
  expect('receipt' in observed).toBe(false);
  expect(await readFile(path)).toEqual(before);
  expect(await readFile(join(directory, 'private.txt'), 'utf8')).toBe('PRIVATE_FIXTURE');
  expect(calls).toHaveLength(count);
  expect(verifications).toHaveLength(1);
  await expect(runner.plan({})).rejects.toThrow('retired');
});

interface RetirementTestMarker {
  status: unknown;
  artifacts: Array<{ path: string; [key: string]: unknown }>;
  independentCleanup: Record<string, unknown>;
  [key: string]: unknown;
}
for (const [label, mutate] of [
  [
    'extra marker key',
    (m: RetirementTestMarker) => {
      m.extra = true;
    },
  ],
  [
    'array status',
    (m: RetirementTestMarker) => {
      m.status = ['runner-artifacts-retired'];
    },
  ],
  [
    'foreign manifest',
    (m: RetirementTestMarker) => {
      m.manifestSha256 = 'b'.repeat(64);
    },
  ],
  [
    'foreign evidence',
    (m: RetirementTestMarker) => {
      m.evidenceSha256 = 'b'.repeat(64);
    },
  ],
  [
    'foreign receipt',
    (m: RetirementTestMarker) => {
      m.planReceiptSha256 = 'b'.repeat(64);
    },
  ],
  [
    'extra artifact key',
    (m: RetirementTestMarker) => {
      m.artifacts[0].extra = true;
      m.inventorySha256 = hash(JSON.stringify(m.artifacts));
    },
  ],
  [
    'duplicate artifact',
    (m: RetirementTestMarker) => {
      m.artifacts.push(m.artifacts[0]);
      m.inventorySha256 = hash(JSON.stringify(m.artifacts));
    },
  ],
  [
    'unsafe artifact',
    (m: RetirementTestMarker) => {
      m.artifacts[0].path = '../foreign';
      m.inventorySha256 = hash(JSON.stringify(m.artifacts));
    },
  ],
  [
    'missing parent',
    (m: RetirementTestMarker) => {
      m.artifacts[0].path = 'missing/child';
      m.inventorySha256 = hash(JSON.stringify(m.artifacts));
    },
  ],
  [
    'unverified cleanup',
    (m: RetirementTestMarker) => {
      m.independentCleanup.status = 'pending';
      m.independentCleanupSha256 = hash(encode(m.independentCleanup));
    },
  ],
  [
    'extra cleanup key',
    (m: RetirementTestMarker) => {
      m.independentCleanup.extra = true;
      m.independentCleanupSha256 = hash(encode(m.independentCleanup));
    },
  ],
  [
    'cleanup digest',
    (m: RetirementTestMarker) => {
      m.independentCleanupSha256 = 'b'.repeat(64);
    },
  ],
] as const)
  test(`retirement provenance and retry reject ${label} without CLI or deletion`, async () => {
    const { runner, directory, calls } = await fixture();
    const receipt = await runner.plan({});
    await runner.retireArtifacts(receipt, 'a'.repeat(64), {});
    const path = join(directory, 'artifact-retirement.json');
    const marker = JSON.parse(await readFile(path, 'utf8'));
    mutate(marker);
    await writeFile(path, JSON.stringify(marker), { mode: 0o600 });
    const before = await readFile(path);
    const count = calls.length;
    await expect(runner.readArtifactRetirement(receipt, 'a'.repeat(64))).rejects.toThrow();
    await expect(runner.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow();
    expect(await readFile(path)).toEqual(before);
    expect(calls).toHaveLength(count);
  });

test('retirement provenance rejects new artifacts and foreign requests without changing the barrier', async () => {
  const { runner, directory } = await fixture();
  const receipt = await runner.plan({});
  await runner.retireArtifacts(receipt, 'a'.repeat(64), {});
  await expect(runner.readArtifactRetirement(receipt, 'b'.repeat(64))).rejects.toThrow();
  await expect(
    runner.readArtifactRetirement({ ...receipt, backendIdentity: 'local:foreign' }, 'a'.repeat(64)),
  ).rejects.toThrow();
  await writeFile(join(directory, 'unexpected.txt'), 'UNBOUND', { mode: 0o600 });
  await expect(runner.readArtifactRetirement(receipt, 'a'.repeat(64))).rejects.toThrow();
  expect(await readFile(join(directory, 'unexpected.txt'), 'utf8')).toBe('UNBOUND');
});

test('retirement provenance honors abort and rejects persisted owner drift', async () => {
  const { runner, directory } = await fixture();
  const receipt = await runner.plan({});
  const controller = new AbortController();
  controller.abort();
  await expect(runner.readArtifactRetirement(receipt, 'a'.repeat(64), controller.signal)).rejects.toThrow();
  const path = join(directory, 'deployment.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  manifest.backendIdentity = 'local:foreign';
  await writeFile(path, JSON.stringify(manifest), { mode: 0o600 });
  await expect(runner.readArtifactRetirement(receipt, 'a'.repeat(64))).rejects.toThrow();
});

for (const unsafe of ['permissions', 'symlink', 'hardlink', 'directory', 'malformed-json'])
  test(`retirement provenance rejects unsafe marker ${unsafe} without executor or repair`, async () => {
    const { runner, directory, root, calls } = await fixture();
    const receipt = await runner.plan({});
    await runner.retireArtifacts(receipt, 'a'.repeat(64), {});
    const marker = join(directory, 'artifact-retirement.json');
    const backup = join(root, 'marker-backup.json');
    if (unsafe === 'permissions') await chmod(marker, 0o644);
    if (unsafe === 'symlink' || unsafe === 'directory') {
      await rename(marker, backup);
      if (unsafe === 'symlink') await symlink(backup, marker);
      else await mkdir(marker, { mode: 0o700 });
    }
    if (unsafe === 'hardlink') await link(marker, backup);
    if (unsafe === 'malformed-json') await writeFile(marker, '{', { mode: 0o600 });
    const count = calls.length;
    await expect(runner.readArtifactRetirement(receipt, 'a'.repeat(64))).rejects.toThrow();
    await expect(runner.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow();
    expect(calls).toHaveLength(count);
    await expect(runner.plan({})).rejects.toThrow('retired');
  });

test('retirement rejects invalid retained cleanup before installing the permanent barrier', async () => {
  const { runner, directory } = await fixture();
  const receipt = await runner.plan({});
  await expect(
    retirePrivateArtifacts(
      directory,
      'a'.repeat(64),
      'b'.repeat(64),
      receipt.planSha256,
      'c'.repeat(64),
      undefined,
      {} as IndependentCleanupEvidence,
    ),
  ).rejects.toThrow();
  expect(await readdir(directory)).not.toContain('artifact-retirement.json');
  expect(await readFile(join(directory, 'saved.tfplan'), 'utf8')).toBe('private-plan');
});
