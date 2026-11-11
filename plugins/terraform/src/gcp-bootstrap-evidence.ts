import { createHash } from 'node:crypto';
import { decodeEvidenceObject } from '../../platform/src/ce/evidence-json';
import type {
  GcpBootstrapEvidenceBinding,
  GcpBootstrapEvidenceSource,
  OriginalGcpBootstrapEvidence,
} from '../../platform/src/ce/gcp-bootstrap-evidence';
import type { OriginalGcpPlatformHttpBody } from '../../platform/src/ce/gcp-http-capture';
import { resolveInstalledGcpVersionProfile } from './installed-version-profile';
import type { PlanReceipt, TerraformRunner } from './runner';

type Json = Record<string, unknown>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const sha256 = /^[a-f0-9]{64}$/;
const name = /^[a-z][a-z0-9-]{0,62}$/;
const object = (value: unknown, context = 'Terraform bootstrap creation'): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Original ${context} object required`);
  return value as Json;
};

export interface GcpTerraformBootstrapInput {
  /** Trusted registered Platform service only; never a tool argument. */
  readonly platform: GcpBootstrapEvidenceSource;
  readonly binding: Omit<GcpBootstrapEvidenceBinding, 'siteUid' | 'tokenUid'>;
  readonly receipt: PlanReceipt;
  readonly terraformVersion: string;
  readonly reader: Pick<TerraformRunner, 'readAppliedResourceFields'>;
  readonly environment: Record<string, string | undefined>;
  readonly site: OriginalGcpPlatformHttpBody;
  readonly token: OriginalGcpPlatformHttpBody;
  readonly signal?: AbortSignal;
}
export interface OriginalGcpTerraformBootstrapEvidence {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-terraform-bootstrap-candidate';
  readonly planSha256: string;
  readonly stateSha256: string;
  readonly stateLineage: string;
  readonly stateSerial: number;
  readonly xcshProviderVersion: '15.15.7';
  readonly siteAddress: string;
  readonly tokenAddress: string;
  readonly bootstrap: OriginalGcpBootstrapEvidence;
  readonly creationOwnershipCorroborated: true;
  readonly gcpWireCorroborated: true;
  readonly bootstrapOwnershipQualified: false;
}
const issued = new WeakMap<
  OriginalGcpTerraformBootstrapEvidence,
  { bootstrap: OriginalGcpBootstrapEvidence; platform: GcpBootstrapEvidenceSource }
>();

function labels(state: Json, api: Json, expected: Record<string, string>, site: boolean) {
  const declared = object(state.labels),
    actual = object(object(api.metadata).labels);
  if (
    Object.keys(declared).length !== Object.keys(expected).length ||
    Object.entries(expected).some(([key, value]) => declared[key] !== value || actual[key] !== value) ||
    Object.keys(actual).some((key) => !Object.hasOwn(expected, key) && !(site && key === 'ves.io/provider')) ||
    (site && actual['ves.io/provider'] !== 'ves-io-GOOGLE')
  )
    throw new Error('Original Terraform bootstrap owned labels or Google provider marker differ');
}
function creation(state: Json, api: Json, expectedName: string): string {
  const metadata = object(api.metadata),
    uid = object(api.system_metadata).uid;
  if (
    typeof uid !== 'string' ||
    !uid ||
    state.creation_identity_sha256 !== `sha256:${hash(uid)}` ||
    state.name !== expectedName ||
    metadata.name !== expectedName ||
    state.namespace !== 'system' ||
    metadata.namespace !== 'system'
  )
    throw new Error('Original Terraform bootstrap creation identity differs');
  return uid;
}

/** Original post-apply field corroboration only. VM/token/NIC joins, supported
 * bootstrap admission and shared durable one-use checkout still gate execution.
 * The original runner reads its own stable state; token uid/content are never selected.
 */
export async function collectOriginalGcpTerraformBootstrap(
  input: GcpTerraformBootstrapInput,
): Promise<OriginalGcpTerraformBootstrapEvidence> {
  input = { ...input, environment: { ...input.environment } };
  const platform = Object.freeze({ ...input.platform });
  if (
    typeof platform.assertBody !== 'function' ||
    typeof platform.inspect !== 'function' ||
    typeof platform.readJwt !== 'function'
  )
    throw new Error('Verified Platform bootstrap source unavailable; update Platform');
  const binding = structuredClone(input.binding),
    receipt = structuredClone(input.receipt);
  if (
    binding.owner.provider !== 'gcp' ||
    binding.owner.engine !== 'terraform' ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== binding.owner.deploymentId ||
    receipt.operation ||
    receipt.actionInvocations?.length ||
    [binding.deploymentName, binding.siteName, binding.nodeName, binding.tokenName].some(
      (value) => !name.test(value),
    ) ||
    !sha256.test(receipt.planSha256) ||
    !sha256.test(receipt.configurationSha256)
  )
    throw new Error('Original Terraform bootstrap owning receipt and scope required');
  const profile = resolveInstalledGcpVersionProfile({
    terraformVersion: input.terraformVersion,
    providerLockSha256: receipt.providerLockSha256,
  });
  if (profile.googleVersion !== '8.11.0' || profile.xcshVersion !== '15.15.7')
    throw new Error('Original qualified Terraform bootstrap provider mapping required');
  await platform.assertBody(input.site);
  await platform.assertBody(input.token);
  input.signal?.throwIfAborted();
  const siteAddress = `xcsh_securemesh_site_v2.${binding.siteName.replaceAll('-', '_')}`,
    tokenAddress = `xcsh_token.${binding.nodeName.replaceAll('-', '_')}`;
  const selections = {
    [siteAddress]: ['name', 'namespace', 'labels', 'creation_identity_sha256'],
    [tokenAddress]: ['name', 'namespace', 'labels', 'creation_identity_sha256', 'site_name', 'type'],
  };
  const readState = async () =>
    structuredClone(
      await input.reader.readAppliedResourceFields(receipt, selections, { ...input.environment }, input.signal),
    );
  const state = await readState();
  if (
    state.schemaVersion !== 1 ||
    state.planSha256 !== receipt.planSha256 ||
    !sha256.test(state.stateSha256) ||
    typeof state.lineage !== 'string' ||
    !state.lineage ||
    !Number.isSafeInteger(state.serial) ||
    state.serial < 1 ||
    Object.keys(state.resources).sort().join(',') !== [siteAddress, tokenAddress].sort().join(',')
  )
    throw new Error('Original Terraform bootstrap applied state snapshot differs');
  const site = decodeEvidenceObject(input.site.bytes),
    token = decodeEvidenceObject(input.token.bytes);
  const siteState = object(state.resources[siteAddress]),
    tokenState = object(state.resources[tokenAddress]);
  const siteUid = creation(siteState, site, binding.siteName),
    tokenUid = creation(tokenState, token, binding.tokenName);
  const declared = { 'xcsh-deployment': binding.deploymentName, 'xcsh-engine': 'terraform' };
  labels(siteState, site, declared, true);
  labels(tokenState, token, { ...declared, 'xcsh-node': binding.nodeName }, false);
  const gcp = object(object(site.spec, 'GCP Site').gcp, 'GCP'),
    notManaged = object(gcp.not_managed, 'GCP not-managed');
  if (
    Object.keys(gcp).join(',') !== 'not_managed' ||
    Object.keys(notManaged).join(',') !== 'node_list' ||
    !Array.isArray(notManaged.node_list)
  )
    throw new Error('Original GCP not-managed Site wire mapping required');
  if (tokenState.site_name !== binding.siteName || tokenState.type !== 1)
    throw new Error('Original Terraform bootstrap token Site binding differs');
  await platform.inspect(input.site, input.token, { ...binding, siteUid, tokenUid });
  input.signal?.throwIfAborted();
  await platform.assertBody(input.site);
  await platform.assertBody(input.token);
  const currentState = await readState();
  input.signal?.throwIfAborted();
  if (JSON.stringify(currentState) !== JSON.stringify(state))
    throw new Error('Original Terraform bootstrap state changed during collection');
  await platform.assertBody(input.site);
  await platform.assertBody(input.token);
  const bootstrap = await platform.inspect(input.site, input.token, { ...binding, siteUid, tokenUid });
  input.signal?.throwIfAborted();
  const value: OriginalGcpTerraformBootstrapEvidence = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-terraform-bootstrap-candidate',
    planSha256: receipt.planSha256,
    stateSha256: state.stateSha256,
    stateLineage: state.lineage,
    stateSerial: state.serial,
    xcshProviderVersion: '15.15.7',
    siteAddress,
    tokenAddress,
    bootstrap,
    creationOwnershipCorroborated: true,
    gcpWireCorroborated: true,
    bootstrapOwnershipQualified: false,
  });
  issued.set(value, { bootstrap, platform });
  return value;
}

/** Original-source private inspection; never a replacement for durable checkout. */
export async function readOriginalGcpTerraformBootstrapJwt(
  value: OriginalGcpTerraformBootstrapEvidence,
): Promise<string> {
  const source = issued.get(value);
  if (!source) throw new Error('Original Terraform bootstrap candidate required');
  return source.platform.readJwt(source.bootstrap);
}
