import type { AzExecApi } from '../az/exec';
import type { AzureCeAction, AzureCePlan } from './types';

export function shutdownProperties(plan: AzureCePlan, node: number, deadline: string) {
  const at = Date.parse(deadline);
  if (!Number.isFinite(at) || at <= Date.now() || at > Date.now() + 8 * 3600_000)
    throw new Error('Shutdown deadline is expired or exceeds eight hours');
  const date = new Date(at);
  return {
    status: 'Enabled',
    taskType: 'ComputeVmShutdownTask',
    dailyRecurrence: {
      time: `${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}`,
    },
    timeZoneId: 'UTC',
    notificationSettings: { status: 'Disabled' },
    targetResourceId: `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${plan.deploymentName}-${node}`,
  };
}

export function shutdownResourceBody(plan: AzureCePlan, node: number, deadline: string) {
  return {
    location: plan.region,
    tags: { ...plan.ownershipTagTemplate, 'xcsh-plan-sha256': plan.planSha256 },
    properties: shutdownProperties(plan, node, deadline),
  };
}

export async function verifyShutdown(plan: AzureCePlan, action: AzureCeAction, deadline: string, api: AzExecApi) {
  const result = await api.exec('az', [
    'resource',
    'show',
    '--ids',
    action.resourceId!,
    '--api-version',
    '2018-09-15',
    '--subscription',
    plan.subscription.id,
    '--output',
    'json',
  ]);
  if (result.exitCode !== 0) throw new Error('Cloud shutdown protection could not be verified');
  let observed: any;
  try {
    observed = JSON.parse(result.stdout);
  } catch {
    throw new Error('Invalid shutdown observation');
  }
  const expected = shutdownProperties(plan, action.node!, deadline),
    properties = observed.properties;
  if (
    observed.id?.toLowerCase() !== action.resourceId?.toLowerCase() ||
    properties?.status !== 'Enabled' ||
    properties.taskType !== expected.taskType ||
    properties.targetResourceId?.toLowerCase() !== expected.targetResourceId.toLowerCase() ||
    properties.timeZoneId !== 'UTC' ||
    properties.dailyRecurrence?.time !== expected.dailyRecurrence.time ||
    observed.tags?.['xcsh-deployment-id'] !== plan.deploymentName ||
    observed.tags?.['xcsh-plan-sha256'] !== plan.planSha256
  )
    throw new Error('Shutdown protection identity or deadline differs');
}
