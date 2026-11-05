import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import { type AzureCeToolContext, type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { executeAzureCeTerraformApply } from '../../src/ce/terraform-apply';
import { runAzureTerraformNetworkPublicUpdate } from '../../src/ce/terraform-network-public-update';
import { saveAzureTerraformOutcome } from '../../src/ce/terraform-outcome';
import { terraformNetworkSourceFixture } from './terraform-network-source-fixture';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

// Synthetic provider observations test actual public dispatch, storage, history, signing,
// and pending/resume ordering. They do not qualify vendor freshness or live networking.
for (const owningApply of [false, true])
  test(`actual ${owningApply ? 'owning apply dispatch' : 'public network adapter'} persists authenticated incomplete preflight and resumes without interruption`, async () => {
    const f = await terraformNetworkSourceFixture(false);
    const root = await mkdtemp(join(tmpdir(), 'azure-network-public-integration-'));
    roots.push(root);
    const publicDirectory = join(root, 'public');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(publicDirectory, { mode: 0o700 });
    const store = await CeDeploymentStore.open(join(root, 'private'), f.store.owner);
    for (const [name, value] of f.records) await store.write(name, value);
    let sequence = 0;
    const paths = new Map<string, string>();
    const session: SessionManagerLike = {
      getSessionId: () => publicDirectory,
      getArtifactsDir: () => publicDirectory,
      getArtifactPath: async (id) => paths.get(id) ?? null,
      saveArtifact: async (content, type) => {
        const id = String(++sequence),
          path = join(publicDirectory, `${id}.${type}.log`);
        await writeFile(path, content, { mode: 0o600 });
        paths.set(id, path);
        return id;
      },
    };
    await savePlanArtifact(session, f.original, f.current);
    await savePlanArtifact(session, f.plan, f.current);
    const originalOutcome = f.outcomes.get(f.original.planSha256);
    if (!originalOutcome) throw Error('Synthetic original deployment outcome is missing');
    await saveAzureTerraformOutcome(session, originalOutcome);
    let siteReads = 0,
      mutationCalls = 0;
    const runtime = {
      engine: 'terraform',
      observeOwnedSite: async () => {
        siteReads++;
        return {
          metadata: { name: f.plan.siteName, namespace: 'system' },
          system_metadata: { uid: f.site.siteUid },
          spec: {},
        };
      },
      ownedSiteConfiguration: () => f.siteConfiguration,
      observeRegistrations: async (_binding: unknown, instances: Record<string, string>) => ({
        owner: store.owner,
        siteName: f.plan.siteName,
        status: 'healthy',
        nodes: f.nodes.map((node) => ({
          node,
          instanceId: instances[node],
          registration: `${node}-registration`,
          status: 'healthy',
          state: 'ONLINE',
        })),
      }),
      observeAzureInterfaces: async (_binding: unknown, expected: ExpectedCeInterface[]) => ({
        status: 'observed',
        freshness: 'unqualified',
        canSatisfyInterfaceMutationGate: false,
        interfaces: expected.map((row) => ({
          ...row,
          device: row.role === 'slo' ? 'eth0' : 'eth1',
          interfaceName: `${row.node}-${row.role}`,
          linkUp: true,
          mtu: 1500,
          ipv4: null,
        })),
      }),
      observeHealth: async () => ({ status: 'unknown' }),
      observeNodeReadiness: async () => ({ status: 'unknown' }),
      observeBgpSessions: async () => ({ status: 'unknown' }),
      observeBgpRoutes: async () => ({ status: 'unknown' }),
      observeForwardingRoutes: async () => ({ status: 'unknown' }),
    } as unknown as Parameters<typeof runAzureTerraformNetworkPublicUpdate>[3];
    const rejectMutation = async () => {
      mutationCalls++;
      throw Error('unexpected Terraform mutation');
    };
    const terraform = {
      open: async () => ({
        readConfigurationSha256: async () => f.hash(f.source),
        readConfiguration: async () => f.source,
        readOutputs: async () => structuredClone(f.outputs),
        apply: rejectMutation,
        writeConfiguration: rejectMutation,
      }),
    } as unknown as CeTerraformService;
    const execute = f.api.exec;
    f.api.exec = (command, args, options) =>
      args.includes('show-effective-route-table')
        ? Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ value: [] }), stderr: '' })
        : execute.call(f.api, command, args, options);
    const ctx: AzureCeToolContext = {
      cwd: root,
      hasUI: false,
      ui: { confirm: async () => false },
      sessionManager: session,
    };
    const platform = { storage: async () => store, runtime: async () => runtime } as unknown as CePlatformService;
    const before = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    try {
      const run = () =>
        owningApply
          ? executeAzureCeTerraformApply(
              { planId: f.plan.planId, planSha256: f.plan.planSha256 },
              ctx,
              f.api,
              platform,
              terraform,
              undefined,
              { observe: async () => f.current },
            )
          : runAzureTerraformNetworkPublicUpdate(f.plan, ctx, terraform, runtime, store, f.api);
      const first = await run();
      expect(first).toMatchObject({
        status: 'operational-acceptance-pending',
        phase: 'prepared',
        purpose: 'preflight',
        node: 1,
      });
      expect(siteReads).toBeGreaterThan(1);
      const checkpoint = await store.read(`${f.plan.planId}-terraform-network-driver-checkpoint.json`);
      const names = await readdir(store.directory);
      expect(names.some((name) => name.startsWith('azure-network-observation-'))).toBe(true);
      expect(
        [...paths.values()].filter((name) => name.endsWith('.azure-ce-network-operational-issuer.log')),
      ).toHaveLength(1);
      expect(names.some((name) => name.endsWith('-deallocate-mutation-plan.json'))).toBe(false);
      expect(names.includes(`${f.plan.planId}-terraform-network-node-1-preflight.json`)).toBe(false);
      expect((await run()).status).toBe('operational-acceptance-pending');
      expect(await store.read(`${f.plan.planId}-terraform-network-driver-checkpoint.json`)).toEqual(checkpoint);
      expect(mutationCalls).toBe(0);
      expect(f.mutations()).toBe(0);
    } finally {
      if (before === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = before;
    }
  });
