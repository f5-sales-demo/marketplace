import type { AzExecApi } from '../az/exec';
import { detectAzError, parseAzJsonOutput } from '../az/exec';
import { RESOURCE_GRAPH_REQUIRED_FLAGS } from '../az/resource-graph';
import type { PluginInterface } from '../az/types';
import { SUBSCRIPTION_ID_PATTERN } from '../az/types';
import description from '../prompts/az-resource-graph-query.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, textResult } from './shared';

export const RESOURCE_GRAPH_ENV = { AZURE_EXTENSION_USE_DYNAMIC_INSTALL: 'no' } as const;

type Params = {
  query: string;
  subscriptions?: string[];
  first?: number;
  skip?: number;
  skip_token?: string;
  output_projection?: string;
  allow_partial_scopes?: boolean;
};

export { RESOURCE_GRAPH_REQUIRED_FLAGS } from '../az/resource-graph';

// biome-ignore lint/suspicious/noControlCharactersInRegex: OS argv cannot contain control bytes.
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function invalid(message: string) {
  return errorResult(`Error: ${message}`, { tool: 'az_resource_graph_query', outcome: 'invalid_input' });
}

function retryAfter(stderr: string): number | undefined {
  const match = stderr.match(/retry[- ]after(?:\s*[:=]\s*|\s+)(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function inaccessibleScopeCount(stderr: string): number | undefined {
  const identifiers = stderr.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
  return identifiers?.length ? new Set(identifiers.map((identifier) => identifier.toLowerCase())).size : undefined;
}

function isTruncated(value: unknown): boolean {
  return value === true || value === 'true';
}

export function validateResourceGraphParams(params: Params): string | undefined {
  if (!params.query?.trim()) return 'query is required.';
  for (const [name, value] of [
    ['query', params.query],
    ['skip_token', params.skip_token],
    ['output_projection', params.output_projection],
  ] as const) {
    if (value !== undefined && CONTROL_CHAR_PATTERN.test(value)) return `${name} contains a control character.`;
  }
  if (params.first !== undefined && (!Number.isInteger(params.first) || params.first < 1 || params.first > 1000)) {
    return 'first must be an integer from 1 through 1000.';
  }
  if (params.skip !== undefined && (!Number.isInteger(params.skip) || params.skip < 0)) {
    return 'skip must be a non-negative integer.';
  }
  if (params.skip !== undefined && params.skip_token !== undefined)
    return 'skip and skip_token cannot be used together.';
  if (params.subscriptions?.some((subscription) => !SUBSCRIPTION_ID_PATTERN.test(subscription))) {
    return 'every subscription must be a UUID subscription ID.';
  }
  if (params.subscriptions?.length === 0) return 'subscriptions must contain at least one subscription ID.';
}

export function buildResourceGraphArgs(params: Params): string[] {
  const args = ['graph', 'query', '--graph-query', params.query];
  if (params.subscriptions?.length) args.push('--subscriptions', ...params.subscriptions);
  if (params.first !== undefined) args.push('--first', String(params.first));
  if (params.skip !== undefined) args.push('--skip', String(params.skip));
  if (params.skip_token !== undefined) args.push('--skip-token', params.skip_token);
  if (params.output_projection !== undefined) args.push('--query', params.output_projection);
  if (params.allow_partial_scopes === true) args.push('--allow-partial-scopes');
  args.push('--output', 'json');
  return args;
}

export function createAzResourceGraphQueryTool(pi: PluginInterface, makeApi: (cwd: string) => AzExecApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    query: Type.String({ description: 'Resource Graph KQL; passed only to --graph-query' }),
    subscriptions: Type.Optional(Type.Array(Type.String({ description: 'Azure subscription UUID' }))),
    first: Type.Optional(Type.Number({ description: 'Maximum records, 1 through 1000' })),
    skip: Type.Optional(Type.Number({ description: 'Non-negative record offset; incompatible with skip_token' })),
    skip_token: Type.Optional(Type.String({ description: 'Continuation token; incompatible with skip' })),
    output_projection: Type.Optional(
      Type.String({ description: 'JMESPath output projection; passed only to --query' }),
    ),
    allow_partial_scopes: Type.Optional(Type.Boolean({ description: 'Allow results from accessible scopes' })),
  });

  return {
    name: 'az_resource_graph_query',
    label: 'Azure Resource Graph Query',
    description,
    parameters,
    async execute(
      _id: string,
      params: Params,
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: { cwd: string },
    ) {
      const validation = validateResourceGraphParams(params);
      if (validation) return invalid(validation);
      const api = makeApi(ctx.cwd);
      const options = { signal, env: RESOURCE_GRAPH_ENV };
      const extension = await api.exec(
        'az',
        ['extension', 'show', '--name', 'resource-graph', '--output', 'json'],
        options,
      );
      if (extension.exitCode !== 0) {
        return errorResult('Azure Resource Graph is not installed. Run /azure:setup to install it.', {
          tool: 'az_resource_graph_query',
          outcome: 'setup_required',
        });
      }
      let extensionInfo: { name: string; version: string };
      try {
        const parsed = parseAzJsonOutput<Record<string, unknown>>(extension.stdout);
        extensionInfo = { name: String(parsed.name ?? ''), version: String(parsed.version ?? '') };
        if (extensionInfo.name !== 'resource-graph' || !extensionInfo.version)
          throw new Error('invalid extension identity');
      } catch {
        return errorResult('The installed Resource Graph extension could not be identified. Run /azure:setup.', {
          tool: 'az_resource_graph_query',
          outcome: 'unsupported_extension',
        });
      }
      const help = await api.exec('az', ['graph', 'query', '--help'], options);
      const missingFlags = RESOURCE_GRAPH_REQUIRED_FLAGS.filter(
        (flag) => !`${help.stdout}\n${help.stderr}`.includes(flag),
      );
      if (help.exitCode !== 0 || missingFlags.length > 0) {
        return errorResult(
          'The installed Resource Graph extension lacks required query capabilities. Run /azure:setup.',
          {
            tool: 'az_resource_graph_query',
            outcome: 'unsupported_extension',
            extension: extensionInfo,
            missingFlags,
          },
        );
      }
      const result = await api.exec('az', buildResourceGraphArgs(params), options);
      if (result.exitCode !== 0) {
        const error = detectAzError(result.stderr || result.stdout, result.exitCode);
        const throttled = /throttl|too many requests|\b429\b/i.test(`${result.stderr}\n${result.stdout}`);
        const errorType = detectErrorType(error);
        return errorResult(
          throttled
            ? 'Azure Resource Graph throttled the request. Retry after the advised delay.'
            : 'Azure Resource Graph query failed.',
          {
            tool: 'az_resource_graph_query',
            outcome: throttled
              ? 'throttled'
              : errorType === 'auth_required' || errorType === 'session_expired'
                ? 'authentication_failure'
                : 'execution_failure',
            errorType,
            ...(throttled && retryAfter(result.stderr) !== undefined
              ? { retryAfterSeconds: retryAfter(result.stderr) }
              : {}),
          },
        );
      }
      try {
        const payload = parseAzJsonOutput<Record<string, unknown> | unknown[]>(result.stdout);
        const envelope = Array.isArray(payload) ? { data: payload } : payload;
        const data = Array.isArray(envelope.data) ? envelope.data : [];
        const partial = /partial scope|inaccessible scope|not authorized for all/i.test(result.stderr);
        const rawSkipToken = envelope.skip_token ?? envelope.skipToken;
        const skipToken = typeof rawSkipToken === 'string' ? rawSkipToken : undefined;
        const totalRecordsValue = envelope.total_records ?? envelope.totalRecords;
        const count = typeof envelope.count === 'number' ? envelope.count : data.length;
        const totalRecords = typeof totalRecordsValue === 'number' ? totalRecordsValue : count;
        const truncatedMarker = envelope.result_truncated ?? envelope.resultTruncated;
        return textResult(JSON.stringify(data), {
          tool: 'az_resource_graph_query',
          outcome: partial ? 'partial_scope' : 'success',
          data,
          count,
          totalRecords,
          truncated: isTruncated(truncatedMarker) || skipToken !== undefined || totalRecords > count,
          ...(skipToken ? { skipToken } : {}),
          ...(partial && inaccessibleScopeCount(result.stderr) !== undefined
            ? { inaccessibleScopeCount: inaccessibleScopeCount(result.stderr) }
            : {}),
          extension: extensionInfo,
        });
      } catch {
        return errorResult('Azure Resource Graph returned invalid JSON.', {
          tool: 'az_resource_graph_query',
          outcome: 'execution_failure',
        });
      }
    },
  };
}
