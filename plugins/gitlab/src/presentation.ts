import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';

/** Domain data only; xcsh owns conversion, previews, layout and the active theme. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  return p.withPresentation(tool, {
    command: 'glab',
    scopeKeys: ['project', 'state', 'search', 'limit', 'page', 'issue_id', 'iid'],
    collections: ['items', 'issues'],
    labels: Object.fromEntries([
      ['iid', 'Issue'],
      ['title', 'Title'],
      ['state', 'State'],
      ['web_url', 'URL'],
      ['updated_at', 'Updated'],
      ['author', 'Author'],
      ['labels', 'Labels'],
    ]),
    scopeNote: 'Search and list counts apply to returned records; server-wide completeness is not established.',
  });
}
