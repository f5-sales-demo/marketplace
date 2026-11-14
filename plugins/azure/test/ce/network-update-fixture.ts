import { createHash } from 'node:crypto';
import type { AzExecApi } from '../../src/az/exec';
import { compileAzureCePlan } from '../../src/ce/planner';
import { renderAzureTerraformFoundation } from '../../src/ce/terraform-foundation';
import type { AzureCeIntent } from '../../src/ce/types';
import { intent, observation } from './fixtures';

export function networkUpdateFixture(
  ha: boolean,
  engine: 'native' | 'terraform',
  move = true,
  fakeReplacementOwner = true,
  routing?: AzureCeIntent['routing'],
  threeNics = false,
  ingress?: AzureCeIntent['ingress'],
) {
  const initial = structuredClone(intent);
  initial.engine = engine;
  if (ingress) {
    initial.ingress = structuredClone(ingress);
    if (ingress.mode === 'platform-http')
      initial.brownfield.resourceIds.push(ingress.probe.sourceVmResourceId.toLowerCase());
  }
  initial.routing = routing ? structuredClone(routing) : { ...initial.routing, mode: 'udr' };
  initial.topology.ha = ha;
  if (threeNics)
    initial.nics.push({
      name: 'data',
      role: 'data',
      subnet: { mode: 'greenfield', name: 'data', cidr: '10.20.3.0/24' },
    });
  initial.nics.push({ name: 'sli', role: 'sli', subnet: { mode: 'greenfield', name: 'sli', cidr: '10.20.1.0/24' } });
  const observed = structuredClone(observation);
  observed.regions[0].quotaAvailable = 32;
  if (ingress?.mode === 'platform-http')
    observed.resources.push({ id: ingress.probe.sourceVmResourceId, exists: true, owned: false, tags: {}, state: {} });
  const original = compileAzureCePlan(initial, observed);
  const nodes = Array.from({ length: original.topology.nodeCount }, (_, i) => `${original.deploymentName}-${i + 1}`);
  const vnetId = `/subscriptions/${original.subscription.id}/resourceGroups/${initial.resourceGroup}/providers/Microsoft.Network/virtualNetworks/${original.deploymentName}-vnet`;
  const tags = (owner: string) => ({
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': engine,
    'xcsh-deployment-id': original.deploymentName,
    'xcsh-plan-sha256': owner,
  });
  const vmId = (node: number) =>
    `/subscriptions/${original.subscription.id}/resourceGroups/${initial.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${nodes[node - 1]}`;
  const owner = (node: number) => (ha && fakeReplacementOwner && node === 2 ? 'a'.repeat(64) : original.planSha256);
  const nics = new Map<string, Record<string, unknown>>(),
    subnets = new Map<string, Record<string, unknown>>();
  for (const nic of original.nics)
    subnets.set(`${vnetId}/subnets/${nic.subnet.name}`, {
      id: `${vnetId}/subnets/${nic.subnet.name}`,
      provisioningState: 'Succeeded',
      addressPrefix: nic.subnet.cidr,
    });
  const target = `${vnetId}/subnets/updated-sli`;
  if (move) subnets.set(target, { id: target, provisioningState: 'Succeeded', addressPrefix: '10.20.2.0/24' });
  for (let node = 1; node <= nodes.length; node++)
    for (const nic of original.nics) {
      const id = `/subscriptions/${original.subscription.id}/resourceGroups/${initial.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${nodes[node - 1]}-nic${nic.index}`;
      const sourceSubnetCidr = nic.subnet.cidr;
      if (!sourceSubnetCidr) throw Error('Synthetic NIC subnet CIDR is missing');
      const name = engine === 'terraform' ? 'primary' : 'ipconfig1';
      nics.set(id, {
        id,
        location: original.region,
        provisioningState: 'Succeeded',
        virtualMachine: { id: vmId(node) },
        macAddress: `02:00:00:00:00:${(node * original.nics.length + nic.index).toString(16).padStart(2, '0')}`,
        tags: tags(original.planSha256),
        ipConfigurations: [
          {
            id: `${id}/ipConfigurations/${name}`,
            name,
            primary: true,
            provisioningState: 'Succeeded',
            privateIPAddressVersion: 'IPv4',
            privateIPAllocationMethod: 'Dynamic',
            privateIPAddress: `${sourceSubnetCidr.split('.').slice(0, 3).join('.')}.${node + 4}`,
            subnet: { id: `${vnetId}/subnets/${nic.subnet.name}` },
          },
        ],
      });
    }
  const vms = nodes.map((name, index) => ({
    id: vmId(index + 1),
    name,
    vmId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    location: original.region,
    provisioningState: 'Succeeded',
    hardwareProfile: { vmSize: original.vm.size },
    tags: tags(owner(index + 1)),
    networkProfile: {
      networkInterfaces: original.nics.map((nic) => ({
        id: [...nics.keys()].find((id) => id.endsWith(`${name}-nic${nic.index}`)),
      })),
    },
  }));
  const vnet = {
    id: vnetId,
    location: original.region,
    provisioningState: 'Succeeded',
    tags: tags(original.planSha256),
  };
  const current = structuredClone(observed);
  current.resources = [
    ...observed.resources,
    ...[...vms, ...nics.values()].map((value) => ({
      id: value.id as string,
      exists: true,
      owned: true,
      location: original.region,
      tags: value.tags as Record<string, string>,
      state: { provisioningState: 'Succeeded' },
    })),
  ];
  if (initial.routing.mode === 'route-server')
    current.resources.push({
      id: `/subscriptions/${original.subscription.id}/resourceGroups/${initial.resourceGroup}/providers/Microsoft.Network/virtualHubs/${original.deploymentName}-rs`,
      exists: true,
      owned: true,
      location: original.region,
      tags: tags(original.planSha256),
      state: { provisioningState: 'Succeeded' },
    });
  const update = structuredClone(initial);
  update.operation = 'update-network';
  const movedInterface = update.nics.find((nic) => nic.role === (ingress?.mode === 'platform-http' ? 'slo' : 'sli'));
  if (!movedInterface) throw Error('Synthetic selected network interface is missing');
  if (move)
    movedInterface.subnet = {
      mode: 'greenfield',
      name: 'updated-sli',
      cidr: '10.20.2.0/24',
    };
  const plan = compileAzureCePlan(update, current);
  let cloudCalls = 0,
    mutations = 0;
  const state = { unavailable: false, malformed: false, wrongAccount: false };
  const api: AzExecApi = {
    exec: async (_command, args) => {
      cloudCalls++;
      if (state.unavailable) return { exitCode: 1, stderr: 'synthetic unavailable', stdout: '' };
      if (state.malformed) return { exitCode: 0, stderr: '', stdout: 'synthetic-private-marker' };
      let value: unknown;
      const id = args[args.indexOf('--ids') + 1];
      if (args[0] === 'account')
        value = {
          id: state.wrongAccount ? 'foreign' : plan.subscription.id,
          tenantId: plan.subscription.tenantId,
          environmentName: plan.subscription.cloud,
          state: 'Enabled',
        };
      else if (args[0] === 'vm' && args[1] === 'list') value = vms;
      else if (args.slice(0, 3).join(' ') === 'network nic show') value = nics.get(id);
      else if (args.slice(0, 4).join(' ') === 'network vnet subnet show') value = subnets.get(id);
      else if (args.slice(0, 3).join(' ') === 'network vnet show') value = vnet;
      else {
        mutations++;
        throw Error('unexpected fixture mutation');
      }
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
    },
  };
  const firstNic = nics.values().next().value as Record<string, unknown>;
  const sliIndex = original.nics.find((nic) => nic.role === 'sli')?.index;
  if (sliIndex === undefined) throw Error('Synthetic SLI index is missing');
  const sliNic = [...nics.values()].find((nic) => String(nic.id).endsWith(`-1-nic${sliIndex}`)) as Record<
    string,
    unknown
  >;
  const config = (nic: Record<string, unknown>) => (nic.ipConfigurations as Record<string, unknown>[])[0];
  const source = () => {
    if (engine !== 'terraform') throw Error('Terraform fixture source requires Terraform engine');
    const bootstraps = Object.fromEntries(
      nodes.map((_, i) => [
        String(i + 1),
        `#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: |\n    token: ${[{}, 'synthetic', 'signature'].map((value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')).join('.')}\n`,
      ]),
    );
    const value = JSON.parse(renderAzureTerraformFoundation(original, bootstraps));
    for (let node = 1; node <= nodes.length; node++)
      value.resource.azurerm_linux_virtual_machine[`node_${node}`].tags['xcsh-plan-sha256'] = owner(node);
    return JSON.stringify(value);
  };
  return {
    original,
    plan,
    current,
    nodes,
    vms,
    nics,
    subnets,
    vnet,
    target,
    firstNic,
    sliNic,
    config,
    state,
    api,
    source,
    cloudCalls: () => cloudCalls,
    mutations: () => mutations,
    hash: (value: string) => createHash('sha256').update(value).digest('hex'),
  };
}
