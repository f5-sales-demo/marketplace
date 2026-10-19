import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SalesforceContext } from '../plugins/salesforce/src/context/salesforce-context';

type Snapshot = { state: string; reason?: string; retryAfterMs?: number; value?: SalesforceContext };
type Plan = { steps: { kind: string; argv: string[] }[]; validate?: () => Promise<void> };
type Definition = {
  probe(signal?: AbortSignal): Promise<Snapshot>;
  prepareSetup(): Promise<Plan>;
  profile(context: SalesforceContext): { facts: Record<string, unknown> };
};
type Handler = (...args: unknown[]) => unknown;
type Tool = {
  name: string;
  presentation: { result(result: unknown, options: unknown, args: unknown): unknown };
};

/** Qualify shipped registration behavior with injected synthetic responses, never service or login calls. */
export async function qualifySalesforceLifecycle(runtimeRoot: string, pluginRoot: string) {
  const load = (root: string, path: string) => import(pathToFileURL(resolve(root, path)).href);
  const { presentation } = await load(runtimeRoot, 'src/extensibility/presentation.ts');
  const { default: factory } = await load(pluginRoot, 'src/index.ts');
  const contextApi = await load(pluginRoot, 'src/context/salesforce-context.ts');
  const runtimeManifest = JSON.parse(await readFile(resolve(runtimeRoot, 'package.json'), 'utf8'));
  const pluginManifest = JSON.parse(await readFile(resolve(pluginRoot, '.xcsh-plugin/plugin.json'), 'utf8'));
  const { Type } = createRequire(resolve(runtimeRoot, 'package.json'))('@sinclair/typebox');
  const scenarios: string[] = [];
  const check = (condition: unknown, label: string) => {
    if (!condition) throw new Error(`Salesforce qualification failed: ${label}`);
  };
  const identity: SalesforceContext = {
    userId: '005000000000001',
    username: 'synthetic@example.com',
    userType: 'Standard',
    instanceUrl: 'https://salesforce.example.com',
    orgAlias: 'synthetic',
  };
  let available = true;
  let snapshot: Snapshot = { state: 'ready', value: identity };
  let getterFailed = false;
  let response = { code: 0, stdout: '', stderr: '' };
  const calls: string[][] = [];
  const tools: Tool[] = [];
  const handlers = new Map<string, Handler>();
  let definition: Definition | undefined;
  let prepared: Plan | undefined;
  let validations = 0;
  const previousUrl = process.env.SF_ORG_INSTANCE_URL;
  process.env.SF_ORG_INSTANCE_URL = 'https://example.my.salesforce.com';
  try {
    await factory({
      presentation,
      typebox: { Type },
      host: { findExecutable: () => (available ? '/synthetic/sf' : undefined) },
      personProfile: { get: async () => ({ facts: {} }) },
      software: {
        prepareSetup: async (_recipe: unknown, plan: Plan) => {
          prepared = plan;
          return {
            ...plan,
            validate: async () => {
              validations++;
            },
          };
        },
      },
      integrations: {
        register: (value: Definition) => {
          definition = value;
          return {
            get: async () => {
              if (getterFailed) throw new Error('Synthetic unavailable integration getter');
              return snapshot;
            },
          };
        },
      },
      exec: async (_command: string, argv: string[], options: { signal?: AbortSignal }) => {
        check(
          (argv[0] === 'org' && argv[1] === 'display') || (argv[0] === 'data' && argv[1] === 'query'),
          'read-only argv',
        );
        check(options.signal && !options.signal.aborted, 'bounded discovery signal');
        calls.push(argv);
        if (response.code !== 0 || response.stdout) return response;
        const result =
          argv[0] === 'org' ? identity : { records: [{ Id: identity.userId, UserType: identity.userType }] };
        return { code: 0, stdout: JSON.stringify({ status: 0, result }), stderr: '' };
      },
      registerTool: (tool: Tool) => tools.push(tool),
      on: (event: string, handler: Handler) => handlers.set(event, handler),
      setLabel() {},
      logger: { debug() {} },
    });
    if (!definition) throw new Error('Missing Salesforce integration');
    check(tools.length === 6 && calls.length === 0 && prepared === undefined, 'registration has no side effects');
    check(
      [...handlers.keys()].sort().join(',') === 'before_agent_start,session_shutdown,session_start',
      'current lifecycle ownership',
    );
    available = false;
    check(
      (await definition.probe(AbortSignal.timeout(30000))).reason === 'cli_missing' && calls.length === 0,
      'cli-missing',
    );
    scenarios.push('cli-missing');
    available = true;
    for (const [label, stderr, state, reason] of [
      ['expired', 'Session expired', 'setup_required', 'expired'],
      ['permission-denied', 'Access forbidden', 'unavailable', 'permission_denied'],
      ['network', 'Network connection failed', 'unavailable', 'network'],
      ['rate-limited', 'Too many requests 429\nRetry-After: 7', 'rate_limited', 'rate_limited'],
      ['not-authenticated', 'No default org', 'setup_required', 'not_authenticated'],
    ]) {
      response = { code: 1, stdout: '', stderr };
      const actual = await definition.probe(AbortSignal.timeout(30000));
      check(actual.state === state && actual.reason === reason, label);
      if (label === 'rate-limited') check(actual.retryAfterMs === 7000, 'retry evidence');
      scenarios.push(label);
    }
    response = { code: 0, stdout: '{"status":0,"result":{}}', stderr: '' };
    check((await definition.probe(AbortSignal.timeout(30000))).reason === 'invalid_response', 'invalid-response');
    scenarios.push('invalid-response');
    response = { code: 0, stdout: '', stderr: '' };
    check((await definition.probe(AbortSignal.timeout(30000))).value?.userId === identity.userId, 'ready');
    scenarios.push('ready');

    const beforeReview = calls.length;
    const plan = await definition.prepareSetup();
    await plan.validate?.();
    check(calls.length === beforeReview && validations === 1, 'review never executes setup');
    check(plan.steps.length === 1 && plan.steps[0].kind === 'login', 'human login review');
    check(
      plan.steps[0].argv.join(' ') ===
        'sf org login web --set-default --alias SFDC --instance-url https://example.my.salesforce.com',
      'reviewed login argv',
    );
    scenarios.push('setup-review-only');

    const hint = handlers.get('before_agent_start');
    check(hint && (await hint()) === undefined, 'hint-absent');
    scenarios.push('hint-absent');
    snapshot = {
      state: 'ready',
      value: { ...identity, pipelineSummary: { total: 1234567.89, dealCount: 0, byForecast: {} } },
    };
    const message = (await hint?.()) as { message?: { display: boolean; customType: string; content: string } };
    check(message?.message?.display === false && message.message.customType === 'salesforce_hint', 'hidden hint');
    check(
      message.message?.content.includes('Currency unknown: 1,234,567.89') &&
        message.message.content.includes('0 deals, 0 accounts'),
      'hint fidelity',
    );
    scenarios.push('hint-present');
    snapshot = { state: 'unavailable' };
    check((await hint?.()) === undefined, 'hint-unavailable');
    scenarios.push('hint-unavailable');
    getterFailed = true;
    let rejected = false;
    try {
      await hint?.();
    } catch {
      rejected = true;
    }
    check(rejected, 'hint-failed is not invented evidence');
    getterFailed = false;
    scenarios.push('hint-failed');
    for (const [label, userType, principalType] of [
      ['human-profile', 'Standard', 'user'],
      ['service-profile', 'AutomatedProcess', 'service'],
      ['unknown-profile', undefined, 'unknown'],
    ]) {
      const facts = definition.profile({ ...identity, userType }).facts;
      check((facts.accounts as { principalType: string }[])[0].principalType === principalType, label);
      check((facts.identifiers !== undefined) === (principalType === 'user'), 'personal identifiers boundary');
      scenarios.push(label as string);
    }
    let marker = 'first';
    const ctx = {
      hasUI: true,
      ui: {
        get theme() {
          return { symbol: (key: string) => `${marker}:${key}`, spinnerFrames: ['a', 'b'] };
        },
      },
    };
    handlers.get('session_start')?.({}, ctx);
    const query = tools.find((tool) => tool.name === 'sf_query');
    const render = () =>
      JSON.stringify(
        query?.presentation.result(
          { content: [], details: { queryResult: { records: [], done: false, totalSize: 0 } } },
          { expanded: false, isPartial: false },
          { query: 'SELECT Id FROM Task' },
        ),
      );
    check(render().includes('first:status.warning'), 'session theme binding');
    marker = 'second';
    check(render().includes('second:status.warning'), 'live theme getter');
    handlers.get('session_shutdown')?.({});
    check(!render().includes('second:'), 'shutdown clears context');
    scenarios.push('session-theme-and-shutdown');
    return {
      passed: true,
      scenarios,
      tools: tools.map((tool) => tool.name),
      runtimeVersion: runtimeManifest.version,
      pluginVersion: pluginManifest.version,
      evidenceTier: 'installed-plugin-module-with-injected-synthetic-responses',
      setupExecuted: false,
      serviceProbed: false,
    };
  } finally {
    contextApi.configureSalesforceContext();
    contextApi.configureSalesforceExecutor();
    contextApi.configurePersonProfile();
    if (previousUrl === undefined) delete process.env.SF_ORG_INSTANCE_URL;
    else process.env.SF_ORG_INSTANCE_URL = previousUrl;
  }
}

if (import.meta.main) {
  const [runtimeRoot, pluginRoot] = process.argv.slice(2);
  if (!runtimeRoot || !pluginRoot)
    throw new Error('Usage: bun qualify-salesforce-lifecycle.ts <runtime-root> <plugin-root>');
  console.log(JSON.stringify(await qualifySalesforceLifecycle(runtimeRoot, pluginRoot)));
}
