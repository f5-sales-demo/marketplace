import { expect, test } from 'bun:test';
import { type AwsComputeDiscoveryInput, discoverAwsCompute } from '../../src/ce/discovery';
import { DiscoveryFixtureApi, discoveryFixtureCapabilities, discoveryFixtureFetch } from './discovery-fixture';

const input: AwsComputeDiscoveryInput = {
  accountId: '123456789012',
  partition: 'aws',
  deploymentName: 'selected-region-fixture',
  requiredEnis: 2,
  nodeCount: 1,
  instanceTypes: ['m6i.2xlarge'],
  brownfieldResourceIds: [],
  egressMode: 'elastic-ip',
  routingProfile: 'direct-eni',
  resourceRegion: 'us-east-1',
  f5Capabilities: discoveryFixtureCapabilities,
};
const catalog = {
  Regions: [
    { RegionName: 'us-east-1', OptInStatus: 'opt-in-not-required' },
    { RegionName: 'us-west-2', OptInStatus: 'opted-in' },
  ],
};
function apiWithCatalog(value: unknown = catalog) {
  const fixture = new DiscoveryFixtureApi(),
    calls: string[][] = [];
  return {
    calls,
    exec: async (command: string, args: string[]) => {
      calls.push([...args]);
      if (args[0] === 'ec2' && args[1] === 'describe-regions')
        return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
      return fixture.exec(command, args);
    },
  };
}
const fetcher = discoveryFixtureFetch as typeof fetch;

test('selected qualification retains every selected-region observation and avoids other regional probes', async () => {
  const global = apiWithCatalog(),
    selected = apiWithCatalog();
  const all = await discoverAwsCompute(input, global, fetcher);
  const current = await discoverAwsCompute(
    { ...input, regionQualificationScope: 'resource-region' },
    selected,
    fetcher,
  );
  expect(all.regions.map((region) => region.name).sort()).toEqual(['us-east-1', 'us-west-2']);
  expect(global.calls.some((args) => args.includes('us-west-2'))).toBe(true);
  expect(current.regions).toEqual(all.regions.filter((region) => region.name === 'us-east-1'));
  expect(selected.calls.some((args) => args.includes('us-west-2'))).toBe(false);
  expect(current.regionalQualification).toEqual({
    scope: 'resource-region',
    selectedRegion: 'us-east-1',
    catalogRegionNames: ['us-east-1', 'us-west-2'],
  });
  expect(all.regionalQualification?.scope).toBe('all-regions');
  expect(current.identity).toEqual(all.identity);
  expect(current.agreement).toEqual(all.agreement);
  expect(current.research.sourceReceipts).toEqual(all.research.sourceReceipts);
  const operations = selected.calls.map((args) => args[1]);
  for (const required of [
    'get-caller-identity',
    'search-agreements',
    'describe-regions',
    'get-parameter',
    'describe-images',
    'describe-image-attribute',
    'describe-instance-types',
    'describe-instance-type-offerings',
    'list-service-quotas',
    'describe-instances',
    'describe-vpcs',
    'describe-internet-gateways',
    'describe-addresses',
  ])
    expect(operations).toContain(required);
});

test('invalid selected scope, absent region and wrong partition fail before cloud calls', async () => {
  for (const change of [
    { resourceRegion: undefined },
    { resourceRegion: 'not-a-region' },
    { resourceRegion: 'us-gov-west-1' },
    { regionQualificationScope: 'unsupported' },
  ]) {
    const api = apiWithCatalog();
    await expect(
      discoverAwsCompute(
        { ...input, regionQualificationScope: 'resource-region', ...change } as AwsComputeDiscoveryInput,
        api,
        fetcher,
      ),
    ).rejects.toThrow();
    expect(api.calls).toHaveLength(0);
  }
});

test('selected qualification rejects absent, duplicated, malformed and incomplete authoritative catalogs', async () => {
  for (const value of [
    {},
    { Regions: [] },
    { Regions: catalog.Regions.slice(1) },
    { Regions: [catalog.Regions[0], catalog.Regions[0]] },
    { Regions: [null] },
    { Regions: [{ RegionName: 'us-east-1' }] },
    { Regions: [{ RegionName: 'us-east-1', OptInStatus: 'unknown' }] },
    { ...catalog, NextToken: 'partial' },
  ]) {
    const api = apiWithCatalog(value);
    await expect(
      discoverAwsCompute({ ...input, regionQualificationScope: 'resource-region' }, api, fetcher),
    ).rejects.toThrow();
    expect(
      api.calls.some(
        (args) =>
          args.includes('--region') &&
          args[args.indexOf('--region') + 1] === 'us-east-1' &&
          args[0] !== 'marketplace-agreement',
      ),
    ).toBe(false);
  }
});

test('disabled selected region remains ineligible without probing another region', async () => {
  const api = apiWithCatalog({ Regions: [{ RegionName: 'us-east-1', OptInStatus: 'not-opted-in' }] });
  const current = await discoverAwsCompute({ ...input, regionQualificationScope: 'resource-region' }, api, fetcher);
  expect(current.regions).toHaveLength(1);
  expect(current.regions[0].enabled).toBe(false);
  expect(current.regions[0].eligible).toBe(false);
  expect(current.regions[0].reasons).toEqual(['region-disabled']);
});
