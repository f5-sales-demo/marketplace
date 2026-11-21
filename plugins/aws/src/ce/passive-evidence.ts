import type { AwsExecApi } from '../aws/exec';
import { interpretFlowLogEvents } from './flow-log-evidence';
import { scopedAwsApi } from './scoped-exec';

type Json = Record<string, unknown>;
export interface PassiveEvidenceScope {
  accountId: string;
  awsProfile: string;
  region: string;
  instanceIds: string[];
  interfaceIds: string[];
  vpcIds: string[];
}

/** Bounded read-only evidence. Configuration and samples never substitute for a traffic probe. */
export async function collectAwsPassiveEvidence(
  scope: PassiveEvidenceScope,
  executor: AwsExecApi,
  signal?: AbortSignal,
  lookbackMinutes = 15,
) {
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
  const read = async (args: string[]): Promise<Json> => {
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
  const observations: Json[] = [];
  const flowDestinations = new Map<string, { vpcId: string; format?: string }>();
  const collect = async (category: string, resources: string[], args: string[], parse: (value: Json) => Json) => {
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
        const row = value.InstanceStatuses[0] as Json;
        const system = (row.SystemStatus as Json)?.Status,
          instance = (row.InstanceStatus as Json)?.Status;
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
          const row = point as Json,
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
          const row = event as Json;
          const timestamp = Date.parse(String(row.EventTime));
          if (
            !Number.isFinite(timestamp) ||
            timestamp < start ||
            timestamp > end ||
            typeof row.EventName !== 'string' ||
            !Array.isArray(row.Resources) ||
            !row.Resources.some(
              (resource) =>
                resource &&
                typeof resource === 'object' &&
                !Array.isArray(resource) &&
                (resource as Json).ResourceName === id,
            )
          )
            throw new Error('Stale or unbound CloudTrail event');
          return row.EventName;
        });
        return {
          status: 'observed-sample',
          eventCount: names.length,
          operations: [...new Set(names.filter((name) => allowed.has(name as string)))],
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
    ] as const) {
      await collect(category, [vpcId], ['ec2', operation, '--filters', `Name=vpc-id,Values=${vpcId}`], (value) => {
        if (!Array.isArray(value[field]) || (value[field] as Json[]).some((row) => row.VpcId !== vpcId))
          throw new Error('Malformed configuration');
        return { status: 'configuration-observed', count: (value[field] as unknown[]).length, traffic: 'unknown' };
      });
    }
    await collect(
      'flow-logs',
      [vpcId],
      ['ec2', 'describe-flow-logs', '--filter', `Name=resource-id,Values=${vpcId}`],
      (value) => {
        if (
          !Array.isArray(value.FlowLogs) ||
          (value.FlowLogs as Json[]).some(
            (row) => row.ResourceId !== vpcId || !['ACTIVE', 'PENDING', 'FAILED'].includes(String(row.FlowLogStatus)),
          )
        )
          throw new Error('Malformed flow log observation');
        const destinations = new Map<string, { vpcId: string; format?: string }>();
        for (const row of value.FlowLogs as Json[]) {
          if (row.FlowLogStatus !== 'ACTIVE' || row.LogDestinationType !== 'cloud-watch-logs') continue;
          if (
            typeof row.LogGroupName !== 'string' ||
            !/^[.\-_/#A-Za-z0-9]{1,512}$/.test(row.LogGroupName) ||
            (row.LogFormat !== undefined && typeof row.LogFormat !== 'string')
          )
            throw new Error('Malformed Flow Log destination');
          const destination = { vpcId, format: row.LogFormat as string | undefined };
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
