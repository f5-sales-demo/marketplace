import { createHash } from 'node:crypto';
import { decodeEvidenceObject } from './evidence-json';
import { joinOriginalGcpInsertAuditEvidence, type OriginalGcpInsertAuditJoinInput } from './gcp-insert-audit-evidence';
import { readOriginalGcpInsertSourceBodies } from './gcp-insert-evidence';
import {
  assertOriginalGcpPreapplyBootstrapContext,
  type OriginalGcpPreapplyBootstrapEvidence,
  readOriginalGcpPreapplyBootstrapJwt,
} from './gcp-preapply-bootstrap';
import type { InstalledCaptureContext } from './installed-capture-context';

type Json = Record<string, unknown>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original bootstrap VM object required');
  return value as Json;
};
/** Join original Platform bootstrap and independent cloud/audit observations.
 * This corroborates ownership and userdata only; source lifetime, single-use
 * authorization, guest and operational acceptance remain mandatory.
 */
export async function joinOriginalGcpBootstrapVm(input: {
  context: InstalledCaptureContext;
  bootstrap: OriginalGcpPreapplyBootstrapEvidence;
  cloud: OriginalGcpInsertAuditJoinInput;
}) {
  const { context, bootstrap, cloud } = input;
  await assertOriginalGcpPreapplyBootstrapContext(bootstrap, context);
  await context.assertWithinDeadline();
  await context.assertInputs();
  const base = bootstrap.bootstrap,
    source = cloud.source;
  if (
    source.planSha256 !== bootstrap.planSha256 ||
    source.project !== base.owner.account ||
    source.nodeName !== base.nodeName ||
    source.zone.slice(0, -2) !== base.owner.region ||
    source.parentPid !== bootstrap.executor.pid ||
    source.parentStart !== bootstrap.executor.start ||
    source.parentBoot !== bootstrap.executor.boot
  )
    throw new Error('Original bootstrap creation and insert scope or parent differs');
  const bodies = readOriginalGcpInsertSourceBodies(source);
  const request = decodeEvidenceObject(Buffer.from(bodies.requestBody)),
    metadata = object(request.metadata),
    labels = object(request.labels);
  if (!Array.isArray(metadata.items)) throw new Error('Original VM metadata required');
  const userdata = metadata.items.map(object).filter((row) => row.key === 'user-data');
  if (
    userdata.length !== 1 ||
    typeof userdata[0].value !== 'string' ||
    hash(userdata[0].value) !== source.bootstrapSha256
  )
    throw new Error('Original VM user-data identity differs');
  const jwt = await readOriginalGcpPreapplyBootstrapJwt(bootstrap);
  let config: Json;
  try {
    config = object(Bun.YAML.parse(userdata[0].value));
  } catch {
    throw new Error('Original token-only cloud-init required');
  }
  if (
    !userdata[0].value.startsWith('#cloud-config') ||
    Object.keys(config).join(',') !== 'write_files' ||
    !Array.isArray(config.write_files) ||
    config.write_files.length !== 1
  )
    throw new Error('Original token-only cloud-init required');
  const file = object(config.write_files[0]);
  if (
    Object.keys(file).sort().join(',') !== 'content,owner,path,permissions' ||
    file.path !== '/etc/vpm/user_data' ||
    file.owner !== 'root' ||
    file.permissions !== '0600' ||
    typeof file.content !== 'string' ||
    file.content.trim() !== `token: ${jwt}`
  )
    throw new Error('Original Site-bound JWT or certified cloud-init differs');
  if (
    labels['xcsh-deployment'] !== base.deploymentName ||
    labels['xcsh-site'] !== base.siteName ||
    labels['xcsh-node'] !== base.nodeName ||
    labels['xcsh-engine'] !== 'terraform'
  )
    throw new Error('Original VM bootstrap ownership labels differ');
  const vm = await joinOriginalGcpInsertAuditEvidence(cloud);
  if (
    vm.accountSha256 !== context.authentication.accountSha256 ||
    vm.audienceSha256 !== context.authentication.audienceSha256 ||
    vm.adcSha256 !== context.authentication.snapshotSha256 ||
    vm.interfaces.length !== 2
  )
    throw new Error('Original admitted principal, snapshot or CE interfaces differ');
  await assertOriginalGcpPreapplyBootstrapContext(bootstrap, context);
  await readOriginalGcpPreapplyBootstrapJwt(bootstrap);
  readOriginalGcpInsertSourceBodies(source);
  await context.assertInputs();
  await context.assertWithinDeadline();
  return Object.freeze({
    ...vm,
    schemaVersion: 2 as const,
    kind: 'original-gcp-bootstrap-vm-audit-candidate' as const,
    siteCreationSha256: bootstrap.siteCreationSha256,
    tokenCreationSha256: bootstrap.tokenCreationSha256,
    jwtSha256: base.jwtSha256,
    bootstrapCorroborated: true as const,
    bootstrapOwnershipQualified: false as const,
    originalInsertQualified: false as const,
  });
}
