import { expect, test } from 'bun:test';
import { createInstalledGcpInvocationCompiler } from '../src/installed-gcp-invocation';

const directory = '/private/example-deployment';
const selected = {
  PATH: '/example/tools:/usr/bin:/bin',
  HOME: '/private/example-user',
  LANG: 'C.UTF-8',
  HTTPS_PROXY: 'http://proxy.example.com:8080',
  NO_PROXY: 'localhost',
  GOOGLE_APPLICATION_CREDENTIALS: '/private/example-adc.private.json',
  XCSH_API_URL: 'https://tenant.example.com',
  XCSH_API_TOKEN: 'example-private-token',
};
const internal = {
  TF_CLI_CONFIG_FILE: `${directory}/deployment.tfrc`,
  TF_DATA_DIR: `${directory}/.terraform`,
  TF_IN_AUTOMATION: '1',
  TF_INPUT: '0',
  TF_WORKSPACE: 'default',
};
const apply = ['apply', '-input=false', '-lock=true', '-lock-timeout=60s', 'saved.tfplan'];
const invocation = (args = apply) => ({ cwd: directory, args: [...args], env: { ...selected, ...internal } });
const compiler = () => createInstalledGcpInvocationCompiler({ directory, environment: selected });

test('compiled original saved-plan apply adds fixed JSON tracing only after exact runner admission', () => {
  const request = invocation();
  const signal = new AbortController().signal;
  const result = compiler()({ ...request, signal });
  expect(result.args).toEqual([
    'apply',
    '-json',
    '-parallelism=1',
    '-input=false',
    '-lock=true',
    '-lock-timeout=60s',
    'saved.tfplan',
  ]);
  expect(result.env).toEqual({ ...selected, ...internal, TF_LOG: 'JSON' });
  expect(result.signal).toBe(signal);
  expect(result.cwd).toBe(directory);
  expect(request.args).toEqual(apply);
  expect(request.env).toEqual({ ...selected, ...internal });
});

test('actual owning runner read, plan, destroy and action forms preserve exact arguments without tracing', () => {
  const plan = ['plan', '-input=false', '-lock=true', '-lock-timeout=60s', '-refresh=true', '-out=saved.tfplan'];
  for (const args of [
    ['version', '-json'],
    ['init', '-input=false', '-lockfile=readonly'],
    ['validate', '-json'],
    plan,
    [...plan, '-destroy'],
    [...plan, '-invoke=action.xcsh_site_upgrade.example'],
    ['show', '-json', 'saved.tfplan'],
    ['show', '-json', 'terraform.tfstate'],
    ['output', '-json'],
  ]) {
    const result = compiler()(invocation(args));
    expect(result.args).toEqual(args);
    expect(result.env.TF_LOG).toBeUndefined();
    expect(result.env.TF_WORKSPACE).toBe('default');
  }
});

test('ambient variables cannot change original host, credentials, protocol, reason, log files or provider reattachment', () => {
  const request = invocation(['version', '-json']);
  Object.assign(request.env, {
    PRIVATE_OTHER_TOKEN: 'example-ambient-secret',
    AWS_PROFILE: 'example-other-cloud',
    CLOUDSDK_CORE_REQUEST_REASON: 'example-ambient-reason',
    GOOGLE_UNIVERSE_DOMAIN: 'foreign.example.com',
    GODEBUG: 'example',
  });
  const result = compiler()(request);
  for (const key of [
    'PRIVATE_OTHER_TOKEN',
    'AWS_PROFILE',
    'CLOUDSDK_CORE_REQUEST_REASON',
    'GOOGLE_UNIVERSE_DOMAIN',
    'GODEBUG',
  ])
    expect(result.env[key]).toBeUndefined();
  for (const key of ['TF_LOG', 'TF_LOG_PATH', 'TF_REATTACH_PROVIDERS', 'TF_CLI_ARGS', 'TF_VAR_token'])
    expect(() => compiler()({ ...invocation(), env: { ...invocation().env, [key]: 'example-injected' } })).toThrow();
  expect(result.env.HTTPS_PROXY).toBe(selected.HTTPS_PROXY);
  expect(JSON.stringify(result)).not.toContain('example-ambient-secret');
});

test('wrong workspace, ADC, Platform identity, selected route and runner controls refuse before execution', () => {
  for (const [key, value] of [
    ['GOOGLE_APPLICATION_CREDENTIALS', '/private/foreign.json'],
    ['XCSH_API_URL', 'https://foreign.example.com'],
    ['XCSH_API_TOKEN', 'example-foreign-token'],
    ['PATH', '/foreign/tools'],
    ['HOME', '/foreign/home'],
    ['HTTPS_PROXY', 'http://foreign.example.com'],
    ['TF_CLI_CONFIG_FILE', '/private/foreign.tfrc'],
    ['TF_DATA_DIR', '/private/foreign-data'],
    ['TF_WORKSPACE', 'foreign'],
    ['TF_INPUT', '1'],
    ['TF_IN_AUTOMATION', '0'],
  ])
    expect(() => compiler()({ ...invocation(), env: { ...invocation().env, [key]: value } })).toThrow();
  expect(() => compiler()({ ...invocation(), cwd: '/private/foreign' })).toThrow();
});

test('user flags, malformed saved plans, duplicate controls and unreviewed actions cannot enter compiled tracing', () => {
  for (const args of [
    ['apply', '-auto-approve'],
    [...apply, '-json'],
    [...apply, '-parallelism=9'],
    [...apply.slice(0, -1), 'foreign.tfplan'],
    [...apply, '-lock=false'],
    ['destroy', '-auto-approve'],
    ['plan', '-out=foreign.tfplan'],
    ['show', '-json', '/private/foreign.tfstate'],
    ['init', '-upgrade'],
    [
      'plan',
      '-input=false',
      '-lock=true',
      '-lock-timeout=60s',
      '-refresh=true',
      '-out=saved.tfplan',
      '-invoke=action.xcsh_site_upgrade.example; touch /tmp/example',
    ],
  ])
    expect(() => compiler()(invocation(args))).toThrow();
});

test('scope and request mutation cannot replace selected environment; missing identity and loader injection refuse', () => {
  const source = { directory, environment: { ...selected } };
  const compile = createInstalledGcpInvocationCompiler(source);
  source.environment.XCSH_API_TOKEN = 'example-replaced-token';
  source.directory = '/private/replaced';
  const request = invocation();
  const first = compile(request);
  first.args[1] = 'changed';
  first.env.XCSH_API_TOKEN = 'changed';
  expect(compile(request).env.XCSH_API_TOKEN).toBe(selected.XCSH_API_TOKEN);
  expect(compile(request).args[1]).toBe('-json');
  for (const key of [
    'PYTHONPATH',
    'PYTHONHOME',
    'PYTHONSTARTUP',
    'PYTHONINSPECT',
    'PYTHONUSERBASE',
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'DYLD_INSERT_LIBRARIES',
  ])
    expect(() => compile({ ...request, env: { ...request.env, [key]: '/foreign/loader' } })).toThrow();
  expect(() =>
    createInstalledGcpInvocationCompiler({ directory, environment: { ...selected, XCSH_API_TOKEN: '' } }),
  ).toThrow();
});

test('malformed private platform URLs produce a fixed refusal without echoing their input', () => {
  let failure: unknown;
  try {
    createInstalledGcpInvocationCompiler({
      directory,
      environment: { ...selected, XCSH_API_URL: 'example-private-invalid-url' },
    });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toBe('Original installed Platform environment required');
  expect(JSON.stringify(failure)).not.toContain('example-private-invalid-url');
});
