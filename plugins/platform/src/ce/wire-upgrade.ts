type Json = Record<string, unknown>;
export interface SiteUpgradeIntent {
  siteName: string;
  kind: 'software' | 'os';
  version: string;
}
export function buildSiteUpgradeRequest(input: SiteUpgradeIntent, validate: (body: unknown) => void) {
  if (
    !input ||
    Object.keys(input).some((key) => !['siteName', 'kind', 'version'].includes(key)) ||
    typeof input.siteName !== 'string' ||
    !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(input.siteName) ||
    !['software', 'os'].includes(input.kind) ||
    typeof input.version !== 'string' ||
    !(input.kind === 'software' ? /^crt-\d{8}-\d{4}$/ : /^\d+\.\d{4}\.\d+$/).test(input.version)
  )
    throw new Error('An upgrade requires an exact site, operation and version');
  const body: Json = { namespace: 'system', name: input.siteName, version: input.version, force: false };
  validate(body);
  return {
    method: 'POST' as const,
    path: `/api/config/namespaces/system/sites/${input.siteName}/upgrade_${input.kind === 'software' ? 'sw' : 'os'}`,
    body,
  };
}
