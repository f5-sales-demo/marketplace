import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';

/** Domain data only; xcsh owns conversion, previews, layout and the active theme. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  return p.withPresentation(tool, {
    command: 'xorgctl',
    scopeKeys: ['session', 'command', 'action'],
    collections: ['windows', 'nodes', 'displays'],
    labels: { id: 'Window ID', title: 'Title', pid: 'PID', name: 'Name', role: 'Role', state: 'State' },
    scopeNote: 'Results apply to the selected desktop session; unavailable sessions are not empty desktops.',
  });
}
