import { describe, expect, it } from 'bun:test';
import {
  formatResourceGroupTable,
  formatResourceTable,
  formatSubscriptionDetail,
  formatSubscriptionTable,
  formatVmTable,
} from '../../src/az/formatters';
import type { AzResource, AzResourceGroup, AzSubscription, AzVm } from '../../src/az/types';

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
        tenantId: 't1',
        user: { name: 'u@t.com', type: 'user' },
      },
      {
        id: 'ccc-ddd',
        name: 'Prod',
        state: 'Enabled',
        isDefault: false,
        tenantId: 't2',
        user: { name: 'u@t.com', type: 'user' },
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
      tenantId: 'tenant-1',
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
        publicIps: '',
        fqdns: '',
      },
    ];
    const result = formatVmTable(vms);
    expect(result).toContain('web-01');
    expect(result).toContain('Standard_D2s_v5');
    expect(result).toContain('Linux');
  });

  it('includes public IPs and FQDNs when show_details data present', () => {
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
        publicIps: '20.1.2.3',
        fqdns: 'web-01.eastus2.cloudapp.azure.com',
      },
    ];
    const result = formatVmTable(vms);
    expect(result).toContain('20.1.2.3');
    expect(result).toContain('web-01.eastus2.cloudapp.azure.com');
    expect(result).toContain('Public IPs');
  });
});
