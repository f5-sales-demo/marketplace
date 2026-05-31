import sfQueryDescription from '../prompts/sf-query.md' with { type: 'text' };
import { execSfJson } from '../sf/exec';
import { deriveQueryLabel, formatQueryResults } from '../sf/formatters';
import type { SfQueryResult } from '../sf/types';
import { ORG_ALIAS_PATTERN } from '../sf/types';
import { detectErrorType, errorResult, makeExecApi, textResult } from './shared';

export function createSfQueryTool(pi: any) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    query: Type.String({ description: 'SOQL query to execute' }),
    description: Type.Optional(
      Type.String({
        description:
          "Short human-readable label for this query shown in the output header (2-4 words, e.g. 'forecast breakdown', 'in-quarter pipeline', 'closed-won deals')",
      }),
    ),
    target_org: Type.Optional(Type.String({ description: 'Org alias or username to query against' })),
    use_tooling_api: Type.Optional(
      Type.Boolean({ description: 'Use Tooling API to query metadata objects like ApexTrigger' }),
    ),
    all_rows: Type.Optional(Type.Boolean({ description: 'Include deleted records in results' })),
  });

  return {
    name: 'sf_query',
    label: 'Salesforce Query',
    description: sfQueryDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: {
        query: string;
        description?: string;
        target_org?: string;
        use_tooling_api?: boolean;
        all_rows?: boolean;
      },
      signal: any,
      _onUpdate: any,
      ctx: { cwd: string },
    ) {
      const api = makeExecApi(ctx.cwd);
      const queryDescription = params.description ?? deriveQueryLabel(params.query);
      const base = { tool: 'sf_query' as const, action: 'query', queryDescription };

      if (params.target_org && !ORG_ALIAS_PATTERN.test(params.target_org)) {
        return errorResult(
          `Error: invalid org alias "${params.target_org}". Only alphanumeric characters, dots, underscores, hyphens, and @ are allowed.`,
          base,
        );
      }

      const args = ['data', 'query', '--query', params.query];
      if (params.target_org) args.push('--target-org', params.target_org);
      if (params.use_tooling_api) args.push('--use-tooling-api');
      if (params.all_rows) args.push('--all-rows');

      try {
        const result = await execSfJson(api, args, signal, params.query);
        const queryData = result.result as SfQueryResult<Record<string, unknown>>;
        const queryResult: SfQueryResult = {
          totalSize: queryData.totalSize ?? 0,
          done: queryData.done ?? true,
          records: queryData.records ?? [],
        };

        let output = formatQueryResults(queryResult);
        if (!queryResult.done) {
          output +=
            '\n\n**Warning**: Results are incomplete. The query returned more records than the API limit. Use `sf data export bulk` for the full dataset.';
        }
        return textResult(output, { ...base, queryResult });
      } catch (err) {
        const errorType = detectErrorType(err);
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(message, { ...base, errorType });
      }
    },
  };
}
