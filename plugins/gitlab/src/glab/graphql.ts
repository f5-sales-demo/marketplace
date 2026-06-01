import type { GlabExecApi } from './exec';
import { execGlab } from './exec';
import type { GraphQLIssueNode, GraphQLSearchResponse } from './types';

export function buildSearchQuery(includeState: boolean): string {
  const stateVar = includeState ? ', $state: IssuableState' : '';
  const stateArg = includeState ? ', state: $state' : '';
  return `
query SearchIssues($projectPath: ID!, $search: String!, $first: Int!${stateVar}) {
  project(fullPath: $projectPath) {
    issues(search: $search, first: $first${stateArg}) {
      nodes {
        iid
        title
        state
        labels { nodes { title } }
        assignees { nodes { username } }
        updatedAt
        notes(first: 20) {
          nodes {
            body
            author { username }
            createdAt
          }
        }
      }
    }
  }
}`.trim();
}

export async function executeGraphQL(
  pi: GlabExecApi,
  projectPath: string,
  searchText: string,
  limit: number,
  signal?: AbortSignal,
  state?: string,
): Promise<GraphQLIssueNode[]> {
  const includeState = !!state && state !== 'all';
  const query = buildSearchQuery(includeState);
  const vars: Record<string, unknown> = { projectPath, search: searchText, first: limit };
  if (includeState) vars.state = state === 'closed' ? 'closed' : 'opened';
  const variables = JSON.stringify(vars);

  const result = await execGlab(pi, ['api', 'graphql', '-f', `query=${query}`, '-f', `variables=${variables}`], signal);

  const response = JSON.parse(result.stdout) as GraphQLSearchResponse;

  if (response.errors && response.errors.length > 0) {
    throw new Error(response.errors.map((e) => e.message).join('; '));
  }

  return response.data?.project?.issues?.nodes ?? [];
}
