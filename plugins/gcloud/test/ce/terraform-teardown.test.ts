import { afterEach, expect, it } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Type } from '@sinclair/typebox';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { GCP_CE_API_RELEASE } from '../../src/ce/contract';
import { fingerprint } from '../../src/ce/discovery';
import { recordGcpResource } from '../../src/ce/ownership';
import {
  applyGcpTerraformTeardown,
  type GcpTerraformTeardownRuntime,
  planGcpTerraformTeardown,
  recordGcpTerraformPlatformIdentity,
} from '../../src/ce/terraform-teardown';
import { createGcpCeTools } from '../../src/tools/gcp-ce';
import { intent } from './fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const i = intent();
  i.engine = 'terraform';
  i.routing.destinationCidrs = [];
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'gcp-tf-teardown-')));
  roots.push(directory);
  const files = new Map<string, unknown>();
  const store = {
    directory,
    read: async (name: string) => {
      if (!files.has(name)) throw Object.assign(new Error('absent'), { code: 'ENOENT' });
      return structuredClone(files.get(name));
    },
    write: async (name: string, value: unknown) => {
      files.set(name, structuredClone(value));
    },
  };
  await store.write('gcp-terraform-input-identity.json', {
    intent: i,
    intentFingerprint: fingerprint(i),
    platformContext: i.platformContext,
  });
  const prefix = `https://www.googleapis.com/compute/v1/projects/${i.project}`;
  const node = i.sites[0].nodes[0],
    site = i.sites[0].name;
  const resources = [
    { kind: 'instance' as const, selfLink: `${prefix}/zones/${node.zone}/instances/${node.name}` },
    { kind: 'disk' as const, selfLink: `${prefix}/zones/${node.zone}/disks/${node.name}` },
    ...node.interfaces.flatMap((nic) => [
      { kind: 'network' as const, selfLink: `${prefix}/global/networks/${nic.network}` },
      { kind: 'subnetwork' as const, selfLink: `${prefix}/regions/${i.region}/subnetworks/${nic.subnet}` },
    ]),
  ].map((r, index) => ({
    ...r,
    id: String(index + 1),
    project: i.project,
    deploymentName: i.deploymentName,
    engine: 'terraform' as const,
    ...(['instance', 'disk'].includes(r.kind) ? { siteName: site, nodeName: node.name } : {}),
  }));
  for (const resource of resources) await recordGcpResource(store, resource);
  const live = new Map(resources.map((resource) => [resource.selfLink, resource]));
  const fields: Record<string, Record<string, unknown>> = {};
  for (const r of resources.filter((r) => r.kind !== 'disk')) {
    const type =
      r.kind === 'instance'
        ? 'google_compute_instance'
        : r.kind === 'network'
          ? 'google_compute_network'
          : 'google_compute_subnetwork';
    const name = r.selfLink.split('/').at(-1) as string;
    fields[`${type}.${name.replaceAll('-', '_')}`] = {
      name,
      project: i.project,
      self_link: r.selfLink,
      ...(r.kind === 'instance'
        ? {
            zone: node.zone,
            instance_id: r.id,
            'boot_disk.length': 1,
            'boot_disk.0.source': resources[1].selfLink,
            'boot_disk.0.auto_delete': true,
            'network_interface.length': node.interfaces.length,
            ...Object.fromEntries(
              node.interfaces.flatMap((nic, index) => [
                [`network_interface.${index}.network`, `${prefix}/global/networks/${nic.network}`],
                [`network_interface.${index}.subnetwork`, `${prefix}/regions/${i.region}/subnetworks/${nic.subnet}`],
              ]),
            ),
          }
        : r.kind === 'network'
          ? { numeric_id: r.id }
          : { region: i.region }),
    };
  }
  fields[`xcsh_securemesh_site_v2.${site.replaceAll('-', '_')}`] = {
    id: site,
    name: site,
    namespace: 'system',
    labels: { 'xcsh-deployment': i.deploymentName, 'xcsh-engine': 'terraform' },
  };
  fields[`xcsh_token.${node.name.replaceAll('-', '_')}`] = {
    id: `${node.name}-token`,
    name: `${node.name}-token`,
    namespace: 'system',
    site_name: site,
    labels: { 'xcsh-deployment': i.deploymentName, 'xcsh-engine': 'terraform', 'xcsh-node': node.name },
  };
  const hash = 'a'.repeat(64);
  const receipt = (actions: 'create' | 'delete', empty = false): PlanReceipt => ({
    schemaVersion: 1,
    deploymentId: i.deploymentName,
    engine: 'terraform',
    backendIdentity: `local:${i.deploymentName}`,
    configurationSha256: hash,
    providerLockSha256: hash,
    planSha256: hash,
    changes: empty
      ? []
      : Object.keys(fields).map((address) => ({ address, type: address.split('.')[0], actions: [actions] })),
    noChanges: empty,
    ...(actions === 'delete' ? { operation: 'destroy' as const } : {}),
  });
  const creation = receipt('create');
  let applies = 0,
    reconciliations = 0,
    applied = false,
    lose = false,
    partial = false,
    created = true;
  const platform = {
    siteName: site,
    siteUid: 'site-uid',
    tokenName: `${node.name}-token`,
    tokenIdentityHash: fingerprint({ uid: 'token-uid' }),
    siteAbsent: false,
    tokenAbsent: false,
  };
  const runtime: GcpTerraformTeardownRuntime = {
    store,
    environment: {},
    api: {
      exec: async (_command, args) => {
        if (args[0] === 'auth') return { stdout: 'private-google-credential-fixture', stderr: '', exitCode: 0 };
        if (args.includes('delete')) throw new Error('Terraform teardown cannot use native cloud deletion');
        const name = args[args[2] === 'subnets' ? 4 : 3];
        const r = [...live.values()].find(
          (r) =>
            r.selfLink.endsWith(`/${name}`) &&
            (args[1] === 'instances'
              ? r.kind === 'instance'
              : args[1] === 'disks'
                ? r.kind === 'disk'
                : args[2] === 'subnets'
                  ? r.kind === 'subnetwork'
                  : r.kind === 'network'),
        );
        return r
          ? { stdout: JSON.stringify({ id: r.id, selfLink: r.selfLink }), stderr: '', exitCode: 0 }
          : { stdout: '', stderr: 'not found', exitCode: 1 };
      },
    },
    observePlatform: async () => structuredClone(platform),
    session: {
      assertApplied: async () => {
        if (!created) throw new Error('creation not applied');
      },
      planDestroy: async () => receipt('delete', applied),
      readPlannedResourceFields: async () => structuredClone(fields),
      apply: async () => {
        applies++;
        applied = true;
        if (partial) {
          live.delete(resources[0].selfLink);
        } else {
          live.clear();
          platform.siteAbsent = true;
          platform.tokenAbsent = true;
        }
        if (lose) throw new Error('lost apply response');
      },
      reconcileApplyFromEvidence: async () => {
        reconciliations++;
      },
    } as GcpTerraformTeardownRuntime['session'],
  };
  const contract = {
    release: GCP_CE_API_RELEASE,
    fingerprint: 'verified',
    availability: 'unavailable' as const,
    reason: 'gcp_provider_requires_consumer_qualification' as const,
    singleNodeLifecycle: { node_count: 1, interface_count: 2 },
  };
  const policy = {
    identity: 'f5xc-ce-automation-policy/v2' as const,
    url: 'https://example.test/policy',
    normalizedSha256: `sha256:${'b'.repeat(64)}`,
    observedAt: new Date().toISOString(),
  };
  return {
    i,
    runtime,
    contract,
    policy,
    creation,
    resources,
    live,
    fields,
    platform,
    applies: () => applies,
    reconciliations: () => reconciliations,
    lose: () => {
      lose = true;
    },
    partial: () => {
      partial = true;
    },
    notCreated: () => {
      created = false;
    },
  };
}
it('requires completed creation and immutable platform ledger before reviewing a destroy', async () => {
  const f = await fixture();
  await expect(planGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy)).rejects.toThrow();
  f.notCreated();
  await expect(recordGcpTerraformPlatformIdentity(f.runtime, f.i, f.contract, f.creation)).rejects.toThrow(
    'not applied',
  );
  expect(f.applies()).toBe(0);
});

it('typed Terraform teardown preserves owning engine and never exports execution credentials', async () => {
  const f = await fixture();
  await recordGcpTerraformPlatformIdentity(f.runtime, f.i, f.contract, f.creation);
  const platform = {
    storage: async () => f.runtime.store,
    gcpObservations: async () => ({
      teardown: f.runtime.observePlatform,
      terraformEnvironment: async () => ({
        XCSH_API_URL: 'https://tenant.example.test',
        XCSH_API_TOKEN: 'private-xc-credential-fixture',
      }),
    }),
  } as unknown as CePlatformService;
  const tools = createGcpCeTools(
    { typebox: { Type } },
    () => f.runtime.api,
    async () => f.contract,
    async () => platform,
    undefined,
    async () => f.policy,
    async () => f.runtime.session,
  );
  const teardown = tools.find((t) => t.name === 'gcp_ce_teardown');
  const apply = tools.find((t) => t.name === 'gcp_ce_apply');
  if (!teardown || !apply) throw new Error('Missing owning-engine tools');
  const scope = {
    project: f.i.project,
    region: f.i.region,
    deploymentName: f.i.deploymentName,
    platformContext: f.i.platformContext,
    engine: 'terraform' as const,
    operation: 'teardown' as const,
  };
  const review = await teardown.execute('tf-review', scope, undefined, null, { cwd: f.runtime.store.directory });
  expect(review.isError).toBeUndefined();
  expect(f.applies()).toBe(0);
  expect(JSON.stringify(review)).not.toContain('private-xc-credential-fixture');
  expect(JSON.stringify(review)).not.toContain('private-google-credential-fixture');
  const planHash = (review.details.plan as { planHash: string }).planHash;
  const result = await apply.execute('tf-apply', { ...scope, approvedPlanHash: planHash }, undefined, null, {
    cwd: f.runtime.store.directory,
  });
  expect(result.isError).toBeUndefined();
  expect(result.details.state).toBe('done');
  expect(result.details.engine).toBe('terraform');
  expect(result.details.mutationAttempted).toBe(true);
  expect(f.applies()).toBe(1);
  expect(JSON.stringify(result)).not.toContain('private-xc-credential-fixture');
});
it('saves an exact destroy review, applies once and independently confirms eight absences and an empty final destroy plan', async () => {
  const f = await fixture();
  await recordGcpTerraformPlatformIdentity(f.runtime, f.i, f.contract, f.creation);
  const plan = await planGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy);
  expect(f.applies()).toBe(0);
  expect(plan.savedPlan.changes).toHaveLength(7);
  const result = await applyGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy, plan.planHash);
  expect(result.state).toBe('done');
  expect(f.applies()).toBe(1);
  expect(f.live.size).toBe(0);
  await applyGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy, plan.planHash);
  expect(f.applies()).toBe(1);
});
it('reviews disk and ordered NIC identities without requesting sensitive provider blocks', async () => {
  const f = await fixture();
  await recordGcpTerraformPlatformIdentity(f.runtime, f.i, f.contract, f.creation);
  const read = f.runtime.session.readPlannedResourceFields;
  f.runtime.session.readPlannedResourceFields = async (receipt, selections, env, signal) => {
    const fields = selections['google_compute_instance.node_a'];
    expect(fields).not.toContain('boot_disk');
    expect(fields).not.toContain('network_interface');
    expect(fields).toContain('boot_disk.length');
    expect(fields).toContain('boot_disk.0.source');
    expect(fields).toContain('network_interface.length');
    expect(fields).toContain('network_interface.1.subnetwork');
    return read(receipt, selections, env, signal);
  };
  const plan = await planGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy);
  expect(plan.savedPlan.changes).toHaveLength(7);
  expect(f.applies()).toBe(0);
});
it('rejects changed disk counts, disk retention, and NIC order in restricted projections', async () => {
  const f = await fixture();
  await recordGcpTerraformPlatformIdentity(f.runtime, f.i, f.contract, f.creation);
  const vm = f.fields['google_compute_instance.node_a'];
  for (const [field, changed] of [
    ['boot_disk.length', 2],
    ['boot_disk.0.auto_delete', false],
    ['boot_disk.0.source', 'foreign-disk'],
    ['network_interface.length', 3],
    ['network_interface.0.network', vm['network_interface.1.network']],
    ['network_interface.1.subnetwork', vm['network_interface.0.subnetwork']],
  ] as const) {
    const original = vm[field];
    vm[field] = changed;
    await expect(planGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy)).rejects.toThrow('VM/disk identity');
    vm[field] = original;
  }
  expect(f.applies()).toBe(0);
});
it('reconciles a lost complete apply from independent evidence without repeating apply', async () => {
  const f = await fixture();
  await recordGcpTerraformPlatformIdentity(f.runtime, f.i, f.contract, f.creation);
  const plan = await planGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy);
  f.lose();
  await expect(applyGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy, plan.planHash)).rejects.toThrow('lost');
  expect((await applyGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy, plan.planHash)).state).toBe('done');
  expect(f.applies()).toBe(1);
  expect(f.reconciliations()).toBe(1);
});
it('partial interrupted deletion stays pending without blind application retries', async () => {
  const f = await fixture();
  await recordGcpTerraformPlatformIdentity(f.runtime, f.i, f.contract, f.creation);
  const plan = await planGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy);
  f.partial();
  f.lose();
  await expect(applyGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy, plan.planHash)).rejects.toThrow('lost');
  expect((await applyGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy, plan.planHash)).state).toBe('pending');
  expect(f.applies()).toBe(1);
  expect(f.reconciliations()).toBe(0);
});
it('replacement and changed saved-plan identity reject before any apply', async () => {
  const f = await fixture();
  await recordGcpTerraformPlatformIdentity(f.runtime, f.i, f.contract, f.creation);
  const plan = await planGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy);
  f.live.set(f.resources[5].selfLink, { ...f.resources[5], id: '999' });
  await expect(applyGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy, plan.planHash)).rejects.toThrow(
    'ownership',
  );
  f.live.set(f.resources[5].selfLink, f.resources[5]);
  f.platform.tokenIdentityHash = fingerprint({ uid: 'replacement' });
  await expect(applyGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy, plan.planHash)).rejects.toThrow(
    'replaced',
  );
  expect(f.applies()).toBe(0);
});
it('unexpected bootstrap fields cannot enter reviewed ownership projections', async () => {
  const f = await fixture();
  await recordGcpTerraformPlatformIdentity(f.runtime, f.i, f.contract, f.creation);
  f.fields['xcsh_token.node_a'].uid = 'private-bootstrap-fixture';
  await expect(planGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy)).rejects.toThrow('unexpected fields');
  expect(f.applies()).toBe(0);
});
it('wrong engine and reappeared resources cannot trigger Terraform teardown', async () => {
  const f = await fixture();
  f.i.engine = 'native';
  await expect(planGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy)).rejects.toThrow('terraform');
  f.i.engine = 'terraform';
  await recordGcpTerraformPlatformIdentity(f.runtime, f.i, f.contract, f.creation);
  const plan = await planGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy);
  await applyGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy, plan.planHash);
  f.live.set(f.resources[0].selfLink, f.resources[0]);
  await expect(applyGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy, plan.planHash)).rejects.toThrow(
    'reappeared',
  );
  expect(f.applies()).toBe(1);
});

it('stale or semantically altered reviewed plans cannot authorize destruction', async () => {
  const f = await fixture();
  await recordGcpTerraformPlatformIdentity(f.runtime, f.i, f.contract, f.creation);
  const plan = await planGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy);
  const { planHash: _hash, ...body } = plan;
  for (const change of [{ createdAt: '2000-01-01T00:00:00Z' }, { operation: 'deploy' }]) {
    const altered = { ...body, ...change };
    const planHash = fingerprint(altered);
    await f.runtime.store.write(`gcp-tf-reviewed-${planHash.slice(7)}.json`, { ...altered, planHash });
    await expect(applyGcpTerraformTeardown(f.runtime, f.i, f.contract, f.policy, planHash)).rejects.toThrow();
  }
  expect(f.applies()).toBe(0);
});
