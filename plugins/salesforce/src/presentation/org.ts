import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import type { Args, Options, Result, View } from './shared';
import { code, context, fields, hint, record, texts } from './shared';

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
  args: Args,
  operation = 'sf org display',
): View {
  const details = record(result.details);
  const org = safeIdentity(details.orgEvidence ?? (Array.isArray(details.orgs) ? details.orgs[0] : undefined));
  if (!Object.keys(org).length && result.content.length)
    return { summary: 'Org identity unavailable', sections: texts(result).map((text) => code(text, 'CLI output')) };
  const status = org.connectedStatus ?? 'Status not returned';
  return {
    summary: `Salesforce org · ${String(status)}`,
    warnings: [
      ...(!org.username || !org.instanceUrl
        ? ['Authenticated identity is not verified; username or instance was not returned.']
        : []),
      ...(typeof status === 'string' && !/^connected$/i.test(status) && status !== 'Status not returned'
        ? [`Reported connection status: ${status}`]
        : []),
    ],
    sections: [
      ...context(operation, args),
      fields(
        {
          Alias: org.alias ?? 'Not returned',
          Username: org.username ?? 'Not returned',
          Instance: org.instanceUrl ?? 'Not returned',
          'Org ID': org.id ?? org.orgId ?? 'Not returned',
          Environment:
            typeof org.isSandbox === 'boolean'
              ? org.isSandbox
                ? 'Sandbox'
                : 'Production'
              : 'Environment not returned',
          Default: org.isDefaultUsername ?? org.isDefault ?? 'Default not returned',
        },
        'Org identity',
      ),
      ...(options.expanded
        ? p.data(org, 'Complete whitelisted identity')
        : [hint('Expand for all reported identity fields')]),
    ],
  };
}
