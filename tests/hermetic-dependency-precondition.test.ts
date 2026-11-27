import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

for (const failure of [
  'none',
  'installer-test',
  'builder-test',
  'repair',
  'agent-lock',
  'agent-install',
  'plugin-lock',
  'plugin-install',
  'test',
]) {
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
test "$#" = 1 && test "$1" = --repair || exit 81
test "$PUPPETEER_SKIP_DOWNLOAD" = true || exit 82
test "$PWD" = "$FIXTURE_ROOT" || exit 95
test "$PATH" = "$FIXTURE_ORIGINAL_PATH" || exit 96
test "$(command -v aws)" = "$FIXTURE_ROOT/bin/aws" || exit 87
test -f "$FIXTURE_ROOT/installer-test-ready" && test -f "$FIXTURE_ROOT/builder-test-ready" || exit 97
test "$(cat "$FIXTURE_ROOT/attempts")" = "$(printf 'installer-test\nbuilder-test')" || exit 98
printf 'repair\n' >> "$FIXTURE_ROOT/attempts"
${failure === 'repair' ? 'exit 83' : 'touch "$FIXTURE_ROOT/repair-ready"'}
`,
      );
      // Installs use the original PATH; tests see sleeping stubs only once every graph is ready.
      await writeFile(join(root, 'bin/aws'), '#!/bin/sh\nexit 86\n', { mode: 0o700 });
      await writeFile(
        join(root, 'bin/bun'),
        `#!/bin/sh
# Only these exact root prerequisite commands may precede dependency repair.
if [ "$#" = 2 ] && [ "$1" = test ]; then
  prerequisite=
  case "$2" in
    tests/ci-openssh-installer.test.ts) prerequisite=installer-test ;;
    scripts/build-ce-runtime.test.ts) prerequisite=builder-test ;;
  esac
  if [ -n "$prerequisite" ]; then
    test "$PWD" = "$FIXTURE_ROOT" || exit 95
    test "$PATH" = "$FIXTURE_ORIGINAL_PATH" || exit 96
    test "$(command -v aws)" = "$FIXTURE_ROOT/bin/aws" || exit 87
    test ! -f "$FIXTURE_ROOT/repair-ready" || exit 97
    test ! -f "$FIXTURE_ROOT/$prerequisite-ready" || exit 98
    if [ "$prerequisite" = installer-test ]; then
      test ! -e "$FIXTURE_ROOT/attempts" || exit 98
    else
      test -f "$FIXTURE_ROOT/installer-test-ready" || exit 97
      test "$(cat "$FIXTURE_ROOT/attempts")" = installer-test || exit 98
    fi
    printf '%s\n' "$prerequisite" >> "$FIXTURE_ROOT/attempts"
    test "$FAILURE" != "$prerequisite" || exit 99
    touch "$FIXTURE_ROOT/$prerequisite-ready"
    exit 0
  fi
fi
test -f "$FIXTURE_ROOT/installer-test-ready" && test -f "$FIXTURE_ROOT/builder-test-ready" || exit 97
test -f "$FIXTURE_ROOT/repair-ready" || exit 84
name=$(basename "$PWD")
if [ "$1" = install ]; then
  test "$#" = 2 && test "$2" = --frozen-lockfile || exit 85
  test "$PATH" = "$FIXTURE_ORIGINAL_PATH" || exit 96
  test "$(command -v aws)" = "$FIXTURE_ROOT/bin/aws" || exit 87
  test -f bun.lock || exit 88
  test ! -f "$FIXTURE_ROOT/$name-ready" || exit 98
  case "$name" in
    agent-validation-runtime) test "$PWD" = "$FIXTURE_ROOT/scripts/agent-validation-runtime" || exit 95 ;;
    first) test "$PWD" = "$FIXTURE_ROOT/plugins/first" && test -f "$FIXTURE_ROOT/agent-validation-runtime-ready" || exit 95 ;;
    second) test "$PWD" = "$FIXTURE_ROOT/plugins/second" && test -f "$FIXTURE_ROOT/first-ready" || exit 95 ;;
    *) exit 95 ;;
  esac
  printf '%s-install\n' "$name" >> "$FIXTURE_ROOT/attempts"
  if [ "$FAILURE" = agent-install ] && [ "$name" = agent-validation-runtime ]; then exit 89; fi
  if [ "$FAILURE" = plugin-install ] && [ "$name" = second ]; then exit 90; fi
  touch "$FIXTURE_ROOT/$name-ready"
  exit 0
fi
test "$#" = 2 && test "$1" = test && test "$2" = . || exit 91
for graph in agent-validation-runtime first second; do
  test -f "$FIXTURE_ROOT/$graph-ready" || exit 92
done
case "$name" in first|second) test "$PWD" = "$FIXTURE_ROOT/plugins/$name" || exit 95 ;; *) exit 95 ;; esac
test "$PATH" != "$FIXTURE_ORIGINAL_PATH" || exit 96
test "$PATH" = "$(dirname "$(command -v aws)"):$FIXTURE_ORIGINAL_PATH" || exit 96
test "$(command -v aws)" != "$FIXTURE_ROOT/bin/aws" || exit 93
test ! -f "$FIXTURE_ROOT/$name-ran" || exit 98
printf '%s-test\n' "$name" >> "$FIXTURE_ROOT/attempts"
touch "$FIXTURE_ROOT/$name-ran"
if [ "$FAILURE" = test ] && [ "$name" = first ]; then exit 94; fi
`,
        { mode: 0o700 },
      );
      const result = spawnSync('bash', [join(root, 'scripts/check-tests-are-hermetic.sh')], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: join(root, 'bin') + ':' + process.env.PATH,
          FIXTURE_ROOT: root,
          FIXTURE_ORIGINAL_PATH: join(root, 'bin') + ':' + process.env.PATH,
          FAILURE: failure,
        },
      });
      expect(result.status).toBe(failure === 'none' ? 0 : 1);
      const attempts = ['installer-test'];
      if (failure !== 'installer-test') attempts.push('builder-test');
      const prerequisitesPassed = !['installer-test', 'builder-test'].includes(failure);
      if (prerequisitesPassed) attempts.push('repair');
      if (prerequisitesPassed && !['repair', 'agent-lock'].includes(failure))
        attempts.push('agent-validation-runtime-install');
      if (prerequisitesPassed && !['repair', 'agent-lock', 'agent-install'].includes(failure))
        attempts.push('first-install');
      if (prerequisitesPassed && !['repair', 'agent-lock', 'agent-install', 'plugin-lock'].includes(failure))
        attempts.push('second-install');
      if (['none', 'test'].includes(failure)) attempts.push('first-test', 'second-test');
      const attemptFile = Bun.file(join(root, 'attempts'));
      expect(await attemptFile.exists()).toBe(true);
      if (await attemptFile.exists()) expect((await attemptFile.text()).trim().split('\n')).toEqual(attempts);
      for (const prerequisite of ['installer-test', 'builder-test'])
        expect(await Bun.file(join(root, `${prerequisite}-ready`)).exists()).toBe(
          prerequisite === 'installer-test' ? failure !== 'installer-test' : prerequisitesPassed,
        );
      expect(await Bun.file(join(root, 'repair-ready')).exists()).toBe(prerequisitesPassed && failure !== 'repair');
      for (const graph of ['agent-validation-runtime', 'first', 'second'])
        expect(await Bun.file(join(root, `${graph}-ready`)).exists()).toBe(
          attempts.includes(`${graph}-install`) &&
            failure !==
              (graph === 'agent-validation-runtime' ? 'agent-install' : graph === 'second' ? 'plugin-install' : ''),
        );
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
