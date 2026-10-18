import { describe, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { discoverGcp, fingerprint, selectF5Images } from '../../src/ce/discovery';
import { planGcpCe } from '../../src/ce/planner';
import type { GcpCeDiscovery, GcpCeIntent } from '../../src/ce/types';
import { createGcpCeTools } from '../../src/tools/gcp-ce';

const image = {
  id: '123',
  name: 'f5xc-cecrt-test',
  selfLink: 'https://www.googleapis.com/compute/v1/projects/f5-7626-networks-public/global/images/f5xc-cecrt-test',
  licenses: ['https://www.googleapis.com/compute/v1/projects/f5-7626-networks-public/global/licenses/ce-test'],
  architecture: 'X86_64',
  status: 'READY',
};
function intent(): GcpCeIntent {
  return {
    schemaVersion: 1,
    project: 'test-project',
    region: 'northamerica-northeast1',
    deploymentName: 'ce-test',
    platformContext: 'lab',
    engine: 'native',
    operation: 'deploy',
    sites: [
      {
        name: 'ce-site',
        nodes: [
          {
            name: 'node-a',
            zone: 'northamerica-northeast1-a',
            interfaces: [
              { index: 0, role: 'slo', vrf: 'outside', network: 'outside', subnet: 'outside', cidr: '10.1.0.0/24' },
              { index: 1, role: 'sli', vrf: 'inside', network: 'inside', subnet: 'inside', cidr: '10.2.0.0/24' },
            ],
          },
        ],
      },
    ],
    machineType: 'n2-standard-8',
    diskGiB: 80,
    image,
    ipForwarding: true,
    egress: { mode: 'external-ip' },
    ingress: { profile: 'none' },
    routing: { profile: 'static-insertion', destinationCidrs: ['10.3.0.0/24'] },
  };
}
function discovery(): GcpCeDiscovery {
  return {
    schemaVersion: 1,
    project: 'test-project',
    region: 'northamerica-northeast1',
    observedAt: new Date().toISOString(),
    receipts: [],
    images: [image],
    machineTypes: [{ name: 'n2-standard-8', zone: 'northamerica-northeast1-a', guestCpus: 8, memoryMb: 32768 }],
    billingEnabled: true,
    enabledApis: ['compute.googleapis.com', 'serviceusage.googleapis.com'],
    quotas: [],
    checks: {
      iam: 'unknown',
      organizationPolicy: 'unknown',
      zoneCapacity: 'unknown',
      machineNicLimit: 'unknown',
      licenseAcceptance: 'unknown',
    },
  };
}
describe('GCP readiness boundary', () => {
  it('never creates actions or requests mutation approval and hashes owning engine', () => {
    const i = intent(),
      d = discovery();
    const native = planGcpCe(i, d);
    expect(native.executable).toBe(false);
    expect(native.actions).toEqual([]);
    expect(native.approval).toBe('not-requested');
    i.engine = 'terraform';
    const tf = planGcpCe(i, d);
    expect(tf.unavailable).toContain('shared_terraform_gcp_runner_not_available');
    expect(tf.planHash).not.toBe(native.planHash);
  });
  it('rejects overlap, shared VPC and non-boundary CIDRs', () => {
    for (const mutation of [
      (i: GcpCeIntent) => {
        i.sites[0].nodes[0].interfaces[1].cidr = '10.1.0.128/25';
      },
      (i: GcpCeIntent) => {
        i.sites[0].nodes[0].interfaces[1].network = 'outside';
      },
      (i: GcpCeIntent) => {
        i.sites[0].nodes[0].interfaces[1].cidr = '10.2.0.1/24';
      },
    ]) {
      const i = intent();
      mutation(i);
      expect(() => planGcpCe(i, discovery())).toThrow();
    }
  });
  it('rejects stale/mismatched discovery, changed license, undersizing and unknown machine', () => {
    for (const mutation of [
      (d: GcpCeDiscovery) => {
        d.observedAt = '2020-01-01';
      },
      (d: GcpCeDiscovery) => {
        d.project = 'other-project';
      },
      (d: GcpCeDiscovery) => {
        d.images = [{ ...image, licenses: [] }];
      },
      (d: GcpCeDiscovery) => {
        d.machineTypes[0].memoryMb = 16384;
      },
      (d: GcpCeDiscovery) => {
        d.machineTypes = [];
      },
    ]) {
      const d = discovery();
      mutation(d);
      expect(() => planGcpCe(intent(), d)).toThrow();
    }
  });
  it('enforces three-node homogeneous HA and globally unique node names', () => {
    const i = intent();
    const node = i.sites[0].nodes[0];
    i.sites[0].nodes.push({ ...structuredClone(node), name: 'node-b' }, { ...structuredClone(node), name: 'node-c' });
    expect(planGcpCe(i, discovery()).executable).toBe(false);
    i.sites[0].nodes[1].interfaces[1].vrf = 'changed';
    expect(() => planGcpCe(i, discovery())).toThrow('homogeneous');
  });
  it('discovers current CE CRT image names as well as legacy CECRT names', () => {
    const current = {
      ...image,
      name: 'f5xc-ce-crt-20260801-0205-byol',
      selfLink: image.selfLink.replace(image.name, 'f5xc-ce-crt-20260801-0205-byol'),
    };
    expect(selectF5Images([current, image])).toHaveLength(2);
  });
  it('rejects standard OS images, mutable alias identities and missing license', () => {
    expect(
      selectF5Images([
        image,
        { ...image, selfLink: image.selfLink.replace('f5-7626-networks-public', 'debian-cloud') },
        { ...image, licenses: [] },
        { ...image, id: 'latest' },
      ]),
    ).toEqual([image]);
  });
  it('rejects unrecognized secret fields before retaining intent', () => {
    const i = { ...intent(), bootstrap: 'SECRET' };
    expect(() => planGcpCe(i, discovery())).toThrow('Unsupported intent field');
  });
  it('canonicalizes object keys for fingerprints', () => {
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }));
  });
  it('discovers without list limits or public OS images and forwards cancellation', async () => {
    const calls: string[][] = [];
    const signal = new AbortController().signal;
    const api = {
      async exec(_cmd: string, args: string[], opts?: { signal?: AbortSignal }) {
        calls.push(args);
        expect(opts?.signal).toBe(signal);
        const value =
          args[0] === 'billing'
            ? { billingEnabled: true }
            : args[0] === 'services'
              ? []
              : args[1] === 'regions'
                ? { quotas: [] }
                : args[1] === 'images'
                  ? [image]
                  : [];
        return { stdout: JSON.stringify(value), stderr: '', exitCode: 0 };
      },
    };
    const d = await discoverGcp(api, 'test-project', 'northamerica-northeast1', signal);
    expect(calls[0]).toContain('--no-standard-images');
    expect(calls.flat().some((a) => a.startsWith('--limit'))).toBe(false);
    expect(d.receipts).toHaveLength(5);
    expect(d.checks.iam).toBe('unknown');
  });
  it('returns no partial success on permissions or asynchronous read failure', async () => {
    await expect(
      discoverGcp(
        { exec: async () => ({ stdout: '', stderr: 'private token', exitCode: 1 }) },
        'test-project',
        'northamerica-northeast1',
      ),
    ).rejects.toThrow('query failed');
  });
});
const boundary = async () => ({
  release: {} as never,
  fingerprint: 'test',
  availability: 'unavailable' as const,
  reason: 'gcp_provider_not_published' as const,
});
describe('GCP typed tools', () => {
  it('rejects every mutation before any cloud command', async () => {
    let calls = 0;
    const tools = createGcpCeTools(
      { typebox: { Type } },
      () => ({
        exec: async () => {
          calls++;
          throw new Error('must not run');
        },
      }),
      boundary,
    );
    for (const tool of tools.filter((t) => /apply|upgrade|failover|teardown/.test(t.name))) {
      for (const engine of ['native', 'terraform'] as const) {
        const r = await tool.execute('id', { project: 'test-project', engine }, undefined, null, { cwd: '/tmp' });
        expect(r.isError).toBe(true);
        expect(r.details.mutationAttempted).toBe(false);
      }
    }
    expect(calls).toBe(0);
  });
  it('rejects wrong engine before discovery', async () => {
    let calls = 0;
    const t = createGcpCeTools(
      { typebox: { Type } },
      () => ({
        exec: async () => {
          calls++;
          throw new Error('private');
        },
      }),
      boundary,
    ).find((t) => t.name === 'gcp_ce_plan');
    if (!t) throw new Error('Missing plan tool');
    const r = await t.execute(
      'id',
      { project: 'test-project', region: 'northamerica-northeast1', engine: 'terraform', intent: intent() },
      undefined,
      null,
      { cwd: '/tmp' },
    );
    expect(r.isError).toBe(true);
    expect(calls).toBe(0);
  });
  it('allowlists inventory and keeps label ownership and health unknown', async () => {
    const t = createGcpCeTools(
      { typebox: { Type } },
      () => ({
        exec: async () => ({
          stdout: JSON.stringify([
            {
              id: '1',
              name: 'ce',
              status: 'RUNNING',
              labels: { 'xcsh-deployment': 'ce-test' },
              metadata: { token: 'SECRET' },
              networkInterfaces: [{ private: 'SECRET' }],
            },
          ]),
          stderr: '',
          exitCode: 0,
        }),
      }),
      boundary,
    ).find((t) => t.name === 'gcp_ce_inventory');
    if (!t) throw new Error('Missing inventory tool');
    const r = await t.execute('id', { project: 'test-project', deploymentName: 'ce-test' }, undefined, null, {
      cwd: '/tmp',
    });
    expect(JSON.stringify(r)).not.toContain('SECRET');
    expect(r.details.platformHealth).toBe('unknown');
    expect(r.details.absence).toBe('not-established');
  });
});

it('binds current policy receipt into the readiness plan hash', () => {
  const i = intent(),
    d = discovery();
  const receipt = {
    identity: 'f5xc-ce-automation-policy/v2' as const,
    url: 'https://example.com/policy',
    observedAt: d.observedAt,
    normalizedSha256: `sha256:${'a'.repeat(64)}`,
  };
  const withPolicy = planGcpCe(i, d, Date.now(), receipt);
  expect(withPolicy.unavailable).not.toContain('current_policy_release_not_bound');
  expect(withPolicy.planHash).not.toBe(planGcpCe(i, d).planHash);
});
