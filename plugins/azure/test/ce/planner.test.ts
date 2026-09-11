import { describe, expect, it } from 'bun:test';
import { compileAzureCePlan } from '../../src/ce/planner';
import type { AzureCeIntent, AzureCeObservation } from '../../src/ce/types';

const subscriptionId = ['11111111', '1111', '4111', '8111', '111111111111'].join('-');
const tenantId = ['22222222', '2222', '4222', '8222', '222222222222'].join('-');
const foreignSubscriptionId = ['33333333', '3333', '4333', '8333', '333333333333'].join('-');
const f5Source = 'https://docs.cloud.f5.com/example';
const microsoftSource = 'https://learn.microsoft.com/example';
const sharedContractUrl = 'https://f5-sales-demo.github.io/mcn/_llms-txt/en/customer-edge/automation-contract.txt';

function observation(overrides: Partial<AzureCeObservation> = {}): AzureCeObservation {
  return {
    schemaVersion: 3,
    subscription: { id: subscriptionId, cloud: 'AzureCloud', tenantId },
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
        contractId: 'f5xc-ce-automation-policy',
        contractVersion: 'v2',
        normalizedSha256: '3'.repeat(64),
      },
    },
    ...overrides,
  };
}

function intent(overrides: Partial<AzureCeIntent> = {}): AzureCeIntent {
  return {
    schemaVersion: 3,
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
  for (const engine of ['native', 'terraform'] as const) {
    for (const cidr of ['999.20.0.0/24', '10.20.0.0/33', '10.20.0.0/999', 'abcd/64', '2001:::1/64', '2001:db8::/129']) {
      it(`rejects invalid addressing ${cidr} before producing a ${engine} plan`, () => {
        const invalidSubnet = intent({ engine });
        invalidSubnet.nics[0].subnet.cidr = cidr;
        expect(() => compileAzureCePlan(invalidSubnet, observation())).toThrow(/CIDR/i);
        const invalidRoute = intent({ engine });
        invalidRoute.routing.destinationCidrs = [cidr];
        expect(() => compileAzureCePlan(invalidRoute, observation())).toThrow(/CIDR/i);
        const invalidRule = intent({ engine });
        invalidRule.securityRules = [
          {
            name: 'application',
            purpose: 'application-vip',
            direction: 'Inbound',
            protocol: 'Tcp',
            sourceCidrs: [cidr],
            destinationCidrs: ['10.20.1.0/24'],
            destinationPorts: ['80'],
          },
        ];
        expect(() => compileAzureCePlan(invalidRule, observation())).toThrow(/CIDR/i);
      });
    }
    it(`preserves valid IPv4 and IPv6 route prefixes in a ${engine} plan`, () => {
      const valid = intent({ engine });
      valid.routing.destinationCidrs = ['0.0.0.0/0', '10.30.0.1/32', '::/0', '2001:db8::/64', '2001:db8::1/128'];
      const plan = compileAzureCePlan(valid, observation());
      expect(plan.routing.destinationCidrs).toEqual([...valid.routing.destinationCidrs].sort());
    });
  }

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
    invalid.research.sharedContract.contractVersion = 'v1' as 'v2';
    expect(() => compileAzureCePlan(intent(), invalid)).toThrow(/shared.*contract/i);
  });

  it('uses one node and UDR routing for non-HA', () => {
    const plan = compileAzureCePlan(intent(), observation());
    expect(plan.topology.nodeCount).toBe(1);
    expect(plan.routing.mode).toBe('udr');
    expect(plan.actions.some((action) => action.kind === 'route-create')).toBe(true);
    expect(plan.actions.some((action) => action.kind === 'traffic-gate')).toBe(false);
  });

  it('plans reviewed platform HTTP ingress and content-bound traffic only for an allowlisted source VM', () => {
    const sourceVmResourceId =
      `/subscriptions/${subscriptionId}/resourceGroups/rg-app/providers/Microsoft.Compute/virtualMachines/probe`.toLowerCase();
    const selected = intent({
      ingress: {
        mode: 'platform-http',
        port: 8080,
        listener: {
          name: 'ce-listener',
          namespace: 'system',
          domain: 'ce.example.invalid',
          privateAddress: '10.20.1.10',
          originPool: { name: 'ce-origin', namespace: 'system' },
        },
        probe: {
          sourceVmResourceId: sourceVmResourceId.toUpperCase(),
          path: '/healthz',
          expectedStatus: 200,
          expectedBodySha256: '4'.repeat(64),
        },
      },
      brownfield: { resourceIds: [sourceVmResourceId], routeChanges: [] },
    });
    const plan = compileAzureCePlan(
      selected,
      observation({
        resources: [{ id: sourceVmResourceId, exists: true, owned: false, tags: {}, state: {} }],
      }),
    );
    expect(plan.intent.ingress?.mode).toBe('platform-http');
    if (plan.intent.ingress?.mode !== 'platform-http') throw new Error('missing ingress');
    expect(plan.intent.ingress.probe.sourceVmResourceId).toBe(sourceVmResourceId);
    expect(plan.ownershipInventory).toContainEqual({
      resourceId: sourceVmResourceId,
      owned: false,
      action: 'modify-approved',
    });
    expect(plan.actions.slice(-2).map((action) => action.kind)).toEqual(['f5-ingress-configure', 'traffic-gate']);
  });

  it('rejects malformed, unallowlisted, or reserved platform HTTP ingress identities', () => {
    const sourceVmResourceId =
      `/subscriptions/${subscriptionId}/resourceGroups/rg-app/providers/Microsoft.Compute/virtualMachines/probe`.toLowerCase();
    const selected = intent({
      ingress: {
        mode: 'platform-http',
        port: 8080,
        listener: {
          name: 'ce-listener',
          namespace: 'system',
          domain: 'ce.example.invalid',
          privateAddress: '10.20.1.10',
          originPool: { name: 'ce-origin', namespace: 'system' },
        },
        probe: {
          sourceVmResourceId,
          path: '/healthz',
          expectedStatus: 200,
          expectedBodySha256: '4'.repeat(64),
        },
      },
    });
    expect(() => compileAzureCePlan(selected, observation())).toThrow(/brownfield.resourceIds/i);

    selected.brownfield.resourceIds = [sourceVmResourceId];
    if (selected.ingress?.mode !== 'platform-http') throw new Error('missing ingress');
    selected.ingress.listener.privateAddress = '10.20.1.3';
    expect(() =>
      compileAzureCePlan(
        selected,
        observation({
          resources: [{ id: sourceVmResourceId, exists: true, owned: false, tags: {}, state: {} }],
        }),
      ),
    ).toThrow(/SLI service address/i);
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
    for (const action of plan.actions.filter((action) => action.kind === 'route-server-peer-create')) {
      expect(action.args).toContain(`__NODE_${action.node}_SLO_PRIVATE_IP__`);
      expect(action.args).not.toContain(`__NODE_${action.node}_SLI_PRIVATE_IP__`);
    }
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
              `/subscriptions/${foreignSubscriptionId}/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/vnet`,
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

  it('requires human Marketplace acceptance before emitting a deploy plan', () => {
    expect(() =>
      compileAzureCePlan(intent(), observation({ image: { ...observation().image, termsAccepted: false } })),
    ).toThrow('completed by a human');
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
            tags: { 'xcsh-managed-by': 'azure-ce', 'xcsh-execution-engine': 'native', 'xcsh-deployment-id': 'ce-demo' },
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

  it('verifies lifecycle VM state serially and only gates platform health for online nodes', () => {
    const actionKinds = (operation: 'start' | 'stop' | 'resize', ha: boolean) => {
      const selected = intent({ operation, topology: { ha } });
      const ownerPlanSha256 = 'a'.repeat(64);
      const resources = Array.from({ length: ha ? 3 : 1 }, (_, index) => ({
        id: `/subscriptions/${subscriptionId}/resourceGroups/${selected.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${selected.deploymentName}-${index + 1}`,
        location: selected.region,
        exists: true,
        owned: true,
        state: {},
        tags: {
          'xcsh-managed-by': 'azure-ce',
          'xcsh-deployment-id': selected.deploymentName,
          'xcsh-execution-engine': 'native',
          'xcsh-plan-sha256': ownerPlanSha256,
        },
      }));
      return compileAzureCePlan(selected, observation({ resources })).actions.map((action) => ({
        kind: action.kind,
        node: action.node,
        expectedPowerState: action.expectedPowerState,
        expectedOwnerPlanSha256: action.expectedOwnerPlanSha256,
      }));
    };

    expect(actionKinds('stop', false)).toEqual([
      { kind: 'vm-stop', node: 1, expectedPowerState: undefined, expectedOwnerPlanSha256: 'a'.repeat(64) },
      { kind: 'vm-state-gate', node: 1, expectedPowerState: 'deallocated', expectedOwnerPlanSha256: 'a'.repeat(64) },
    ]);
    for (const operation of ['start', 'resize'] as const)
      expect(actionKinds(operation, false)).toEqual([
        {
          kind: operation === 'start' ? 'vm-start' : 'vm-resize',
          node: 1,
          expectedPowerState: undefined,
          expectedOwnerPlanSha256: 'a'.repeat(64),
        },
        { kind: 'vm-state-gate', node: 1, expectedPowerState: 'running', expectedOwnerPlanSha256: 'a'.repeat(64) },
        { kind: 'health-gate', node: 1, expectedPowerState: undefined, expectedOwnerPlanSha256: undefined },
      ]);
    expect(actionKinds('start', true)).toEqual(
      [1, 2, 3].flatMap((node) => [
        { kind: 'vm-start', node, expectedPowerState: undefined, expectedOwnerPlanSha256: 'a'.repeat(64) },
        { kind: 'vm-state-gate', node, expectedPowerState: 'running', expectedOwnerPlanSha256: 'a'.repeat(64) },
        { kind: 'health-gate', node, expectedPowerState: undefined, expectedOwnerPlanSha256: undefined },
      ]),
    );
  });

  it('rejects lifecycle planning without exact observed VM ownership', () => {
    expect(() => compileAzureCePlan(intent({ operation: 'start' }), observation())).toThrow(
      /missing exact observed ownership/,
    );
  });

  it('rebinds each retained Route Server peer and proves convergence after a Route Server network update', () => {
    const selected = intent({
      operation: 'update-network',
      routing: { mode: 'route-server', destinationCidrs: ['10.30.0.0/16'], localAsn: 64512 },
    });
    const owner = 'a'.repeat(64);
    const resources: AzureCeObservation['resources'] = [
      {
        id: `/subscriptions/${subscriptionId}/resourceGroups/${selected.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${selected.deploymentName}-1`,
        location: selected.region,
        exists: true,
        owned: true,
        state: {},
        tags: {
          'xcsh-managed-by': 'azure-ce',
          'xcsh-deployment-id': selected.deploymentName,
          'xcsh-execution-engine': 'native',
          'xcsh-plan-sha256': owner,
        },
      },
      ...selected.nics.map((_nic, index) => ({
        id: `/subscriptions/${subscriptionId}/resourceGroups/${selected.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${selected.deploymentName}-1-nic${index}`,
        location: selected.region,
        exists: true,
        owned: true,
        state: {},
        tags: {
          'xcsh-managed-by': 'azure-ce',
          'xcsh-deployment-id': selected.deploymentName,
          'xcsh-execution-engine': 'native',
          'xcsh-plan-sha256': owner,
        },
      })),
      {
        id: `/subscriptions/${subscriptionId}/resourceGroups/${selected.resourceGroup}/providers/Microsoft.Network/virtualHubs/${selected.deploymentName}-rs`,
        location: selected.region,
        exists: true,
        owned: true,
        state: {},
        tags: {
          'xcsh-managed-by': 'azure-ce',
          'xcsh-deployment-id': selected.deploymentName,
          'xcsh-execution-engine': 'native',
          'xcsh-plan-sha256': owner,
        },
      },
    ];
    const plan = compileAzureCePlan(selected, observation({ resources }));
    const peerUpdates = plan.actions.filter((action) => action.kind === 'route-server-peer-update');
    expect(peerUpdates).toHaveLength(1);
    expect(peerUpdates[0]).toMatchObject({
      resourceId: `/subscriptions/${subscriptionId}/resourceGroups/${selected.resourceGroup}/providers/Microsoft.Network/virtualHubs/${selected.deploymentName}-rs/bgpConnections/${selected.deploymentName}-1`,
      expectedOwnerPlanSha256: owner,
    });
    expect(peerUpdates[0].args).toContain('__NODE_1_SLO_PRIVATE_IP__');
    expect(plan.actions.some((action) => action.kind === 'bgp-gate')).toBe(true);
  });

  it('deletes an owned resource group last after dependency-ordered resources', () => {
    const groupId = `/subscriptions/${subscriptionId}/resourceGroups/rg-ce-demo`;
    const vmId = `${groupId}/providers/Microsoft.Compute/virtualMachines/ce-demo-1`;
    const vnetId = `${groupId}/providers/Microsoft.Network/virtualNetworks/ce-demo-vnet`;
    const tags = { 'xcsh-managed-by': 'azure-ce', 'xcsh-execution-engine': 'native', 'xcsh-deployment-id': 'ce-demo' };
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

it('supports explicitly selected Route Server with a single CE and one consistent local ASN', () => {
  const plan = compileAzureCePlan(
    intent({ topology: { ha: false }, routing: { mode: 'route-server', destinationCidrs: [], localAsn: 64512 } }),
    observation(),
  );
  expect(plan.topology.nodeCount).toBe(1);
  expect(plan.routing.localAsn).toBe(64512);
  expect(plan.routing.peerAsn).toBe(64512);
  const peers = plan.actions.filter((action) => action.kind === 'route-server-peer-create');
  expect(peers).toHaveLength(1);
  expect(peers[0].args).toContain('64512');
});

it('rejects Azure-reserved, IANA-reserved, 32-bit and conflicting Route Server CE ASNs', () => {
  for (const asn of [
    8074, 8075, 12076, 23456, 64496, 64511, 65515, 65517, 65518, 65519, 65520, 65535, 65536, 4200000000,
  ]) {
    expect(() =>
      compileAzureCePlan(
        intent({ routing: { mode: 'route-server', destinationCidrs: [], localAsn: asn } }),
        observation(),
      ),
    ).toThrow('16-bit');
  }
  expect(() =>
    compileAzureCePlan(
      intent({ routing: { mode: 'route-server', destinationCidrs: [], localAsn: 64512, peerAsn: 65010 } }),
      observation(),
    ),
  ).toThrow('must match');
});

it('keeps CE interfaces out of RouteServerSubnet and rejects IPv6 VNet addressing for Route Server', () => {
  for (const subnet of [
    { name: 'RouteServerSubnet', cidr: '10.0.0.0/24' },
    { name: 'outside', cidr: '2001:db8::/64' },
  ]) {
    const input = intent({ routing: { mode: 'route-server', destinationCidrs: [] } });
    Object.assign(input.nics[0].subnet, subnet);
    expect(() => compileAzureCePlan(input, observation())).toThrow(/dedicated|IPv4/);
  }
});

it('requires the deployment URN to identify the exact observed Marketplace artifact', () => {
  for (const urn of [
    '',
    'f5-networks:f5xc-customer-edge:f5xc-ce:latest',
    'other:offer:plan:2026.08.15',
    'f5-networks:f5xc-customer-edge:f5xc-ce:2026.08.16',
  ]) {
    const observed = observation();
    observed.image.urn = urn;
    expect(() => compileAzureCePlan(intent(), observed)).toThrow('URN');
  }
  for (const version of ['', '*', '2026.08', '2026.08.15 trailing']) {
    const observed = observation();
    observed.image.version = version;
    expect(() => compileAzureCePlan(intent(), observed)).toThrow('exact Marketplace version');
  }
});

it('treats missing memory or NIC sizing evidence as unavailable', () => {
  for (const change of [
    { memoryGb: Number.NaN },
    { memoryGb: Number.POSITIVE_INFINITY },
    { maxNics: Number.NaN },
    { maxNics: 2.5 },
  ]) {
    const observed = observation();
    for (const region of observed.regions) for (const size of region.vmSizes) Object.assign(size, change);
    expect(() => compileAzureCePlan(intent(), observed)).toThrow('incomplete observed');
  }
});

for (const engine of ['native', 'terraform'] as const) {
  it(`${engine} plans the marketplace SLO/data/SLI layout without equating cloud names with XC roles`, () => {
    const selected = nics(3);
    selected[0].name = 'mgmt';
    selected[1].name = 'external';
    selected[1].role = 'data';
    selected[2].name = 'internal';
    selected[2].role = 'sli';
    const plan = compileAzureCePlan(
      intent({ engine, nics: selected, routing: { mode: 'route-server', destinationCidrs: [], localAsn: 64512 } }),
      observation(),
    );
    expect(plan.nics.map(({ index, name, role }) => ({ index, name, role }))).toEqual([
      { index: 0, name: 'mgmt', role: 'slo' },
      { index: 1, name: 'external', role: 'data' },
      { index: 2, name: 'internal', role: 'sli' },
    ]);
    const vm = plan.actions.find((action) => action.kind === 'vm-create');
    const first = vm?.args?.indexOf('--nics') ?? -1;
    expect(first).toBeGreaterThan(0);
    expect(vm?.args?.slice(first + 1, first + 4).map((value) => value.split('/').at(-1))).toEqual([
      `${plan.intent.deploymentName}-1-nic0`,
      `${plan.intent.deploymentName}-1-nic1`,
      `${plan.intent.deploymentName}-1-nic2`,
    ]);
    const peer = plan.actions.find((action) => action.kind === 'route-server-peer-create');
    expect(peer?.args).toContain('__NODE_1_SLO_PRIVATE_IP__');
    expect(peer?.args).not.toContain('__NODE_1_SLI_PRIVATE_IP__');
  });
}
it('rejects duplicate outside or inside roles before planning resources', () => {
  for (const duplicate of ['slo', 'sli'] as const) {
    const selected = nics(3);
    selected[2].role = duplicate;
    expect(() => compileAzureCePlan(intent({ nics: selected }), observation())).toThrow('roles must be unique');
  }
});
