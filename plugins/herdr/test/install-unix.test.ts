import { afterEach, describe, expect, it } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const installer = join(import.meta.dir, '..', 'scripts', 'install-unix.sh');
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(checksum = '') {
  const root = mkdtempSync(join(tmpdir(), 'herdr-installer-'));
  roots.push(root);
  const home = join(root, 'home');
  const packagePath = join(root, 'herdr-package');
  const manifestPath = join(root, 'latest.json');
  mkdirSync(home, { recursive: true });
  writeFileSync(packagePath, '#!/bin/sh\nprintf "herdr 0.18.0\\n"\n', { mode: 0o755 });
  const actual = new Bun.CryptoHasher('sha256').update(readFileSync(packagePath)).digest('hex');
  writeFileSync(
    manifestPath,
    JSON.stringify({
      version: '0.18.0',
      protocol: 26,
      assets: {
        'linux-x86_64': 'https://github.com/f5-sales-demo/herdr/releases/latest/download/herdr-linux-x86_64',
      },
      sha256: { 'linux-x86_64': checksum || actual },
    }),
  );
  return { root, home, packagePath, manifestPath, actual };
}

function run(f: ReturnType<typeof fixture>, extra: Record<string, string> = {}) {
  return Bun.spawnSync(['sh', installer, 'apply', '1.1.2'], {
    env: {
      ...process.env,
      HOME: f.home,
      HERDR_TESTING: '1',
      HERDR_TEST_OS: 'Linux',
      HERDR_TEST_ARCH: 'x86_64',
      HERDR_MANIFEST_FILE: f.manifestPath,
      HERDR_PACKAGE_FILE: f.packagePath,
      ...extra,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

describe('Unix Herdr setup', () => {
  it('installs atomically, writes an owner-only receipt, and is idempotent', () => {
    const f = fixture();
    const first = run(f);
    expect(first.exitCode, new TextDecoder().decode(first.stderr)).toBe(0);
    const binary = join(f.home, '.local', 'bin', 'herdr');
    const receiptPath = join(f.home, '.local', 'state', 'xcsh', 'herdr', 'setup-receipt.json');
    expect(statSync(binary).mode & 0o777).toBe(0o755);
    expect(statSync(receiptPath).mode & 0o777).toBe(0o600);
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    expect(receipt).toMatchObject({
      schema_version: 1,
      plugin_version: '1.1.2',
      herdr_version: '0.18.0',
      protocol: 26,
      target: 'linux-x86_64',
      sha256: f.actual,
      installed_path: binary,
    });
    expect(receipt.url).toBe('https://github.com/f5-sales-demo/herdr/releases/download/v0.18.0/herdr-linux-x86_64');
    const before = statSync(binary).ino;
    const second = run(f);
    expect(second.exitCode).toBe(0);
    expect(new TextDecoder().decode(second.stdout)).toContain('already installed');
    expect(statSync(binary).ino).toBe(before);
  });

  it('rejects a bad checksum and preserves unrelated binaries', () => {
    const f = fixture('b'.repeat(64));
    const bin = join(f.home, '.local', 'bin');
    mkdirSync(bin, { recursive: true });
    const unrelated = join(bin, 'unrelated');
    writeFileSync(unrelated, 'keep');
    const result = run(f);
    expect(result.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(result.stderr)).toContain('checksum_mismatch');
    expect(readFileSync(unrelated, 'utf8')).toBe('keep');
  });

  it('keeps the old binary on interruption and recovers on the next run', () => {
    const f = fixture();
    const bin = join(f.home, '.local', 'bin');
    mkdirSync(bin, { recursive: true });
    const binary = join(bin, 'herdr');
    writeFileSync(binary, '#!/bin/sh\nprintf "herdr 0.17.0\\n"\n');
    chmodSync(binary, 0o755);
    const interrupted = run(f, { HERDR_TEST_INTERRUPT_AFTER_STAGE: '1' });
    expect(interrupted.exitCode).not.toBe(0);
    expect(readFileSync(binary, 'utf8')).toContain('0.17.0');
    const recovered = run(f);
    expect(recovered.exitCode).toBe(0);
    expect(readFileSync(binary, 'utf8')).toContain('0.18.0');
  });

  it('normalizes unsupported targets and records Ubuntu bootstrap intent', () => {
    const f = fixture();
    const unsupported = run(f, { HERDR_TEST_ARCH: 'riscv64' });
    expect(new TextDecoder().decode(unsupported.stderr)).toContain('unsupported_target');
    const aptLog = join(f.root, 'apt.log');
    const bootstrapped = run(f, {
      HERDR_TEST_MISSING_COMMANDS: 'curl,python3',
      HERDR_TEST_APT_LOG: aptLog,
    });
    expect(bootstrapped.exitCode).toBe(0);
    expect(readFileSync(aptLog, 'utf8')).toContain('ca-certificates curl python3');
  });
});
