import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInstalledCaptureContext } from '../src/installed-capture-context';
import { createInstalledGcpInvocationCompiler } from '../src/installed-gcp-invocation';
import { linuxMonotonicMs } from '../src/linux-clock';
import { monitorOriginalInputs, type OriginalInputBinding } from '../src/original-input-monitor';
import {
  assertPreparedCreationScope,
  assertPreparedCreationScopeInputs,
  closePreparedCreationScope,
  inspectPreparedCreationScope,
  prepareOriginalCreationScope,
} from '../src/prepared-creation-scope';
import { type Deployment, type Invocation, readOriginalTerraformPlanSource, TerraformRunner } from '../src/runner';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const hash = (raw: string | Uint8Array) => createHash('sha256').update(raw).digest('hex');
async function binding(path: string): Promise<OriginalInputBinding> {
  const st = await lstat(path, { bigint: true }),
    parent = await lstat(dirname(path), { bigint: true });
  const keys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'] as const;
  return {
    path,
    sha256: hash(await readFile(path)),
    expectedIdentity: Object.fromEntries(keys.map((k) => [k, st[k].toString()])) as NonNullable<
      OriginalInputBinding['expectedIdentity']
    >,
    expectedParentIdentity: {
      dev: parent.dev.toString(),
      ino: parent.ino.toString(),
      uid: parent.uid.toString(),
      mode: parent.mode.toString(),
    },
  };
}
async function fixture(
  during: (request: Invocation, context: ReturnType<typeof createInstalledCaptureContext>) => Promise<void>,
  options: { unknownName?: boolean; noCreate?: boolean; expired?: () => boolean } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'prepared-xcsh-scope-'));
  roots.push(root);
  const deployment: Deployment = {
    schemaVersion: 1,
    deploymentId: 'ce-scope-test',
    engine: 'terraform',
    scope: { cloud: 'gcp', account: 'example-project', region: 'us-central1' },
    terraformVersion: '1.17.2',
    configuration: '{"terraform":{"required_version":"= 1.17.2"}}',
    providerLock: '# original lock',
    backendIdentity: 'local:ce-scope-test',
  };
  const rows = [
    {
      address: 'xcsh_securemesh_site_v2.site',
      type: 'xcsh_securemesh_site_v2',
      mode: 'managed',
      change: {
        actions: options.noCreate ? ['no-op'] : ['create'],
        after: { name: 'example-site', namespace: 'system' },
        after_unknown: options.unknownName ? { name: true } : {},
      },
    },
    {
      address: 'xcsh_token.token',
      type: 'xcsh_token',
      mode: 'managed',
      change: {
        actions: options.noCreate ? ['no-op'] : ['create'],
        after: { name: 'example-token', namespace: 'system', site_name: 'example-site' },
        after_unknown: {},
      },
    },
  ];
  let context: ReturnType<typeof createInstalledCaptureContext> | undefined;
  const runner = new TerraformRunner(
    root,
    async (request) => {
      if (request.args[0] === 'plan')
        await writeFile(join(request.cwd, 'saved.tfplan'), 'original-scope-plan', { mode: 0o600 });
      if (request.args[0] === 'apply') {
        const exe = join(
          request.cwd,
          '.terraform/providers/registry.terraform.io/f5-sales-demo/xcsh/15.16.1/linux_amd64/terraform-provider-xcsh_v15.16.1',
        );
        await mkdir(dirname(exe), { recursive: true, mode: 0o700 });
        await writeFile(exe, 'synthetic-unit-test-provider', { mode: 0o700 });
        const adc = join(request.cwd, 'adc.private.json'),
          platform = join(request.cwd, 'platform.private.json');
        await writeFile(adc, 'original-adc', { mode: 0o400 });
        await writeFile(platform, 'original-platform', { mode: 0o400 });
        const inputs = {
          adc: await binding(adc),
          platform: await binding(platform),
          'workspace:main.tf.json': await binding(join(request.cwd, 'main.tf.json')),
          'workspace:.terraform.lock.hcl': await binding(join(request.cwd, '.terraform.lock.hcl')),
        };
        const start = linuxMonotonicMs();
        const inputMonitor = await monitorOriginalInputs(inputs);
        context = createInstalledCaptureContext({
          owner: {
            provider: 'gcp',
            engine: 'terraform',
            deploymentId: deployment.deploymentId,
            account: deployment.scope.account,
            region: deployment.scope.region,
          },
          executionDirectory: request.cwd,
          budget: { start, deadline: start + 7200000 },
          environment: {
            GOOGLE_APPLICATION_CREDENTIALS: adc,
            XCSH_API_URL: 'https://tenant.example.com',
            XCSH_API_TOKEN: 'example-token',
          },
          authentication: {
            accountSha256: 'a'.repeat(64),
            audienceSha256: 'b'.repeat(64),
            snapshotSha256: inputs.adc.sha256,
          },
          inputs,
          assertInputs: inputMonitor.assertOriginal,
          assertWithinDeadline: async () => {
            if (options.expired?.()) throw new Error('original deadline exhausted');
          },
          readProviderInputs: async () => ({
            'registry.terraform.io/f5-sales-demo/xcsh:terraform-provider-xcsh_v15.16.1': await binding(exe),
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
        try {
          await during(request, context);
        } finally {
          inputMonitor.close();
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
                  resource_changes: rows,
                  output_changes: {},
                })
              : '',
      };
    },
    undefined,
    'gcp-resource-plan-v1',
  );
  await runner.prepare(deployment);
  const receipt = await runner.plan({});
  await runner.apply(receipt, {});
  if (!context) throw new Error('Original test capture context unavailable');
  return context;
}
function compiler(request: Invocation, context: ReturnType<typeof createInstalledCaptureContext>, packet: unknown) {
  const environment = { PATH: '/usr/bin:/bin', HOME: tmpdir(), ...context.environment };
  const compile = createInstalledGcpInvocationCompiler({
    directory: request.cwd,
    environment,
    readPreparedCreationScope: () => packet,
  } as Parameters<typeof createInstalledGcpInvocationCompiler>[0]);
  const invocation = { ...request, env: { ...request.env, ...environment } };
  return () => compile(invocation);
}

test('owning plan prepares and compiles exact original scope once, without serializable authority', async () => {
  let packet: Awaited<ReturnType<typeof prepareOriginalCreationScope>> | undefined;
  await fixture(async (request, context) => {
    packet = await prepareOriginalCreationScope(context);
    expect(await prepareOriginalCreationScope(context)).toBe(packet);
    const snapshot = await inspectPreparedCreationScope(packet);
    expect(snapshot.resources).toEqual([
      { type_name: 'xcsh_securemesh_site_v2', name: 'example-site', namespace: 'system' },
      { type_name: 'xcsh_token', name: 'example-token', namespace: 'system' },
    ]);
    expect(snapshot.scopeFile).toBeDefined();
    if (!snapshot.scopeFile || !snapshot.directory) throw new Error('Original scope paths unavailable');
    const raw = JSON.parse(await readFile(snapshot.scopeFile, 'utf8'));
    expect(raw.scope_sha256).toBe(request.originalPlanSource?.planSha256);
    expect(raw.provider_executable_sha256).toBe(hash('synthetic-unit-test-provider'));
    expect((await lstat(snapshot.scopeFile)).mode & 0o777).toBe(0o400);
    expect((await lstat(snapshot.directory)).mode & 0o777).toBe(0o700);
    expect(() => compiler(request, context, JSON.parse(JSON.stringify(packet)))()).toThrow();
    await assertPreparedCreationScope(packet);
    const compile = compiler(request, context, packet);
    expect(compile().env.XCSH_ORIGINAL_CREATION_SCOPE_FILE).toBe(snapshot.scopeFile);
    expect(() => compile()).toThrow();
    await assertPreparedCreationScope(packet);
  });
  await expect(assertPreparedCreationScope(packet)).rejects.toThrow();
  closePreparedCreationScope(packet);
});

test('unknown original target refuses durably instead of guessing names', async () => {
  await fixture(
    async (_request, context) => {
      await expect(prepareOriginalCreationScope(context)).rejects.toThrow();
      await expect(prepareOriginalCreationScope(context)).rejects.toThrow();
    },
    { unknownName: true },
  );
});
test('operations without new Site or Token get an original no-creation capability', async () => {
  await fixture(
    async (request, context) => {
      const packet = await prepareOriginalCreationScope(context);
      expect((await inspectPreparedCreationScope(packet)).scopeFile).toBeUndefined();
      expect(compiler(request, context, packet)().env.XCSH_ORIGINAL_CREATION_SCOPE_FILE).toBeUndefined();
      closePreparedCreationScope(packet);
    },
    { noCreate: true },
  );
});
test('scope-file and sink replacement remain refused after restoration', async () => {
  for (const change of ['file', 'sink', 'mode'] as const) {
    await fixture(async (request, context) => {
      const packet = await prepareOriginalCreationScope(context);
      const snapshot = await inspectPreparedCreationScope(packet),
        path = snapshot.scopeFile,
        directory = snapshot.directory;
      if (!path || !directory) throw new Error('Original scope paths unavailable');
      if (change === 'file') {
        await rename(path, `${path}.old`);
        await writeFile(path, await readFile(`${path}.old`), { mode: 0o400 });
      } else if (change === 'sink') {
        await rename(directory, `${directory}.old`);
        await mkdir(directory, { mode: 0o700 });
        await writeFile(path, await readFile(join(`${directory}.old`, 'scope.json')), { mode: 0o400 });
      } else await chmod(path, 0o600);
      await expect(assertPreparedCreationScope(packet)).rejects.toThrow();
      if (change === 'mode') await chmod(path, 0o400);
      await expect(assertPreparedCreationScope(packet)).rejects.toThrow();
      expect(() => compiler(request, context, packet)()).toThrow();
      closePreparedCreationScope(packet);
    });
  }
});

test('parallel preparations share one issuer and cannot compile with a copied original source', async () => {
  await fixture(async (request, context) => {
    const [left, right] = await Promise.all([
      prepareOriginalCreationScope(context),
      prepareOriginalCreationScope(context),
    ]);
    expect(left).toBe(right);
    await assertPreparedCreationScope(left);
    const fake = { ...request, originalPlanSource: JSON.parse(JSON.stringify(request.originalPlanSource)) };
    expect(() => compiler(fake, context, left)()).toThrow();
    expect(compiler(request, context, left)().env.XCSH_ORIGINAL_CREATION_SCOPE_FILE).toBeDefined();
    closePreparedCreationScope(left);
  });
});
test('credential and admitted provider replacement refuse before compilation', async () => {
  for (const kind of ['credential', 'provider'] as const) {
    await fixture(async (request, context) => {
      const packet = await prepareOriginalCreationScope(context);
      const snapshot = await inspectPreparedCreationScope(packet);
      const path = kind === 'credential' ? context.environment.GOOGLE_APPLICATION_CREDENTIALS : snapshot.provider?.path;
      if (!path) throw new Error('Original fixture input path unavailable');
      await rename(path, `${path}.original`);
      await writeFile(path, await readFile(`${path}.original`), { mode: kind === 'credential' ? 0o400 : 0o700 });
      await expect(assertPreparedCreationScope(packet)).rejects.toThrow();
      expect(() => compiler(request, context, packet)()).toThrow();
      closePreparedCreationScope(packet);
    });
  }
});
test('expired execution cannot renew its budget while final input corroboration stays available', async () => {
  let expired = false;
  await fixture(
    async (request, context) => {
      const packet = await prepareOriginalCreationScope(context);
      expired = true;
      await expect(assertPreparedCreationScope(packet)).rejects.toThrow('original deadline exhausted');
      await assertPreparedCreationScopeInputs(packet);
      expect(() => compiler(request, context, packet)()).toThrow();
      closePreparedCreationScope(packet);
    },
    { expired: () => expired },
  );
});
test('request and ambient settings cannot replace the issued scope', async () => {
  await fixture(async (request, context) => {
    const packet = await prepareOriginalCreationScope(context);
    const injected = {
      ...request,
      env: { ...request.env, XCSH_ORIGINAL_CREATION_SCOPE_FILE: '/private/foreign-scope.json' },
    };
    expect(() => compiler(injected, context, packet)()).toThrow();
    await assertPreparedCreationScope(packet);
    expect(compiler(request, context, packet)().env.XCSH_ORIGINAL_CREATION_SCOPE_FILE).toBeDefined();
    closePreparedCreationScope(packet);
  });
});

test('a consumed preparation cannot be reissued from the context cache', async () => {
  await fixture(async (request, context) => {
    const packet = await prepareOriginalCreationScope(context);
    compiler(request, context, packet)();
    await expect(prepareOriginalCreationScope(context)).rejects.toThrow();
    closePreparedCreationScope(packet);
  });
});
