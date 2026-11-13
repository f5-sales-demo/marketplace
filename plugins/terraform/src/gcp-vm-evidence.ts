import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { decodeEvidenceObject } from './evidence-json';
import { isEvidenceRfc3339 } from './evidence-rfc3339';
import type {
  GcpCloudReadEvidence,
  GcpInsertOperationCandidate,
  OriginalGcpVm,
  openGcpCloudSerialReader,
} from './gcp-cloud-serial-reader';
import { type OriginalGcpInsertSourceCandidate, readOriginalGcpInsertSourceBodies } from './gcp-insert-evidence';

type Json = Record<string, unknown>;
type Reader = Awaited<ReturnType<typeof openGcpCloudSerialReader>>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original VM evidence object required');
  return value as Json;
};
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Json)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function metadata(value: unknown) {
  const entries: Record<string, string> = Object.create(null);
  const raw = object(value);
  if (!Array.isArray(raw.items)) throw new Error('Original VM metadata items required');
  for (const item of raw.items) {
    const pair = object(item);
    if (
      typeof pair.key !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,127}$/.test(pair.key) ||
      typeof pair.value !== 'string' ||
      Object.hasOwn(entries, pair.key)
    )
      throw new Error('Original unique VM metadata required');
    entries[pair.key] = pair.value;
  }
  return entries;
}
function resourceLink(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Original interface resource link required');
  if (/^projects\/[a-z0-9-]+\/(?:global\/networks|regions\/[a-z0-9-]+\/subnetworks)\/[a-z0-9-]+$/.test(value))
    return value;
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !['compute.googleapis.com', 'www.googleapis.com'].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith('/compute/v1/projects/')
  )
    throw new Error('Original interface link scope differs');
  return url.pathname.slice('/compute/v1/'.length);
}
export interface OriginalGcpVmJoinInput {
  readonly source: OriginalGcpInsertSourceCandidate;
  readonly reader: Reader;
  readonly absent: GcpCloudReadEvidence & { readonly present: false };
  readonly operation: GcpInsertOperationCandidate;
  readonly instance: OriginalGcpVm;
}
/** Corroborate cloud identity only. The controller still requires verified source
 * lifetime, audit attribution and Platform bootstrap ownership before acceptance.
 * Raw evidence remains private and every read rechecks its original reader inputs.
 */
export async function joinOriginalGcpVmEvidence(input: OriginalGcpVmJoinInput) {
  const { source, reader, absent, operation, instance } = input;
  const bodies = readOriginalGcpInsertSourceBodies(source);
  const records = [absent, operation, instance] as const;
  const retained = [];
  for (const record of records) {
    const read = await reader.readEvidence(record);
    if (
      read.scope.project !== source.project ||
      read.scope.zone !== source.zone ||
      read.scope.node !== source.nodeName ||
      !Number.isSafeInteger(record.startedAt) ||
      !Number.isSafeInteger(record.finishedAt) ||
      record.finishedAt < record.startedAt ||
      Date.now() < record.finishedAt ||
      Date.now() - record.finishedAt > 300000
    )
      throw new Error('Fresh original scoped cloud evidence required');
    retained.push(read);
  }
  const initial = decodeEvidenceObject(retained[0].raw),
    op = decodeEvidenceObject(retained[1].raw),
    vm = decodeEvidenceObject(retained[2].raw);
  const absentError = object(initial.error);
  if (
    absent.present !== false ||
    absentError.code !== 404 ||
    !Array.isArray(absentError.errors) ||
    !absentError.errors.some((value) => object(value).reason === 'notFound') ||
    absent.finishedAt > operation.startedAt ||
    operation.operationId !== source.operationId ||
    operation.operationName !== source.operationName ||
    operation.targetName !== source.nodeName ||
    operation.zone !== source.zone ||
    !operation.targetId ||
    operation.targetId !== instance.value.id ||
    (source.targetId !== null && source.targetId !== operation.targetId) ||
    op.id !== operation.operationId ||
    op.name !== operation.operationName ||
    op.error !== undefined ||
    op.operationType !== 'insert' ||
    !isEvidenceRfc3339(op.insertTime) ||
    vm.id !== instance.value.id ||
    vm.name !== source.nodeName ||
    !isEvidenceRfc3339(vm.creationTimestamp) ||
    Date.parse(op.insertTime) < absent.startedAt ||
    Date.parse(vm.creationTimestamp) < Date.parse(op.insertTime) ||
    Date.parse(vm.creationTimestamp) > instance.finishedAt ||
    (vm.serviceAccounts !== undefined && (!Array.isArray(vm.serviceAccounts) || vm.serviceAccounts.length))
  )
    throw new Error('Original absence, insert operation and numeric VM incarnation differ');
  const request = decodeEvidenceObject(Buffer.from(bodies.requestBody));
  const items = metadata(vm.metadata);
  if (
    hash(canonical(items)) !== source.metadataSha256 ||
    !items['user-data'] ||
    hash(items['user-data']) !== source.bootstrapSha256 ||
    hash(canonical(object(vm.labels))) !== source.labelsSha256 ||
    !Array.isArray(vm.networkInterfaces) ||
    !Array.isArray(request.networkInterfaces) ||
    vm.networkInterfaces.length !== request.networkInterfaces.length
  )
    throw new Error('Original VM bootstrap metadata, ownership labels or interfaces differ');
  const interfaces = vm.networkInterfaces.map((raw, index) => {
    const actual = object(raw),
      wanted = object((request.networkInterfaces as unknown[])[index]);
    if (
      actual.name !== `nic${index}` ||
      resourceLink(actual.network) !== resourceLink(wanted.network) ||
      resourceLink(actual.subnetwork) !== resourceLink(wanted.subnetwork) ||
      typeof actual.networkIP !== 'string' ||
      isIP(actual.networkIP) !== 4 ||
      (wanted.networkIP !== undefined && wanted.networkIP !== '' && wanted.networkIP !== actual.networkIP)
    )
      throw new Error('Original ordered CE interface mapping differs');
    const requestedAccess = wanted.accessConfigs ?? [],
      actualAccess = actual.accessConfigs ?? [];
    if (
      !Array.isArray(requestedAccess) ||
      !Array.isArray(actualAccess) ||
      requestedAccess.length !== actualAccess.length
    )
      throw new Error('Original interface egress configuration differs');
    for (const [i, rawRequested] of requestedAccess.entries()) {
      const expected = object(rawRequested),
        observed = object(actualAccess[i]);
      for (const key of ['type', 'networkTier', 'natIP'])
        if (expected[key] !== undefined && expected[key] !== '' && expected[key] !== observed[key])
          throw new Error('Original requested interface access configuration differs');
    }
    return Object.freeze({
      index,
      name: actual.name as string,
      address: actual.networkIP,
      network: resourceLink(actual.network),
      subnetwork: resourceLink(actual.subnetwork),
    });
  });
  // Recheck all original bytes and guards after the joins; a successful initial
  // read cannot excuse a changed file, credential or owner during correlation.
  for (const record of records) await reader.readEvidence(record);
  const current = await reader.instance(instance.zone, instance.name);
  if (!current.present || current.value.id !== instance.value.id)
    throw new Error('Original VM changed during final correlation');
  readOriginalGcpInsertSourceBodies(source);
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: 'original-gcp-vm-cloud-candidate' as const,
    project: source.project,
    zone: source.zone,
    nodeName: source.nodeName,
    instanceId: instance.value.id,
    operationId: operation.operationId,
    operationName: operation.operationName,
    resourceAddress: source.resourceAddress,
    creationTimestamp: vm.creationTimestamp,
    bootstrapSha256: source.bootstrapSha256,
    metadataSha256: source.metadataSha256,
    labelsSha256: source.labelsSha256,
    interfaces: Object.freeze(interfaces),
    sourceRequestSha256: source.requestBodySha256,
    absenceSha256: absent.sha256,
    operationSha256: operation.sha256,
    instanceSha256: instance.sha256,
    accountSha256: retained[2].authentication.accountSha256,
    audienceSha256: retained[2].authentication.audienceSha256,
    adcSha256: retained[2].authentication.adcSha256,
    cloudEvidenceCorroborated: true as const,
    applyRpcQualified: false as const,
    originalInsertQualified: false as const,
  });
}
