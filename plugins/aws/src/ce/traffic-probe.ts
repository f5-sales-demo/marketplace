import { isIP } from 'node:net';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { type AwsExecApi, AwsNotFoundError, detectAwsError } from '../aws/exec';
import { scopedAwsApi } from './scoped-exec';
import type { AwsCeCheckpoint, AwsCePlan } from './types';

type Json = Record<string, unknown>;
const COMMAND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed AWS traffic evidence');
  return value as Json;
};
function validSampleTimes(evidence: Json, now: number, current: boolean): boolean {
  const start = Date.parse(String(evidence.startedAt)),
    end = Date.parse(String(evidence.executedAt)),
    collected = Date.parse(String(evidence.observedAt));
  return (
    ['startedAt', 'executedAt', 'observedAt'].every((key) => typeof evidence[key] === 'string') &&
    [start, end, collected].every(Number.isFinite) &&
    start <= end &&
    end <= collected &&
    collected <= now &&
    (!current || (now - end <= 30_000 && now - collected <= 30_000))
  );
}
function verifiedPeer(plan: AwsCePlan, address: unknown): boolean {
  return (
    plan.intent.ingress?.mode === 'nlb' &&
    typeof address === 'string' &&
    isIP(address) === 4 &&
    plan.intent.ingress.loadBalancer.privateAddresses.includes(address)
  );
}
function storeOwnedByPlan(plan: AwsCePlan, storage: CeDeploymentStore): boolean {
  const expected = {
    deploymentId: plan.deploymentName,
    engine: plan.engine,
    provider: 'aws',
    account: plan.accountId,
    region: plan.region,
  };
  return Object.entries(expected).every(([key, value]) => (storage.owner as unknown as Json)?.[key] === value);
}
async function run(api: AwsExecApi, plan: AwsCePlan, args: string[]): Promise<Json> {
  const result = await api.exec('aws', [...args, '--region', plan.region, '--output', 'json']);
  if (result.exitCode !== 0) throw detectAwsError(result.stderr, result.exitCode);
  return object(JSON.parse(result.stdout));
}
async function optional(storage: Pick<CeDeploymentStore, 'read'>, name: string): Promise<Json | undefined> {
  try {
    return object(await storage.read(name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Execute a content-bound HTTP GET from one explicitly allowlisted SSM managed instance. */
export async function collectAwsTrafficProbe(
  plan: AwsCePlan,
  checkpoint: Pick<AwsCeCheckpoint, 'resolvedValues'>,
  storage: CeDeploymentStore,
  rawApi: AwsExecApi,
  signal?: AbortSignal,
) {
  if (plan.intent.ingress?.mode !== 'nlb') throw new Error('AWS traffic probe requires explicit NLB ingress');
  await storage.verify();
  if (!storeOwnedByPlan(plan, storage)) throw new Error('Traffic deployment store owner differs');
  const api = scopedAwsApi(rawApi, plan.intent.awsProfile, signal);
  const probe = plan.intent.ingress.probe;
  if (
    !plan.intent.brownfield.resourceIds.includes(probe.sourceInstanceId) ||
    !plan.ownershipInventory.some(
      (row) => row.resourceId === probe.sourceInstanceId && !row.owned && row.action === 'modify-approved',
    )
  )
    throw new Error('Traffic probe source is outside the reviewed AWS inventory');
  if ((await run(api, plan, ['sts', 'get-caller-identity'])).Account !== plan.accountId)
    throw new Error('Traffic probe account differs');
  const instance = await run(api, plan, ['ec2', 'describe-instances', '--instance-ids', probe.sourceInstanceId]);
  const instances = Array.isArray(instance.Reservations)
    ? instance.Reservations.flatMap((value) => {
        const reservation = object(value);
        return Array.isArray(reservation.Instances) ? reservation.Instances.map(object) : [];
      })
    : [];
  if (
    instances.length !== 1 ||
    instances[0].InstanceId !== probe.sourceInstanceId ||
    object(instances[0].State).Name !== 'running'
  )
    throw new Error('Traffic probe source instance is unavailable');
  const managed = await run(api, plan, [
    'ssm',
    'describe-instance-information',
    '--filters',
    `Key=InstanceIds,Values=${probe.sourceInstanceId}`,
  ]);
  const managedRows = Array.isArray(managed.InstanceInformationList) ? managed.InstanceInformationList.map(object) : [];
  if (
    managedRows.length !== 1 ||
    managedRows[0].InstanceId !== probe.sourceInstanceId ||
    managedRows[0].PingStatus !== 'Online' ||
    managedRows[0].PlatformType !== 'Linux'
  )
    throw new Error('Traffic probe source is not an online Linux SSM managed instance');
  const arn = checkpoint.resolvedValues.__NLB_ARN__;
  if (!arn?.startsWith(`arn:${plan.partition}:elasticloadbalancing:${plan.region}:${plan.accountId}:loadbalancer/net/`))
    throw new Error('Traffic probe NLB identity is unavailable');
  const loadBalancers = await run(api, plan, ['elbv2', 'describe-load-balancers', '--load-balancer-arns', arn]);
  const rows = Array.isArray(loadBalancers.LoadBalancers) ? loadBalancers.LoadBalancers.map(object) : [];
  const dns = rows[0]?.DNSName;
  if (
    rows.length !== 1 ||
    rows[0].LoadBalancerArn !== arn ||
    rows[0].Scheme !== 'internal' ||
    typeof dns !== 'string' ||
    !/^[A-Za-z0-9.-]{1,253}$/.test(dns)
  )
    throw new Error('Traffic probe NLB endpoint differs from the reviewed deployment');
  const file = 'aws-traffic-probe.json';
  let state = await optional(storage, file);
  if (state) {
    const attempts = state.attempts;
    if (
      state.schemaVersion !== 1 ||
      state.engine !== plan.engine ||
      state.planSha256 !== plan.planSha256 ||
      state.sourceInstanceId !== probe.sourceInstanceId ||
      !['ready', 'submitted', 'complete'].includes(String(state.phase)) ||
      (state.phase !== 'ready' && (typeof state.commandId !== 'string' || !COMMAND_ID.test(state.commandId))) ||
      (attempts !== undefined &&
        (!Array.isArray(attempts) ||
          attempts.some(
            (attempt) =>
              !attempt ||
              typeof attempt !== 'object' ||
              !COMMAND_ID.test(String((attempt as Json).commandId)) ||
              typeof (attempt as Json).observedAt !== 'string' ||
              !Number.isFinite(Date.parse(String((attempt as Json).observedAt))),
          )))
    )
      throw new Error('Traffic probe checkpoint differs from the owning plan');
    if (state.phase === 'complete') {
      const evidence = object(state.evidence);
      if (
        evidence.status !== 'healthy' ||
        evidence.source !== 'aws:ssm:get-command-invocation' ||
        evidence.sourceInstanceId !== probe.sourceInstanceId ||
        evidence.commandId !== state.commandId ||
        evidence.httpStatus !== probe.expectedStatus ||
        evidence.bodySha256 !== probe.expectedBodySha256 ||
        evidence.expectedStatus !== probe.expectedStatus ||
        evidence.expectedBodySha256 !== probe.expectedBodySha256 ||
        typeof evidence.observedAt !== 'string' ||
        !Number.isFinite(Date.parse(evidence.observedAt)) ||
        !verifiedPeer(plan, evidence.remoteAddress) ||
        !validSampleTimes(evidence, Date.now(), false)
      )
        throw new Error('Persisted traffic evidence differs from the owning plan');
      if (evidence.loadBalancerArn !== arn || evidence.endpointDns !== dns)
        throw new Error('Persisted traffic endpoint differs from the current deployment');
      if (validSampleTimes(evidence, Date.now(), true)) return evidence;
      const receipts = Array.isArray(state.receipts) ? state.receipts.map(object) : [];
      state = {
        ...state,
        phase: 'ready',
        commandId: undefined,
        evidence: undefined,
        receipts: [...receipts, evidence].slice(-40),
      };
      await storage.write(file, state);
    }
  } else {
    state = {
      schemaVersion: 1,
      engine: plan.engine,
      planSha256: plan.planSha256,
      sourceInstanceId: probe.sourceInstanceId,
      phase: 'ready',
    };
    await storage.write(file, state);
  }
  let commandId = state.commandId;
  if (state.phase === 'ready') {
    const body = `${probe.expectedBodySha256}`;
    const command =
      `body=$(mktemp); trap 'rm -f "$body"' EXIT; ` +
      `code=$(curl --noproxy '*' --silent --show-error --max-time 15 --output "$body" --write-out '%{http_code} %{remote_ip}' ` +
      `--header 'Host: ${plan.intent.ingress.listener.domain}' ` +
      `'http://${dns}:${plan.intent.ingress.port}${probe.path}'); ` +
      `digest=$(sha256sum "$body" | awk '{print $1}'); printf '%s %s\n' "$code" "$digest"; ` +
      `[ "\${code%% *}" = "${probe.expectedStatus}" ] && [ "$digest" = "${body}" ]`;
    const submitted = await run(api, plan, [
      'ssm',
      'send-command',
      '--instance-ids',
      probe.sourceInstanceId,
      '--document-name',
      'AWS-RunShellScript',
      '--document-version',
      '1',
      '--timeout-seconds',
      '30',
      '--comment',
      `xcsh-ce-${plan.planId}`,
      '--parameters',
      JSON.stringify({ commands: [command], executionTimeout: ['30'] }),
    ]);
    commandId = object(submitted.Command).CommandId;
    if (typeof commandId !== 'string' || !COMMAND_ID.test(commandId))
      throw new Error('Traffic probe command identity is unavailable');
    state = { ...state, phase: 'submitted', commandId };
    await storage.write(file, state);
  }
  if (typeof commandId !== 'string') throw new Error('Traffic probe command identity is unavailable');
  const deadline = Date.now() + 45_000;
  while (true) {
    signal?.throwIfAborted();
    let invocation: Json;
    try {
      invocation = await run(api, plan, [
        'ssm',
        'get-command-invocation',
        '--command-id',
        commandId,
        '--instance-id',
        probe.sourceInstanceId,
      ]);
    } catch (error) {
      if (!(error instanceof AwsNotFoundError) || Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      continue;
    }
    if (['Pending', 'InProgress', 'Delayed'].includes(String(invocation.Status))) {
      if (Date.now() >= deadline) throw new Error('Traffic probe has not converged; resume the saved checkpoint');
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      continue;
    }
    const output = invocation.StandardOutputContent;
    const errorOutput = invocation.StandardErrorContent;
    if (
      invocation.CommandId !== commandId ||
      invocation.InstanceId !== probe.sourceInstanceId ||
      invocation.DocumentName !== 'AWS-RunShellScript' ||
      invocation.DocumentVersion !== '1' ||
      typeof output !== 'string' ||
      typeof errorOutput !== 'string' ||
      typeof invocation.Status !== 'string' ||
      typeof invocation.ResponseCode !== 'number'
    )
      throw new Error('Traffic probe response is malformed');
    const match = /^(\d{3}) ([0-9.]+) ([a-f0-9]{64})\n?$/.exec(output);
    const evidence = {
      status:
        invocation.Status === 'Success' && invocation.ResponseCode === 0 && errorOutput === '' && match
          ? 'healthy'
          : 'degraded',
      source: 'aws:ssm:get-command-invocation',
      loadBalancerArn: arn,
      endpointDns: dns,
      sourceInstanceId: probe.sourceInstanceId,
      commandId,
      httpStatus: match ? Number(match[1]) : undefined,
      remoteAddress: match?.[2],
      bodySha256: match?.[3],
      expectedStatus: probe.expectedStatus,
      expectedBodySha256: probe.expectedBodySha256,
      startedAt: invocation.ExecutionStartDateTime,
      executedAt: invocation.ExecutionEndDateTime,
      observedAt: new Date().toISOString(),
    };
    if (
      !verifiedPeer(plan, evidence.remoteAddress) ||
      !validSampleTimes(evidence, Date.now(), true) ||
      evidence.status !== 'healthy' ||
      evidence.httpStatus !== probe.expectedStatus ||
      evidence.bodySha256 !== probe.expectedBodySha256
    ) {
      const attempts = Array.isArray(state.attempts) ? state.attempts.map(object) : [];
      if (!attempts.some((attempt) => attempt.commandId === commandId))
        attempts.push({
          commandId,
          status: invocation.Status,
          responseCode: invocation.ResponseCode,
          httpStatus: evidence.httpStatus,
          bodySha256: evidence.bodySha256,
          stderrPresent: errorOutput.length > 0,
          observedAt: evidence.observedAt,
        });
      state = { ...state, phase: 'ready', commandId: undefined, attempts: attempts.slice(-40) };
      await storage.write(file, state);
      throw new Error('Traffic probe has not converged; retry the saved checkpoint');
    }
    await storage.write(file, { ...state, phase: 'complete', evidence });
    return evidence;
  }
}

/** Read-only receipt inspection. Receipt age describes this HTTP test, never a CE publisher heartbeat. */
export async function readAwsTrafficProbeEvidence(
  plan: AwsCePlan,
  storage: CeDeploymentStore,
  values?: Record<string, string>,
) {
  const unknown = (reason: string) => ({ status: 'unknown' as const, reason, observedAt: new Date().toISOString() });
  if (plan.intent.ingress?.mode !== 'nlb') return unknown('traffic-probe-not-configured');
  const probe = plan.intent.ingress.probe;
  try {
    await storage.verify();
    if (!storeOwnedByPlan(plan, storage)) return unknown('traffic-store-owner-unverified');
    const state = await optional(storage, 'aws-traffic-probe.json');
    if (state?.phase !== 'complete') return unknown('traffic-receipt-unavailable');
    const evidence = object(state.evidence),
      at = Date.parse(String(evidence.observedAt));
    if (
      !verifiedPeer(plan, evidence.remoteAddress) ||
      !validSampleTimes(evidence, Date.now(), true) ||
      typeof evidence.loadBalancerArn !== 'string' ||
      !evidence.loadBalancerArn.startsWith(
        `arn:${plan.partition ?? 'aws'}:elasticloadbalancing:${plan.region}:${plan.accountId}:loadbalancer/net/`,
      ) ||
      evidence.loadBalancerArn !== values?.__NLB_ARN__ ||
      typeof evidence.endpointDns !== 'string' ||
      !/^[A-Za-z0-9.-]{1,253}$/.test(evidence.endpointDns) ||
      state.schemaVersion !== 1 ||
      state.engine !== plan.engine ||
      state.planSha256 !== plan.planSha256 ||
      state.sourceInstanceId !== probe.sourceInstanceId ||
      !COMMAND_ID.test(String(state.commandId)) ||
      evidence.status !== 'healthy' ||
      evidence.source !== 'aws:ssm:get-command-invocation' ||
      evidence.sourceInstanceId !== probe.sourceInstanceId ||
      evidence.commandId !== state.commandId ||
      evidence.httpStatus !== probe.expectedStatus ||
      evidence.expectedStatus !== probe.expectedStatus ||
      evidence.bodySha256 !== probe.expectedBodySha256 ||
      evidence.expectedBodySha256 !== probe.expectedBodySha256 ||
      typeof evidence.observedAt !== 'string' ||
      !Number.isFinite(at) ||
      at > Date.now() ||
      Date.now() - at > 30000 ||
      !plan.intent.brownfield.resourceIds.includes(probe.sourceInstanceId) ||
      !plan.ownershipInventory.some(
        (row) => row.resourceId === probe.sourceInstanceId && !row.owned && row.action === 'modify-approved',
      )
    )
      return unknown('traffic-receipt-unverified');
    return { ...evidence, status: 'healthy' as const, receiptOnly: true as const };
  } catch {
    return unknown('traffic-receipt-unavailable');
  }
}
