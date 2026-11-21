import { createHash } from 'node:crypto';
import { compileAzureCePlan } from '../../src/ce/planner';
import { renderAzureTerraformFoundation } from '../../src/ce/terraform-foundation';
import type { ReplacementCheckpoint } from '../../src/ce/terraform-replacement';
import { azureTerraformReplacementStages } from '../../src/ce/terraform-replacement';
import { verifyAzureTerraformReplacementHistoricalArtifacts } from '../../src/ce/terraform-replacement-artifact-provenance';
import { verifyAzureTerraformReplacementGenerationOwners } from '../../src/ce/terraform-replacement-generations';
import type { AzureCePlan } from '../../src/ce/types';
import { intent, observation } from './fixtures';

export function fixture(ha: boolean) {
  const initial = structuredClone(intent);
  initial.engine = 'terraform';
  initial.topology.ha = ha;
  initial.routing.mode = 'udr';
  initial.nics.push({ name: 'sli', role: 'sli', subnet: { mode: 'greenfield', cidr: '10.20.1.0/24', name: 'sli' } });
  const observed = structuredClone(observation);
  observed.regions[0].quotaAvailable = 32;
  const base = compileAzureCePlan(initial, observed);
  const nodes = Array.from({ length: base.topology.nodeCount }, (_, i) => `${base.deploymentName}-${i + 1}`);
  const vmId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const resourceId = (n: number) =>
    `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${nodes[n - 1]}`;
  const sources = new Map<string, AzureCePlan>([[base.planSha256, base]]);
  const checkpoints = new Map<string, ReplacementCheckpoint>();
  const ids = Object.fromEntries(nodes.map((node, i) => [node, vmId(i + 1)]));
  const owners = Object.fromEntries(nodes.map((node) => [node, base.planSha256]));
  const retained = Object.fromEntries(
    nodes.flatMap((_, i) =>
      base.nics.map((nic) => {
        const subnet = base.actions.find(
          (a) => a.kind === 'subnet-create' && a.args?.[a.args.indexOf('--name') + 1] === nic.subnet.name,
        );
        if (!subnet) throw Error('Generation fixture subnet missing');
        return [
          `${i + 1}:${nic.index}`,
          {
            resourceId: `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${nodes[i]}-nic${nic.index}`,
            subnetId: subnet.resourceId as string,
            ownerPlanSha256: base.planSha256,
            privateIp: `10.20.${nic.index}.${i + 5}`,
            mac: `02:00:00:00:00:${(i * 2 + nic.index + 1).toString(16).padStart(2, '0')}`,
          },
        ];
      }),
    ),
  );
  const prepare = (
    node: number,
  ): { plan: AzureCePlan; checkpoint: ReplacementCheckpoint; observation: typeof observation } => {
    const obs = structuredClone(observed);
    obs.resources = nodes.map((_, i) => ({
      id: resourceId(i + 1),
      location: base.region,
      exists: true,
      owned: true,
      state: { provisioningState: 'Succeeded' },
      tags: {
        'xcsh-managed-by': 'azure-ce',
        'xcsh-execution-engine': 'terraform',
        'xcsh-deployment-id': base.deploymentName,
        'xcsh-plan-sha256': owners[nodes[i]],
      },
    }));
    const plan = compileAzureCePlan({ ...initial, operation: 'replace-node', replacementNode: node }, obs);
    sources.set(plan.planSha256, plan);
    const checkpoint: ReplacementCheckpoint = {
      schemaVersion: 1,
      engine: 'terraform',
      planSha256: plan.planSha256,
      node,
      sourceConfigurationSha256: 'a'.repeat(64),
      quiesceConfigurationSha256: 'b'.repeat(64),
      launchConfigurationSha256: 'c'.repeat(64),
      bootstrapSha256: 'd'.repeat(64),
      siteConfigurationSha256: 'e'.repeat(64),
      siteUid: 'site-uid',
      oldVmIds: structuredClone(ids),
      ownerPlanSha256ByNode: structuredClone(owners),
      retainedNics: structuredClone(retained),
      phase: 'prepared',
    };
    checkpoints.set(plan.planSha256, checkpoint);
    return { plan, checkpoint, observation: obs };
  };
  const complete = (node: number, generation: number) => {
    const g = prepare(node);
    g.checkpoint.phase = 'complete';
    g.checkpoint.newVmId = vmId(100 + generation);
    ids[nodes[node - 1]] = g.checkpoint.newVmId;
    owners[nodes[node - 1]] = g.plan.planSha256;
    return g;
  };
  const first = complete(1, 1);
  const second = complete(ha ? 2 : 1, 2);
  const third = prepare(ha ? 3 : 1);
  return {
    base,
    nodes,
    sources,
    checkpoints,
    first,
    second,
    third,
    verify: () =>
      verifyAzureTerraformReplacementGenerationOwners(third.plan, third.checkpoint, base, sources, checkpoints),
  };
}

export function historicalFixture(ha: boolean) {
  const f = fixture(ha);
  const records = new Map<string, unknown>();
  const tokens: Array<{ node: string; name: string }> = [];
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');
  const cloudInit = (jwt: string) =>
    `#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: |\n    token: ${jwt}\n`;
  const materials = new Map<string, string>();
  const token = (source: AzureCePlan, index: number) => {
    const name = `${source.deploymentName.slice(0, 40)}-${index}-${source.planSha256.slice(0, 12)}`;
    const node = f.nodes[index - 1];
    const jwt = `e30.${Buffer.from(source.planSha256).toString('base64url')}.c2lnbmF0dXJl`;
    tokens.push({ node, name });
    records.set(`${name}.json`, { jwt, node, tokenName: name, siteName: f.base.siteName });
    materials.set(`${source.planSha256}:${index}`, cloudInit(jwt));
  };
  for (let i = 1; i <= f.nodes.length; i++) token(f.base, i);
  for (const g of [f.first, f.second, f.third]) token(g.plan, g.checkpoint.node);
  for (const g of [f.first, f.second, f.third]) {
    const cp = g.checkpoint;
    const bootstrap = Object.fromEntries(
      f.nodes.map((node, i) => [String(i + 1), materials.get(`${cp.ownerPlanSha256ByNode[node]}:${i + 1}`) as string]),
    );
    const config = JSON.parse(renderAzureTerraformFoundation(f.base, bootstrap));
    for (let i = 1; i <= f.nodes.length; i++)
      config.resource.azurerm_linux_virtual_machine[`node_${i}`].tags['xcsh-plan-sha256'] =
        cp.ownerPlanSha256ByNode[f.nodes[i - 1]];
    const source = JSON.stringify(config);
    const replacement = materials.get(`${g.plan.planSha256}:${cp.node}`) as string;
    const stages = azureTerraformReplacementStages(g.plan, source, hash(source), replacement);
    cp.sourceConfigurationSha256 = hash(source);
    cp.bootstrapSha256 = hash(replacement);
    cp.quiesceConfigurationSha256 = stages.quiesce.configurationSha256;
    cp.launchConfigurationSha256 = stages.launch.configurationSha256;
    const prepared = structuredClone(cp);
    prepared.phase = 'prepared';
    delete prepared.newVmId;
    records.set(`${g.plan.planId}-terraform-replacement-plan.json`, g.plan);
    records.set(`${g.plan.planId}-terraform-replacement.json`, cp);
    records.set(`${g.plan.planId}-terraform-replacement-source.json`, {
      schemaVersion: 1,
      planSha256: g.plan.planSha256,
      source,
      bootstrap: replacement,
      preparedCheckpoint: prepared,
    });
    if (cp.phase === 'complete') {
      for (const phase of ['quiesce', 'launch'] as const) {
        const stage = stages[phase];
        const receipt = {
          schemaVersion: 1,
          deploymentId: f.base.deploymentName,
          engine: 'terraform',
          backendIdentity: `local:${f.base.deploymentName}`,
          configurationSha256: stage.configurationSha256,
          providerLockSha256: 'f'.repeat(64),
          planSha256: hash(`${g.plan.planSha256}:${phase}`),
          noChanges: false,
          changes: [
            {
              address: stage.address,
              type: 'azurerm_linux_virtual_machine',
              actions: [phase === 'quiesce' ? 'delete' : 'create'],
            },
          ],
        };
        const resourceId = `/subscriptions/${f.base.subscription.id}/resourceGroups/${f.base.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${f.nodes[cp.node - 1]}`;
        records.set(`${g.plan.planId}-terraform-${phase}-plan.json`, {
          receipt,
          identities: { [stage.address]: phase === 'quiesce' ? resourceId : null },
        });
        if (phase === 'launch')
          records.set(`${g.plan.planId}-terraform-replacement-final-plan.json`, {
            ...receipt,
            changes: [],
            noChanges: true,
          });
      }
    }
  }
  return {
    ...f,
    records,
    verifyHistory: () =>
      verifyAzureTerraformReplacementHistoricalArtifacts(
        f.base,
        [{ siteName: f.base.siteName, siteUid: 'site-uid', tokens }],
        records,
        'f'.repeat(64),
      ),
  };
}
