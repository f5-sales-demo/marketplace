import { expect } from 'bun:test';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalSha256 } from '../../src/ce/canonical';
import { azureTerraformNetworkPowerDeployment } from '../../src/ce/terraform-network-power';
import { AzureTerraformPowerCancellationInterrupted } from '../../src/ce/terraform-network-power-cancellation';
import { test } from './owned-fixture-test';

import { terraformNetworkPowerCancellationFixture as fixture } from './terraform-network-power-cancellation-fixture';

for (const [ha, node, operation, published] of [
  [false, 1, 'deallocate', false],
  [false, 1, 'start', true],
  [true, 1, 'deallocate', true],
  [true, 3, 'start', false],
] as const)
  test(`actual ${ha ? 'HA' : 'single'} node${node} ${operation} ${published ? 'published' : 'unpublished'} receipt cancels once and retries exact provenance`, async () => {
    const f = await fixture(ha, node, operation, published),
      beforeCommands = [...f.commands];
    const first = await f.runCancellation();
    expect(first.localCancellationQualified).toBe(true);
    expect(first.runnerRetirementQualified).toBe(false);
    expect(first.applicationOutcomeQualified).toBe(false);
    expect(first.parentRetirementQualified).toBe(false);
    const name = await f.packetName();
    if (!name) throw Error('cancellation packet missing');
    const bytes = await readFile(join(f.store.directory, name));
    const packet = (await f.store.read(name)) as Record<string, unknown>;
    expect(packet.status).toBe('cancelled');
    expect(packet.receipt).toEqual(f.receipt);
    expect((await f.runCancellation()).cancellationPacketSha256).toBe(first.cancellationPacketSha256);
    expect(await readFile(join(f.store.directory, name))).toEqual(bytes);
    expect(f.commands.slice(beforeCommands.length).every((command) => ['version', 'show'].includes(command))).toBe(
      true,
    );
    expect(f.commands.filter((command) => command === 'plan')).toHaveLength(1);
    expect(f.commands).not.toContain('apply');
    expect(JSON.stringify(first)).not.toContain('synthetic-original-unsubmitted-power-plan');
  }, 180000);
for (const boundary of [
  'preparing-before-write',
  'preparing-after-write',
  'cancel-response',
  'cancelled-before-write',
  'cancelled-after-write',
])
  test(`actual lost ${boundary} recovers original receipt without replan or apply`, async () => {
    const f = await fixture(),
      originalWrite = f.store.write.bind(f.store),
      originalOpen = f.cancellationTerraform.open;
    let armed = true;
    f.store.write = async (name, value) => {
      const status = (value as Record<string, unknown>).status;
      if (
        armed &&
        name.startsWith('azure-power-cancel-') &&
        ((boundary.startsWith('preparing') && status === 'preparing') ||
          (boundary.startsWith('cancelled') && status === 'cancelled'))
      ) {
        armed = false;
        if (boundary.endsWith('after-write')) await originalWrite(name, value);
        throw Error('synthetic lost cancellation packet write');
      }
      await originalWrite(name, value);
    };
    f.cancellationTerraform.open = async (...args) => {
      const session = await originalOpen(...args),
        actualCancel = session.cancelUnsubmittedPlan;
      if (!actualCancel) throw Error('actual cancellation service missing');
      session.cancelUnsubmittedPlan = async (...request) => {
        const result = await actualCancel(...request);
        if (armed && boundary === 'cancel-response') {
          armed = false;
          throw Error('synthetic lost original cancel response');
        }
        return result;
      };
      return session;
    };
    await expect(f.runCancellation()).rejects.toThrow('synthetic lost');
    const firstPlanCount = f.commands.filter((value) => value === 'plan').length;
    const result = await f.runCancellation();
    expect(result.localCancellationQualified).toBe(true);
    expect(f.commands.filter((value) => value === 'plan')).toHaveLength(firstPlanCount);
    expect(f.commands).not.toContain('apply');
    const name = await f.packetName();
    if (!name) throw Error('cancellation packet missing');
    expect(((await f.store.read(name)) as Record<string, unknown>).receipt).toEqual(f.receipt);
  }, 60000);
for (const defect of [
  'applying',
  'applied',
  'foreign-config',
  'foreign-stage',
  'unsafe-stage',
  'orphan-stage',
  'pending-revision',
  'foreign-saved-plan',
])
  test(`actual selected cancellation rejects ${defect} before cancellation or success publication`, async () => {
    const f = await fixture();
    if (['applying', 'applied'].includes(defect))
      await writeFile(join(f.directory, 'plan-receipt.json'), JSON.stringify({ state: defect, receipt: f.receipt }), {
        mode: 0o600,
      });
    if (defect === 'foreign-config') await writeFile(join(f.directory, 'main.tf.json'), '{}', { mode: 0o600 });
    if (defect === 'foreign-stage') await mkdir(join(f.directory, '..', 'foreign'), { mode: 0o700 });
    if (defect === 'unsafe-stage') await chmod(join(f.directory, '..'), 0o755);
    if (defect === 'orphan-stage')
      await mkdir(join(f.directory, '..', '..', `network-${f.plan.planSha256.slice(0, 24)}-node-4-start`), {
        mode: 0o700,
      });
    if (defect === 'pending-revision')
      await writeFile(join(f.directory, 'configuration-transition.json'), '{}', { mode: 0o600 });
    if (defect === 'foreign-saved-plan') await writeFile(join(f.directory, 'saved.tfplan'), 'foreign', { mode: 0o600 });
    await expect(f.runCancellation()).rejects.toThrow();
    expect(await f.packetName()).toBeUndefined();
    expect(f.commands).not.toContain('apply');
  }, 60000);
for (const method of [
  'readCurrentPlanJournal',
  'readPlannedResourceFields',
  'readUnsubmittedPlanCancellation',
] as const)
  test(`ignored ${method} is abort bounded before mutation`, async () => {
    const f = await fixture(),
      originalOpen = f.cancellationTerraform.open,
      abort = new AbortController();
    let reached = false;
    f.cancellationTerraform.open = async (...args) => {
      const session = await originalOpen(...args);
      session[method] = async () => {
        reached = true;
        abort.abort(Error('synthetic reached ignored read'));
        return new Promise<never>(() => {});
      };
      return session;
    };
    await expect(f.runCancellation(abort.signal)).rejects.toThrow('ignored read');
    expect(reached).toBe(true);
    expect(f.commands).not.toContain('apply');
    await expect(readFile(join(f.store.directory, '.terraform-network-power-lock', 'claim.json'))).rejects.toThrow();
  }, 60000);
for (const method of ['write', 'cancel'] as const)
  test(`ignored ${method} mutation retains locks until actual settlement and then retries exact original provenance`, async () => {
    const f = await fixture(),
      abort = new AbortController(),
      late = Promise.withResolvers<void>();
    let reached = false;
    if (method === 'write') {
      const original = f.store.write.bind(f.store);
      let once = true;
      f.store.write = async (name, value) => {
        if (once && name.startsWith('azure-power-cancel-')) {
          once = false;
          reached = true;
          abort.abort(Error('synthetic ignored write'));
          await late.promise;
        }
        await original(name, value);
      };
    } else {
      const original = f.cancellationTerraform.open;
      let once = true;
      f.cancellationTerraform.open = async (...args) => {
        const session = await original(...args),
          actual = session.cancelUnsubmittedPlan;
        if (!actual) throw Error('actual cancellation missing');
        session.cancelUnsubmittedPlan = async (...request) => {
          if (once) {
            once = false;
            reached = true;
            abort.abort(Error('synthetic ignored cancel'));
            await late.promise;
          }
          return actual(...request);
        };
        return session;
      };
    }
    let caught: unknown;
    try {
      await f.runCancellation(abort.signal);
    } catch (error) {
      caught = error;
    }
    expect(reached).toBe(true);
    expect(caught).toBeInstanceOf(AzureTerraformPowerCancellationInterrupted);
    if (!(caught instanceof AzureTerraformPowerCancellationInterrupted))
      throw Error('pending mutation contract missing');
    expect(await readFile(join(f.store.directory, '.terraform-network-power-lock', 'claim.json'))).toBeTruthy();
    expect(await readFile(join(f.store.directory, '.terraform-network-driver-lock', 'claim.json'))).toBeTruthy();
    late.resolve();
    const settled = await caught.completion;
    expect(settled.mutationSettlements).toEqual(['fulfilled']);
    expect(settled.locksReleased).toBe(true);
    expect(settled.failures).toEqual([]);
    const name = await f.packetName();
    if (!name) throw Error('preparing packet missing');
    expect(((await f.store.read(name)) as Record<string, unknown>).status).toBe('preparing');
    expect((await f.runCancellation()).localCancellationQualified).toBe(true);
    expect(f.commands.filter((value) => value === 'plan')).toHaveLength(1);
    expect(f.commands).not.toContain('apply');
  }, 60000);
for (const defect of ['schema', 'owner', 'receipt', 'evidence', 'projection', 'graph', 'rehashed-journal'])
  test(`actual preparing packet ${defect} tampering cannot cancel or rebind original receipt`, async () => {
    const f = await fixture(),
      originalWrite = f.store.write.bind(f.store);
    let once = true;
    f.store.write = async (name, value) => {
      await originalWrite(name, value);
      if (once && name.startsWith('azure-power-cancel-')) {
        once = false;
        throw Error('synthetic preparing response lost');
      }
    };
    await expect(f.runCancellation()).rejects.toThrow('preparing response lost');
    const name = await f.packetName();
    if (!name) throw Error('preparing packet missing');
    const packet = (await f.store.read(name)) as Record<string, unknown>;
    if (defect === 'schema') packet.foreign = true;
    if (defect === 'owner') packet.owner = { ...f.store.owner, account: 'example-foreign-subscription' };
    if (defect === 'receipt') packet.receipt = { ...f.receipt, planSha256: 'a'.repeat(64) };
    if (defect === 'evidence') packet.evidenceSha256 = 'b'.repeat(64);
    if (defect === 'projection') packet.proposed = { 'azapi_resource_action.ce_network': null };
    if (defect === 'graph') packet.graphSha256 = 'c'.repeat(64);
    if (defect === 'rehashed-journal') {
      packet.originalJournalSha256 = 'd'.repeat(64);
      const { status, evidenceSha256, ...payload } = packet;
      packet.evidenceSha256 = canonicalSha256(payload);
      expect(status).toBe('preparing');
      expect(evidenceSha256).toBeTruthy();
    }
    await originalWrite(name, packet);
    await expect(f.runCancellation()).rejects.toThrow();
    expect((await f.actualRunner.readCurrentPlanJournal(f.receipt.configurationSha256)).receipt).toEqual(f.receipt);
    expect(f.commands).not.toContain('apply');
  }, 60000);
for (const defect of ['manifest', 'receipt', 'record', 'archive', 'retirement-claim', 'completion-claim'])
  test(`actual provenance ${defect} spoof rejects without publishing cancellation success`, async () => {
    const f = await fixture(),
      originalOpen = f.cancellationTerraform.open;
    f.cancellationTerraform.open = async (...args) => {
      const session = await originalOpen(...args),
        actual = session.readUnsubmittedPlanCancellation;
      if (!actual) throw Error('actual provenance missing');
      session.readUnsubmittedPlanCancellation = async (...request) => {
        const value = await actual(...request);
        if (defect === 'manifest') return { ...value, manifestSha256: 'f'.repeat(64) };
        if (defect === 'receipt') return { ...value, originalReceiptSha256: 'f'.repeat(64) };
        if (defect === 'record') return { ...value, cancellationRecordSha256: 'not-a-digest' };
        if (defect === 'archive') return { ...value, originalArchiveSha256s: ['foreign'] };
        if (defect === 'retirement-claim') return { ...value, retirementQualified: true } as unknown as typeof value;
        return { ...value, cancellationQualified: true };
      };
      return session;
    };
    await expect(f.runCancellation()).rejects.toThrow('provenance differs');
    const name = await f.packetName();
    if (!name) throw Error('original preparing packet missing');
    expect(((await f.store.read(name)) as Record<string, unknown>).status).toBe('preparing');
    expect((await f.actualRunner.readCurrentPlanJournal(f.receipt.configurationSha256)).receipt).toEqual(f.receipt);
    expect(f.commands).not.toContain('apply');
  }, 60000);
for (const changed of ['request', 'site', 'store-write', 'runner-method'])
  test(`cross-read ${changed} changes reject before cancellation`, async () => {
    const f = await fixture(),
      originalOpen = f.cancellationTerraform.open;
    f.cancellationTerraform.open = async (...args) => {
      const session = await originalOpen(...args),
        actual = session.readPlannedResourceFields;
      session.readPlannedResourceFields = async (...request) => {
        const values = await actual(...request);
        if (changed === 'request') f.plan.siteName = 'foreign-site';
        if (changed === 'site') f.site.siteUid = 'foreign-site';
        if (changed === 'store-write')
          f.store.write = async () => {
            throw Error('foreign store write');
          };
        if (changed === 'runner-method')
          session.cancelUnsubmittedPlan = async () => {
            throw Error('foreign cancel');
          };
        return values;
      };
      return session;
    };
    await expect(f.runCancellation()).rejects.toThrow();
    expect(await f.packetName()).toBeUndefined();
    expect((await f.actualRunner.readCurrentPlanJournal(f.receipt.configurationSha256)).receipt).toEqual(f.receipt);
    expect(f.commands).not.toContain('apply');
  }, 60000);
test('original cancellation that finished without an adapter preparing receipt is not reconstructed from release configuration', async () => {
  const f = await fixture(),
    before = structuredClone(f.before);
  const release = await azureTerraformNetworkPowerDeployment(f.plan, before, 1, 'deallocate', true);
  await f.actualRunner.cancelUnsubmittedPlan(
    f.receipt,
    f.receipt.configurationSha256,
    release.configuration,
    'a'.repeat(64),
  );
  await expect(f.runCancellation()).rejects.toThrow('original mutation configuration');
  expect(await f.packetName()).toBeUndefined();
  expect(f.commands).not.toContain('apply');
}, 60000);
test('missing original saved receipt remains unknown and never grants cancellation or cleanup', async () => {
  const f = await fixture();
  await rm(join(f.directory, 'saved.tfplan'));
  await rm(join(f.directory, 'plan-receipt.json'));
  await expect(f.runCancellation()).rejects.toThrow('exact unsubmitted saved mutation receipt required');
  expect(await f.packetName()).toBeUndefined();
  expect(f.commands).not.toContain('apply');
}, 60000);
for (const changed of ['scope', 'manifest'] as const)
  test(`malformed current journal ${changed} cannot create a preparing cancellation receipt`, async () => {
    const f = await fixture(),
      originalOpen = f.cancellationTerraform.open;
    f.cancellationTerraform.open = async (...args) => {
      const session = await originalOpen(...args),
        actual = session.readCurrentPlanJournal;
      if (!actual) throw Error('actual current journal missing');
      session.readCurrentPlanJournal = async (...request) => {
        const value = await actual(...request);
        return (changed === 'scope'
          ? { ...value, scope: 'foreign' }
          : { ...value, manifestSha256: 'a'.repeat(64) }) as unknown as typeof value;
      };
      return session;
    };
    await expect(f.runCancellation()).rejects.toThrow('exact unsubmitted saved mutation receipt required');
    expect(await f.packetName()).toBeUndefined();
    expect(f.commands).not.toContain('apply');
  }, 60000);
test('foreign original application-history contract prevents success publication after actual cancellation', async () => {
  const f = await fixture(),
    originalOpen = f.cancellationTerraform.open;
  f.cancellationTerraform.open = async (...args) => {
    const session = await originalOpen(...args),
      actual = session.readPlanApplicationHistory;
    if (!actual) throw Error('actual original history missing');
    session.readPlanApplicationHistory = async (...request) =>
      ({ ...(await actual(...request)), retirementQualified: true }) as unknown as Awaited<ReturnType<typeof actual>>;
    return session;
  };
  await expect(f.runCancellation()).rejects.toThrow('original archived journal provenance');
  const name = await f.packetName();
  if (!name) throw Error('preparing packet missing');
  expect(((await f.store.read(name)) as Record<string, unknown>).status).toBe('preparing');
  expect(f.commands).not.toContain('apply');
}, 60000);
for (const method of ['write', 'cancel'] as const)
  test(`aborted ${method} mutation that later rejects releases locks with an explicit settlement and retains original recovery`, async () => {
    const f = await fixture(),
      abort = new AbortController(),
      late = Promise.withResolvers<void>();
    if (method === 'write') {
      const actual = f.store.write.bind(f.store);
      let once = true;
      f.store.write = async (name, value) => {
        if (once && name.startsWith('azure-power-cancel-')) {
          once = false;
          abort.abort(Error('synthetic late write rejection'));
          await late.promise;
          throw Error('synthetic mutation rejected');
        }
        await actual(name, value);
      };
    } else {
      const originalOpen = f.cancellationTerraform.open;
      let once = true;
      f.cancellationTerraform.open = async (...args) => {
        const session = await originalOpen(...args),
          actual = session.cancelUnsubmittedPlan;
        if (!actual) throw Error('actual cancellation missing');
        session.cancelUnsubmittedPlan = async (...request) => {
          if (once) {
            once = false;
            abort.abort(Error('synthetic late cancellation rejection'));
            await late.promise;
            await actual(...request);
            throw Error('synthetic cancellation response rejected');
          }
          return actual(...request);
        };
        return session;
      };
    }
    let caught: unknown;
    try {
      await f.runCancellation(abort.signal);
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof AzureTerraformPowerCancellationInterrupted))
      throw Error('pending mutation settlement missing');
    expect(await readFile(join(f.store.directory, '.terraform-network-power-lock', 'claim.json'))).toBeTruthy();
    late.resolve();
    const completed = await caught.completion;
    expect(completed.mutationSettlements).toEqual(['rejected']);
    expect(completed.locksReleased).toBe(true);
    expect((await f.runCancellation()).localCancellationQualified).toBe(true);
    expect(f.commands.filter((value) => value === 'plan')).toHaveLength(1);
    expect(f.commands).not.toContain('apply');
  }, 60000);
test('unavailable owning service prevents cancellation and never returns a cleanup receipt', async () => {
  const f = await fixture();
  f.cancellationTerraform.open = async () => {
    throw Error('synthetic authorization service unavailable');
  };
  await expect(f.runCancellation()).rejects.toThrow('authorization service unavailable');
  expect(await f.packetName()).toBeUndefined();
  expect(f.commands).not.toContain('apply');
}, 60000);
