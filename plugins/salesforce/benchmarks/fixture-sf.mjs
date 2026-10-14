const args = process.argv.slice(2);
const query = args[args.indexOf('--query') + 1] ?? '';
if (args.includes('xcsh-style-intentionally-missing-org')) {
  console.log(
    JSON.stringify({
      status: 1,
      name: 'NamedOrgNotFoundError',
      message:
        'No authorization information found for xcsh-style-intentionally-missing-org. Select an authenticated target_org or review xcsh plugin setup salesforce.',
    }),
  );
  process.exit(1);
}

const records = Array.from({ length: 12 }, (_, index) => ({
  attributes: { type: 'Opportunity' },
  Name: `Synthetic Northern Assurance / F5 XC / ${index}`,
  Account: { Name: 'Synthetic Northern Assurance' },
  Amount: index === 0 ? 0 : 123456.78 + index,
  CurrencyIsoCode: index % 2 ? 'USD' : 'CAD',
  StageName: 'Technical validation',
  CloseDate: '2027-03-31',
  CreatedDate: '2026-08-14',
  LastModifiedDate: '2026-10-14',
  Owner: { Name: 'Synthetic owner' },
  IsClosed: false,
  IsWon: false,
  NextStep: index === 0 ? null : `Confirm product scope | 北方\nLine two ${index}`,
  Id: `006000000000${String(index).padStart(3, '0')}`,
  Product_Segmentation__c: 'XC Platform-Based',
}));

const schema = {
  name: 'Opportunity',
  fields: [
    { name: 'Name', label: 'Name', type: 'string', custom: false, filterable: true, groupable: true },
    { name: 'Amount', label: 'Amount', type: 'string', custom: false, filterable: true, groupable: true },
    {
      name: 'CurrencyIsoCode',
      label: 'CurrencyIsoCode',
      type: 'string',
      custom: false,
      filterable: true,
      groupable: true,
    },
    { name: 'StageName', label: 'StageName', type: 'string', custom: false, filterable: true, groupable: true },
    { name: 'CloseDate', label: 'CloseDate', type: 'string', custom: false, filterable: true, groupable: true },
    { name: 'CreatedDate', label: 'CreatedDate', type: 'string', custom: false, filterable: true, groupable: true },
    {
      name: 'LastModifiedDate',
      label: 'LastModifiedDate',
      type: 'string',
      custom: false,
      filterable: true,
      groupable: true,
    },
    { name: 'IsClosed', label: 'IsClosed', type: 'string', custom: false, filterable: true, groupable: true },
    { name: 'IsWon', label: 'IsWon', type: 'string', custom: false, filterable: true, groupable: true },
    { name: 'NextStep', label: 'NextStep', type: 'string', custom: false, filterable: true, groupable: true },
    { name: 'Id', label: 'Id', type: 'string', custom: false, filterable: true, groupable: true },
    {
      name: 'Product_Segmentation__c',
      label: 'Product_Segmentation__c',
      type: 'string',
      custom: true,
      filterable: true,
      groupable: true,
    },
  ],
  childRelationships: [
    { childSObject: 'OpportunityLineItem', relationshipName: 'OpportunityLineItems', field: 'OpportunityId' },
  ],
};
let result;
if (args.includes('--version')) {
  console.log('sf synthetic acceptance CLI');
  process.exit(0);
}
if (args.includes('--help')) {
  console.log('Synthetic Salesforce CLI help: sf data query --query SOQL');
  process.exit(0);
}
if (args[0] === 'sobject') {
  const name = args[args.indexOf('--sobject') + 1];
  result =
    name === 'Account'
      ? {
          name: 'Account',
          fields: ['Id', 'Name', 'Website', 'BillingCountry'].map((name) => ({
            name,
            label: name,
            type: 'string',
            custom: false,
            filterable: true,
            groupable: true,
          })),
          childRelationships: [{ childSObject: 'Opportunity', relationshipName: 'Opportunities', field: 'AccountId' }],
        }
      : {
          ...schema,
          name,
          fields: [
            ...schema.fields,
            {
              name: 'AccountId',
              label: 'Account',
              type: 'reference',
              custom: false,
              filterable: true,
              groupable: true,
              referenceTo: ['Account'],
            },
          ],
        };
} else if (args[0] === 'org')
  result = {
    username: 'synthetic@example.invalid',
    id: '00D000000000001',
    instanceUrl: 'https://synthetic.example.invalid',
    connectedStatus: 'Connected',
    alias: 'synthetic',
    accessToken: 'SYNTHETIC_SECRET_SENTINEL',
  };
else if (query.includes('DefinitelyMissingDemoField__c')) {
  console.log(
    JSON.stringify({
      status: 1,
      name: 'INVALID_FIELD',
      message: 'No such column DefinitelyMissingDemoField__c on Opportunity',
    }),
  );
  process.exit(1);
} else if (query.includes('FROM User'))
  result = { records: [{ Id: '005000000000001', UserType: 'Standard' }], totalSize: 1, done: true };
else if (query.includes('FROM Period'))
  result = {
    records: [
      { Type: 'Quarter', StartDate: '2026-08-01', EndDate: '2026-10-31' },
      { Type: 'Year', StartDate: '2025-11-01', EndDate: '2026-10-31' },
    ],
    done: true,
    totalSize: 1,
  };
else if (query.includes('COUNT('))
  result = { records: [{ attributes: { type: 'AggregateResult' }, total: 0 }], totalSize: 1, done: true };
else if (query.includes('FROM Account'))
  result = {
    records: query.includes('ambiguous')
      ? [
          { Id: '001000000000001', Name: 'Synthetic Northern Assurance Canada' },
          { Id: '001000000000002', Name: 'Synthetic Northern Assurance US' },
        ]
      : [{ Id: '001000000000001', Name: 'Synthetic Northern Assurance' }],
    totalSize: query.includes('ambiguous') ? 2 : 1,
    done: true,
  };
else if (query.includes('SUM(')) result = { records: [{ total: 0 }], totalSize: 1, done: true };
else if (query.includes('FROM OpportunityLineItem') || query.includes('IsWon = true') || query.includes('Renewal'))
  result = { records: [], totalSize: 0, done: true };
else
  result = {
    records: query.includes('Id = null') || query.includes('Synthetic Empty') ? [] : records,
    totalSize: query.includes('Id = null') || query.includes('Synthetic Empty') ? 0 : records.length,
    done: !query.includes('partial'),
  };
console.log(JSON.stringify({ status: 0, result }));
