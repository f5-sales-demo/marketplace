import { createHash } from 'node:crypto';
import { decodeEvidenceObject } from './evidence-json';
import { assertOriginalGcpPlatformHttpBody, type OriginalGcpPlatformHttpBody } from './gcp-http-capture';
import type { CeOwner } from './runtime';
import { containsControlCharacters } from './security';

type Json = Record<string, unknown>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const name = /^[a-z][a-z0-9-]{0,62}$/;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original bootstrap ownership object required');
  return value as Json;
}
function required(value: Json, key: string): unknown {
  if (!Object.hasOwn(value, key)) throw new Error('Original bootstrap ownership field required');
  return value[key];
}
export interface GcpBootstrapEvidenceBinding {
  readonly owner: CeOwner;
  readonly deploymentName: string;
  readonly siteName: string;
  readonly siteUid: string;
  readonly nodeName: string;
  readonly tokenName: string;
  readonly tokenUid: string;
}
export interface OriginalGcpBootstrapEvidence {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-platform-bootstrap-candidate';
  readonly owner: Readonly<CeOwner>;
  readonly deploymentName: string;
  readonly siteName: string;
  readonly siteUid: string;
  readonly nodeName: string;
  readonly tokenName: string;
  readonly tokenUid: string;
  readonly siteBodySha256: string;
  readonly tokenBodySha256: string;
  readonly jwtSha256: string;
  readonly expiresAt: string;
  readonly metadataCorroborated: true;
  readonly bootstrapOwnershipQualified: false;
}
const issued = new WeakMap<
  OriginalGcpBootstrapEvidence,
  { site: OriginalGcpPlatformHttpBody; token: OriginalGcpPlatformHttpBody; jwt: string }
>();
async function original(body: OriginalGcpPlatformHttpBody, path: string, owner: CeOwner) {
  await assertOriginalGcpPlatformHttpBody(body);
  const record = body.evidence,
    now = Date.now();
  if (
    record.path !== path ||
    record.method !== 'GET' ||
    record.status !== 200 ||
    !record.responseComplete ||
    !record.accepted ||
    record.truncated ||
    ['provider', 'engine', 'account', 'region', 'deploymentId'].some(
      (key) => record.owner[key as keyof CeOwner] !== owner[key as keyof CeOwner],
    )
  )
    throw new Error('Original bootstrap ownership response required');
  const started = Date.parse(record.startedAt),
    finished = Date.parse(record.finishedAt);
  if (
    !Number.isFinite(started) ||
    !Number.isFinite(finished) ||
    finished < started ||
    finished > now ||
    now - started >= 300000
  )
    throw new Error('Original bootstrap ownership evidence is stale');
  return decodeEvidenceObject(body.bytes);
}
function metadata(
  value: Json,
  expectedName: string,
  expectedUid: string,
  binding: GcpBootstrapEvidenceBinding,
  node?: string,
) {
  const meta = object(required(value, 'metadata')),
    labels = object(required(meta, 'labels')),
    system = object(required(value, 'system_metadata'));
  if (
    required(meta, 'name') !== expectedName ||
    required(meta, 'namespace') !== 'system' ||
    required(system, 'uid') !== expectedUid ||
    required(labels, 'xcsh-deployment') !== binding.deploymentName ||
    required(labels, 'xcsh-engine') !== binding.owner.engine ||
    (node !== undefined && required(labels, 'xcsh-node') !== node)
  )
    throw new Error('Original bootstrap ownership differs');
}
function jwt(value: unknown): { jwt: string; expiresAt: string } {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))
    throw new Error('Original site-bound JWT required');
  const segment = value.split('.')[1],
    raw = Buffer.from(segment, 'base64url');
  if (raw.toString('base64url') !== segment) throw new Error('Original JWT encoding required');
  let claims: Json;
  try {
    claims = decodeEvidenceObject(raw);
  } catch {
    throw new Error('Original JWT claims required');
  }
  const exp = claims.exp;
  if (
    !Object.hasOwn(claims, 'exp') ||
    typeof exp !== 'number' ||
    !Number.isSafeInteger(exp) ||
    !Number.isFinite(new Date(exp * 1000).getTime()) ||
    exp * 1000 <= Date.now() + 60000
  )
    throw new Error('Original JWT expiry is missing or too near');
  return { jwt: value, expiresAt: new Date(exp * 1000).toISOString() };
}
/** Metadata source candidate only. Verified API mapping, original VM joins and
 * shared durable single-use checkout still gate bootstrap execution.
 */
export async function inspectOriginalGcpBootstrap(
  site: OriginalGcpPlatformHttpBody,
  token: OriginalGcpPlatformHttpBody,
  input: GcpBootstrapEvidenceBinding,
): Promise<OriginalGcpBootstrapEvidence> {
  const binding = structuredClone(input);
  if (
    binding?.owner?.provider !== 'gcp' ||
    !['native', 'terraform'].includes(binding.owner.engine) ||
    [binding.deploymentName, binding.siteName, binding.nodeName, binding.tokenName].some(
      (value) => typeof value !== 'string' || !name.test(value),
    ) ||
    [binding.siteUid, binding.tokenUid].some(
      (value) => typeof value !== 'string' || !value || value.length > 128 || containsControlCharacters(value),
    )
  )
    throw new Error('Original bootstrap ownership binding required');
  const siteValue = await original(
    site,
    `/api/config/namespaces/system/securemesh_site_v2s/${binding.siteName}`,
    binding.owner,
  );
  const tokenValue = await original(
    token,
    `/api/register/namespaces/system/tokens/${binding.tokenName}`,
    binding.owner,
  );
  if (
    site.evidence.captureId !== token.evidence.captureId ||
    site.evidence.origin !== token.evidence.origin ||
    site.evidence.credentialSha256 !== token.evidence.credentialSha256
  )
    throw new Error('Original bootstrap recorder context differs');
  metadata(siteValue, binding.siteName, binding.siteUid, binding);
  metadata(tokenValue, binding.tokenName, binding.tokenUid, binding, binding.nodeName);
  const spec = object(required(tokenValue, 'spec'));
  if (
    required(spec, 'site_name') !== binding.siteName ||
    ![1, 'JWT'].includes(required(spec, 'type') as string | number)
  )
    throw new Error('Original bootstrap token ownership differs');
  const material = jwt(required(spec, 'content'));
  await assertOriginalGcpPlatformHttpBody(site);
  await assertOriginalGcpPlatformHttpBody(token);
  const value: OriginalGcpBootstrapEvidence = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-platform-bootstrap-candidate',
    owner: Object.freeze(binding.owner),
    deploymentName: binding.deploymentName,
    siteName: binding.siteName,
    siteUid: binding.siteUid,
    nodeName: binding.nodeName,
    tokenName: binding.tokenName,
    tokenUid: binding.tokenUid,
    siteBodySha256: site.evidence.bodySha256,
    tokenBodySha256: token.evidence.bodySha256,
    jwtSha256: hash(material.jwt),
    expiresAt: material.expiresAt,
    metadataCorroborated: true,
    bootstrapOwnershipQualified: false,
  });
  issued.set(value, { site, token, jwt: material.jwt });
  return value;
}
/** Private inspection only; it cannot replace shared durable bootstrap checkout. */
export async function readOriginalGcpBootstrapJwt(value: OriginalGcpBootstrapEvidence): Promise<string> {
  const source = issued.get(value);
  if (!source) throw new Error('Original bootstrap candidate required');
  await assertOriginalGcpPlatformHttpBody(source.site);
  await assertOriginalGcpPlatformHttpBody(source.token);
  return source.jwt;
}

/** Trusted producer API. Executable methods stay in the issuing Platform module;
 * callers must not obtain authority through tool arguments or serialized evidence. */
export interface GcpBootstrapEvidenceSource {
  readonly assertBody: typeof assertOriginalGcpPlatformHttpBody;
  readonly inspect: typeof inspectOriginalGcpBootstrap;
  readonly readJwt: typeof readOriginalGcpBootstrapJwt;
}
export const originalGcpBootstrapSource: GcpBootstrapEvidenceSource = Object.freeze({
  assertBody: assertOriginalGcpPlatformHttpBody,
  inspect: inspectOriginalGcpBootstrap,
  readJwt: readOriginalGcpBootstrapJwt,
});
