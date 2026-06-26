/**
 * GitLab tool renderer — placeholder for TUI rendering.
 *
 * The full TUI renderer from xcsh core depends on @f5-sales-demo/pi-tui
 * (Theme, Component, CachedOutputBlock, etc.) which is not available as a
 * plugin peer dependency. This file preserves the rendering data shapes so
 * xcsh can wire up the TUI renderer when loading the plugin, and provides
 * a plain-text fallback for non-TUI contexts.
 */

import type { GlabIssue } from '../glab/types';

// Re-export the details type for renderer consumers
export interface GlabToolDetails {
  tool?: 'glab_setup' | 'glab_issue_list' | 'glab_issue_view' | 'glab_search';
  items?: GlabIssue[];
  issue?: GlabIssue;
  total?: number;
  project?: string;
  query?: string;
}

export type GlabRenderArgs = {
  action?: string;
  project?: string;
  issue?: number;
  query?: string;
  state?: string;
  labels?: string[];
  limit?: number;
  search?: string;
};

/**
 * Plain-text summary for non-TUI contexts.
 * When xcsh loads this plugin with TUI support, it can replace this
 * with the full themed renderer.
 */
export function renderPlainSummary(
  result: { content: Array<{ type: string; text?: string }>; details?: GlabToolDetails },
  args?: GlabRenderArgs,
): string {
  const details = result.details;
  const text = result.content?.find((c) => c.type === 'text')?.text ?? '';

  if (!details?.tool) return text;

  const parts: string[] = [];

  if (details.tool === 'glab_issue_list' || details.tool === 'glab_search') {
    const count = details.total ?? details.items?.length ?? 0;
    parts.push(`GitLab: ${count} issue${count !== 1 ? 's' : ''}`);
    if (details.project) parts.push(`(${details.project})`);
    if (details.query) parts.push(`search: "${details.query}"`);
  } else if (details.tool === 'glab_issue_view' && details.issue) {
    parts.push(`GitLab: #${details.issue.iid} ${details.issue.title}`);
  } else if (details.tool === 'glab_setup') {
    parts.push(`GitLab Setup: ${args?.action ?? 'complete'}`);
  }

  return parts.length > 0 ? `${parts.join(' ')}\n\n${text}` : text;
}
