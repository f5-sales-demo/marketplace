import { expect } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { readAzureTerraformNetworkReplacementReceiptProvenance } from '../../src/ce/terraform-network-replacement-receipt-provenance';
import { test } from './owned-fixture-test';
import { completedReplacement } from './terraform-network-mixed-generation-fixture';

type Fixture = Awaited<ReturnType<typeof completedReplacement>>;
const read = (f: Fixture, signal?: AbortSignal) =>
  readAzureTerraformNetworkReplacementReceiptProvenance(
    f.first,
    f.f.store,
    f.loaders,
    f.f.birth.site,
    f.f.dependencies.qualifyHistorical,
    f.f.dependencies.qualifyCompletedOperational,
    signal,
  );

for (const ha of [false, true])
  test(`actual ${ha ? 'HA' : 'single'} completed replacement yields exact original receipts without execution`, async () => {
    const f = await completedReplacement(ha),
      counters = {
        applies: f.f.state.applies,
        bootstraps: f.f.state.bootstraps,
        counter: f.f.state.counter,
        collected: [...f.f.state.collected],
      };
    const completionSha256 =
      'networkReplacementCompletionSha256' in f.result ? f.result.networkReplacementCompletionSha256 : undefined;
    if (typeof completionSha256 !== 'string') throw Error('actual completed outcome digest required');
    const row = await read(f);
    expect(row.receipts.map((r) => r.stage)).toEqual(['quiesce', 'launch', 'immutable-final']);
    expect(row.planSha256).toBe(f.first.planSha256);
    expect(row.completionSha256).toBe(completionSha256);
    expect(row.receipts.every((r) => r.receiptSha256 === canonicalSha256(r.receipt))).toBe(true);
    expect(row.receipts.at(-1)?.receipt.noChanges).toBe(true);
    expect(row.nativeSavedJournalsQualified).toBe(false);
    expect(row.currentOperationalAcceptanceQualified).toBe(false);
    expect(row.parentRetirementQualified).toBe(false);
    expect(JSON.stringify(row)).not.toContain(f.f.state.configuration);
    expect({
      applies: f.f.state.applies,
      bootstraps: f.f.state.bootstraps,
      counter: f.f.state.counter,
      collected: [...f.f.state.collected],
    }).toEqual(counters);
  }, 180000);

test('untrusted completed outcome digest, foreign site, unavailable owner and late caller mutation reject', async () => {
  const f = await completedReplacement(false),
    outcome = f.loaders.loadOutcome,
    verify = f.f.store.verify;
  f.loaders.loadOutcome = async (p) => ({
    ...(await outcome(p)),
    ...(p.planSha256 === f.first.planSha256
      ? {
          networkReplacementCompletionSha256: 'a'.repeat(64),
        }
      : {}),
  });
  await expect(read(f)).rejects.toThrow();
  f.loaders.loadOutcome = outcome;
  const site = f.f.birth.site.siteUid;
  f.f.birth.site.siteUid = 'foreign-site';
  await expect(read(f)).rejects.toThrow();
  f.f.birth.site.siteUid = site;
  f.f.store.verify = async () => {
    throw Error('synthetic owner unavailable');
  };
  await expect(read(f)).rejects.toThrow('synthetic owner unavailable');
  f.f.store.verify = verify;
  let changed = false;
  f.loaders.loadOutcome = async (p) => {
    const result = await outcome(p);
    if (!changed) {
      changed = true;
      f.first.siteName = 'late-foreign';
    }
    return result;
  };
  await expect(read(f)).rejects.toThrow('context changed');
  expect(changed).toBe(true);
}, 180000);

test('ignored owning outcome await is bounded by cancellation with no late receipt success', async () => {
  const f = await completedReplacement(false),
    outcome = f.loaders.loadOutcome;
  const started = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>(),
    returned = Promise.withResolvers<void>();
  f.loaders.loadOutcome = async (p) => {
    const result = await outcome(p);
    started.resolve();
    await release.promise;
    returned.resolve();
    return result;
  };
  const controller = new AbortController(),
    running = read(f, controller.signal);
  try {
    await started.promise;
    controller.abort(Error('replacement receipt provenance cancelled'));
    await expect(running).rejects.toThrow('replacement receipt provenance cancelled');
  } finally {
    release.resolve();
    await returned.promise;
  }
}, 180000);

test('a final valid completion read cannot conceal a changed earlier original stage packet', async () => {
  const f = await completedReplacement(false),
    originalRead = f.f.store.read;
  // Count the actual read path, then change the earlier stage on its last completion callback.
  const calls: string[] = [];
  f.f.store.read = async (key) => {
    calls.push(key);
    return originalRead.call(f.f.store, key);
  };
  await read(f);
  f.f.store.read = originalRead;
  const completedNames = calls.filter((key) => key.includes('replacement') && key.includes('complete'));
  if (!completedNames.length) throw Error('actual immutable completion reads required');
  const completionName = completedNames.at(-1) as string;
  const expected = calls.filter((key) => key === completionName).length;
  const stageName = `${f.first.planId}-terraform-quiesce-plan.json`;
  const stage = await f.f.store.read(stageName);
  let count = 0,
    fired = false;
  f.f.store.read = async (key) => {
    const value = await originalRead.call(f.f.store, key);
    if (key === completionName && ++count === expected) {
      await f.f.store.write(stageName, { ...(stage as object), unqualifiedLateField: true });
      fired = true;
    }
    return value;
  };
  await expect(read(f)).rejects.toThrow('native receipt packet changed');
  expect(fired).toBe(true);
}, 180000);
