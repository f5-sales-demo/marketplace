import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, open, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test.skipIf(process.platform !== 'linux')(
  'original provider kernel/SDK and reader lifecycle Python regressions',
  async () => {
    const python = process.env.CE_TEST_PYTHON ?? Bun.which('python3');
    if (!python) throw new Error('Provider process tests require the development Python/pytest/psutil interpreter');
    const root = await mkdtemp(join(tmpdir(), 'ce-provider-python-suite-'));
    await mkdir(join(root, 'diagnostics'), { mode: 0o700 });
    const stdout = await open(join(root, 'stdout.private.log'), 'wx', 0o600);
    const stderr = await open(join(root, 'stderr.private.log'), 'wx', 0o600);
    const child = Bun.spawn(
      [
        python,
        '-I',
        '-B',
        '-m',
        'pytest',
        '-q',
        '-o',
        `pythonpath=${resolve(import.meta.dir, '../../..')}`,
        resolve(import.meta.dir, '../../../tests/test_gcp_provider_process.py'),
        resolve(import.meta.dir, '../../../tests/test_gcp_provider_stderr_pipe.py'),
      ],
      { stdin: 'ignore', stdout: stdout.fd, stderr: stderr.fd, env: { ...process.env } },
    );
    try {
      const code = await child.exited;
      await writeFile(
        join(root, 'completion.private.json'),
        JSON.stringify({ code, pid: child.pid, signalsSent: false }),
        { mode: 0o400, flag: 'wx' },
      );
      expect(code).toBe(0);
    } finally {
      await stdout.close();
      await stderr.close();
    }
  },
  30_000,
);
