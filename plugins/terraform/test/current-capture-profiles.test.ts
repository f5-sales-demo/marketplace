import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import * as profiles from '../src/installed-version-profile';

const python = process.env.CE_TEST_PYTHON ?? 'python3';
const bootstrap = 'aac3ade3f7d90fbf63e3ea0c46120a0cfbd159e1e503dde04721979507a1548b';
const terraform = 'dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e';
const xcsh = '3c38dd6ceba946a199970effa34ce0bfcfd4348524b11ec51df3dd9124c5d65f';
const google = '97cc25d78bb8fc4c4cccc0672af0cc776b1175e0f0a5cd6a67ba55f0380189f0';
const current = () =>
  profiles.resolveInstalledGcpVersionProfile({
    terraformVersion: '1.17.2',
    providerLockSha256: 'f77a17ac8bfb5a808da63d887e8427c8663a460600174842e9b534dabf4419a5',
  });

test('current original artifact reference permits capture preparation but copies cannot select it', () => {
  const profile = current();
  expect(profiles.isOriginalCreationScopeProfile(profile)).toBe(true);
  expect(profiles.isOriginalCreationScopeProfile({ ...profile })).toBe(false);
});

test('XC capture resolves its exact executable pair without migrating another provider or Terraform', () => {
  const profile = profiles.resolveInstalledXcshCreationExecutableProfile(terraform, xcsh);
  const expected = current();
  if (!profiles.isOriginalCreationScopeProfile(expected)) throw new Error('Current original profile required');
  expect(profile).toBe(expected);
  expect(profile.xcshVersion).toBe('15.17.6');
  expect(() => profiles.resolveInstalledXcshCreationExecutableProfile('0'.repeat(64), xcsh)).toThrow();
  expect(() => profiles.resolveInstalledXcshCreationExecutableProfile(terraform, '0'.repeat(64))).toThrow();
});

function select(script: string, fn: string, executables: Record<string, { sha256: string }>) {
  const code = `import importlib.util,json,sys\ns=importlib.util.spec_from_file_location("reader",sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nprint(json.dumps(getattr(m,sys.argv[2])(json.loads(sys.argv[3]))))`;
  const child = Bun.spawnSync([
    python,
    '-I',
    '-B',
    '-c',
    code,
    resolve(import.meta.dir, '../scripts', script),
    fn,
    JSON.stringify(executables),
  ]);
  return { code: child.exitCode, out: child.stdout.toString(), err: child.stderr.toString() };
}

test('shipped Google reader admits the current exact pair and rejects a mixed pair', () => {
  const input = { bootstrap: { sha256: bootstrap }, terraform: { sha256: terraform }, provider: { sha256: google } };
  const actual = select('gcp_provider_reader.py', 'select_provider_pins', input);
  expect(actual.err).toBe('');
  expect(actual.code).toBe(0);
  expect(JSON.parse(actual.out)).toEqual({ bootstrap, terraform, provider: google });
  expect(
    select('gcp_provider_reader.py', 'select_provider_pins', { ...input, terraform: { sha256: '0'.repeat(64) } }).code,
  ).not.toBe(0);
});

test('shipped XC reader and TypeScript consumer select the same current artifact pair', () => {
  const input = { bootstrap: { sha256: bootstrap }, terraform: { sha256: terraform }, xcsh: { sha256: xcsh } };
  const actual = select('xcsh_creation_reader.py', 'select_xcsh_pins', input);
  expect(actual.err).toBe('');
  expect(actual.code).toBe(0);
  expect(JSON.parse(actual.out)).toEqual({ bootstrap, terraform, xcsh });
  expect(
    select('xcsh_creation_reader.py', 'select_xcsh_pins', { ...input, xcsh: { sha256: '0'.repeat(64) } }).code,
  ).not.toBe(0);
});
