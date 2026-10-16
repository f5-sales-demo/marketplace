import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';

/** Domain data only; xcsh owns conversion, previews, layout and the active theme. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  return p.withPresentation(tool, {
    command: 'kvm-smsv2',
    scopeKeys: ['name', 'siteName', 'namespace', 'host', 'spec', 'receipt'],
    collections: ['resources', 'nodes', 'steps'],
    labels: { name: 'Name', state: 'State', phase: 'Phase', ready: 'Ready', owned: 'Owned', id: 'Resource ID' },
  });
}
