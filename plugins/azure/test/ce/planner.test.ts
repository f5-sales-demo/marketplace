import { describe, expect, it } from 'bun:test';
import { compileAzureCePlan } from '../../src/ce/planner';
import type { AzureCeIntent, AzureCeObservation } from '../../src/ce/types';

const subscriptionId = '11111111-1111-4111-8111-111111111111';
const f5Source = 'https://docs.cloud.f5.com/example';
const microsoftSource = 'https://learn.microsoft.com/example';
const sharedContractUrl = 'https://f5-sales-demo.github.io/mcn/_llms-txt/en/customer-edge/automation-contract.txt';

function observation(overrides: Partial<AzureCeObservation> = {}): AzureCeObservation {
  return {
    schemaVersion: 2,
    subscription: { id: subscriptionId, cloud: 'AzureCloud', tenantId: '22222222-2222-4222-8222-222222222222' },
    image: {
      publisher: 'f5-networks',
      offer: 'f5xc-customer-edge',
      plan: 'f5xc-ce',
      version: '2026.08.15',
      urn: 'f5-networks:f5xc-customer-edge:f5xc-ce:2026.08.15',
      termsAccepted: true,
    },
    regions: [
      {
        name: 'canadacentral',
        rank: 1,
        eligible: true,
        reasons: [],
        zones: ['1', '2', '3'],
        routeServerSupported: true,
        quotaAvailable: 24,
        policyAllowed: true,
        vmSizes: [
          { name: 'Standard_D8s_v5', maxNics: 8, vCpus: 8, memoryGb: 32, zones: ['1', '2', '3'], restricted: false },
        ],
      },
    ],
    resources: [],
    research: {
      method: 'azure-cli-live',
      officialSourceRetrieval: 'live',
      catalogRegion: 'canadacentral',
      commands: [
        'az vm image list-publishers',
        'az vm image list-offers',
        'az vm image list-skus',
        'az vm image list',
        'az vm image terms show',
        'az vm list-skus --all',
      ],
      officialSources: [f5Source, microsoftSource],
      sourceReceipts: [
        { url: f5Source, normalizedSha256: '1'.repeat(64) },
        { url: microsoftSource, normalizedSha256: '2'.repeat(64) },
        { url: sharedContractUrl, normalizedSha256: '3'.repeat(64) },
      ],
      sharedContract: {
        url: sharedContractUrl,
        contractId: 'f5xc-ce-automation',
        contractVersion: 'v1',
        normalizedSha256: '3'.repeat(64),
      },
    },
    ...overrides,
  };
}

function intent(overrides: Partial<AzureCeIntent> = {}): AzureCeIntent {
  return {
    schemaVersion: 2,
    operation: 'deploy',
    subscriptionId,
    deploymentName: 'ce-demo',
    siteName: 'ce-demo',
    namespace: 'system',
    resourceGroup: 'rg-ce-demo',
    region: 'canadacentral',
    topology: { ha: false },
    nics: [
      {
        name: 'slo',
        role: 'slo',
        subnet: { mode: 'greenfield', cidr: '10.20.0.0/24', name: 'slo-subnet' },
      },
      {
        name: 'sli',
        role: 'sli',
        subnet: { mode: 'greenfield', cidr: '10.20.1.0/24', name: 'sli-subnet' },
      },
    ],
    egress: { mode: 'public-ip' },
    routing: { mode: 'auto', destinationCidrs: ['10.30.0.0/16'] },
    securityRules: [],
    image: { publisher: 'f5-networks', offer: 'f5xc-customer-edge', plan: 'f5xc-ce' },
    vm: { size: 'Standard_D8s_v5' },
    brownfield: { resourceIds: [], routeChanges: [] },
    ...overrides,
  };
}

function nics(count: number): AzureCeIntent['nics'] {
  return Array.from({ length: count }, (_, index) => ({
    name: index === 0 ? 'slo' : index === 1 ? 'sli' : `data-${index}`,
    role: index === 0 ? ('slo' as const) : index === 1 ? ('sli' as const) : ('data' as const),
    vrf: `vrf-${index}`,
    subnet: { mode: 'greenfield' as const, cidr: `10.20.${index}.0/24`, name: `subnet-${index}` },
  }));
}

describe('compileAzureCePlan', () => {
  it('is byte-identical for identical normalized intent and observations', () => {
    const first = compileAzureCePlan(intent(), observation());
    const second = compileAzureCePlan(intent(), observation());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.planSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.planId).toBe(`azure-ce-${first.planSha256.slice(0, 24)}`);
    expect(first.actions.map((action) => action.id)).toEqual(second.actions.map((action) => action.id));
  });

  it('pins the exact observed image and never latest', () => {
    const plan = compileAzureCePlan(intent(), observation());
    expect(plan.image.version).toBe('2026.08.15');
    expect(plan.image.version).not.toBe('latest');
    expect(JSON.stringify(plan)).not.toContain('bootstrapToken');
  });

  it('rejects planning from an artifact without the complete live research receipt', () => {
    const missing = observation();
    missing.research.commands = missing.research.commands.filter((command) => command !== 'az vm image list-offers');
    expect(() => compileAzureCePlan(intent(), missing)).toThrow(/research receipt/i);
  });

  it('rejects version-1 intent and an invalid shared-contract receipt', () => {
    expect(() =>
      compileAzureCePlan({ ...intent(), schemaVersion: 1 } as unknown as AzureCeIntent, observation()),
    ).toThrow(/schema version 1/i);
    const invalid = observation();
    invalid.research.sharedContract.contractVersion = 'v2' as 'v1';
    expect(() => compileAzureCePlan(intent(), invalid)).toThrow(/shared.*contract/i);
  });

  it('uses one node and UDR routing for non-HA', () => {
    const plan = compileAzureCePlan(intent(), observation());
    expect(plan.topology.nodeCount).toBe(1);
    expect(plan.routing.mode).toBe('udr');
    expect(plan.actions.some((action) => action.kind === 'route-create')).toBe(true);
  });

  for (const count of [1, 2, 4, 8]) {
    it(`supports ${count} ordered NIC request(s) when the observed limit permits it`, () => {
      const plan = compileAzureCePlan(intent({ nics: nics(count) }), observation());
      expect(plan.nics).toHaveLength(count);
      expect(plan.nics.map((nic) => nic.index)).toEqual(Array.from({ length: count }, (_, index) => index));
    });
  }

  it('attaches the public IP to NIC 0 and emits only explicitly requested NSG rules', () => {
    const plan = compileAzureCePlan(
      intent({
        securityRules: [
          {
            name: 'platform-egress',
            purpose: 'platform-connectivity',
            direction: 'Outbound',
            protocol: 'Tcp',
            sourceCidrs: ['10.20.0.0/24'],
            destinationCidrs: ['203.0.113.0/24'],
            destinationPorts: ['443'],
          },
        ],
      }),
      observation(),
    );
    const nic0 = plan.actions.find((action) => action.kind === 'nic-create' && action.node === 1);
    expect(nic0?.args).toContain('--public-ip-address');
    expect(plan.actions.filter((action) => action.kind === 'nsg-rule-create')).toHaveLength(1);
    expect(JSON.stringify(plan.actions)).not.toContain('0.0.0.0/0');
  });

  for (const mode of ['nat-gateway', 'firewall', 'proxy'] as const) {
    it(`supports explicitly selected ${mode} egress without creating public IPs`, () => {
      const egressId = `/subscriptions/${subscriptionId}/resourceGroups/rg-net/providers/Microsoft.Network/${mode === 'nat-gateway' ? 'natGateways' : mode === 'firewall' ? 'azureFirewalls' : 'virtualAppliances'}/egress`;
      const plan = compileAzureCePlan(
        intent({
          egress: { mode, resourceId: egressId },
          brownfield: { resourceIds: [egressId], routeChanges: [] },
        }),
        observation({ resources: [{ id: egressId, exists: true, owned: false, tags: {}, state: {} }] }),
      );
      expect(plan.egress.mode).toBe(mode);
      expect(plan.actions.some((action) => action.kind === 'public-ip-create')).toBe(false);
      expect(
        plan.ownershipInventory.find((item) => item.resourceId.toLowerCase() === egressId.toLowerCase())?.owned,
      ).toBe(false);
    });
  }

  it('uses three symmetric nodes and Route Server/BGP for eligible greenfield HA', () => {
    const plan = compileAzureCePlan(intent({ topology: { ha: true } }), observation());
    expect(plan.topology.nodeCount).toBe(3);
    expect(plan.topology.zones).toEqual(['1', '2', '3']);
    expect(plan.routing.mode).toBe('route-server');
    expect(plan.actions.filter((action) => action.kind === 'vm-create')).toHaveLength(3);
    expect(plan.actions.filter((action) => action.kind === 'route-server-peer-create')).toHaveLength(3);
    const vnet = plan.actions.find((action) => action.kind === 'vnet-create');
    const routeServerSubnet = plan.actions.find((action) => action.description.includes('RouteServerSubnet'));
    expect(vnet?.args).toContain('10.255.0.0/26');
    expect(routeServerSubnet?.args).toContain('10.255.0.0/26');
    expect(plan.actions.find((action) => action.kind === 'route-server-create')?.args?.join(' ')).toContain(
      '/subnets/RouteServerSubnet',
    );
  });

  it('uses an explicitly selected brownfield resource group without adopting it', () => {
    const groupId = `/subscriptions/${subscriptionId}/resourceGroups/rg-ce-demo`;
    const plan = compileAzureCePlan(
      intent({ brownfield: { resourceIds: [groupId], routeChanges: [] } }),
      observation({
        resources: [
          { id: groupId.toLowerCase(), location: 'canadacentral', exists: true, owned: false, tags: {}, state: {} },
        ],
      }),
    );
    expect(plan.actions.some((action) => action.kind === 'resource-group-create')).toBe(false);
    expect(plan.ownershipInventory.find((item) => item.resourceId.toLowerCase() === groupId.toLowerCase())?.owned).toBe(
      false,
    );
  });

  it('rejects an unapproved pre-existing resource group', () => {
    const groupId = `/subscriptions/${subscriptionId}/resourceGroups/rg-ce-demo`;
    expect(() =>
      compileAzureCePlan(
        intent(),
        observation({
          resources: [{ id: groupId.toLowerCase(), exists: true, owned: false, tags: {}, state: {} }],
        }),
      ),
    ).toThrow(/resource group.*brownfield/i);
  });

  it('omits zone arguments when the eligible size is regional', () => {
    const regional = observation({
      regions: [
        {
          name: 'canadacentral',
          rank: 1,
          eligible: true,
          reasons: [],
          zones: [],
          routeServerSupported: true,
          quotaAvailable: 24,
          policyAllowed: true,
          vmSizes: [{ name: 'Standard_D8s_v5', maxNics: 8, vCpus: 8, memoryGb: 32, zones: [], restricted: false }],
        },
      ],
    });
    const plan = compileAzureCePlan(intent(), regional);
    expect(plan.topology.zones).toEqual([]);
    expect(plan.actions.find((action) => action.kind === 'vm-create')?.args).not.toContain('--zone');
    expect(plan.actions.find((action) => action.kind === 'public-ip-create')?.args).not.toContain('--zone');
  });

  it('passes ordered NIC names in one Azure CLI argument group', () => {
    const plan = compileAzureCePlan(intent({ nics: nics(4) }), observation());
    const args = plan.actions.find((action) => action.kind === 'vm-create')?.args ?? [];
    expect(args.filter((arg) => arg === '--nics')).toHaveLength(1);
    expect(args.slice(args.indexOf('--nics') + 1, args.indexOf('--plan-name'))).toEqual([
      'ce-demo-1-nic0',
      'ce-demo-1-nic1',
      'ce-demo-1-nic2',
      'ce-demo-1-nic3',
    ]);
    expect(args.slice(args.indexOf('--os-disk-size-gb'), args.indexOf('--os-disk-size-gb') + 2)).toEqual([
      '--os-disk-size-gb',
      '80',
    ]);
  });

  it('chooses a deterministic non-overlapping RouteServerSubnet /26', () => {
    const plan = compileAzureCePlan(
      intent({
        topology: { ha: true },
        nics: [
          { name: 'slo', role: 'slo', subnet: { mode: 'greenfield', cidr: '10.255.0.0/26', name: 'slo-subnet' } },
          { name: 'sli', role: 'sli', subnet: { mode: 'greenfield', cidr: '10.20.1.0/24', name: 'sli-subnet' } },
        ],
      }),
      observation(),
    );
    expect(plan.actions.find((action) => action.description.includes('RouteServerSubnet'))?.args).toContain(
      '10.255.0.64/26',
    );
  });

  it('rejects wrong NIC ordering and duplicate subnets', () => {
    expect(() =>
      compileAzureCePlan(
        intent({
          nics: [
            { name: 'sli', role: 'sli', subnet: { mode: 'greenfield', cidr: '10.20.0.0/24', name: 'a' } },
            { name: 'slo', role: 'slo', subnet: { mode: 'greenfield', cidr: '10.20.0.0/24', name: 'b' } },
          ],
        }),
        observation(),
      ),
    ).toThrow();
  });

  it('rejects VM sizes whose observed NIC limit is too small', () => {
    expect(() =>
      compileAzureCePlan(
        intent(),
        observation({
          regions: [
            {
              name: 'canadacentral',
              rank: 1,
              eligible: true,
              reasons: [],
              zones: ['1'],
              routeServerSupported: true,
              quotaAvailable: 24,
              policyAllowed: true,
              vmSizes: [
                { name: 'Standard_D8s_v5', maxNics: 1, vCpus: 8, memoryGb: 32, zones: ['1'], restricted: false },
              ],
            },
          ],
        }),
      ),
    ).toThrow(/NIC/);
  });

  it('rejects VM sizes below the observed CE CPU or memory minimum', () => {
    const small = observation();
    small.regions[0].vmSizes[0] = { ...small.regions[0].vmSizes[0], vCpus: 4, memoryGb: 16 };
    expect(() => compileAzureCePlan(intent(), small)).toThrow(/8 vCPUs.*32 GB/i);
  });

  it('rejects cross-subscription brownfield resource IDs', () => {
    expect(() =>
      compileAzureCePlan(
        intent({
          brownfield: {
            resourceIds: [
              '/subscriptions/33333333-3333-4333-8333-333333333333/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/vnet',
            ],
            routeChanges: [],
          },
        }),
        observation(),
      ),
    ).toThrow(/subscription/i);
  });

  it('rejects command-injection names and control characters before action generation', () => {
    expect(() => compileAzureCePlan(intent({ deploymentName: 'ce;delete' }), observation())).toThrow(/characters/i);
    expect(() =>
      compileAzureCePlan(
        intent({ routing: { mode: 'auto', destinationCidrs: ['10.30.0.0/16\u0000'] } }),
        observation(),
      ),
    ).toThrow(/control/i);
    expect(() =>
      compileAzureCePlan(
        intent({
          securityRules: [
            {
              name: 'bad',
              purpose: 'management',
              direction: 'Inbound',
              protocol: 'Tcp',
              sourceCidrs: ['0.0.0.0/0;whoami'],
              destinationCidrs: ['10.20.0.0/24'],
              destinationPorts: ['22'],
            },
          ],
        }),
        observation(),
      ),
    ).toThrow(/CIDR/i);
  });

  it('captures exact brownfield route restoration and never adopts the resource', () => {
    const routeTableId = `/subscriptions/${subscriptionId}/resourceGroups/rg-net/providers/Microsoft.Network/routeTables/app-rt`;
    const subnetId = `/subscriptions/${subscriptionId}/resourceGroups/rg-net/providers/Microsoft.Network/virtualNetworks/app/subnets/workload`;
    const plan = compileAzureCePlan(
      intent({
        brownfield: {
          resourceIds: [routeTableId, subnetId],
          routeChanges: [
            {
              routeTableId,
              subnetId,
              routeName: 'to-ce',
              destinationCidr: '10.30.0.0/16',
            },
          ],
        },
      }),
      observation({
        resources: [
          { id: routeTableId, etag: 'W/"1"', exists: true, owned: false, tags: {}, state: { routes: [] } },
          {
            id: subnetId,
            etag: 'W/"2"',
            exists: true,
            owned: false,
            tags: {},
            state: { routeTable: null, networkSecurityGroup: null },
          },
        ],
      }),
    );
    expect(
      plan.ownershipInventory.find((entry) => entry.resourceId.toLowerCase() === routeTableId.toLowerCase())?.owned,
    ).toBe(false);
    expect(plan.rollback.brownfieldRoutes[0].before).toEqual({ routes: [] });
    expect(
      plan.actions.some(
        (action) =>
          action.kind === 'route-association-update' && action.resourceId?.toLowerCase() === subnetId.toLowerCase(),
      ),
    ).toBe(true);
  });

  it('adds Marketplace terms as a separate first action when terms are not accepted', () => {
    const plan = compileAzureCePlan(intent(), observation({ image: { ...observation().image, termsAccepted: false } }));
    expect(plan.actions[0].kind).toBe('marketplace-terms-accept');
  });

  it('never emits deletion for an unmanaged resource during teardown', () => {
    const unmanagedId = `/subscriptions/${subscriptionId}/resourceGroups/rg-net/providers/Microsoft.Network/virtualNetworks/shared`;
    const ownedId = `/subscriptions/${subscriptionId}/resourceGroups/rg-ce-demo/providers/Microsoft.Compute/virtualMachines/ce-demo-1`;
    const plan = compileAzureCePlan(
      intent({ operation: 'teardown' }),
      observation({
        resources: [
          { id: unmanagedId, exists: true, owned: false, tags: {}, state: {} },
          {
            id: ownedId,
            exists: true,
            owned: true,
            tags: { 'xcsh-managed-by': 'azure-ce', 'xcsh-deployment-id': 'ce-demo' },
            state: {},
          },
        ],
      }),
    );
    const deletions = plan.actions
      .filter((action) => action.destructive)
      .map((action) => action.resourceId?.toLowerCase());
    expect(deletions).toContain(ownedId.toLowerCase());
    expect(deletions).not.toContain(unmanagedId.toLowerCase());
    expect(plan.actions.some((action) => action.args?.includes('group') && action.args?.includes('delete'))).toBe(
      false,
    );
  });

  it('deletes an owned resource group last after dependency-ordered resources', () => {
    const groupId = `/subscriptions/${subscriptionId}/resourceGroups/rg-ce-demo`;
    const vmId = `${groupId}/providers/Microsoft.Compute/virtualMachines/ce-demo-1`;
    const vnetId = `${groupId}/providers/Microsoft.Network/virtualNetworks/ce-demo-vnet`;
    const tags = { 'xcsh-managed-by': 'azure-ce', 'xcsh-deployment-id': 'ce-demo' };
    const plan = compileAzureCePlan(
      intent({ operation: 'teardown' }),
      observation({
        resources: [
          { id: groupId.toLowerCase(), exists: true, owned: true, tags, state: {} },
          { id: vnetId.toLowerCase(), exists: true, owned: true, tags, state: {} },
          { id: vmId.toLowerCase(), exists: true, owned: true, tags, state: {} },
        ],
      }),
    );
    const deletes = plan.actions.filter((action) => action.kind === 'resource-delete');
    expect(deletes.map((action) => action.resourceId)).toEqual([
      vmId.toLowerCase(),
      vnetId.toLowerCase(),
      groupId.toLowerCase(),
    ]);
    expect(deletes.at(-1)?.args?.slice(0, 2)).toEqual(['group', 'delete']);
  });
});
