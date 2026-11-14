import { expect } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureTerraformCurrentDeployment, renderAzureTerraformFoundation } from '../../src/ce/terraform-foundation';
import { qualifyAzureTerraformNetworkUpdateSource } from '../../src/ce/terraform-network-update-source';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import type { AzureCeIntent } from '../../src/ce/types';
import { networkUpdateFixture } from './network-update-fixture';
import { historicalFixture } from './terraform-generation-fixture';

export async function terraformNetworkSourceFixture(
  ha: boolean,
  generations = false,
  routing?: AzureCeIntent['routing'],
  ingress?: AzureCeIntent['ingress'],
) {
  const f = networkUpdateFixture(ha, 'terraform', true, false, routing, false, ingress);
  const h = generations ? historicalFixture(ha) : undefined;
  if (h) {
    expect(h.base.planSha256).toBe(f.original.planSha256);
    for (const [i, vm] of f.vms.entries()) {
      const node = f.nodes[i];
      vm.vmId = h.third.checkpoint.oldVmIds[node];
      vm.tags['xcsh-plan-sha256'] = h.third.checkpoint.ownerPlanSha256ByNode[node];
    }
    for (const [i] of f.nodes.entries())
      for (const nic of f.original.nics) {
        const row = h.third.checkpoint.retainedNics[`${i + 1}:${nic.index}`];
        const cloud = f.nics.get(row.resourceId) as Record<string, unknown>;
        cloud.macAddress = row.mac;
        f.config(cloud).privateIPAddress = row.privateIp;
      }
    for (const resource of f.current.resources) {
      const vm = f.vms.find((v) => v.id === resource.id);
      if (vm) resource.tags = structuredClone(vm.tags);
    }
    const updated = compileAzureCePlan(f.plan.intent, f.current);
    Object.assign(f.plan, updated);
  }
  const before = await captureAzureNetworkUpdateInventory(f.plan, f.api);
  const source = h
    ? (h.records.get(`${h.third.plan.planId}-terraform-replacement-source.json`) as { source: string }).source
    : f.source();
  const birthSource = h
    ? (h.records.get(`${h.first.plan.planId}-terraform-replacement-source.json`) as { source: string }).source
    : source;
  const lock = f.hash((await azureTerraformCurrentDeployment(f.plan)).providerLock);
  const json = JSON.parse(birthSource);
  const bootstrapByNode = Object.fromEntries(
    f.nodes.map((_, i) => [
      String(i + 1),
      Buffer.from(json.resource.azurerm_linux_virtual_machine[`node_${i + 1}`].custom_data, 'base64').toString('utf8'),
    ]),
  );
  const owner = azureUpgradeBinding(f.original).owner;
  const siteConfiguration = { syntheticSite: 'network-source-fixture' };
  const site = {
    siteUid: 'site-uid',
    siteConfigurationSha256: h ? 'e'.repeat(64) : canonicalSha256(siteConfiguration),
  };
  const registrations = {
    owner,
    siteName: f.original.siteName,
    status: 'healthy',
    nodes: f.nodes.map((node, i) => ({
      node,
      instanceId: h ? h.first.checkpoint.oldVmIds[node] : before.nodes[String(i + 1)].vmId,
      state: 'ONLINE',
      status: 'healthy',
      registration: `r-node-${i + 1}`,
    })),
  };
  const hardware = {
    owner,
    siteName: f.original.siteName,
    evidenceKind: 'registration-hardware-inventory',
    source: `/api/register/namespaces/system/registrations_by_site/${f.original.siteName}`,
    interfaces: Object.entries(before.nodes).flatMap(([node, vm]) =>
      Object.entries(vm.nics).map(([index, nic]) => ({
        node: `${f.original.deploymentName}-${node}`,
        role: f.original.nics[Number(index)].role,
        mac: nic.mac,
        device: `eth${index}`,
      })),
    ),
  };
  const outcomes = new Map<string, Record<string, unknown>>([
    [
      f.original.planSha256,
      {
        planId: f.original.planId,
        planSha256: f.original.planSha256,
        engine: 'terraform',
        status: 'registered',
        ...(f.original.routing.mode === 'route-server' ? { routing: 'healthy' } : {}),
        // Modeled prior creation outcome only; not installed/live traffic provenance.
        ...(f.original.intent.ingress?.mode === 'platform-http'
          ? {
              traffic: {
                status: 'healthy',
                expectedStatus: f.original.intent.ingress.probe.expectedStatus,
                bodySha256: f.original.intent.ingress.probe.expectedBodySha256,
              },
              terraformNoChanges: true,
            }
          : {}),
        configuration: { ...hardware, status: 'configured', siteUid: site.siteUid },
        registrations,
      },
    ],
  ]);
  const records = new Map<string, unknown>([
    [
      'terraform-workflow.json',
      {
        schemaVersion: 1,
        engine: 'terraform',
        planSha256: f.original.planSha256,
        configurationSha256: f.hash(renderAzureTerraformFoundation(f.original, bootstrapByNode)),
        bootstrapByNode,
        launchedAtByNode: Object.fromEntries(f.nodes.map((_, i) => [String(i + 1), '2020-01-01T00:00:00Z'])),
        stage: 'registered',
      },
    ],
    [
      'terraform-site.json',
      { owner, siteName: f.original.siteName, uid: site.siteUid, contractFingerprint: `sha256:${'b'.repeat(64)}` },
    ],
  ]);
  if (h) {
    for (const [name, value] of h.records) {
      if (name.startsWith(h.third.plan.planId)) continue;
      const record = structuredClone(value) as Record<string, unknown>;
      if (record.providerLockSha256) record.providerLockSha256 = lock;
      if (record.receipt) (record.receipt as Record<string, unknown>).providerLockSha256 = lock;
      records.set(name, record);
    }
    for (const g of [h.first, h.second])
      outcomes.set(g.plan.planSha256, {
        planId: g.plan.planId,
        planSha256: g.plan.planSha256,
        engine: 'terraform',
        status: 'complete',
        configuration: { ...hardware, status: 'configured', siteUid: site.siteUid },
        health: { status: 'healthy' },
        replacedNode: g.checkpoint.node,
        oldVmId: g.checkpoint.oldVmIds[`${g.plan.deploymentName}-${g.checkpoint.node}`],
        newVmId: g.checkpoint.newVmId,
        siteUid: site.siteUid,
        terraformNoChanges: true,
      });
  }
  const outputs = {
    ce_instances: Object.fromEntries(
      f.nodes.map((node, i) => [
        String(i + 1),
        {
          id: before.nodes[String(i + 1)].resourceId,
          vm_id: before.nodes[String(i + 1)].vmId,
          site_name: f.original.siteName,
          hostname: node,
        },
      ]),
    ),
    ce_interfaces: Object.fromEntries(
      Object.entries(before.nodes).flatMap(([node, vm]) =>
        Object.entries(vm.nics).map(([index, nic]) => [
          `${node}:${index}`,
          {
            id: nic.resourceId,
            node: Number(node),
            index: Number(index),
            role: f.plan.nics[Number(index)].role,
            site_name: f.plan.siteName,
            subnet_id: nic.subnetId,
          },
        ]),
      ),
    ),
  };
  let reads = 0;
  const store = {
    owner,
    verify: async () => {},
    read: async (name: string) => {
      reads++;
      if (!records.has(name)) throw Object.assign(Error('missing'), { code: 'ENOENT' });
      return structuredClone(records.get(name));
    },
  };
  const sources = h?.sources ?? new Map([[f.original.planSha256, f.original]]);
  const run = (retainedSource = source) =>
    qualifyAzureTerraformNetworkUpdateSource(
      f.plan,
      retainedSource,
      before,
      store,
      async (digest) => {
        const p = sources.get(digest);
        if (!p) throw Error('missing source');
        return p;
      },
      async (p) => {
        const o = outcomes.get(p.planSha256);
        if (!o) throw Error('missing outcome');
        return structuredClone(o);
      },
      lock,
      site,
    );
  return {
    ...f,
    before,
    source,
    siteConfiguration,
    site,
    lock,
    h,
    outputs,
    sources,
    outcomes,
    records,
    store,
    run,
    reads: () => reads,
  };
}
