import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { fingerprint } from '../../src/ce/discovery';
import { publicTerraformContextHash } from '../../src/ce/terraform-context';
import {
  inspectPublicTerraformOwnership,
  publicTerraformAddresses,
  publicTerraformCloudScope,
  publicTerraformPlatformScope,
  publicTerraformSelections,
} from '../../src/ce/terraform-public-ownership';
import {
  applyPublicTerraformTeardown,
  planPublicTerraformTeardown,
  verifyPublicTerraformLiveOwnership,
} from '../../src/ce/terraform-public-teardown';
import type { GcpTerraformTeardownRuntime } from '../../src/ce/terraform-teardown';
import { intent } from './fixtures';
import { terraformHaProfileFixture } from './terraform-ha-profile.test';

function key(byte: number) {
  return `ssh-ed25519 ${Buffer.concat([Buffer.from('0000000b7373682d6564323535313900000020', 'hex'), Buffer.alloc(32, byte)]).toString('base64')}`;
}
function fixture() {
  const i = intent();
  i.project = 'example-project';
  i.engine = 'terraform';
  i.routing.destinationCidrs = [];
  i.schemaVersion = 2;
  i.sites[0].nodes = ['a', 'b', 'c'].map((suffix) => ({
    ...structuredClone(i.sites[0].nodes[0]),
    name: `node-${suffix}`,
    zone: `${i.region}-${suffix}`,
  }));
  i.initialAccess = { schemaVersion: 1, profile: 'site-ssh-sli', publicKey: key(1) };
  i.observer = { schemaVersion: 1, profile: 'original-ha-observer', publicKey: key(2), sshSourceCidr: '192.0.2.4/32' };
  const scope = publicTerraformCloudScope(i),
    addresses = publicTerraformAddresses(i),
    selections = publicTerraformSelections(i);
  const fields: Record<string, Record<string, unknown> | null> = {};
  const live = new Map<string, Record<string, unknown>>();
  const prefix = `https://www.googleapis.com/compute/v1/projects/${i.project}`;
  const observer = 'ce-test-observer',
    image =
      'https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20261021';
  const labels = { 'xcsh-deployment': i.deploymentName, 'xcsh-engine': 'terraform', 'xcsh-role': 'observer' };
  for (const [n, row] of scope.entries()) {
    const name = row.selfLink.slice(row.selfLink.lastIndexOf('/') + 1),
      isObserver = name.startsWith(observer),
      id = String(100 + n),
      zone = row.selfLink.split('/zones/')[1]?.split('/')[0];
    const values: Record<string, unknown> = { name, project: i.project, self_link: row.selfLink, zone };
    const body: Record<string, unknown> = { id, selfLink: row.selfLink };
    if (row.kind === 'instance') {
      const node = i.sites[0].nodes.find((v) => v.name === name),
        nics = node?.interfaces ?? [i.sites[0].nodes[0].interfaces[1]];
      Object.assign(values, {
        instance_id: id,
        'boot_disk.length': 1,
        'boot_disk.0.source': `${prefix}/zones/${zone}/disks/${name}`,
        'boot_disk.0.auto_delete': false,
        'network_interface.length': nics.length,
        tags: isObserver ? [observer] : ['ce-site-ha-peer'],
      });
      for (const [index, nic] of nics.entries())
        Object.assign(values, {
          [`network_interface.${index}.network`]: `${prefix}/global/networks/${nic.network}`,
          [`network_interface.${index}.subnetwork`]: `${prefix}/regions/${i.region}/subnetworks/${nic.subnet}`,
        });
      if (isObserver)
        Object.assign(values, {
          'network_interface.0.access_config.length': 1,
          'service_account.length': 0,
          can_ip_forward: false,
          machine_type: 'e2-micro',
          labels,
          metadata: { 'ssh-keys': `ubuntu:${key(2)}`, 'block-project-ssh-keys': 'TRUE', 'enable-oslogin': 'FALSE' },
        });
      Object.assign(body, {
        serviceAccounts: [],
        canIpForward: false,
        networkInterfaces: [
          {
            network: `${prefix}/global/networks/inside`,
            subnetwork: `${prefix}/regions/${i.region}/subnetworks/inside`,
          },
        ],
      });
    } else if (row.kind === 'disk') {
      values.disk_id = id;
      if (isObserver) Object.assign(values, { image, size: 20, type: 'pd-balanced', labels });
      Object.assign(body, { sourceImage: image, sourceImageId: '4996011480491275419' });
    } else if (row.kind === 'network') values.numeric_id = id;
    else if (row.kind === 'subnetwork') {
      const nic = i.sites[0].nodes[0].interfaces.find((v) => v.subnet === name);
      if (!nic) throw new Error('Fixture subnet missing');
      Object.assign(values, {
        subnetwork_id: id,
        region: i.region,
        network: `${prefix}/global/networks/${nic.network}`,
        ip_cidr_range: nic.cidr,
      });
    } else if (row.kind === 'firewall') {
      const inside = name.includes('-sli-') || isObserver,
        direction = name.endsWith('-egress') ? 'EGRESS' : 'INGRESS';
      Object.assign(values, {
        creation_timestamp: '2026-11-12T00:00:00Z',
        network: `${prefix}/global/networks/${inside ? 'inside' : 'outside'}`,
        direction,
        source_ranges: direction === 'INGRESS' ? [isObserver ? i.observer.sshSourceCidr : '0.0.0.0/0'] : [],
        destination_ranges: direction === 'EGRESS' ? ['0.0.0.0/0'] : [],
        target_tags: isObserver ? [observer] : ['ce-site-ha-peer'],
        allow: isObserver ? [{ protocol: 'tcp', ports: ['22'] }] : [{ protocol: 'all', ports: [] }],
      });
      body.creationTimestamp = values.creation_timestamp;
    }
    fields[addresses[n]] = Object.fromEntries(selections[addresses[n]].map((field) => [field, values[field]]));
    live.set(row.selfLink, body);
  }
  for (const row of publicTerraformPlatformScope(i))
    fields[row.address] = {
      name: 'tokenName' in row ? row.tokenName : row.siteName,
      namespace: 'system',
      creation_identity_sha256: fingerprint(row.address),
      ...('tokenName' in row ? { site_name: row.siteName } : {}),
    };
  const receipt: PlanReceipt = {
    schemaVersion: 1,
    deploymentId: i.deploymentName,
    engine: 'terraform',
    backendIdentity: `local:${i.deploymentName}`,
    configurationSha256: 'a'.repeat(64),
    providerLockSha256: 'b'.repeat(64),
    planSha256: 'c'.repeat(64),
    noChanges: false,
    changes: addresses.map((address) => ({ address, type: address.split('.')[0], actions: ['create'] })),
  };
  const runtime = {
    environment: {},
    session: {
      readApplyAttemptResourceFields: async () => ({
        schemaVersion: 1,
        planSha256: receipt.planSha256,
        applyState: 'applied',
        stateSha256: 'd'.repeat(64),
        lineage: 'original',
        serial: 1,
        resources: fields,
      }),
    },
    api: {
      exec: async (_command: string, args: string[]) => {
        if (args.includes('operations')) {
          const filter = args[args.indexOf('--filter') + 1],
            link = filter.split('targetLink=')[1],
            body = live.get(link);
          return {
            exitCode: 0,
            stdout: JSON.stringify(
              body
                ? [
                    {
                      operationType: 'insert',
                      status: 'DONE',
                      targetLink: link,
                      targetId: body.id,
                      insertTime: '2026-11-11T23:59:59Z',
                      startTime: '2026-11-12T00:00:00Z',
                      endTime: '2026-11-12T00:00:01Z',
                    },
                  ]
                : [],
            ),
            stderr: '',
          };
        }
        const name = args[args.indexOf('describe') + 1],
          collection = args.includes('instances')
            ? 'instances'
            : args.includes('disks')
              ? 'disks'
              : args.includes('firewall-rules')
                ? 'firewalls'
                : args.includes('subnets')
                  ? 'subnetworks'
                  : 'networks',
          body = Array.from(live.values()).find((b) => String(b.selfLink).endsWith(`/${collection}/${name}`));
        return body
          ? { exitCode: 0, stdout: JSON.stringify(body), stderr: '' }
          : { exitCode: 1, stdout: '', stderr: 'not found' };
      },
    },
    observePlatform: async (_siteName: string, tokenName: string) => ({
      siteName: i.sites[0].name,
      tokenName: tokenName,
      siteAbsent: !fields['xcsh_securemesh_site_v2.ce_site'],
      tokenAbsent: !fields[`xcsh_token.${tokenName.replace('-token', '').replaceAll('-', '_')}`],
      siteIdentitySha256: fingerprint('xcsh_securemesh_site_v2.ce_site'),
      tokenIdentitySha256: fingerprint(`xcsh_token.${tokenName.replace('-token', '').replaceAll('-', '_')}`),
    }),
  } as unknown as GcpTerraformTeardownRuntime;
  return { i, scope, addresses, fields, live, receipt, runtime, observer };
}

test('all21 original identities include verified observer VM/disk/firewall without becoming a CE node', async () => {
  const f = fixture(),
    owned = await inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt);
  expect(owned.schemaVersion).toBe(3);
  expect(owned.complete).toBe(true);
  expect(owned.addresses).toHaveLength(21);
  expect(owned.resources).toHaveLength(17);
  expect(await verifyPublicTerraformLiveOwnership(f.runtime, f.i, owned, undefined, false)).toEqual([]);
});
test('observer disk survives as a typed original partial subset when registration and VM are absent', async () => {
  const f = fixture(),
    disk = 'google_compute_disk.ce_test_observer';
  for (const address of f.addresses) if (address !== disk) f.fields[address] = null;
  for (const link of f.live.keys()) if (!link.endsWith('/disks/ce-test-observer')) f.live.delete(link);
  const owned = await inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt);
  expect(owned.schemaVersion).toBe(3);
  expect(owned.complete).toBe(false);
  expect(owned.addresses).toEqual([disk]);
  expect((await verifyPublicTerraformLiveOwnership(f.runtime, f.i, owned)).length).toBe(20);
});
test('observer role, image, network, key, account and firewall substitutions refuse ownership', async () => {
  for (const mutation of [
    'service-account',
    'forwarding',
    'nic',
    'key',
    'image',
    'image-id',
    'wide-firewall',
    'live-account',
    'live-forwarding',
    'live-nic',
  ]) {
    const f = fixture(),
      vm = f.fields['google_compute_instance.ce_test_observer'],
      disk = f.fields['google_compute_disk.ce_test_observer'],
      fw = f.fields['google_compute_firewall.ce_test_observer_ssh'];
    if (!vm || !disk || !fw) throw new Error('Observer fixture missing');
    if (mutation === 'service-account') vm['service_account.length'] = 1;
    if (mutation === 'forwarding') vm.can_ip_forward = true;
    if (mutation === 'nic') vm['network_interface.length'] = 2;
    if (mutation === 'key') vm.metadata = { 'ssh-keys': `ubuntu:${key(3)}` };
    if (mutation === 'image') disk.image = 'replacement-image';
    if (mutation === 'image-id')
      for (const [link, body] of f.live) if (link.endsWith('/disks/ce-test-observer')) body.sourceImageId = '999';
    if (mutation === 'wide-firewall') fw.source_ranges = ['0.0.0.0/0'];
    for (const [link, body] of f.live)
      if (link.endsWith('/instances/ce-test-observer')) {
        if (mutation === 'live-account') body.serviceAccounts = [{ email: 'example@example.com' }];
        if (mutation === 'live-forwarding') body.canIpForward = true;
        if (mutation === 'live-nic') body.networkInterfaces = [];
      }
    await expect(inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt)).rejects.toThrow();
  }
});

test('typed21-resource teardown and disk-only recovery finish with empty destroy and two non-submitting resumes', async () => {
  for (const diskOnly of [false, true]) {
    const f = fixture(),
      root = await mkdtemp(join(tmpdir(), 'observer-owned-cleanup-'));
    try {
      if (diskOnly) {
        for (const address of f.addresses)
          if (address !== 'google_compute_disk.ce_test_observer') f.fields[address] = null;
        for (const link of f.live.keys()) if (!link.endsWith('/disks/ce-test-observer')) f.live.delete(link);
      }
      const owned = await inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt),
        files = new Map<string, unknown>();
      const planHash = fingerprint('original-reviewed-deploy'),
        receiptFingerprint = fingerprint(f.receipt),
        intentFingerprint = fingerprint(f.i);
      files.set('gcp-tf-deploy-original-authorization.json', { planHash, receiptFingerprint, intentFingerprint });
      files.set('gcp-tf-public-ownership.json', owned);
      files.set('gcp-tf-public-deployment.json', { planHash, receiptFingerprint, phase: 'partial' });
      f.runtime.environment = { XCSH_API_URL: 'https://original.example.test', XCSH_API_TOKEN: 'synthetic' };
      files.set('gcp-tf-public-platform-context.json', {
        schemaVersion: 1,
        contextHash: publicTerraformContextHash(f.i, 'https://original.example.test'),
      });
      f.runtime.store = {
        directory: root,
        read: async (name) => {
          if (!files.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
          return structuredClone(files.get(name));
        },
        write: async (name, value) => {
          files.set(name, structuredClone(value));
        },
      };
      let serial = 1,
        submissions = 0,
        checkpoint: 'planned' | 'applying' | 'applied' = 'planned';
      let current: PlanReceipt | undefined;
      f.runtime.session.readStateIdentity = async () => ({
        sha256: fingerprint(f.fields).slice(7),
        lineage: 'original',
        serial,
      });
      f.runtime.session.planDestroy = async () => {
        const remaining = f.addresses.filter((address) => f.fields[address] !== null);
        current = {
          ...f.receipt,
          operation: 'destroy',
          planSha256: fingerprint({ remaining, serial }).slice(7),
          noChanges: remaining.length === 0,
          changes: remaining.map((address) => ({ address, type: address.split('.')[0], actions: ['delete'] })),
        };
        checkpoint = 'planned';
        return structuredClone(current);
      };
      f.runtime.session.readPlannedResourceFields = async () => structuredClone(f.fields);
      f.runtime.session.readApplyCheckpoint = async (receipt) => {
        if (fingerprint(receipt) !== fingerprint(current)) throw new Error('saved plan differs');
        return { schemaVersion: 1, planSha256: receipt.planSha256, state: checkpoint };
      };
      f.runtime.session.apply = async () => {
        submissions++;
        checkpoint = 'applying';
        for (const address of f.addresses) f.fields[address] = null;
        f.live.clear();
        serial++;
        checkpoint = 'applied';
      };
      const boundary = terraformHaProfileFixture().boundary,
        policy = {
          identity: 'f5xc-ce-automation-policy/v2' as const,
          url: 'https://example.test/policy',
          observedAt: new Date().toISOString(),
          normalizedSha256: fingerprint('policy'),
        };
      const review = await planPublicTerraformTeardown(f.runtime, f.i, boundary, policy);
      expect(review.schemaVersion).toBe(3);
      expect(review.remaining).toHaveLength(diskOnly ? 1 : 21);
      expect(review.savedPlan.changes.every((change) => change.actions.join(',') === 'delete')).toBe(true);
      const result = await applyPublicTerraformTeardown(f.runtime, f.i, boundary, policy, review.planHash);
      expect(result.state).toBe('done');
      expect(result.absentObjects).toBe(21);
      expect(submissions).toBe(1);
      const stable = await f.runtime.session.readStateIdentity();
      for (let n = 0; n < 2; n++) {
        expect((await applyPublicTerraformTeardown(f.runtime, f.i, boundary, policy, review.planHash)).state).toBe(
          'done',
        );
        expect(await f.runtime.session.readStateIdentity()).toEqual(stable);
      }
      expect(submissions).toBe(1);
    } finally {
      await rm(root, { recursive: true });
    }
  }
});
