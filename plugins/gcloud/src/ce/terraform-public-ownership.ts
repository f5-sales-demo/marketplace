import type { ApplyAttemptResourceProjection, PlanReceipt } from '../../../terraform/src/runner';
import { observeGcpTeardownResource } from './deployment-teardown';
import { fingerprint } from './discovery';
import type { GcpResourceIdentity } from './ownership';
import type { GcpTerraformTeardownRuntime } from './terraform-teardown';
import type { GcpCeIntent } from './types';

export function publicTerraformAddresses(intent: GcpCeIntent) {
  const node = intent.sites[0].nodes[0];
  return [
    `google_compute_instance.${node.name.replaceAll('-', '_')}`,
    `google_compute_disk.${node.name.replaceAll('-', '_')}`,
    ...node.interfaces.flatMap((nic) => [
      `google_compute_network.${nic.network.replaceAll('-', '_')}`,
      `google_compute_subnetwork.${nic.subnet.replaceAll('-', '_')}`,
    ]),
    `xcsh_securemesh_site_v2.${intent.sites[0].name.replaceAll('-', '_')}`,
    `xcsh_token.${node.name.replaceAll('-', '_')}`,
  ];
}
export function publicTerraformSelections(intent: GcpCeIntent) {
  return Object.fromEntries(
    publicTerraformAddresses(intent).map((address) => {
      const common = ['name', 'project', 'self_link'];
      if (address.startsWith('google_compute_instance.'))
        return [
          address,
          [
            ...common,
            'zone',
            'instance_id',
            'boot_disk.length',
            'boot_disk.0.source',
            'boot_disk.0.auto_delete',
            'network_interface.length',
            ...[0, 1].flatMap((n) => [`network_interface.${n}.network`, `network_interface.${n}.subnetwork`]),
          ],
        ];
      if (address.startsWith('google_compute_disk.')) return [address, [...common, 'zone', 'disk_id']];
      if (address.startsWith('google_compute_network.')) return [address, [...common, 'numeric_id']];
      if (address.startsWith('google_compute_subnetwork.'))
        return [address, [...common, 'region', 'subnetwork_id', 'network', 'ip_cidr_range']];
      return [
        address,
        ['name', 'namespace', 'creation_identity_sha256', ...(address.startsWith('xcsh_token.') ? ['site_name'] : [])],
      ];
    }),
  );
}
export function publicTerraformCloudScope(intent: GcpCeIntent) {
  const node = intent.sites[0].nodes[0];
  const prefix = `https://www.googleapis.com/compute/v1/projects/${intent.project}`;
  return [
    { kind: 'instance' as const, selfLink: `${prefix}/zones/${node.zone}/instances/${node.name}` },
    { kind: 'disk' as const, selfLink: `${prefix}/zones/${node.zone}/disks/${node.name}` },
    ...node.interfaces.flatMap((nic) => [
      { kind: 'network' as const, selfLink: `${prefix}/global/networks/${nic.network}` },
      { kind: 'subnetwork' as const, selfLink: `${prefix}/regions/${intent.region}/subnetworks/${nic.subnet}` },
    ]),
  ].map((resource) => ({
    ...resource,
    id: '0',
    project: intent.project,
    deploymentName: intent.deploymentName,
    engine: 'terraform' as const,
    ...(['instance', 'disk'].includes(resource.kind) ? { siteName: intent.sites[0].name, nodeName: node.name } : {}),
  }));
}
export type PublicTerraformOwnership = Awaited<ReturnType<typeof inspectPublicTerraformOwnership>>;

/** Every present object must have an original, nonsensitive creation identity in owning state. */
export async function inspectPublicTerraformOwnership(
  runtime: GcpTerraformTeardownRuntime,
  intent: GcpCeIntent,
  receipt: PlanReceipt,
  signal?: AbortSignal,
) {
  if (!runtime.session.readApplyAttemptResourceFields) throw new Error('Restricted attempt inspection unavailable');
  const selections = publicTerraformSelections(intent);
  const projected = await runtime.session.readApplyAttemptResourceFields(
    receipt,
    selections,
    runtime.environment,
    signal,
  );
  assertPublicTerraformSnapshot(intent, receipt, projected);
  const resources: GcpResourceIdentity[] = [];
  const scope = publicTerraformCloudScope(intent);
  for (let index = 0; index < scope.length; index++) {
    const address = publicTerraformAddresses(intent)[index];
    const value = projected.resources[address];
    const expected = scope[index];
    const live = await observeGcpTeardownResource(runtime.api, expected, signal);
    if (!value) {
      if (live) throw new Error('Unidentified cloud object requires reconciliation');
      continue;
    }
    if (!live || live.selfLink !== expected.selfLink || !/^\d+$/.test(live.id))
      throw new Error('Missing owning cloud object requires reconciliation');
    const idField = ['instance_id', 'disk_id', 'numeric_id', 'subnetwork_id'][
      ['instance', 'disk', 'network', 'subnetwork'].indexOf(expected.kind)
    ];
    if (
      value.name !== expected.selfLink.split('/').at(-1) ||
      value.project !== intent.project ||
      value.self_link !== expected.selfLink ||
      String(value[idField]) !== live.id
    )
      throw new Error('Replacement cloud identity requires reconciliation');
    if (['instance', 'disk'].includes(expected.kind) && value.zone !== intent.sites[0].nodes[0].zone)
      throw new Error('Cloud zone identity differs');
    if (expected.kind === 'subnetwork') {
      const nic = intent.sites[0].nodes[0].interfaces.find((n) =>
        expected.selfLink.endsWith(`/subnetworks/${n.subnet}`),
      );
      if (
        !nic ||
        value.region !== intent.region ||
        value.ip_cidr_range !== nic.cidr ||
        value.network !==
          scope.find((r) => r.kind === 'network' && r.selfLink.endsWith(`/networks/${nic.network}`))?.selfLink
      )
        throw new Error('Subnet ownership topology differs');
    }
    resources.push({ ...expected, id: live.id });
  }
  const instance = projected.resources[publicTerraformAddresses(intent)[0]];
  if (instance) {
    if (
      instance['boot_disk.length'] !== 1 ||
      instance['boot_disk.0.source'] !== scope[1].selfLink ||
      instance['boot_disk.0.auto_delete'] !== false ||
      !projected.resources[publicTerraformAddresses(intent)[1]] ||
      instance['network_interface.length'] !== 2 ||
      [0, 1].some(
        (n) =>
          instance[`network_interface.${n}.network`] !== scope[2 + n * 2].selfLink ||
          instance[`network_interface.${n}.subnetwork`] !== scope[3 + n * 2].selfLink,
      )
    )
      throw new Error('VM/disk/NIC owning topology differs');
  }
  const observed = await runtime.observePlatform(
    intent.sites[0].name,
    `${intent.sites[0].nodes[0].name}-token`,
    signal,
  );
  if (
    observed.siteName !== intent.sites[0].name ||
    observed.tokenName !== `${intent.sites[0].nodes[0].name}-token` ||
    typeof observed.siteAbsent !== 'boolean' ||
    typeof observed.tokenAbsent !== 'boolean'
  )
    throw new Error('Scoped Platform observation differs');
  const platform: Record<string, string> = {};
  for (const [address, absent, hash] of [
    [publicTerraformAddresses(intent)[6], observed.siteAbsent, observed.siteIdentitySha256],
    [publicTerraformAddresses(intent)[7], observed.tokenAbsent, observed.tokenIdentitySha256],
  ] as const) {
    const value = projected.resources[address];
    if (!value) {
      if (!absent) throw new Error('Unidentified XC object requires reconciliation');
      continue;
    }
    if (
      absent ||
      typeof hash !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(hash) ||
      value.creation_identity_sha256 !== hash ||
      value.namespace !== 'system' ||
      value.name !== (address.startsWith('xcsh_token.') ? observed.tokenName : observed.siteName) ||
      (address.startsWith('xcsh_token.') && value.site_name !== observed.siteName)
    )
      throw new Error('Original XC creation identity differs');
    platform[address] = hash;
  }
  const addresses = Object.keys(projected.resources).filter((address) => projected.resources[address] !== null);
  return {
    schemaVersion: 2 as const,
    intentFingerprint: fingerprint(intent),
    receiptFingerprint: fingerprint(receipt),
    state: { sha256: projected.stateSha256, lineage: projected.lineage, serial: projected.serial },
    projectionHash: fingerprint(projected.resources),
    addresses,
    resources,
    platform,
    complete: addresses.length === publicTerraformAddresses(intent).length,
  };
}
export function assertPublicTerraformSnapshot(
  intent: GcpCeIntent,
  receipt: PlanReceipt,
  projected: ApplyAttemptResourceProjection,
) {
  const selections = publicTerraformSelections(intent);
  if (
    projected.schemaVersion !== 1 ||
    projected.planSha256 !== receipt.planSha256 ||
    !['applying', 'applied'].includes(projected.applyState) ||
    !/^[a-f0-9]{64}$/.test(projected.stateSha256) ||
    !projected.lineage?.trim() ||
    !Number.isSafeInteger(projected.serial) ||
    projected.serial < 0 ||
    fingerprint(Object.keys(projected.resources).sort()) !== fingerprint(Object.keys(selections).sort())
  )
    throw new Error('Original state snapshot binding differs');
  for (const [address, value] of Object.entries(projected.resources))
    if (value !== null && fingerprint(Object.keys(value).sort()) !== fingerprint(selections[address].slice().sort()))
      throw new Error('Unexpected or sensitive state projection');
}
