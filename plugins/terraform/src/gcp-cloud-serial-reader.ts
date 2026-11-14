import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { decodeEvidenceObject } from './evidence-json';
import { isEvidenceRfc3339 } from './evidence-rfc3339';
import {
  compileGcpInsertAuditQuery,
  type GcpInsertAuditWindow,
  hasAuditControlCharacters,
} from './gcp-insert-audit-query';
import {
  type GoogleAdcAuthenticationRequest,
  type GoogleComputeRead,
  GoogleComputeReadError,
  openGoogleAdcComputeReader,
} from './google-adc-authentication';
import type { InstalledCaptureContext } from './installed-capture-context';
import { readOwnedInstalledInput } from './installed-runtime';
import { linuxMonotonicMs } from './linux-clock';
import { assertSameOriginalInput, type OriginalInputBinding } from './original-input-monitor';
import { assertFinalReaderReserve, type FinalReaderReserve, inspectFinalReaderReserve } from './reader-final-reserve';
import type { ExecutionCaptureAdmission } from './signal-free-executor';

type Json = Record<string, unknown>;
const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
const name = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const numericId = /^[1-9][0-9]{0,19}$/;
const uint64 = (value: unknown): value is string =>
  typeof value === 'string' && numericId.test(value) && BigInt(value) <= 18446744073709551615n;
const operationName = /^(?:[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?|[1-9][0-9]{0,19})$/;
const returnedOperationName = /^[a-z][a-z0-9-]{0,254}$/;
const offset = /^(?:0|[1-9][0-9]{0,19})$/;
const serialOffset = (value: string) =>
  typeof value === 'string' && offset.test(value) && BigInt(value) <= 9223372036854775807n;
const object = (v: unknown): Json => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Malformed original cloud response');
  return v as Json;
};
const decode = (raw: Uint8Array) => decodeEvidenceObject(raw);
export interface GcpCloudReadEvidence {
  readonly path: string;
  readonly sha256: string;
  readonly startedAt: number;
  readonly finishedAt: number;
}
export interface OriginalGcpVm extends GcpCloudReadEvidence {
  readonly present: true;
  readonly zone: string;
  readonly name: string;
  readonly value: Readonly<Json & { id: string }>;
}
export interface GcpInsertOperationCandidate extends GcpCloudReadEvidence {
  readonly kind: 'compute-insert-operation-candidate';
  readonly operationId: string;
  readonly operationName: string;
  readonly targetId: string | null;
  readonly targetName: string;
  readonly zone: string;
  readonly status: 'PENDING' | 'RUNNING' | 'DONE';
  readonly applyPhaseQualified: false;
  readonly originalInsertQualified: false;
}
export interface GcpInsertAuditBatch {
  readonly schemaVersion: 1;
  readonly kind: 'compute-instance-insert-audit-batch';
  readonly complete: true;
  readonly queryPath: string;
  readonly window: GcpInsertAuditWindow;
  readonly project: string;
  readonly zone: string;
  readonly node: string;
  readonly querySha256: string;
  readonly pages: readonly GcpCloudReadEvidence[];
  readonly entries: readonly Readonly<Json>[];
  readonly originalInsertQualified: false;
}
export interface GcpCloudSerialReaderOptions {
  readonly root: string;
  readonly region: string;
  readonly authentication: GoogleAdcAuthenticationRequest;
}

/** Real fixed Compute/serial reads for the installed capture controller.
 * Admission objects are capabilities of this invocation, never receipt flags.
 * Raw replies are durable before decoding, identity joins or coverage checks.
 */
export async function openGcpCloudSerialReader(
  input: GcpCloudSerialReaderOptions,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const { root, region } = input;
  const authentication = Object.freeze({
    ...input.authentication,
    credentialBytes: Buffer.from(input.authentication.credentialBytes),
  });
  if (!isAbsolute(root) || resolve(root) !== root || !name.test(region))
    throw new Error('Private original cloud reader scope required');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const initial = await lstat(root, { bigint: true });
  if (
    !initial.isDirectory() ||
    initial.isSymbolicLink() ||
    initial.uid !== BigInt(process.getuid?.() ?? -1) ||
    (initial.mode & 0o777n) !== 0o700n ||
    (await realpath(root)) !== root
  )
    throw new Error('Private original cloud reader directory required');
  const requireRoot = async () => {
    const current = await lstat(root, { bigint: true });
    if (
      current.dev !== initial.dev ||
      current.ino !== initial.ino ||
      current.uid !== initial.uid ||
      current.mode !== initial.mode ||
      (await realpath(root)) !== root
    )
      throw new Error('Original cloud evidence directory changed');
  };
  const client = await openGoogleAdcComputeReader(authentication, signal, fetcher);
  const admitted = new WeakSet<OriginalGcpVm>();
  const issuedEvidence = new WeakSet<GcpCloudReadEvidence>();
  const auditQueries = new WeakMap<GcpInsertAuditBatch, OriginalInputBinding>();
  const evidenceInputs = new Map<
    string,
    { binding: OriginalInputBinding; scope: Readonly<{ project: string; zone: string; node: string }> }
  >();
  const issue = <T extends GcpCloudReadEvidence>(value: T): T => {
    if (!evidenceInputs.has(value.path)) throw new Error('Original retained cloud evidence required');
    issuedEvidence.add(value);
    return value;
  };
  const originals = new Map<string, OriginalGcpVm>();
  let retired = false;
  const run = async <T>(operation: () => Promise<T>) => {
    if (retired) throw new Error('Original cloud reader is retired');
    try {
      return await operation();
    } catch (error) {
      retired = true;
      throw error;
    }
  };
  const validate = (zone: string, node: string) => {
    if (!name.test(zone) || !zone.startsWith(`${region}-`) || !name.test(node))
      throw new Error('Original named regional cloud scope required');
  };
  const retain = async (
    response: GoogleComputeRead,
    kind: string,
    zone: string,
    node: string,
    querySha256?: string,
  ): Promise<GcpCloudReadEvidence> => {
    await requireRoot();
    const stem = join(root, `${kind}-${randomUUID()}`);
    const path = `${stem}.body.private.bin`;
    const receiptPath = `${stem}.receipt.private.json`;
    const handle = await open(path, 'wx', 0o400);
    try {
      await handle.writeFile(response.raw);
      await handle.sync();
    } finally {
      await handle.close();
    }
    const evidence = Object.freeze({
      path,
      sha256: hash(response.raw),
      startedAt: response.startedAt,
      finishedAt: response.finishedAt,
    });
    const receipt = await open(receiptPath, 'wx', 0o400);
    try {
      await receipt.writeFile(
        JSON.stringify({
          schemaVersion: 1,
          kind,
          project: authentication.project,
          zone,
          nodeName: node,
          ...evidence,
          status: response.status,
          complete: response.complete,
          truncated: response.truncated,
          adcSha256: hash(authentication.credentialBytes),
          accountSha256: authentication.accountSha256,
          audienceSha256: authentication.audienceSha256,
          ...(querySha256 ? { querySha256 } : {}),
          cloudExecutionAuthorized: false,
        }),
      );
      await receipt.sync();
    } finally {
      await receipt.close();
    }
    const directory = await open(root, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    await requireRoot();
    const retained = await readOwnedInstalledInput(path, 4 * 1024 * 1024);
    if (retained.binding.sha256 !== evidence.sha256) throw new Error('Original retained cloud bytes changed');
    evidenceInputs.set(path, {
      binding: retained.binding,
      scope: Object.freeze({ project: authentication.project, zone, node }),
    });
    return issue(evidence);
  };
  const read = async (operation: () => Promise<GoogleComputeRead>, kind: string, zone: string, node: string) => {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof GoogleComputeReadError) {
        try {
          await retain(error.capture, kind, zone, node);
        } catch (persistenceError) {
          throw new AggregateError([error, persistenceError], 'Original cloud capture and persistence failed');
        }
      }
      throw error;
    }
  };
  const instance = async (zone: string, node: string) => {
    validate(zone, node);
    return run(async () => {
      const began = linuxMonotonicMs();
      const response = await read(() => client.instance(zone, node), 'cloud', zone, node);
      const evidence = await retain(response, 'cloud', zone, node);
      const value = decode(response.raw);
      if (response.status === 404) {
        const error = object(value.error);
        if (
          error.code !== 404 ||
          !Array.isArray(error.errors) ||
          !error.errors.some((v) => object(v).reason === 'notFound')
        )
          throw new Error('Attributed original cloud absence required');
        return issue(Object.freeze({ ...evidence, present: false as const }));
      }
      if (response.status !== 200) throw new Error('Original cloud read HTTP failure');
      const zoneUrl = `https://www.googleapis.com/compute/v1/projects/${authentication.project}/zones/${zone}`;
      if (
        !uint64(value.id) ||
        value.name !== node ||
        value.zone !== zoneUrl ||
        typeof value.creationTimestamp !== 'string' ||
        !isEvidenceRfc3339(value.creationTimestamp) ||
        !Array.isArray(value.networkInterfaces) ||
        linuxMonotonicMs() - began > 60000
      )
        throw new Error('Original numeric cloud VM identity required');
      // Freeze all identity-bearing nested fields; later callers cannot rotate
      // the metadata/NIC anchor that brackets serial capture.
      const freeze = (v: unknown): unknown => {
        if (v && typeof v === 'object') {
          for (const child of Object.values(v)) freeze(child);
          Object.freeze(v);
        }
        return v;
      };
      freeze(value);
      const original: OriginalGcpVm = Object.freeze({
        ...evidence,
        present: true,
        zone,
        name: node,
        value: value as OriginalGcpVm['value'],
      });
      const key = `${zone}/${node}`;
      const prior = originals.get(key);
      if (
        prior &&
        (prior.value.id !== original.value.id ||
          prior.value.creationTimestamp !== original.value.creationTimestamp ||
          JSON.stringify(prior.value.metadata) !== JSON.stringify(original.value.metadata) ||
          JSON.stringify(prior.value.networkInterfaces) !== JSON.stringify(original.value.networkInterfaces) ||
          JSON.stringify(prior.value.labels) !== JSON.stringify(original.value.labels) ||
          JSON.stringify(prior.value.serviceAccounts) !== JSON.stringify(original.value.serviceAccounts))
      )
        throw new Error('Original VM identity changed during cloud capture');
      originals.set(key, prior ?? original);
      admitted.add(original);
      return issue(original);
    });
  };
  const serial = async (original: OriginalGcpVm, start: string) => {
    if (!admitted.has(original) || !serialOffset(start))
      throw new Error('An admitted original VM and exact serial offset are required');
    return run(async () => {
      const began = linuxMonotonicMs();
      const assertVm = async () => {
        const current = await instance(original.zone, original.name);
        if (
          !current.present ||
          current.value.id !== original.value.id ||
          current.value.creationTimestamp !== original.value.creationTimestamp ||
          JSON.stringify(current.value.metadata) !== JSON.stringify(original.value.metadata) ||
          JSON.stringify(current.value.networkInterfaces) !== JSON.stringify(original.value.networkInterfaces) ||
          JSON.stringify(current.value.labels) !== JSON.stringify(original.value.labels) ||
          JSON.stringify(current.value.serviceAccounts) !== JSON.stringify(original.value.serviceAccounts)
        )
          throw new Error('Original VM identity changed during serial capture');
      };
      await assertVm();
      const response = await read(
        () => client.serial(original.zone, original.name, start),
        'serial',
        original.zone,
        original.name,
      );
      const evidence = await retain(response, 'serial', original.zone, original.name);
      const value = decode(response.raw);
      await assertVm();
      if (
        response.status !== 200 ||
        typeof value.start !== 'string' ||
        typeof value.next !== 'string' ||
        !serialOffset(value.start) ||
        !serialOffset(value.next) ||
        typeof value.contents !== 'string' ||
        value.start !== start ||
        BigInt(value.next) - BigInt(value.start) !== BigInt(Buffer.byteLength(value.contents)) ||
        linuxMonotonicMs() - began > 60000
      )
        throw new Error('Complete original serial offsets and contents required');
      return issue(Object.freeze({ ...evidence, instanceId: original.value.id, value: Object.freeze(value) }));
    });
  };
  const operations = new Map<string, GcpInsertOperationCandidate>();
  const insertOperation = async (
    zone: string,
    operation: string,
    node: string,
  ): Promise<GcpInsertOperationCandidate> => {
    validate(zone, node);
    if (!operationName.test(operation) || (/^[0-9]+$/.test(operation) && !uint64(operation)))
      throw new Error('Exact named Compute operation scope required');
    return run(async () => {
      const response = await read(() => client.operation(zone, operation), 'insert-operation', zone, node);
      const evidence = await retain(response, 'insert-operation', zone, node);
      const value = decode(response.raw);
      const scope = `https://www.googleapis.com/compute/v1/projects/${authentication.project}/zones/${zone}`;
      if (
        response.status !== 200 ||
        !uint64(value.id) ||
        typeof value.name !== 'string' ||
        !returnedOperationName.test(value.name) ||
        (/^[0-9]+$/.test(operation) ? value.id !== operation : value.name !== operation) ||
        value.operationType !== 'insert' ||
        value.error !== undefined ||
        value.zone !== scope ||
        value.selfLink !== `${scope}/operations/${value.name}` ||
        value.targetLink !== `${scope}/instances/${node}` ||
        !['PENDING', 'RUNNING', 'DONE'].includes(value.status as string) ||
        typeof value.insertTime !== 'string' ||
        !isEvidenceRfc3339(value.insertTime) ||
        (value.targetId !== undefined && !uint64(value.targetId))
      )
        throw new Error('Exact scoped Compute insert operation identity required');
      const targetId = value.targetId === undefined ? null : (value.targetId as string);
      const candidate: GcpInsertOperationCandidate = Object.freeze({
        ...evidence,
        kind: 'compute-insert-operation-candidate',
        operationId: value.id,
        operationName: value.name,
        targetId,
        targetName: node,
        zone,
        status: value.status as GcpInsertOperationCandidate['status'],
        applyPhaseQualified: false,
        originalInsertQualified: false,
      });
      const key = `${zone}/${value.name}`;
      const original = operations.get(key);
      if (
        original &&
        (original.operationId !== candidate.operationId ||
          original.targetName !== node ||
          (original.targetId !== null && original.targetId !== candidate.targetId))
      )
        throw new Error('Original Compute insert operation changed');
      operations.set(key, candidate);
      return issue(candidate);
    });
  };
  const insertAudit = async (zone: string, node: string, input: GcpInsertAuditWindow) => {
    validate(zone, node);
    const window = Object.freeze({ ...input });
    const query = compileGcpInsertAuditQuery(authentication.project, zone, node, window);
    const queryBytes = Buffer.from(JSON.stringify(query));
    const querySha256 = hash(queryBytes);
    return run(async () => {
      const began = linuxMonotonicMs(),
        signalForCommand = AbortSignal.timeout(60_000);
      await requireRoot();
      const queryPath = join(root, `insert-audit-${randomUUID()}.query.private.json`);
      const queryHandle = await open(queryPath, 'wx', 0o400);
      try {
        await queryHandle.writeFile(queryBytes);
        await queryHandle.sync();
      } finally {
        await queryHandle.close();
      }
      const queryDirectory = await open(root, 'r');
      try {
        await queryDirectory.sync();
      } finally {
        await queryDirectory.close();
      }
      await requireRoot();
      const originalQuery = await readOwnedInstalledInput(queryPath, 65536);
      if (originalQuery.binding.sha256 !== querySha256) throw new Error('Original audit query bytes changed');
      const pages: GcpCloudReadEvidence[] = [],
        entries: Readonly<Json>[] = [];
      const tokens = new Set<string>(),
        ids = new Set<string>();
      let pageToken: string | undefined,
        bytes = 0;
      while (true) {
        signalForCommand.throwIfAborted();
        if (linuxMonotonicMs() - began >= 60_000 || pages.length >= 32)
          throw new Error('Original audit command deadline or page bound exhausted');
        let response: GoogleComputeRead;
        try {
          response = await client.auditInstanceInsert(
            zone,
            node,
            window,
            pageToken,
            signalForCommand,
            4 * 1024 * 1024 - bytes,
          );
        } catch (error) {
          if (error instanceof GoogleComputeReadError) {
            try {
              await retain(error.capture, 'insert-audit', zone, node, querySha256);
            } catch (persistenceFailure) {
              throw new AggregateError([error, persistenceFailure], 'Original audit capture and persistence failed');
            }
          }
          throw error;
        }
        // Raw data is durable before any decode or scope/continuation decision.
        pages.push(issue(await retain(response, 'insert-audit', zone, node, querySha256)));
        bytes += response.raw.byteLength;
        if (!response.complete || response.truncated || response.status !== 200 || bytes > 4 * 1024 * 1024)
          throw new Error('Complete bounded original audit response required');
        const value = decode(response.raw);
        if (Object.keys(value).some((key) => !['entries', 'nextPageToken'].includes(key)))
          throw new Error('Original audit envelope contains unsupported fields');
        if (value.entries !== undefined && !Array.isArray(value.entries))
          throw new Error('Original audit entries malformed');
        for (const raw of (value.entries ?? []) as unknown[]) {
          const entry = object(raw),
            payload = object(entry.protoPayload),
            resource = object(entry.resource),
            labels = object(resource.labels);
          if (
            entry.split !== undefined ||
            typeof entry.insertId !== 'string' ||
            !entry.insertId ||
            entry.insertId.length > 256 ||
            hasAuditControlCharacters(entry.insertId) ||
            ids.has(entry.insertId) ||
            typeof entry.timestamp !== 'string' ||
            !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.][0-9]{1,9})?Z$/.test(entry.timestamp) ||
            !isEvidenceRfc3339(entry.timestamp) ||
            Date.parse(entry.timestamp) < Date.parse(window.after) ||
            Date.parse(entry.timestamp) > Date.parse(window.before) ||
            entry.logName !== `projects/${authentication.project}/logs/cloudaudit.googleapis.com%2Factivity` ||
            payload['@type'] !== 'type.googleapis.com/google.cloud.audit.AuditLog' ||
            payload.serviceName !== 'compute.googleapis.com' ||
            payload.methodName !== 'v1.compute.instances.insert' ||
            payload.resourceName !== `projects/${authentication.project}/zones/${zone}/instances/${node}` ||
            resource.type !== 'gce_instance' ||
            labels.project_id !== authentication.project ||
            labels.zone !== zone
          )
            throw new Error('Foreign, replayed or stale original insert audit entry');
          ids.add(entry.insertId);
          const freeze = (v: unknown): unknown => {
            if (v && typeof v === 'object') {
              for (const child of Object.values(v)) freeze(child);
              Object.freeze(v);
            }
            return v;
          };
          freeze(entry);
          entries.push(entry);
        }
        const next = value.nextPageToken;
        if (next === undefined || next === '') break;
        if (typeof next !== 'string' || next.length > 8192 || hasAuditControlCharacters(next) || tokens.has(next))
          throw new Error('Original audit continuation malformed or replayed');
        tokens.add(next);
        pageToken = next;
      }
      signalForCommand.throwIfAborted();
      if (linuxMonotonicMs() - began >= 60_000) throw new Error('Original audit command deadline exhausted');
      const finalQuery = await readOwnedInstalledInput(queryPath, 65536);
      assertSameOriginalInput(originalQuery.binding, finalQuery.binding);
      await authentication.assertOriginal();
      await requireRoot();
      const batch: GcpInsertAuditBatch = Object.freeze({
        schemaVersion: 1 as const,
        kind: 'compute-instance-insert-audit-batch' as const,
        complete: true as const,
        queryPath,
        window,
        project: authentication.project,
        zone,
        node,
        querySha256,
        pages: Object.freeze(pages),
        entries: Object.freeze(entries),
        originalInsertQualified: false as const,
      });
      const issuedQuery = await readOwnedInstalledInput(queryPath, 65536);
      assertSameOriginalInput(originalQuery.binding, issuedQuery.binding);
      auditQueries.set(batch, originalQuery.binding);
      return batch;
    });
  };
  const readEvidence = async (evidence: GcpCloudReadEvidence) => {
    if (!issuedEvidence.has(evidence)) throw new Error('An original reader-issued cloud evidence record is required');
    const admittedInput = evidenceInputs.get(evidence.path);
    if (!admittedInput) throw new Error('Original cloud evidence binding unavailable');
    return run(async () => {
      await authentication.assertOriginal();
      await requireRoot();
      const retained = await readOwnedInstalledInput(evidence.path, 4 * 1024 * 1024);
      assertSameOriginalInput(admittedInput.binding, retained.binding);
      if (retained.binding.sha256 !== evidence.sha256) throw new Error('Original cloud evidence bytes changed');
      await authentication.assertOriginal();
      await requireRoot();
      const final = await readOwnedInstalledInput(evidence.path, 4 * 1024 * 1024);
      assertSameOriginalInput(admittedInput.binding, final.binding);
      if (final.binding.sha256 !== evidence.sha256)
        throw new Error('Original cloud evidence changed after input checks');
      return Object.freeze({
        raw: Buffer.from(retained.bytes),
        scope: admittedInput.scope,
        authentication: Object.freeze({
          accountSha256: authentication.accountSha256,
          audienceSha256: authentication.audienceSha256,
          adcSha256: hash(authentication.credentialBytes),
        }),
      });
    });
  };
  /** Private original bytes only. A batch is not create authority or insert admission. */
  const readAuditEvidence = async (batch: GcpInsertAuditBatch) => {
    const binding = auditQueries.get(batch);
    if (!binding) throw new Error('An original reader-issued audit batch is required');
    return run(async () => {
      await authentication.assertOriginal();
      await requireRoot();
      const query = await readOwnedInstalledInput(batch.queryPath, 65536);
      assertSameOriginalInput(binding, query.binding);
      if (query.binding.sha256 !== batch.querySha256) throw new Error('Original audit query bytes changed');
      const pages = [];
      for (const page of batch.pages) {
        const read = await readEvidence(page);
        if (read.scope.project !== batch.project || read.scope.zone !== batch.zone || read.scope.node !== batch.node)
          throw new Error('Original audit page scope changed');
        pages.push(read);
      }
      // Recheck earlier pages after later reads and guards; a successful first
      // read cannot excuse mutation while the remaining evidence is inspected.
      for (const page of batch.pages) await readEvidence(page);
      await authentication.assertOriginal();
      await requireRoot();
      const final = await readOwnedInstalledInput(batch.queryPath, 65536);
      assertSameOriginalInput(binding, final.binding);
      return Object.freeze({ query: Buffer.from(query.bytes), pages: Object.freeze(pages) });
    });
  };
  return Object.freeze({ instance, serial, insertOperation, insertAudit, readEvidence, readAuditEvidence });
}

export interface InstalledCloudFinalCapture {
  readonly admission: ExecutionCaptureAdmission;
  readonly reserve: FinalReaderReserve;
}

/** The installed controller supplies its original authenticated principal hashes.
 * Read only the already admitted ADC path; never inspect ambient gcloud settings.
 * Every authentication and cloud read checks the original operation or fixed parent reserve.
 */
export async function openInstalledGcpCloudSerialReader(
  context: InstalledCaptureContext,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
  finalCapture?: InstalledCloudFinalCapture,
) {
  if (
    context.schemaVersion !== 2 ||
    context.kind !== 'original-installed-gcp-capture-context' ||
    context.owner.provider !== 'gcp' ||
    context.owner.engine !== 'terraform' ||
    context.environment.GOOGLE_APPLICATION_CREDENTIALS !== context.inputs.adc?.path
  )
    throw new Error('Trusted original installed cloud reader context required');
  const expected = context.authentication;
  const reserve = finalCapture?.reserve;
  if (finalCapture) {
    const snapshot = inspectFinalReaderReserve(finalCapture.reserve);
    const admission = finalCapture.admission;
    if (
      !admission ||
      admission.directory !== context.executionDirectory ||
      admission.args[0] !== 'apply' ||
      admission.originalStartMs !== context.budget.start ||
      admission.originalDeadlineMs !== context.budget.deadline ||
      snapshot.originalStartMs !== context.budget.start ||
      snapshot.originalDeadlineMs !== context.budget.deadline ||
      !admission.identity ||
      (['pid', 'group', 'start', 'boot'] as const).some((key) => admission.identity[key] !== snapshot.identity[key])
    )
      throw new Error('Original installed cloud final reader parent differs');
  }
  const assertClock = async () => {
    if (reserve) await assertFinalReaderReserve(reserve);
    else {
      if (linuxMonotonicMs() >= context.budget.deadline)
        throw new Error('Original installed cloud operation deadline exhausted');
      await context.assertWithinDeadline();
      if (linuxMonotonicMs() >= context.budget.deadline)
        throw new Error('Original installed cloud operation deadline exhausted');
    }
  };
  const assertOriginal = async () => {
    await assertClock();
    await context.assertInputs();
    const providers = await context.readProviderInputs();
    if (Object.keys(providers).length !== 6)
      throw new Error('All six original admitted provider-package inputs required');
    await context.assertInputs();
    await assertClock();
  };
  await assertOriginal();
  const originalAdc = await readOwnedInstalledInput(context.inputs.adc.path, 65536);
  assertSameOriginalInput(context.inputs.adc, originalAdc.binding);
  const bytes = originalAdc.bytes;
  await assertOriginal();
  return openGcpCloudSerialReader(
    {
      root: join(context.executionDirectory, `gcp-cloud-capture-${randomUUID()}`),
      region: context.owner.region,
      authentication: {
        credentialBytes: bytes,
        project: context.owner.account,
        accountSha256: expected.accountSha256,
        audienceSha256: expected.audienceSha256,
        assertOriginal,
      },
    },
    signal,
    fetcher,
  );
}
