import { decodeEvidenceObject } from './evidence-json';

export const GCP_OBSERVER_CLOCK_SOURCE = `import hashlib,json,os,platform,pwd,sys,time
exe=os.readlink('/proc/self/exe')
value={'schemaVersion':1,'kind':'gcp-observer-peer-clock','challenge':sys.argv[1],'instanceId':sys.argv[2],'platform':sys.platform,'machine':platform.machine(),'user':pwd.getpwuid(os.getuid()).pw_name,'uid':os.getuid(),'bootId':open('/proc/sys/kernel/random/boot_id').read().strip(),'monotonicMs':time.monotonic_ns()//1000000,'epochMs':time.time_ns()//1000000,'pythonPath':exe,'pythonSha256':hashlib.sha256(open('/proc/self/exe','rb').read()).hexdigest()}
print(json.dumps(value,sort_keys=True))
`;
export interface GcpObserverClockCandidate {
  readonly sourceStartedMs: number;
  readonly sourceFinishedMs: number;
  readonly guestMonotonicMs: number;
  readonly guestEpochMs: number;
  readonly bootId: string;
  readonly uid: number;
  readonly pythonPath: string;
  readonly pythonSha256: string;
  readonly offsetMinimumMs: number;
  readonly offsetMaximumMs: number;
  readonly guestClientQualified: false;
}
/** Consistency projection only. Only the original authenticated SSH output
 * issuer and independently closed command can place it in a verified peer. */
export function inspectGcpObserverPeerClock(
  raw: Uint8Array,
  expected: {
    readonly challenge: string;
    readonly instanceId: string;
    readonly sourceStartedMs: number;
    readonly sourceFinishedMs: number;
  },
): Readonly<GcpObserverClockCandidate> {
  const { sourceStartedMs, sourceFinishedMs } = expected;
  if (
    !Number.isSafeInteger(sourceStartedMs) ||
    sourceStartedMs < 0 ||
    !Number.isSafeInteger(sourceFinishedMs) ||
    sourceFinishedMs < sourceStartedMs ||
    sourceFinishedMs - sourceStartedMs > 60000
  )
    throw new Error('Original observer clock source interval differs');
  const packet = decodeEvidenceObject(raw);
  const keys = [
    'schemaVersion',
    'kind',
    'challenge',
    'instanceId',
    'platform',
    'machine',
    'user',
    'uid',
    'bootId',
    'monotonicMs',
    'epochMs',
    'pythonPath',
    'pythonSha256',
  ];
  if (
    Object.keys(packet).sort().join(',') !== keys.sort().join(',') ||
    packet.schemaVersion !== 1 ||
    packet.kind !== 'gcp-observer-peer-clock' ||
    packet.challenge !== expected.challenge ||
    packet.instanceId !== expected.instanceId ||
    packet.platform !== 'linux' ||
    packet.machine !== 'x86_64' ||
    packet.user !== 'ubuntu' ||
    typeof packet.uid !== 'number' ||
    !Number.isSafeInteger(packet.uid) ||
    packet.uid <= 0 ||
    typeof packet.monotonicMs !== 'number' ||
    !Number.isSafeInteger(packet.monotonicMs) ||
    packet.monotonicMs <= 0 ||
    typeof packet.epochMs !== 'number' ||
    !Number.isSafeInteger(packet.epochMs) ||
    packet.epochMs <= 0 ||
    typeof packet.bootId !== 'string' ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(packet.bootId) ||
    packet.pythonPath !== '/usr/bin/python3.12' ||
    typeof packet.pythonSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(packet.pythonSha256)
  )
    throw new Error('Original observer peer clock framing, identity or platform differs');
  return Object.freeze({
    sourceStartedMs,
    sourceFinishedMs,
    guestMonotonicMs: packet.monotonicMs,
    guestEpochMs: packet.epochMs,
    bootId: packet.bootId,
    uid: packet.uid,
    pythonPath: packet.pythonPath,
    pythonSha256: packet.pythonSha256,
    offsetMinimumMs: packet.monotonicMs - sourceFinishedMs,
    offsetMaximumMs: packet.monotonicMs - sourceStartedMs,
    guestClientQualified: false,
  });
}

/** Fixed source command only; this constructor confers no SSH authorization. */
export function buildGcpObserverClockCommand(challenge: string, instanceId: string): string {
  if (
    !/^[1-9][0-9]{0,19}$/.test(instanceId) ||
    !/^XCSH_OBSERVER_PROBE_[a-f0-9]{64}_[1-9][0-9]{0,19}$/.test(challenge) ||
    !challenge.endsWith(`_${instanceId}`)
  )
    throw new Error('Original observer clock challenge and numeric VM required');
  const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
  return ['/usr/bin/python3', '-I', '-B', '-c', GCP_OBSERVER_CLOCK_SOURCE, challenge, instanceId].map(quote).join(' ');
}
