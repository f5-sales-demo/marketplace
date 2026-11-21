import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

for (const failure of ['none', 'repair', 'agent-lock', 'agent-install', 'plugin-lock', 'plugin-install', 'test']) {
  test(`independence pass prepares every frozen graph before cloud stubs: ${failure}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'hermetic-dependencies-'));
    try {
      for (const dir of ['scripts/agent-validation-runtime', 'bin', 'plugins/first/test', 'plugins/second/test'])
        await mkdir(join(root, dir), { recursive: true });
      const script = await readFile(join(import.meta.dir, '../scripts/check-tests-are-hermetic.sh'), 'utf8');
      await writeFile(join(root, 'scripts/check-tests-are-hermetic.sh'), script);
      for (const plugin of ['first', 'second']) {
        await writeFile(join(root, `plugins/${plugin}/test/unit.test.ts`), '// runner order fixture\n');
        if (!(failure === 'plugin-lock' && plugin === 'second'))
          await writeFile(join(root, `plugins/${plugin}/bun.lock`), '// synthetic frozen graph\n');
      }
      if (failure !== 'agent-lock')
        await writeFile(join(root, 'scripts/agent-validation-runtime/bun.lock'), '// synthetic frozen graph\n');
      await writeFile(
        join(root, 'scripts/check-plugin-runtime-dependencies.sh'),
        `#!/bin/sh
test "$1" = --repair || exit 81
test "$PUPPETEER_SKIP_DOWNLOAD" = true || exit 82
${failure === 'repair' ? 'exit 83' : 'touch "$FIXTURE_ROOT/repair-ready"'}
`,
      );
      // Installs use the original PATH; tests see sleeping stubs only once every graph is ready.
      await writeFile(join(root, 'bin/aws'), '#!/bin/sh\nexit 86\n', { mode: 0o700 });
      await writeFile(
        join(root, 'bin/bun'),
        `#!/bin/sh
test -f "$FIXTURE_ROOT/repair-ready" || exit 84
name=$(basename "$PWD")
if [ "$1" = install ]; then
  test "$2" = --frozen-lockfile || exit 85
  test "$(command -v aws)" = "$FIXTURE_ROOT/bin/aws" || exit 87
  test -f bun.lock || exit 88
  if [ "$FAILURE" = agent-install ] && [ "$name" = agent-validation-runtime ]; then exit 89; fi
  if [ "$FAILURE" = plugin-install ] && [ "$name" = second ]; then exit 90; fi
  touch "$FIXTURE_ROOT/$name-ready"
  exit 0
fi
test "$1" = test || exit 91
for graph in agent-validation-runtime first second; do
  test -f "$FIXTURE_ROOT/$graph-ready" || exit 92
done
test "$(command -v aws)" != "$FIXTURE_ROOT/bin/aws" || exit 93
touch "$FIXTURE_ROOT/$name-ran"
if [ "$FAILURE" = test ] && [ "$name" = first ]; then exit 94; fi
`,
        { mode: 0o700 },
      );
      const result = spawnSync('bash', [join(root, 'scripts/check-tests-are-hermetic.sh')], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, PATH: join(root, 'bin') + ':' + process.env.PATH, FIXTURE_ROOT: root, FAILURE: failure },
      });
      expect(result.status).toBe(failure === 'none' ? 0 : 1);
      for (const plugin of ['first', 'second'])
        expect(await Bun.file(join(root, `${plugin}-ran`)).exists()).toBe(['none', 'test'].includes(failure));
      if (failure === 'repair') expect(result.stderr).toContain('runtime dependency precondition failed');
      if (failure.endsWith('-lock')) expect(result.stderr).toContain('no bun.lock');
      if (failure.endsWith('-install')) expect(result.stderr).toContain('dependency installation failed');
      if (failure === 'test') expect(result.stderr).toContain('NOT HERMETIC: first');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
