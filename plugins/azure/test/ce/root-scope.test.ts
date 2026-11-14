import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOwnedFixtureRoot, withOwnedFixtureRootScope } from './root-scope';
import { nicExecutionFixture } from './terraform-network-nic-execution-fixture';

test('an actual nested NIC fixture requires explicit creator ownership', async () => {
  expect(() => createOwnedFixtureRoot()).toThrow('explicit owner');
  await expect(nicExecutionFixture()).rejects.toThrow('explicit owner');
});

test('an actual nested NIC store remains valid until its own scope returns', async () => {
  let verify: () => Promise<void> = async () => {
    throw Error('fixture not created');
  };
  await withOwnedFixtureRootScope(async () => {
    const fixture = await nicExecutionFixture();
    verify = () => fixture.store.verify();
    await Promise.resolve();
    await verify();
  });
  await expect(verify()).rejects.toThrow('owner manifest');
});

test('late predecessor completion retires only its own actual store', async () => {
  let releasePredecessor!: () => void;
  let predecessorReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    predecessorReady = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releasePredecessor = resolve;
  });
  let predecessorVerify!: () => Promise<void>;
  const predecessor = withOwnedFixtureRootScope(async () => {
    const fixture = await nicExecutionFixture();
    predecessorVerify = () => fixture.store.verify();
    predecessorReady();
    await released;
    await predecessorVerify();
  });
  await ready;
  await withOwnedFixtureRootScope(async () => {
    const successor = await nicExecutionFixture();
    await successor.store.verify();
    releasePredecessor();
    await predecessor;
    await expect(predecessorVerify()).rejects.toThrow('owner manifest');
    await successor.store.verify();
  });
});

test('nested independent ownership cannot retire the outer actual store', async () => {
  await withOwnedFixtureRootScope(async () => {
    const outer = await nicExecutionFixture();
    await withOwnedFixtureRootScope(async () => {
      const inner = await nicExecutionFixture();
      await inner.store.verify();
    });
    await outer.store.verify();
  });
});

test('seeded borrowed deployment storage survives the borrower scope', async () => {
  await withOwnedFixtureRootScope(async () => {
    const owner = await nicExecutionFixture();
    await withOwnedFixtureRootScope(async () => {
      const borrowed = await nicExecutionFixture(1, true, true, false, false, {
        plan: owner.plan,
        inventory: owner.before,
        source: owner.source,
        store: owner.store,
      });
      expect(borrowed.store).toBe(owner.store);
      await borrowed.store.verify();
    });
    await owner.store.verify();
  });
});

test('actual Bun timeout cannot retire a successor creator scope', async () => {
  const root = await mkdtemp(join(tmpdir(), 'azure-root-owner-child-'));
  let child: ReturnType<typeof Bun.spawn> | undefined;
  try {
    const path = join(root, 'timeout.test.ts');
    const program = `
import { expect, test as bunTest } from 'bun:test';
import { lstat } from 'node:fs/promises';
import { ownedFixtureBody, test } from ${JSON.stringify(join(import.meta.dir, 'owned-fixture-test.ts'))};
import { nicExecutionFixture } from ${JSON.stringify(join(import.meta.dir, 'terraform-network-nic-execution-fixture.ts'))};
let predecessor, directory, release, announce;
const ready = new Promise(resolve => { announce = resolve; });
const released = new Promise(resolve => { release = resolve; });
bunTest('intentional predecessor timeout', () => {
  predecessor = ownedFixtureBody(async () => {
    const fixture = await nicExecutionFixture();
    directory = fixture.store.directory;
    await fixture.store.verify();
    announce();
    await released;
    await fixture.store.verify();
  })();
  return predecessor;
}, 30);
test('successor retains its own store after predecessor disposal', async () => {
  await ready;
  const fixture = await nicExecutionFixture();
  await fixture.store.verify();
  release();
  await predecessor;
  await expect(lstat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
  await fixture.store.verify();
}, 2000);
`;
    await writeFile(path, program, { mode: 0o600 });
    child = Bun.spawn([process.execPath, 'test', '--max-concurrency=1', path], {
      cwd: root,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const deadline = setTimeout(() => child?.kill(), 5000);
    try {
      const output = child.stdout,
        errors = child.stderr;
      if (!output || !errors || typeof output === 'number' || typeof errors === 'number')
        throw Error('Actual child stdout/stderr pipes required');
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(output).text(),
        new Response(errors).text(),
      ]);
      const log = stdout + stderr;
      expect(exitCode).toBe(1);
      expect(log).toContain('(fail) intentional predecessor timeout');
      expect(log).toContain('this test timed out after 30ms');
      expect(log).toContain('(pass) successor retains its own store after predecessor disposal');
      expect(log).toMatch(/^\s*1 pass$/m);
      expect(log).toMatch(/^\s*1 fail$/m);
    } finally {
      clearTimeout(deadline);
    }
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await child.exited;
    }
    await rm(root, { recursive: true });
  }
}, 10000);
