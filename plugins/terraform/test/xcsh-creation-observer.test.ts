import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, open, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test.skipIf(process.platform !== 'linux')(
  'original xcsh process, sink and complete creation receipt Python regressions',
  async () => {
    const python = process.env.CE_TEST_PYTHON ?? Bun.which('python3');
    if (!python) throw new Error('Creation observer tests require the development Python/pytest/psutil interpreter');
    const root = await mkdtemp(join(tmpdir(), 'ce-xcsh-creation-suite-'));
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
        resolve(import.meta.dir, '../../../tests/test_xcsh_creation_observer.py'),
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
      if (code !== 0) {
        const raw = await readFile(join(root, 'stdout.private.log'), 'utf8');
        const cases = [
          ...new Set(
            [...raw.matchAll(/^(?:FAILED|ERROR) [^\r\n]*\b(test_xcsh_creation_observer\.py)::(test_[a-z0-9_]+)/gm)].map(
              (match) => `${match[1]}::${match[2]}`,
            ),
          ),
        ];
        console.error(
          `Creation observer regressions failed (exit ${code}); cases: ${cases.join(', ') || 'unavailable'}; private diagnostics: ${root}`,
        );
      }
      expect(code).toBe(0);
    } finally {
      await stdout.close();
      await stderr.close();
    }
  },
  120_000,
);
