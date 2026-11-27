import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const installer = join(root, 'scripts/install-ci-openssh.sh');
function requireExecutable(name: string): string {
  const executable = Bun.which(name);
  if (!executable) throw new Error(`Missing installer regression prerequisite: ${name}`);
  return executable;
}
const bash = requireExecutable('bash');
const python = requireExecutable('python3');
const roots: string[] = [];
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function field(bytes: Buffer): Buffer {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  return Buffer.concat([size, bytes]);
}
// Synthetic parser fixture only. Real RSA generation is qualified on the runner separately.
const modulus = Buffer.alloc(513, 0x41);
modulus[0] = 0;
modulus[1] = 0x80;
const blob = Buffer.concat([field(Buffer.from('ssh-rsa')), field(Buffer.from([1, 0, 1])), field(modulus)]);
const publicKey = `ssh-rsa ${blob.toString('base64')}`;
const fingerprint = createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');

function fixture(options: { failure?: string; system?: string; machine?: string; missing?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ci-openssh-regression-'));
  roots.push(dir);
  const bin = join(dir, 'bin');
  const temp = join(dir, 'runner temp');
  const githubPath = join(dir, 'github-path');
  mkdirSync(bin);
  mkdirSync(temp);
  writeFileSync(githubPath, 'existing-path\n');
  function executable(name: string, body: string) {
    writeFileSync(join(bin, name), `#!${bash}\nset -euo pipefail\n${body}\n`);
    chmodSync(join(bin, name), 0o700);
  }
  for (const name of ['mktemp', 'rm', 'chmod', 'cat']) {
    const path = Bun.which(name);
    if (!path) throw new Error(`Missing regression prerequisite: ${name}`);
    symlinkSync(path, join(bin, name));
  }
  symlinkSync(python, join(bin, 'python3'));
  executable(
    'uname',
    'if [[ "$1" == -s ]]; then printf "%s\\n" "$TEST_SYSTEM"; else printf "%s\\n" "$TEST_MACHINE"; fi',
  );
  executable(
    'curl',
    `printf '%s\\n' "$@" > "$TEST_ROOT/curl-args"
[[ "$TEST_FAILURE" != download ]] || exit 22
while [[ $# -gt 0 ]]; do
  if [[ "$1" == --output ]]; then printf 'synthetic-package' > "$2"; exit 0; fi
  shift
done
exit 2`,
  );
  executable(
    'sha256sum',
    `cat > "$TEST_ROOT/checksum-input"
[[ "$TEST_FAILURE" != checksum ]] || exit 1`,
  );
  const sshBody = `#!${bash}
[[ "$TEST_FAILURE" != version ]] || { printf 'OpenSSH_1.0\\n' >&2; exit 0; }
printf 'OpenSSH_9.6p1 Ubuntu-3ubuntu13.20, OpenSSL fixture\\n' >&2
`;
  const keygenBody = `#!${bash}
set -euo pipefail
if [[ "$1" == -t ]]; then
  [[ "$TEST_FAILURE" != generation ]] || exit 1
  [[ "$*" == *'rsa'* && "$*" == *'4096'* ]] || exit 2
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == -f ]]; then
      printf 'SYNTHETIC PRIVATE FIXTURE' > "$2"
      if [[ "$TEST_FAILURE" == malformed ]]; then printf 'ssh-rsa !!!\\n' > "$2.pub"; else printf '%s\\n' "$TEST_PUBLIC_KEY" > "$2.pub"; fi
      exit 0
    fi
    shift
  done
  exit 2
fi
[[ "$TEST_FAILURE" != parsing ]] || exit 1
if [[ "$TEST_FAILURE" == fingerprint ]]; then printf '4096 SHA256:wrong fixture (RSA)\\n'; else printf '4096 SHA256:%s fixture (RSA)\\n' "$TEST_FINGERPRINT"; fi
`;
  writeFileSync(join(dir, 'ssh-fixture'), sshBody, { mode: 0o700 });
  writeFileSync(join(dir, 'keygen-fixture'), keygenBody, { mode: 0o700 });
  executable(
    'dpkg-deb',
    `[[ "$TEST_FAILURE" != extraction ]] || exit 1
[[ "$1" == --extract ]] || exit 2
"$TEST_PYTHON" - "$3" "$TEST_ROOT" <<'PY'
import pathlib, shutil, sys
target = pathlib.Path(sys.argv[1]) / 'usr/bin'
target.mkdir(parents=True)
for source, name in [('ssh-fixture', 'ssh'), ('keygen-fixture', 'ssh-keygen')]:
    shutil.copy2(pathlib.Path(sys.argv[2]) / source, target / name)
PY`,
  );
  if (options.missing) rmSync(join(bin, options.missing));
  const env = {
    ...process.env,
    PATH: bin,
    RUNNER_TEMP: temp,
    GITHUB_PATH: githubPath,
    TEST_ROOT: dir,
    TEST_PYTHON: python,
    TEST_FAILURE: options.failure ?? '',
    TEST_SYSTEM: options.system ?? 'Linux',
    TEST_MACHINE: options.machine ?? 'x86_64',
    TEST_PUBLIC_KEY: publicKey,
    TEST_FINGERPRINT: fingerprint,
  };
  return { dir, temp, githubPath, env, run: () => Bun.spawnSync([bash, installer], { env }) };
}

test('verified installer publishes the extracted parser only after independent fingerprint validation and key retirement', () => {
  const f = fixture();
  const result = f.run();
  expect(result.stderr.toString()).toBe('');
  expect(result.exitCode).toBe(0);
  const paths = readFileSync(f.githubPath, 'utf8').trim().split('\n');
  expect(paths).toHaveLength(2);
  expect(paths[0]).toBe('existing-path');
  expect(paths[1]).toStartWith(`${f.temp}/openssh-`);
  expect(existsSync(join(paths[1], 'ssh-keygen'))).toBe(true);
  const installRoot = resolve(paths[1], '../..');
  expect(readdirSync(installRoot).sort()).toEqual(['usr']);
  const args = readFileSync(join(f.dir, 'curl-args'), 'utf8');
  expect(args).toContain('--proto\n=https\n');
  expect(args).toContain('--proto-redir\n=https\n');
  expect(args).toContain(
    'https://security.ubuntu.com/ubuntu/pool/main/o/openssh/openssh-client_9.6p1-3ubuntu13.20_amd64.deb',
  );
  expect(readFileSync(join(f.dir, 'checksum-input'), 'utf8')).toStartWith(
    '5fb4429e9eff60a5b4ddb68ccf0c46ee67066b445794ede5fe181e64c4a8b795  ',
  );
});

for (const failure of [
  'download',
  'checksum',
  'extraction',
  'version',
  'generation',
  'parsing',
  'fingerprint',
  'malformed',
]) {
  test(`rejects ${failure} without publishing PATH or leaving installation/key material`, () => {
    const f = fixture({ failure });
    expect(f.run().exitCode).not.toBe(0);
    expect(readFileSync(f.githubPath, 'utf8')).toBe('existing-path\n');
    expect(readdirSync(f.temp)).toEqual([]);
  });
}

for (const platform of [{ system: 'Darwin' }, { machine: 'aarch64' }]) {
  test(`rejects unsupported platform ${JSON.stringify(platform)} before download`, () => {
    const f = fixture(platform);
    const result = f.run();
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('Ubuntu amd64');
    expect(existsSync(join(f.dir, 'curl-args'))).toBe(false);
    expect(readFileSync(f.githubPath, 'utf8')).toBe('existing-path\n');
    expect(readdirSync(f.temp)).toEqual([]);
  });
}

for (const missing of ['curl', 'sha256sum', 'dpkg-deb', 'python3', 'mktemp', 'rm', 'uname']) {
  test(`rejects missing ${missing} explicitly before download`, () => {
    const f = fixture({ missing });
    const result = f.run();
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain(`Required command is unavailable: ${missing}`);
    expect(existsSync(join(f.dir, 'curl-args'))).toBe(false);
    expect(readFileSync(f.githubPath, 'utf8')).toBe('existing-path\n');
    expect(readdirSync(f.temp)).toEqual([]);
  });
}

for (const name of ['RUNNER_TEMP', 'GITHUB_PATH'] as const) {
  for (const invalid of ['', 'relative/path', '/tmp/path\ninjected']) {
    test(`rejects invalid ${name}: ${JSON.stringify(invalid)}`, () => {
      const f = fixture();
      f.env[name] = invalid;
      expect(f.run().stderr.toString()).toContain(`${name} must be an absolute path without newlines`);
      expect(existsSync(join(f.dir, 'curl-args'))).toBe(false);
      expect(readFileSync(f.githubPath, 'utf8')).toBe('existing-path\n');
    });
  }
}

test('complete and cloud-independent passes explicitly execute installer regressions', () => {
  for (const script of ['run-plugin-tests.sh', 'check-tests-are-hermetic.sh']) {
    expect(readFileSync(join(root, 'scripts', script), 'utf8')).toContain('tests/ci-openssh-installer.test.ts');
  }
});
