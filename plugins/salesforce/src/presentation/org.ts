import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import type { Args, Options, Result, View } from './shared';
import { code, fields, record, texts } from './shared';

const identityFields = [
  'username',
  'id',
  'orgId',
  'instanceUrl',
  'connectedStatus',
  'alias',
  'isSandbox',
  'isDefaultUsername',
  'isDefault',
  'isDefaultDevHubUsername',
  'isScratch',
  'devHubId',
  'expirationDate',
  'apiVersion',
] as const;
export function safeIdentity(input: unknown): Args {
  const raw = record(input);
  return Object.fromEntries(
    identityFields
      .filter((key) => ['string', 'number', 'boolean'].includes(typeof raw[key]) || raw[key] === null)
      .map((key) => [key, raw[key]]),
  );
}
export function orgView(
  p: PresentationAPI,
  result: Result,
  options: Options,
  _args: Args,
  _operation = 'sf org display',
): View {
  const details = record(result.details);
  const org = safeIdentity(details.orgEvidence ?? (Array.isArray(details.orgs) ? details.orgs[0] : undefined));
  if (!Object.keys(org).length && result.content.length)
    return { summary: 'Org identity unavailable', sections: texts(result).map((text) => code(text, 'CLI output')) };
  const status = org.connectedStatus ?? 'Not returned';
  return {
    summary: String(status),
    warnings: [
      ...(!org.username || !org.instanceUrl
        ? ['Authenticated identity is not verified; username or instance was not returned.']
        : []),
      ...(typeof status === 'string' && !/^connected$/i.test(status) && status !== 'Not returned'
        ? [`Reported connection status: ${status}`]
        : []),
    ],
    sections: [
      fields({
        Alias: org.alias ?? 'Not returned',
        Username: org.username ?? 'Not returned',
        Instance: org.instanceUrl ?? 'Not returned',
        'Org ID': org.id ?? org.orgId ?? 'Not returned',
        Environment: typeof org.isSandbox === 'boolean' ? (org.isSandbox ? 'Sandbox' : 'Production') : 'Not returned',
        Default: org.isDefaultUsername ?? org.isDefault ?? 'Not returned',
      }),
      ...(options.expanded ? p.data(org, 'Metadata') : []),
    ],
  };
}
