import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';

/** Domain data only; xcsh owns conversion, previews, layout and the active theme. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  return p.withPresentation(tool, {
    command: 'f5xc',
    scopeKeys: ['namespace', 'siteName', 'site_name', 'operation'],
    collections: ['sites', 'resources', 'capabilities'],
    labels: Object.fromEntries([
      ['name', 'Site'],
      ['namespace', 'Namespace'],
      ['state', 'State'],
      ['capability', 'Capability'],
      ['reason', 'Reason'],
      ['ready', 'Ready'],
    ]),
  });
}
