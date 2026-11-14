import { createHash } from 'node:crypto';
import { decodeEvidenceObject } from '../../platform/src/ce/evidence-json';
import type { GcpBootstrapEvidenceSource } from '../../platform/src/ce/gcp-bootstrap-evidence';
import type { OriginalGcpPlatformHttpBody } from '../../platform/src/ce/gcp-http-capture';
import { containsControlCharacters } from '../../platform/src/ce/security';
import type { InstalledCaptureContext } from './installed-capture-context';
import { type InstalledXcshCreationResult, readOriginalInstalledXcshCreation } from './installed-xcsh-creation-reader';
import { assertPreparedCreationScopeContext, inspectPreparedCreationScope } from './prepared-creation-scope';

type Target = Readonly<{ type_name: 'xcsh_token' | 'xcsh_securemesh_site_v2'; namespace: 'system'; name: string }>;
type Json = Record<string, unknown>;
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Original creation object required');
  return value as Json;
};
export interface OriginalXcshCreationBodyEvidence {
  readonly schemaVersion: 1;
  readonly kind: 'original-xcsh-creation-body-candidate';
  readonly target: Target;
  readonly executor: InstalledXcshCreationResult['executor'];
  readonly planSha256: string;
  readonly readerResultSha256: string;
  readonly bodySha256: string;
  readonly creationIdentitySha256: string;
  readonly originalCreationCorroborated: true;
  readonly bootstrapOwnershipQualified: false;
}
const issued = new WeakMap<object, () => Promise<OriginalGcpPlatformHttpBody>>();
const contexts = new WeakMap<object, InstalledCaptureContext>();

/** Original creation receipt and independently captured authenticated GET join.
 * This can run during the owning apply without starting a competing state read.
 * It grants no VM ownership, JWT, checkout, guest or apply authority.
 */
export async function joinOriginalXcshCreationBody(input: {
  context: InstalledCaptureContext;
  packet: unknown;
  result: InstalledXcshCreationResult;
  platform: Pick<GcpBootstrapEvidenceSource, 'assertBody'>;
  body: OriginalGcpPlatformHttpBody;
  target: Target;
}): Promise<OriginalXcshCreationBodyEvidence> {
  const { context, packet, result, body } = input;
  const target = Object.freeze({ ...input.target });
  if (typeof input.platform?.assertBody !== 'function') throw new Error('Verified Platform body source required');
  const assertBody = input.platform.assertBody.bind(input.platform);
  const expectedPath =
    target.type_name === 'xcsh_token'
      ? `/api/register/namespaces/system/tokens/${target.name}`
      : `/api/config/namespaces/system/securemesh_site_v2s/${target.name}`;
  let refused = false;
  const verify = async () => {
    if (refused) throw new Error('Original creation body evidence retired');
    try {
      assertPreparedCreationScopeContext(packet, context);
      await context.assertWithinDeadline();
      await context.assertInputs();
      const scope = await inspectPreparedCreationScope(packet);
      if (
        target.namespace !== 'system' ||
        !scope.resources.some(
          (row) => row.type_name === target.type_name && row.name === target.name && row.namespace === target.namespace,
        )
      )
        throw new Error('Original creation scope target required');
      const raw = await readOriginalInstalledXcshCreation(result);
      const creation = decodeEvidenceObject(raw);
      if (
        !result.complete ||
        creation.complete !== true ||
        creation.scopeSha256 !== scope.planSha256 ||
        creation.scopeFileSha256 !== scope.scope?.sha256 ||
        !Array.isArray(creation.receipts)
      )
        throw new Error('Original complete creation receipt required');
      const receipts = creation.receipts.map(object).filter((row) => {
        const actual = object(row.target);
        return (
          actual.type_name === target.type_name && actual.name === target.name && actual.namespace === target.namespace
        );
      });
      if (receipts.length !== 1) throw new Error('Original distinct creation receipt required');
      await assertBody(body);
      const response = body.evidence;
      if (
        response.path !== expectedPath ||
        response.method !== 'GET' ||
        response.requestBodySha256 !== null ||
        response.status !== 200 ||
        !response.responseComplete ||
        !response.accepted ||
        response.truncated ||
        response.origin !== context.environment.XCSH_API_URL ||
        response.credentialSha256 !== hash(context.environment.XCSH_API_TOKEN) ||
        (['provider', 'engine', 'account', 'region', 'deploymentId'] as const).some(
          (key) => response.owner[key] !== context.owner[key],
        )
      )
        throw new Error('Original authenticated creation response scope differs');
      const began = Date.parse(response.startedAt),
        finished = Date.parse(response.finishedAt),
        now = Date.now();
      if (
        !Number.isFinite(began) ||
        !Number.isFinite(finished) ||
        finished < began ||
        finished > now ||
        now - began >= 300000
      )
        throw new Error('Original creation body freshness required');
      const value = decodeEvidenceObject(body.bytes),
        metadata = object(value.metadata),
        system = object(value.system_metadata);
      if (
        metadata.name !== target.name ||
        metadata.namespace !== target.namespace ||
        typeof system.uid !== 'string' ||
        !system.uid ||
        system.uid.length > 128 ||
        containsControlCharacters(system.uid) ||
        receipts[0].creation_identity_sha256 !== hash(system.uid)
      )
        throw new Error('Original creation response identity differs');
      await assertBody(body);
      await readOriginalInstalledXcshCreation(result);
      await context.assertInputs();
      await context.assertWithinDeadline();
      return { planSha256: scope.planSha256, identity: hash(system.uid) };
    } catch (error) {
      refused = true;
      throw error;
    }
  };
  const original = await verify();
  const evidence = Object.freeze({
    schemaVersion: 1 as const,
    kind: 'original-xcsh-creation-body-candidate' as const,
    target,
    executor: Object.freeze({ ...result.executor }),
    planSha256: original.planSha256,
    readerResultSha256: result.evidenceSha256,
    bodySha256: body.evidence.bodySha256,
    creationIdentitySha256: original.identity,
    originalCreationCorroborated: true as const,
    bootstrapOwnershipQualified: false as const,
  });
  contexts.set(evidence, context);
  issued.set(evidence, async () => {
    await verify();
    return body;
  });
  return evidence;
}

/** Retain the actual private HTTP issuer; copies or retired joins grant no access. */
export async function readOriginalXcshCreationBody(evidence: OriginalXcshCreationBodyEvidence) {
  const read = issued.get(evidence);
  if (!read) throw new Error('Original creation body evidence required');
  return read();
}

/** Exact original context check for trusted controller composition. */
export async function assertOriginalXcshCreationBodyContext(
  evidence: OriginalXcshCreationBodyEvidence,
  context: InstalledCaptureContext,
): Promise<void> {
  if (contexts.get(evidence) !== context) throw new Error('Original creation body context required');
  await readOriginalXcshCreationBody(evidence);
}
