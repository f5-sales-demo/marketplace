import { createHash } from 'node:crypto';
import { basename, isAbsolute, resolve } from 'node:path';
import { decodeEvidenceObject } from './evidence-json';
import { assertOriginalGoogleHttpRpcBodies, type OriginalGoogleHttpRpcBodies } from './gcp-http-rpc-trace';
import type { GoogleProviderRpcCandidate } from './google-provider-lifecycle';
import type { InstalledProviderWindow } from './installed-provider-reader';
import { type InstalledGcpVersionBinding, resolveInstalledGcpVersionProfile } from './installed-version-profile';
import type { PlanReceipt } from './runner';
import type { TerraformApplyHookCandidate } from './terraform-apply-hooks';

export type OriginalGcpInsertSourceCandidate = ReturnType<typeof joinOriginalGcpInsertSource>;
const sourceBodies = new WeakMap<OriginalGcpInsertSourceCandidate, OriginalGoogleHttpRpcBodies>();
export function readOriginalGcpInsertSourceBodies(
  source: OriginalGcpInsertSourceCandidate,
): OriginalGoogleHttpRpcBodies {
  const bodies = sourceBodies.get(source);
  if (!bodies) throw new Error('An original insert source candidate is required');
  assertOriginalGoogleHttpRpcBodies(bodies);
  return bodies;
}
type Json = Record<string, unknown>;
const insertOrigins = new WeakMap<OriginalComputeInstanceInsertHttpCandidate, OriginalGoogleHttpRpcBodies>();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const name = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const uint64 = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original Compute insert object required');
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
function link(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Original scoped Compute link required');
  if (value.startsWith('projects/')) {
    if (!/^[a-zA-Z0-9_/-]+$/.test(value)) throw new Error('Original scoped Compute link malformed');
    return value;
  }
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
    throw new Error('Original scoped Compute link differs');
  return url.pathname.slice('/compute/v1/'.length);
}
function scopedResource(value: unknown, prefix: string): boolean {
  const path = link(value);
  return path.startsWith(prefix) && name.test(path.slice(prefix.length));
}
function metadata(request: Json) {
  const value = object(request.metadata);
  if (
    Object.keys(value).some((key) => !['items', 'fingerprint'].includes(key)) ||
    (value.fingerprint !== undefined && value.fingerprint !== '') ||
    !Array.isArray(value.items)
  )
    throw new Error('Original creation metadata mapping required');
  const entries: Record<string, string> = Object.create(null);
  let bytes = 0;
  for (const raw of value.items) {
    const item = object(raw);
    if (
      Object.keys(item).sort().join(',') !== 'key,value' ||
      typeof item.key !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,127}$/.test(item.key) ||
      Object.hasOwn(entries, item.key) ||
      typeof item.value !== 'string' ||
      Buffer.byteLength(item.value) > 262144
    )
      throw new Error('Original unique bounded metadata entries required');
    bytes += Buffer.byteLength(item.key) + Buffer.byteLength(item.value);
    entries[item.key] = item.value;
  }
  if (bytes >= 512 * 1024 || !entries['user-data'] || entries.VmDnsSetting !== 'ZonePreferred')
    throw new Error('Original node bootstrap and DNS metadata required');
  return { bootstrapSha256: hash(entries['user-data']), metadataSha256: hash(canonical(entries)) };
}
export interface OriginalComputeInstanceInsertHttpCandidate {
  readonly schemaVersion: 1;
  readonly kind: 'original-compute-instance-insert-http-candidate';
  readonly project: string;
  readonly zone: string;
  readonly nodeName: string;
  readonly operationId: string;
  readonly operationName: string;
  readonly targetId: string | null;
  readonly status: 'PENDING' | 'RUNNING' | 'DONE';
  readonly requestBodySha256: string;
  readonly responseBodySha256: string;
  readonly requestRecordsSha256: string;
  readonly responseRecordsSha256: string;
  readonly rpcRequestId: string;
  readonly planSha256: string;
  readonly receivedRecordSha256: string;
  readonly servedRecordSha256: string;
  readonly requestReasonSha256: string;
  readonly bootstrapSha256: string;
  readonly metadataSha256: string;
  readonly labelsSha256: string;
  readonly interfacesSha256: string;
  readonly disksSha256: string;
  readonly requestProjectionSha256: string;
  readonly serviceAccountsRequested: false;
  readonly applyRpcQualified: false;
  readonly originalInsertQualified: false;
}

/** The latest authenticated provider's fixed insert mapping. This projects private
 * source-issued bodies, not a reviewed action, original VM or create authority.
 * Exact raw body/record hashes remain available for the owning controller join.
 */
export function inspectOriginalGcpInsertBodies(
  input: OriginalGoogleHttpRpcBodies,
  binding: InstalledGcpVersionBinding,
): OriginalComputeInstanceInsertHttpCandidate {
  assertOriginalGoogleHttpRpcBodies(input);
  const profile = resolveInstalledGcpVersionProfile(binding);
  if (
    profile.googleVersion !== '8.10.0' ||
    input.googleProviderVersion !== profile.googleVersion ||
    input.rpc !== 'ApplyResourceChange' ||
    input.resourceType !== 'google_compute_instance' ||
    input.method !== 'POST' ||
    input.status !== 200 ||
    hash(input.requestBody) !== input.requestBodySha256 ||
    hash(input.responseBody) !== input.responseBodySha256
  )
    throw new Error('Original latest Compute insert body profile required');
  const url = new URL(input.url);
  const path = /^\/compute\/v1\/projects\/([a-z][a-z0-9-]{4,62})\/zones\/([a-z][a-z0-9-]{0,62})\/instances$/.exec(
    url.pathname,
  );
  if (url.origin !== 'https://compute.googleapis.com' || url.search !== '?alt=json' || url.hash || !path)
    throw new Error('Original latest zonal insert target required');
  const [, project, zone] = path;
  const request = decodeEvidenceObject(Buffer.from(input.requestBody)),
    operation = decodeEvidenceObject(Buffer.from(input.responseBody));
  if (
    typeof request.name !== 'string' ||
    !name.test(request.name) ||
    request.canIpForward !== true ||
    request.deletionProtection !== false
  )
    throw new Error('Original CE instance creation fields required');
  const nodeName = request.name;
  if (!scopedResource(request.machineType, `projects/${project}/zones/${zone}/machineTypes/`))
    throw new Error('Original machine type zone and project required');
  const labels = object(request.labels);
  if (
    labels['xcsh-engine'] !== 'terraform' ||
    labels['xcsh-node'] !== nodeName ||
    typeof labels['xcsh-deployment'] !== 'string' ||
    !name.test(labels['xcsh-deployment']) ||
    typeof labels['xcsh-site'] !== 'string' ||
    !name.test(labels['xcsh-site']) ||
    Object.values(labels).some((value) => typeof value !== 'string')
  )
    throw new Error('Original Terraform node ownership labels required');
  if (
    request.serviceAccounts !== undefined &&
    (!Array.isArray(request.serviceAccounts) || request.serviceAccounts.length)
  )
    throw new Error('Original request must not attach service accounts');
  if (
    !Array.isArray(request.networkInterfaces) ||
    !request.networkInterfaces.length ||
    !Array.isArray(request.disks) ||
    !request.disks.length
  )
    throw new Error('Original ordered interfaces and disks required');
  for (const raw of request.networkInterfaces) {
    const nic = object(raw);
    if (
      !scopedResource(nic.network, `projects/${project}/global/networks/`) ||
      !scopedResource(nic.subnetwork, `projects/${project}/regions/${zone.slice(0, -2)}/subnetworks/`)
    )
      throw new Error('Original interface project and region required');
  }
  const identity = `projects/${project}/zones/${zone}`;
  if (
    !uint64(operation.id) ||
    typeof operation.name !== 'string' ||
    !/^[a-z][a-z0-9-]{0,254}$/.test(operation.name) ||
    operation.operationType !== 'insert' ||
    !['PENDING', 'RUNNING', 'DONE'].includes(operation.status as string) ||
    operation.error !== undefined ||
    link(operation.zone) !== identity ||
    link(operation.selfLink) !== `${identity}/operations/${operation.name}` ||
    link(operation.targetLink) !== `${identity}/instances/${nodeName}` ||
    (operation.targetId !== undefined && !uint64(operation.targetId))
  )
    throw new Error('Original exact scoped insert operation required');
  const candidate = Object.freeze({
    schemaVersion: 1 as const,
    kind: 'original-compute-instance-insert-http-candidate' as const,
    project,
    zone,
    nodeName,
    operationId: operation.id,
    operationName: operation.name,
    targetId: operation.targetId === undefined ? null : (operation.targetId as string),
    status: operation.status as 'PENDING' | 'RUNNING' | 'DONE',
    requestBodySha256: input.requestBodySha256,
    responseBodySha256: input.responseBodySha256,
    requestRecordsSha256: input.requestRecordsSha256,
    responseRecordsSha256: input.responseRecordsSha256,
    rpcRequestId: input.rpcRequestId,
    planSha256: input.planSha256,
    receivedRecordSha256: input.receivedRecordSha256,
    servedRecordSha256: input.servedRecordSha256,
    requestReasonSha256: input.requestReasonSha256,
    ...metadata(request),
    labelsSha256: hash(canonical(labels)),
    interfacesSha256: hash(canonical(request.networkInterfaces)),
    disksSha256: hash(canonical(request.disks)),
    requestProjectionSha256: hash(canonical(request)),
    serviceAccountsRequested: false as const,
    applyRpcQualified: false as const,
    originalInsertQualified: false as const,
  });
  insertOrigins.set(candidate, input);
  return candidate;
}

export interface OriginalGcpInsertSourceJoinInput {
  readonly insert: OriginalComputeInstanceInsertHttpCandidate;
  readonly binding: InstalledGcpVersionBinding;
  readonly plan: PlanReceipt;
  readonly configuration: string;
  readonly started: TerraformApplyHookCandidate;
  readonly completed: TerraformApplyHookCandidate;
  readonly rpc: GoogleProviderRpcCandidate;
  readonly window: InstalledProviderWindow;
  readonly parent: Readonly<{ pid: number; group: number; start: string; boot: string }>;
  readonly providerPath: string;
}
/** Corroborate source identities only. The owning controller must still verify
 * its original inputs/lifetime, audit and operation, numeric VM and bootstrap.
 * This result cannot authorize an apply or claim an original insert by itself.
 */
export function joinOriginalGcpInsertSource(input: OriginalGcpInsertSourceJoinInput) {
  const { insert, plan, rpc, window, parent, started, completed } = input;
  if (Buffer.byteLength(input.configuration) > 64 * 1024 * 1024)
    throw new Error('Bounded original reviewed configuration required');
  const bodies = insertOrigins.get(insert);
  if (!bodies) throw new Error('An original insert projection is required');
  assertOriginalGoogleHttpRpcBodies(bodies);
  const profile = resolveInstalledGcpVersionProfile(input.binding);
  if (
    plan.schemaVersion !== 1 ||
    plan.engine !== 'terraform' ||
    plan.noChanges ||
    plan.operation !== undefined ||
    plan.providerLockSha256 !== input.binding.providerLockSha256 ||
    plan.planSha256 !== insert.planSha256 ||
    hash(input.configuration) !== plan.configurationSha256 ||
    (plan.actionInvocations?.length ?? 0)
  )
    throw new Error('Original reviewed Terraform create plan and bytes required');
  const configuration = decodeEvidenceObject(Buffer.from(input.configuration));
  if (configuration.module !== undefined) throw new Error('Module instance source mapping is unavailable');
  const address = /^google_compute_instance\.([a-z][a-z0-9_]*)$/.exec(started.address);
  const changes = plan.changes.filter((value) => value.address === started.address);
  if (
    !address ||
    new Set(plan.changes.map((value) => value.address)).size !== plan.changes.length ||
    changes.length !== 1 ||
    changes[0].type !== 'google_compute_instance' ||
    !Number.isSafeInteger(started.actionIndex) ||
    started.actionIndex < 0 ||
    changes[0].actions[started.actionIndex] !== 'create' ||
    started.phase !== 'apply_start' ||
    completed.phase !== 'apply_complete' ||
    started.action !== 'create' ||
    completed.action !== 'create' ||
    started.resourceType !== 'google_compute_instance' ||
    completed.resourceType !== started.resourceType ||
    completed.address !== started.address ||
    completed.actionIndex !== started.actionIndex ||
    started.planSha256 !== plan.planSha256 ||
    completed.planSha256 !== plan.planSha256 ||
    completed.idKey !== 'id' ||
    completed.idValue !== `projects/${insert.project}/zones/${insert.zone}/instances/${insert.nodeName}`
  )
    throw new Error('Original declared create action and completed resource identity required');
  const resource = object(object(object(configuration.resource).google_compute_instance)[address[1]]);
  const expectedLabels = object(resource.labels),
    labels = object(decodeEvidenceObject(Buffer.from(bodies.requestBody)).labels);
  if (
    resource.name !== insert.nodeName ||
    resource.project !== insert.project ||
    resource.zone !== insert.zone ||
    resource.can_ip_forward !== true ||
    typeof resource.machine_type !== 'string' ||
    !name.test(resource.machine_type) ||
    expectedLabels['xcsh-engine'] !== 'terraform' ||
    expectedLabels['xcsh-node'] !== insert.nodeName ||
    typeof expectedLabels['xcsh-site'] !== 'string' ||
    typeof expectedLabels['xcsh-deployment'] !== 'string' ||
    !scopedResource(
      `projects/${insert.project}/zones/${insert.zone}/machineTypes/${String(resource.machine_type)}`,
      `projects/${insert.project}/zones/${insert.zone}/machineTypes/`,
    ) ||
    link(decodeEvidenceObject(Buffer.from(bodies.requestBody)).machineType) !==
      `projects/${insert.project}/zones/${insert.zone}/machineTypes/${resource.machine_type}` ||
    Object.entries(expectedLabels).some(([key, value]) => typeof value !== 'string' || labels[key] !== value)
  )
    throw new Error('Original declared request resource fields differ');
  const providers = object(configuration.provider).google;
  const provider = object(Array.isArray(providers) && providers.length === 1 ? providers[0] : providers);
  if (
    provider.project !== insert.project ||
    provider.alias !== undefined ||
    resource.provider !== undefined ||
    typeof provider.request_reason !== 'string' ||
    hash(provider.request_reason) !== insert.requestReasonSha256
  )
    throw new Error('Original reviewed provider request reason required');
  if (
    rpc.rpc !== 'ApplyResourceChange' ||
    rpc.resourceType !== 'google_compute_instance' ||
    rpc.rpcRequestId !== insert.rpcRequestId ||
    rpc.planSha256 !== plan.planSha256 ||
    rpc.receivedRecordSha256 !== insert.receivedRecordSha256 ||
    rpc.servedRecordSha256 !== insert.servedRecordSha256 ||
    !isAbsolute(input.providerPath) ||
    resolve(input.providerPath) !== input.providerPath ||
    basename(input.providerPath) !== `terraform-provider-google_v${profile.googleVersion}_x5` ||
    rpc.providerPathSha256 !== hash(input.providerPath)
  )
    throw new Error('Original lifecycle RPC and insert source records differ');
  if (
    ![3, 4].includes(window.schemaVersion) ||
    !['original-provider-stderr-coherent-window', 'original-provider-stderr-verified-window'].includes(window.kind) ||
    window.samplingWindowComplete !== true ||
    ![window.windowStartedMs, window.windowDeadlineMs, window.finishedMs].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    window.windowDeadlineMs <= window.windowStartedMs ||
    window.windowDeadlineMs - window.windowStartedMs > 45000 ||
    window.finishedMs < window.windowStartedMs ||
    (window.executorAvailable && window.executorGroupClosed) ||
    (!window.executorGroupClosed && window.finishedMs < window.windowDeadlineMs) ||
    (['pid', 'group', 'start', 'boot'] as const).some((key) => window.executor[key] !== parent[key]) ||
    !Number.isSafeInteger(parent.pid) ||
    parent.pid <= 0 ||
    parent.group !== parent.pid ||
    typeof parent.start !== 'string' ||
    !/^[0-9]+$/.test(parent.start) ||
    typeof parent.boot !== 'string' ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(parent.boot) ||
    window.signalsSent !== false ||
    window.cloudSubmissions !== 0 ||
    window.applyPhaseQualified !== false
  )
    throw new Error('Original coherent provider window and executor required');
  const observations = window.observations.filter((value) => value.candidate.pid === rpc.providerPid);
  if (observations.length !== 1) throw new Error('Original RPC provider observation missing or ambiguous');
  const { candidate, stderr, firstObservedMs, lastObservedMs } = observations[0];
  if (
    !Number.isSafeInteger(candidate.pid) ||
    candidate.pid <= 0 ||
    candidate.pid === parent.pid ||
    candidate.parent !== parent.pid ||
    candidate.group !== parent.group ||
    candidate.boot !== parent.boot ||
    candidate.executable_sha256 !== profile.googleProviderSha256 ||
    !/^[0-9]+$/.test(candidate.start) ||
    stderr.providerFd !== 2 ||
    !Number.isSafeInteger(stderr.parentFd) ||
    stderr.parentFd < 3 ||
    typeof stderr.device !== 'string' ||
    typeof stderr.inode !== 'string' ||
    ![stderr.providerFlags, stderr.parentFlags].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    ![firstObservedMs, lastObservedMs].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    !/^[0-9]+$/.test(stderr.device) ||
    !/^[1-9][0-9]*$/.test(stderr.inode) ||
    (stderr.providerFlags & 3) !== 1 ||
    (stderr.parentFlags & 3) !== 0 ||
    firstObservedMs < window.windowStartedMs ||
    lastObservedMs < firstObservedMs ||
    lastObservedMs > window.finishedMs ||
    window.finishedMs > window.windowDeadlineMs
  )
    throw new Error('Original provider incarnation and FIFO evidence differ');
  for (const digest of [
    started.rawLineSha256,
    completed.rawLineSha256,
    rpc.startingRecordSha256,
    rpc.startedRecordSha256,
    window.evidenceSha256,
  ])
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest))
      throw new Error('Original source record digests required');
  const joined = Object.freeze({
    ...insert,
    schemaVersion: 1 as const,
    kind: 'original-gcp-instance-insert-source-candidate' as const,
    resourceAddress: started.address,
    providerPid: candidate.pid,
    providerStart: candidate.start,
    providerBoot: candidate.boot,
    providerSha256: candidate.executable_sha256,
    parentPid: parent.pid,
    parentStart: parent.start,
    parentBoot: parent.boot,
    actionStartedSha256: started.rawLineSha256,
    actionCompletedSha256: completed.rawLineSha256,
    windowSha256: window.evidenceSha256,
    sourceCorroborated: true as const,
    providerProcessQualified: false as const,
    applyRpcQualified: false as const,
    originalInsertQualified: false as const,
  });
  sourceBodies.set(joined, bodies);
  return joined;
}
