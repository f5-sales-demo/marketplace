import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';

/** Domain data only; xcsh owns conversion, previews, layout and the active theme. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  return p.withPresentation(tool, {
    command: 'gcloud',
    scopeKeys: ['project', 'filter', 'zone', 'region', 'limit'],
    collections: ['projects', 'instances', 'buckets'],
    labels: Object.fromEntries([
      ['projectId', 'Project ID'],
      ['projectNumber', 'Project number'],
      ['name', 'Name'],
      ['zone', 'Zone'],
      ['status', 'Status'],
      ['machineType', 'Machine type'],
      ['location', 'Location'],
    ]),
  });
}
