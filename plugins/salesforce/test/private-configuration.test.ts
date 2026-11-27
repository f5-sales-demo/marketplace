import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { prepareSalesforceConfiguration, readConfiguration, resolveIdentity } from '../src/configuration';
import { sanitize } from '../src/sf/sanitize';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
const org = {
  id: '00D000000000001',
  username: 'reader@example.com',
  instanceUrl: 'https://org.example.test',
  accessToken: 'private-test-secret',
};
const fields = [
  { name: 'Id', type: 'id' },
  { name: 'Amount', type: 'currency' },
  { name: 'TotalPrice', type: 'currency' },
  { name: 'OwnerId', type: 'reference', referenceTo: ['User'], filterable: true },
  { name: 'Product2Id', relationshipName: 'Product2', type: 'reference', referenceTo: ['Product2'] },
  { name: 'IsClosed', type: 'boolean', filterable: true },
  { name: 'Segment__c', type: 'string', filterable: true },
  { name: 'Name', type: 'string' },
];
const api = {
  exec: async (_: string, args: string[]) => ({
    stdout: JSON.stringify({
      status: 0,
      result:
        args[0] === 'org'
          ? org
          : args[1] === 'describe'
            ? { name: args[args.indexOf('--sobject') + 1], queryable: true, fields }
            : args[1] === 'list'
              ? ['Opportunity', 'OpportunityLineItem', 'Product2']
              : {
                  records:
                    args.includes('--query') && args[args.indexOf('--query') + 1].includes('FROM User')
                      ? [{ Id: '005000000000001' }]
                      : [],
                  done: true,
                  totalSize: 0,
                },
    }),
    stderr: '',
    exitCode: 0,
  }),
};
const defaults = {
  opportunityAmount: 'Opportunity.Amount',
  lineItemAmount: 'OpportunityLineItem.TotalPrice',
  territory: '',
  renewal: '',
  productGroups: '[]',
};
async function path() {
  const dir = await mkdtemp(join(tmpdir(), 'sf-private-'));
  dirs.push(dir);
  return join(dir, 'private', 'config.json');
}

test('discovery is read-only, setup writes private metadata and never credentials or records', async () => {
  const file = await path();
  const plan = await prepareSalesforceConfiguration(api, undefined, undefined, file);
  await expect(readFile(file)).rejects.toThrow();
  await plan.apply(defaults);
  const text = await readFile(file, 'utf8');
  expect(text).not.toContain('private-test-secret');
  expect(text).not.toContain('records');
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  expect((await stat(join(file, '..'))).mode & 0o777).toBe(0o700);
  expect((await readConfiguration(file)).orgs[org.id].mappings.opportunityAmount).toBe('Opportunity.Amount');
});

test('refresh preserves confirmed groups and rejects concurrent external edits', async () => {
  const file = await path();
  const plan = await prepareSalesforceConfiguration(api, undefined, undefined, file);
  const groups = [
    { name: 'Services', quotaEligible: false, rules: [{ field: 'Product2.Name', match: 'prefix', value: 'Service' }] },
  ];
  await plan.apply({ ...defaults, productGroups: JSON.stringify(groups) });
  const refreshed = await prepareSalesforceConfiguration(api, undefined, undefined, file);
  expect(refreshed.questions.find((q) => q.id === 'productGroups')?.defaultValue).toBe(JSON.stringify(groups));
  await writeFile(file, `${await readFile(file, 'utf8')}\n`);
  await expect(refreshed.apply(defaults)).rejects.toThrow('changed');
});

test('unknown and wrong-type mappings never replace configuration', async () => {
  const file = await path();
  const plan = await prepareSalesforceConfiguration(api, undefined, undefined, file);
  await expect(plan.apply({ ...defaults, opportunityAmount: 'Opportunity.Missing__c' })).rejects.toThrow();
  await expect(plan.apply({ ...defaults, opportunityAmount: 'Opportunity.Name' })).rejects.toThrow();
  await expect(readFile(file)).rejects.toThrow();
});

test('related mapping schema is discovered on review and remains usable after cache refresh', async () => {
  const file = await path();
  const calls: string[][] = [];
  const relatedApi = {
    exec: async (command: string, args: string[]) => {
      calls.push(args);
      if (args[1] === 'describe') {
        const name = args[args.indexOf('--sobject') + 1];
        return {
          stdout: JSON.stringify({
            status: 0,
            result: {
              name,
              queryable: true,
              fields:
                name === 'Opportunity'
                  ? [
                      ...fields,
                      {
                        name: 'BudgetId__c',
                        relationshipName: 'Budget__r',
                        type: 'reference',
                        referenceTo: ['Budget__c'],
                      },
                    ]
                  : name === 'Budget__c'
                    ? [{ name: 'Amount__c', type: 'currency' }]
                    : fields,
            },
          }),
          stderr: '',
          exitCode: 0,
        };
      }
      return api.exec(command, args);
    },
  };
  const plan = await prepareSalesforceConfiguration(relatedApi, undefined, undefined, file);
  await plan.apply({ ...defaults, opportunityAmount: 'Opportunity.Budget__r.Amount__c' });
  expect(calls.some((args) => args.includes('Budget__c'))).toBe(true);
  expect((await readConfiguration(file)).orgs[org.id].discovery.objects.Budget__c.fields[0].name).toBe('Amount__c');
  const { loadOrgConfiguration, pipelineCapabilities } = await import('../src/configuration');
  const config = await loadOrgConfiguration(relatedApi, await resolveIdentity(relatedApi), undefined, file);
  expect(pipelineCapabilities(config).resolvedFieldPaths).toContain('Opportunity.Budget__r.Amount__c');
});

test('real filesystem write failure preserves the previous file and removes the transaction lock', async () => {
  const file = await path();
  await (await prepareSalesforceConfiguration(api, undefined, undefined, file)).apply(defaults);
  const parent = join(file, '..');
  const longFile = join(parent, 'c'.repeat(240));
  const baseline = await readFile(file, 'utf8');
  await writeFile(longFile, baseline, { mode: 0o600 });
  const plan = await prepareSalesforceConfiguration(api, undefined, undefined, longFile);
  await expect(plan.apply(defaults)).rejects.toThrow('ENAMETOOLONG');
  expect(await readFile(longFile, 'utf8')).toBe(baseline);
  expect((await readdir(parent)).sort()).toEqual([basename(longFile), 'config.json'].sort());
});

test('an existing transaction lock prevents replacement without deleting another editor lock', async () => {
  const file = await path();
  await (await prepareSalesforceConfiguration(api, undefined, undefined, file)).apply(defaults);
  const baseline = await readFile(file, 'utf8');
  await writeFile(`${file}.lock`, 'other editor', { mode: 0o600 });
  const plan = await prepareSalesforceConfiguration(api, undefined, undefined, file);
  await expect(plan.apply(defaults)).rejects.toThrow('being edited');
  expect(await readFile(file, 'utf8')).toBe(baseline);
  expect(await readFile(`${file}.lock`, 'utf8')).toBe('other editor');
});

test('identity resolution pins the verified username and rejects missing user identity', async () => {
  expect(await resolveIdentity(api)).toMatchObject({
    orgId: org.id,
    userId: '005000000000001',
    username: org.username,
  });
  await expect(
    resolveIdentity({
      exec: async (_, args) => ({
        stdout: JSON.stringify({ status: 0, result: args[0] === 'org' ? org : { records: [], done: true } }),
        stderr: '',
        exitCode: 0,
      }),
    }),
  ).rejects.toThrow();
});

test('metadata caches separate orgs, users and changed private mappings without writing during reads', async () => {
  const file = await path();
  await (await prepareSalesforceConfiguration(api, undefined, undefined, file)).apply(defaults);
  const { clearConfigurationCache, loadOrgConfiguration } = await import('../src/configuration');
  clearConfigurationCache();
  const identity = await resolveIdentity(api);
  let describes = 0;
  const countedApi = {
    exec: async (command: string, args: string[]) => {
      if (args[1] === 'describe') describes++;
      return api.exec(command, args);
    },
  };
  const baseline = await readFile(file, 'utf8');
  const first = await loadOrgConfiguration(countedApi, identity, undefined, file);
  const firstCount = describes;
  expect(await loadOrgConfiguration(countedApi, identity, undefined, file)).toBe(first);
  expect(describes).toBe(firstCount);
  await loadOrgConfiguration(countedApi, { ...identity, userId: '005000000000002' }, undefined, file);
  expect(describes).toBeGreaterThan(firstCount);
  const other = await loadOrgConfiguration(countedApi, { ...identity, orgId: '00D000000000002' }, undefined, file);
  expect(other.discovery.identity.orgId).toBe('00D000000000002');
  expect(await readFile(file, 'utf8')).toBe(baseline);
  const changed = await readConfiguration(file);
  changed.orgs[org.id].mappings.lineItemAmount = undefined;
  await writeFile(file, JSON.stringify(changed), { mode: 0o600 });
  const refreshed = await loadOrgConfiguration(countedApi, identity, undefined, file);
  expect(refreshed).not.toBe(first);
  expect(refreshed.mappings.lineItemAmount).toBeUndefined();
});

test.each([false, true])(
  'lost optional line-item schema keeps opportunity reports available (object queryable: %s)',
  async (queryable) => {
    const file = await path();
    await (await prepareSalesforceConfiguration(api, undefined, undefined, file)).apply(defaults);
    const baseline = await readFile(file, 'utf8');
    const { clearConfigurationCache, loadOrgConfiguration } = await import('../src/configuration');
    clearConfigurationCache();
    const restrictedApi = {
      exec: async (command: string, args: string[]) => {
        if (args[1] === 'describe' && args.includes('OpportunityLineItem'))
          return {
            stdout: JSON.stringify({ status: 0, result: { name: 'OpportunityLineItem', queryable, fields: [] } }),
            stderr: '',
            exitCode: 0,
          };
        return api.exec(command, args);
      },
    };
    const config = await loadOrgConfiguration(restrictedApi, await resolveIdentity(restrictedApi), undefined, file);
    expect(config.mappings.opportunityAmount).toBe('Opportunity.Amount');
    expect(config.mappings.lineItemAmount).toBeUndefined();
    expect(config.discovery.unavailable.join(' ')).toContain('Product breakdown');
    expect(await readFile(file, 'utf8')).toBe(baseline);
  },
);

test('lost product-rule access preserves monetary totals with unknown classification and quota', async () => {
  const file = await path();
  const { syntheticApi, syntheticOpportunity } = await import('./synthetic');
  const { loadOrgConfiguration, pipelineCapabilities } = await import('../src/configuration');
  const { generatePipelineReport } = await import('../src/pipeline-report/generator');
  const setupApi = syntheticApi();
  const groups = [
    { name: 'Services', quotaEligible: true, rules: [{ field: 'Product2.Family', match: 'exact', value: 'Services' }] },
  ];
  await (await prepareSalesforceConfiguration(setupApi, undefined, undefined, file)).apply({
    ...defaults,
    productGroups: JSON.stringify(groups),
  });
  const baseline = await readFile(file, 'utf8');
  const restrictedApi = {
    exec: async (command: string, args: string[]) => {
      if (args[1] === 'describe' && args.includes('Product2'))
        return {
          stdout: JSON.stringify({ status: 0, result: { name: 'Product2', queryable: false, fields: [] } }),
          stderr: '',
          exitCode: 0,
        };
      return setupApi.exec(command, args);
    },
  };
  const config = await loadOrgConfiguration(restrictedApi, await resolveIdentity(restrictedApi), undefined, file);
  const queries: string[] = [];
  const data = await generatePipelineReport(
    {
      userIds: ['005000000000001'],
      mappings: config.mappings,
      capabilities: pipelineCapabilities(config),
      unavailable: config.discovery.unavailable,
    },
    async (query) => {
      queries.push(query);
      return query.includes('FROM OpportunityLineItem')
        ? [{ Id: '00k000000000001', OpportunityId: '006000000000001', TotalPrice: 50 }]
        : query.includes('WHERE OwnerId')
          ? [syntheticOpportunity()]
          : [];
    },
  );
  expect(data.netNew.total).toBe(100);
  expect(data.productBreakdown?.total).toBe(50);
  expect(data.productBreakdown?.quotaTotal).toBeUndefined();
  expect(data.unavailable?.join(' ')).toContain('Product classification');
  expect(queries.join(' ')).not.toContain('Product2.Family');
  expect(await readFile(file, 'utf8')).toBe(baseline);
});

test('alias reassignment pins each invocation to fresh identity and discards mid-command changes', async () => {
  const { createPinnedExecApi } = await import('../src/configuration');
  let current = org;
  let changeDuringQuery = false;
  const executed: string[][] = [];
  const aliasApi = {
    exec: async (command: string, args: string[]) => {
      if (args[0] === 'org') return { stdout: JSON.stringify({ status: 0, result: current }), stderr: '', exitCode: 0 };
      if (args.includes('--query') && !args[args.indexOf('--query') + 1].includes('FROM User')) {
        executed.push(args);
        if (changeDuringQuery) current = org;
      }
      return api.exec(command, args);
    },
  };
  const pinned = createPinnedExecApi(aliasApi);
  const args = ['data', 'query', '--query', 'SELECT Id FROM Opportunity', '--target-org', 'selected'];
  await pinned.exec('sf', args);
  current = { ...org, id: '00D000000000002', username: 'other@example.com' };
  await pinned.exec('sf', args);
  expect(executed.map((argv) => argv[argv.indexOf('--target-org') + 1])).toEqual([org.username, 'other@example.com']);
  changeDuringQuery = true;
  await expect(pinned.exec('sf', args)).rejects.toThrow('changed during tool');
});

test('sanitization removes nested credentials, URLs, headers and raw JSON before presentation', () => {
  const secret = 'private-test-secret';
  expect(sanitize(`CLI banner\n{"result":{"accessToken":"${secret}"}}`)).not.toContain(secret);
  expect(
    JSON.stringify(
      sanitize({
        nested: { accessToken: secret },
        text: `Authorization: Bearer ${secret}`,
        url: `https://org.example.test/path?refresh_token=${secret}`,
      }),
    ),
  ).not.toContain(secret);
  expect(sanitize(JSON.stringify({ result: { sfdxAuthUrl: `force://id:${secret}@org.example.test` } }))).not.toContain(
    secret,
  );
  expect(sanitize(`│ Access Token │ ${secret} │\nAuthorization: Basic ${secret}\nCookie: sid=${secret}`)).not.toContain(
    secret,
  );
});
