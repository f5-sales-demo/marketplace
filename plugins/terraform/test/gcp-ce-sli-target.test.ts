/** Original issuers with explicit offline cloud observations; no live acceptance. */
import { expect, test } from 'bun:test';
import * as target from '../src/gcp-ce-sli-target';
import * as peer from '../src/gcp-observer-ssh-peer';
import * as ce from '../src/gcp-vm-evidence';
import { withEarlyVmFixture } from './fixtures/early-gcp-vm.fixture';

test('CE scan target joins the reviewed SLI role to the original numeric VM and rejects copied contexts', async () => {
  await withEarlyVmFixture(async (input) => {
    const vm = await ce.collectOriginalEarlyGcpVmEvidence(input);
    const ref = await target.openOriginalGcpCeSliTarget(vm, input.callback);
    const original = await target.readOriginalGcpCeSliTarget(ref);
    expect(original.address).toBe('10.2.0.2');
    expect(original.interfaceIndex).toBe(1);
    expect(original.role).toBe('sli');
    expect(original.instanceId).toBe(String(input.state.operation.targetId));
    expect(original.callback).toBe(input.callback);
    expect(original.sshTrustQualified).toBe(false);
    await expect(target.readOriginalGcpCeSliTarget({ ...ref })).rejects.toThrow('Original');
    await expect(target.assertOriginalGcpCeSliTargetContext(ref, { ...input.callback })).rejects.toThrow('Original');
    await target.assertOriginalGcpCeSliTargetContext(ref, input.callback);
    await expect(target.openOriginalGcpCeSliTarget({ ...vm }, input.callback)).rejects.toThrow('Original');
    await expect(target.openOriginalGcpCeSliTarget(vm, { ...input.callback })).rejects.toThrow('Original');
    // A success-shaped caller receipt cannot authorize an observer-assisted scan.
    await expect(
      target.bindOriginalGcpCeObserverScanContext(
        ref,
        {
          schemaVersion: 1,
          kind: 'original-verified-gcp-observer-peer-reference',
          instanceId: '123456',
          challengeMatched: true,
        },
        input.callback,
      ),
    ).rejects.toThrow('Original verified observer');
    await target.readOriginalGcpCeSliTarget(ref);
    const nics = input.state.vm.networkInterfaces as Array<{ networkIP: string }>;
    const address = nics[1].networkIP;
    nics[1].networkIP = '10.2.0.9';
    await expect(target.readOriginalGcpCeSliTarget(ref)).rejects.toThrow();
    nics[1].networkIP = address;
    await expect(target.readOriginalGcpCeSliTarget(ref)).rejects.toThrow('retired');
  });
}, 60000);

test('final CE target uses the reserved original final callback and refuses an early source', async () => {
  let early: unknown;
  await withEarlyVmFixture(
    async (input) => {
      early = await ce.collectOriginalEarlyGcpVmEvidence(input);
    },
    async (final) => {
      const vm = await ce.handoffOriginalEarlyGcpVmEvidence(early, final);
      const ref = await target.openOriginalGcpCeSliTarget(vm, final.callback);
      const original = await target.readOriginalGcpCeSliTarget(ref);
      expect(original.address).toBe('10.2.0.2');
      expect(original.callback).toBe(final.callback);
      await expect(target.openOriginalGcpCeSliTarget(early, final.callback)).rejects.toThrow('Original');
      await expect(target.assertOriginalGcpCeSliTargetContext(ref, { ...final.callback })).rejects.toThrow('Original');
      await target.readOriginalGcpCeSliTarget(ref);
    },
  );
}, 60000);

test('invented observer peer context cannot release a command or borrow another callback', async () => {
  await expect(
    peer.assertOriginalVerifiedGcpObserverPeerContext(
      {
        schemaVersion: 1,
        kind: 'original-verified-gcp-observer-peer-reference',
        challengeMatched: true,
      },
      {} as never,
    ),
  ).rejects.toThrow('Original verified observer');
});
