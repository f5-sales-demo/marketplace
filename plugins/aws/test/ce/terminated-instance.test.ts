import { expect, test } from 'bun:test';
import { isAwsTerminatedOwnedInstance } from '../../src/ce/terminated-instance';
import type { AwsCeResourceObservation } from '../../src/ce/types';

function fixture(): AwsCeResourceObservation {
  return {
    id: 'i-12345678',
    region: 'us-east-1',
    owned: true,
    exists: true,
    tags: { 'xcsh-deployment-id': 'fixture' },
    state: {
      Reservations: [
        { OwnerId: '123456789012', Instances: [{ InstanceId: 'i-12345678', State: { Name: 'terminated' } }] },
      ],
    },
  };
}
test('verified terminal metadata retains existence and tags', () => {
  const resource = fixture(),
    before = structuredClone(resource);
  expect(isAwsTerminatedOwnedInstance(resource, '123456789012')).toBe(true);
  expect(resource).toEqual(before);
});
for (const mode of ['foreign-owner', 'foreign-id', 'active', 'missing', 'duplicate', 'unowned'] as const)
  test(`terminal authority refuses ${mode}`, () => {
    const resource = fixture();
    const reservations = resource.state.Reservations as Array<{
      OwnerId: string;
      Instances: Array<{ InstanceId: string; State: { Name?: string } }>;
    }>;
    if (mode === 'foreign-owner') reservations[0].OwnerId = '999999999999';
    if (mode === 'foreign-id') reservations[0].Instances[0].InstanceId = 'i-ffffffff';
    if (mode === 'active') reservations[0].Instances[0].State.Name = 'shutting-down';
    if (mode === 'missing') reservations[0].Instances[0].State = {};
    if (mode === 'duplicate') reservations[0].Instances.push(reservations[0].Instances[0]);
    if (mode === 'unowned') resource.owned = false;
    expect(isAwsTerminatedOwnedInstance(resource, '123456789012')).toBe(false);
  });
