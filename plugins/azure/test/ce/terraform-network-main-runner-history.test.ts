import { afterEach, expect, test } from 'bun:test';
import { chmod, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalSha256 } from '../../src/ce/canonical';
import { terraformNetworkMainRunnerFixture } from './terraform-network-main-runner-fixture';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';

afterEach(async () => {
  for (const root of nicExecutionRoots.splice(0)) await rm(root, { recursive: true });
});
for (const ha of [false, true])
  test(`actual ${ha ? 'three-node HA' : 'single'} main journals join original NIC/routing graph without commands or cleanup`, async () => {
    const f = await terraformNetworkMainRunnerFixture(ha),
      commands = [...f.commands],
      calls = [...f.calls];
    const row = await f.runHistory();
    expect(row.status).toBe('inspected');
    expect(row.rows).toHaveLength(ha ? 21 : 7);
    expect(row.originalPublishedJournalsQualified).toBe(true);
    expect(row.rows.every((item) => ['applied', 'no-change'].includes(item.submission))).toBe(true);
    expect(row.rows.filter((item) => item.publishedCompletion).every((item) => item.history?.matches.length)).toBe(
      true,
    );
    expect(row.current?.ordinaryRefreshEnabled).toBe(true);
    expect(row.applicationOutcomeQualified).toBe(false);
    expect(row.currentOperationalAcceptanceQualified).toBe(false);
    expect(row.runnerRetirementQualified).toBe(false);
    expect(row.parentRetirementQualified).toBe(false);
    expect(row.retirementQualified).toBe(false);
    expect(f.commands).toEqual(commands);
    expect(f.calls).toEqual(calls);
    expect(JSON.stringify(row)).not.toContain(f.graph.original.binding.source);
  }, 120000);
for (const boundary of ['missing', 'retired', 'pending', 'unsafe'] as const)
  test(`${boundary} main directory cannot grant original journal or retirement acceptance`, async () => {
    const f = await terraformNetworkMainRunnerFixture();
    if (boundary === 'missing') await rm(f.runnerDirectory, { recursive: true });
    if (boundary === 'retired')
      await writeFile(join(f.runnerDirectory, 'artifact-retirement.json'), '{}', { mode: 0o600 });
    if (boundary === 'pending')
      await writeFile(join(f.runnerDirectory, 'configuration-transition.json'), '{}', { mode: 0o600 });
    if (boundary === 'unsafe') await chmod(f.runnerDirectory, 0o755);
    const open = f.service.open;
    f.service.open = async () => {
      throw Error('inspection must not open this runner');
    };
    if (boundary === 'missing' || boundary === 'retired') {
      const row = await f.runHistory();
      expect(row.status).toBe(boundary === 'missing' ? 'missing' : 'retired-awaiting-original-history');
      expect(row.originalPublishedJournalsQualified).toBe(false);
      expect(row.rows.every((item) => item.submission === 'missing')).toBe(true);
      expect(row.retirementQualified).toBe(false);
    } else
      await expect(f.runHistory()).rejects.toThrow(
        boundary === 'pending' ? 'pending main runner revision' : 'ownership differs',
      );
    f.service.open = open;
  }, 60000);
for (const failure of [
  'missing',
  'partial',
  'unsubmitted',
  'unresolved',
  'ambiguous',
  'foreign',
  'duplicate',
  'extra-key',
  'unavailable',
] as const)
  test(`${failure} original main journal stays unknown or rejects; published packets cannot replace it`, async () => {
    const f = await terraformNetworkMainRunnerFixture(),
      open = f.service.open.bind(f.service);
    f.service.open = async (...args) => {
      const session = await open(...args),
        read = session.readPlanApplicationHistory;
      if (!read) throw Error('actual history reader missing');
      session.readPlanApplicationHistory = async (...request) => {
        const actual = structuredClone(await read.apply(session, request));
        if (failure === 'unavailable') throw Error('synthetic journal unavailable');
        if (failure === 'missing') actual.matches = [];
        if (failure === 'partial') actual.incompleteArchives = 1;
        if (failure === 'unsubmitted' || failure === 'unresolved')
          actual.matches = actual.matches.map((match) => ({
            ...match,
            state: failure === 'unsubmitted' ? 'planned' : 'applying',
          }));
        if (failure === 'ambiguous')
          actual.matches = actual.matches
            .flatMap((match) => [
              { ...match, state: 'applying' as const },
              { ...match, state: 'applied' as const, archiveSha256: 'c'.repeat(64) },
            ])
            .slice(0, 2);
        if (failure === 'foreign' && actual.matches[0]) actual.matches[0].manifestSha256 = 'a'.repeat(64);
        if (failure === 'duplicate' && actual.matches[0]) actual.matches.push(actual.matches[0]);
        if (failure === 'extra-key') Object.assign(actual, { future: true });
        return actual;
      };
      return session;
    };
    const commands = [...f.commands],
      calls = [...f.calls];
    if (['foreign', 'duplicate', 'extra-key', 'unavailable'].includes(failure))
      await expect(f.runHistory()).rejects.toThrow();
    else {
      const row = await f.runHistory();
      expect(row.originalPublishedJournalsQualified).toBe(false);
      expect(row.rows.some((item) => item.submission === failure)).toBe(true);
      expect(row.retirementQualified).toBe(false);
    }
    expect(f.commands).toEqual(commands);
    expect(f.calls).toEqual(calls);
  }, 60000);
test('changed original journal across inspection rejects instead of consuming initial proof', async () => {
  const f = await terraformNetworkMainRunnerFixture(),
    open = f.service.open.bind(f.service);
  f.service.open = async (...args) => {
    const session = await open(...args),
      read = session.readPlanApplicationHistory;
    if (!read) throw Error('actual reader missing');
    const calls = new Map<string, number>();
    session.readPlanApplicationHistory = async (receipt, signal) => {
      const actual = structuredClone(await read.call(session, receipt, signal));
      const key = canonicalSha256(receipt),
        count = (calls.get(key) ?? 0) + 1;
      calls.set(key, count);
      if (count > 2) actual.incompleteArchives++;
      return actual;
    };
    return session;
  };
  await expect(f.runHistory()).rejects.toThrow('original main runner journal changed');
}, 60000);
test('missing authenticated reader cannot be replaced by a plan or packet acknowledgement', async () => {
  const f = await terraformNetworkMainRunnerFixture(),
    open = f.service.open.bind(f.service);
  f.service.open = async (...args) => {
    const session = await open(...args);
    delete session.readPlanApplicationHistory;
    return session;
  };
  await expect(f.runHistory()).rejects.toThrow('readers unavailable');
}, 60000);
test('pre-aborted main inspection never opens a runner or invokes cloud execution', async () => {
  const f = await terraformNetworkMainRunnerFixture(),
    commands = [...f.commands],
    calls = [...f.calls];
  f.service.open = async () => {
    throw Error('must not open');
  };
  await expect(f.runHistory(AbortSignal.abort(Error('synthetic main abort')))).rejects.toThrow('synthetic main abort');
  expect(f.commands).toEqual(commands);
  expect(f.calls).toEqual(calls);
}, 60000);
test('read-only main inspection retains every journal byte with current cloud unavailable', async () => {
  const f = await terraformNetworkMainRunnerFixture();
  f.state.cloudUnavailable = true;
  const names = (await readdir(f.runnerDirectory, { recursive: true })).sort();
  const bytes = new Map<string, Buffer>();
  for (const name of names) {
    try {
      bytes.set(name, await readFile(join(f.runnerDirectory, name)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EISDIR') throw error;
    }
  }
  const row = await f.runHistory();
  expect(row.originalPublishedJournalsQualified).toBe(true);
  expect((await readdir(f.runnerDirectory, { recursive: true })).sort()).toEqual(names);
  for (const [name, original] of bytes)
    expect((await readFile(join(f.runnerDirectory, name))).equals(original)).toBe(true);
}, 60000);
for (const part of ['owner', 'site', 'plan', 'store-reader', 'source-loader', 'session-reader'] as const)
  test(`changed ${part} during original main journal collection rejects`, async () => {
    const f = await terraformNetworkMainRunnerFixture(),
      open = f.service.open.bind(f.service);
    f.service.open = async (...args) => {
      const session = await open(...args),
        read = session.readPlanApplicationHistory;
      if (!read) throw Error('actual reader missing');
      let fired = false;
      session.readPlanApplicationHistory = async (...request) => {
        const actual = await read.apply(session, request);
        if (!fired) {
          fired = true;
          if (part === 'owner') f.store.owner.account = 'example-foreign';
          if (part === 'site') f.site.siteUid = 'foreign';
          if (part === 'plan') f.plan.siteName = 'foreign';
          if (part === 'store-reader') f.store.read = async () => ({});
          if (part === 'source-loader') f.loaders.loadSource = async () => f.plan;
          if (part === 'session-reader') session.readPlanApplicationHistory = read;
        }
        return actual;
      };
      return session;
    };
    await expect(f.runHistory()).rejects.toThrow('changed');
  }, 60000);
test('stalled original journal read aborts without publication or late success', async () => {
  const f = await terraformNetworkMainRunnerFixture(),
    open = f.service.open.bind(f.service);
  const started = Promise.withResolvers<void>(),
    settled = Promise.withResolvers<void>();
  f.service.open = async (...args) => {
    const session = await open(...args),
      read = session.readPlanApplicationHistory;
    if (!read) throw Error('actual reader missing');
    session.readPlanApplicationHistory = async (...request) => {
      const actual = await read.apply(session, request);
      started.resolve();
      await settled.promise;
      return actual;
    };
    return session;
  };
  const commands = [...f.commands],
    names = (await readdir(f.store.directory)).sort();
  const controller = new AbortController(),
    running = f.runHistory(controller.signal);
  await started.promise;
  controller.abort(Error('synthetic stalled main read'));
  await expect(running).rejects.toThrow('synthetic stalled main read');
  settled.resolve();
  expect(f.commands).toEqual(commands);
  expect((await readdir(f.store.directory)).sort()).toEqual(names);
}, 60000);
