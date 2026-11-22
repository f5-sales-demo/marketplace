import { createHash } from 'node:crypto';
import { decodeEvidenceObject } from './evidence-json';
import { isEvidenceRfc3339 } from './evidence-rfc3339';
import type { GcpInsertAuditBatch, openGcpCloudSerialReader } from './gcp-cloud-serial-reader';
import { assertOriginalInstalledGcpFinalCloudReader } from './gcp-cloud-serial-reader';
import { hasAuditControlCharacters } from './gcp-insert-audit-query';
import { readOriginalGcpInsertSourceBodies } from './gcp-insert-evidence';
import {
  assertOriginalGcpObserverVmCaptureCallback,
  type OriginalGcpObserverInsertIdentity,
  type OriginalGcpObserverVmEvidence,
  readOriginalGcpObserverAuditSource,
} from './gcp-observer-insert-evidence';
import { joinOriginalGcpVmEvidence, type OriginalGcpVmJoinInput } from './gcp-vm-evidence';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';
import { assertOriginalApplyCallback } from './installed-apply-controller';
import type { OriginalApplyGcpInventory } from './installed-initial-inventory';
import { assertOriginalApplyGcpInventoryCallback, readOriginalApplyGcpInventory } from './installed-initial-inventory';

type Json = Record<string, unknown>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original insert audit object required');
  return value as Json;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Json)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function computeLink(value: unknown): string {
  if (typeof value !== 'string' || value !== value.trim() || hasAuditControlCharacters(value))
    throw new Error('Original scoped audit response link required');
  if (value.startsWith('projects/')) return value;
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !['www.googleapis.com', 'compute.googleapis.com'].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith('/compute/v1/projects/')
  )
    throw new Error('Original scoped audit response link differs');
  return url.pathname.slice('/compute/v1/'.length);
}
function requestAttributes(payload: Json): Json {
  if (payload.requestMetadata === undefined) return {};
  const attributes = object(payload.requestMetadata).requestAttributes;
  return attributes === undefined ? {} : object(attributes);
}
function matchOriginalAuditPair(
  entries: Json[],
  source: {
    project: string;
    zone: string;
    nodeName: string;
    operationId: string;
    operationName: string;
    requestReasonSha256: string;
    labelsSha256: string;
  },
  vm: { instanceId: string; absenceStartedAt: number },
  audit: GcpInsertAuditBatch,
  account: string,
  canIpForward: boolean,
) {
  const [first, last] = entries;
  for (const [index, entry] of entries.entries()) {
    const payload = object(entry.protoPayload),
      operation = object(entry.operation);
    const labels = object(object(entry.resource).labels);
    const status = object(payload.status);
    const auth = object(payload.authenticationInfo);
    if (
      labels.instance_id !== vm.instanceId ||
      operation.id !== source.operationName ||
      operation.producer !== 'compute.googleapis.com' ||
      (index === 0
        ? operation.first !== true || operation.last === true
        : operation.last !== true || operation.first === true) ||
      typeof auth.principalEmail !== 'string' ||
      hash(auth.principalEmail) !== account ||
      (auth.serviceAccountDelegationInfo !== undefined &&
        (!Array.isArray(auth.serviceAccountDelegationInfo) || auth.serviceAccountDelegationInfo.length > 0)) ||
      (status.code !== undefined && status.code !== 0) ||
      Object.keys(status).some((key) => key !== 'code') ||
      !isEvidenceRfc3339(entry.timestamp) ||
      Date.parse(entry.timestamp as string) < vm.absenceStartedAt ||
      Date.parse(entry.timestamp as string) > Math.max(...audit.pages.map((page) => page.finishedAt))
    )
      throw new Error('Original successful audit operation name, principal or numeric VM differs');
  }
  if (Date.parse(first.timestamp as string) > Date.parse(last.timestamp as string))
    throw new Error('Original audit first/last chronology differs');
  const payload = object(first.protoPayload);
  const attributes = requestAttributes(payload);
  if (
    typeof attributes.reason !== 'string' ||
    !attributes.reason ||
    hash(attributes.reason) !== source.requestReasonSha256
  )
    throw new Error('Original audit request reason is unavailable or differs');
  const lastMetadata = object(last.protoPayload).requestMetadata;
  if (lastMetadata !== undefined) {
    const attributes = requestAttributes(object(last.protoPayload));
    if (
      attributes.reason !== undefined &&
      (typeof attributes.reason !== 'string' || hash(attributes.reason) !== source.requestReasonSha256)
    )
      throw new Error('Original final audit request reason differs');
  }
  const response = object(payload.response),
    request = object(payload.request);
  if (
    response.id !== source.operationId ||
    response.name !== source.operationName ||
    response.targetId !== vm.instanceId ||
    response.operationType !== 'insert' ||
    computeLink(response.zone) !== `projects/${source.project}/zones/${source.zone}` ||
    computeLink(response.selfLink) !==
      `projects/${source.project}/zones/${source.zone}/operations/${source.operationName}` ||
    computeLink(response.targetLink) !==
      `projects/${source.project}/zones/${source.zone}/instances/${source.nodeName}` ||
    response.error !== undefined ||
    !['PENDING', 'RUNNING', 'DONE'].includes(response.status as string) ||
    request.name !== source.nodeName ||
    request.canIpForward !== canIpForward ||
    hash(canonical(object(request.labels))) !== source.labelsSha256
  )
    throw new Error('Original audit response or requested ownership differs');
  return { firstSha256: hash(canonical(first)), lastSha256: hash(canonical(last)) };
}

export interface OriginalGcpInsertAuditJoinInput extends OriginalGcpVmJoinInput {
  readonly audit: GcpInsertAuditBatch;
}

/** Join private original source/cloud/audit evidence, using the demonstrated
 * Compute LRO name mapping. Missing request reason remains an explicit refusal.
 * Audit request/response may omit bootstrap or final response fields. Platform
 * bootstrap ownership and original source lifetime still gate full admission.
 */
export async function joinOriginalGcpInsertAuditEvidence(input: OriginalGcpInsertAuditJoinInput) {
  const { reader, source, audit } = input;
  readOriginalGcpInsertSourceBodies(source);
  const retained = await reader.readAuditEvidence(audit);
  if (
    audit.project !== source.project ||
    audit.zone !== source.zone ||
    audit.node !== source.nodeName ||
    !retained.pages.length ||
    retained.pages.length !== audit.pages.length ||
    retained.pages.some(
      (page, index) =>
        page.scope.project !== source.project ||
        page.scope.zone !== source.zone ||
        page.scope.node !== source.nodeName ||
        Date.now() < audit.pages[index].finishedAt ||
        Date.now() - audit.pages[index].finishedAt > 300000,
    )
  )
    throw new Error('Fresh original scoped audit evidence required');
  const entries = retained.pages
    .flatMap((page) => {
      const decoded = decodeEvidenceObject(page.raw);
      return (decoded.entries ?? []) as unknown[];
    })
    .map(object);
  if (entries.length !== 2) throw new Error('One unambiguous original insert audit first/last pair required');
  const vm = await joinOriginalGcpVmEvidence(input);
  const account = retained.pages[0].authentication.accountSha256;
  if (account !== vm.accountSha256) throw new Error('Original source/cloud/audit principal differs');
  const pair = matchOriginalAuditPair(entries, source, vm, audit, account, true);
  // Sparse final requests/responses never substitute for original bootstrap or
  // cloud evidence. Recheck the original files, inputs and VM before returning.
  await reader.readAuditEvidence(audit);
  const finalVm = await reader.instance(input.instance.zone, input.instance.name);
  if (!finalVm.present || finalVm.value.id !== vm.instanceId)
    throw new Error('Original VM changed during audit correlation');
  readOriginalGcpInsertSourceBodies(source);
  return Object.freeze({
    ...vm,
    kind: 'original-gcp-instance-audit-candidate' as const,
    auditCorroborated: true as const,
    auditQuerySha256: audit.querySha256,
    auditPageSha256s: Object.freeze(audit.pages.map((page) => page.sha256)),
    auditFirstSha256: pair.firstSha256,
    auditLastSha256: pair.lastSha256,
    requestReasonSha256: source.requestReasonSha256,
    applyRpcQualified: false as const,
    originalInsertQualified: false as const,
  });
}

/** Compiled final-source dispatch only. This collects the existing typed audit
 * join on the exact original baseline and after reader; it never issues creates. */
export async function collectInstalledOriginalCeAudit(
  input: Pick<OriginalGcpVmJoinInput, 'source' | 'reader'> &
    Required<Pick<OriginalGcpVmJoinInput, 'baseline' | 'callback'>>,
) {
  const { callback, reader, source, baseline } = input;
  await assertOriginalApplyCallback(callback);
  if (callback.phase !== 'after' || !callback.reserve) throw new Error('Original final CE audit callback required');
  await assertOriginalApplyGcpInventoryCallback(baseline, callback);
  await assertOriginalInstalledGcpFinalCloudReader(reader, callback);
  readOriginalGcpInsertSourceBodies(source);
  const inventory = await readOriginalApplyGcpInventory(baseline, callback);
  const rows = inventory.cloud.filter(
    (row) =>
      row.address === source.resourceAddress &&
      row.role === 'ce' &&
      row.target.kind === 'instance' &&
      row.target.name === source.nodeName &&
      row.target.zone === source.zone,
  );
  if (rows.length !== 1) throw new Error('Original CE audit baseline target required');
  const operation = await reader.insertOperation(source.zone, source.operationName, source.nodeName);
  const instance = await reader.instance(source.zone, source.nodeName);
  if (!instance.present) throw new Error('Original CE audit instance unavailable');
  const audit = await reader.insertAudit(source.zone, source.nodeName, {
    after: new Date(rows[0].evidence.startedAt).toISOString(),
    before: new Date(Date.now()).toISOString(),
  });
  await assertOriginalApplyCallback(callback);
  return joinOriginalGcpInsertAuditEvidence({
    source,
    reader,
    baseline,
    callback,
    operation,
    instance,
    audit,
  });
}

/** Observer audit stays bound to original observer VM/image sources and its
 * separate false-forwarding role. It cannot inherit a CE bootstrap projection. */
export async function collectInstalledOriginalObserverAudit(input: {
  identity: OriginalGcpObserverInsertIdentity;
  vm: OriginalGcpObserverVmEvidence;
  reader: Awaited<ReturnType<typeof openGcpCloudSerialReader>>;
  callback: OriginalApplyCallbackContext;
  baseline: OriginalApplyGcpInventory;
}) {
  const { identity, callback, baseline, reader } = input;
  await assertOriginalApplyCallback(callback);
  if (callback.phase !== 'after' || !callback.reserve)
    throw new Error('Original final observer audit callback required');
  await assertOriginalInstalledGcpFinalCloudReader(reader, callback);
  const original = await readOriginalGcpObserverAuditSource(identity, callback, baseline);
  const vm = await assertOriginalGcpObserverVmCaptureCallback(input.vm, callback);
  const source = {
    project: original.value.project,
    zone: original.value.zone,
    nodeName: original.value.name,
    operationId: original.value.operationId,
    operationName: original.value.operationName,
    requestReasonSha256: original.requestReasonSha256,
    labelsSha256: hash(canonical(object(decodeEvidenceObject(Buffer.from(original.requestBody)).labels))),
  };
  const inventory = await readOriginalApplyGcpInventory(baseline, callback);
  const rows = inventory.cloud.filter(
    (row) =>
      row.address === original.value.address &&
      row.role === 'observer' &&
      row.target.kind === 'instance' &&
      row.target.name === source.nodeName &&
      row.target.zone === source.zone,
  );
  if (
    rows.length !== 1 ||
    (original.value.targetId !== null && vm.instanceId !== original.value.targetId) ||
    vm.operationId !== source.operationId
  )
    throw new Error('Original observer audit VM and baseline differ');
  const audit = await reader.insertAudit(source.zone, source.nodeName, {
    after: new Date(rows[0].evidence.startedAt).toISOString(),
    before: new Date(Date.now()).toISOString(),
  });
  const retained = await reader.readAuditEvidence(audit);
  if (
    !retained.pages.length ||
    retained.pages.length !== audit.pages.length ||
    audit.project !== source.project ||
    audit.zone !== source.zone ||
    audit.node !== source.nodeName ||
    retained.pages.some(
      (page, index) =>
        page.scope.project !== source.project ||
        page.scope.zone !== source.zone ||
        page.scope.node !== source.nodeName ||
        page.authentication.accountSha256 !== callback.original.authentication.accountSha256 ||
        Date.now() < audit.pages[index].finishedAt ||
        Date.now() - audit.pages[index].finishedAt > 300000,
    )
  )
    throw new Error('Fresh original observer audit pages required');
  const entries = retained.pages
    .flatMap((page) => {
      const value = decodeEvidenceObject(page.raw);
      return (value.entries ?? []) as unknown[];
    })
    .map(object);
  if (entries.length !== 2) throw new Error('One original observer audit first/last pair required');
  const pair = matchOriginalAuditPair(
    entries,
    source,
    {
      instanceId: vm.instanceId,
      absenceStartedAt: rows[0].evidence.startedAt,
    },
    audit,
    callback.original.authentication.accountSha256,
    false,
  );
  await reader.readAuditEvidence(audit);
  const current = await assertOriginalGcpObserverVmCaptureCallback(input.vm, callback);
  if (current.instanceId !== vm.instanceId || current.diskId !== vm.diskId)
    throw new Error('Original observer changed during audit correlation');
  await readOriginalGcpObserverAuditSource(identity, callback, baseline);
  await assertOriginalApplyCallback(callback);
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: 'original-installed-observer-audit' as const,
    role: 'observer' as const,
    instanceId: vm.instanceId,
    diskId: vm.diskId,
    imageId: vm.imageId,
    operationId: source.operationId,
    operationName: source.operationName,
    auditCorroborated: true as const,
    requestReasonSha256: source.requestReasonSha256,
    auditQuerySha256: audit.querySha256,
    auditPageSha256s: Object.freeze(audit.pages.map((page) => page.sha256)),
    auditFirstSha256: pair.firstSha256,
    auditLastSha256: pair.lastSha256,
    originalInsertQualified: false as const,
    executionAuthorized: false as const,
  });
}
