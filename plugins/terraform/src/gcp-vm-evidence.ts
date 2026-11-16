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
import {
  assertOriginalInstalledGcpCloudReader,
  assertOriginalInstalledGcpFinalCloudReader,
  isInstalledGcpCloudSerialReader,
} from './gcp-cloud-serial-reader';
import {
  type OriginalEarlyGcpInsertIdentity,
  type OriginalGcpInsertSourceCandidate,
  readOriginalEarlyGcpInsertBodies,
  readOriginalEarlyGcpInsertIdentity,
  readOriginalGcpInsertSourceBodies,
} from './gcp-insert-evidence';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';
import {
  assertOriginalApplyGcpInventoryCallback,
  type OriginalApplyGcpInventory,
  readOriginalApplyGcpInventory,
} from './installed-initial-inventory';
import { readOwnedInstalledInput } from './installed-runtime';
import { assertSameOriginalInput, type OriginalInputBinding } from './original-input-monitor';
import { inspectFinalReaderReserve } from './reader-final-reserve';

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
function machineResourceLink(value: unknown): string {
  if (
    typeof value !== 'string' ||
    Array.from(value).some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
  )
    throw new Error('Original reviewed VM machine type link required');
  const pattern = /^projects\/[a-z0-9-]+\/zones\/[a-z0-9-]+\/machineTypes\/[a-z0-9-]+$/;
  if (pattern.test(value)) return value;
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.googleapis.com' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith('/compute/v1/') ||
    !pattern.test(url.pathname.slice('/compute/v1/'.length))
  )
    throw new Error('Original reviewed VM machine type link scope differs');
  return url.pathname.slice('/compute/v1/'.length);
}

type VmBodySource = Pick<
  OriginalGcpInsertSourceCandidate,
  | 'operationId'
  | 'operationName'
  | 'nodeName'
  | 'zone'
  | 'targetId'
  | 'metadataSha256'
  | 'bootstrapSha256'
  | 'labelsSha256'
>;
function corroborateVmBodies(
  source: VmBodySource,
  requestBody: string,
  absent: GcpCloudReadEvidence & { present: false },
  absentRaw: Buffer,
  operation: GcpInsertOperationCandidate,
  opRaw: Buffer,
  instance: OriginalGcpVm,
  vmRaw: Buffer,
) {
  const initial = decodeEvidenceObject(absentRaw),
    op = decodeEvidenceObject(opRaw),
    vm = decodeEvidenceObject(vmRaw);
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
  const request = decodeEvidenceObject(Buffer.from(requestBody));
  if (
    request.canIpForward !== true ||
    vm.canIpForward !== true ||
    typeof vm.machineType !== 'string' ||
    machineResourceLink(vm.machineType) !== machineResourceLink(request.machineType)
  )
    throw new Error('Original reviewed VM machine type or forwarding capability differs');
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
  return { vm, interfaces };
}

export interface OriginalGcpVmJoinInput {
  readonly source: OriginalGcpInsertSourceCandidate;
  readonly reader: Reader;
  /** Legacy independent absence; installed applies must use their sealed baseline. */
  readonly absent?: GcpCloudReadEvidence & { readonly present: false };
  readonly baseline?: OriginalApplyGcpInventory;
  readonly callback?: OriginalApplyCallbackContext;
  readonly operation: GcpInsertOperationCandidate;
  readonly instance: OriginalGcpVm;
}
/** Corroborate cloud identity only. The controller still requires verified source
 * lifetime, audit attribution and Platform bootstrap ownership before acceptance.
 * Raw evidence remains private and every read rechecks its original reader inputs.
 */
export async function joinOriginalGcpVmEvidence(input: OriginalGcpVmJoinInput) {
  const { source, reader, operation, instance, baseline, callback } = input;
  const bodies = readOriginalGcpInsertSourceBodies(source);
  const readAbsence = async () => {
    if (baseline !== undefined) {
      if (!callback || input.absent !== undefined)
        throw new Error('Original sealed baseline and callback required without a raw absence shortcut');
      await assertOriginalApplyGcpInventoryCallback(baseline, callback);
      await assertOriginalInstalledGcpCloudReader(reader, callback.original);
      const view = await readOriginalApplyGcpInventory(baseline, callback.phase === 'after' ? callback : undefined);
      if (
        view.planSha256 !== source.planSha256 ||
        view.owner.account !== source.project ||
        !source.zone.startsWith(`${view.owner.region}-`) ||
        view.executor.pid !== source.parentPid ||
        view.executor.start !== source.parentStart ||
        view.executor.boot !== source.parentBoot ||
        view.executor.group !== source.parentPid
      )
        throw new Error('Original VM source, sealed baseline or owning executor differs');
      const rows = view.cloud.filter(
        (row) =>
          row.address === source.resourceAddress &&
          row.target.kind === 'instance' &&
          row.target.zone === source.zone &&
          row.target.name === source.nodeName,
      );
      if (rows.length !== 1) throw new Error('Original declared VM absence required');
      const row = rows[0];
      if (
        object(decodeEvidenceObject(Buffer.from(bodies.requestBody)).labels)['xcsh-deployment'] !==
        view.owner.deploymentId
      )
        throw new Error('Original VM deployment ownership differs');
      await assertOriginalApplyGcpInventoryCallback(baseline, callback);
      await assertOriginalInstalledGcpCloudReader(reader, callback.original);
      readOriginalGcpInsertSourceBodies(source);
      return {
        absent: { ...row.evidence, present: false as const },
        read: {
          raw: row.raw,
          scope: { project: source.project, zone: source.zone, node: source.nodeName },
          authentication: row.authentication,
        },
      };
    }
    if (isInstalledGcpCloudSerialReader(reader))
      throw new Error('Original installed VM correlation requires its sealed apply baseline');
    if (!input.absent || callback !== undefined)
      throw new Error('Original independent absence or sealed apply baseline required');
    const read = await reader.readEvidence(input.absent);
    freshCloudEvidence(input.absent);
    if (read.scope.project !== source.project || read.scope.zone !== source.zone || read.scope.node !== source.nodeName)
      throw new Error('Fresh original scoped cloud evidence required');
    return { absent: input.absent, read };
  };
  const initial = await readAbsence();
  const retained = [initial.read];
  const records = [operation, instance] as const;
  for (const record of records) {
    const read = await reader.readEvidence(record);
    freshCloudEvidence(record);
    if (
      read.scope.project !== source.project ||
      read.scope.zone !== source.zone ||
      read.scope.node !== source.nodeName ||
      (['accountSha256', 'audienceSha256', 'adcSha256'] as const).some(
        (key) => read.authentication[key] !== initial.read.authentication[key],
      )
    )
      throw new Error('Fresh original scoped cloud evidence required');
    retained.push(read);
  }
  const { vm, interfaces } = corroborateVmBodies(
    source,
    bodies.requestBody,
    initial.absent,
    initial.read.raw,
    operation,
    retained[1].raw,
    instance,
    retained[2].raw,
  );
  // The baseline's issuer preserves its original timestamps and bytes. Current
  // operation and VM observations retain the five-minute freshness requirement.
  await readAbsence();
  for (const record of records) {
    await reader.readEvidence(record);
    freshCloudEvidence(record);
  }
  const current = await reader.instance(instance.zone, instance.name);
  if (!current.present || current.value.id !== instance.value.id)
    throw new Error('Original VM changed during final correlation');
  await readAbsence();
  for (const record of records) {
    await reader.readEvidence(record);
    freshCloudEvidence(record);
  }
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
    absenceSha256: initial.absent.sha256,
    absenceStartedAt: initial.absent.startedAt,
    absenceFinishedAt: initial.absent.finishedAt,
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

export interface OriginalEarlyGcpVmEvidence {
  readonly schemaVersion: 1;
  readonly kind: 'original-early-gcp-vm-evidence';
}
export interface OriginalEarlyGcpVmInput {
  readonly identity: OriginalEarlyGcpInsertIdentity;
  readonly baseline: OriginalApplyGcpInventory;
  readonly callback: OriginalApplyCallbackContext;
  readonly reader: Reader;
}
type EarlyVmView = Readonly<{
  schemaVersion: 1;
  kind: 'original-early-gcp-vm-cloud-candidate';
  project: string;
  zone: string;
  nodeName: string;
  instanceId: string;
  operationId: string;
  operationName: string;
  resourceAddress: string;
  interfaces: Readonly<ReturnType<typeof corroborateVmBodies>['interfaces']>;
  absenceSha256: string;
  operationSha256: string;
  instanceSha256: string;
  sourceRequestSha256: string;
  cloudEvidenceCorroborated: true;
  originalInsertQualified: false;
  applyRpcQualified: false;
  executionAuthorized: false;
}>;
const earlyVmOrigins = new WeakMap<
  OriginalEarlyGcpVmEvidence,
  {
    read(): Promise<EarlyVmView>;
    serial(start: string): Promise<Awaited<ReturnType<Reader['serial']>>>;
    handoff(input: OriginalFinalGcpVmHandoffInput): Promise<OriginalFinalGcpVmEvidence>;
  }
>();
export interface OriginalFinalGcpVmEvidence {
  readonly schemaVersion: 1;
  readonly kind: 'original-final-gcp-vm-evidence';
}
export interface OriginalFinalGcpVmHandoffInput {
  readonly callback: OriginalApplyCallbackContext;
  readonly reader: Reader;
}
type FinalVmView = Omit<EarlyVmView, 'kind'> &
  Readonly<{
    kind: 'original-final-gcp-vm-cloud-candidate';
    finalStartedMs: number;
    finalDeadlineMs: number;
  }>;
const finalVmOrigins = new WeakMap<
  OriginalFinalGcpVmEvidence,
  {
    read(): Promise<FinalVmView>;
    serial(start: string): Promise<Awaited<ReturnType<Reader['serial']>>>;
  }
>();
export async function handoffOriginalEarlyGcpVmEvidence(original: unknown, input: OriginalFinalGcpVmHandoffInput) {
  const source =
    original && typeof original === 'object' ? earlyVmOrigins.get(original as OriginalEarlyGcpVmEvidence) : undefined;
  if (!source) throw new Error('Original early VM handoff source required');
  return source.handoff(input);
}
export async function readOriginalFinalGcpVmEvidence(value: unknown): Promise<FinalVmView> {
  const source =
    value && typeof value === 'object' ? finalVmOrigins.get(value as OriginalFinalGcpVmEvidence) : undefined;
  if (!source) throw new Error('Original final VM evidence required');
  return source.read();
}
export async function collectOriginalFinalGcpSerialEvidence(value: unknown, start: string) {
  const source =
    value && typeof value === 'object' ? finalVmOrigins.get(value as OriginalFinalGcpVmEvidence) : undefined;
  if (!source) throw new Error('Original final VM evidence required');
  return source.serial(start);
}

export async function readOriginalEarlyGcpVmEvidence(value: unknown): Promise<EarlyVmView> {
  const source =
    value && typeof value === 'object' ? earlyVmOrigins.get(value as OriginalEarlyGcpVmEvidence) : undefined;
  if (!source) throw new Error('Original early VM evidence required');
  return source.read();
}
export async function collectOriginalEarlyGcpSerialEvidence(value: unknown, start: string) {
  const source =
    value && typeof value === 'object' ? earlyVmOrigins.get(value as OriginalEarlyGcpVmEvidence) : undefined;
  if (!source) throw new Error('Original early VM evidence required');
  return source.serial(start);
}
function freshCloudEvidence(record: GcpCloudReadEvidence) {
  if (
    !Number.isSafeInteger(record.startedAt) ||
    !Number.isSafeInteger(record.finishedAt) ||
    record.finishedAt < record.startedAt ||
    Date.now() < record.finishedAt ||
    Date.now() - record.finishedAt > 300000
  )
    throw new Error('Fresh original scoped cloud evidence required');
}
/** Read-only early VM/serial correlation. Pending insertion returns null; no
 * bootstrap, RPC completion or execution qualification is granted. */
export async function collectOriginalEarlyGcpVmEvidence(input: OriginalEarlyGcpVmInput) {
  const { identity, baseline, callback, reader } = input;
  const guard = async () => {
    await assertOriginalApplyGcpInventoryCallback(baseline, callback);
    await assertOriginalInstalledGcpCloudReader(reader, callback.original);
    await readOriginalEarlyGcpInsertIdentity(identity);
    const view = await readOriginalApplyGcpInventory(baseline, callback.phase === 'after' ? callback : undefined);
    if (
      identity.directory !== callback.execution.directory ||
      identity.directory !== callback.original.executionDirectory ||
      identity.planSha256 !== view.planSha256 ||
      identity.project !== view.owner.account ||
      !identity.zone.startsWith(`${view.owner.region}-`) ||
      (['pid', 'group', 'start', 'boot'] as const).some(
        (key) =>
          identity.executor[key] !== view.executor[key] || identity.executor[key] !== callback.execution.identity[key],
      )
    )
      throw new Error('Original early VM baseline, executor or plan differs');
    const matches = view.cloud.filter(
      (row) =>
        row.address === identity.address &&
        row.target.kind === 'instance' &&
        row.target.zone === identity.zone &&
        row.target.name === identity.nodeName,
    );
    if (matches.length !== 1) throw new Error('Original declared VM absence required');
    const bodies = await readOriginalEarlyGcpInsertBodies(identity);
    const request = decodeEvidenceObject(Buffer.from(bodies.requestBody));
    if (object(request.labels)['xcsh-deployment'] !== view.owner.deploymentId)
      throw new Error('Original VM deployment ownership differs');
    await assertOriginalApplyGcpInventoryCallback(baseline, callback);
    await assertOriginalInstalledGcpCloudReader(reader, callback.original);
    await readOriginalEarlyGcpInsertIdentity(identity);
    return { absent: matches[0], bodies };
  };
  await guard();
  const operation = await reader.insertOperation(identity.zone, identity.operationName, identity.nodeName);
  await reader.readEvidence(operation);
  freshCloudEvidence(operation);
  if (
    operation.operationId !== identity.operationId ||
    operation.operationName !== identity.operationName ||
    (identity.targetId !== null && operation.targetId !== identity.targetId)
  )
    throw new Error('Original early insert operation differs');
  if (operation.targetId === null) {
    await guard();
    return null;
  }
  const instance = await reader.instance(identity.zone, identity.nodeName);
  if (!instance.present) {
    await guard();
    return null;
  }
  const sealedInputs: OriginalInputBinding[] = [];
  for (const record of [operation, instance]) {
    const captured = await readOwnedInstalledInput(record.path, 4 * 1024 * 1024);
    if (captured.binding.sha256 !== record.sha256) throw new Error('Original VM source bytes differ');
    sealedInputs.push(captured.binding);
  }
  let refused = false,
    transferred = false;
  let handoffPromise: Promise<OriginalFinalGcpVmEvidence> | undefined;
  let handoffCallback: OriginalApplyCallbackContext | undefined;
  let handoffReader: Reader | undefined;
  const read = async (): Promise<EarlyVmView> => {
    if (transferred) throw new Error('Original before VM evidence retired after final handoff');
    if (refused) throw new Error('Original early VM evidence retired');
    try {
      const current = await guard();
      const op = await reader.readEvidence(operation);
      const vm = await reader.readEvidence(instance);
      for (const [record, evidence] of [
        [operation, op],
        [instance, vm],
      ] as const) {
        freshCloudEvidence(record);
        if (
          evidence.scope.project !== identity.project ||
          evidence.scope.zone !== identity.zone ||
          evidence.scope.node !== identity.nodeName ||
          (['accountSha256', 'audienceSha256', 'adcSha256'] as const).some(
            (key) => evidence.authentication[key] !== current.absent.authentication[key],
          )
        )
          throw new Error('Original independent VM evidence scope or authentication differs');
      }
      const absent = { ...current.absent.evidence, present: false as const };
      const projection = corroborateVmBodies(
        identity,
        current.bodies.requestBody,
        absent,
        current.absent.raw,
        operation,
        op.raw,
        instance,
        vm.raw,
      );
      const latest = await reader.instance(identity.zone, identity.nodeName);
      if (!latest.present || latest.value.id !== instance.value.id)
        throw new Error('Original VM changed during early correlation');
      await reader.readEvidence(operation);
      await reader.readEvidence(instance);
      await guard();
      return Object.freeze({
        schemaVersion: 1,
        kind: 'original-early-gcp-vm-cloud-candidate',
        project: identity.project,
        zone: identity.zone,
        nodeName: identity.nodeName,
        instanceId: instance.value.id,
        operationId: operation.operationId,
        operationName: operation.operationName,
        resourceAddress: identity.address,
        interfaces: Object.freeze(projection.interfaces),
        absenceSha256: absent.sha256,
        operationSha256: operation.sha256,
        instanceSha256: instance.sha256,
        sourceRequestSha256: identity.requestBodySha256,
        cloudEvidenceCorroborated: true,
        originalInsertQualified: false,
        applyRpcQualified: false,
        executionAuthorized: false,
      });
    } catch (error) {
      refused = true;
      throw error;
    }
  };
  await read();
  const packet: OriginalEarlyGcpVmEvidence = Object.freeze({
    schemaVersion: 1,
    kind: 'original-early-gcp-vm-evidence',
  });
  earlyVmOrigins.set(packet, {
    read,
    async handoff(input) {
      const final = input.callback,
        finalReader = input.reader;
      // An unissued caller cannot claim or poison the original packet.
      await assertOriginalApplyGcpInventoryCallback(baseline, final);
      await assertOriginalInstalledGcpFinalCloudReader(finalReader, final);
      if (
        callback.phase !== 'before' ||
        final.phase !== 'after' ||
        final.original !== callback.original ||
        final.nonce !== callback.nonce
      )
        throw new Error('Original before-to-final VM callback differs');
      if (refused) throw new Error('Original early VM handoff source retired');
      if (handoffPromise) {
        if (handoffCallback !== final || handoffReader !== finalReader)
          throw new Error('Original final VM handoff already claimed');
        const issued = await handoffPromise;
        await readOriginalFinalGcpVmEvidence(issued);
        return issued;
      }
      handoffCallback = final;
      handoffReader = finalReader;
      handoffPromise = (async () => {
        let failed = false;
        const guardFinal = async () => {
          if (failed || refused) throw new Error('Original final VM handoff retired');
          await assertOriginalApplyGcpInventoryCallback(baseline, final);
          await assertOriginalInstalledGcpFinalCloudReader(finalReader, final);
          await readOriginalEarlyGcpInsertIdentity(identity);
          for (const binding of sealedInputs)
            assertSameOriginalInput(binding, (await readOwnedInstalledInput(binding.path, 4 * 1024 * 1024)).binding);
          await assertOriginalApplyGcpInventoryCallback(baseline, final);
          await assertOriginalInstalledGcpFinalCloudReader(finalReader, final);
        };
        try {
          await guardFinal();
          const candidate = await collectOriginalEarlyGcpVmEvidence({
            identity,
            baseline,
            callback: final,
            reader: finalReader,
          });
          if (!candidate) throw new Error('Original VM unavailable during final handoff');
          const readFinal = async (): Promise<FinalVmView> => {
            try {
              await guardFinal();
              const view = await readOriginalEarlyGcpVmEvidence(candidate);
              const current = await finalReader.instance(identity.zone, identity.nodeName);
              if (
                !current.present ||
                (
                  [
                    'id',
                    'creationTimestamp',
                    'metadata',
                    'networkInterfaces',
                    'labels',
                    'serviceAccounts',
                    'canIpForward',
                    'machineType',
                  ] as const
                ).some((key) => JSON.stringify(current.value[key]) !== JSON.stringify(instance.value[key]))
              )
                throw new Error('Original VM identity or ownership changed during final handoff');
              await guardFinal();
              if (!final.reserve) throw new Error('Original final VM reserve required');
              const timing = inspectFinalReaderReserve(final.reserve);
              return Object.freeze({
                ...view,
                kind: 'original-final-gcp-vm-cloud-candidate',
                finalStartedMs: timing.finalStartedMs,
                finalDeadlineMs: timing.finalDeadlineMs,
              });
            } catch (error) {
              failed = true;
              refused = true;
              throw error;
            }
          };
          await readFinal();
          const result: OriginalFinalGcpVmEvidence = Object.freeze({
            schemaVersion: 1,
            kind: 'original-final-gcp-vm-evidence',
          });
          finalVmOrigins.set(result, {
            read: readFinal,
            async serial(start) {
              try {
                await readFinal();
                const capture = await collectOriginalEarlyGcpSerialEvidence(candidate, start);
                await readFinal();
                return capture;
              } catch (error) {
                failed = true;
                refused = true;
                throw error;
              }
            },
          });
          transferred = true;
          return result;
        } catch (error) {
          failed = true;
          refused = true;
          throw error;
        }
      })();
      return handoffPromise;
    },

    async serial(start) {
      if (transferred) throw new Error('Original before VM evidence retired after final handoff');
      if (refused) throw new Error('Original early VM evidence retired');
      try {
        await read();
        const captured = await reader.serial(instance, start);
        await read();
        return captured;
      } catch (error) {
        refused = true;
        throw error;
      }
    },
  });
  return packet;
}
