import { expect, test } from 'bun:test';
import { collectOriginalEarlyGcpVmEvidence, readOriginalEarlyGcpVmEvidence } from '../src/gcp-vm-evidence';
import { withEarlyVmFixture } from './fixtures/early-gcp-vm.fixture';

for (const change of [
  { canIpForward: false },
  { machineType: 'projects/example-project/zones/northamerica-northeast1-a/machineTypes/e2-standard-4' },
])
  test(`independent CE VM body must preserve the reviewed machine and forwarding fields: ${Object.keys(change)[0]}`, async () => {
    await withEarlyVmFixture(async (input) => {
      input.state.vm = { ...input.state.vm, ...change };
      await expect(collectOriginalEarlyGcpVmEvidence(input)).rejects.toThrow();
    });
  }, 60000);

for (const change of [
  { canIpForward: false },
  { machineType: 'projects/example-project/zones/northamerica-northeast1-a/machineTypes/e2-standard-4' },
])
  test(`an original admitted VM cannot change its reviewed fields during observation: ${Object.keys(change)[0]}`, async () => {
    await withEarlyVmFixture(async (input) => {
      const packet = await collectOriginalEarlyGcpVmEvidence(input);
      if (!packet) throw new Error('Original VM required');
      const vm = input.state.vm;
      input.state.vm = { ...vm, ...change };
      await expect(readOriginalEarlyGcpVmEvidence(packet)).rejects.toThrow();
      input.state.vm = vm;
      await expect(readOriginalEarlyGcpVmEvidence(packet)).rejects.toThrow('retired');
    });
  }, 60000);
