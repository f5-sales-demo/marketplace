import { expect, it } from 'bun:test';
import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withGcloudCommandGroups } from '../../src/gcloud/command-groups';
import type { GcloudExecApi } from '../../src/gcloud/exec';

function fixture(initial = false) {
  const calls: string[][] = [];
  let installed = initial,
    failInstall = false,
    malformed = false,
    verify = true;
  const raw: GcloudExecApi = {
    exec: async (_command, args) => {
      calls.push([...args]);
      if (args[0] === 'components' && args[1] === 'list') {
        const group = args.find((arg) => arg.startsWith('--filter=id='))?.slice('--filter=id='.length);
        return {
          exitCode: 0,
          stderr: '',
          stdout: malformed
            ? '{bad'
            : JSON.stringify(installed ? [{ id: group, current_version_string: '2026.05.22' }] : []),
        };
      }
      if (args[0] === 'components' && args[1] === 'install') {
        if (failInstall) return { exitCode: 1, stdout: '', stderr: 'private-install-error-fixture' };
        if (verify) installed = true;
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      return { exitCode: 0, stdout: 'requested-command-output', stderr: '' };
    },
  };
  let tail = Promise.resolve();
  const lock = async () => {
    const before = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await before;
    return async () => {
      release();
    };
  };
  return {
    raw,
    calls,
    api: withGcloudCommandGroups(raw, lock),
    fail: () => {
      failInstall = true;
    },
    malformed: () => {
      malformed = true;
    },
    noVerify: () => {
      verify = false;
    },
  };
}
it('installs only the requested missing SDK group before executing unchanged cloud argv', async () => {
  for (const group of ['alpha', 'beta']) {
    const f = fixture();
    const args = [group, 'compute', 'instances', 'list', '--project=test-project', '--filter=name~ce-.*'];
    expect((await f.api.exec('gcloud', args)).stdout).toBe('requested-command-output');
    expect(f.calls.filter((call) => call[1] === 'install')).toEqual([['components', 'install', group, '--quiet']]);
    expect(f.calls.at(-1)).toEqual(args);
    expect(f.calls.filter((call) => call[1] === 'list')).toHaveLength(3);
  }
});
it('installed groups and stable commands do not trigger installation', async () => {
  const f = fixture(true);
  await f.api.exec('gcloud', ['alpha', 'compute', 'instances', 'list']);
  expect(f.calls).toHaveLength(2);
  const stable = fixture();
  await stable.api.exec('gcloud', ['compute', 'instances', 'list']);
  await stable.api.exec('another-cli', ['alpha', 'list']);
  expect(stable.calls).toEqual([
    ['compute', 'instances', 'list'],
    ['alpha', 'list'],
  ]);
});
it('concurrent calls recheck under the installation lock and install once', async () => {
  const f = fixture();
  await Promise.all([
    f.api.exec('gcloud', ['alpha', 'projects', 'list']),
    f.api.exec('gcloud', ['alpha', 'compute', 'instances', 'list']),
  ]);
  expect(f.calls.filter((call) => call[1] === 'install')).toHaveLength(1);
  expect(f.calls.filter((call) => call[0] === 'alpha')).toHaveLength(2);
});
it('the default process lock waits for a concurrent installation and releases its owned claim', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gcloud-component-lock-')));
  const previous = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = root;
  try {
    const f = fixture();
    const raw: GcloudExecApi = {
      exec: async (command, args, options) => {
        if (args[0] === 'components' && args[1] === 'install') await Bun.sleep(400);
        return f.raw.exec(command, args, options);
      },
    };
    const api = withGcloudCommandGroups(raw);
    await Promise.all([
      api.exec('gcloud', ['alpha', 'projects', 'list']),
      api.exec('gcloud', ['alpha', 'compute', 'instances', 'list']),
    ]);
    expect(f.calls.filter((call) => call[1] === 'install')).toHaveLength(1);
    expect(f.calls.filter((call) => call[0] === 'alpha')).toHaveLength(2);
    expect(await readdir(join(root, 'xcsh', 'gcloud-command-groups'))).toEqual([]);
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previous;
    await rm(root, { recursive: true, force: true });
  }
});
it('failed, unverified and malformed component state never launch the requested command or expose raw errors', async () => {
  const failed = fixture();
  failed.fail();
  let message = '';
  try {
    await failed.api.exec('gcloud', ['beta', 'projects', 'list']);
  } catch (error) {
    message = (error as Error).message;
  }
  expect(message).toContain('installation unavailable');
  expect(message).not.toContain('private-install-error-fixture');
  expect(failed.calls.some((call) => call[0] === 'beta')).toBe(false);
  const unverified = fixture();
  unverified.noVerify();
  await expect(unverified.api.exec('gcloud', ['alpha', 'projects', 'list'])).rejects.toThrow(
    'installation not verified',
  );
  expect(unverified.calls.some((call) => call[0] === 'alpha')).toBe(false);
  const malformed = fixture();
  malformed.malformed();
  await expect(malformed.api.exec('gcloud', ['alpha', 'projects', 'list'])).rejects.toThrow('inspection unavailable');
  expect(malformed.calls).toHaveLength(1);
});
it('cancellation before preparation cannot install a group or execute a cloud operation', async () => {
  const f = fixture();
  const signal = AbortSignal.abort();
  await expect(f.api.exec('gcloud', ['alpha', 'projects', 'list'], { signal })).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
});
