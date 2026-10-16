import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';

/** Domain data only; xcsh owns conversion, previews, layout and the active theme. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  return p.withPresentation(tool, {
    command: 'aws',
    scopeKeys: ['profile', 'region', 'instanceIds', 'filters'],
    collections: ['instances', 'buckets', 'objects'],
    labels: Object.fromEntries([
      ['account', 'Account'],
      ['arn', 'ARN'],
      ['userId', 'User ID'],
      ['instanceId', 'Instance ID'],
      ['name', 'Name'],
      ['state', 'State'],
      ['instanceType', 'Instance type'],
      ['region', 'Region'],
      ['publicIpAddress', 'Public IP'],
      ['privateIpAddress', 'Private IP'],
    ]),
    scopeNote: 'Account and region coverage are limited to the selected CLI context.',
  });
}
