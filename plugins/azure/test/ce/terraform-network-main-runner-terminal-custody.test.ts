import { expect } from 'bun:test';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { canonicalSha256 } from '../../src/ce/canonical';
import { test } from './owned-fixture-test';
import { terraformNetworkMainRunnerFixture } from './terraform-network-main-runner-fixture';

async function terminalReceipts(f: Awaited<ReturnType<typeof terraformNetworkMainRunnerFixture>>) {
  const receipts = new Map<string, PlanReceipt>();
  for (const name of Object.keys(f.graph.checkpoint.completionSha256ByName)) {
    const packet = (await f.store.read(name)) as { receipt: PlanReceipt };
    receipts.set(canonicalSha256(packet.receipt), packet.receipt);
  }
  expect(receipts.size).toBeGreaterThan(0);
  return receipts;
}
for (const ha of [false, true])
  test(`terminal ${ha ? 'HA' : 'single'} publications join exact owning journals separately from node stages`, async () => {
    const f = await terraformNetworkMainRunnerFixture(ha);
    const commands = [...f.commands],
      calls = [...f.calls];
    const result = await f.runHistory();
    expect(result.originalPublishedJournalsQualified).toBe(true);
    expect(result.terminalPublishedJournalsQualified).toBe(true);
    expect(result.terminalRows).toHaveLength(Object.keys(f.graph.checkpoint.completionSha256ByName).length);
    const receipts = await terminalReceipts(f);
    for (const row of result.terminalRows) {
      expect(row.packetSha256).toBe(f.graph.checkpoint.completionSha256ByName[row.publicationName]);
      expect(receipts.has(row.receiptSha256)).toBe(true);
      expect(row.submission).toBe('no-change');
      expect(row.history?.receiptSha256).toBe(row.receiptSha256);
      expect(Reflect.has(row, 'node')).toBe(false);
    }
    expect(result.currentOperationalAcceptanceQualified).toBe(false);
    expect(result.runnerRetirementQualified).toBe(false);
    expect(result.parentRetirementQualified).toBe(false);
    expect(f.commands).toEqual(commands);
    expect(f.calls).toEqual(calls);
    expect(JSON.stringify(result)).not.toContain(f.graph.original.binding.source);
  }, 120000);
for (const failure of [
  'missing',
  'partial',
  'unresolved',
  'foreign',
  'duplicate',
  'extra-key',
  'unavailable',
  'changed',
] as const)
  test(`${failure} terminal journals cannot be replaced by completion packets`, async () => {
    const f = await terraformNetworkMainRunnerFixture();
    const receipts = await terminalReceipts(f),
      open = f.service.open.bind(f.service);
    f.service.open = async (...args) => {
      const session = await open(...args),
        read = session.readPlanApplicationHistory;
      if (!read) throw Error('actual history reader required');
      const counts = new Map<string, number>();
      session.readPlanApplicationHistory = async (...request) => {
        const actual = structuredClone(await read.apply(session, request));
        const digest = canonicalSha256(request[0]);
        if (!receipts.has(digest)) return actual;
        const count = (counts.get(digest) ?? 0) + 1;
        counts.set(digest, count);
        if (failure === 'unavailable') throw Error('synthetic terminal history unavailable');
        if (failure === 'missing') actual.matches = [];
        if (failure === 'partial' || (failure === 'changed' && count > 1)) actual.incompleteArchives++;
        if (failure === 'unresolved') actual.matches = actual.matches.map((match) => ({ ...match, state: 'applying' }));
        if (failure === 'foreign' && actual.matches[0]) actual.matches[0].manifestSha256 = 'a'.repeat(64);
        if (failure === 'duplicate' && actual.matches[0]) actual.matches.push(actual.matches[0]);
        if (failure === 'extra-key') Object.assign(actual, { future: true });
        return actual;
      };
      return session;
    };
    const commands = [...f.commands],
      calls = [...f.calls];
    if (['foreign', 'duplicate', 'extra-key', 'unavailable', 'changed'].includes(failure))
      await expect(f.runHistory()).rejects.toThrow();
    else {
      const result = await f.runHistory();
      expect(result.terminalPublishedJournalsQualified).toBe(false);
      expect(result.terminalRows.some((row) => row.submission === failure)).toBe(true);
      expect(result.parentRetirementQualified).toBe(false);
    }
    expect(f.commands).toEqual(commands);
    expect(f.calls).toEqual(calls);
  }, 60000);
test('terminal historical receipts remain qualified when a later saved plan is current', async () => {
  const f = await terraformNetworkMainRunnerFixture();
  const receipts = await terminalReceipts(f),
    terminal = [...receipts.values()].at(-1);
  if (!terminal) throw Error('terminal fixture receipt required');
  const next = { ...terminal, planSha256: f.hash('499') };
  expect(await f.appendPlan(next)).toEqual(next);
  const commands = [...f.commands],
    calls = [...f.calls];
  const result = await f.runHistory();
  expect(result.current?.receipt).toEqual(next);
  expect(result.terminalPublishedJournalsQualified).toBe(true);
  expect(
    result.terminalRows.every((row) => row.history?.matches.some((match) => match.location === 'plan-history')),
  ).toBe(true);
  expect(result.parentRetirementQualified).toBe(false);
  expect(f.commands).toEqual(commands);
  expect(f.calls).toEqual(calls);
}, 60000);
test('corrupted actual archived terminal saved bytes reject even with intact completion packets', async () => {
  const f = await terraformNetworkMainRunnerFixture();
  const receipts = await terminalReceipts(f),
    terminal = [...receipts.values()].at(-1);
  if (!terminal) throw Error('terminal fixture receipt required');
  await f.appendPlan({ ...terminal, planSha256: f.hash('499') });
  let corrupted = false;
  for (const name of await readdir(join(f.runnerDirectory, 'plan-history'))) {
    const path = join(f.runnerDirectory, 'plan-history', name, 'saved.tfplan');
    if (
      receipts.has(
        canonicalSha256(
          JSON.parse(await readFile(join(f.runnerDirectory, 'plan-history', name, 'plan-receipt.json'), 'utf8'))
            .receipt,
        ),
      )
    ) {
      await writeFile(path, 'changed synthetic saved bytes', { mode: 0o600 });
      corrupted = true;
    }
  }
  expect(corrupted).toBe(true);
  const commands = [...f.commands],
    calls = [...f.calls];
  await expect(f.runHistory()).rejects.toThrow('inventory bytes differ');
  expect(f.commands).toEqual(commands);
  expect(f.calls).toEqual(calls);
}, 60000);
test('terminal packet altered during owning journal reads rejects at graph boundary', async () => {
  const f = await terraformNetworkMainRunnerFixture(),
    open = f.service.open.bind(f.service);
  const name = Object.keys(f.graph.checkpoint.completionSha256ByName)[0];
  const packet = (await f.store.read(name)) as { receipt: PlanReceipt };
  f.service.open = async (...args) => {
    const session = await open(...args),
      read = session.readPlanApplicationHistory;
    if (!read) throw Error('actual history reader required');
    let changed = false;
    session.readPlanApplicationHistory = async (...request) => {
      const actual = await read.apply(session, request);
      if (!changed) {
        changed = true;
        packet.receipt.planSha256 = 'a'.repeat(64);
        await f.store.write(name, packet);
      }
      return actual;
    };
    return session;
  };
  await expect(f.runHistory()).rejects.toThrow();
}, 60000);

test('an actually applied no-change terminal journal retains saved-plan custody without claiming outcome', async () => {
  const f = await terraformNetworkMainRunnerFixture();
  const receipts = await terminalReceipts(f),
    terminal = [...receipts.values()].at(-1);
  if (!terminal) throw Error('terminal fixture receipt required');
  await f.runner.apply(terminal, {});
  const commands = [...f.commands],
    calls = [...f.calls];
  const result = await f.runHistory();
  expect(result.terminalPublishedJournalsQualified).toBe(true);
  expect(result.terminalRows.some((row) => row.submission === 'applied')).toBe(true);
  expect(result.applicationOutcomeQualified).toBe(false);
  expect(result.parentRetirementQualified).toBe(false);
  expect(f.commands).toEqual(commands);
  expect(f.calls).toEqual(calls);
}, 60000);
