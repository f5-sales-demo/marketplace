import type { AzExecApi } from '../az/exec';
import { sha256Hex } from './canonical';
import type { AzureRelaySelection } from './relay-plan';

type Json = Record<string, unknown>;
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure relay software: ${message}`);
};
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed image observation');
  return value as Json;
};

/** Qualify an immutable public FRR image locally, without network, routing daemons or host mounts in the version probe. */
export async function qualifyAzureRelaySoftware(
  selection: AzureRelaySelection['frr'],
  api: AzExecApi,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  require(selection &&
    /^\d+\.\d+\.\d+$/.test(selection.version) &&
    /^quay\.io\/frrouting\/frr@sha256:[a-f0-9]{64}$/.test(
      selection.image,
    ), 'exact public FRR version and immutable image required');
  const expectedDigest = selection.image.split('@')[1];
  const repository = selection.image.split('@')[0];
  const deadline = AbortSignal.any([AbortSignal.timeout(120000), ...(signal ? [signal] : [])]);
  const reads: Array<{ command: string; args: string[]; stdoutSha256: string; observedAt: string }> = [];
  const run = async (command: string, args: string[]) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers<never>();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    let raw: Awaited<ReturnType<AzExecApi['exec']>>;
    try {
      raw = await Promise.race([api.exec(command, args, { signal: deadline }), abort.promise]);
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
    deadline.throwIfAborted();
    require(raw.exitCode === 0, 'image retrieval or version probe unavailable');
    reads.push({ command, args, stdoutSha256: sha256Hex(raw.stdout), observedAt: new Date().toISOString() });
    return raw.stdout;
  };
  const parse = (value: string): unknown => {
    try {
      return JSON.parse(value);
    } catch {
      throw Error('Azure relay software: malformed JSON');
    }
  };
  const metadata = object(
    parse(
      await run('skopeo', [
        'inspect',
        '--override-os',
        'linux',
        '--override-arch',
        'amd64',
        `docker://${selection.image}`,
      ]),
    ),
  );
  require(metadata.Name === repository &&
    metadata.Digest === expectedDigest &&
    metadata.Architecture === 'amd64' &&
    metadata.Os === 'linux', 'OCI identity or platform differs');
  await run('docker', ['pull', '--platform', 'linux/amd64', selection.image]);
  const installed = parse(await run('docker', ['image', 'inspect', selection.image]));
  require(Array.isArray(installed) && installed.length === 1, 'installed image missing or duplicated');
  const image = object((installed as unknown[])[0]);
  require(typeof image.Id === 'string' &&
    /^sha256:[a-f0-9]{64}$/.test(image.Id) &&
    Array.isArray(image.RepoDigests) &&
    image.RepoDigests.includes(selection.image) &&
    image.Architecture === 'amd64' &&
    image.Os === 'linux', 'installed immutable image identity differs');
  const stdout = await run('docker', [
    'run',
    '--rm',
    '--network',
    'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--user',
    'frr',
    '--entrypoint',
    '/usr/lib/frr/bgpd',
    image.Id as string,
    '--version',
  ]);
  const versions = [...stdout.matchAll(/^bgpd version (\d+\.\d+\.\d+)((?:_[a-zA-Z0-9][a-zA-Z0-9._-]*)?)(?:[ \t]|$)/gm)];
  require(versions.length === 1 &&
    versions[0][1] === selection.version, 'actual FRR binary version differs or is ambiguous');
  deadline.throwIfAborted();
  return {
    status: 'observed' as const,
    source: 'installed-isolated-frr-binary' as const,
    version: selection.version,
    reportedVersion: versions[0][1] + versions[0][2],
    image: selection.image,
    imageId: image.Id as string,
    architecture: 'amd64' as const,
    os: 'linux' as const,
    reads,
    observedAt: new Date().toISOString(),
    routing: 'unknown' as const,
    traffic: 'unknown' as const,
    ceSampleFreshnessQualified: false as const,
  };
}
