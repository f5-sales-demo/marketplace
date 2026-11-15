import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import {
  publicTerraformCloudScope,
  publicTerraformPlatformScope,
} from '../../gcloud/src/ce/terraform-public-ownership';
import type { GcpCeIntent } from '../../gcloud/src/ce/types';
import { intent as baseIntent } from '../../gcloud/test/ce/fixtures';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { createInstalledCaptureContext, type InstalledCaptureContext } from '../src/installed-capture-context';
import { readOwnedInstalledInput } from '../src/installed-runtime';
import { linuxMonotonicMs } from '../src/linux-clock';
import { type Deployment, type Invocation, readOriginalTerraformPlanSource, TerraformRunner } from '../src/runner';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
function key(byte: number) {
  return `ssh-ed25519 ${Buffer.concat([Buffer.from('0000000b7373682d6564323535313900000020', 'hex'), Buffer.alloc(32, byte)]).toString('base64')}`;
}
function declaredIntent(ha: boolean): GcpCeIntent {
  const i = baseIntent();
  i.project = 'example-project';
  i.engine = 'terraform';
  i.routing.destinationCidrs = [];
  i.initialAccess = { schemaVersion: 1, profile: 'site-ssh-sli', publicKey: key(1) };
  if (ha) {
    i.sites[0].nodes = ['a', 'b', 'c'].map((suffix) => ({
      ...structuredClone(i.sites[0].nodes[0]),
      name: `node-${suffix}`,
      zone: `northamerica-northeast1-${suffix}`,
    }));
    i.schemaVersion = 2;
    i.observer = {
      schemaVersion: 1,
      profile: 'original-ha-observer',
      publicKey: key(2),
      sshSourceCidr: '192.0.2.4/32',
    };
  }
  return i;
}
type Row = {
  address: string;
  type: string;
  mode: string;
  change: { actions: string[]; after: Record<string, unknown>; after_unknown: Record<string, unknown> };
};
async function fixture(
  run: (context: InstalledCaptureContext, store: CeDeploymentStore) => Promise<void>,
  mutation = '',
  ha = true,
  expired: () => boolean = () => false,
) {
  const root = await mkdtemp(join(tmpdir(), 'original-inventory-scope-'));
  roots.push(root);
  const intent = declaredIntent(ha);
  const owner = {
    provider: 'gcp' as const,
    engine: 'terraform' as const,
    account: intent.project,
    region: intent.region,
    deploymentId: intent.deploymentName,
  };
  const store = await CeDeploymentStore.open(root, owner);
  await store.write('gcp-terraform-input-identity.json', {
    intent,
    intentFingerprint: fingerprint(intent),
    platformContext: intent.platformContext,
  });
  const cloud = publicTerraformCloudScope(intent);
  const platform = publicTerraformPlatformScope(intent);
  const rows: Row[] = cloud.map((resource) => {
    const name = resource.selfLink.split('/').at(-1);
    if (!name) throw new Error('Original fixture resource name required');
    return {
      address: `google_compute_${resource.kind}.${name.replaceAll('-', '_')}`,
      type: `google_compute_${resource.kind}`,
      mode: 'managed',
      change: {
        actions: ['create'],
        after: {
          name,
          project: intent.project,
          ...(['instance', 'disk'].includes(resource.kind)
            ? { zone: resource.selfLink.split('/zones/')[1].split('/')[0] }
            : {}),
          ...(resource.kind === 'subnetwork' ? { region: intent.region } : {}),
        },
        after_unknown: { id: true },
      },
    };
  });
  rows.push(
    ...platform.map((resource) => ({
      address: resource.address,
      type: 'tokenName' in resource ? 'xcsh_token' : 'xcsh_securemesh_site_v2',
      mode: 'managed',
      change: {
        actions: ['create'],
        after: {
          name: 'tokenName' in resource ? resource.tokenName : resource.siteName,
          namespace: 'system',
          ...('tokenName' in resource ? { site_name: resource.siteName } : {}),
        },
        after_unknown: { id: true },
      },
    })),
  );
  if (mutation === 'extra')
    rows.push({ ...rows[0], address: 'google_compute_router.foreign', type: 'google_compute_router' });
  if (mutation === 'missing') rows.pop();
  if (mutation === 'project') rows[0].change.after.project = 'foreign-project';
  if (mutation === 'unknown') rows[0].change.after_unknown.name = true;
  if (mutation === 'replacement') rows[0].change.actions = ['delete', 'create'];
  const last = rows.at(-1);
  if (!last) throw new Error('Original fixture row required');
  if (mutation === 'namespace') last.change.after.namespace = 'foreign';
  if (mutation === 'platform-name') last.change.after.name = 'foreign-token';
  const deployment: Deployment = {
    schemaVersion: 1,
    deploymentId: owner.deploymentId,
    engine: 'terraform',
    scope: { cloud: 'gcp', account: intent.project, region: intent.region },
    terraformVersion: '1.17.2',
    configuration: '{"terraform":{"required_version":"= 1.17.2"}}',
    providerLock: '# exact offline fixture lock',
    backendIdentity: `local:${owner.deploymentId}`,
  };
  const runner = new TerraformRunner(
    store.directory,
    async (request: Invocation) => {
      if (request.args[0] === 'plan')
        await writeFile(join(request.cwd, 'saved.tfplan'), 'original-owned-inventory-plan', { mode: 0o600 });
      if (request.args[0] === 'apply') {
        const adc = join(request.cwd, 'adc.private'),
          platformInput = join(request.cwd, 'platform.private');
        await writeFile(adc, 'original-adc', { mode: 0o400 });
        await writeFile(platformInput, 'original-platform', { mode: 0o400 });
        const files = {
          adc,
          platform: platformInput,
          'workspace:main.tf.json': join(request.cwd, 'main.tf.json'),
          'workspace:.terraform.lock.hcl': join(request.cwd, '.terraform.lock.hcl'),
          'workspace:gcp-terraform-input-identity.json': join(store.directory, 'gcp-terraform-input-identity.json'),
        };
        const inputs = Object.fromEntries(
          await Promise.all(
            Object.entries(files).map(async ([name, path]) => [name, (await readOwnedInstalledInput(path)).binding]),
          ),
        );
        const start = linuxMonotonicMs();
        const context = createInstalledCaptureContext({
          owner,
          executionDirectory: request.cwd,
          budget: { start, deadline: start + 7200000 },
          authentication: {
            accountSha256: 'a'.repeat(64),
            audienceSha256: 'b'.repeat(64),
            snapshotSha256: inputs.adc.sha256,
          },
          environment: {
            GOOGLE_APPLICATION_CREDENTIALS: adc,
            XCSH_API_URL: 'https://tenant.example.test',
            XCSH_API_TOKEN: 'synthetic',
          },
          inputs,
          assertInputs: async () => {},
          assertWithinDeadline: async () => {
            if (expired()) throw new Error('original operation expired');
          },
          readProviderInputs: async () => ({}),
          readOriginalPlanSource: () =>
            readOriginalTerraformPlanSource(request.originalPlanSource, {
              directory: request.cwd,
              engine: 'terraform',
              deploymentId: owner.deploymentId,
              scope: deployment.scope,
              terraformVersion: deployment.terraformVersion,
              backendIdentity: deployment.backendIdentity,
            }),
        });
        await run(context, store);
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
      }; // codespell:ignore applyable
    },
    undefined,
    'gcp-resource-plan-v1',
  );
  await runner.prepare(deployment);
  const plan = await runner.plan({});
  await runner.apply(plan, {});
}

for (const ha of [false, true])
  test(`original ${ha ? 'HA observer' : 'single-node'} inventory scope joins exact owning plan and intent`, async () => {
    const { prepareOriginalGcpInventoryScope, inspectOriginalGcpInventoryScope, assertOriginalGcpInventoryScope } =
      await import('../src/original-gcp-inventory-scope');
    let packet: unknown;
    await fixture(
      async (context, store) => {
        packet = await prepareOriginalGcpInventoryScope(context, store);
        const view = await inspectOriginalGcpInventoryScope(packet);
        expect(view.resources).toHaveLength(ha ? 21 : 8);
        expect(view.cloud).toHaveLength(ha ? 17 : 6);
        expect(view.platform).toHaveLength(ha ? 4 : 2);
        expect(view.executionAuthorized).toBe(false);
        expect(view.cloud.some((row) => row.role === 'observer')).toBe(ha);
        expect(new Set(view.resources.map((row) => row.address)).size).toBe(view.resources.length);
        await assertOriginalGcpInventoryScope(packet);
        await expect(inspectOriginalGcpInventoryScope({ ...(packet as object) })).rejects.toThrow('Original');
      },
      '',
      ha,
    );
    await expect(assertOriginalGcpInventoryScope(packet)).rejects.toThrow();
  });

for (const mutation of ['extra', 'missing', 'project', 'unknown', 'replacement', 'namespace', 'platform-name'])
  test(`owning inventory refuses ${mutation} without producing execution authority`, async () => {
    const { prepareOriginalGcpInventoryScope } = await import('../src/original-gcp-inventory-scope');
    await fixture(async (context, store) => {
      await expect(prepareOriginalGcpInventoryScope(context, store)).rejects.toThrow();
    }, mutation);
  });

test('inventory intent file replacement remains refused after bytes are restored', async () => {
  const { prepareOriginalGcpInventoryScope, assertOriginalGcpInventoryScope } = await import(
    '../src/original-gcp-inventory-scope'
  );
  await fixture(async (context, store) => {
    const packet = await prepareOriginalGcpInventoryScope(context, store);
    const path = join(store.directory, 'gcp-terraform-input-identity.json');
    await rename(path, `${path}.original`);
    await writeFile(path, await readFile(`${path}.original`), { mode: 0o400 });
    await expect(assertOriginalGcpInventoryScope(packet)).rejects.toThrow();
    await rm(path);
    await rename(`${path}.original`, path);
    await expect(assertOriginalGcpInventoryScope(packet)).rejects.toThrow();
  });
});

test('expired operation preserves read-only original inventory inputs without renewing authority', async () => {
  const {
    prepareOriginalGcpInventoryScope,
    assertOriginalGcpInventoryScope,
    assertOriginalGcpInventoryInputs,
    inspectOriginalGcpInventoryScope,
  } = await import('../src/original-gcp-inventory-scope');
  let expired = false;
  await fixture(
    async (context, store) => {
      const packet = await prepareOriginalGcpInventoryScope(context, store);
      expired = true;
      await expect(assertOriginalGcpInventoryScope(packet)).rejects.toThrow('expired');
      await assertOriginalGcpInventoryInputs(packet);
      expect((await inspectOriginalGcpInventoryScope(packet)).executionAuthorized).toBe(false);
      await expect(assertOriginalGcpInventoryScope(packet)).rejects.toThrow('expired');
    },
    '',
    true,
    () => expired,
  );
});

test('cached inventory preparation cannot ignore a different storage owner', async () => {
  const { prepareOriginalGcpInventoryScope } = await import('../src/original-gcp-inventory-scope');
  await fixture(async (context, store) => {
    const original = await prepareOriginalGcpInventoryScope(context, store);
    expect(await prepareOriginalGcpInventoryScope(context, store)).toBe(original);
    const root = await mkdtemp(join(tmpdir(), 'foreign-inventory-store-'));
    roots.push(root);
    const foreign = await CeDeploymentStore.open(root, { ...context.owner, deploymentId: 'foreign' });
    await expect(prepareOriginalGcpInventoryScope(context, foreign)).rejects.toThrow('storage');
  });
});
