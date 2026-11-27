import { fingerprint } from '../../gcloud/src/ce/discovery';
import { gcpSiteAccessSpec } from '../../gcloud/src/ce/site-access';
import type { GcpCeIntent } from '../../gcloud/src/ce/types';
import { decodeEvidenceObject } from '../../platform/src/ce/evidence-json';
import type {
  GcpBootstrapEvidenceBinding,
  GcpBootstrapEvidenceSource,
  OriginalGcpBootstrapEvidence,
} from '../../platform/src/ce/gcp-bootstrap-evidence';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';
import type { InstalledCaptureContext } from './installed-capture-context';
import { readOwnedInstalledInput } from './installed-runtime';
import { assertSameOriginalInput } from './original-input-monitor';
import {
  assertOriginalXcshCreationBodyCallback,
  assertOriginalXcshCreationBodyContext,
  type OriginalXcshCreationBodyEvidence,
  readOriginalXcshCreationBody,
  readOriginalXcshCreationBodyProviderProfile,
} from './xcsh-creation-body';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original preapply bootstrap object required');
  return value as Json;
};
interface OriginalGcpPreapplyBootstrapEvidenceBase {
  readonly executor: OriginalXcshCreationBodyEvidence['executor'];
  readonly kind: 'original-gcp-preapply-bootstrap-candidate';
  readonly planSha256: string;
  readonly readerRequestSha256: string;
  readonly siteReaderEvidenceSha256: string;
  readonly tokenReaderEvidenceSha256: string;
  readonly siteCreationSha256: string;
  readonly tokenCreationSha256: string;
  readonly bootstrap: OriginalGcpBootstrapEvidence;
  readonly creationOwnershipCorroborated: true;
  readonly gcpWireCorroborated: true;
  readonly bootstrapOwnershipQualified: false;
}
export type OriginalGcpPreapplyBootstrapEvidence = OriginalGcpPreapplyBootstrapEvidenceBase &
  (
    | { readonly schemaVersion: 4; readonly xcshProviderVersion: '15.17.3' }
    | { readonly schemaVersion: 5; readonly xcshProviderVersion: '15.17.6' }
    | { readonly schemaVersion: 6; readonly xcshProviderVersion: '15.17.8' }
    | { readonly schemaVersion: 7; readonly xcshProviderVersion: '15.17.9' }
  );
const issued = new WeakMap<object, () => Promise<string>>();
const contextChecks = new WeakMap<object, (context: InstalledCaptureContext) => Promise<void>>();
const callbackChecks = new WeakMap<object, (callback: OriginalApplyCallbackContext) => Promise<void>>();
export interface OriginalGcpSiteAccessConfiguration {
  readonly siteName: string;
  readonly siteUid: string;
  readonly providerVersion: '15.17.3' | '15.17.6' | '15.17.8' | '15.17.9';
  readonly publicKey: string;
  readonly settingsSha256: string;
  readonly commandsAuthorized: false;
}
const siteAccessReads = new WeakMap<
  object,
  (context: InstalledCaptureContext) => Promise<Readonly<OriginalGcpSiteAccessConfiguration>>
>();

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
    site.readerRequestSha256 !== token.readerRequestSha256
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
  const siteProfile = await readOriginalXcshCreationBodyProviderProfile(site);
  const tokenProfile = await readOriginalXcshCreationBodyProviderProfile(token);
  if (siteProfile !== tokenProfile) throw new Error('Original Site and Token provider profiles differ');
  const bootstrap = await verify();
  const value = Object.freeze({
    ...(siteProfile.xcshVersion === '15.17.9'
      ? { schemaVersion: 7 as const, xcshProviderVersion: '15.17.9' as const }
      : siteProfile.xcshVersion === '15.17.8'
        ? { schemaVersion: 6 as const, xcshProviderVersion: '15.17.8' as const }
        : siteProfile.xcshVersion === '15.17.6'
          ? { schemaVersion: 5 as const, xcshProviderVersion: '15.17.6' as const }
          : { schemaVersion: 4 as const, xcshProviderVersion: '15.17.3' as const }),
    executor: site.executor,
    kind: 'original-gcp-preapply-bootstrap-candidate' as const,
    planSha256: site.planSha256,
    readerRequestSha256: site.readerRequestSha256,
    siteReaderEvidenceSha256: site.readerResultSha256,
    tokenReaderEvidenceSha256: token.readerResultSha256,
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
  callbackChecks.set(value, async (callback) => {
    await assertOriginalXcshCreationBodyCallback(site, callback);
    await assertOriginalXcshCreationBodyCallback(token, callback);
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
  let accessRefused = false;
  siteAccessReads.set(value, async (context) => {
    if (accessRefused) throw new Error('Original Site SSH source retired');
    try {
      await assertOriginalGcpPreapplyBootstrapContext(value, context);
      await readOriginalGcpPreapplyBootstrapJwt(value);
      const admitted = context.inputs['workspace:gcp-terraform-input-identity.json'];
      if (!admitted) throw new Error('Original reviewed Site SSH intent required');
      const input = await readOwnedInstalledInput(admitted.path);
      assertSameOriginalInput(admitted, input.binding);
      const saved = decodeEvidenceObject(input.bytes) as unknown as { intent: GcpCeIntent; intentFingerprint: string };
      if (
        saved.intentFingerprint !== fingerprint(saved.intent) ||
        saved.intent.project !== binding.owner.account ||
        saved.intent.region !== binding.owner.region ||
        saved.intent.deploymentName !== binding.deploymentName ||
        !saved.intent.sites.some(
          (site) => site.name === binding.siteName && site.nodes.some((node) => node.name === binding.nodeName),
        )
      )
        throw new Error('Original reviewed Site SSH ownership differs');
      const expected = gcpSiteAccessSpec(saved.intent, value.xcshProviderVersion);
      if (!expected) throw new Error('Original Site SSH configuration unavailable');
      const body = await readOriginalXcshCreationBody(site);
      const source = decodeEvidenceObject(body.bytes),
        spec = object(source.spec);
      const observed = { admin_user_credentials: spec.admin_user_credentials, blocked_services: spec.blocked_services };
      if (
        fingerprint(observed) !== fingerprint(expected) ||
        object(source.system_metadata).uid !== value.bootstrap.siteUid
      )
        throw new Error('Original Site SSH key or SLI-only settings differ from reviewed intent');
      await readOriginalGcpPreapplyBootstrapJwt(value);
      await assertOriginalGcpPreapplyBootstrapContext(value, context);
      assertSameOriginalInput(admitted, (await readOwnedInstalledInput(admitted.path)).binding);
      return Object.freeze({
        siteName: binding.siteName,
        siteUid: value.bootstrap.siteUid,
        providerVersion: value.xcshProviderVersion,
        publicKey: expected.admin_user_credentials.ssh_key,
        settingsSha256: fingerprint(expected).slice(7),
        commandsAuthorized: false,
      });
    } catch (error) {
      accessRefused = true;
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

/** Fresh final Site and Token bodies must originate from this actual after callback. */
export async function assertOriginalGcpPreapplyBootstrapCallback(
  value: OriginalGcpPreapplyBootstrapEvidence,
  callback: OriginalApplyCallbackContext,
): Promise<void> {
  const check = callbackChecks.get(value);
  if (!check) throw new Error('Original final bootstrap callback source required');
  await check(callback);
}

/** Exact original Site body and reviewed intent only. This configures no VM
 * account and grants no guest command or SSH-authentication authority. */
export async function readOriginalGcpPreapplySiteAccess(value: unknown, context: InstalledCaptureContext) {
  const read = value && typeof value === 'object' ? siteAccessReads.get(value) : undefined;
  if (!read) throw new Error('Original Site SSH bootstrap source required');
  return read(context);
}
