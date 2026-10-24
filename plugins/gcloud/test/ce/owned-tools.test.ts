import { expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { fingerprint } from '../../src/ce/discovery';
import type { PluginInterface } from '../../src/gcloud/types';
import { createGcpCeTools } from '../../src/tools/gcp-ce';
import { intent } from './fixtures';

const schema = { typebox: { Type } } as unknown as PluginInterface;

it('public deploy rejects wrong scope, engine and missing review before cloud access', async () => {
  let calls = 0;
  const tools = createGcpCeTools(
    schema,
    () => ({
      exec: async () => {
        calls++;
        throw new Error('must not execute');
      },
    }),
    undefined,
    async () => {
      calls++;
      throw new Error('must not open');
    },
  );
  const i = structuredClone(intent());
  i.routing.destinationCidrs = [];
  for (const parameters of [
    { project: i.project, region: i.region, operation: 'deploy' as const, intent: i },
    { project: i.project, region: i.region, operation: 'deploy' as const, intent: i, engine: 'terraform' as const },
    { project: i.project, region: i.region, operation: 'deploy' as const, intent: i, deploymentName: 'foreign' },
  ]) {
    const result = await tools
      .find((tool) => tool.name === 'gcp_ce_apply')
      ?.execute('id', parameters, undefined, null, { cwd: '/tmp' });
    expect(result?.isError).toBe(true);
    expect((result?.details as Record<string, unknown> | undefined)?.mutationAttempted).toBe(false);
  }
  expect(calls).toBe(0);
});

it('public Terraform tools preserve explicit engine and intent at the server-owned runtime gate', async () => {
  const i = structuredClone(intent());
  i.engine = 'terraform';
  i.routing.destinationCidrs = [];
  let gates = 0;
  let executions = 0;
  const tools = createGcpCeTools(
    schema,
    () => ({
      exec: async () => {
        executions++;
        throw new Error('must not execute');
      },
    }),
    undefined,
    async () => ({}) as CePlatformService,
    undefined,
    undefined,
    undefined,
    undefined,
    async (_platform, _api, supplied) => {
      gates++;
      expect(supplied).toEqual(i);
      throw new Error('qualified provider unavailable');
    },
  );
  for (const name of ['gcp_ce_plan', 'gcp_ce_apply']) {
    const tool = tools.find((tool) => tool.name === name);
    if (!tool) throw new Error('missing public Terraform tool');
    const result = await tool.execute(
      'id',
      {
        project: i.project,
        region: i.region,
        engine: 'terraform',
        operation: 'deploy',
        intent: i,
        ...(name === 'gcp_ce_apply' ? { approvedPlanHash: fingerprint('review') } : {}),
      },
      undefined,
      null,
      { cwd: '/tmp' },
    );
    expect(result.isError).toBe(true);
    expect((result.details as Record<string, unknown>).mutationAttempted).toBe(false);
  }
  expect(gates).toBe(2);
  expect(executions).toBe(0);
});

it('typed status refuses wrong persisted context before cloud or platform observations', async () => {
  const i = intent();
  let reads = 0;
  const platform = {
    storage: async () => ({ read: async () => ({ intent: i, platformContext: 'lab' }) }),
    gcpObservations: async () => {
      reads++;
      throw new Error('must not read');
    },
  } as unknown as CePlatformService;
  const tools = createGcpCeTools(
    schema,
    () => ({
      exec: async () => {
        reads++;
        throw new Error('must not run');
      },
    }),
    undefined,
    async () => platform,
  );
  const tool = tools.find((tool) => tool.name === 'gcp_ce_status');
  if (!tool) throw new Error('missing status');
  const result = await tool.execute(
    'id',
    { project: i.project, region: i.region, deploymentName: i.deploymentName, platformContext: 'another-context' },
    undefined,
    null,
    { cwd: '/tmp' },
  );
  expect(result.isError).toBe(true);
  expect((result.details as Record<string, unknown>).mutationAttempted).toBe(false);
  expect(reads).toBe(0);
});

it('typed status reports explicit unavailability when shared observation service is absent', async () => {
  const tools = createGcpCeTools(
    schema,
    () => ({
      exec: async () => {
        throw new Error('must not run');
      },
    }),
    undefined,
    async () => ({}) as CePlatformService,
  );
  const tool = tools.find((tool) => tool.name === 'gcp_ce_diagnose');
  if (!tool) throw new Error('missing diagnose');
  const result = await tool.execute(
    'id',
    { project: 'test-project', region: 'northamerica-northeast1', deploymentName: 'ce-test', platformContext: 'lab' },
    undefined,
    null,
    { cwd: '/tmp' },
  );
  expect(result.isError).toBe(true);
  expect((result.details as Record<string, unknown>).availability).toBe('unavailable');
});

it('typed status joins owned cloud and shared platform layers without exporting raw evidence', async () => {
  const i = intent();
  i.engine = 'terraform';
  const node = i.sites[0].nodes[0],
    site = i.sites[0].name;
  const prefix = `https://www.googleapis.com/compute/v1/projects/${i.project}`;
  const journal = { intent: i, intentFingerprint: fingerprint(i), platformContext: i.platformContext };
  const resource = {
    id: '123',
    kind: 'instance',
    project: i.project,
    deploymentName: i.deploymentName,
    engine: i.engine,
    siteName: site,
    nodeName: node.name,
    selfLink: `${prefix}/zones/${node.zone}/instances/${node.name}`,
  };
  const cloud = {
    id: '123',
    name: node.name,
    zone: `${prefix}/zones/${node.zone}`,
    status: 'RUNNING',
    metadata: 'PRIVATE',
    networkInterfaces: node.interfaces.map((nic) => ({
      name: `nic${nic.index}`,
      network: `${prefix}/global/networks/${nic.network}`,
      subnetwork: `${prefix}/regions/${i.region}/subnetworks/${nic.subnet}`,
      networkIP: `10.${nic.index + 1}.0.2`,
    })),
  };
  const configuration = {
    metadata: { name: site, namespace: 'system' },
    spec: {
      gcp: {
        not_managed: {
          node_list: [
            {
              hostname: node.name,
              interface_list: node.interfaces.map((nic) => ({
                ethernet_interface: { device: `ens${nic.index + 4}`, mac: `02:00:00:00:00:0${nic.index + 1}` },
                is_primary: nic.index === 0,
                network_option: { [nic.index === 0 ? 'site_local_network' : 'site_local_inside_network']: {} },
              })),
            },
          ],
        },
      },
    },
  };
  const registrations = {
    items: [
      {
        get_spec: {
          infra: {
            provider: 'GOOGLE',
            instance_id: '123',
            hostname: node.name,
            availability_zone: node.zone,
            hw_info: {
              network: node.interfaces.map((nic) => ({
                name: `ens${nic.index + 4}`,
                mac_address: `02:00:00:00:00:0${nic.index + 1}`,
                ip_address: [`10.${nic.index + 1}.0.2/24`],
              })),
            },
          },
          passport: { cluster_name: site },
          token: 'PRIVATE',
        },
        object: { status: { current_state: 'ONLINE' } },
      },
    ],
  };
  const platform = {
    storage: async () => ({
      read: async (name: string) =>
        name === 'gcp-resources.json'
          ? {
              schemaVersion: 1,
              project: i.project,
              deploymentName: i.deploymentName,
              engine: i.engine,
              resources: [resource],
            }
          : journal,
    }),
    gcpObservations: async () => ({
      configuration: async () => configuration,
      registrations: async () => registrations,
      health: async () => ({ hostname: node.name, state: 'PROVISIONED', secret: 'PRIVATE' }),
    }),
  } as unknown as CePlatformService;
  const tool = createGcpCeTools(
    schema,
    () => ({ exec: async () => ({ stdout: JSON.stringify(cloud), stderr: '', exitCode: 0 }) }),
    undefined,
    async () => platform,
  ).find((tool) => tool.name === 'gcp_ce_status');
  if (!tool) throw new Error('missing status');
  const result = await tool.execute(
    'id',
    {
      project: i.project,
      region: i.region,
      deploymentName: i.deploymentName,
      platformContext: i.platformContext,
      engine: 'terraform',
    },
    undefined,
    null,
    { cwd: '/tmp' },
  );
  expect(result.isError).toBeUndefined();
  expect((result.details as Record<string, unknown>).availability).toBe('read-only');
  const evidence = (result.details as Record<string, unknown>).evidence as {
    nodes: Array<{ registration: string; physicalInterfaceIdentity: string; platformHealth: string }>;
    routing: string;
  };
  expect(evidence.nodes[0]).toMatchObject({
    registration: 'online',
    physicalInterfaceIdentity: 'observed',
    platformHealth: 'healthy',
  });
  expect(evidence.routing).toBe('unknown');
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
});

it('public status and diagnose expose versioned HA gaps without projecting service bodies', async () => {
  const i = intent();
  i.engine = 'terraform';
  const original = i.sites[0].nodes[0];
  i.sites[0].nodes = ['a', 'b', 'c'].map((suffix) => ({
    ...original,
    name: `node-${suffix}`,
    zone: `northamerica-northeast1-${suffix}`,
  }));
  const journal = { intent: i, intentFingerprint: fingerprint(i), platformContext: i.platformContext };
  const resources = i.sites[0].nodes.map((node, n) => ({
    id: String(n + 1),
    kind: 'instance',
    project: i.project,
    deploymentName: i.deploymentName,
    engine: i.engine,
    siteName: i.sites[0].name,
    nodeName: node.name,
    selfLink: `https://www.googleapis.com/compute/v1/projects/${i.project}/zones/${node.zone}/instances/${node.name}`,
  }));
  let collections = 0;
  const platform = {
    storage: async () => ({
      read: async (name: string) =>
        name === 'gcp-resources.json'
          ? { schemaVersion: 1, project: i.project, deploymentName: i.deploymentName, engine: i.engine, resources }
          : journal,
    }),
    gcpObservations: async () => ({
      configuration: async () => ({}),
      registrations: async () => ({}),
      health: async () => ({}),
      haHealth: async () => {
        collections++;
        throw new Error('PRIVATE-TOKEN');
      },
    }),
  } as unknown as CePlatformService;
  const tools = createGcpCeTools(
    schema,
    () => ({ exec: async () => ({ stdout: '{}', stderr: '', exitCode: 0 }) }),
    undefined,
    async () => platform,
  );
  for (const name of ['gcp_ce_status', 'gcp_ce_diagnose']) {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error('missing handler');
    const result = await tool.execute(
      'id',
      {
        project: i.project,
        region: i.region,
        engine: 'terraform',
        deploymentName: i.deploymentName,
        platformContext: i.platformContext,
      },
      undefined,
      null,
      { cwd: '/tmp' },
    );
    expect(result.isError).toBeUndefined();
    expect((result.details as Record<string, unknown>).mutationAttempted).toBe(false);
    const evidence = (result.details as Record<string, unknown>).evidence as {
      ha: { schemaVersion: number; status: string; sites: Array<{ nodes: unknown[] }> };
    };
    expect(evidence.ha.schemaVersion).toBe(1);
    expect(evidence.ha.status).toBe('unknown');
    expect(evidence.ha.sites[0].nodes).toHaveLength(3);
    expect(JSON.stringify(result)).not.toContain('PRIVATE-TOKEN');
  }
  expect(collections).toBe(2);
});

it('all declared lifecycle operations dispatch to scoped refusals before any cloud read', async () => {
  const { GCP_CE_OPERATIONS } = await import('../../src/ce/types');
  let reads = 0;
  const tools = createGcpCeTools(schema, () => ({
    exec: async () => {
      reads++;
      throw new Error('unexpected');
    },
  }));
  for (const operation of GCP_CE_OPERATIONS.filter((op) => !['deploy', 'teardown'].includes(op))) {
    for (const name of ['gcp_ce_plan', 'gcp_ce_apply']) {
      const tool = tools.find((item) => item.name === name);
      if (!tool) throw new Error('Lifecycle tool missing');
      const response = await tool.execute(
        'id',
        {
          project: 'test-project',
          region: 'northamerica-northeast1',
          engine: 'terraform',
          operation,
        },
        undefined,
        null,
        { cwd: '/private/tmp' },
      );
      expect(response.isError).toBe(true);
      expect(response.details).toMatchObject({
        schemaVersion: 2,
        operation,
        engine: 'terraform',
        mutationAttempted: false,
        reason: 'gcp_operation_not_qualified',
      });
      expect(response.details.required).toContain('reviewed owning-engine plan');
    }
  }
  expect(reads).toBe(0);
});
it('explicit Terraform reports its optional installation prerequisite without opening storage', async () => {
  const i = structuredClone(intent());
  i.engine = 'terraform';
  i.routing.destinationCidrs = [];
  let opened = 0;
  const tools = createGcpCeTools(
    schema,
    () => ({
      exec: async () => {
        throw new Error('unexpected');
      },
    }),
    undefined,
    async () =>
      ({
        storage: async () => {
          opened++;
          throw new Error('unexpected');
        },
      }) as CePlatformService,
  );
  const planTool = tools.find((tool) => tool.name === 'gcp_ce_plan');
  if (!planTool) throw new Error('Plan tool missing');
  const response = await planTool.execute(
    'id',
    {
      project: i.project,
      region: i.region,
      engine: 'terraform',
      operation: 'deploy',
      intent: i,
    },
    undefined,
    null,
    { cwd: '/private/tmp' },
  );
  expect(response.details).toMatchObject({
    reason: 'terraform_setup_required',
    engine: 'terraform',
    mutationAttempted: false,
  });
  expect(response.details.required).toContain('xcsh plugin install terraform');
  expect(opened).toBe(0);
});
