import { describe, expect, it } from 'bun:test';
import type { AzExecApi } from '../../src/az/exec';
import {
  buildResourceGraphArgs,
  createAzResourceGraphQueryTool,
  RESOURCE_GRAPH_ENV,
  RESOURCE_GRAPH_REQUIRED_FLAGS,
  validateResourceGraphParams,
} from '../../src/tools/az-resource-graph-query';

const SUBSCRIPTION_ID = [8, 4, 4, 4, 12].map((length) => 'a'.repeat(length)).join('-');
const SECOND_SUBSCRIPTION_ID = [8, 4, 4, 4, 12].map((length) => 'b'.repeat(length)).join('-');
const HELP = RESOURCE_GRAPH_REQUIRED_FLAGS.join('\n');

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Number: (opts?: Record<string, unknown>) => ({ type: 'number', ...opts }),
    Boolean: (opts?: Record<string, unknown>) => ({ type: 'boolean', ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
    Array: (schema: unknown) => ({ type: 'array', items: schema }),
  },
};

type ExecCall = { command: string; args: string[]; options?: { signal?: AbortSignal; env?: Record<string, string> } };

function mockApi(
  queryResult = { stdout: JSON.stringify({ data: [], count: 0, totalRecords: 0 }), stderr: '', exitCode: 0 },
  overrides?: {
    extension?: { stdout: string; stderr: string; exitCode: number };
    help?: { stdout: string; stderr: string; exitCode: number };
  },
) {
  const calls: ExecCall[] = [];
  const api: AzExecApi = {
    async exec(command, args, options) {
      calls.push({ command, args, options });
      if (args[0] === 'extension') {
        return (
          overrides?.extension ?? {
            stdout: JSON.stringify({ name: 'resource-graph', version: '2.1.0' }),
            stderr: '',
            exitCode: 0,
          }
        );
      }
      if (args.includes('--help')) return overrides?.help ?? { stdout: HELP, stderr: '', exitCode: 0 };
      return queryResult;
    },
  };
  return { api, calls };
}

function makeTool(api: AzExecApi) {
  return createAzResourceGraphQueryTool({ typebox: mockTypebox }, () => api);
}

async function execute(api: AzExecApi, params: Parameters<ReturnType<typeof makeTool>['execute']>[1]) {
  return makeTool(api).execute('id', params, undefined, undefined, { cwd: '/tmp' });
}

describe('az_resource_graph_query metadata and argv', () => {
  it('exposes the dedicated typed fields', () => {
    const { api } = mockApi();
    const tool = makeTool(api);
    expect(tool.name).toBe('az_resource_graph_query');
    expect(tool.parameters).toHaveProperty('query');
    expect(tool.parameters).toHaveProperty('subscriptions');
    expect(tool.parameters).toHaveProperty('first');
    expect(tool.parameters).toHaveProperty('skip');
    expect(tool.parameters).toHaveProperty('skip_token');
    expect(tool.parameters).toHaveProperty('output_projection');
    expect(tool.parameters).toHaveProperty('allow_partial_scopes');
  });

  it('keeps complex KQL and JMESPath in distinct flags and preserves subscription argv entries', () => {
    const kql = `Resources | where name =~ 'edge "blue"' | project id, tags['site']`;
    const projection = '[].{name:name, kind:type}';
    expect(
      buildResourceGraphArgs({
        query: kql,
        subscriptions: [SUBSCRIPTION_ID, SECOND_SUBSCRIPTION_ID],
        first: 25,
        skip_token: 'opaque-token',
        output_projection: projection,
        allow_partial_scopes: true,
      }),
    ).toEqual([
      'graph',
      'query',
      '--graph-query',
      kql,
      '--subscriptions',
      SUBSCRIPTION_ID,
      SECOND_SUBSCRIPTION_ID,
      '--first',
      '25',
      '--skip-token',
      'opaque-token',
      '--query',
      projection,
      '--allow-partial-scopes',
      '--output',
      'json',
    ]);
  });
});

describe('az_resource_graph_query validation', () => {
  it('accepts first with either paging mode', () => {
    expect(validateResourceGraphParams({ query: 'Resources', first: 1, skip: 0 })).toBeUndefined();
    expect(validateResourceGraphParams({ query: 'Resources', first: 1000, skip_token: 'token' })).toBeUndefined();
  });

  it.each([
    [{ query: '' }, 'query is required'],
    [{ query: 'Resources', first: 0 }, 'first must'],
    [{ query: 'Resources', first: 1.5 }, 'first must'],
    [{ query: 'Resources', first: 1001 }, 'first must'],
    [{ query: 'Resources', skip: -1 }, 'skip must'],
    [{ query: 'Resources', skip: 0, skip_token: 'token' }, 'cannot be used together'],
    [{ query: 'Resources', subscriptions: [] }, 'at least one'],
    [{ query: 'Resources', subscriptions: ['not-a-subscription'] }, 'UUID'],
    [{ query: 'Resources\u0000' }, 'control character'],
    [{ query: 'Resources', output_projection: '[]\u007f' }, 'control character'],
  ])('rejects invalid input before execution: %j', async (params, message) => {
    const { api, calls } = mockApi();
    const result = await execute(api, params);
    expect(result.isError).toBe(true);
    expect(result.details.outcome).toBe('invalid_input');
    expect(result.content[0].text).toContain(message);
    expect(calls).toHaveLength(0);
  });
});

describe('az_resource_graph_query preflight and outcomes', () => {
  it('returns setup_required without querying when the extension is absent', async () => {
    const { api, calls } = mockApi(undefined, { extension: { stdout: '', stderr: 'not installed', exitCode: 1 } });
    const result = await execute(api, { query: 'Resources' });
    expect(result.details.outcome).toBe('setup_required');
    expect(calls).toHaveLength(1);
  });

  it('returns unsupported_extension without querying when required flags are absent', async () => {
    const { api, calls } = mockApi(undefined, { help: { stdout: '--graph-query', stderr: '', exitCode: 0 } });
    const result = await execute(api, { query: 'Resources' });
    expect(result.details.outcome).toBe('unsupported_extension');
    expect(result.details.missingFlags).toContain('--skip-token');
    expect(calls).toHaveLength(2);
  });

  it('disables dynamic installation for extension inspection, help, and query execution', async () => {
    const { api, calls } = mockApi();
    await execute(api, { query: 'Resources' });
    expect(calls).toHaveLength(3);
    for (const call of calls) expect(call.options?.env).toEqual(RESOURCE_GRAPH_ENV);
  });

  it('preserves records, totals, truncation, and continuation token', async () => {
    const { api } = mockApi({
      stdout: JSON.stringify({
        data: [{ name: 'one' }],
        count: 1,
        total_records: 4,
        skip_token: 'next',
      }),
      stderr: '',
      exitCode: 0,
    });
    const result = await execute(api, { query: 'Resources', first: 1 });
    expect(result.details).toMatchObject({
      outcome: 'success',
      data: [{ name: 'one' }],
      count: 1,
      totalRecords: 4,
      truncated: true,
      skipToken: 'next',
    });
  });

  it('returns a structured partial-scope success while preserving data', async () => {
    const { api } = mockApi({
      stdout: JSON.stringify({ data: [{ name: 'visible' }], count: 1, totalRecords: 1 }),
      stderr: `Warning: not authorized for ${SUBSCRIPTION_ID}; partial scope results returned`,
      exitCode: 0,
    });
    const result = await execute(api, { query: 'Resources', allow_partial_scopes: true });
    expect(result.isError).toBeUndefined();
    expect(result.details.outcome).toBe('partial_scope');
    expect(result.details.data).toEqual([{ name: 'visible' }]);
    expect(result.details.inaccessibleScopeCount).toBe(1);
  });

  it('treats a string false truncation marker as false', async () => {
    const { api } = mockApi({
      stdout: JSON.stringify({ data: [], count: 0, total_records: 0, result_truncated: 'false' }),
      stderr: '',
      exitCode: 0,
    });
    expect((await execute(api, { query: 'Resources' })).details.truncated).toBe(false);
  });

  it('returns throttling with retry guidance', async () => {
    const { api } = mockApi({ stdout: '', stderr: 'HTTP 429; Retry-After: 17', exitCode: 1 });
    expect((await execute(api, { query: 'Resources' })).details).toMatchObject({
      outcome: 'throttled',
      retryAfterSeconds: 17,
    });
  });

  it('distinguishes authentication and execution failures', async () => {
    const auth = mockApi({ stdout: '', stderr: 'Please run az login', exitCode: 1 });
    expect((await execute(auth.api, { query: 'Resources' })).details.outcome).toBe('authentication_failure');
    const failed = mockApi({ stdout: '', stderr: 'service unavailable', exitCode: 1 });
    expect((await execute(failed.api, { query: 'Resources' })).details.outcome).toBe('execution_failure');
  });

  it('reports malformed JSON as execution_failure', async () => {
    const { api } = mockApi({ stdout: '{', stderr: '', exitCode: 0 });
    expect((await execute(api, { query: 'Resources' })).details.outcome).toBe('execution_failure');
  });
});
