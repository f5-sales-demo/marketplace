import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';

interface ExtensionApi {
  integrations: { register<_T>(definition: unknown): unknown };
}

export const PLUGIN_VERSION = '1.1.2';
export const REQUIRED_RUNTIME_CAPABILITIES = [
  'health_check',
  'worker_context_handoff',
  'xcsh_semantic_tracking',
] as const;
const STABLE_MANIFEST_URL = 'https://raw.githubusercontent.com/f5-sales-demo/herdr/build-xcsh/distribution/latest.json';
const UNIX_SETUP = resolve(import.meta.dir, '..', 'scripts', 'install-unix.sh');
const WINDOWS_SETUP = resolve(import.meta.dir, '..', 'scripts', 'install-windows.ps1');

type SpawnResult = { exitCode: number; stdout: string; stderr: string };

export interface HerdrReceipt {
  schema_version: 1;
  plugin_version: string;
  herdr_version: string;
  protocol: number;
  target: string;
  url: string;
  sha256: string;
  binary_sha256?: string;
  installed_path: string;
  installed_at: string;
}

export interface ProbeDependencies {
  platform: string;
  arch: string;
  homeDir: string;
  env: Record<string, string | undefined>;
  exists(path: string): boolean;
  readText(path: string): string;
  hashFile(path: string): string;
  spawn(argv: string[]): SpawnResult;
}

type IntegrationValue = {
  installation: Record<string, unknown>;
  context: Record<string, unknown>;
  runtime: Record<string, unknown>;
};

type ProbeResult = {
  state: 'ready' | 'setup_required' | 'degraded' | 'unavailable';
  reason?: string;
  value: IntegrationValue;
};

export function resolveTarget(platform: string, arch: string) {
  if (platform === 'win32') {
    if (arch === 'x64') return { target: 'windows-x86_64', windowsEmulated: false };
    if (arch === 'arm64') return { target: 'windows-x86_64', windowsEmulated: true };
    throw new Error(`unsupported_target:${platform}-${arch}`);
  }
  const os = platform === 'linux' ? 'linux' : platform === 'darwin' ? 'macos' : undefined;
  if (!os) throw new Error(`unsupported_platform:${platform}`);
  const cpu = arch === 'x64' ? 'x86_64' : arch === 'arm64' ? 'aarch64' : undefined;
  if (!cpu) throw new Error(`unsupported_target:${platform}-${arch}`);
  return { target: `${os}-${cpu}`, windowsEmulated: false };
}

export function deriveStableRelease(manifest: unknown, target: string) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('manifest_schema');
  const value = manifest as Record<string, unknown>;
  if (typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.version)) {
    throw new Error('manifest_version');
  }
  if (!Number.isSafeInteger(value.protocol) || Number(value.protocol) <= 0) throw new Error('manifest_protocol');
  const assets = value.assets;
  const checksums = value.sha256;
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) throw new Error('manifest_schema');
  if (!checksums || typeof checksums !== 'object' || Array.isArray(checksums)) throw new Error('manifest_schema');
  const asset = (assets as Record<string, unknown>)[target];
  const checksum = (checksums as Record<string, unknown>)[target];
  if (typeof asset !== 'string' || typeof checksum !== 'string') throw new Error('manifest_target');
  const expectedName = target === 'windows-x86_64' ? 'herdr-windows-x86_64.zip' : `herdr-${target}`;
  let parsed: URL;
  try {
    parsed = new URL(asset);
  } catch {
    throw new Error('manifest_asset');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'github.com' ||
    !parsed.pathname.startsWith('/f5-sales-demo/herdr/releases/') ||
    basename(parsed.pathname) !== expectedName
  ) {
    throw new Error('manifest_asset');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(checksum)) throw new Error('manifest_checksum');
  return {
    version: value.version,
    protocol: Number(value.protocol),
    target,
    url: `https://github.com/f5-sales-demo/herdr/releases/download/v${value.version}/${expectedName}`,
    sha256: checksum.toLowerCase(),
  };
}

export function setupCommand(platform = process.platform, action: 'apply' | 'verify' = 'apply'): string[] {
  if (platform === 'linux' || platform === 'darwin') return ['sh', UNIX_SETUP, action, PLUGIN_VERSION];
  if (platform === 'win32') {
    return [
      'powershell.exe',
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      WINDOWS_SETUP,
      '-Action',
      action,
      '-PluginVersion',
      PLUGIN_VERSION,
    ];
  }
  return ['false'];
}

export function reconcilePath(pathValue: string | undefined, entry: string, separator = delimiter) {
  const normalize = (value: string) => value.replace(/[\\/]+$/, '').toLowerCase();
  const needle = normalize(entry);
  const current = (pathValue ?? '').split(separator).filter(Boolean);
  const visibleBefore = current.some((candidate) => normalize(candidate) === needle);
  const value = [entry, ...current.filter((candidate) => normalize(candidate) !== needle)].join(separator);
  return { value, changed: value !== (pathValue ?? ''), visibleBefore };
}

function defaultPaths(platform: string, homeDir: string, env: Record<string, string | undefined>) {
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA ?? join(homeDir, 'AppData', 'Local');
    return {
      binary: env.XCSH_HERDR_BIN_PATH ?? join(localAppData, 'Programs', 'Herdr', 'bin', 'herdr.exe'),
      receipt: env.XCSH_HERDR_RECEIPT_PATH ?? join(localAppData, 'xcsh', 'herdr', 'setup-receipt.json'),
    };
  }
  const stateHome = env.XDG_STATE_HOME ?? join(homeDir, '.local', 'state');
  return {
    binary: env.XCSH_HERDR_BIN_PATH ?? join(homeDir, '.local', 'bin', 'herdr'),
    receipt: env.XCSH_HERDR_RECEIPT_PATH ?? join(stateHome, 'xcsh', 'herdr', 'setup-receipt.json'),
  };
}

function parseVersion(text: string) {
  return text.match(/(?:^|\s)v?(\d+\.\d+\.\d+)(?:\s|$)/)?.[1];
}

function isReceipt(value: unknown): value is HerdrReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return (
    r.schema_version === 1 &&
    typeof r.plugin_version === 'string' &&
    typeof r.herdr_version === 'string' &&
    /^\d+\.\d+\.\d+$/.test(r.herdr_version) &&
    Number.isSafeInteger(r.protocol) &&
    Number(r.protocol) > 0 &&
    typeof r.target === 'string' &&
    typeof r.url === 'string' &&
    typeof r.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(r.sha256) &&
    (r.binary_sha256 === undefined ||
      (typeof r.binary_sha256 === 'string' && /^[0-9a-f]{64}$/.test(r.binary_sha256))) &&
    typeof r.installed_path === 'string' &&
    typeof r.installed_at === 'string'
  );
}

function contextDetails(env: Record<string, string | undefined>) {
  const managed =
    env.HERDR_ENV === '1' &&
    Boolean(env.HERDR_SESSION && env.HERDR_PANE_ID && env.HERDR_SOCKET_PATH && env.HERDR_CONTEXT_CAPABILITY);
  const explicitlyPaired =
    !managed && Boolean(env.HERDR_SESSION && env.HERDR_SOCKET_PATH && env.HERDR_CONTEXT_CAPABILITY);
  return { state: managed ? 'managed' : explicitlyPaired ? 'explicitly_paired' : 'unpaired' };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function runtimeDetails(binary: string, context: Record<string, unknown>, spawn: ProbeDependencies['spawn']) {
  if (context.state === 'unpaired') return { state: 'unpaired' };
  const status = spawn([binary, 'status', '--json']);
  if (status.exitCode !== 0) return { state: 'unavailable' };
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(status.stdout) as Record<string, unknown>;
  } catch {
    return { state: 'invalid_status' };
  }
  const client = record(parsed.client);
  const server = record(parsed.server);
  if (!client || !server || server.running !== true) return { state: 'unavailable' };
  const capabilities = record(server.capabilities) ?? {};
  const present = Object.keys(capabilities)
    .filter((name) => Boolean(capabilities[name]))
    .sort();
  const missingCapabilities = REQUIRED_RUNTIME_CAPABILITIES.filter((name) => !capabilities[name]);
  const base = {
    clientVersion: client.version,
    serverVersion: server.version,
    protocol: server.protocol,
    compatible: server.compatible === true && server.endpoint_compatible === true,
    capabilities: present,
  };
  if (client.version !== server.version || client.protocol !== server.protocol || !base.compatible) {
    return { state: 'client_server_mismatch', ...base };
  }
  if (missingCapabilities.length > 0) return { state: 'missing_capability', ...base, missingCapabilities };
  return { state: 'compatible', ...base };
}

function systemDependencies(): ProbeDependencies {
  return {
    platform: process.platform,
    arch: process.arch,
    homeDir: homedir(),
    env: process.env,
    exists: existsSync,
    readText: (path) => readFileSync(path, 'utf8'),
    hashFile: (path) => createHash('sha256').update(readFileSync(path)).digest('hex'),
    spawn: (argv) => {
      const result = Bun.spawnSync(argv, { stdout: 'pipe', stderr: 'pipe' });
      const decoder = new TextDecoder();
      return {
        exitCode: result.exitCode,
        stdout: decoder.decode(result.stdout),
        stderr: decoder.decode(result.stderr),
      };
    },
  };
}

export function probeHerdr(dependencies: ProbeDependencies = systemDependencies()): ProbeResult {
  let target: string;
  try {
    target = resolveTarget(dependencies.platform, dependencies.arch).target;
  } catch {
    return {
      state: 'unavailable',
      reason: 'dependency_missing',
      value: {
        installation: { state: 'unsupported_target' },
        context: { state: 'unpaired' },
        runtime: { state: 'unpaired' },
      },
    };
  }
  const paths = defaultPaths(dependencies.platform, dependencies.homeDir, dependencies.env);
  const context = contextDetails(dependencies.env);
  const base = (installation: Record<string, unknown>, state: ProbeResult['state'], reason?: string): ProbeResult => ({
    state,
    ...(reason ? { reason } : {}),
    value: { installation, context, runtime: { state: 'unpaired' } },
  });
  if (!dependencies.exists(paths.binary) || !dependencies.exists(paths.receipt)) {
    return base(
      { state: 'missing', binary: paths.binary, receipt: paths.receipt, target },
      'setup_required',
      'cli_missing',
    );
  }
  let receipt: HerdrReceipt;
  try {
    const parsed = JSON.parse(dependencies.readText(paths.receipt));
    if (!isReceipt(parsed)) throw new Error('invalid');
    receipt = parsed;
  } catch {
    return base(
      { state: 'invalid_receipt', binary: paths.binary, receipt: paths.receipt, target },
      'setup_required',
      'invalid_response',
    );
  }
  if (
    receipt.plugin_version !== PLUGIN_VERSION ||
    receipt.target !== target ||
    receipt.installed_path !== paths.binary ||
    receipt.url !==
      `https://github.com/f5-sales-demo/herdr/releases/download/v${receipt.herdr_version}/${
        target === 'windows-x86_64' ? 'herdr-windows-x86_64.zip' : `herdr-${target}`
      }`
  ) {
    return base(
      { state: 'stale_receipt', binary: paths.binary, receipt: paths.receipt, target },
      'setup_required',
      'invalid_response',
    );
  }
  let versionResult: SpawnResult;
  let observedHash: string;
  try {
    versionResult = dependencies.spawn([paths.binary, '--version']);
    observedHash = dependencies.hashFile(paths.binary);
  } catch {
    return base(
      { state: 'damaged', binary: paths.binary, receipt: paths.receipt, target },
      'setup_required',
      'invalid_response',
    );
  }
  const observedVersion = versionResult.exitCode === 0 ? parseVersion(versionResult.stdout) : undefined;
  if (observedHash !== (receipt.binary_sha256 ?? receipt.sha256)) {
    const state = observedVersion && observedVersion !== receipt.herdr_version ? 'self_updated' : 'tampered';
    return base(
      { state, binary: paths.binary, receipt: paths.receipt, target, version: observedVersion, hash: observedHash },
      'setup_required',
      'invalid_response',
    );
  }
  if (observedVersion !== receipt.herdr_version) {
    return base(
      {
        state: 'version_mismatch',
        binary: paths.binary,
        receipt: paths.receipt,
        target,
        version: observedVersion,
        hash: observedHash,
      },
      'setup_required',
      'invalid_response',
    );
  }
  const path = reconcilePath(dependencies.env.PATH, dirname(paths.binary));
  dependencies.env.PATH = path.value;
  const installation = {
    state: 'ready',
    receipt: paths.receipt,
    binary: paths.binary,
    version: receipt.herdr_version,
    protocol: receipt.protocol,
    hash: observedHash,
    target,
    url: receipt.url,
    pathVisibleBefore: path.visibleBefore,
    pathVisible: true,
    pathReconciled: path.changed,
  };
  const runtime = runtimeDetails(paths.binary, context, dependencies.spawn);
  const state = context.state !== 'unpaired' && runtime.state !== 'compatible' ? 'degraded' : 'ready';
  return {
    state,
    ...(state === 'degraded' ? { reason: 'invalid_response' } : {}),
    value: { installation, context, runtime },
  };
}

export default function herdrIntegration(pi: ExtensionApi) {
  pi.integrations.register({
    id: 'herdr',
    name: 'Herdr',
    plugin: 'herdr',
    kind: 'local',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: [],
      profileFields: [],
      steps: [{ kind: 'install', argv: setupCommand(process.platform, 'apply'), timeoutMs: 300_000 }],
      verification: [{ argv: setupCommand(process.platform, 'verify'), timeoutMs: 30_000 }],
    },
    async probe() {
      return probeHerdr();
    },
  });
}

export { STABLE_MANIFEST_URL };
