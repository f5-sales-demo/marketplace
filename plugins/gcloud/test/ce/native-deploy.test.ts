import { expect, it } from 'bun:test';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { translateGcpNativeCompute } from '../../src/ce/compute-plan';
import { applyGcpNativeDeployment } from '../../src/ce/native-deploy';
import type { GcpQualificationGates } from '../../src/ce/qualification-gates';
import { intent } from './fixtures';

it('native orchestration rejects unavailable contract before storage or cloud mutations', async () => {
  const i = intent();
  i.routing.destinationCidrs = [];
  const p = translateGcpNativeCompute(i);
  let calls = 0;
  const platform = {
    storage: async () => {
      calls++;
      throw new Error('must not open');
    },
  } as unknown as CePlatformService;
  const gates = {
    schemaVersion: 1,
    project: i.project,
    region: i.region,
    engine: 'native',
    approvalPlanHash: p.sha256,
    apiContract: { publication: 'immutable-release', gcpMapping: 'unavailable', sha256: `sha256:${'a'.repeat(64)}` },
  } as GcpQualificationGates;
  await expect(
    applyGcpNativeDeployment(
      platform,
      {
        exec: async () => {
          calls++;
          throw new Error('must not run');
        },
      },
      i,
      p.sha256,
      gates,
    ),
  ).rejects.toThrow('qualified');
  expect(calls).toBe(0);
});
