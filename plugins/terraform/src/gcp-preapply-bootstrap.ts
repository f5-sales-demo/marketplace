import { decodeEvidenceObject } from '../../platform/src/ce/evidence-json';
import type {
  GcpBootstrapEvidenceBinding,
  GcpBootstrapEvidenceSource,
  OriginalGcpBootstrapEvidence,
} from '../../platform/src/ce/gcp-bootstrap-evidence';
import type { InstalledCaptureContext } from './installed-capture-context';
import {
  assertOriginalXcshCreationBodyContext,
  type OriginalXcshCreationBodyEvidence,
  readOriginalXcshCreationBody,
} from './xcsh-creation-body';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original preapply bootstrap object required');
  return value as Json;
};
export interface OriginalGcpPreapplyBootstrapEvidence {
  readonly schemaVersion: 3;
  readonly executor: OriginalXcshCreationBodyEvidence['executor'];
  readonly kind: 'original-gcp-preapply-bootstrap-candidate';
  readonly xcshProviderVersion: '15.16.2';
  readonly planSha256: string;
  readonly readerResultSha256: string;
  readonly siteCreationSha256: string;
  readonly tokenCreationSha256: string;
  readonly bootstrap: OriginalGcpBootstrapEvidence;
  readonly creationOwnershipCorroborated: true;
  readonly gcpWireCorroborated: true;
  readonly bootstrapOwnershipQualified: false;
}
const issued = new WeakMap<object, () => Promise<string>>();
const contextChecks = new WeakMap<object, (context: InstalledCaptureContext) => Promise<void>>();

/** During the owning apply, join exact creation receipts and original Platform
 * bodies instead of starting a competing state read. This is a source candidate,
 * not single-use checkout or original VM/NIC/insertion/guest acceptance.
 */
export async function collectOriginalGcpPreapplyBootstrap(input: {
  site: OriginalXcshCreationBodyEvidence;
  token: OriginalXcshCreationBodyEvidence;
  binding: Omit<GcpBootstrapEvidenceBinding, 'siteUid' | 'tokenUid'>;
  platform: GcpBootstrapEvidenceSource;
}): Promise<OriginalGcpPreapplyBootstrapEvidence> {
  const site = input.site,
    token = input.token,
    binding = structuredClone(input.binding);
  const platform = Object.freeze({ ...input.platform });
  if (
    binding.owner.provider !== 'gcp' ||
    binding.owner.engine !== 'terraform' ||
    typeof platform.assertBody !== 'function' ||
    typeof platform.inspect !== 'function' ||
    typeof platform.readJwt !== 'function'
  )
    throw new Error('Original Terraform Platform bootstrap source required');
  if (
    site.target.type_name !== 'xcsh_securemesh_site_v2' ||
    token.target.type_name !== 'xcsh_token' ||
    site.target.name !== binding.siteName ||
    token.target.name !== binding.tokenName ||
    site.planSha256 !== token.planSha256 ||
    site.readerResultSha256 !== token.readerResultSha256
  )
    throw new Error('Original joint Site and Token creation scope required');
  const labels = (value: Json, node?: string) => {
    const declared = object(object(value.metadata).labels);
    const expected = {
      'xcsh-deployment': binding.deploymentName,
      'xcsh-engine': 'terraform',
      ...(node === undefined ? { 'ves.io/provider': 'ves-io-GOOGLE' } : { 'xcsh-node': node }),
    };
    if (
      Object.keys(declared).sort().join(',') !== Object.keys(expected).sort().join(',') ||
      Object.entries(expected).some(([key, value]) => declared[key] !== value)
    )
      throw new Error('Original preapply bootstrap owned labels differ');
  };
  const verify = async () => {
    const siteBody = await readOriginalXcshCreationBody(site),
      tokenBody = await readOriginalXcshCreationBody(token);
    await platform.assertBody(siteBody);
    await platform.assertBody(tokenBody);
    const siteValue = decodeEvidenceObject(siteBody.bytes),
      tokenValue = decodeEvidenceObject(tokenBody.bytes);
    labels(siteValue);
    labels(tokenValue, binding.nodeName);
    const gcp = object(object(siteValue.spec).gcp),
      notManaged = object(gcp.not_managed);
    if (
      Object.keys(gcp).join(',') !== 'not_managed' ||
      Object.keys(notManaged).join(',') !== 'node_list' ||
      !Array.isArray(notManaged.node_list)
    )
      throw new Error('Original preapply GCP not-managed mapping required');
    const siteUid = object(siteValue.system_metadata).uid,
      tokenUid = object(tokenValue.system_metadata).uid;
    if (typeof siteUid !== 'string' || typeof tokenUid !== 'string') throw new Error('Original creation UIDs required');
    const bootstrap = await platform.inspect(siteBody, tokenBody, { ...binding, siteUid, tokenUid });
    await readOriginalXcshCreationBody(site);
    await readOriginalXcshCreationBody(token);
    return bootstrap;
  };
  const bootstrap = await verify();
  const value = Object.freeze({
    schemaVersion: 3 as const,
    executor: site.executor,
    kind: 'original-gcp-preapply-bootstrap-candidate' as const,
    xcshProviderVersion: '15.16.2' as const,
    planSha256: site.planSha256,
    readerResultSha256: site.readerResultSha256,
    siteCreationSha256: site.creationIdentitySha256,
    tokenCreationSha256: token.creationIdentitySha256,
    bootstrap,
    creationOwnershipCorroborated: true as const,
    gcpWireCorroborated: true as const,
    bootstrapOwnershipQualified: false as const,
  });
  contextChecks.set(value, async (context) => {
    await assertOriginalXcshCreationBodyContext(site, context);
    await assertOriginalXcshCreationBodyContext(token, context);
  });
  let refused = false;
  issued.set(value, async () => {
    if (refused) throw new Error('Original preapply bootstrap evidence retired');
    try {
      const current = await verify();
      if (JSON.stringify(current) !== JSON.stringify(bootstrap))
        throw new Error('Original preapply bootstrap source changed');
      return await platform.readJwt(bootstrap);
    } catch (error) {
      refused = true;
      throw error;
    }
  });
  return value;
}

/** Private fresh inspection only; durable one-use checkout remains a separate gate. */
export async function readOriginalGcpPreapplyBootstrapJwt(
  value: OriginalGcpPreapplyBootstrapEvidence,
): Promise<string> {
  const read = issued.get(value);
  if (!read) throw new Error('Original preapply bootstrap candidate required');
  return read();
}

/** Bind controller composition to the exact original source context. */
export async function assertOriginalGcpPreapplyBootstrapContext(
  value: OriginalGcpPreapplyBootstrapEvidence,
  context: InstalledCaptureContext,
): Promise<void> {
  const check = contextChecks.get(value);
  if (!check) throw new Error('Original preapply bootstrap context required');
  await check(context);
}
