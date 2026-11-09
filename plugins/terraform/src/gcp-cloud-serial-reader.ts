import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import {
  type GoogleAdcAuthenticationRequest,
  type GoogleComputeRead,
  GoogleComputeReadError,
  openGoogleAdcComputeReader,
} from './google-adc-authentication';
import type { InstalledCaptureContext } from './installed-capture-context';
import { readOwnedInstalledInput } from './installed-runtime';
import { linuxMonotonicMs } from './linux-clock';
import { assertSameOriginalInput } from './original-input-monitor';
import { assertFinalReaderReserve, type FinalReaderReserve, inspectFinalReaderReserve } from './reader-final-reserve';
import type { ExecutionCaptureAdmission } from './signal-free-executor';

type Json = Record<string, unknown>;
const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
const name = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const numericId = /^[1-9][0-9]{0,19}$/;
const offset = /^(?:0|[1-9][0-9]{0,19})$/;
const serialOffset = (value: string) =>
  typeof value === 'string' && offset.test(value) && BigInt(value) <= 9223372036854775807n;
const object = (v: unknown): Json => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Malformed original cloud response');
  return v as Json;
};
const decode = (raw: Uint8Array) => object(JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(raw)));
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
    return evidence;
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
        return Object.freeze({ ...evidence, present: false as const });
      }
      if (response.status !== 200) throw new Error('Original cloud read HTTP failure');
      const zoneUrl = `https://www.googleapis.com/compute/v1/projects/${authentication.project}/zones/${zone}`;
      if (
        typeof value.id !== 'string' ||
        !numericId.test(value.id) ||
        value.name !== node ||
        value.zone !== zoneUrl ||
        typeof value.creationTimestamp !== 'string' ||
        !Number.isFinite(Date.parse(value.creationTimestamp)) ||
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
          JSON.stringify(prior.value.networkInterfaces) !== JSON.stringify(original.value.networkInterfaces))
      )
        throw new Error('Original VM identity changed during cloud capture');
      originals.set(key, prior ?? original);
      admitted.add(original);
      return original;
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
          JSON.stringify(current.value.networkInterfaces) !== JSON.stringify(original.value.networkInterfaces)
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
      return Object.freeze({ ...evidence, instanceId: original.value.id, value: Object.freeze(value) });
    });
  };
  return Object.freeze({ instance, serial });
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
