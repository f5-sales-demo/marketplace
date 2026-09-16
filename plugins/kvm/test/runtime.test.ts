import { describe, expect, it } from 'bun:test';
import {
  inspectKvmHost,
  inspectKvmRuntimeStatus,
  type KvmCommandRunner,
  probeKvmImagePrerequisite,
} from '../src/runtime';

describe('live KVM image prerequisite probe', () => {
  it('uses only the Sales Demo endpoint and discards signed URL values', async () => {
    let request: { url: string; init?: RequestInit } | undefined;
    const result = await probeKvmImagePrerequisite(
      {
        XCSH_API_URL: 'https://f5-sales-demo.console.ves.volterra.io',
        XCSH_API_TOKEN: 'fixture-token-never-return',
      },
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        request = { url: String(input), init };
        return new Response(JSON.stringify({ image_download_url: 'https://signed.example.test/secret' }), {
          status: 200,
        });
      }) as unknown as typeof fetch,
    );

    expect(result).toEqual({ available: true });
    expect(request?.url).toBe(
      'https://f5-sales-demo.console.ves.volterra.io/api/register/namespaces/system/get-image-download-url',
    );
    expect(request?.init?.method).toBe('POST');
    expect(request?.init?.body).toBe(JSON.stringify({ provider: 'KVM' }));
    expect(JSON.stringify(result)).not.toContain('signed.example.test');
    expect(JSON.stringify(result)).not.toContain('fixture-token');
  });

  it('classifies the exact tenant cardinality failure without returning the server body', async () => {
    const result = await probeKvmImagePrerequisite(
      {
        XCSH_API_URL: 'https://f5-sales-demo.console.ves.volterra.io',
        XCSH_API_TOKEN: 'fixture-token-never-return',
      },
      (async () =>
        new Response(
          JSON.stringify({ message: 'cannot create download url: number of maurice_config object is not one' }),
          { status: 500 },
        )) as unknown as typeof fetch,
    );
    expect(result).toEqual({
      available: false,
      diagnostic: 'number of maurice_config object is not one',
    });
  });

  it('rejects every tenant other than Sales Demo before a request', async () => {
    let called = false;
    await expect(
      probeKvmImagePrerequisite(
        { XCSH_API_URL: 'https://other.example.test', XCSH_API_TOKEN: 'fixture-token' },
        (async () => {
          called = true;
          return new Response('{}');
        }) as unknown as typeof fetch,
      ),
    ).rejects.toThrow('Sales Demo');
    expect(called).toBe(false);
  });
});

describe('KVM host inspection', () => {
  it('uses read-only commands and returns only project-scoped resource identities', async () => {
    const calls: string[][] = [];
    const outputs = new Map<string, string>([
      ['hostname', 'kvm-demo.example.test\n'],
      ['terraform version -json', '{"terraform_version":"1.16.2"}\n'],
      [
        'terraform -chdir=/workspace/mcn/terraform show -json',
        JSON.stringify({
          values: {
            root_module: {
              resources: [
                { type: 'libvirt_domain', values: { name: 'onprem-ce-01' } },
                { type: 'libvirt_network', values: { name: 'ce-bgp-net-deadbeef' } },
                { type: 'libvirt_volume', values: { name: 'onprem-ce-01-disk.qcow2' } },
                { type: 'docker_container', values: { name: 'mcn-kvm-frr' } },
              ],
            },
          },
        }),
      ],
      ['virsh --connect qemu:///system uri', 'qemu:///system\n'],
      ['virsh --connect qemu:///system list --all --name', 'onprem-ce-01\nunrelated-vm\n'],
      ['virsh --connect qemu:///system net-list --all --name', 'ce-bgp-net-deadbeef\ndefault\n'],
      ['virsh --connect qemu:///system vol-list default --name', 'onprem-ce-01-disk.qcow2\nother.qcow2\n'],
      ['docker ps --all --format {{.Names}}', 'mcn-kvm-frr\nunrelated\n'],
    ]);
    const run: KvmCommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: outputs.get([command, ...args].join(' ')) ?? '', stderr: '', exitCode: 0 };
    };
    const observed = await inspectKvmHost('/workspace/mcn/terraform', run, async () => true);

    expect(observed.hostname).toBe('kvm-demo.example.test');
    expect(observed.libvirtUri).toBe('qemu:///system');
    expect(observed.projectResources).toEqual([
      { kind: 'domain', name: 'onprem-ce-01', owned: true },
      { kind: 'network', name: 'ce-bgp-net-deadbeef', owned: true },
      { kind: 'volume', name: 'onprem-ce-01-disk.qcow2', owned: true },
      { kind: 'container', name: 'mcn-kvm-frr', owned: true },
    ]);
    expect(calls.flat().join(' ')).not.toMatch(/(?:^|\s)(?:destroy|undefine|delete|rm|apply)(?:\s|$)/);
  });

  it('does not infer ownership from a project-like resource name', async () => {
    const outputs = new Map<string, string>([
      ['hostname', 'kvm-demo.example.test\n'],
      ['terraform version -json', '{"terraform_version":"1.16.2"}\n'],
      ['terraform -chdir=/workspace/mcn/terraform show -json', '{"values":{"root_module":{}}}'],
      ['virsh --connect qemu:///system uri', 'qemu:///system\n'],
      ['virsh --connect qemu:///system list --all --name', 'onprem-ce-01\n'],
      ['virsh --connect qemu:///system net-list --all --name', 'ce-bgp-net-deadbeef\n'],
      ['virsh --connect qemu:///system vol-list default --name', 'onprem-ce-01-disk.qcow2\n'],
      ['docker ps --all --format {{.Names}}', 'mcn-kvm-frr\n'],
    ]);
    const run: KvmCommandRunner = async (command, args) => ({
      stdout: outputs.get([command, ...args].join(' ')) ?? '',
      stderr: '',
      exitCode: 0,
    });

    const observed = await inspectKvmHost('/workspace/mcn/terraform', run, async () => true);
    expect(observed.projectResources).toEqual([
      { kind: 'domain', name: 'onprem-ce-01', owned: false },
      { kind: 'network', name: 'ce-bgp-net-deadbeef', owned: false },
      { kind: 'volume', name: 'onprem-ce-01-disk.qcow2', owned: false },
      { kind: 'container', name: 'mcn-kvm-frr', owned: false },
    ]);
  });
});

describe('KVM runtime, FRR, and traffic status', () => {
  it('returns allowlisted health evidence and bounded generated traffic results', async () => {
    const calls: string[][] = [];
    const run: KvmCommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      const key = [command, ...args].join(' ');
      if (key === 'hostname') return { stdout: 'kvm-demo.example.test\n', stderr: '', exitCode: 0 };
      if (key === 'terraform version -json')
        return { stdout: '{"terraform_version":"1.16.2"}', stderr: '', exitCode: 0 };
      if (key === 'virsh --connect qemu:///system uri') return { stdout: 'qemu:///system\n', stderr: '', exitCode: 0 };
      if (key === 'virsh --connect qemu:///system list --all --name')
        return { stdout: 'onprem-ce-01\nonprem-ce-02\nonprem-ce-03\n', stderr: '', exitCode: 0 };
      if (key === 'virsh --connect qemu:///system net-list --all --name')
        return { stdout: 'ce-bgp-net-deadbeef\n', stderr: '', exitCode: 0 };
      if (key === 'virsh --connect qemu:///system vol-list default --name')
        return { stdout: 'onprem-ce-01-a-disk.qcow2\n', stderr: '', exitCode: 0 };
      if (key === 'docker ps --all --format {{.Names}}') return { stdout: 'mcn-kvm-frr\n', stderr: '', exitCode: 0 };
      if (key.startsWith('virsh --connect qemu:///system domstate onprem-ce-'))
        return { stdout: 'running\n', stderr: '', exitCode: 0 };
      if (key === 'terraform -chdir=/workspace/mcn/terraform show -json')
        return {
          stdout: JSON.stringify({ values: { root_module: { resources: [{ address: 'libvirt_domain.ce_node' }] } } }),
          stderr: '',
          exitCode: 0,
        };
      if (key === 'docker exec mcn-kvm-frr vtysh -c show bgp summary json')
        return {
          stdout: JSON.stringify({
            ipv4Unicast: {
              peers: {
                '10.100.0.11': { state: 'Established' },
                '10.100.0.12': { state: 'Established' },
                '10.100.0.13': { state: 'Active' },
              },
            },
          }),
          stderr: '',
          exitCode: 0,
        };
      if (command === 'curl') return { stdout: '200', stderr: '', exitCode: 0 };
      return { stdout: '', stderr: 'unexpected command', exitCode: 1 };
    };

    const status = await inspectKvmRuntimeStatus(
      '/workspace/mcn/terraform',
      { trafficUrl: 'https://lb.example.test/health', trafficSamples: 3 },
      run,
      async () => true,
    );
    expect(status.terraformResources).toBe(1);
    expect(status.domains).toEqual([
      { name: 'onprem-ce-01', state: 'running' },
      { name: 'onprem-ce-02', state: 'running' },
      { name: 'onprem-ce-03', state: 'running' },
    ]);
    expect(status.frr).toMatchObject({ peers: 3, established: 2 });
    expect(status.traffic).toEqual({ samples: 3, successes: 3, statusCodes: [200, 200, 200] });
    expect(JSON.stringify(status)).not.toContain('lb.example.test');
    expect(calls.filter((call) => call[0] === 'curl')).toHaveLength(3);
  });
});
