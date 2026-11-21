import type { AwsCeIntent } from './types';
export function nlbSettings(intent: AwsCeIntent) {
  const ingress = intent.ingress?.mode === 'nlb' ? intent.ingress : undefined;
  const targetInterfaceIndex = ingress?.targetInterfaceIndex ?? 1;
  const healthCheck = ingress?.healthCheck ?? {
    protocol: 'TCP' as const,
    port: 'traffic-port' as const,
    intervalSeconds: 30,
    timeoutSeconds: 10,
    healthyThreshold: 3,
    unhealthyThreshold: 3,
  };
  if (targetInterfaceIndex !== 1 || intent.interfaces[targetInterfaceIndex]?.role !== 'sli')
    throw new Error('NLB requires the explicitly observed SLI target interface');
  if (
    !['TCP', 'HTTP', 'HTTPS'].includes(healthCheck.protocol) ||
    (healthCheck.port !== 'traffic-port' &&
      (!Number.isInteger(healthCheck.port) || healthCheck.port < 1 || healthCheck.port > 65535)) ||
    !Number.isInteger(healthCheck.intervalSeconds) ||
    healthCheck.intervalSeconds < 5 ||
    healthCheck.intervalSeconds > 300 ||
    !Number.isInteger(healthCheck.timeoutSeconds) ||
    healthCheck.timeoutSeconds < 2 ||
    healthCheck.timeoutSeconds > 120 ||
    [healthCheck.healthyThreshold, healthCheck.unhealthyThreshold].some(
      (value) => !Number.isInteger(value) || value < 2 || value > 10,
    ) ||
    (healthCheck.protocol === 'TCP' && healthCheck.path !== undefined) ||
    (healthCheck.protocol !== 'TCP' && !/^\/[A-Za-z0-9._~/-]{0,512}$/.test(healthCheck.path ?? ''))
  )
    throw new Error('NLB health-check configuration is invalid');
  return { targetInterfaceIndex, healthCheck };
}
