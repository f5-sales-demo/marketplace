/** Source qualification: reviewed teardown over original durable files and synthetic provider effects. */
import { expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readOwnedInstalledInput } from '../../../terraform/src/installed-runtime';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { persistGcpCaptureCleanupReview, resumeGcpCaptureCleanupOrigin } from '../../src/ce/capture-cleanup-durable';
import { fingerprint } from '../../src/ce/discovery';
import { applyPublicTerraformTeardown, planPublicTerraformTeardown } from '../../src/ce/terraform-public-teardown';
import type { GcpTerraformTeardownRuntime } from '../../src/ce/terraform-teardown';
import { capturedTeardownSourceFixture } from './captured-teardown-origin.test';
import { terraformHaProfileFixture } from './terraform-ha-profile.test';

test.each([false, true])(
  'captured original source uses reviewed teardown and recovery with published image drift %s',
  async (publishedImageChanged) => {
    const f = await capturedTeardownSourceFixture(),
      origin = await f.open();
    const { boundary } = terraformHaProfileFixture();
    if (publishedImageChanged) {
      const profile = boundary.terraformHaLifecycle;
      const health = boundary.operationalHealthContract;
      const expected = boundary.operationalHealthExpected;
      if (!profile || !health || !expected) throw new Error('Qualified published fixture required');
      profile.imageIdentitySha256 = fingerprint({ currentPublishedImage: true });
      health.qualificationFingerprint = fingerprint(health.qualification);
      expected.qualificationFingerprint = health.qualificationFingerprint;
    }

    const policy = {
      identity: 'f5xc-ce-automation-policy/v2' as const,
      observedAt: new Date().toISOString(),
      normalizedSha256: fingerprint('example-policy'),
      url: 'https://example.test/policy',
    };
    const files = new Map<string, unknown>();
    const store = {
      directory: f.directory,
      read: async (name: string) => {
        if (!files.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        return structuredClone(files.get(name));
      },
      write: async (name: string, value: unknown) => {
        files.set(name, structuredClone(value));
      },
    };
    let receipt: PlanReceipt | undefined,
      phase: 'planned' | 'applying' | 'applied' = 'planned',
      applies = 0,
      partial = true;
    const state = async () => ({
      sha256: (await readOwnedInstalledInput(join(f.directory, 'terraform.tfstate'))).binding.sha256,
      lineage: f.state.lineage,
      serial: f.state.serial,
    });
    const checkpoint = async () =>
      writeFile(join(f.directory, 'plan-receipt.json'), JSON.stringify({ state: phase, receipt }), { mode: 0o600 });
    const session = {
      readStateIdentity: state,
      planDestroy: async () => {
        const remaining = f.addresses.filter((address) => f.fields[address] !== null),
          binary = Buffer.from(JSON.stringify({ remaining, state: await state() }));
        await writeFile(join(f.directory, 'saved.tfplan'), binary, { mode: 0o600 });
        receipt = {
          ...f.receipt,
          operation: 'destroy',
          noChanges: remaining.length === 0,
          planSha256: (await readOwnedInstalledInput(join(f.directory, 'saved.tfplan'))).binding.sha256,
          changes: remaining.map((address) => ({ address, type: address.split('.')[0], actions: ['delete'] })),
        };
        phase = 'planned';
        await checkpoint();
        return receipt;
      },
      readPlannedResourceFields: async () => structuredClone(f.fields),
      readApplyCheckpoint: async (expected: PlanReceipt) => {
        if (fingerprint(expected) !== fingerprint(receipt)) throw new Error('wrong binary');
        return { schemaVersion: 1, planSha256: expected.planSha256, state: phase };
      },
      assertApplyReady: () => origin.recovery.assertIndependentClosure(),
      apply: async () => {
        applies++;
        phase = 'applying';
        await checkpoint();
        const remaining = f.addresses.filter((address) => f.fields[address] !== null),
          removed = partial ? remaining.slice(0, 1) : remaining;
        for (const address of removed) {
          f.fields[address] = null;
          const index = f.addresses.indexOf(address);
          if (index < f.scope.length) f.live.delete(f.scope[index].selfLink);
        }
        f.state.resources = f.state.resources.filter((row) => !removed.includes(`${row.type}.${row.name}`));
        f.state.serial++;
        await f.refreshState();
        if (partial) {
          partial = false;
          throw new Error('example-interruption');
        }
        phase = 'applied';
        await checkpoint();
      },
      reconcileApplyFromEvidence: async () => {
        phase = 'applied';
        await checkpoint();
      },
    };
    const runtime = {
      store,
      session,
      api: f.api,
      observePlatform: f.runtime.observePlatform,
      environment: f.inspection.environment,
      capturedTeardownOrigin: origin,
    } as unknown as GcpTerraformTeardownRuntime;
    const originalFailed = await readFile(join(f.lock, 'capture-unresolved.json'));
    try {
      const first = await planPublicTerraformTeardown(runtime, f.i, boundary, policy);
      expect(first.originalAuthorization.kind).toBe('captured-source-qualification');
      expect(first.remaining).toHaveLength(21);
      const firstRecord = await persistGcpCaptureCleanupReview({
        ...f.common,
        reference: f.persisted.reference,
        review: first,
      });
      const interrupted = await applyPublicTerraformTeardown(runtime, f.i, boundary, policy, first.planHash);
      expect(interrupted.state).toBe('reconciliation-required');
      expect(applies).toBe(1);
      await applyPublicTerraformTeardown(runtime, f.i, boundary, policy, first.planHash);
      expect(applies).toBe(1);
      const resumed = await resumeGcpCaptureCleanupOrigin({
        ...f.common,
        reference: f.persisted.reference,
        reviewReference: firstRecord.reference,
      });
      expect(resumed.mode).toBe('partial-replan-required');
      resumed.close();
      const second = await planPublicTerraformTeardown(runtime, f.i, boundary, policy);
      expect(second.remaining).toHaveLength(20);
      const secondRecord = await persistGcpCaptureCleanupReview({
        ...f.common,
        reference: f.persisted.reference,
        review: second,
      });
      const done = await applyPublicTerraformTeardown(runtime, f.i, boundary, policy, second.planHash);
      expect(done.state).toBe('done');
      expect(applies).toBe(2);
      for (let round = 0; round < 2; round++) {
        const recovered = await resumeGcpCaptureCleanupOrigin({
          ...f.common,
          reference: f.persisted.reference,
          reviewReference: secondRecord.reference,
        });
        expect(recovered.mode).toBe('completed-readonly');
        recovered.close();
        await applyPublicTerraformTeardown(runtime, f.i, boundary, policy, second.planHash);
      }
      expect(applies).toBe(2);
      expect(files.has('gcp-tf-deploy-original-authorization.json')).toBe(false);
      expect(files.has('gcp-tf-public-deployment.json')).toBe(false);
      expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toEqual(originalFailed);
    } finally {
      origin.close();
    }
  },
  120000,
);
