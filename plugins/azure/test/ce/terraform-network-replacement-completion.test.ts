import { afterEach, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { canonicalSha256 } from '../../src/ce/canonical';
import {
  type AzureTerraformNetworkReplacementCompletion,
  azureTerraformNetworkReplacementCompletionName,
} from '../../src/ce/terraform-network-replacement-completion';
import { readAzureTerraformNetworkReplacementCompletionHistory } from '../../src/ce/terraform-network-replacement-completion-history';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { networkReplacementExecutorFixture as fixture } from './terraform-network-replacement-executor-fixture';

afterEach(async () => {
  for (const root of nicExecutionRoots.splice(0)) await rm(root, { recursive: true });
});
const checkpointName = (f: Awaited<ReturnType<typeof fixture>>) => `${f.input.plan.planId}-terraform-replacement.json`;
const history = (f: Awaited<ReturnType<typeof fixture>>, digest: string, signal?: AbortSignal) =>
  readAzureTerraformNetworkReplacementCompletionHistory(f.input.plan, f.store, f.dependencies, digest, signal);
for (const ha of [false, true])
  test(`actual replacement preserves first final packet across refreshed resume (${ha ? 'HA' : 'single'})`, async () => {
    const f = await fixture(ha),
      name = azureTerraformNetworkReplacementCompletionName(f.input.plan);
    const first = await f.run();
    expect(first.status).toBe('complete');
    const packet = (await f.store.read(name)) as AzureTerraformNetworkReplacementCompletion,
      digest = canonicalSha256(packet);
    expect(first).toMatchObject({ networkReplacementCompletionSha256: digest });
    expect(packet.kind).toBe('azure-terraform-network-replacement-completion');
    const oldCounter = f.state.counter;
    expect((await f.run()).status).toBe('complete');
    expect(f.state.counter).toBeGreaterThan(oldCounter);
    expect(
      canonicalSha256(await f.store.read(`${f.input.plan.planId}-terraform-replacement-final-plan.json`)),
    ).not.toBe(canonicalSha256(packet.finalReceipt));
    expect(await f.store.read(name)).toEqual(packet);
    expect(f.state.completedModes).toEqual(['current', 'historical']);
    const collected = [...f.state.collected],
      bootstraps = f.state.bootstraps;
    f.state.unknown = 'final';
    f.state.tokenMode = 'expired';
    f.dependencies.collectOperational = async () => {
      throw Error('historical reader must not collect current evidence');
    };
    const result = await history(f, digest);
    expect(result.currentOperationalAcceptanceQualified).toBe(false);
    expect(result.nodes[String(f.selected)].vmId).toBe(f.newVmId);
    expect(result.finalSource).toBe(f.state.configuration);
    expect(f.state.collected).toEqual(collected);
    expect(f.state.bootstraps).toBe(bootstraps);
    expect(f.state.applies).toBe(2);
    expect(f.state.completedModes.at(-1)).toBe('historical');
  }, 120000);
for (const loss of ['before-packet', 'after-packet', 'before-checkpoint', 'after-checkpoint'] as const)
  test(`actual completion resumes publication loss ${loss} without reapplying`, async () => {
    const f = await fixture(),
      name = azureTerraformNetworkReplacementCompletionName(f.input.plan),
      write = f.store.write.bind(f.store);
    let lost = false;
    f.store.write = async (key, value) => {
      const packet = key === name,
        checkpoint = key === checkpointName(f) && (value as { phase?: string }).phase === 'complete';
      if (!lost && ((loss.endsWith('packet') && packet) || (loss.endsWith('checkpoint') && checkpoint))) {
        lost = true;
        if (loss.startsWith('after')) await write(key, value);
        throw Error('synthetic completion publication loss');
      }
      return write(key, value);
    };
    await expect(f.run()).rejects.toThrow('synthetic completion publication loss');
    expect(lost).toBe(true);
    f.store.write = write;
    const prior = loss === 'before-packet' ? undefined : await f.store.read(name);
    if (prior && loss !== 'after-checkpoint')
      await expect(history(f, canonicalSha256(prior))).rejects.toThrow('no completed owning checkpoint');
    const result = await f.run();
    expect(result.status).toBe('complete');
    if (prior) expect(await f.store.read(name)).toEqual(prior);
    expect(f.state.applies).toBe(2);
    expect(f.state.bootstraps).toBe(1);
    expect((await history(f, canonicalSha256(await f.store.read(name)))).currentOperationalAcceptanceQualified).toBe(
      false,
    );
  }, 60000);
test('complete ordinary checkpoint without immutable completion rejects reconstruction', async () => {
  const f = await fixture(),
    name = azureTerraformNetworkReplacementCompletionName(f.input.plan);
  await f.run();
  await f.store.remove(name);
  const counter = f.state.counter;
  await expect(f.run()).rejects.toThrow('complete checkpoint lacks immutable completion');
  expect(f.state.counter).toBe(counter);
  expect(f.state.applies).toBe(2);
  await expect(f.store.read(name)).rejects.toMatchObject({ code: 'ENOENT' });
}, 60000);
test('historical completion rejects altered packet, full identities, stage proofs and exact digest', async () => {
  const f = await fixture(true),
    name = azureTerraformNetworkReplacementCompletionName(f.input.plan);
  await f.run();
  const original = (await f.store.read(name)) as AzureTerraformNetworkReplacementCompletion,
    digest = canonicalSha256(original);
  await expect(history(f, 'a'.repeat(64))).rejects.toThrow('expected digest');
  const mutations: Array<[string, (v: AzureTerraformNetworkReplacementCompletion) => void]> = [
    [
      'owner',
      (v) => {
        v.owner = { ...v.owner, deploymentId: 'foreign' };
      },
    ],
    [
      'journal',
      (v) => {
        v.journalSha256 = 'a'.repeat(64);
      },
    ],
    [
      'binding',
      (v) => {
        v.sourceBindingSha256 = 'a'.repeat(64);
      },
    ],
    [
      'checkpoint',
      (v) => {
        v.checkpointSha256 = 'a'.repeat(64);
      },
    ],
    [
      'lock',
      (v) => {
        v.providerLockSha256 = 'a'.repeat(64);
      },
    ],
    [
      'configuration',
      (v) => {
        v.finalConfigurationSha256 = 'a'.repeat(64);
      },
    ],
    [
      'UUID',
      (v) => {
        v.newVmId = f.binding.before.nodes[String(f.selected)].vmId;
      },
    ],
    [
      'stage',
      (v) => {
        v.stageRecordSha256.launch = 'a'.repeat(64);
      },
    ],
    [
      'application',
      (v) => {
        v.stageApplications.launch = 'no-change';
      },
    ],
    [
      'receipt',
      (v) => {
        v.finalReceipt.noChanges = false;
      },
    ],
    [
      'scope',
      (v) => {
        v.operational.verification.scope = 'registration-only' as never;
      },
    ],
    [
      'digest',
      (v) => {
        v.operational.receiptSha256 = 'a'.repeat(64);
      },
    ],
    [
      'node count',
      (v) => {
        delete v.operational.identity.nodes['3'];
      },
    ],
    [
      'survivor UUID',
      (v) => {
        v.operational.identity.nodes['3'].vmId = f.newVmId;
      },
    ],
    [
      'selected owner',
      (v) => {
        v.operational.identity.nodes[String(f.selected)].ownerPlanSha256 = 'a'.repeat(64);
      },
    ],
    [
      'MAC',
      (v) => {
        v.operational.identity.nodes['3'].nics['0'].mac = 'aa:bb:cc:dd:ee:ff';
      },
    ],
    [
      'IP configuration',
      (v) => {
        v.operational.identity.nodes['3'].nics['0'].ipConfigurationId = 'foreign';
      },
    ],
    [
      'subnet',
      (v) => {
        v.operational.identity.nodes['3'].nics['0'].subnetId = 'foreign';
      },
    ],
    [
      'attachment',
      (v) => {
        v.operational.identity.nodes['3'].nics['0'].attachment = 'foreign';
      },
    ],
  ];
  for (const [label, mutate] of mutations) {
    const bad = structuredClone(original);
    mutate(bad);
    await f.store.write(name, bad);
    await expect(history(f, canonicalSha256(bad)), label).rejects.toThrow();
    expect(await f.store.read(name)).toEqual(bad);
    await f.store.write(name, original);
  }
  expect((await history(f, digest)).currentOperationalAcceptanceQualified).toBe(false);
  expect(f.state.applies).toBe(2);
}, 180000);
test('completion provenance unavailable remains pending and historical scope is explicit', async () => {
  const f = await fixture(),
    qualify = f.dependencies.qualifyCompletedOperational;
  f.dependencies.qualifyCompletedOperational = async () => {
    throw Error('synthetic provenance unavailable');
  };
  expect((await f.run()).status).toBe('completion-pending');
  expect(((await f.store.read(checkpointName(f))) as { phase: string }).phase).toBe('launched');
  f.dependencies.qualifyCompletedOperational = qualify;
  expect((await f.run()).status).toBe('complete');
  const name = azureTerraformNetworkReplacementCompletionName(f.input.plan),
    original = await f.store.read(name),
    digest = canonicalSha256(original);
  f.dependencies.qualifyCompletedOperational = async () => {
    throw Error('historical provenance unavailable');
  };
  await expect(history(f, digest)).rejects.toThrow('provenance unavailable');
  expect((await f.run()).status).toBe('completion-pending');
  expect(await f.store.read(name)).toEqual(original);
  expect(f.state.applies).toBe(2);
}, 90000);
test('historical callback artifact and owner races reject and cancellation does not publish', async () => {
  const f = await fixture(),
    name = azureTerraformNetworkReplacementCompletionName(f.input.plan);
  await f.run();
  const original = await f.store.read(name),
    digest = canonicalSha256(original),
    qualify = f.dependencies.qualifyCompletedOperational;
  const sourceName = `${f.input.plan.planId}-terraform-replacement-source.json`,
    source = (await f.store.read(sourceName)) as Record<string, unknown>;
  f.dependencies.qualifyCompletedOperational = async (...args) => {
    await f.store.write(sourceName, { ...source, bootstrap: 'foreign' });
    return qualify(...args);
  };
  await expect(history(f, digest)).rejects.toThrow('private completion history changed');
  await f.store.write(sourceName, source);
  f.dependencies.qualifyCompletedOperational = async (...args) => {
    f.dependencies.sourceBindingSha256 = 'a'.repeat(64);
    return qualify(...args);
  };
  await expect(history(f, digest)).rejects.toThrow('owning completion context changed');
  f.dependencies.sourceBindingSha256 = canonicalSha256(f.binding);
  f.dependencies.qualifyCompletedOperational = qualify;
  const controller = new AbortController();
  controller.abort(Error('synthetic canceled completion history'));
  await expect(history(f, digest, controller.signal)).rejects.toThrow('synthetic canceled completion history');
  const ignored = new AbortController();
  f.dependencies.qualifyCompletedOperational = async () => {
    ignored.abort(Error('synthetic ignored callback cancellation'));
    return new Promise(() => {});
  };
  await expect(history(f, digest, ignored.signal)).rejects.toThrow('synthetic ignored callback cancellation');
  expect(await f.store.read(name)).toEqual(original);
  expect(f.state.applies).toBe(2);
}, 90000);

for (const mode of ['configuration', 'application-state', 'checkpoint', 'scope', 'provenance-digest'] as const)
  test(`actual completion publication rejects final callback ${mode}`, async () => {
    const f = await fixture(),
      qualify = f.dependencies.qualifyCompletedOperational,
      name = azureTerraformNetworkReplacementCompletionName(f.input.plan);
    f.dependencies.qualifyCompletedOperational = async (...args) => {
      const result = await qualify(...args);
      if (mode === 'configuration') f.state.configuration += '\n';
      if (mode === 'application-state') f.state.wrongState = true;
      if (mode === 'checkpoint') {
        const checkpoint = (await f.store.read(checkpointName(f))) as Record<string, unknown>;
        await f.store.write(checkpointName(f), { ...checkpoint, newVmId: '00000000-0000-4000-8000-000000000098' });
      }
      if (mode === 'scope') return { ...result, scope: 'registration-only' as never };
      if (mode === 'provenance-digest') return { ...result, evidenceSha256: 'a'.repeat(64) };
      return result;
    };
    await expect(f.run()).rejects.toThrow();
    await expect(f.store.read(name)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(f.state.applies).toBe(2);
    expect(((await f.store.read(checkpointName(f))) as { phase: string }).phase).toBe('launched');
  }, 60000);
test('late foreign completion packet is preserved and never overwritten by owning publication', async () => {
  const f = await fixture(),
    name = azureTerraformNetworkReplacementCompletionName(f.input.plan),
    read = f.store.read.bind(f.store),
    write = f.store.write.bind(f.store);
  let injected = false;
  const foreign = { kind: 'foreign-private-completion' };
  f.store.read = async (key) => {
    try {
      return await read(key);
    } catch (error) {
      if (
        key === name &&
        (error as NodeJS.ErrnoException).code === 'ENOENT' &&
        f.state.completedModes.includes('current') &&
        !injected
      ) {
        injected = true;
        await write(key, foreign);
        return foreign;
      }
      throw error;
    }
  };
  await expect(f.run()).rejects.toThrow('late foreign immutable completion');
  expect(await read(name)).toEqual(foreign);
  expect(((await read(checkpointName(f))) as { phase: string }).phase).toBe('launched');
  expect(f.state.applies).toBe(2);
}, 60000);

for (const mode of ['context', 'private-source', 'configuration', 'application-state'] as const)
  test(`throwing completion verifier cannot hide changed ${mode} as pending`, async () => {
    const f = await fixture(),
      name = azureTerraformNetworkReplacementCompletionName(f.input.plan);
    f.dependencies.qualifyCompletedOperational = async () => {
      if (mode === 'context') f.dependencies.sourceBindingSha256 = 'a'.repeat(64);
      if (mode === 'private-source') {
        const key = `${f.input.plan.planId}-terraform-replacement-source.json`,
          packet = (await f.store.read(key)) as Record<string, unknown>;
        await f.store.write(key, { ...packet, bootstrap: 'foreign' });
      }
      if (mode === 'configuration') f.state.configuration += '\n';
      if (mode === 'application-state') f.state.wrongState = true;
      throw Error('synthetic unavailable after tamper');
    };
    await expect(f.run()).rejects.toThrow();
    await expect(f.store.read(name)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(f.state.applies).toBe(2);
  }, 60000);
test('throwing historical verifier cannot hide private source change as unavailable', async () => {
  const f = await fixture(),
    name = azureTerraformNetworkReplacementCompletionName(f.input.plan);
  await f.run();
  const digest = canonicalSha256(await f.store.read(name));
  f.dependencies.qualifyCompletedOperational = async () => {
    const key = `${f.input.plan.planId}-terraform-replacement-source.json`,
      packet = (await f.store.read(key)) as Record<string, unknown>;
    await f.store.write(key, { ...packet, bootstrap: 'foreign' });
    throw Error('synthetic unavailable after historical tamper');
  };
  await expect(history(f, digest)).rejects.toThrow('private completion history changed');
  expect(f.state.applies).toBe(2);
}, 60000);
