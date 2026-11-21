import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { collectAwsNetworkHealth } from './network-health';
import { siteBindings } from './topology';
import type { AwsCeCheckpoint, AwsCePlan } from './types';

/** Collect new AWS evidence; a caller cannot supply a session-count assertion. */
export async function collectAwsFailoverBgpHealth(
  plan: AwsCePlan,
  checkpoint: AwsCeCheckpoint,
  nodeIndex: number,
  phase: 'outage' | 'recovered',
  api: AwsExecApi,
  signal?: AbortSignal,
) {
  verifyAwsCePlan(plan);
  const site = siteBindings(plan).find(({ site }) => site.nodeIndexes.includes(nodeIndex))?.site;
  if (
    !site ||
    !['outage', 'recovered'].includes(phase) ||
    checkpoint.schemaVersion !== plan.schemaVersion ||
    checkpoint.engine !== plan.engine ||
    checkpoint.planId !== plan.planId ||
    checkpoint.planSha256 !== plan.planSha256
  )
    throw new Error('Failover observation node, phase or checkpoint binding differs');
  const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  const selected = actions.filter((action) => action.node === nodeIndex);
  if (!selected.length) throw new Error('Failover node has no planned Connect peers');
  const health = await collectAwsNetworkHealth('bgp', plan, checkpoint, api, signal);
  const selectedPeerIds = selected.map((action) => checkpoint.resolvedValues[action.capture?.placeholder ?? '']);
  const expectedSessions = actions.length * 2;
  const expectedEstablishedSessions = expectedSessions - (phase === 'outage' ? selected.length * 2 : 0);
  const binding = {
    planId: plan.planId,
    planSha256: plan.planSha256,
    nodeIndex,
    nodeName: `${plan.deploymentName}-${nodeIndex}`,
    selectedSiteName: site.name,
    phase,
    expectedEstablishedSessions,
  };
  if (
    !['healthy', 'degraded'].includes(String(health.status)) ||
    health.expectedSessions !== expectedSessions ||
    !Array.isArray(health.sessions)
  )
    return { ...health, ...binding, acceptance: 'unknown' as const };
  const exact =
    health.establishedSessions === expectedEstablishedSessions &&
    health.sessions.length === expectedSessions &&
    health.sessions.every(
      (session) => session.status === (phase === 'outage' && selectedPeerIds.includes(session.peerId) ? 'down' : 'up'),
    );
  return { ...health, ...binding, acceptance: exact ? ('passed' as const) : ('pending' as const) };
}
