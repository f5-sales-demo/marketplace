import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { AWS_CE_PROVIDER_LOCK_SHA256 } from '../../src/ce/execution-contract';
import {
  dispatchAwsNativeStaticTgwRoutes,
  reconcileAwsNativeStaticTgwRoutes,
} from '../../src/ce/static-tgw-power-controller';
import {
  reviseAwsTerraformStaticServiceRoutes,
  validateAwsTerraformStaticServiceReceipt,
} from '../../src/ce/terraform-static-power';
import {
  dispatchAwsTerraformStaticTgwRoutes,
  reconcileAwsTerraformStaticTgwRoutes,
} from '../../src/ce/terraform-static-tgw-power-controller';
import { buildAwsWholeSitePowerPlan } from '../../src/ce/whole-site-power';
import { collectAwsPowerStaticTgwRoutes } from '../../src/ce/whole-site-power-tgw';
import { powerIdentityFixture } from './whole-site-power-fixtures';

function fixture(engine: 'native' | 'terraform' = 'native') {
  const f = powerIdentityFixture(engine);
  const { planId: _id, planSha256: _sha, ...body } = f.base;
  const routing = {
    ...body.intent.routing,
    profile: 'tgw-static' as const,
    transitGatewayId: 'tgw-12345678',
    transitGatewayRouteTableId: 'tgw-rtb-12345678',
    destinationCidrs: ['10.200.0.0/16'],
    associations: ['tgw-rtb-12345678'],
    propagations: [],
    staticAzRoutes: [
      {
        node: 1,
        availabilityZone: body.intent.interfaces[1].subnets[0].availabilityZone,
        forwardCidrs: ['10.200.0.0/16'],
        returnCidrs: ['10.210.0.0/16'],
      },
    ],
  };
  body.intent = {
    ...body.intent,
    routing,
    routes: [],
    brownfield: {
      ...body.intent.brownfield,
      resourceIds: ['tgw-12345678'],
      transitGatewayRouteTableIds: ['tgw-rtb-12345678'],
    },
  };
  const sha = canonicalSha256(body);
  const base = { ...body, planSha256: sha, planId: `aws-ce-${sha.slice(0, 24)}` };
  const values = {
    ...f.resolved,
    __VPC_ID__: 'vpc-12345678',
    __TGW_TRANSPORT_ATTACHMENT__: 'tgw-attach-12345678',
    __STATIC_ROUTE_TABLE_1__: 'rtb-12345678',
  };
  const tags = Object.entries({
    'xcsh-managed-by': 'aws-ce',
    'xcsh-deployment-id': base.deploymentName,
    'xcsh-execution-engine': engine,
    'xcsh-plan-sha256': sha,
  }).map(([Key, Value]) => ({ Key, Value }));
  let foreignOwner = false;
  let wrongAssociation = false;
  let propagation = false;
  let duplicate = false;
  let unavailable = false;
  let state = 'active';
  let absent = false;
  let foreign = false;
  let partial = false;
  let missingReturn = false;
  let overlap: string | undefined;
  const searches: string[] = [];
  const api = {
    exec: async (_cmd: string, args: string[]) => {
      const op = args[1];
      let data: unknown;
      if (args[0] === 'sts') data = { Account: base.accountId };
      else if (op === 'describe-transit-gateway-vpc-attachments')
        data = {
          TransitGatewayVpcAttachments: [
            {
              TransitGatewayAttachmentId: values.__TGW_TRANSPORT_ATTACHMENT__,
              TransitGatewayId: routing.transitGatewayId,
              VpcId: values.__VPC_ID__,
              VpcOwnerId: base.accountId,
              State: 'available',
              Options: { ApplianceModeSupport: 'enable' },
              Tags: foreignOwner ? [] : tags,
              SubnetIds: ['subnet-22222222'],
            },
          ],
        };
      else if (op === 'describe-transit-gateway-route-tables')
        data = {
          TransitGatewayRouteTables: [
            {
              TransitGatewayRouteTableId: routing.transitGatewayRouteTableId,
              TransitGatewayId: routing.transitGatewayId,
              State: 'available',
            },
          ],
        };
      else if (op === 'describe-route-tables')
        data = {
          RouteTables: [
            {
              RouteTableId: values.__STATIC_ROUTE_TABLE_1__,
              VpcId: values.__VPC_ID__,
              OwnerId: base.accountId,
              Tags: [...tags, { Key: 'xcsh-node-index', Value: '1' }],
              Associations: [{ SubnetId: 'subnet-22222222', AssociationState: { State: 'associated' } }],
              Routes: [
                {
                  DestinationCidrBlock: '10.200.0.0/16',
                  NetworkInterfaceId: values.__ENI_1_1__,
                  State: 'active',
                  Origin: 'CreateRoute',
                },
                ...(missingReturn
                  ? []
                  : [
                      {
                        DestinationCidrBlock: '10.210.0.0/16',
                        TransitGatewayId: routing.transitGatewayId,
                        State: 'active',
                        Origin: 'CreateRoute',
                      },
                    ]),
              ],
            },
          ],
        };
      else if (op === 'describe-network-interfaces')
        data = {
          NetworkInterfaces: [
            {
              NetworkInterfaceId: values.__ENI_1_1__,
              OwnerId: base.accountId,
              SubnetId: 'subnet-22222222',
              VpcId: values.__VPC_ID__,
              Attachment: { InstanceId: values.__INSTANCE_1__, DeviceIndex: 1 },
            },
          ],
        };
      else if (op === 'get-transit-gateway-route-table-associations')
        data = {
          Associations: [
            {
              TransitGatewayAttachmentId: values.__TGW_TRANSPORT_ATTACHMENT__,
              State: wrongAssociation ? 'disassociated' : 'associated',
            },
          ],
        };
      else if (op === 'get-transit-gateway-route-table-propagations')
        data = {
          TransitGatewayRouteTablePropagations: propagation
            ? [{ TransitGatewayAttachmentId: values.__TGW_TRANSPORT_ATTACHMENT__, State: 'enabled' }]
            : [],
        };
      else {
        const filter = args[args.indexOf('--filters') + 1];
        searches.push(filter);
        data = {
          AdditionalRoutesAvailable: partial,
          Routes: absent
            ? overlap && !filter.includes('exact-match')
              ? [
                  {
                    DestinationCidrBlock: overlap,
                    State: 'active',
                    Type: 'static',
                    TransitGatewayAttachments: [{ TransitGatewayAttachmentId: values.__TGW_TRANSPORT_ATTACHMENT__ }],
                  },
                ]
              : []
            : [
                {
                  DestinationCidrBlock: '10.200.0.0/16',
                  State: state,
                  Type: 'static',
                  TransitGatewayAttachments: [
                    {
                      TransitGatewayAttachmentId: foreign ? 'tgw-attach-ffffffff' : values.__TGW_TRANSPORT_ATTACHMENT__,
                    },
                  ],
                },
              ],
        };
      }
      if (duplicate && op === 'search-transit-gateway-routes') {
        const value = data as { Routes: unknown[] };
        value.Routes.push(...value.Routes);
      }
      return { exitCode: unavailable ? 1 : 0, stderr: '', stdout: JSON.stringify(data) };
    },
  };
  return {
    base,
    values,
    api,
    foreignOwner: () => {
      foreignOwner = true;
    },
    wrongAssociation: () => {
      wrongAssociation = true;
    },
    propagation: () => {
      propagation = true;
    },
    duplicate: () => {
      duplicate = true;
    },
    unavailable: () => {
      unavailable = true;
    },
    active: () => {
      absent = false;
      state = 'active';
    },
    absent: () => {
      absent = true;
    },
    blackhole: () => {
      state = 'blackhole';
    },
    foreign: () => {
      foreign = true;
    },
    partial: () => {
      partial = true;
    },
    searches,
    overlap: (prefix: string) => {
      absent = true;
      overlap = prefix;
    },
    missingReturn: () => {
      missingReturn = true;
    },
  };
}
test('static TGW withdrawal retains transport and forward/return routes', async () => {
  const f = fixture();
  const up = await collectAwsPowerStaticTgwRoutes(f.base, f.values, f.api);
  expect(up.status).toBe('active');
  expect(up.traffic).toBe('unknown');
  f.absent();
  const down = await collectAwsPowerStaticTgwRoutes(f.base, f.values, f.api);
  expect(down.status).toBe('withdrawn');
  expect(down.servicesSha256).toBe(up.servicesSha256);
});
for (const mode of [
  'foreign',
  'partial',
  'missingReturn',
  'foreignOwner',
  'wrongAssociation',
  'propagation',
  'duplicate',
  'unavailable',
] as const)
  test(`static TGW ${mode} rejects`, async () => {
    const f = fixture();
    f[mode]();
    await expect(collectAwsPowerStaticTgwRoutes(f.base, f.values, f.api)).rejects.toThrow();
  });
test('static TGW blackhole cannot qualify withdrawal', async () => {
  const f = fixture();
  f.blackhole();
  expect((await collectAwsPowerStaticTgwRoutes(f.base, f.values, f.api)).status).toBe('pending');
});

for (const prefix of ['10.200.1.0/24', '10.200.0.0/15', '0.0.0.0/0'])
  test(`static TGW retained overlapping ${prefix} cannot qualify withdrawal`, async () => {
    const f = fixture();
    f.overlap(prefix);
    expect((await collectAwsPowerStaticTgwRoutes(f.base, f.values, f.api)).status).toBe('pending');
  });
test('static TGW withdrawal requires all three complete route searches', async () => {
  const f = fixture();
  f.absent();
  expect((await collectAwsPowerStaticTgwRoutes(f.base, f.values, f.api)).status).toBe('withdrawn');
  expect(f.searches).toEqual(
    ['exact-match', 'subnet-of-match', 'supernet-of-match'].map(
      (mode) => `Name=route-search.${mode},Values=10.200.0.0/16`,
    ),
  );
});
for (const prefix of ['10.201.0.0/16', '10.200.1.1/24', 'invalid'])
  test(`static TGW malformed or unrelated search result ${prefix} rejects`, async () => {
    const f = fixture();
    f.overlap(prefix);
    await expect(collectAwsPowerStaticTgwRoutes(f.base, f.values, f.api)).rejects.toThrow();
  });

for (const mode of ['changed', 'partial-subnet', 'duplicate-supernet'] as const)
  test(`static TGW ${mode} search evidence rejects`, async () => {
    const f = fixture(),
      original = f.api.exec;
    f.absent();
    const api = {
      exec: async (command: string, args: string[]) => {
        const result = await original(command, args);
        if (args[1] !== 'search-transit-gateway-routes') return result;
        const filter = args[args.indexOf('--filters') + 1],
          data = JSON.parse(result.stdout);
        if (mode === 'partial-subnet' && filter.includes('subnet-of-match')) data.AdditionalRoutesAvailable = true;
        if (mode !== 'partial-subnet') {
          const route = {
            DestinationCidrBlock: '10.200.0.0/16',
            State: mode === 'changed' && filter.includes('supernet-of-match') ? 'blackhole' : 'active',
            Type: 'static',
            TransitGatewayAttachments: [{ TransitGatewayAttachmentId: f.values.__TGW_TRANSPORT_ATTACHMENT__ }],
          };
          data.Routes =
            mode === 'duplicate-supernet' && filter.includes('supernet-of-match') ? [route, route] : [route];
        }
        return { ...result, stdout: JSON.stringify(data) };
      },
    };
    await expect(collectAwsPowerStaticTgwRoutes(f.base, f.values, api)).rejects.toThrow();
  });

async function terraformRevisionFixture() {
  const f = fixture('terraform');
  const observed = await collectAwsPowerStaticTgwRoutes(f.base, f.values, f.api);
  const original = JSON.stringify({
    terraform: {
      required_version: '= 1.16.5',
      required_providers: { aws: { source: 'hashicorp/aws', version: '= 6.63.0' } },
    },
    provider: { aws: { region: f.base.region, allowed_account_ids: [f.base.accountId] } },
    resource: {
      aws_ec2_transit_gateway_route: {
        static_0: {
          destination_cidr_block: '10.200.0.0/16',
          transit_gateway_attachment_id: `\${aws_ec2_transit_gateway_vpc_attachment.transport.id}`,
          transit_gateway_route_table_id: 'tgw-rtb-12345678',
        },
      },
      aws_ec2_transit_gateway_vpc_attachment: { transport: { keep: 'transport' } },
      aws_route: {
        static_forward_1_0: { keep: 'forward' },
        static_return_1_0: { keep: 'return' },
        internet: { keep: 'SLO' },
      },
    },
  });
  return { ...f, observed, original };
}
test('Terraform static service revision withdraws only service routes and restores exact originals', async () => {
  const f = await terraformRevisionFixture();
  const revision = reviseAwsTerraformStaticServiceRoutes(f.base, f.observed.services, f.original, 'withdraw');
  const after = JSON.parse(revision.configuration);
  expect(after.resource.aws_ec2_transit_gateway_route).toBeUndefined();
  expect(after.resource.aws_route).toEqual(JSON.parse(f.original).resource.aws_route);
  expect(after.resource.aws_ec2_transit_gateway_vpc_attachment).toEqual(
    JSON.parse(f.original).resource.aws_ec2_transit_gateway_vpc_attachment,
  );
  const restored = reviseAwsTerraformStaticServiceRoutes(
    f.base,
    f.observed.services,
    revision.configuration,
    'restore',
    revision,
  );
  expect(JSON.parse(restored.configuration)).toEqual(JSON.parse(f.original));
});
for (const mode of ['foreign-attachment', 'extra-route', 'provider-drift', 'missing-retained'] as const)
  test(`Terraform static revision ${mode} rejects`, async () => {
    const f = await terraformRevisionFixture();
    const config = JSON.parse(f.original);
    if (mode === 'foreign-attachment')
      config.resource.aws_ec2_transit_gateway_route.static_0.transit_gateway_attachment_id = 'tgw-attach-ffffffff';
    if (mode === 'extra-route')
      config.resource.aws_ec2_transit_gateway_route.foreign = {
        ...config.resource.aws_ec2_transit_gateway_route.static_0,
      };
    if (mode === 'provider-drift') config.terraform.required_providers.aws.version = '= 1.0.0';
    expect(() =>
      reviseAwsTerraformStaticServiceRoutes(
        f.base,
        f.observed.services,
        JSON.stringify(config),
        mode === 'missing-retained' ? 'restore' : 'withdraw',
      ),
    ).toThrow();
  });
for (const effect of ['withdraw', 'restore'] as const)
  test(`Terraform static ${effect} exact saved plan rejects unrelated mutation and foreign target`, async () => {
    const f = await terraformRevisionFixture();
    const withdrawal = reviseAwsTerraformStaticServiceRoutes(f.base, f.observed.services, f.original, 'withdraw');
    const revision =
      effect === 'withdraw'
        ? withdrawal
        : reviseAwsTerraformStaticServiceRoutes(
            f.base,
            f.observed.services,
            withdrawal.configuration,
            'restore',
            withdrawal,
          );
    const address = 'aws_ec2_transit_gateway_route.static_0';
    const owned = {
      destination_cidr_block: '10.200.0.0/16',
      transit_gateway_attachment_id: f.values.__TGW_TRANSPORT_ATTACHMENT__,
      transit_gateway_route_table_id: 'tgw-rtb-12345678',
      blackhole: false,
    };
    const receipt = {
      schemaVersion: 1 as const,
      engine: 'terraform' as const,
      deploymentId: f.base.deploymentName,
      backendIdentity: `local:${f.base.deploymentName}`,
      configurationSha256: createHash('sha256').update(revision.configuration).digest('hex'),
      providerLockSha256: AWS_CE_PROVIDER_LOCK_SHA256,
      planSha256: 'a'.repeat(64),
      noChanges: false,
      changes: [
        { address, type: 'aws_ec2_transit_gateway_route', actions: [effect === 'withdraw' ? 'delete' : 'create'] },
      ],
    };
    const before = { [address]: effect === 'withdraw' ? owned : null };
    const after = { [address]: effect === 'restore' ? owned : null };
    expect(() =>
      validateAwsTerraformStaticServiceReceipt(f.base, f.observed.services, revision, receipt, before, after),
    ).not.toThrow();
    expect(() =>
      validateAwsTerraformStaticServiceReceipt(
        f.base,
        f.observed.services,
        revision,
        {
          ...receipt,
          changes: [...receipt.changes, { address: 'aws_instance.node_1', type: 'aws_instance', actions: ['delete'] }],
        },
        before,
        after,
      ),
    ).toThrow();
    expect(() =>
      validateAwsTerraformStaticServiceReceipt(
        f.base,
        f.observed.services,
        revision,
        receipt,
        { [address]: { ...owned, transit_gateway_attachment_id: 'tgw-attach-ffffffff' } },
        after,
      ),
    ).toThrow();
  });

async function nativeTgwControllerFixture() {
  const f = fixture();
  const observed = await collectAwsPowerStaticTgwRoutes(f.base, f.values, f.api);
  const identity = await powerIdentityFixture().read();
  const bindings = {
    sourcePlanSha256: f.base.planSha256,
    owner: identity.owner,
    nodes: identity.nodes,
    servicesSha256: observed.servicesSha256,
  };
  const plan = buildAwsWholeSitePowerPlan(f.base, 'stop', bindings, '11111111-1111-4111-8111-111111111111');
  const directory = await mkdtemp(join(tmpdir(), 'static-tgw-power-'));
  const storage = await CeDeploymentStore.open(directory, bindings.owner);
  const attempt = {
    effect: 'withdraw',
    originalAttemptAt: '2026-10-19T00:00:00Z',
    requestSha256: canonicalSha256({ planSha256: plan.planSha256, effect: 'withdraw' }),
  };
  await storage.write(`${plan.planId}.json`, plan);
  await storage.write(`${plan.planId}-checkpoint.json`, {
    schemaVersion: 1,
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    step: 1,
    complete: false,
    pending: attempt,
    attempts: { withdraw: attempt },
  });
  let count = 0;
  let lost = false;
  const original = f.api.exec;
  f.api.exec = async (cmd, args) => {
    if (args[1] !== 'delete-transit-gateway-route') return original(cmd, args);
    count++;
    if (lost) throw Error('lost response');
    return {
      exitCode: 0,
      stdout: JSON.stringify({ Route: { DestinationCidrBlock: '10.200.0.0/16', Type: 'static' } }),
      stderr: '',
    };
  };
  return {
    ...f,
    plan,
    storage,
    count: () => count,
    lose: () => {
      lost = true;
    },
    dispatch: () =>
      dispatchAwsNativeStaticTgwRoutes(f.base, plan, plan.planSha256, 'withdraw', storage, f.values, f.api),
    reconcile: () =>
      reconcileAwsNativeStaticTgwRoutes(f.base, plan, 'withdraw', attempt.originalAttemptAt, storage, f.values, f.api),
    clean: () => rm(directory, { recursive: true }),
  };
}
test('native TGW acknowledgement awaits exact route absence', async () => {
  const f = await nativeTgwControllerFixture();
  try {
    await f.dispatch();
    expect(f.count()).toBe(1);
    expect(await f.reconcile()).toBe('pending');
    f.absent();
    expect(await f.reconcile()).toBe('completed');
    await f.dispatch();
    expect(f.count()).toBe(1);
  } finally {
    await f.clean();
  }
});
test('native TGW lost response never replays service withdrawal', async () => {
  const f = await nativeTgwControllerFixture();
  try {
    f.lose();
    await expect(f.dispatch()).rejects.toThrow('lost response');
    await expect(f.dispatch()).rejects.toThrow('pending');
    expect(f.count()).toBe(1);
    f.absent();
    expect(await f.reconcile()).toBe('completed');
  } finally {
    await f.clean();
  }
});
test('native TGW missing return path rejects before dispatch', async () => {
  const f = await nativeTgwControllerFixture();
  try {
    f.missingReturn();
    await expect(f.dispatch()).rejects.toThrow();
    expect(f.count()).toBe(0);
  } finally {
    await f.clean();
  }
});

test('native TGW restoration requires observed retained attachment and original completed withdrawal', async () => {
  const f = await nativeTgwControllerFixture();
  try {
    await f.dispatch();
    f.absent();
    expect(await f.reconcile()).toBe('completed');
    const body = {
      schemaVersion: 1 as const,
      kind: 'aws-ce-stopped' as const,
      sourcePlanSha256: f.base.planSha256,
      transitionId: f.plan.transitionId,
      stopPlanSha256: f.plan.planSha256,
      bindingsSha256: f.plan.bindingsSha256,
      stoppedEvidenceSha256: 'a'.repeat(64),
      originalAttemptAt: '2026-10-19T00:00:00Z',
      observedAt: '2026-10-19T00:00:01Z',
    };
    const start = buildAwsWholeSitePowerPlan(f.base, 'start', f.plan.bindings, f.plan.transitionId, {
      ...body,
      receiptSha256: canonicalSha256(body),
    });
    const attempt = {
      effect: 'restore',
      originalAttemptAt: '2026-10-19T00:00:02Z',
      requestSha256: canonicalSha256({ planSha256: start.planSha256, effect: 'restore' }),
    };
    await f.storage.write(`${start.planId}.json`, start);
    await f.storage.write(`${start.planId}-checkpoint.json`, {
      schemaVersion: 1,
      planSha256: start.planSha256,
      bindingsSha256: start.bindingsSha256,
      step: 3,
      complete: false,
      pending: attempt,
      attempts: { restore: attempt },
    });
    let creates = 0;
    const original = f.api.exec;
    f.api.exec = async (cmd, args) => {
      if (args[1] !== 'create-transit-gateway-route') return original(cmd, args);
      creates++;
      expect(args[args.indexOf('--transit-gateway-attachment-id') + 1]).toBe(f.values.__TGW_TRANSPORT_ATTACHMENT__);
      return {
        exitCode: 0,
        stdout: JSON.stringify({ Route: { DestinationCidrBlock: '10.200.0.0/16', Type: 'static' } }),
        stderr: '',
      };
    };
    const dispatch = () =>
      dispatchAwsNativeStaticTgwRoutes(f.base, start, start.planSha256, 'restore', f.storage, f.values, f.api);
    const reconcile = () =>
      reconcileAwsNativeStaticTgwRoutes(
        f.base,
        start,
        'restore',
        attempt.originalAttemptAt,
        f.storage,
        f.values,
        f.api,
      );
    await dispatch();
    expect(creates).toBe(1);
    expect(await reconcile()).toBe('pending');
    f.active();
    expect(await reconcile()).toBe('completed');
    await dispatch();
    expect(creates).toBe(1);
    const name = `${f.plan.planId}-withdraw-native-static-tgw-outcome.json`;
    const outcome = (await f.storage.read(name)) as { observed: Record<string, unknown> };
    await f.storage.write(name, { ...outcome, observed: { ...outcome.observed, status: 'active' } });
    await expect(dispatch()).rejects.toThrow('withdrawal');
    expect(creates).toBe(1);
  } finally {
    await f.clean();
  }
});

async function terraformTgwControllerFixture(effect: 'withdraw' | 'restore' = 'withdraw') {
  const f = await terraformRevisionFixture();
  const observed = f.observed;
  const identity = await powerIdentityFixture('terraform').read();
  const bindings = {
    sourcePlanSha256: f.base.planSha256,
    owner: identity.owner,
    nodes: identity.nodes,
    servicesSha256: observed.servicesSha256,
  };
  const stop = buildAwsWholeSitePowerPlan(f.base, 'stop', bindings, '11111111-1111-4111-8111-111111111111');
  const body = {
    schemaVersion: 1 as const,
    kind: 'aws-ce-stopped' as const,
    sourcePlanSha256: f.base.planSha256,
    transitionId: stop.transitionId,
    stopPlanSha256: stop.planSha256,
    bindingsSha256: stop.bindingsSha256,
    stoppedEvidenceSha256: 'a'.repeat(64),
    originalAttemptAt: '2026-10-19T00:00:00Z',
    observedAt: '2026-10-19T00:00:01Z',
  };
  const plan =
    effect === 'withdraw'
      ? stop
      : buildAwsWholeSitePowerPlan(f.base, 'start', bindings, stop.transitionId, {
          ...body,
          receiptSha256: canonicalSha256(body),
        });
  const directory = await mkdtemp(join(tmpdir(), 'terraform-static-tgw-'));
  const storage = await CeDeploymentStore.open(directory, bindings.owner);
  const attempt = {
    effect,
    originalAttemptAt: '2026-10-19T00:00:02Z',
    requestSha256: canonicalSha256({ planSha256: plan.planSha256, effect }),
  };
  await storage.write(`${plan.planId}.json`, plan);
  await storage.write(`${plan.planId}-checkpoint.json`, {
    schemaVersion: 1,
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    step: effect === 'withdraw' ? 1 : 3,
    complete: false,
    pending: attempt,
    attempts: { [effect]: attempt },
  });
  const withdrawal = reviseAwsTerraformStaticServiceRoutes(f.base, observed.services, f.original, 'withdraw');
  let current = effect === 'withdraw' ? f.original : withdrawal.configuration;
  const address = 'aws_ec2_transit_gateway_route.static_0';
  const owned = {
    destination_cidr_block: '10.200.0.0/16',
    transit_gateway_attachment_id: f.values.__TGW_TRANSPORT_ATTACHMENT__,
    transit_gateway_route_table_id: 'tgw-rtb-12345678',
    blackhole: false,
  };
  let applied: Record<string, unknown> | null = effect === 'withdraw' ? owned : null;
  let journal: 'planned' | 'applying' | 'applied' = 'planned';
  let applies = 0;
  let plans = 0;
  let lost = false;
  let interrupted = false;
  let reconciled = 0;
  const sha = (value: string) => createHash('sha256').update(value).digest('hex');
  const receipt = (): PlanReceipt => ({
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: f.base.deploymentName,
    backendIdentity: `local:${f.base.deploymentName}`,
    configurationSha256: sha(current),
    providerLockSha256: AWS_CE_PROVIDER_LOCK_SHA256,
    planSha256: 'a'.repeat(64),
    noChanges: false,
    changes: [
      { address, type: 'aws_ec2_transit_gateway_route', actions: [effect === 'withdraw' ? 'delete' : 'create'] },
    ],
  });
  const session = {
    readConfigurationSha256: async () => sha(current),
    readConfiguration: async (expected: string) => {
      if (expected !== sha(current)) throw Error('revision');
      return current;
    },
    reviseConfiguration: async (expected: string, next: string) => {
      if (expected !== sha(current)) throw Error('revision');
      current = next;
      return sha(current);
    },
    plan: async () => {
      plans++;
      return receipt();
    },
    readPlanApplicationState: async () => journal,
    readPlannedResourceFields: async () => ({ [address]: effect === 'withdraw' ? owned : null }),
    readProposedResourceFields: async () => ({ [address]: effect === 'withdraw' ? null : owned }),
    readAppliedResourceFields: async () => ({ [address]: applied }),
    apply: async () => {
      if (interrupted) {
        interrupted = false;
        throw Error('before submission');
      }
      applies++;
      journal = 'applying';
      if (lost) throw Error('lost response');
      journal = 'applied';
    },
    reconcileApplyFromEvidence: async () => {
      reconciled++;
      journal = 'applied';
    },
  } as unknown as TerraformSession;
  const terraform: CeTerraformService = {
    open: async (owner, _, mode) => {
      expect(owner).toEqual(storage.owner);
      expect(mode).toBe('current');
      return session;
    },
  };
  const priorMarker = {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: stop.planSha256,
    bindingsSha256: stop.bindingsSha256,
    servicesSha256: observed.servicesSha256,
    attempt: {
      effect: 'withdraw',
      originalAttemptAt: '2026-10-19T00:00:00Z',
      requestSha256: canonicalSha256({ planSha256: stop.planSha256, effect: 'withdraw' }),
    },
  };
  const priorReceipt = {
    ...receipt(),
    configurationSha256: withdrawal.afterSha256,
    changes: [{ address, type: 'aws_ec2_transit_gateway_route', actions: ['delete'] }],
  };
  if (effect === 'restore') {
    f.absent();
    const withdrawn = await collectAwsPowerStaticTgwRoutes(f.base, f.values, f.api);
    await storage.write(`${stop.planId}.json`, stop);
    await storage.write(`${stop.planId}-withdraw-terraform-static-tgw-preparation.json`, {
      marker: priorMarker,
      source: f.original,
      revision: withdrawal,
      receipt: priorReceipt,
    });
    await storage.write(`${stop.planId}-withdraw-terraform-static-tgw-dispatch.json`, {
      marker: priorMarker,
      receipt: priorReceipt,
    });
    await storage.write(`${stop.planId}-withdraw-terraform-static-tgw-outcome.json`, {
      marker: priorMarker,
      receipt: priorReceipt,
      observed: withdrawn,
      applied: { [address]: null },
      collectedAt: new Date().toISOString(),
    });
  }
  return {
    ...f,
    plan,
    stop,
    storage,
    dispatch: () =>
      dispatchAwsTerraformStaticTgwRoutes(f.base, plan, plan.planSha256, effect, storage, f.values, f.api, terraform),
    reconcile: () =>
      reconcileAwsTerraformStaticTgwRoutes(
        f.base,
        plan,
        effect,
        attempt.originalAttemptAt,
        storage,
        f.values,
        f.api,
        terraform,
      ),
    actual: (value: Record<string, unknown> | null) => {
      applied = value;
    },
    owned,
    lose: () => {
      lost = true;
    },
    interrupt: () => {
      interrupted = true;
    },
    applies: () => applies,
    plans: () => plans,
    reconciled: () => reconciled,
    clean: () => rm(directory, { recursive: true }),
  };
}
for (const effect of ['withdraw', 'restore'] as const)
  test(`Terraform static TGW ${effect} requires actual state and independent route evidence`, async () => {
    const f = await terraformTgwControllerFixture(effect);
    try {
      await f.dispatch();
      expect(f.applies()).toBe(1);
      expect(await f.reconcile()).toBe('pending');
      f.actual(effect === 'withdraw' ? null : f.owned);
      expect(await f.reconcile()).toBe('pending');
      if (effect === 'withdraw') f.absent();
      else f.active();
      expect(await f.reconcile()).toBe('completed');
      expect(f.reconciled()).toBe(1);
      await expect(f.dispatch()).rejects.toThrow('submitted');
      expect(f.applies()).toBe(1);
    } finally {
      await f.clean();
    }
  });
test('Terraform static TGW lost response never replays', async () => {
  const f = await terraformTgwControllerFixture();
  try {
    f.lose();
    await expect(f.dispatch()).rejects.toThrow('lost response');
    await expect(f.dispatch()).rejects.toThrow('submitted');
    f.actual(null);
    f.absent();
    expect(await f.reconcile()).toBe('completed');
    expect(f.applies()).toBe(1);
  } finally {
    await f.clean();
  }
});
test('Terraform static TGW unsubmitted plan resumes exact receipt', async () => {
  const f = await terraformTgwControllerFixture();
  try {
    f.interrupt();
    await expect(f.dispatch()).rejects.toThrow('before submission');
    expect(await f.reconcile()).toBe('not-submitted');
    await f.dispatch();
    expect(f.plans()).toBe(1);
    expect(f.applies()).toBe(1);
  } finally {
    await f.clean();
  }
});
test('Terraform static TGW foreign actual route cannot reconcile', async () => {
  const f = await terraformTgwControllerFixture('restore');
  try {
    await f.dispatch();
    f.actual({ ...f.owned, transit_gateway_attachment_id: 'tgw-attach-ffffffff' });
    await expect(f.reconcile()).rejects.toThrow('identity');
    expect(f.reconciled()).toBe(0);
  } finally {
    await f.clean();
  }
});
test('Terraform static TGW restore requires completed withdrawal outcome', async () => {
  const f = await terraformTgwControllerFixture('restore');
  try {
    await rm(join(f.storage.directory, `${f.stop.planId}-withdraw-terraform-static-tgw-outcome.json`));
    await expect(f.dispatch()).rejects.toThrow();
    expect(f.applies()).toBe(0);
  } finally {
    await f.clean();
  }
});
