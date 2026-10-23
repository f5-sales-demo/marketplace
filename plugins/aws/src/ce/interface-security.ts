import type { AwsCeIntent } from './types';
export function interfaceSecurityGroups(intent: AwsCeIntent, index: number): string[] {
  const groups =
    intent.interfaces[index]?.securityGroupNames ??
    (intent.securityGroups.length === 1 ? [intent.securityGroups[0].name] : undefined);
  if (
    !groups?.length ||
    new Set(groups).size !== groups.length ||
    groups.some((name) => !intent.securityGroups.some((group) => group.name === name))
  )
    throw new Error(
      'Each interface requires explicit known security groups when multiple role-specific groups are defined',
    );
  return [...groups].sort();
}
