import type { PlanReceipt } from '../../../terraform/src/runner';
import { fingerprint } from '../../src/ce/discovery';
import {
  publicTerraformAddresses,
  publicTerraformCloudScope,
  publicTerraformPlatformScope,
  publicTerraformSelections,
} from '../../src/ce/terraform-public-ownership';
import type { GcpTerraformTeardownRuntime } from '../../src/ce/terraform-teardown';
import { intent } from './fixtures';

function key(byte: number) {
  return `ssh-ed25519 ${Buffer.concat([Buffer.from('0000000b7373682d6564323535313900000020', 'hex'), Buffer.alloc(32, byte)]).toString('base64')}`;
}

export { key as observerOwnershipKey };
export function observerOwnershipFixture() {
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
