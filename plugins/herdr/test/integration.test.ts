import { describe, expect, it } from 'bun:test';
import {
  deriveStableRelease,
  type HerdrReceipt,
  PLUGIN_VERSION,
  type ProbeDependencies,
  probeHerdr,
  REQUIRED_RUNTIME_CAPABILITIES,
  reconcilePath,
  resolveTarget,
  setupCommand,
} from '../extensions/integration';

const sha = 'a'.repeat(64);
const binaryPath = '/home/test/.local/bin/herdr';
const receiptPath = '/home/test/.local/state/xcsh/herdr/setup-receipt.json';
const receipt: HerdrReceipt = {
  schema_version: 1,
  plugin_version: PLUGIN_VERSION,
  herdr_version: '0.18.0',
  protocol: 26,
  target: 'linux-x86_64',
  url: 'https://github.com/f5-sales-demo/herdr/releases/download/v0.18.0/herdr-linux-x86_64',
  sha256: sha,
  installed_path: binaryPath,
  installed_at: '2026-09-22T12:00:00Z',
};

const compatibleStatus = {
  client: { version: '0.18.0', protocol: 26 },
  server: {
    status: 'running',
    running: true,
    version: '0.18.0',
    protocol: 26,
    compatible: true,
    endpoint_compatible: true,
    capabilities: Object.fromEntries(REQUIRED_RUNTIME_CAPABILITIES.map((name) => [name, true])),
  },
};

function dependencies(overrides: Partial<ProbeDependencies> = {}): ProbeDependencies {
  return {
    platform: 'linux',
    arch: 'x64',
    homeDir: '/home/test',
    env: { PATH: '/usr/bin' },
    exists: (path) => path === binaryPath || path === receiptPath,
    readText: () => JSON.stringify(receipt),
    hashFile: () => sha,
    spawn: (_argv) => ({ exitCode: 0, stdout: 'herdr 0.18.0\n', stderr: '' }),
    ...overrides,
  };
}

describe('Herdr platform and stable manifest contracts', () => {
  it('dispatches every supported platform and architecture', () => {
    expect(resolveTarget('linux', 'x64')).toEqual({ target: 'linux-x86_64', windowsEmulated: false });
    expect(resolveTarget('linux', 'arm64')).toEqual({ target: 'linux-aarch64', windowsEmulated: false });
    expect(resolveTarget('darwin', 'x64')).toEqual({ target: 'macos-x86_64', windowsEmulated: false });
    expect(resolveTarget('darwin', 'arm64')).toEqual({ target: 'macos-aarch64', windowsEmulated: false });
    expect(resolveTarget('win32', 'x64')).toEqual({ target: 'windows-x86_64', windowsEmulated: false });
    expect(resolveTarget('win32', 'arm64')).toEqual({ target: 'windows-x86_64', windowsEmulated: true });
    expect(() => resolveTarget('freebsd', 'x64')).toThrow('unsupported_platform');
    expect(() => resolveTarget('linux', 'ia32')).toThrow('unsupported_target');
  });

  it('validates the stable manifest and derives an immutable release URL', () => {
    const resolved = deriveStableRelease(
      {
        version: '0.18.0',
        protocol: 26,
        assets: {
          'linux-x86_64': 'https://github.com/f5-sales-demo/herdr/releases/latest/download/herdr-linux-x86_64',
        },
        sha256: { 'linux-x86_64': sha.toUpperCase() },
      },
      'linux-x86_64',
    );
    expect(resolved).toEqual({
      version: '0.18.0',
      protocol: 26,
      target: 'linux-x86_64',
      url: 'https://github.com/f5-sales-demo/herdr/releases/download/v0.18.0/herdr-linux-x86_64',
      sha256: sha,
    });
  });

  it('rejects malformed versions, protocols, targets, assets, and checksums', () => {
    const base = {
      version: '0.18.0',
      protocol: 26,
      assets: { 'linux-x86_64': 'https://github.com/f5-sales-demo/herdr/releases/latest/download/herdr-linux-x86_64' },
      sha256: { 'linux-x86_64': sha },
    };
    expect(() => deriveStableRelease({ ...base, version: '../latest' }, 'linux-x86_64')).toThrow('manifest_version');
    expect(() => deriveStableRelease({ ...base, protocol: 0 }, 'linux-x86_64')).toThrow('manifest_protocol');
    expect(() => deriveStableRelease(base, 'linux-aarch64')).toThrow('manifest_target');
    expect(() => deriveStableRelease({ ...base, sha256: { 'linux-x86_64': 'bad' } }, 'linux-x86_64')).toThrow(
      'manifest_checksum',
    );
    expect(() =>
      deriveStableRelease({ ...base, assets: { 'linux-x86_64': 'https://example.com/not-herdr' } }, 'linux-x86_64'),
    ).toThrow('manifest_asset');
  });

  it('uses platform-native setup launchers without requiring HERDR_ENV', () => {
    expect(setupCommand('linux')[0]).toBe('sh');
    expect(setupCommand('darwin')[0]).toBe('sh');
    expect(setupCommand('win32')[0]).toMatch(/powershell/i);
  });
});

describe('Herdr installation, context, and runtime probes', () => {
  it('reports a missing installation without contacting GitHub', () => {
    const result = probeHerdr(dependencies({ exists: () => false }));
    expect(result).toMatchObject({
      state: 'setup_required',
      reason: 'cli_missing',
      value: { installation: { state: 'missing' }, context: { state: 'unpaired' }, runtime: { state: 'unpaired' } },
    });
  });

  it('accepts a valid installation outside Herdr and reconciles PATH in-process', () => {
    const env = { PATH: '/usr/bin' };
    const result = probeHerdr(dependencies({ env }));
    expect(result).toMatchObject({
      state: 'ready',
      value: {
        installation: { state: 'ready', version: '0.18.0', hash: sha, target: 'linux-x86_64', pathVisible: true },
        context: { state: 'unpaired' },
        runtime: { state: 'unpaired' },
      },
    });
    expect(env.PATH?.split(':')[0]).toBe('/home/test/.local/bin');
  });

  it('distinguishes tampered, stale-receipt, and self-updated installations', () => {
    expect(probeHerdr(dependencies({ hashFile: () => 'b'.repeat(64) })).value.installation.state).toBe('tampered');
    expect(
      probeHerdr(dependencies({ readText: () => JSON.stringify({ ...receipt, plugin_version: '1.1.0' }) })).value
        .installation.state,
    ).toBe('stale_receipt');
    expect(
      probeHerdr(
        dependencies({
          hashFile: () => 'b'.repeat(64),
          spawn: () => ({ exitCode: 0, stdout: 'herdr 0.19.0\n', stderr: '' }),
        }),
      ).value.installation.state,
    ).toBe('self_updated');
  });

  it('uses a distinct binary checksum when the release asset is an archive', () => {
    const binarySha = 'b'.repeat(64);
    const result = probeHerdr(
      dependencies({
        readText: () => JSON.stringify({ ...receipt, binary_sha256: binarySha }),
        hashFile: () => binarySha,
      }),
    );
    expect(result).toMatchObject({
      state: 'ready',
      value: { installation: { state: 'ready', hash: binarySha } },
    });
  });

  it('reports a genuinely managed compatible runtime and named capabilities', () => {
    const env = {
      PATH: '/usr/bin',
      HERDR_ENV: '1',
      HERDR_SESSION: 'test',
      HERDR_PANE_ID: 'w1:p2',
      HERDR_SOCKET_PATH: '/tmp/herdr.sock',
      HERDR_CONTEXT_CAPABILITY: 'secret-not-returned',
    };
    const result = probeHerdr(
      dependencies({
        env,
        spawn: (argv) =>
          argv.includes('status')
            ? { exitCode: 0, stdout: JSON.stringify(compatibleStatus), stderr: '' }
            : { exitCode: 0, stdout: 'herdr 0.18.0\n', stderr: '' },
      }),
    );
    expect(result).toMatchObject({
      state: 'ready',
      value: {
        context: { state: 'managed' },
        runtime: { state: 'compatible', protocol: 26, capabilities: REQUIRED_RUNTIME_CAPABILITIES },
      },
    });
    expect(JSON.stringify(result)).not.toContain('secret-not-returned');
  });

  it('degrades client/server mismatches and missing required capabilities', () => {
    const env = {
      PATH: '/usr/bin',
      HERDR_ENV: '1',
      HERDR_SESSION: 'test',
      HERDR_PANE_ID: 'w1:p2',
      HERDR_SOCKET_PATH: '/tmp/herdr.sock',
      HERDR_CONTEXT_CAPABILITY: 'opaque',
    };
    const run = (status: unknown) =>
      probeHerdr(
        dependencies({
          env: { ...env },
          spawn: (argv) =>
            argv.includes('status')
              ? { exitCode: 0, stdout: JSON.stringify(status), stderr: '' }
              : { exitCode: 0, stdout: 'herdr 0.18.0\n', stderr: '' },
        }),
      );
    expect(run({ ...compatibleStatus, server: { ...compatibleStatus.server, version: '0.17.0' } })).toMatchObject({
      state: 'degraded',
      value: { runtime: { state: 'client_server_mismatch' } },
    });
    const capabilities = { ...compatibleStatus.server.capabilities };
    delete capabilities.xcsh_semantic_tracking;
    expect(run({ ...compatibleStatus, server: { ...compatibleStatus.server, capabilities } })).toMatchObject({
      state: 'degraded',
      value: { runtime: { state: 'missing_capability', missingCapabilities: ['xcsh_semantic_tracking'] } },
    });
  });
});

describe('PATH reconciliation', () => {
  it('prepends one normalized install entry and preserves unrelated entries', () => {
    expect(reconcilePath('/usr/bin:/home/test/.local/bin:/opt/bin', '/home/test/.local/bin', ':')).toEqual({
      value: '/home/test/.local/bin:/usr/bin:/opt/bin',
      changed: true,
      visibleBefore: true,
    });
  });
});
