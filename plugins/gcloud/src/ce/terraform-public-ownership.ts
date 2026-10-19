import type { ApplyAttemptResourceProjection, PlanReceipt } from '../../../terraform/src/runner';
import { observeGcpTeardownResource } from './deployment-teardown';
import { fingerprint } from './discovery';
import type { GcpResourceIdentity } from './ownership';
import type { GcpTerraformTeardownRuntime } from './terraform-teardown';
import type { GcpCeIntent } from './types';
import { validateIntent } from './validation';

export function publicTerraformPlatformScope(intent: GcpCeIntent) {
  return intent.sites.flatMap((site) => [
    { address: `xcsh_securemesh_site_v2.${site.name.replaceAll('-', '_')}`, siteName: site.name },
    ...site.nodes.map((node) => ({
      address: `xcsh_token.${node.name.replaceAll('-', '_')}`,
      siteName: site.name,
      tokenName: `${node.name}-token`,
    })),
  ]);
}
export function publicTerraformAddresses(intent: GcpCeIntent) {
  return [
    ...publicTerraformCloudScope(intent).map(
      (resource) =>
        `google_compute_${resource.kind}.${resource.selfLink.substring(resource.selfLink.lastIndexOf('/') + 1).replaceAll('-', '_')}`,
    ),
    ...publicTerraformPlatformScope(intent).map((resource) => resource.address),
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
  validateIntent(intent);
  const prefix = `https://www.googleapis.com/compute/v1/projects/${intent.project}`;
  const resources = intent.sites.flatMap((site) =>
    site.nodes.flatMap((node) => [
      {
        kind: 'instance' as const,
        selfLink: `${prefix}/zones/${node.zone}/instances/${node.name}`,
        siteName: site.name,
        nodeName: node.name,
      },
      {
        kind: 'disk' as const,
        selfLink: `${prefix}/zones/${node.zone}/disks/${node.name}`,
        siteName: site.name,
        nodeName: node.name,
      },
      ...node.interfaces.flatMap((nic) => [
        { kind: 'network' as const, selfLink: `${prefix}/global/networks/${nic.network}` },
        { kind: 'subnetwork' as const, selfLink: `${prefix}/regions/${intent.region}/subnetworks/${nic.subnet}` },
      ]),
    ]),
  );
  return [...new Map(resources.map((resource) => [resource.selfLink, resource])).values()].map((resource) => ({
    ...resource,
    id: '0',
    project: intent.project,
    deploymentName: intent.deploymentName,
    engine: 'terraform' as const,
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
  if (intent.engine !== 'terraform') throw new Error('Terraform ownership requires the owning engine');
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
    if (
      ['instance', 'disk'].includes(expected.kind) &&
      value.zone !== expected.selfLink.split('/zones/')[1]?.split('/')[0]
    )
      throw new Error('Cloud zone identity differs');
    if (expected.kind === 'subnetwork') {
      const nic = intent.sites
        .flatMap((site) => site.nodes.flatMap((node) => node.interfaces))
        .find((n) => expected.selfLink.endsWith(`/subnetworks/${n.subnet}`));
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
  const prefix = `https://www.googleapis.com/compute/v1/projects/${intent.project}`;
  for (const site of intent.sites)
    for (const node of site.nodes) {
      const key = node.name.replaceAll('-', '_');
      const instance = projected.resources[`google_compute_instance.${key}`];
      if (
        instance &&
        (instance['boot_disk.length'] !== 1 ||
          instance['boot_disk.0.source'] !== `${prefix}/zones/${node.zone}/disks/${node.name}` ||
          instance['boot_disk.0.auto_delete'] !== false ||
          !projected.resources[`google_compute_disk.${key}`] ||
          instance['network_interface.length'] !== node.interfaces.length ||
          node.interfaces.some(
            (nic) =>
              instance[`network_interface.${nic.index}.network`] !== `${prefix}/global/networks/${nic.network}` ||
              instance[`network_interface.${nic.index}.subnetwork`] !==
                `${prefix}/regions/${intent.region}/subnetworks/${nic.subnet}`,
          ))
      )
        throw new Error('VM/disk/NIC owning topology differs');
    }
  const platform: Record<string, string> = {};
  for (const observation of await observePublicTerraformPlatform(runtime, intent, signal)) {
    const { address, absent, hash, siteName, tokenName } = observation;
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
      value.name !== (tokenName ?? siteName) ||
      (tokenName && value.site_name !== siteName)
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
/** Read every node-bound token and reject inconsistent site observations across reads. */
export async function observePublicTerraformPlatform(
  runtime: GcpTerraformTeardownRuntime,
  intent: GcpCeIntent,
  signal?: AbortSignal,
) {
  const rows = new Map<
    string,
    { address: string; siteName: string; tokenName?: string; absent: boolean; hash?: string }
  >();
  for (const site of intent.sites)
    for (const node of site.nodes) {
      signal?.throwIfAborted();
      const tokenName = `${node.name}-token`;
      const observed = await runtime.observePlatform(site.name, tokenName, signal);
      signal?.throwIfAborted();
      if (
        observed.siteName !== site.name ||
        observed.tokenName !== tokenName ||
        typeof observed.siteAbsent !== 'boolean' ||
        typeof observed.tokenAbsent !== 'boolean'
      )
        throw new Error('Scoped Platform observation differs');
      const siteRow = {
        address: `xcsh_securemesh_site_v2.${site.name.replaceAll('-', '_')}`,
        siteName: site.name,
        absent: observed.siteAbsent,
        hash: observed.siteIdentitySha256,
      };
      const prior = rows.get(siteRow.address);
      if (prior && fingerprint(prior) !== fingerprint(siteRow))
        throw new Error('XC site identity changed during node observations');
      rows.set(siteRow.address, siteRow);
      const address = `xcsh_token.${node.name.replaceAll('-', '_')}`;
      rows.set(address, {
        address,
        siteName: site.name,
        tokenName,
        absent: observed.tokenAbsent,
        hash: observed.tokenIdentitySha256,
      });
    }
  return [...rows.values()];
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
