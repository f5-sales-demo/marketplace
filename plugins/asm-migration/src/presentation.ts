import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';

/** Domain data only; xcsh owns conversion, previews, layout and the active theme. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  return p.withPresentation(tool, {
    command: 'asm-migration',
    scopeKeys: ['namespace', 'name', 'policy', 'input', 'plan', 'target'],
    collections: ['policies', 'findings', 'errors', 'warnings', 'resources'],
    labels: { name: 'Name', severity: 'Severity', message: 'Finding', status: 'Status', path: 'Source path' },
  });
}
