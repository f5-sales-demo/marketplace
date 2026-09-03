import { describe, expect, it } from 'bun:test';
import {
  formatResourceGroupTable,
  formatResourceTable,
  formatSubscriptionDetail,
  formatSubscriptionTable,
  formatVmTable,
} from '../../src/az/formatters';
import type { AzResource, AzResourceGroup, AzSubscription, AzVm } from '../../src/az/types';

const SYNTHETIC_TENANT_ID = 'TENANT_ID';

describe('formatSubscriptionTable', () => {
  it('returns no-data message for empty array', () => {
    expect(formatSubscriptionTable([])).toContain('No subscriptions found');
  });

  it('formats multiple subscriptions as markdown table', () => {
    const subs: AzSubscription[] = [
      {
        id: 'aaa-bbb',
        name: 'Dev',
        state: 'Enabled',
        isDefault: true,
        tenantId: SYNTHETIC_TENANT_ID,
        user: { name: 'u@example.com', type: 'user' },
      },
      {
        id: 'ccc-ddd',
        name: 'Prod',
        state: 'Enabled',
        isDefault: false,
        tenantId: SYNTHETIC_TENANT_ID,
        user: { name: 'u@example.com', type: 'user' },
      },
    ];
    const result = formatSubscriptionTable(subs);
    expect(result).toContain('Dev');
    expect(result).toContain('Prod');
    expect(result).toContain('aaa-bbb');
    expect(result).toContain('|');
  });
});

describe('formatSubscriptionDetail', () => {
  it('renders single subscription details', () => {
    const sub: AzSubscription = {
      id: 'abc-123',
      name: 'My Sub',
      state: 'Enabled',
      isDefault: true,
      tenantId: SYNTHETIC_TENANT_ID,
      user: { name: 'user@example.com', type: 'user' },
    };
    const result = formatSubscriptionDetail(sub);
    expect(result).toContain('My Sub');
    expect(result).toContain('abc-123');
    expect(result).toContain('user@example.com');
  });
});

describe('formatResourceGroupTable', () => {
  it('returns no-data message for empty array', () => {
    expect(formatResourceGroupTable([])).toContain('No resource groups found');
  });

  it('formats resource groups as table', () => {
    const groups: AzResourceGroup[] = [
      { id: '/sub/rg1', name: 'rg-dev', location: 'eastus', provisioningState: 'Succeeded', tags: { env: 'dev' } },
    ];
    const result = formatResourceGroupTable(groups);
    expect(result).toContain('rg-dev');
    expect(result).toContain('eastus');
  });
});

describe('formatResourceTable', () => {
  it('returns no-data message for empty array', () => {
    expect(formatResourceTable([])).toContain('No resources found');
  });

  it('formats resources as table', () => {
    const resources: AzResource[] = [
      {
        id: '/sub/r1',
        name: 'myvm',
        type: 'Microsoft.Compute/virtualMachines',
        location: 'westus',
        resourceGroup: 'rg1',
        provisioningState: 'Succeeded',
        tags: {},
      },
    ];
    const result = formatResourceTable(resources);
    expect(result).toContain('myvm');
    expect(result).toContain('Microsoft.Compute/virtualMachines');
  });
});

describe('formatVmTable', () => {
  it('returns no-data message for empty array', () => {
    expect(formatVmTable([])).toContain('No VMs found');
  });

  it('formats VMs as table without details', () => {
    const vms: AzVm[] = [
      {
        id: '/sub/vm1',
        name: 'web-01',
        location: 'eastus2',
        resourceGroup: 'rg-prod',
        vmSize: 'Standard_D2s_v5',
        provisioningState: 'Succeeded',
        osType: 'Linux',
        powerState: 'running',
      },
    ];
    const result = formatVmTable(vms);
    expect(result).toContain('web-01');
    expect(result).toContain('Standard_D2s_v5');
    expect(result).toContain('Linux');
  });

  it('does not infer endpoint permission from populated fields', () => {
    const vms: AzVm[] = [
      {
        id: '/sub/vm1',
        name: 'web-01',
        location: 'eastus2',
        resourceGroup: 'rg-prod',
        vmSize: 'Standard_D2s_v5',
        provisioningState: 'Succeeded',
        osType: 'Linux',
        powerState: 'VM running',
        publicIps: ['192.0.2.21'],
        fqdns: ['web-01.example.invalid'],
      },
    ];
    const result = formatVmTable(vms);
    expect(result).not.toContain('192.0.2.21');
    expect(result).not.toContain('web-01.example.invalid');
    expect(result).not.toContain('Public IPs');
  });

  it('includes all endpoint values only under explicit formatter policy', () => {
    const vms: AzVm[] = [
      {
        id: '/sub/vm1',
        name: 'web-01',
        location: 'example-region',
        resourceGroup: 'example-rg',
        vmSize: 'Standard_D2s_v5',
        provisioningState: 'Succeeded',
        osType: 'Linux',
        publicIps: ['192.0.2.21', '2001:db8::21'],
        fqdns: ['web-01.example.invalid'],
      },
    ];
    const result = formatVmTable(vms, { includePowerState: false, includeNetworkIdentifiers: true });
    expect(result).toContain('192.0.2.21, 2001:db8::21');
    expect(result).toContain('web-01.example.invalid');
    expect(result).toContain('Public IPs');
    expect(result).not.toContain('Power');
  });
});
