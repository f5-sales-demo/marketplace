import { expect, test } from 'bun:test';
import { discoverAwsCompute } from '../../src/ce/discovery';
import { DiscoveryFixtureApi, discoveryFixtureCapabilities, discoveryFixtureFetch } from './discovery-fixture';

const allocation = 'eipalloc-12345678';
const association = 'eipassoc-12345678';
const eni = 'eni-12345678';
const ownerSha = 'a'.repeat(64);
const tags = [
  { Key: 'xcsh-managed-by', Value: 'aws-ce' },
  { Key: 'xcsh-execution-engine', Value: 'native' },
  { Key: 'xcsh-deployment-id', Value: 'fixture' },
  { Key: 'xcsh-plan-sha256', Value: ownerSha },
  { Key: 'xcsh-node-index', Value: '1' },
];
class EipApi extends DiscoveryFixtureApi {
  mode = 'good';
  associationId = association;
  override async exec(command: string, args: string[]) {
    if (args[1] === 'describe-network-interfaces')
      return {
        stdout: JSON.stringify({
          NetworkInterfaces: [
            { NetworkInterfaceId: eni, OwnerId: '123456789012', Tags: this.mode === 'foreign-network' ? [] : tags },
          ],
        }),
        stderr: '',
        exitCode: 0,
      };
    if (args[1] === 'describe-addresses') {
      this.calls.push(args);
      const alias = args.includes(`Name=association-id,Values=${this.associationId}`);
      if (alias && this.mode === 'denied')
        return {
          stdout: '',
          stderr: 'An error occurred (UnauthorizedOperation) when calling DescribeAddresses',
          exitCode: 255,
        };
      const address = {
        AllocationId: alias && this.mode === 'foreign-parent' ? 'eipalloc-ffffffff' : allocation,
        Domain: 'vpc',
        Tags: alias && this.mode === 'foreign-owner' ? [] : tags,
        ...(this.mode === 'unassociated'
          ? {}
          : {
              AssociationId: this.associationId,
              NetworkInterfaceId: this.mode === 'missing-network' ? 'eni-ffffffff' : eni,
            }),
      };
      return {
        stdout: JSON.stringify(
          alias && this.mode === 'missing'
            ? { Addresses: [] }
            : alias && this.mode === 'malformed'
              ? {}
              : { Addresses: alias && this.mode === 'duplicate' ? [address, address] : [address] },
        ),
        stderr: '',
        exitCode: 0,
      };
    }
    return super.exec(command, args);
  }
}
async function discover(api: EipApi) {
  return discoverAwsCompute(
    {
      accountId: '123456789012',
      partition: 'aws',
      deploymentName: 'fixture',
      requiredEnis: 2,
      nodeCount: 1,
      brownfieldResourceIds: [],
      observedOwnedResourceIds: [allocation, eni],
      ownedPlanSha256s: [ownerSha],
      resourceRegion: 'us-east-1',
      f5Capabilities: discoveryFixtureCapabilities,
    },
    api,
    discoveryFixtureFetch as typeof fetch,
  );
}
test('public discovery independently binds current association to owned allocation and ENI', async () => {
  for (const id of [association, 'eipassoc-0123456789abcdef0']) {
    const api = new EipApi();
    api.associationId = id;
    const observation = await discover(api);
    expect(observation.resources.find((r) => r.id === id)).toMatchObject({ owned: true, exists: true });
    expect(api.calls.some((a) => a.includes(`Name=association-id,Values=${id}`))).toBe(true);
  }
});
test('an unassociated owned allocation does not invent an association', async () => {
  const api = new EipApi();
  api.mode = 'unassociated';
  expect((await discover(api)).resources.map((r) => r.id)).toEqual([allocation, eni]);
});
for (const mode of [
  'foreign-network',
  'missing-network',
  'foreign-parent',
  'foreign-owner',
  'missing',
  'malformed',
  'duplicate',
  'denied',
])
  test(`incomplete association ownership refuses ${mode}`, async () => {
    const api = new EipApi();
    api.mode = mode;
    await expect(discover(api)).rejects.toThrow();
  });
