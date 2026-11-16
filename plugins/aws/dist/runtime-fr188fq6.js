// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import { loadAwsCheckpoint, loadAwsPlan } from './runtime-2srcqb9f.js';
import './runtime-kn70ms9w.js';
import './runtime-zgbq4apm.js';
import { createAwsCeStatusTool2 } from './runtime-781cee57.js';
import './runtime-d3q0sbwf.js';

// plugins/aws/src/ce/diagnostic-invocation.ts
import { setTimeout as delay } from 'node:timers/promises';
import { makeExecApi } from './runtime-30f0rzjf.js';
import { siteForNode } from './runtime-ay1zjq29.js';
import { scopedAwsApi } from './runtime-fex55vat.js';
import { sha256Hex } from './runtime-wvre8ba5.js';

var object = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
async function verifyDiagnosticManagedNode(api, instanceId, region) {
  const result = await api.exec('aws', [
    'ssm',
    'describe-instance-information',
    '--filters',
    `Key=InstanceIds,Values=${instanceId}`,
    '--region',
    region,
    '--output',
    'json',
  ]);
  if (result.exitCode !== 0) throw new Error('SSM managed-node prerequisites are unavailable');
  const response = object(JSON.parse(result.stdout));
  if (
    Object.hasOwn(response, 'NextToken') ||
    !Array.isArray(response.InstanceInformationList) ||
    response.InstanceInformationList.length !== 1
  )
    throw new Error('SSM managed-node observation is incomplete');
  const node = object(response.InstanceInformationList[0]);
  const pingTime =
    typeof node.LastPingDateTime === 'number'
      ? node.LastPingDateTime * 1000
      : Date.parse(String(node.LastPingDateTime));
  if (
    node.InstanceId !== instanceId ||
    node.ResourceType !== 'EC2Instance' ||
    node.PlatformType !== 'Linux' ||
    node.PingStatus !== 'Online' ||
    typeof node.AgentVersion !== 'string' ||
    !/^\d+\.\d+\.\d+\.\d+$/.test(node.AgentVersion) ||
    !Number.isFinite(pingTime) ||
    Date.now() - pingTime > 5 * 60000 ||
    pingTime > Date.now() + 30000
  )
    throw new Error('SSM requires a freshly online supported Linux managed node');
}
async function verifyDiagnosticInstance(api, plan, instanceId, node) {
  if (!/^i-[0-9a-f]{8,17}$/.test(instanceId)) throw new Error('Invalid diagnostic instance identity');
  const result = await api.exec('aws', [
    'ec2',
    'describe-instances',
    '--instance-ids',
    instanceId,
    '--region',
    plan.region,
    '--output',
    'json',
  ]);
  if (result.exitCode !== 0) throw new Error('Diagnostic instance ownership is unavailable');
  const data = object(JSON.parse(result.stdout));
  if (data.NextToken || !Array.isArray(data.Reservations) || data.Reservations.length !== 1)
    throw new Error('Diagnostic instance response is incomplete');
  const reservation = object(data.Reservations[0]);
  const instances = reservation.Instances;
  if (reservation.OwnerId !== plan.accountId || !Array.isArray(instances) || instances.length !== 1)
    throw new Error('Diagnostic instance account is unverified');
  const instance = object(instances[0]);
  const tags = Array.isArray(instance.Tags) ? instance.Tags.map(object) : [];
  const expected = {
    'xcsh-managed-by': 'aws-ce',
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-execution-engine': plan.engine,
    'ves-io-site-name': siteForNode(plan.intent, node).name,
  };
  if (
    instance.InstanceId !== instanceId ||
    object(instance.State).Name !== 'running' ||
    Object.entries(expected).some(
      ([key, value]) =>
        tags.filter((tag) => tag.Key === key).length !== 1 || tags.find((tag) => tag.Key === key)?.Value !== value,
    )
  )
    throw new Error('Diagnostic instance ownership or state differs from plan');
}
async function observeDiagnosticInvocation(
  api,
  commandId,
  instanceId,
  region,
  protocol,
  signal,
  pause = (ms) => delay(ms, undefined, { signal }),
) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(commandId))
    throw new Error('SSM submission returned no usable command identity; do not resubmit automatically');
  const base = { commandId, instanceId, region, protocol, source: 'ssm:get-command-invocation' };
  for (let attempt = 0; attempt < 30; attempt++) {
    signal?.throwIfAborted();
    const result = await api.exec('aws', [
      'ssm',
      'get-command-invocation',
      '--command-id',
      commandId,
      '--instance-id',
      instanceId,
      '--region',
      region,
      '--output',
      'json',
    ]);
    if (result.exitCode !== 0) {
      if (!result.stderr.includes('InvocationDoesNotExist'))
        return { ...base, status: 'unknown', reason: 'invocation-unavailable' };
    } else {
      let invocation;
      try {
        invocation = object(JSON.parse(result.stdout));
      } catch {
        return { ...base, status: 'unknown', reason: 'invocation-response-malformed' };
      }
      if (
        invocation.CommandId !== commandId ||
        invocation.InstanceId !== instanceId ||
        invocation.DocumentName !== 'AWS-RunShellScript'
      )
        return { ...base, status: 'unknown', reason: 'invocation-identity-mismatch' };
      if (invocation.Status === 'Success')
        return {
          ...base,
          status: invocation.ResponseCode === 0 && protocol === 'tcp' ? 'healthy' : 'unknown',
          scope: protocol === 'tcp' ? 'tcp-connect-only' : 'udp-response-unverified',
          observedAt: new Date().toISOString(),
        };
      if (['Failed', 'Cancelled', 'TimedOut'].includes(String(invocation.Status)))
        return { ...base, status: 'degraded', state: invocation.Status, observedAt: new Date().toISOString() };
      if (!['Pending', 'InProgress', 'Delayed', 'Cancelling'].includes(String(invocation.Status)))
        return { ...base, status: 'unknown', reason: 'invocation-state-unrecognized' };
    }
    if (attempt < 29) await pause(2000);
  }
  return { ...base, status: 'unknown', reason: 'invocation-not-converged' };
}

// plugins/aws/src/ce/flow-log-evidence.ts
var defaultFormat =
  'version account-id interface-id srcaddr dstaddr srcport dstport protocol packets bytes start end action log-status';
function interpretFlowLogEvents(response, scope, logFormat) {
  if (!Array.isArray(response.events) || response.events.length > 100 || Object.hasOwn(response, 'nextToken'))
    throw new Error('Missing or partial Flow Log events');
  const fields =
    logFormat === undefined
      ? defaultFormat.split(' ')
      : logFormat
          .trim()
          .split(/\s+/)
          .map((field) => {
            const match = /^\$\{([a-z-]+)\}$/.exec(field);
            if (!match) throw new Error('Unsupported Flow Log format');
            return match[1];
          });
  if (
    new Set(fields).size !== fields.length ||
    ['account-id', 'interface-id', 'start', 'end', 'action', 'log-status'].some((field) => !fields.includes(field))
  )
    throw new Error('Flow Log format lacks resource or freshness identity');
  const interfaces = new Set(scope.interfaceIds);
  let accepted = 0,
    rejected = 0,
    unavailable = 0;
  for (const value of response.events) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Flow Log event');
    const event = value;
    if (
      typeof event.timestamp !== 'number' ||
      !Number.isFinite(event.timestamp) ||
      event.timestamp < scope.start ||
      event.timestamp > scope.end ||
      typeof event.message !== 'string'
    )
      throw new Error('Stale or malformed Flow Log event');
    const values = event.message.trim().split(/\s+/);
    if (values.length !== fields.length) throw new Error('Flow Log record format differs');
    const record = Object.fromEntries(fields.map((field, index) => [field, values[index]]));
    if (record['account-id'] !== scope.accountId || !interfaces.has(record['interface-id']))
      throw new Error('Flow Log record scope differs');
    if (['NODATA', 'SKIPDATA'].includes(record['log-status'])) {
      unavailable++;
      continue;
    }
    const start = Number(record.start) * 1000,
      end = Number(record.end) * 1000;
    if (
      record['log-status'] !== 'OK' ||
      !/^\d+$/.test(record.start) ||
      !/^\d+$/.test(record.end) ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < scope.start ||
      end > scope.end ||
      start > end ||
      !['ACCEPT', 'REJECT'].includes(record.action)
    )
      throw new Error('Invalid Flow Log sample');
    if (record.action === 'ACCEPT') accepted++;
    else rejected++;
  }
  return {
    status:
      unavailable || accepted + rejected === 0 ? 'unknown' : rejected ? 'rejections-observed' : 'accepts-observed',
    accepted,
    rejected,
    unavailable,
    canSatisfyTrafficGate: false,
    window: { start: new Date(scope.start).toISOString(), end: new Date(scope.end).toISOString() },
    maxEvents: 100,
  };
}

// plugins/aws/src/ce/passive-evidence.ts
async function collectAwsPassiveEvidence(scope, executor, signal, lookbackMinutes = 15) {
  if (
    !/^\d{12}$/.test(scope.accountId) ||
    !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(scope.region) ||
    !Number.isInteger(lookbackMinutes) ||
    lookbackMinutes < 1 ||
    lookbackMinutes > 60 ||
    scope.instanceIds.length > 20 ||
    scope.interfaceIds.length > 160 ||
    scope.vpcIds.length > 20 ||
    scope.instanceIds.some((id) => !/^i-[0-9a-f]{8,21}$/.test(id)) ||
    scope.interfaceIds.some((id) => !/^eni-[0-9a-f]{8,21}$/.test(id)) ||
    scope.vpcIds.some((id) => !/^vpc-[0-9a-f]{8,21}$/.test(id))
  )
    throw new Error('Invalid passive evidence scope');
  const api = scopedAwsApi(executor, scope.awsProfile, signal);
  const read = async (args) => {
    const response = await api.exec('aws', [...args, '--region', scope.region, '--output', 'json']);
    if (response.exitCode !== 0) throw new Error('Passive evidence permission or transport failure');
    const data = JSON.parse(response.stdout);
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      ['NextToken', 'NextMarker', 'nextToken'].some((key) => Object.hasOwn(data, key))
    )
      throw new Error('Malformed or partial passive evidence');
    return data;
  };
  if ((await read(['sts', 'get-caller-identity'])).Account !== scope.accountId)
    throw new Error('Passive evidence account changed');
  const end = Date.now(),
    start = end - lookbackMinutes * 60000;
  const observations = [];
  const flowDestinations = new Map();
  const collect = async (category, resources, args, parse) => {
    const base = {
      category,
      resources,
      accountId: scope.accountId,
      region: scope.region,
      source: `aws:${args[0]}:${args[1]}`,
      observedAt: new Date().toISOString(),
      canSatisfyTrafficGate: false,
    };
    try {
      observations.push({ ...base, ...parse(await read(args)) });
    } catch {
      signal?.throwIfAborted();
      observations.push({ ...base, status: 'unknown', reason: 'permission-transport-pagination-or-shape' });
    }
  };
  for (const id of scope.instanceIds) {
    await collect(
      'ec2-status',
      [id],
      ['ec2', 'describe-instance-status', '--include-all-instances', '--instance-ids', id],
      (value) => {
        if (!Array.isArray(value.InstanceStatuses) || value.InstanceStatuses.length !== 1)
          throw new Error('Missing status');
        const row = value.InstanceStatuses[0];
        const system = row.SystemStatus?.Status,
          instance = row.InstanceStatus?.Status;
        if (
          row.InstanceId !== id ||
          !['ok', 'impaired', 'initializing', 'insufficient-data', 'not-applicable'].includes(String(system)) ||
          !['ok', 'impaired', 'initializing', 'insufficient-data', 'not-applicable'].includes(String(instance))
        )
          throw new Error('Malformed status');
        return {
          status:
            system === 'ok' && instance === 'ok'
              ? 'healthy'
              : [system, instance].includes('insufficient-data')
                ? 'unknown'
                : 'degraded',
          system,
          instance,
        };
      },
    );
    await collect(
      'cloudwatch',
      [id],
      [
        'cloudwatch',
        'get-metric-statistics',
        '--namespace',
        'AWS/EC2',
        '--metric-name',
        'StatusCheckFailed',
        '--dimensions',
        `Name=InstanceId,Value=${id}`,
        '--start-time',
        new Date(start).toISOString(),
        '--end-time',
        new Date(end).toISOString(),
        '--period',
        '300',
        '--statistics',
        'Maximum',
      ],
      (value) => {
        if (value.Label !== 'StatusCheckFailed' || !Array.isArray(value.Datapoints) || !value.Datapoints.length)
          throw new Error('Missing metric');
        const points = value.Datapoints.map((point) => {
          const row = point,
            timestamp = Date.parse(String(row.Timestamp));
          if (
            !Number.isFinite(timestamp) ||
            timestamp < start ||
            timestamp > end ||
            typeof row.Maximum !== 'number' ||
            !Number.isFinite(row.Maximum)
          )
            throw new Error('Stale or malformed metric');
          return row.Maximum;
        });
        return {
          status: Math.max(...points) > 0 ? 'fault-observed' : 'no-status-check-faults',
          samples: points.length,
          window: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
        };
      },
    );
    await collect(
      'cloudtrail',
      [id],
      [
        'cloudtrail',
        'lookup-events',
        '--lookup-attributes',
        `AttributeKey=ResourceName,AttributeValue=${id}`,
        '--start-time',
        new Date(start).toISOString(),
        '--end-time',
        new Date(end).toISOString(),
        '--max-results',
        '50',
        '--no-paginate',
      ],
      (value) => {
        if (!Array.isArray(value.Events) || value.Events.length > 50)
          throw new Error('Missing or oversized CloudTrail events');
        const allowed = new Set([
          'RunInstances',
          'StartInstances',
          'StopInstances',
          'TerminateInstances',
          'ModifyInstanceAttribute',
          'SendCommand',
        ]);
        const names = value.Events.map((event) => {
          if (!event || typeof event !== 'object' || Array.isArray(event))
            throw new Error('Malformed CloudTrail event');
          const row = event;
          const timestamp = Date.parse(String(row.EventTime));
          if (
            !Number.isFinite(timestamp) ||
            timestamp < start ||
            timestamp > end ||
            typeof row.EventName !== 'string' ||
            !Array.isArray(row.Resources) ||
            !row.Resources.some(
              (resource) =>
                resource && typeof resource === 'object' && !Array.isArray(resource) && resource.ResourceName === id,
            )
          )
            throw new Error('Stale or unbound CloudTrail event');
          return row.EventName;
        });
        return {
          status: 'observed-sample',
          eventCount: names.length,
          operations: [...new Set(names.filter((name) => allowed.has(name)))],
          window: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
          maxEvents: 50,
        };
      },
    );
  }
  for (const vpcId of [...new Set(scope.vpcIds)]) {
    for (const [category, operation, field] of [
      ['security-groups', 'describe-security-groups', 'SecurityGroups'],
      ['network-acls', 'describe-network-acls', 'NetworkAcls'],
      ['route-tables', 'describe-route-tables', 'RouteTables'],
    ]) {
      await collect(category, [vpcId], ['ec2', operation, '--filters', `Name=vpc-id,Values=${vpcId}`], (value) => {
        if (!Array.isArray(value[field]) || value[field].some((row) => row.VpcId !== vpcId))
          throw new Error('Malformed configuration');
        return { status: 'configuration-observed', count: value[field].length, traffic: 'unknown' };
      });
    }
    await collect(
      'flow-logs',
      [vpcId],
      ['ec2', 'describe-flow-logs', '--filter', `Name=resource-id,Values=${vpcId}`],
      (value) => {
        if (
          !Array.isArray(value.FlowLogs) ||
          value.FlowLogs.some(
            (row) => row.ResourceId !== vpcId || !['ACTIVE', 'PENDING', 'FAILED'].includes(String(row.FlowLogStatus)),
          )
        )
          throw new Error('Malformed flow log observation');
        const destinations = new Map();
        for (const row of value.FlowLogs) {
          if (row.FlowLogStatus !== 'ACTIVE' || row.LogDestinationType !== 'cloud-watch-logs') continue;
          if (
            typeof row.LogGroupName !== 'string' ||
            !/^[.\-_/#A-Za-z0-9]{1,512}$/.test(row.LogGroupName) ||
            (row.LogFormat !== undefined && typeof row.LogFormat !== 'string')
          )
            throw new Error('Malformed Flow Log destination');
          const destination = { vpcId, format: row.LogFormat };
          const previous = destinations.get(row.LogGroupName) ?? flowDestinations.get(row.LogGroupName);
          if (previous && (previous.vpcId !== vpcId || previous.format !== destination.format))
            throw new Error('Ambiguous Flow Log destination');
          destinations.set(row.LogGroupName, destination);
        }
        for (const [group, destination] of destinations) flowDestinations.set(group, destination);
        return {
          status: value.FlowLogs.length ? 'configuration-observed' : 'not-configured',
          count: value.FlowLogs.length,
          measuredTraffic: 'unknown',
        };
      },
    );
  }
  if (scope.interfaceIds.length && flowDestinations.size <= 20) {
    for (const [group, destination] of flowDestinations) {
      await collect(
        'flow-log-traffic',
        [destination.vpcId, ...scope.interfaceIds],
        [
          'logs',
          'filter-log-events',
          '--log-group-name',
          group,
          '--start-time',
          String(start),
          '--end-time',
          String(end),
          '--filter-pattern',
          [...new Set(scope.interfaceIds)].map((id) => `?"${id}"`).join(' '),
          '--limit',
          '100',
          '--no-paginate',
        ],
        (value) =>
          interpretFlowLogEvents(
            value,
            { accountId: scope.accountId, interfaceIds: scope.interfaceIds, start, end },
            destination.format,
          ),
      );
    }
  } else if (flowDestinations.size) {
    observations.push({
      category: 'flow-log-traffic',
      resources: scope.vpcIds,
      accountId: scope.accountId,
      region: scope.region,
      observedAt: new Date().toISOString(),
      source: 'aws:logs:filter-log-events',
      status: 'unknown',
      reason: 'missing-interface-scope-or-query-bound',
      canSatisfyTrafficGate: false,
    });
  }
  return {
    scope,
    observedAt: new Date().toISOString(),
    lookbackMinutes,
    observations,
    findings: observations
      .filter((row) =>
        ['unknown', 'degraded', 'fault-observed', 'not-configured', 'rejections-observed'].includes(String(row.status)),
      )
      .map((row) => ({
        category: row.category,
        resources: row.resources,
        status: row.status,
        nextStep:
          row.status === 'unknown'
            ? 'Verify scoped permissions, response completeness and freshness.'
            : row.category === 'ec2-status' || row.category === 'cloudwatch'
              ? 'Review instance boot, EC2 checks and the owned network path.'
              : 'Review the observed configuration against the saved plan.',
      })),
  };
}

// plugins/aws/src/tools/aws-ce-diagnose.ts
async function collect(api, args, category) {
  const result = await api.exec('aws', args);
  const raw = `${result.stdout}
${result.stderr}`;
  return {
    category,
    ok: result.exitCode === 0,
    bytes: Buffer.byteLength(raw),
    digest: sha256Hex(raw),
    health: 'unknown',
  };
}
function createAwsCeDiagnoseTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_diagnose',
    label: 'Diagnose AWS Customer Edge',
    description:
      'Run passive AWS CE diagnostics or separately approved active SSM connectivity checks. Covers EC2 boot/status, ENIs/routes/security groups, NLB, TGW/Connect/BGP, and live platform observations while withholding console output, user data, and secrets.',
    parameters: Type.Object({
      planId: Type.Optional(Type.String()),
      planSha256: Type.Optional(Type.String()),
      site: Type.Optional(
        Type.Object({
          accountId: Type.String(),
          awsProfile: Type.String(),
          region: Type.String(),
          siteName: Type.String(),
          platformContext: Type.Optional(Type.String()),
        }),
      ),
      mode: Type.Union([Type.Literal('passive'), Type.Literal('active')]),
      activeTarget: Type.Optional(
        Type.Object({
          destinationIp: Type.String(),
          destinationPort: Type.Number(),
          protocol: Type.Union([Type.Literal('tcp'), Type.Literal('udp')]),
        }),
      ),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        if (params.site) {
          if (params.mode !== 'passive' || params.activeTarget)
            throw new Error('Inventory-selected sites support passive diagnostics only');
          const observed = await createAwsCeStatusTool2(pi, makeApi).execute(_id, params, signal, _update, ctx);
          const value = observed.details.status;
          const nodes = value?.aws?.nodes ?? [];
          const passive = await collectAwsPassiveEvidence(
            {
              accountId: params.site.accountId,
              awsProfile: params.site.awsProfile,
              region: params.site.region,
              instanceIds: nodes.map((node) => node.instanceId),
              interfaceIds: nodes.flatMap((node) => node.interfaces.map((item) => item.id)),
              vpcIds: [...new Set(nodes.flatMap((node) => node.interfaces.map((item) => item.vpcId)))],
            },
            makeApi(ctx.cwd),
            signal,
          );
          return { ...observed, details: { tool: 'aws_ce_diagnose', status: observed.details.status, passive } };
        }
        if (!params.planId || !params.planSha256) throw new Error('A saved plan or inventory site is required');
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.planId, params.planSha256);
        if (params.mode === 'active') {
          if (
            !params.activeTarget ||
            !['tcp', 'udp'].includes(params.activeTarget.protocol) ||
            !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(params.activeTarget.destinationIp) ||
            params.activeTarget.destinationIp.split('.').some((part) => Number(part) > 255) ||
            !Number.isInteger(params.activeTarget.destinationPort) ||
            params.activeTarget.destinationPort < 1 ||
            params.activeTarget.destinationPort > 65535
          )
            throw new Error('Active diagnostics require a valid IPv4 destination and port');
          if (!ctx.hasUI && process.env.XCSH_CE_HEADLESS_MUTATIONS !== '1')
            throw new Error('Active headless diagnostics require XCSH_CE_HEADLESS_MUTATIONS=1');
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Run active AWS CE diagnostics',
              'Run a bounded SSM connectivity check on owned CE nodes?',
            ))
          )
            throw new Error('Active diagnostics were not approved');
        }
        const api = scopedAwsApi(makeApi(ctx.cwd), plan.intent.awsProfile, signal);
        const identity = await api.exec('aws', [
          'sts',
          'get-caller-identity',
          '--output',
          'json',
          '--region',
          plan.region,
        ]);
        if (identity.exitCode !== 0 || JSON.parse(identity.stdout).Account !== plan.accountId)
          throw new Error('Diagnostic account differs from plan');
        if (params.mode === 'active' && plan.engine !== 'native')
          throw new Error('Only the owning native engine may run guest commands');
        if (plan.engine === 'terraform') {
          const observed = await createAwsCeStatusTool2(pi, makeApi).execute(
            _id,
            { planId: params.planId, planSha256: params.planSha256 },
            signal,
            _update,
            ctx,
          );
          if (observed.isError) return { ...observed, details: { tool: 'aws_ce_diagnose' } };
          const value = observed.details.status;
          const nodes = value.aws?.status === 'observed' ? (value.aws.nodes ?? []) : [];
          const passive = await collectAwsPassiveEvidence(
            {
              accountId: plan.accountId,
              awsProfile: plan.intent.awsProfile ?? 'default',
              region: plan.region,
              instanceIds: nodes.map((node) => node.instanceId),
              interfaceIds: nodes.flatMap((node) => node.interfaces.map((item) => item.id)),
              vpcIds: [
                ...new Set(
                  nodes.flatMap((node) => node.interfaces.flatMap((item) => (item.vpcId ? [item.vpcId] : []))),
                ),
              ],
            },
            makeApi(ctx.cwd),
            signal,
          );
          const results = [];
          for (const node of nodes.filter((node) => node.state === 'running')) {
            results.push(
              await collect(
                api,
                [
                  'ec2',
                  'get-console-output',
                  '--instance-id',
                  node.instanceId,
                  '--latest',
                  '--region',
                  plan.region,
                  '--output',
                  'json',
                ],
                `${node.instanceId}-console`,
              ),
            );
          }
          return {
            content: [
              {
                type: 'text',
                text: 'AWS Terraform passive diagnostics use verified current workspace and cloud identities. Raw console and bootstrap material are withheld.',
              },
            ],
            details: { tool: 'aws_ce_diagnose', mode: params.mode, status: observed.details.status, passive, results },
          };
        }
        const checkpoint = await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
        const ownedInstances = Array.from({ length: plan.topology.nodeCount }, (_, index) => ({
          node: index + 1,
          instanceId: checkpoint?.resolvedValues[`__INSTANCE_${index + 1}__`],
        })).filter((item) => typeof item.instanceId === 'string');
        if (new Set(ownedInstances.map((item) => item.instanceId)).size !== ownedInstances.length)
          throw new Error('Ambiguous diagnostic instance identities');
        if (params.mode === 'active' && ownedInstances.length !== plan.topology.nodeCount)
          throw new Error('Active diagnostics require all checkpointed instance identities');
        const commands = [
          {
            category: 'network-interfaces',
            args: [
              'ec2',
              'describe-network-interfaces',
              '--filters',
              `Name=tag:xcsh-deployment-id,Values=${plan.deploymentName}`,
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          },
          {
            category: 'route-tables',
            args: [
              'ec2',
              'describe-route-tables',
              '--filters',
              `Name=tag:xcsh-deployment-id,Values=${plan.deploymentName}`,
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          },
        ];
        if (ownedInstances.length)
          commands.unshift({
            category: 'instance-status',
            args: [
              'ec2',
              'describe-instance-status',
              '--include-all-instances',
              '--instance-ids',
              ...ownedInstances.map((item) => item.instanceId),
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          });
        for (const { instanceId, node } of ownedInstances) {
          await verifyDiagnosticInstance(api, plan, instanceId, node);
          commands.push({
            category: `${instanceId}-console`,
            args: [
              'ec2',
              'get-console-output',
              '--instance-id',
              instanceId,
              '--latest',
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          });
          if (params.mode === 'active' && params.activeTarget) {
            const command =
              params.activeTarget.protocol === 'tcp'
                ? `timeout 10 bash -c '</dev/tcp/${params.activeTarget.destinationIp}/${params.activeTarget.destinationPort}'`
                : `timeout 10 nc -zvu ${params.activeTarget.destinationIp} ${params.activeTarget.destinationPort}`;
            commands.push({
              category: `${instanceId}-active`,
              args: [
                'ssm',
                'send-command',
                '--instance-ids',
                instanceId,
                '--document-name',
                'AWS-RunShellScript',
                '--parameters',
                JSON.stringify({ commands: [command], executionTimeout: ['20'] }),
                '--timeout-seconds',
                '30',
                '--region',
                plan.region,
                '--output',
                'json',
              ],
            });
          }
        }
        if (plan.routing.profile === 'nlb-ingress')
          commands.push({
            category: 'nlb',
            args: [
              'elbv2',
              'describe-load-balancers',
              '--names',
              `${plan.deploymentName}-nlb`,
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          });
        if (plan.routing.profile.startsWith('tgw-'))
          commands.push({
            category: 'tgw',
            args: [
              'ec2',
              'describe-transit-gateway-attachments',
              '--filters',
              `Name=tag:xcsh-deployment-id,Values=${plan.deploymentName}`,
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          });
        const results = [];
        for (const command of commands) {
          if (command.args[0] === 'ssm') {
            const instanceId = command.args[command.args.indexOf('--instance-ids') + 1];
            const node = ownedInstances.find((item) => item.instanceId === instanceId)?.node;
            if (!node || !params.activeTarget) throw new Error('Missing diagnostic execution binding');
            await verifyDiagnosticInstance(api, plan, instanceId, node);
            await verifyDiagnosticManagedNode(api, instanceId, plan.region);
            const submitted = await api.exec('aws', command.args);
            if (submitted.exitCode !== 0)
              throw new Error('SSM submission result is ambiguous; reconcile before retrying');
            const commandId = JSON.parse(submitted.stdout)?.Command?.CommandId;
            results.push(
              await observeDiagnosticInvocation(
                api,
                commandId,
                instanceId,
                plan.region,
                params.activeTarget.protocol,
                signal,
              ),
            );
          } else results.push(await collect(api, command.args, command.category));
        }
        const status = await createAwsCeStatusTool2(pi, makeApi).execute(
          _id,
          { planId: params.planId, planSha256: params.planSha256 },
          signal,
          _update,
          ctx,
        );
        const bound = status.details.status;
        const boundNodes = bound?.aws?.nodes ?? [];
        const passive = await collectAwsPassiveEvidence(
          {
            accountId: plan.accountId,
            awsProfile: plan.intent.awsProfile ?? 'default',
            region: plan.region,
            instanceIds: boundNodes.map((node) => node.instanceId),
            interfaceIds: boundNodes.flatMap((node) => node.interfaces.map((item) => item.id)),
            vpcIds: [...new Set(boundNodes.flatMap((node) => node.interfaces.map((item) => item.vpcId)))],
          },
          makeApi(ctx.cwd),
          signal,
        );
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE diagnostics collected ${results.length} redacted evidence digest(s); cloud and routing health are reported separately from command collection. Raw console output, SSM output, and user data were withheld.`,
            },
          ],
          details: {
            tool: 'aws_ce_diagnose',
            mode: params.mode,
            results,
            passive,
            status: status.details.status ?? { status: 'unknown' },
          },
        };
      } catch {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text',
              text: 'AWS CE diagnostics unavailable; verify the saved plan, scoped credentials and resource ownership. Do not blindly repeat an interrupted active command.',
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_diagnose' },
        };
      }
    },
  };
}

export { createAwsCeDiagnoseTool };
