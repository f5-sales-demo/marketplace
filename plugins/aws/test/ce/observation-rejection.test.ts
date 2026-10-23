import { afterEach, expect, spyOn, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Type } from '@sinclair/typebox';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { CeApiError } from '../../../platform/src/ce/runtime';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { PluginInterface } from '../../src/aws/types';
import { type AwsCeToolContext, saveAwsPlan } from '../../src/ce/artifacts';
import { canonicalSha256, fingerprintObservation } from '../../src/ce/canonical';
import { discoverAwsCompute } from '../../src/ce/discovery';
import { type AwsCeRevalidationDiagnostic, captureAwsRevalidationRejection } from '../../src/ce/observation-rejection';
import { compileAwsCePlan } from '../../src/ce/planner';
import type { AwsCeObservation } from '../../src/ce/types';
import { AWS_CE_MARKETPLACE_PRODUCT_ID } from '../../src/ce/types';
import { createAwsCeApplyTool } from '../../src/tools/aws-ce-apply';
import {
  discoveryFixtureCapabilities as capabilities,
  DiscoveryFixtureApi,
  discoveryFixtureFetch,
} from './discovery-fixture';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});

class CurrentApi extends DiscoveryFixtureApi {
  selectedLimit = 64;
  otherLimit = 64;
  ssmVersion = 12;
  async exec(command: string, args: string[]) {
    const operation = `${args[0]} ${args[1]}`;
    const region = args[args.indexOf('--region') + 1];
    let value: unknown;
    if (operation === 'ec2 describe-regions')
      value = {
        Regions: ['us-east-1', 'us-west-2'].map((name) => ({ RegionName: name, OptInStatus: 'opt-in-not-required' })),
      };
    else if (operation === 'service-quotas get-service-quota')
      value = { Quota: { Value: region === 'us-west-2' ? this.otherLimit : this.selectedLimit } };
    else if (operation === 'ssm get-parameter')
      value = { Parameter: { Value: 'ami-0123456789abcdef0', Version: this.ssmVersion } };
    else if (operation === 'ec2 describe-instance-type-offerings')
      value = {
        InstanceTypeOfferings: ['a', 'b', 'c'].map((suffix) => ({
          InstanceType: 'm6i.2xlarge',
          Location: `${region}${suffix}`,
        })),
      };
    else return super.exec(command, args);
    this.calls.push(args);
    return { stdout: JSON.stringify(value), stderr: '', exitCode: 0 };
  }
}

async function fixture(engine: 'native' | 'terraform' = 'native') {
  const api = new CurrentApi();
  const baseline = await discoverAwsCompute(
    {
      awsProfile: 'default',
      vpcMode: 'greenfield',
      accountId: '123456789012',
      partition: 'aws',
      deploymentName: 'revalidation-fixture',
      requiredEnis: 1,
      nodeCount: 1,
      instanceTypes: ['m6i.2xlarge'],
      brownfieldResourceIds: [],
      egressMode: 'elastic-ip',
      routingProfile: 'direct-eni',
      resourceRegion: 'us-east-1',
      f5Capabilities: capabilities,
    },
    api,
    discoveryFixtureFetch as typeof fetch,
  );
  const plan = compileAwsCePlan(
    {
      schemaVersion: 2,
      engine,
      awsProfile: 'default',
      operation: 'deploy',
      accountId: '123456789012',
      partition: 'aws',
      region: 'us-east-1',
      deploymentName: 'revalidation-fixture',
      siteName: 'revalidation-fixture',
      namespace: 'system',
      topology: { nodeCount: 1 },
      vpc: { mode: 'greenfield', cidr: '10.0.0.0/16' },
      interfaces: [
        {
          index: 0,
          role: 'slo',
          vrf: 'slo',
          guestDevice: 'ens5',
          mtu: 1500,
          subnets: [{ availabilityZone: 'us-east-1a', cidr: '10.0.0.0/24' }],
          addressing: { mode: 'dhcp' },
        },
      ],
      egress: { mode: 'elastic-ip' },
      routing: { profile: 'direct-eni', destinationCidrs: [], associations: [], propagations: [] },
      image: { productId: AWS_CE_MARKETPLACE_PRODUCT_ID, amiId: 'ami-0123456789abcdef0' },
      instance: { type: 'm6i.2xlarge', diskGiB: 100 },
      securityGroups: [{ name: 'ce', ingress: [], egress: [] }],
      routes: [],
      brownfield: { resourceIds: [], routeTableIds: [], transitGatewayRouteTableIds: [] },
    },
    baseline,
  );
  const directory = await mkdtemp(join(tmpdir(), 'aws-ce-revalidation-'));
  directories.push(directory);
  const owner = {
    deploymentId: plan.deploymentName,
    engine,
    provider: 'aws' as const,
    account: plan.accountId,
    region: plan.region,
  };
  const storage = await CeDeploymentStore.open(directory, owner);
  let confirms = 0;
  let terraformOpens = 0;
  const runtime = {
    resourceMutation: async () => {
      throw new Error('Unexpected resource mutation');
    },
    reconcileTerraformResources: async () => {},
    observeOwnedSite: async () => {
      throw new CeApiError('not-found', 404);
    },
  };
  const platform = {
    capabilities: async () => capabilities,
    runtime: async (selected: string) => {
      expect(selected).toBe(engine);
      return runtime;
    },
    storage: async (binding: unknown) => {
      expect(binding).toEqual(owner);
      return storage;
    },
  } as unknown as CePlatformService;
  const terraform = {
    open: async () => {
      terraformOpens++;
      throw new Error('Unexpected Terraform workspace');
    },
  };
  const pi = {
    typebox: { Type },
    events: {
      emit(channel: string, request: { resolve(value: unknown): void }) {
        if (channel === 'xcsh:ce-platform:v2:service') request.resolve(platform);
        else if (channel === 'xcsh:ce-terraform:v1:service') request.resolve(terraform);
        else throw new Error('Unexpected service dispatch');
      },
    },
  } as unknown as PluginInterface;
  const ctx: AwsCeToolContext = {
    cwd: directory,
    hasUI: true,
    ui: {
      confirm: async () => {
        confirms++;
        return false;
      },
    },
    sessionManager: {
      getSessionId: () => sessionId,
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      saveArtifact: async () => '1',
    },
  };
  const sessionId = randomUUID();
  await saveAwsPlan(ctx.sessionManager, plan, baseline);
  const execute = async () => {
    const fetched = spyOn(globalThis, 'fetch').mockImplementation(discoveryFixtureFetch as typeof fetch);
    try {
      return await createAwsCeApplyTool(pi, () => api).execute(
        'fixture',
        { planId: plan.planId, planSha256: plan.planSha256 },
        AbortSignal.timeout(10000),
        undefined,
        ctx,
      );
    } finally {
      fetched.mockRestore();
    }
  };
  return { api, baseline, plan, storage, execute, confirms: () => confirms, terraformOpens: () => terraformOpens };
}

for (const engine of ['native', 'terraform'] as const) {
  test(`${engine} public apply retains exact rejected observation privately and exposes only its diagnostic`, async () => {
    const f = await fixture(engine);
    if (engine === 'native') f.api.selectedLimit = 48;
    else f.api.ssmVersion = 13;
    const result = await f.execute();
    expect(result.isError).toBe(true);
    const diagnostic = (result.details as { revalidation?: AwsCeRevalidationDiagnostic }).revalidation;
    expect(diagnostic?.capture).toBe('saved');
    if (!diagnostic?.receiptReference) throw new Error('Private rejection receipt missing');
    expect(f.confirms()).toBe(0);
    expect(f.terraformOpens()).toBe(0);
    expect(f.api.calls.every((args) => !/^(create|run|delete|modify|attach|associate|allocate)/.test(args[1]))).toBe(
      true,
    );
    const record = (await f.storage.read(`${diagnostic.receiptReference}.json`)) as {
      kind: string;
      baseline: AwsCeObservation;
      current: AwsCeObservation;
      baselineObservationSha256: string;
      currentObservationSha256: string;
    };
    expect(record.kind).toBe('aws-ce-revalidation-rejection');
    expect(record.baselineObservationSha256).toBe(canonicalSha256(f.baseline));
    expect(record.currentObservationSha256).toBe(canonicalSha256(record.current));
    expect(diagnostic.receiptSha256).toBe(canonicalSha256(record));
    expect(diagnostic.currentFingerprint).toBe(fingerprintObservation(record.current, [], f.plan.region));
    expect(record.current).not.toEqual(record.baseline);
    expect(JSON.stringify(record)).toContain('123456789012');
    expect(JSON.stringify(result)).not.toContain('123456789012');
    expect(JSON.stringify(result)).not.toContain('arn:aws:');
    expect((await stat(join(f.storage.directory, `${diagnostic.receiptReference}.json`))).mode & 0o077).toBe(0);
    expect((await stat(f.storage.directory)).mode & 0o077).toBe(0);
  });
}

test('native public apply allows unrelated-region drift through revalidation and reaches the approval gate', async () => {
  const f = await fixture();
  f.api.otherLimit = 48;
  const result = await f.execute();
  expect(result.isError).toBe(true);
  expect(f.confirms()).toBe(1);
  expect((result.details as { revalidation?: unknown }).revalidation).toBeUndefined();
  expect(f.api.calls.every((args) => !/^(create|run|delete|modify|attach|associate|allocate)/.test(args[1]))).toBe(
    true,
  );
});

test('capture failures and foreign store owners retain rejection without leaking storage errors', async () => {
  const f = await fixture();
  let writes = 0;
  const failing = {
    owner: f.storage.owner,
    verify: async () => {},
    write: async () => {
      writes++;
      throw new Error('/private/secret-marker');
    },
  };
  const failed = await captureAwsRevalidationRejection(
    f.plan,
    f.baseline,
    f.baseline,
    f.plan.observationFingerprint,
    [],
    'native-fingerprint',
    failing,
  );
  expect(failed.diagnostic.capture).toBe('unavailable');
  expect(failed.diagnostic.receiptReference).toBeUndefined();
  expect(failed.message).not.toContain('secret-marker');
  expect(JSON.stringify(failed.diagnostic)).not.toContain('secret-marker');
  const foreign = { ...failing, owner: { ...f.storage.owner, engine: 'terraform' as const } };
  const rejected = await captureAwsRevalidationRejection(
    f.plan,
    f.baseline,
    f.baseline,
    f.plan.observationFingerprint,
    [],
    'native-fingerprint',
    foreign,
  );
  expect(rejected.diagnostic.capture).toBe('unavailable');
  expect(writes).toBe(1);
});

test('missing region evidence is retained as unknown and checkpoint provenance is not inferred from the original baseline', async () => {
  const f = await fixture();
  const current = { ...f.baseline, regions: [] };
  const error = await captureAwsRevalidationRejection(
    f.plan,
    f.baseline,
    current,
    'a'.repeat(64),
    [],
    'native-fingerprint',
    f.storage,
  );
  expect(error.diagnostic.currentFingerprint).toBeNull();
  expect(error.diagnostic.baselineMatchesExpected).toBe(false);
  expect(error.diagnostic.comparisonBaseline).toBe('original-planning-observation');
  expect(error.diagnostic.capture).toBe('saved');
});

test('public diagnostics do not reflect malformed fingerprint fields', async () => {
  const f = await fixture();
  const error = await captureAwsRevalidationRejection(
    f.plan,
    f.baseline,
    f.baseline,
    'secret-marker',
    [],
    'native-fingerprint',
    f.storage,
  );
  expect(error.diagnostic.expectedFingerprint).toBeNull();
  expect(JSON.stringify(error.diagnostic)).not.toContain('secret-marker');
});
