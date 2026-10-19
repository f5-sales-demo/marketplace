import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import type { Args, Options, Result, View } from './shared';
import { code, evidence, fields, literal, record, texts } from './shared';

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
    return {
      summary: 'Org identity unavailable',
      sections: [
        ...texts(result).map((text) => code(text, 'CLI output')),
        ...(options.expanded
          ? [
              literal(
                {
                  ...details,
                  orgEvidence: org,
                  ...(Array.isArray(details.orgs) ? { orgs: details.orgs.map(safeIdentity) } : {}),
                },
                'Metadata',
              ),
            ]
          : []),
      ],
    };
  const available = (v: unknown) => v !== null && v !== undefined && v !== '';
  const status = org.connectedStatus;
  return {
    states:
      !available(org.username) || !available(org.instanceUrl)
        ? [{ kind: 'info', text: 'Identity unknown' }]
        : !available(status)
          ? [{ kind: 'info', text: 'Connection unknown' }]
          : [],
    sections: [
      fields(
        Object.fromEntries(
          [
            ['Connection', status],
            ['Alias', org.alias],
            ['Username', org.username],
            ['Instance', org.instanceUrl],
            [
              'Environment',
              typeof org.isSandbox === 'boolean' ? (org.isSandbox ? 'Sandbox' : 'Production') : undefined,
            ],
          ].filter(([, v]) => available(v)),
        ),
      ),
      ...(options.expanded
        ? [
            literal(org, 'Identity'),
            ...evidence(
              p,
              {
                ...result,
                details: {
                  ...details,
                  orgs: Array.isArray(details.orgs) ? details.orgs.map(safeIdentity) : details.orgs,
                  orgEvidence: org,
                },
              },
              _args,
            ),
          ]
        : []),
    ],
  };
}
