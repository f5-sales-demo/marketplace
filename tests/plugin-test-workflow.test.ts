import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const expression = (path: string) => `\${{ ${path} }}`;
const gate = resolve(root, 'scripts/check-plugin-test-results.sh');
const results = ['success', 'failure', 'cancelled', 'skipped', 'neutral', 'timed_out', '', 'unknown'];

for (const main of results) {
  for (const hermetic of results) {
    test(`required result accepts only both successes: ${main}/${hermetic}`, () => {
      const result = Bun.spawnSync([gate, main, hermetic]);
      expect(result.exitCode === 0).toBe(main === 'success' && hermetic === 'success');
    });
  }
}

for (const args of [[], ['success'], ['success', 'success', 'success']]) {
  test(`required result rejects incorrect input count: ${args.length}`, () => {
    expect(Bun.spawnSync([gate, ...args]).exitCode).not.toBe(0);
  });
}

function field(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Workflow object is missing');
  }
  return Reflect.get(value, key);
}

function steps(value: unknown): unknown[] {
  const result = field(value, 'steps');
  if (!Array.isArray(result)) throw new Error('Workflow steps are missing');
  return result;
}

const workflow: unknown = Bun.YAML.parse(readFileSync(resolve(root, '.github/workflows/validate-plugins.yml'), 'utf8'));
const jobs = field(workflow, 'jobs');

test('required context covers both complete test passes without skipped success', () => {
  const pullRequest = field(field(workflow, 'on'), 'pull_request');
  expect(field(pullRequest, 'paths')).toBeUndefined();
  expect(field(pullRequest, 'paths-ignore')).toBeUndefined();
  const required = field(jobs, 'test');
  expect(field(required, 'name')).toBe('Run plugin test suites');
  expect(field(required, 'needs')).toEqual(['test-main', 'test-hermetic']);
  expect(field(required, 'if')).toBe('always()');
  for (const { name, command } of [
    { name: 'test-main', command: './scripts/run-plugin-tests.sh' },
    { name: 'test-hermetic', command: './scripts/check-tests-are-hermetic.sh' },
  ]) {
    const job = field(jobs, name);
    expect(field(job, 'timeout-minutes')).toBe(360);
    expect(field(job, 'runs-on')).toBe('managed-socketless');
    expect(field(job, 'if')).toBeUndefined();
    expect(field(job, 'continue-on-error')).toBeUndefined();
    const commands = steps(job).filter((step) => field(step, 'run') === command);
    expect(commands).toHaveLength(1);
    for (const step of steps(job)) {
      expect(field(step, 'continue-on-error')).toBeUndefined();
      if (field(step, 'run') === command) {
        expect(field(step, 'if')).toBeUndefined();
        expect(field(field(step, 'env'), 'PYTHONPATH')).toBe(expression('steps.runtime.outputs.python-site'));
      }
    }
    expect(steps(job).some((step) => field(step, 'uses') === './.github/actions/setup-plugin-tests')).toBe(true);
  }
  const check = steps(required).at(-1);
  expect(field(field(check, 'env'), 'MAIN_RESULT')).toBe(expression('needs.test-main.result'));
  expect(field(field(check, 'env'), 'HERMETIC_RESULT')).toBe(expression('needs.test-hermetic.result'));
  expect(field(check, 'run')).toBe('./scripts/check-plugin-test-results.sh "$MAIN_RESULT" "$HERMETIC_RESULT"');
});

test('shared runtime preserves isolated installers and uses a scoped dependency output', () => {
  const action: unknown = Bun.YAML.parse(
    readFileSync(resolve(root, '.github/actions/setup-plugin-tests/action.yml'), 'utf8'),
  );
  const runtime = field(action, 'runs');
  expect(field(runtime, 'using')).toBe('composite');
  const setup = steps(runtime);
  for (const command of [
    './scripts/install-ci-bun.sh',
    './scripts/check-ci-bun-lockfile-compatibility.sh',
    './scripts/install-ci-zsh.sh',
  ]) {
    expect(setup.some((step) => field(step, 'run') === command)).toBe(true);
  }
  for (const step of setup) expect(field(step, 'shell')).toBe('bash');
  const python = field(setup.at(-1), 'run');
  expect(python).toContain('mktemp -d "$RUNNER_TEMP/plugin-tests-python.XXXXXX"');
  expect(python).toContain('python3 -m venv "$plugin_test_python_root"');
  expect(python).toContain('PyYAML==6.0.3');
  expect(python).toContain('"$GITHUB_OUTPUT"');
  expect(python).not.toContain('GITHUB_ENV');
  expect(field(field(field(action, 'outputs'), 'python-site'), 'value')).toBe(expression('steps.python.outputs.site'));
});
