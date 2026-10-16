import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';

/** Domain data only; xcsh owns conversion, previews, layout and the active theme. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  return p.withPresentation(tool, {
    command: 'az',
    scopeKeys: ['subscription', 'resource_group', 'resource_type', 'query', 'timespan', 'max_results'],
    collections: ['subscriptions', 'resourceGroups', 'resources', 'vms', 'data', 'records', 'events'],
    labels: Object.fromEntries([
      ['id', 'Resource ID'],
      ['name', 'Name'],
      ['location', 'Location'],
      ['type', 'Resource type'],
      ['resourceGroup', 'Resource group'],
      ['state', 'State'],
      ['subscriptionId', 'Subscription ID'],
      ['tenantId', 'Tenant ID'],
    ]),
    scopeNote: 'Subscription and resource-group scope are limited to the returned data.',
  });
}
