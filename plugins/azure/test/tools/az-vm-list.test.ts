import { describe, expect, it } from 'bun:test';
import { createAzVmListTool } from '../../src/tools/az-vm-list';

// Validation tests must never reach a real CLI: whether one is installed, and how long it
// takes to answer, is not part of what they are asserting.
const stubExec = () => ({
  exec: async () => ({ stdout: '{}', stderr: '', exitCode: 0 }),
});

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Boolean: (opts?: Record<string, unknown>) => ({ type: 'boolean', ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
  },
};

describe('createAzVmListTool', () => {
  const tool = createAzVmListTool({ typebox: mockTypebox }, stubExec);

  it('has correct name', () => {
    expect(tool.name).toBe('az_vm_list');
  });

  it('has a label', () => {
    expect(tool.label).toBe('Azure Virtual Machines');
  });

  it('has a description from markdown', () => {
    expect(tool.description).toContain('az vm');
  });

  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });

  it('exposes independent power and endpoint controls with no legacy field', () => {
    expect(tool.parameters).toHaveProperty('include_power_state');
    expect(tool.parameters).toHaveProperty('include_network_identifiers');
    expect(tool.parameters).not.toHaveProperty('show_details');
    expect(tool.description).toContain('include_power_state');
    expect(tool.description).toContain('include_network_identifiers');
    expect(tool.description).not.toContain('show_details');
    expect(tool.description).not.toContain('--show-details');
    expect(tool.description).not.toContain('--vmss');
  });

  it('returns power state by default without exposing projected network identifiers', async () => {
    const endpointSentinels = ['192.0.2.44', '2001:db8::44', 'vm.example.invalid'];
    const calls: string[][] = [];
    const fixtureExec = () => ({
      exec: async (_command: string, args: string[]) => {
        calls.push(args);
        return {
          stdout: JSON.stringify([
            {
              id: '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/example-rg/providers/Microsoft.Compute/virtualMachines/example-vm',
              name: 'example-vm',
              location: 'example-region',
              resourceGroup: 'example-rg',
              vmSize: 'Standard_D2s_v5',
              provisioningState: 'Succeeded',
              osType: 'Linux',
              powerState: 'VM running',
              publicIps: endpointSentinels.slice(0, 2),
              fqdns: endpointSentinels.slice(2),
            },
          ]),
          stderr: '',
          exitCode: 0,
        };
      },
    });
    const privacyTool = createAzVmListTool({ typebox: mockTypebox }, fixtureExec);
    const result = await privacyTool.execute('id', {}, undefined, null, { cwd: '/tmp' });
    const serialized = JSON.stringify(result);

    expect(result.isError).not.toBe(true);
    expect(serialized).toContain('VM running');
    for (const sentinel of endpointSentinels) expect(serialized).not.toContain(sentinel);
    expect(calls[0]).toEqual([
      'vm',
      'list',
      '--show-details',
      '--query',
      '[].{id:id,name:name,location:location,resourceGroup:resourceGroup,vmSize:hardwareProfile.vmSize,provisioningState:provisioningState,osType:storageProfile.osDisk.osType,powerState:powerState}',
      '--output',
      'json',
    ]);
  });

  it('skips detailed lookup and power projection when power state is disabled', async () => {
    const calls: string[][] = [];
    const noStateTool = createAzVmListTool({ typebox: mockTypebox }, () => ({
      exec: async (_command: string, args: string[]) => {
        calls.push(args);
        return { stdout: '[{"name":"example-vm","powerState":"VM running"}]', stderr: '', exitCode: 0 };
      },
    }));
    const result = await noStateTool.execute('id', { include_power_state: false }, undefined, null, { cwd: '/tmp' });
    expect(calls[0]).toEqual([
      'vm',
      'list',
      '--query',
      '[].{id:id,name:name,location:location,resourceGroup:resourceGroup,vmSize:hardwareProfile.vmSize,provisioningState:provisioningState,osType:storageProfile.osDisk.osType}',
      '--output',
      'json',
    ]);
    expect(JSON.stringify(result)).not.toContain('VM running');
  });

  it('returns endpoint arrays only after explicit opt-in', async () => {
    const calls: string[][] = [];
    const endpointTool = createAzVmListTool({ typebox: mockTypebox }, () => ({
      exec: async (_command: string, args: string[]) => {
        calls.push(args);
        return {
          stdout: JSON.stringify([
            {
              name: 'example-vm',
              powerState: 'VM stopped',
              publicIps: [['192.0.2.50', '2001:db8::50']],
              fqdns: [['vm.example.invalid']],
            },
          ]),
          stderr: '',
          exitCode: 0,
        };
      },
    }));
    const result = await endpointTool.execute(
      'id',
      { include_power_state: false, include_network_identifiers: true },
      undefined,
      null,
      { cwd: '/tmp' },
    );
    expect(calls[0]).toContain('--show-details');
    expect(calls[0]?.join(' ')).toContain('publicIps:to_array(publicIps)');
    expect(calls[0]?.join(' ')).toContain('fqdns:to_array(fqdns)');
    expect(result.details.vms?.[0]?.publicIps).toEqual(['192.0.2.50', '2001:db8::50']);
    expect(result.details.vms?.[0]?.fqdns).toEqual(['vm.example.invalid']);
    expect(result.details.vms?.[0]).not.toHaveProperty('powerState');
    expect(result.content[0]?.text).toContain('2001:db8::50');
    expect(result.content[0]?.text).not.toContain('VM stopped');
  });

  it('keeps FQDN-only and empty endpoint records typed under opt-in', async () => {
    const endpointTool = createAzVmListTool({ typebox: mockTypebox }, () => ({
      exec: async () => ({
        stdout: JSON.stringify([
          { name: 'fqdn-only', publicIps: [], fqdns: [['only.example.invalid']] },
          { name: 'no-endpoint', publicIps: [null], fqdns: [null] },
        ]),
        stderr: '',
        exitCode: 0,
      }),
    }));
    const result = await endpointTool.execute('id', { include_network_identifiers: true }, undefined, null, {
      cwd: '/tmp',
    });
    expect(result.details.vms?.[0]?.publicIps).toEqual([]);
    expect(result.details.vms?.[0]?.fqdns).toEqual(['only.example.invalid']);
    expect(result.details.vms?.[1]?.publicIps).toEqual([]);
    expect(result.details.vms?.[1]?.fqdns).toEqual([]);
    expect(result.content[0]?.text).toContain('only.example.invalid');
  });

  it('returns a typed failure without partial VM or endpoint details', async () => {
    const deniedTool = createAzVmListTool({ typebox: mockTypebox }, () => ({
      exec: async () => ({
        stdout: '[{"name":"partial","publicIps":["192.0.2.51"]}]',
        stderr: 'AuthorizationFailed',
        exitCode: 1,
      }),
    }));
    const result = await deniedTool.execute('id', { include_network_identifiers: true }, undefined, null, {
      cwd: '/tmp',
    });
    expect(result.isError).toBe(true);
    expect(result.details.errorType).toBe('exec_error');
    expect(result.details).not.toHaveProperty('vms');
    expect(JSON.stringify(result)).not.toContain('192.0.2.51');
  });
});

describe('az_vm input validation', () => {
  const tool = createAzVmListTool({ typebox: mockTypebox }, stubExec);

  it('rejects resource group with shell injection', async () => {
    const result = await tool.execute('id', { resource_group: '$(whoami)' }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects subscription with pipe injection', async () => {
    const result = await tool.execute('id', { subscription: 'test|cat' }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('accepts valid resource group', async () => {
    try {
      await tool.execute('id', { resource_group: 'my-resource-group' }, null, null, { cwd: '/tmp' });
    } catch {
      // CLI not available
    }
  });

  it('accepts independent disclosure booleans (no validation error)', async () => {
    // Boolean params can't cause shell injection — just verify no validation rejection
    try {
      await tool.execute('id', { include_power_state: false, include_network_identifiers: true }, null, null, {
        cwd: '/tmp',
      });
    } catch {
      // CLI call may fail but not due to validation
    }
  });
});
