import { expect, test } from 'bun:test';
import { createInstalledGcpInvocationCompiler } from '../src/installed-gcp-invocation';

const directory = '/private/prepared-scope-fixture';
const environment = {
  PATH: '/example/tools:/usr/bin:/bin',
  HOME: '/private/example-user',
  GOOGLE_APPLICATION_CREDENTIALS: '/private/example-adc.json',
  XCSH_API_URL: 'https://tenant.example.com',
  XCSH_API_TOKEN: 'example-token',
};
const internal = {
  TF_CLI_CONFIG_FILE: `${directory}/deployment.tfrc`,
  TF_DATA_DIR: `${directory}/.terraform`,
  TF_IN_AUTOMATION: '1',
  TF_INPUT: '0',
  TF_WORKSPACE: 'default',
};
const apply = ['apply', '-input=false', '-lock=true', '-lock-timeout=60s', 'saved.tfplan'];
const invocation = (args = apply) => ({ cwd: directory, args: [...args], env: { ...environment, ...internal } });
function explicit(getter: () => unknown) {
  return createInstalledGcpInvocationCompiler({
    directory,
    environment,
    readPreparedCreationScope: getter,
  } as Parameters<typeof createInstalledGcpInvocationCompiler>[0]);
}

test('explicit source handoff cannot compile creation apply before preparation', () => {
  expect(() => explicit(() => undefined)(invocation())).toThrow();
});
test('serialized prepared scope and path do not become execution authority', () => {
  for (const value of [
    '/private/foreign-scope.json',
    { schemaVersion: 1, kind: 'prepared-original-creation-scope', path: '/private/foreign-scope.json' },
    JSON.parse(JSON.stringify({ path: `${directory}/scope.json`, planSha256: 'a'.repeat(64) })),
  ])
    expect(() => explicit(() => value)(invocation())).toThrow();
});
test('source handoff is consulted only after exact original apply admission', () => {
  let calls = 0;
  const compile = explicit(() => {
    calls++;
    return undefined;
  });
  expect(compile(invocation(['version', '-json'])).env.XCSH_ORIGINAL_CREATION_SCOPE_FILE).toBeUndefined();
  expect(() => compile(invocation(['apply', '-auto-approve']))).toThrow();
  expect(calls).toBe(0);
});
