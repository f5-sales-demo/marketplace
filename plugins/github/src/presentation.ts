import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';

/** Domain data only; xcsh owns conversion, previews, layout and the active theme. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  return p.withPresentation(tool, {
    command: 'gh',
    scopeKeys: ['repo', 'repository', 'state', 'query', 'limit', 'page', 'number', 'workflow', 'runId', 'branch'],
    collections: ['items', 'issues', 'pullRequests', 'runs', 'checks'],
    labels: Object.fromEntries([
      ['number', 'Number'],
      ['title', 'Title'],
      ['state', 'State'],
      ['url', 'URL'],
      ['conclusion', 'Conclusion'],
      ['status', 'Status'],
      ['headRefName', 'Branch'],
      ['updatedAt', 'Updated'],
    ]),
  });
}
