import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';

/** Domain data only; xcsh owns conversion, previews, layout and the active theme. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  return p.withPresentation(tool, {
    command: 'zoom-hybrid',
    scopeKeys: ['command', 'action', 'meeting_id', 'session'],
    collections: ['meetings', 'participants', 'artifacts'],
    labels: Object.fromEntries([
      ['id', 'Meeting ID'],
      ['name', 'Name'],
      ['state', 'State'],
      ['status', 'Status'],
      ['encrypted', 'Encrypted'],
      ['path', 'Artifact path'],
    ]),
  });
}
