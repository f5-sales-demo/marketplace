import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SfExecApi } from '../src/sf/exec';

// This test process must never read a user's private acceptance configuration.
process.env.SF_PIPELINE_CONFIG = join(tmpdir(), `sf-synthetic-${randomUUID()}`, 'config.json');
export const syntheticIdentity = {
  id: '00D000000000001',
  userId: '005000000000001',
  username: 'reader@example.com',
  instanceUrl: 'https://org.example.test',
};
export const standardFields = [
  'Id',
  'Name',
  'Amount',
  'OwnerId',
  'AccountId',
  'IsClosed',
  'IsWon',
  'CloseDate',
  'StageName',
  'ForecastCategoryName',
  'NextStep',
  'CurrencyIsoCode',
];
export const standardCapabilities = {
  opportunityFields: standardFields,
  lineItemFields: ['Id', 'OpportunityId', 'TotalPrice', 'Product2Id'],
  queryable: { Opportunity: true, OpportunityTeamMember: true, OpportunityLineItem: true },
};
export const syntheticPeriods = [
  { Type: 'Quarter', StartDate: '2026-11-01', EndDate: '2027-01-31' },
  { Type: 'Year', StartDate: '2026-02-01', EndDate: '2027-01-31' },
];
export const response = (result: unknown) => ({
  stdout: JSON.stringify({ status: 0, result }),
  stderr: '',
  exitCode: 0,
});
export const syntheticFields = (names: string[]) =>
  names.map((name) => ({
    name,
    label: name,
    type:
      name === 'Id'
        ? 'id'
        : name.endsWith('Id')
          ? 'reference'
          : /Amount|Price/.test(name)
            ? 'currency'
            : /^Is|Flag/.test(name)
              ? 'boolean'
              : /Date/.test(name)
                ? 'date'
                : 'string',
    filterable: true,
    groupable: true,
    custom: name.endsWith('__c'),
    ...(name.endsWith('Id') && name !== 'Id'
      ? { relationshipName: name.slice(0, -2), referenceTo: [name === 'OwnerId' ? 'User' : name.slice(0, -2)] }
      : {}),
  }));
export function syntheticApi(
  calls: string[][] = [],
  records: (query: string) => Record<string, unknown>[] = () => [],
  identity = syntheticIdentity,
): SfExecApi {
  return {
    exec: async (_command, args) => {
      calls.push([...args]);
      if (args[0] === 'org') return response(identity);
      if (args[0] === 'sobject') {
        if (args[1] === 'list') return response(['Opportunity', 'OpportunityLineItem', 'Product2']);
        const name = args[args.indexOf('--sobject') + 1];
        return response({
          name,
          queryable: true,
          fields: syntheticFields(
            name === 'Opportunity'
              ? standardFields
              : name === 'OpportunityLineItem'
                ? standardCapabilities.lineItemFields
                : ['Id', 'Name', 'Family', 'ProductCode'],
          ),
          childRelationships: [],
        });
      }
      const query = args[args.indexOf('--query') + 1] ?? '';
      const data = query.includes('FROM User')
        ? [{ Id: identity.userId, UserType: 'Standard' }]
        : query.includes('FROM Period')
          ? syntheticPeriods
          : records(query);
      return response({ records: data, done: true, totalSize: data.length });
    },
  };
}
export const syntheticOpportunity = (id = '006000000000001', amount = 100, extras: Record<string, unknown> = {}) => ({
  Id: id,
  Name: 'Synthetic opportunity',
  Amount: amount,
  IsClosed: false,
  IsWon: false,
  OwnerId: syntheticIdentity.userId,
  Account: { Name: 'Synthetic account' },
  CloseDate: '2026-12-01',
  CurrencyIsoCode: 'USD',
  ...extras,
});
