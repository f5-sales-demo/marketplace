import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

for (const failed of [false, true]) {
  test(`independence pass ${failed ? 'stops on failed' : 'prepares frozen'} runtime dependencies before tests`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'hermetic-dependencies-'));
    try {
      for (const dir of ['scripts', 'bin', 'plugins/fixture/test']) await mkdir(join(root, dir), { recursive: true });
      const script = await readFile(join(import.meta.dir, '../scripts/check-tests-are-hermetic.sh'), 'utf8');
      await writeFile(join(root, 'scripts/check-tests-are-hermetic.sh'), script);
      await writeFile(
        join(root, 'plugins/fixture/test/unit.test.ts'),
        '// synthetic fixture: test runner order only\n',
      );
      const marker = join(root, 'dependencies-ready'),
        ran = join(root, 'test-ran');
      await writeFile(
        join(root, 'scripts/check-plugin-runtime-dependencies.sh'),
        `#!/bin/sh
test "$1" = --repair || exit 81
test "$PUPPETEER_SKIP_DOWNLOAD" = true || exit 82
${failed ? 'exit 83' : 'touch "$DEPENDENCY_MARKER"'}
`,
      );
      await writeFile(
        join(root, 'bin/bun'),
        `#!/bin/sh
test -f "$DEPENDENCY_MARKER" || exit 84
touch "$TEST_RAN_MARKER"
`,
        { mode: 0o700 },
      );
      const result = spawnSync('bash', [join(root, 'scripts/check-tests-are-hermetic.sh')], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: join(root, 'bin') + ':' + process.env.PATH,
          DEPENDENCY_MARKER: marker,
          TEST_RAN_MARKER: ran,
        },
      });
      expect(result.status).toBe(failed ? 1 : 0);
      expect(await Bun.file(ran).exists()).toBe(!failed);
      if (failed) expect(result.stderr).toContain('runtime dependency precondition failed');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
