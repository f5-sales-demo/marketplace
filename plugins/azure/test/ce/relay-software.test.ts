import { expect, test } from 'bun:test';
import type { AzExecApi } from '../../src/az/exec';
import { qualifyAzureRelaySoftware } from '../../src/ce/relay-software';

const digest = `sha256:${'a'.repeat(64)}`;
const image = `quay.io/frrouting/frr@${digest}`;
const selected = { version: '10.4.1', image };
function fixture() {
  const metadata = { Name: 'quay.io/frrouting/frr', Digest: digest, Architecture: 'amd64', Os: 'linux' };
  const installed = [{ Id: `sha256:${'b'.repeat(64)}`, RepoDigests: [image], Architecture: 'amd64', Os: 'linux' }];
  const calls: Array<{ command: string; args: string[] }> = [];
  let version = 'bgpd version 10.4.1\nCopyright FRRouting\n';
  const api: AzExecApi = {
    async exec(command, args) {
      calls.push({ command, args });
      return {
        exitCode: 0,
        stderr: '',
        stdout:
          command === 'skopeo'
            ? JSON.stringify(metadata)
            : args[0] === 'pull'
              ? 'pulled'
              : args[0] === 'image'
                ? JSON.stringify(installed)
                : version,
      };
    },
  };
  return {
    metadata,
    installed,
    calls,
    api,
    setVersion(value: string) {
      version = value;
    },
  };
}
test('qualifies exact OCI metadata, installed image ID and actual FRR binary version in an isolated version-only process', async () => {
  const f = fixture();
  const result = await qualifyAzureRelaySoftware(selected, f.api);
  expect(result.status).toBe('observed');
  expect(result.image).toBe(image);
  expect(result.version).toBe('10.4.1');
  expect(result.imageId).toBe(f.installed[0].Id);
  expect(result.architecture).toBe('amd64');
  expect(result.routing).toBe('unknown');
  expect(result.reads).toHaveLength(4);
  expect(f.calls).toHaveLength(4);
  expect(f.calls[3].args).toContain('--network');
  expect(f.calls[3].args).toContain('none');
  expect(f.calls[3].args).toContain('--read-only');
  expect(f.calls[3].args).toContain('--rm');
  expect(f.calls[3].args).toContain('--cap-drop');
  expect(f.calls[3].args).toContain('ALL');
  expect(f.calls[3].args).toContain('/usr/lib/frr/bgpd');
  expect(f.calls[3].args.at(-1)).toBe('--version');
});
test('wrong digest, foreign repository, platform, duplicate installed images and mismatched binary versions reject', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.metadata.Digest = `sha256:${'c'.repeat(64)}`;
    },
    (f: ReturnType<typeof fixture>) => {
      f.metadata.Name = 'foreign/repository';
    },
    (f: ReturnType<typeof fixture>) => {
      f.metadata.Architecture = 'arm64';
    },
    (f: ReturnType<typeof fixture>) => {
      f.metadata.Os = 'windows';
    },
    (f: ReturnType<typeof fixture>) => {
      f.installed[0].RepoDigests = ['foreign'];
    },
    (f: ReturnType<typeof fixture>) => {
      f.installed[0].Id = 'latest';
    },
    (f: ReturnType<typeof fixture>) => {
      f.installed.push(structuredClone(f.installed[0]));
    },
    (f: ReturnType<typeof fixture>) => {
      f.setVersion('bgpd version 10.4.2\n');
    },
    (f: ReturnType<typeof fixture>) => {
      f.setVersion('bgpd version 10.4.1\nbgpd version 10.4.2\n');
    },
  ]) {
    const f = fixture();
    mutate(f);
    await expect(qualifyAzureRelaySoftware(selected, f.api)).rejects.toThrow();
  }
  for (const stdout of ['null', '{}', 'malformed'])
    await expect(
      qualifyAzureRelaySoftware(selected, {
        async exec() {
          return { exitCode: 0, stderr: '', stdout };
        },
      }),
    ).rejects.toThrow();
  await expect(
    qualifyAzureRelaySoftware(selected, {
      async exec() {
        return { exitCode: 1, stderr: 'unavailable', stdout: '' };
      },
    }),
  ).rejects.toThrow();
});
test('mutable images and unresolved versions reject before execution; cancellation bounds an uncooperative executor', async () => {
  const f = fixture();
  for (const value of [
    { ...selected, image: 'quay.io/frrouting/frr:latest' },
    { ...selected, version: 'latest' },
  ])
    await expect(qualifyAzureRelaySoftware(value, f.api)).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  const abort = new AbortController();
  let calls = 0;
  const pending = qualifyAzureRelaySoftware(
    selected,
    {
      async exec() {
        calls++;
        return new Promise(() => {});
      },
    },
    abort.signal,
  );
  abort.abort(new Error('software cancelled'));
  await expect(pending).rejects.toThrow('software cancelled');
  expect(calls).toBe(1);
});

test('preserves the public image binary build suffix while matching the exact stable base version', async () => {
  const f = fixture();
  f.setVersion('bgpd version 10.4.1_git\nCopyright FRRouting\n');
  expect(await qualifyAzureRelaySoftware(selected, f.api)).toMatchObject({
    version: '10.4.1',
    reportedVersion: '10.4.1_git',
  });
});
