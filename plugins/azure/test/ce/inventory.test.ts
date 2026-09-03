import { describe, expect, it } from 'bun:test';
import type { AzExecApi } from '../../src/az/exec';
import {
  AZURE_CE_INVENTORY_QUERY,
  type AzureCeInventoryCollected,
  buildAzureCeInventoryEnvelope,
  collectAzureCeInventory,
  formatAzureCeInventory,
} from '../../src/ce/inventory';

const SUBSCRIPTION_ID = [8, 4, 4, 4, 12].map((length) => '1'.repeat(length)).join('-');
const NOW = new Date('2026-09-03T07:30:00.000Z');
const vmId = (group: string, name: string) =>
  `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${group}/providers/Microsoft.Compute/virtualMachines/${name}`;
const nicId = (group: string, name: string) =>
  `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${group}/providers/Microsoft.Network/networkInterfaces/${name}`;

function vm(group: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    kind: 'resource',
    id: vmId(group, name),
    name,
    type: 'microsoft.compute/virtualmachines',
    resourceGroup: group,
    location: 'canadacentral',
    provisioningState: 'Succeeded',
    imagePublisher: 'f5-networks',
    imageOffer: 'f5xc_customer_edge',
    imageSku: 'f5xc-ce-crt-20260201',
    computerName: name,
    networkInterfaceIds: [nicId(group, `${name}-management`)],
    ...overrides,
  };
}

function nic(group: string, name: string, macAddress: string, ownerVm: string) {
  return {
    kind: 'resource',
    id: nicId(group, name),
    name,
    type: 'microsoft.network/networkinterfaces',
    resourceGroup: group,
    location: 'canadacentral',
    provisioningState: 'Succeeded',
    macAddress,
    vmId: ownerVm,
    primary: true,
    subnetIds: [
      `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${group}/providers/Microsoft.Network/virtualNetworks/vnet/subnets/management`,
    ],
    publicIpResourceIds: [
      `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${group}/providers/Microsoft.Network/publicIPAddresses/pip`,
    ],
  };
}

function collected(
  rows: Record<string, unknown>[],
  runtimeByVmId: Record<string, string> = {},
): AzureCeInventoryCollected {
  return { rows, runtimeByVmId, activityByResourceGroup: {}, resourceGraphPages: 1 };
}

describe('Azure CE inventory normalization and classification', () => {
  it('detects both Marketplace families and emits only hashed MAC/network presence evidence', () => {
    const first = vm('rg-a', 'ce-a');
    const second = vm('rg-b', 'ce-b', {
      imageOffer: 'f5xc-customer-edge',
      imageSku: 'f5xc-ce',
      networkInterfaceIds: [nicId('rg-b', 'ce-b-management')],
    });
    const envelope = buildAzureCeInventoryEnvelope(
      {
        subscriptionId: SUBSCRIPTION_ID,
        caller: { userPrincipalName: 'operator@example.com' },
        platformSites: [
          {
            namespace: 'system',
            name: 'site-a',
            siteState: 'ONLINE',
            creator: 'operator@example.com',
            nodes: [{ hostname: 'ce-a', macAddresses: ['00:11:22:33:44:55'] }],
          },
        ],
      },
      collected(
        [
          first,
          nic('rg-a', 'ce-a-management', '00-11-22-33-44-55', String(first.id)),
          second,
          nic('rg-b', 'ce-b-management', '66:77:88:99:aa:bb', String(second.id)),
        ],
        { [String(first.id)]: 'running', [String(second.id)]: 'deallocated' },
      ),
      NOW,
    );
    expect(envelope.inventory.deployments.map((item) => item.classification).sort()).toEqual([
      'azure-only-stopped',
      'azure-platform-active',
    ]);
    expect(envelope.inventory.counts).toEqual({ logicalDeployments: 2, platformSites: 1, azureNodes: 2 });
    expect(envelope.inventory.deployments[0].nodes[0].nics[0].macSha256).toMatch(/^[a-f0-9]{64}$/);
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain('00:11:22:33:44:55');
    expect(serialized).not.toContain('00-11-22-33-44-55');
    expect(serialized).not.toContain('192.0.2.');
    expect(envelope.digestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps runtime, platform, routing, and traffic dimensions independent', () => {
    const node = vm('rg-state', 'ce-state');
    const envelope = buildAzureCeInventoryEnvelope(
      {
        subscriptionId: SUBSCRIPTION_ID,
        platformSites: [{ name: 'site-state', siteState: 'OFFLINE', nodes: [{ hostname: 'ce-state' }] }],
      },
      collected(
        [
          node,
          {
            kind: 'resource',
            id: `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/rg-state/providers/Microsoft.Network/virtualHubs/rs`,
            name: 'rs',
            type: 'microsoft.network/virtualhubs',
            resourceGroup: 'rg-state',
            provisioningState: 'Succeeded',
            bgpPeerStates: ['Connected'],
          },
        ],
        { [String(node.id)]: 'running' },
      ),
      NOW,
    );
    expect(envelope.inventory.deployments[0].classification).toBe('azure-platform-inactive');
    expect(envelope.inventory.deployments[0].dimensions).toEqual({
      provisioning: 'succeeded',
      runtime: 'running',
      platform: 'non-online',
      routing: 'observed',
      trafficHealth: 'not-tested',
    });
  });

  it('represents empty groups, remnants, ambiguity, unavailable evidence, and platform-only sites', () => {
    const rows = [
      {
        kind: 'resourceGroup',
        id: `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/rg-empty`,
        name: 'rg-empty',
        type: 'microsoft.resources/subscriptions/resourcegroups',
        resourceGroup: 'rg-empty',
        tags: { 'xcsh-managed-by': 'azure-ce' },
      },
      {
        kind: 'resource',
        id: `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/rg-remnant/providers/Microsoft.Compute/disks/ce-remnant`,
        name: 'ce-remnant',
        type: 'microsoft.compute/disks',
        resourceGroup: 'rg-remnant',
        provisioningState: 'Succeeded',
      },
      vm('rg-unknown', 'ce-unknown'),
    ];
    const unavailable = buildAzureCeInventoryEnvelope({ subscriptionId: SUBSCRIPTION_ID }, collected(rows), NOW);
    expect(unavailable.inventory.deployments.map((item) => item.classification).sort()).toEqual([
      'azure-platform-unknown',
      'azure-remnant',
      'empty-candidate-group',
    ]);
    const duplicate = buildAzureCeInventoryEnvelope(
      {
        subscriptionId: SUBSCRIPTION_ID,
        platformSites: [
          { name: 'one', nodes: [{ hostname: 'ce-unknown' }] },
          { name: 'two', nodes: [{ hostname: 'ce-unknown' }] },
          { name: 'orphan', siteState: 'ONLINE', nodes: [{ hostname: 'other' }] },
        ],
      },
      collected([vm('rg-unknown', 'ce-unknown')], { [vmId('rg-unknown', 'ce-unknown')]: 'running' }),
      NOW,
    );
    expect(duplicate.inventory.deployments[0].classification).toBe('ambiguous');
    expect(duplicate.inventory.platformOnly.map((site) => site.name)).toEqual(['orphan']);
  });

  it('produces byte-identical envelopes and summaries for identical fixtures', () => {
    const input = { subscriptionId: SUBSCRIPTION_ID };
    const fixture = collected([vm('rg-repeat', 'ce-repeat')], { [vmId('rg-repeat', 'ce-repeat')]: 'stopped' });
    const left = buildAzureCeInventoryEnvelope(input, fixture, NOW);
    const right = buildAzureCeInventoryEnvelope(input, structuredClone(fixture), NOW);
    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
    expect(formatAzureCeInventory(left)).toBe(formatAzureCeInventory(right));
  });

  it('classifies running and mixed Azure-only deployments independently', () => {
    const running = buildAzureCeInventoryEnvelope(
      { subscriptionId: SUBSCRIPTION_ID, platformSites: [] },
      collected([vm('rg-running', 'ce-running')], { [vmId('rg-running', 'ce-running')]: 'running' }),
      NOW,
    );
    expect(running.inventory.deployments[0].classification).toBe('azure-only-running');

    const mixed = buildAzureCeInventoryEnvelope(
      { subscriptionId: SUBSCRIPTION_ID, platformSites: [] },
      collected([vm('rg-mixed', 'ce-one'), vm('rg-mixed', 'ce-two')], {
        [vmId('rg-mixed', 'ce-one')]: 'running',
        [vmId('rg-mixed', 'ce-two')]: 'deallocated',
      }),
      NOW,
    );
    expect(mixed.inventory.deployments[0].classification).toBe('azure-only-mixed');
  });

  it('resolves duplicate hostnames with unique MAC evidence and preserves expired audit semantics', () => {
    const node = vm('rg-evidence', 'duplicate');
    const activity = {
      coverage: {
        startTime: '2026-06-06T07:30:00.000Z',
        endTime: NOW.toISOString(),
        lookbackDays: 89,
        complete: true,
        truncated: false,
      },
      scopeEvidence: {
        scope: 'rg-evidence',
        evidenceType: 'unknown' as const,
        confidence: 'none' as const,
        reasonCode: 'creation_predates_coverage',
      },
      events: [],
    };
    const envelope = buildAzureCeInventoryEnvelope(
      {
        subscriptionId: SUBSCRIPTION_ID,
        platformSites: [
          {
            name: 'matched',
            siteState: 'ONLINE',
            nodes: [{ hostname: 'duplicate', macAddresses: ['00:11:22:33:44:55'] }],
          },
          { name: 'duplicate-name', nodes: [{ hostname: 'duplicate', macAddresses: ['66:77:88:99:aa:bb'] }] },
        ],
      },
      {
        ...collected([node, nic('rg-evidence', 'duplicate-management', '00:11:22:33:44:55', String(node.id))], {
          [String(node.id)]: 'running',
        }),
        activityByResourceGroup: { 'rg-evidence': activity },
      },
      NOW,
    );
    const deployment = envelope.inventory.deployments[0];
    expect(deployment.classification).toBe('azure-platform-active');
    expect(deployment.nodes[0].correlation).toMatchObject({ matchedBy: 'mac' });
    expect(deployment.creatorEvidence).toContainEqual(
      expect.objectContaining({ reasonCode: 'creation_predates_coverage' }),
    );
    expect(envelope.inventory.platformOnly.map((site) => site.name)).toEqual(['duplicate-name']);
  });

  it('marks conflicting caller evidence ambiguous without claiming ownership', () => {
    const node = vm('rg-owner', 'ce-owner', { tags: { owner: 'other@example.com' } });
    const event = {
      eventId: 'create',
      retryGroupId: 'one',
      eventTime: '2026-09-01T00:00:00.000Z',
      resourceId: String(node.id),
      scopeType: 'exact_resource' as const,
      operation: 'write',
      operationFamily: 'write' as const,
      status: 'succeeded',
      callerDisplay: 'operator@example.com',
      callerComparison: 'operator@example.com',
      callerKind: 'user' as const,
      evidenceType: 'created' as const,
      confidence: 'high' as const,
      reasonCode: 'explicit_create_operation',
    };
    const base = collected([node], { [String(node.id)]: 'running' });
    base.activityByResourceGroup['rg-owner'] = {
      coverage: {
        startTime: '2026-06-06T07:30:00.000Z',
        endTime: NOW.toISOString(),
        lookbackDays: 89,
        complete: true,
        truncated: false,
      },
      scopeEvidence: {
        scope: 'rg-owner',
        evidenceType: 'created',
        confidence: 'high',
        reasonCode: 'explicit_create_operation',
      },
      events: [event],
    };
    const envelope = buildAzureCeInventoryEnvelope(
      { subscriptionId: SUBSCRIPTION_ID, caller: { userPrincipalName: 'operator@example.com' }, platformSites: [] },
      base,
      NOW,
    );
    expect(envelope.inventory.deployments[0].classification).toBe('ambiguous');
    expect(envelope.inventory.deployments[0].creatorEvidence.map((item) => item.association).sort()).toEqual([
      'different-caller',
      'matches-caller',
    ]);
  });
});

describe('Azure CE inventory collection', () => {
  it('consumes every Graph page and uses privacy-preserving typed commands', async () => {
    const calls: Array<{ args: string[]; env?: Record<string, string> }> = [];
    const api: AzExecApi = {
      async exec(_command, args, options) {
        calls.push({ args, env: options?.env });
        if (args[0] === 'extension')
          return { stdout: '{"name":"resource-graph","version":"2.1.0"}', stderr: '', exitCode: 0 };
        if (args.includes('--help'))
          return {
            stdout: '--graph-query --subscriptions --first --skip --skip-token --allow-partial-scopes',
            stderr: '',
            exitCode: 0,
          };
        if (args[0] === 'account')
          return { stdout: '{"user":{"name":"operator@example.com","type":"user"}}', stderr: '', exitCode: 0 };
        if (args[0] === 'graph' && args.includes('page-2'))
          return {
            stdout: JSON.stringify({
              data: [nic('rg-page', 'ce-page-management', '001122334455', vmId('rg-page', 'ce-page'))],
            }),
            stderr: '',
            exitCode: 0,
          };
        if (args[0] === 'graph')
          return {
            stdout: JSON.stringify({ data: [vm('rg-page', 'ce-page')], skipToken: 'page-2' }),
            stderr: '',
            exitCode: 0,
          };
        if (args[0] === 'vm') return { stdout: '{"powerState":"PowerState/running"}', stderr: '', exitCode: 0 };
        if (args[0] === 'monitor') return { stdout: '[]', stderr: '', exitCode: 0 };
        return { stdout: '', stderr: 'unexpected command', exitCode: 1 };
      },
    };
    const result = await collectAzureCeInventory(
      { subscriptionId: SUBSCRIPTION_ID, platformSites: [] },
      api,
      () => NOW,
    );
    expect(result.inventory.coverage.resourceGraphPages).toBe(2);
    const graphCalls = calls.filter(
      (call) => call.args[0] === 'graph' && call.args[1] === 'query' && !call.args.includes('--help'),
    );
    expect(graphCalls).toHaveLength(2);
    expect(graphCalls[0].args).toContain('--graph-query');
    expect(graphCalls[0].args).toContain(AZURE_CE_INVENTORY_QUERY);
    expect(graphCalls[0].args).not.toContain('--query');
    expect(graphCalls[1].args).toContain('--skip-token');
    expect(graphCalls.every((call) => call.env?.AZURE_EXTENSION_USE_DYNAMIC_INSTALL === 'no')).toBe(true);
    const vmCall = calls.find((call) => call.args[0] === 'vm');
    expect(vmCall?.args.slice(0, 2)).toEqual(['vm', 'get-instance-view']);
    expect(vmCall?.args.join(' ')).not.toMatch(/show-details|publicIps|fqdns/i);
    expect(calls.find((call) => call.args[0] === 'monitor')?.args).toContain('89d');
    expect(JSON.stringify(result)).not.toMatch(/publicIpAddress|privateIpAddress|addressPrefix|userData/i);
  });

  it('fails with sanitized errors and never returns partial inventory', async () => {
    const api: AzExecApi = {
      async exec() {
        return { stdout: '', stderr: 'sensitive output at 192.0.2.10', exitCode: 1 };
      },
    };
    await expect(collectAzureCeInventory({ subscriptionId: SUBSCRIPTION_ID }, api, () => NOW)).rejects.toThrow(
      'Azure CE inventory setup is unavailable',
    );
  });
});
