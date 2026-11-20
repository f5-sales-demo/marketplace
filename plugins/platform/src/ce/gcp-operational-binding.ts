import { createHash } from 'node:crypto';
import { fingerprint } from '../../../gcloud/src/ce/discovery';
import {
  correlateGcpPhysicalInterfaces,
  type GcpExpectedNodeIdentity,
} from '../../../gcloud/src/ce/interface-identity';
import type { OperationalBinding } from '../../../gcloud/src/ce/operational-health';
import type { GcpOperationalSourceIdentity } from './gcp-operational-source';

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Operational binding malformed');
  return value as Record<string, unknown>;
};
export interface GcpOperationalBindingPort {
  /** Persisted intent/context and complete original creation ownership, verified by the deployment store. */
  persisted(signal?: AbortSignal): Promise<{ contextFingerprint: string; ownershipFingerprint: string }>;
  configuration(signal?: AbortSignal): Promise<unknown>;
  runtimeSite(signal?: AbortSignal): Promise<unknown>;
  registrations(signal?: AbortSignal): Promise<unknown>;
  cloud(nodeName: string, signal?: AbortSignal): Promise<unknown>;
  token(nodeName: string, signal?: AbortSignal): Promise<unknown>;
}
/** Revalidate original identities and physical joins; runtime role/state evidence is evaluated separately. */
export async function verifyGcpOperationalBinding(
  port: GcpOperationalBindingPort,
  expected: OperationalBinding,
  cloudIdentities: GcpExpectedNodeIdentity[],
  sourceIdentities: GcpOperationalSourceIdentity[],
  signal?: AbortSignal,
): Promise<OperationalBinding> {
  expected = structuredClone(expected);
  cloudIdentities = structuredClone(cloudIdentities);
  sourceIdentities = structuredClone(sourceIdentities);
  const persisted = await port.persisted(signal);
  if (
    persisted.contextFingerprint !== expected.contextFingerprint ||
    persisted.ownershipFingerprint !== expected.ownershipFingerprint ||
    expected.nodes.length !== 3 ||
    cloudIdentities.length !== 3 ||
    sourceIdentities.length !== 3
  )
    throw new Error('Original persisted operational ownership differs');
  const configuration = object(await port.configuration(signal));
  const metadata = object(configuration.metadata);
  const uid = object(configuration.system_metadata).uid;
  if (
    metadata.name !== expected.siteName ||
    metadata.namespace !== 'system' ||
    typeof uid !== 'string' ||
    `sha256:${createHash('sha256').update(uid).digest('hex')}` !== expected.configurationIdentitySha256
  )
    throw new Error('Original operational configuration identity differs');
  const runtime = object(await port.runtimeSite(signal));
  const runtimeUid = object(runtime.system_metadata).uid;
  if (
    object(runtime.metadata).name !== expected.siteName ||
    typeof runtimeUid !== 'string' ||
    fingerprint({ uid: runtimeUid }) !== expected.runtimeIdentitySha256
  )
    throw new Error('Original operational runtime identity differs');
  const response = object(await port.registrations(signal));
  if (
    !Array.isArray(response.items) ||
    response.next_page_token ||
    response.continue ||
    (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length))
  )
    throw new Error('Operational binding registrations incomplete');
  const rows = response.items.map(object);
  if (
    rows.length !== 3 ||
    rows.some((row) => !expected.nodes.some((node) => object(object(row.get_spec).infra).hostname === node.nodeName))
  )
    throw new Error('Operational binding registration set foreign');
  for (const node of expected.nodes) {
    signal?.throwIfAborted();
    const cloudMatches = cloudIdentities.filter(
      (identity) =>
        identity.nodeName === node.nodeName &&
        identity.instanceId === node.instanceId &&
        identity.siteName === expected.siteName,
    );
    const sourceMatches = sourceIdentities.filter(
      (identity) => identity.nodeName === node.nodeName && identity.instanceId === node.instanceId,
    );
    const registrations = rows.filter((row) => object(object(row.get_spec).infra).hostname === node.nodeName);
    if (cloudMatches.length !== 1 || sourceMatches.length !== 1 || registrations.length !== 1)
      throw new Error('Operational binding node ambiguous');
    const registration = registrations[0];
    if (
      typeof registration.uid !== 'string' ||
      fingerprint({ uid: registration.uid }) !== node.registrationIdentitySha256
    )
      throw new Error('Original operational registration identity differs');
    const token = object(await port.token(node.nodeName, signal));
    const tokenUid = object(token.system_metadata).uid;
    const tokenMetadata = object(token.metadata);
    if (
      typeof tokenUid !== 'string' ||
      `sha256:${createHash('sha256').update(tokenUid).digest('hex')}` !== node.tokenIdentitySha256 ||
      tokenMetadata.name !== `${node.nodeName}-token` ||
      tokenMetadata.namespace !== 'system' ||
      object(token.spec).site_name !== expected.siteName ||
      object(tokenMetadata.labels)['xcsh-node'] !== node.nodeName
    )
      throw new Error('Original operational node token differs');
    const cloud = object(await port.cloud(node.nodeName, signal));
    // Correlation checks hardware identity. Registration liveness is a separate required read,
    // so an exact offline registration can retain negative evidence rather than erase it.
    const identityRegistration = structuredClone(registration);
    object(object(identityRegistration.object).status).current_state = 'ONLINE';
    const joins = correlateGcpPhysicalInterfaces(cloudMatches[0], cloud, identityRegistration, configuration);
    const source = sourceMatches[0];
    if (source.zone !== cloudMatches[0].zone || !Array.isArray(cloud.networkInterfaces))
      throw new Error('Operational binding cloud topology differs');
    const interfaces = cloud.networkInterfaces.map(object);
    const actualNics = joins.map((join, index) => {
      const address = interfaces[index].networkIP;
      if (
        join.device !== source.devices[index] ||
        address !== source.addresses[index] ||
        (index === 0 && address !== source.sloAddress)
      )
        throw new Error('Operational source physical address join differs');
      return fingerprint({ join, address, network: interfaces[index].network, subnet: interfaces[index].subnetwork });
    });
    if (fingerprint(actualNics) !== fingerprint(node.nics)) throw new Error('Original operational NIC joins differ');
  }
  if (fingerprint(await port.persisted(signal)) !== fingerprint(persisted))
    throw new Error('Operational ownership changed during binding');
  signal?.throwIfAborted();
  return expected;
}
