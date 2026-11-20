import { createHash } from 'node:crypto';
import pins from './gcp-ssh-client-pins.json';

const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original observer guest object framing differs');
  return value as Record<string, unknown>;
};

type ClientName = 'ssh' | 'ssh-keyscan' | 'ssh-keygen';
export interface GcpObserverGuestProcess {
  readonly client: ClientName;
  readonly args: readonly string[];
  readonly pid: number;
  readonly identity: Readonly<Record<string, string | number>>;
  readonly executableSha256: string;
  readonly stdoutSha256: string;
  readonly stderrSha256: string;
  readonly stdoutBase64: string;
  readonly stderrBase64: string;
  readonly exitCode: number;
  readonly originalDeadlineMs: number;
  readonly startedMs: number;
  readonly finishedMs: number;
  readonly originalGroupClosed: true;
  readonly signalsSent: false;
}

function output(value: Record<string, unknown>, channel: 'stdout' | 'stderr') {
  const encoded = value[`${channel}Base64`];
  if (typeof encoded !== 'string' || encoded.length > 90000)
    throw new Error('Original observer guest output bound differs');
  const raw = Buffer.from(encoded, 'base64');
  if (raw.length > 65536 || raw.toString('base64') !== encoded || hash(raw) !== value[`${channel}Sha256`])
    throw new Error('Original observer guest output framing, bytes or hash differs');
  return raw;
}

export interface GcpObserverGuestProcessMapping {
  readonly client: ClientName;
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stdout: 'empty' | 'nonempty';
  readonly marker?: string;
}
/** Consistency only: the native output issuer must establish provenance. */
export function inspectGcpObserverGuestProcess(
  item: unknown,
  request: Readonly<Record<string, unknown>>,
  mapping: Readonly<GcpObserverGuestProcessMapping>,
  window: Readonly<{ startedMs: number; finishedMs: number; originalDeadlineMs: number }>,
): Readonly<GcpObserverGuestProcess> {
  const row = object(item),
    identity = object(row.identity);
  if (
    !exact(row, [
      'client',
      'args',
      'pid',
      'identity',
      'exitCode',
      'executableSha256',
      'stdoutSha256',
      'stderrSha256',
      'stdoutBase64',
      'stderrBase64',
      'originalDeadlineMs',
      'originalGroupClosed',
      'startedMs',
      'finishedMs',
      'signalsSent',
    ]) ||
    row.client !== mapping.client ||
    JSON.stringify(row.args) !== JSON.stringify(mapping.args) ||
    row.exitCode !== mapping.exitCode ||
    row.executableSha256 !== pins.files[mapping.client].sha256 ||
    row.originalGroupClosed !== true ||
    row.signalsSent !== false ||
    !integer(row.pid) ||
    row.pid <= 0
  )
    throw new Error('Original observer guest client command, producer or closure differs');
  if (
    !exact(identity, [
      'pid',
      'group',
      'start',
      'bootId',
      'uid',
      'pythonPath',
      'pythonSha256',
      'clientFd',
      'clientSha256',
      'clientSeals',
      'clientBytes',
      'clientDev',
      'clientIno',
    ]) ||
    identity.pid !== row.pid ||
    identity.group !== row.pid ||
    ['uid', 'bootId', 'pythonPath', 'pythonSha256'].some((key) => identity[key] !== request[key]) ||
    typeof identity.start !== 'string' ||
    !/^[1-9][0-9]*$/.test(identity.start) ||
    !integer(identity.clientFd) ||
    identity.clientFd <= 2 ||
    identity.clientSeals !== 15 ||
    !integer(identity.clientBytes) ||
    identity.clientBytes <= 0 ||
    identity.clientBytes > 16 * 1024 * 1024 ||
    identity.clientSha256 !== pins.files[mapping.client].sha256 ||
    ['clientDev', 'clientIno'].some(
      (key) => typeof identity[key] !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(identity[key] as string),
    )
  )
    throw new Error('Original observer guest gated identity or sealed executable differs');
  if (
    !integer(row.startedMs) ||
    !integer(row.finishedMs) ||
    row.startedMs < window.startedMs ||
    row.finishedMs < row.startedMs ||
    row.finishedMs > window.finishedMs ||
    row.originalDeadlineMs !== window.originalDeadlineMs ||
    row.finishedMs >= window.originalDeadlineMs
  )
    throw new Error('Original observer guest serial process clocks differ');
  const stdout = output(row, 'stdout'),
    stderr = output(row, 'stderr');
  if (
    (mapping.stdout === 'empty' ? stdout.length !== 0 : stdout.length === 0) ||
    (mapping.marker !== undefined && !stderr.toString('utf8').includes(mapping.marker))
  )
    throw new Error('Original observer guest client output content differs');
  return Object.freeze({
    client: mapping.client,
    args: Object.freeze([...mapping.args]),
    pid: row.pid,
    identity: Object.freeze({ ...identity }) as GcpObserverGuestProcess['identity'],
    executableSha256: row.executableSha256 as string,
    stdoutSha256: hash(stdout),
    stderrSha256: hash(stderr),
    stdoutBase64: stdout.toString('base64'),
    stderrBase64: stderr.toString('base64'),
    exitCode: mapping.exitCode,
    originalDeadlineMs: row.originalDeadlineMs as number,
    startedMs: row.startedMs,
    finishedMs: row.finishedMs,
    originalGroupClosed: true,
    signalsSent: false,
  });
}
