import type { AwsCeResourceObservation } from './types';

/** EC2 retains terminated instance metadata; verified terminal state is distinct from absence. */
export function isAwsTerminatedOwnedInstance(resource: AwsCeResourceObservation, accountId: string): boolean {
  if (!resource.exists || !resource.owned || !resource.id.startsWith('i-')) return false;
  const reservations = resource.state.Reservations;
  if (!Array.isArray(reservations) || reservations.length !== 1) return false;
  const reservation = reservations[0];
  if (
    !reservation ||
    typeof reservation !== 'object' ||
    reservation.OwnerId !== accountId ||
    !Array.isArray(reservation.Instances) ||
    reservation.Instances.length !== 1
  )
    return false;
  const instance = reservation.Instances[0];
  return Boolean(
    instance &&
      typeof instance === 'object' &&
      instance.InstanceId === resource.id &&
      instance.State?.Name === 'terminated',
  );
}
