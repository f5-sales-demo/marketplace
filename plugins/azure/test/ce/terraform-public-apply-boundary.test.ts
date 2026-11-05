import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AzExecApi } from '../../src/az/exec';
import type { PluginInterface } from '../../src/az/types';
import { type AzureCeToolContext, type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { compileAzureCePlan } from '../../src/ce/planner';
import { executeAzureCeTerraformApply } from '../../src/ce/terraform-apply';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { createAzureCeApplyTool, executeAzureCeNativeApply } from '../../src/tools/azure-ce-apply';
import { networkUpdateFixture } from './network-update-fixture';

// Exercise the actual public factory and owning executor with persisted plan identities.
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});

async function fixture(engine: 'native' | 'terraform' = 'terraform', platformContext?: string) {
  const f = networkUpdateFixture(false, engine, true, false);
  if (platformContext) f.original = compileAzureCePlan({ ...f.original.intent, platformContext }, f.current);
  const root = await mkdtemp(join(tmpdir(), 'ce-public-apply-boundary-'));
  roots.push(root);
  let sequence = 0;
  const paths = new Map<string, string>();
  const session: SessionManagerLike = {
    getSessionId: () => root,
    getArtifactsDir: () => root,
    getArtifactPath: async (id) => paths.get(id) ?? null,
    saveArtifact: async (content, type) => {
      const id = String(++sequence);
      const path = join(root, `${id.padStart(6, '0')}.${type}.log`);
      await writeFile(path, content);
      paths.set(id, path);
      return id;
    },
  };
  await savePlanArtifact(session, f.original, f.current);
  await savePlanArtifact(session, f.plan, f.current);
  const params = { planId: f.original.planId, planSha256: f.original.planSha256 };
  const ctx: AzureCeToolContext = {
    cwd: root,
    hasUI: false,
    ui: { confirm: async () => false },
    sessionManager: session,
  };
  const calls = { api: 0, storage: 0, platform: 0, terraform: 0 };
  const platform = {
    storage: async () => {
      calls.storage++;
      throw Error('test owning storage boundary reached');
    },
  } as unknown as CePlatformService;
  const terraform = {} as CeTerraformService;
  let atPlatform: () => void = () => {};
  let atTerraform: () => void = () => {};
  const dependencies = {
    platform: async () => {
      calls.platform++;
      atPlatform();
      return platform;
    },
    terraform: async () => {
      calls.terraform++;
      atTerraform();
      return terraform;
    },
  };
  const pi: PluginInterface = { typebox: { Type: new Proxy({}, { get: () => () => ({}) }) } };
  const tool = createAzureCeApplyTool(
    pi,
    () => {
      calls.api++;
      return {
        exec: async () => {
          throw Error('unexpected provider call');
        },
      } as AzExecApi;
    },
    dependencies,
  );
  return {
    ...f,
    session,
    params,
    ctx,
    calls,
    dependencies,
    platform,
    mutate: (stage: 'platform' | 'terraform', callback: () => void) => {
      if (stage === 'platform') atPlatform = callback;
      else atTerraform = callback;
    },
    run: (signal?: AbortSignal) => tool.execute('test', params, signal, undefined, ctx),
  };
}

test('actual public apply unchanged request reaches original owning storage boundary', async () => {
  const f = await fixture();
  const result = await f.run();
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain('test owning storage boundary reached');
  expect(result.details.planId).toBe(f.original.planId);
  expect(f.calls.storage).toBe(1);
});

for (const stage of ['platform', 'terraform'] as const)
  for (const mutation of [
    'request',
    'cwd',
    'session',
    'session-id',
    'directory',
    'writer',
    'path-reader',
    'hasUI',
    'confirmation',
    'service-callback',
  ] as const)
    test(`actual public apply rejects ${mutation} mutation during ${stage} lookup before owning storage`, async () => {
      const f = await fixture();
      f.mutate(stage, () => {
        if (mutation === 'request') Object.assign(f.params, { planId: f.plan.planId, planSha256: f.plan.planSha256 });
        if (mutation === 'cwd') f.ctx.cwd += '-foreign';
        if (mutation === 'session') f.ctx.sessionManager = { ...f.session };
        if (mutation === 'session-id') f.session.getSessionId = () => 'foreign-session';
        if (mutation === 'directory') f.session.getArtifactsDir = () => null;
        if (mutation === 'writer') f.session.saveArtifact = async () => undefined;
        if (mutation === 'path-reader') f.session.getArtifactPath = async () => null;
        if (mutation === 'hasUI') f.ctx.hasUI = true;
        if (mutation === 'confirmation') f.ctx.ui.confirm = async () => true;
        if (mutation === 'service-callback') f.dependencies.terraform = async () => ({}) as CeTerraformService;
      });
      const result = await f.run();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/changed during/);
      expect(result.details.planId).toBe(f.original.planId);
      expect(f.calls.storage).toBe(0);
    });

test('actual public apply rejects acquired platform storage callback changed during Terraform lookup', async () => {
  const f = await fixture();
  f.mutate('terraform', () => {
    f.platform.storage = async () => {
      throw Error('foreign storage callback invoked');
    };
  });
  const result = await f.run();
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toMatch(/changed during/);
  expect(result.details.planId).toBe(f.original.planId);
  expect(f.calls.storage).toBe(0);
});

for (const stage of ['platform', 'terraform'] as const)
  test(`actual public apply rejects environment change during ${stage} lookup before owning storage`, async () => {
    const f = await fixture(),
      before = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    try {
      f.mutate(stage, () => {
        process.env.XCSH_CE_HEADLESS_MUTATIONS = before === '1' ? '0' : '1';
      });
      const result = await f.run();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/changed during/);
      expect(f.calls.storage).toBe(0);
    } finally {
      if (before === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = before;
    }
  });

for (const stage of ['before', 'platform', 'terraform'] as const)
  test(`actual public apply cancellation at ${stage} prevents owning storage despite ignored signal`, async () => {
    const f = await fixture(),
      controller = new AbortController();
    if (stage === 'before') controller.abort(Error('test apply cancelled'));
    else f.mutate(stage, () => controller.abort(Error('test apply cancelled')));
    const result = await f.run(controller.signal);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('test apply cancelled');
    expect(f.calls.storage).toBe(0);
    if (stage === 'before') expect(f.calls.platform).toBe(0);
  });

for (const direct of [false, true])
  for (const mutation of ['request', 'cwd', 'environment'] as const)
    test(`${direct ? 'owning' : 'public'} apply rejects ${mutation} change during storage acquisition before private access`, async () => {
      const f = await fixture(),
        before = process.env.XCSH_CE_HEADLESS_MUTATIONS;
      const store = await CeDeploymentStore.open(join(f.ctx.cwd, 'owning'), azureUpgradeBinding(f.original).owner);
      let verifies = 0;
      const originalVerify = store.verify;
      store.verify = async () => {
        verifies++;
        await originalVerify.call(store);
      };
      f.platform.storage = async () => {
        if (mutation === 'request') Object.assign(f.params, { planId: f.plan.planId, planSha256: f.plan.planSha256 });
        if (mutation === 'cwd') f.ctx.cwd += '-foreign';
        if (mutation === 'environment') process.env.XCSH_CE_HEADLESS_MUTATIONS = before === '1' ? '0' : '1';
        return store;
      };
      try {
        if (direct)
          await expect(
            executeAzureCeTerraformApply(f.params, f.ctx, {} as AzExecApi, f.platform, {} as CeTerraformService),
          ).rejects.toThrow(/changed during/);
        else {
          const result = await f.run();
          expect(result.isError).toBe(true);
          expect(result.content[0].text).toMatch(/changed during/);
        }
        expect(verifies).toBe(0);
      } finally {
        if (before === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
        else process.env.XCSH_CE_HEADLESS_MUTATIONS = before;
      }
    });

for (const mutation of ['request', 'cwd'] as const)
  test(`actual public apply rejects ${mutation} change during owning verify before next private read`, async () => {
    const f = await fixture();
    const store = await CeDeploymentStore.open(join(f.ctx.cwd, 'owning'), azureUpgradeBinding(f.original).owner);
    let reads = 0;
    const originalVerify = store.verify;
    store.verify = async () => {
      await originalVerify.call(store);
      if (mutation === 'request') Object.assign(f.params, { planId: f.plan.planId, planSha256: f.plan.planSha256 });
      else f.ctx.cwd += '-foreign';
    };
    store.read = async () => {
      reads++;
      throw Error('test unsealed private read reached');
    };
    f.platform.storage = async () => store;
    const result = await f.run();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/changed during/);
    expect(reads).toBe(0);
  });

for (const direct of [false, true])
  for (const mutation of ['request', 'cwd', 'environment'] as const)
    test(`${direct ? 'owning' : 'public'} native apply rejects ${mutation} change during storage acquisition before private access`, async () => {
      const before = process.env.XCSH_CE_HEADLESS_MUTATIONS;
      process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
      try {
        const f = await fixture('native');
        const store = await CeDeploymentStore.open(join(f.ctx.cwd, 'owning'), azureUpgradeBinding(f.original).owner);
        let verifies = 0;
        const originalVerify = store.verify;
        store.verify = async () => {
          verifies++;
          await originalVerify.call(store);
        };
        f.platform.storage = async () => {
          if (mutation === 'request') Object.assign(f.params, { planId: f.plan.planId, planSha256: f.plan.planSha256 });
          if (mutation === 'cwd') f.ctx.cwd += '-foreign';
          if (mutation === 'environment') process.env.XCSH_CE_HEADLESS_MUTATIONS = '0';
          return store;
        };
        if (direct)
          await expect(
            executeAzureCeNativeApply(f.params, f.ctx, {} as AzExecApi, async () => f.platform),
          ).rejects.toThrow(/changed during/);
        else {
          const result = await f.run();
          expect(result.isError).toBe(true);
          expect(result.content[0].text).toMatch(/changed during/);
        }
        expect(verifies).toBe(0);
      } finally {
        if (before === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
        else process.env.XCSH_CE_HEADLESS_MUTATIONS = before;
      }
    });

for (const stage of ['platform', 'terraform'] as const)
  for (const mutation of ['unchanged', 'bytes', 'delete'] as const)
    test(`actual public apply rejects named context ${mutation} during ${stage} lookup before owning storage`, async () => {
      const before = process.env.XDG_CONFIG_HOME;
      const config = await mkdtemp(join(tmpdir(), 'ce-apply-context-'));
      roots.push(config);
      process.env.XDG_CONFIG_HOME = config;
      try {
        const f = await fixture('terraform', 'example-lab');
        const path = join(config, 'xcsh', 'contexts', 'example-lab.json');
        await mkdir(join(config, 'xcsh', 'contexts'), { recursive: true });
        await writeFile(
          path,
          JSON.stringify({ apiUrl: 'https://tenant.example.com', apiToken: 'synthetic-context-a' }),
        );
        // Lookup waits for mutation, exercising the actual asynchronous public service boundary.
        const mutateContext = async () => {
          if (mutation === 'delete') await rm(path);
          else if (mutation === 'bytes')
            await writeFile(
              path,
              JSON.stringify({ apiUrl: 'https://foreign.example.com', apiToken: 'synthetic-context-b' }),
            );
        };
        if (stage === 'platform') {
          const loader = f.dependencies.platform;
          f.dependencies.platform = async () => {
            await mutateContext();
            return loader();
          };
        } else {
          const loader = f.dependencies.terraform;
          f.dependencies.terraform = async () => {
            await mutateContext();
            return loader();
          };
        }
        const result = await f.run();
        expect(result.isError).toBe(true);
        if (mutation === 'unchanged') {
          expect(result.content[0].text).toContain('test owning storage boundary reached');
          expect(f.calls.storage).toBe(1);
        } else {
          expect(result.content[0].text).toMatch(/context changed during/);
          expect(f.calls.storage).toBe(0);
        }
        expect(result.content[0].text).not.toContain('synthetic-context');
      } finally {
        if (before === undefined) delete process.env.XDG_CONFIG_HOME;
        else process.env.XDG_CONFIG_HOME = before;
      }
    });

test('actual public Terraform network update reaches owning storage instead of a future-work rejection', async () => {
  const f = await fixture();
  Object.assign(f.params, { planId: f.plan.planId, planSha256: f.plan.planSha256 });
  const result = await f.run();
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain('test owning storage boundary reached');
  expect(result.content[0].text).not.toContain('not executable through Azure CE apply');
  expect(f.calls.storage).toBe(1);
});

for (const site of [
  {},
  { metadata: null, system_metadata: { uid: 'site-uid' } },
  { metadata: [], system_metadata: { uid: 'site-uid' } },
  { metadata: { name: 'foreign', namespace: 'system' }, system_metadata: { uid: 'site-uid' } },
  { metadata: { namespace: 'system' }, system_metadata: {} },
] as const)
  test(`actual public network adapter rejects malformed owned site ${JSON.stringify(site)} before cloud access`, async () => {
    const f = await fixture();
    const store = await CeDeploymentStore.open(join(f.ctx.cwd, 'owning'), azureUpgradeBinding(f.plan).owner);
    let cloudCalls = 0,
      terraformCalls = 0,
      configurationCalls = 0;
    const runtime = {
      engine: 'terraform',
      observeOwnedSite: async () => site,
      ownedSiteConfiguration: () => {
        configurationCalls++;
        throw Error('unexpected configuration read');
      },
    } as unknown as Parameters<
      typeof import('../../src/ce/terraform-network-public-update').runAzureTerraformNetworkPublicUpdate
    >[3];
    const terraform = {
      open: async () => {
        terraformCalls++;
        throw Error('unexpected Terraform access');
      },
    } as unknown as CeTerraformService;
    const api = {
      exec: async () => {
        cloudCalls++;
        throw Error('unexpected cloud access');
      },
    } as AzExecApi;
    const { runAzureTerraformNetworkPublicUpdate } = await import('../../src/ce/terraform-network-public-update');
    await expect(runAzureTerraformNetworkPublicUpdate(f.plan, f.ctx, terraform, runtime, store, api)).rejects.toThrow(
      'Current owned network site identity is unavailable',
    );
    expect(cloudCalls).toBe(0);
    expect(terraformCalls).toBe(0);
    expect(configurationCalls).toBe(0);
  });
