import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAwsCheckpoint, saveAwsCheckpoint } from '../../src/ce/artifacts';
import type { AwsCeCheckpoint } from '../../src/ce/types';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});
async function fixture(names = ['opaque-zeta', 'opaque-alpha', 'opaque-mu']) {
  const directory = await mkdtemp(join(tmpdir(), 'ce-checkpoint-journal-'));
  directories.push(directory);
  let index = 0;
  let loseResponse = false;
  const session = {
    getSessionId: () => directory,
    getArtifactsDir: () => directory,
    getArtifactPath: async () => null,
    saveArtifact: async (content: string, kind: string) => {
      const id = names[index++] ?? `opaque-next-${index}`;
      await writeFile(join(directory, `${id}.${kind}.log`), content, { mode: 0o600, flag: 'wx' });
      if (loseResponse) {
        loseResponse = false;
        throw Error('Response lost after publication');
      }
      return id;
    },
  };
  const checkpoint: AwsCeCheckpoint = {
    schemaVersion: 2,
    engine: 'native',
    planId: `aws-ce-${'a'.repeat(24)}`,
    planSha256: 'a'.repeat(64),
    completedActionIds: [],
    resolvedValues: {},
    state: 'running',
    pendingCreate: { actionId: 'create-owned-instance', requestSha256: 'b'.repeat(64) },
  };
  return {
    directory,
    session,
    checkpoint,
    lose: () => {
      loseResponse = true;
    },
  };
}
test('opaque artifact names cannot select an older pending-create checkpoint', async () => {
  const f = await fixture();
  await saveAwsCheckpoint(f.session, f.checkpoint);
  const next = {
    ...f.checkpoint,
    pendingCreate: undefined,
    completedActionIds: ['create-owned-instance'],
    resolvedValues: { __INSTANCE_1__: 'i-0123456789abcdef0' },
    state: 'complete' as const,
  };
  await saveAwsCheckpoint(f.session, next);
  expect(await loadAwsCheckpoint(f.session, next.planId, next.planSha256)).toEqual(next);
});
test('malformed publication cannot silently fall back to an older checkpoint', async () => {
  const f = await fixture();
  await saveAwsCheckpoint(f.session, f.checkpoint);
  await writeFile(join(f.directory, 'opaque-tail.aws-ce-checkpoint.log'), '{', { mode: 0o600 });
  await expect(loadAwsCheckpoint(f.session, f.checkpoint.planId, f.checkpoint.planSha256)).rejects.toThrow();
});
test('publication binds explicit order and previous digest instead of names or times', async () => {
  const f = await fixture();
  await saveAwsCheckpoint(f.session, f.checkpoint);
  await saveAwsCheckpoint(f.session, { ...f.checkpoint, state: 'partial' });
  const rows = await Promise.all(
    (await readdir(f.directory))
      .filter((p) => p.endsWith('.aws-ce-checkpoint.log'))
      .map((p) => Bun.file(join(f.directory, p)).json()),
  );
  const ordered = rows.sort((a, b) => a.journal.sequence - b.journal.sequence);
  expect(ordered[0].journal).toEqual({ schemaVersion: 1, sequence: 1, previousSha256: null });
  expect(ordered[1].journal.previousSha256).toBe(ordered[0].sha256);
  expect(ordered[1].journal.sequence).toBe(2);
});
test('a published pending marker is recoverable after response loss', async () => {
  const f = await fixture();
  f.lose();
  await expect(saveAwsCheckpoint(f.session, f.checkpoint)).rejects.toThrow('Response lost');
  expect(await loadAwsCheckpoint(f.session, f.checkpoint.planId, f.checkpoint.planSha256)).toEqual(f.checkpoint);
});

test('identical duplicate publication does not create an ambiguous head', async () => {
  const f = await fixture();
  await saveAwsCheckpoint(f.session, f.checkpoint);
  const path = join(f.directory, 'opaque-zeta.aws-ce-checkpoint.log');
  await writeFile(join(f.directory, 'duplicate.aws-ce-checkpoint.log'), await Bun.file(path).text(), { mode: 0o600 });
  expect(await loadAwsCheckpoint(f.session, f.checkpoint.planId, f.checkpoint.planSha256)).toEqual(f.checkpoint);
});
test('missing ancestry refuses resume rather than selecting the remaining newest snapshot', async () => {
  const f = await fixture();
  await saveAwsCheckpoint(f.session, f.checkpoint);
  await saveAwsCheckpoint(f.session, { ...f.checkpoint, state: 'partial' });
  await rm(join(f.directory, 'opaque-zeta.aws-ce-checkpoint.log'));
  await expect(loadAwsCheckpoint(f.session, f.checkpoint.planId, f.checkpoint.planSha256)).rejects.toThrow('ancestry');
});
test('changed snapshot content cannot borrow an intact journal digest', async () => {
  const f = await fixture();
  await saveAwsCheckpoint(f.session, f.checkpoint);
  const path = join(f.directory, 'opaque-zeta.aws-ce-checkpoint.log');
  const row = await Bun.file(path).json();
  row.checkpoint.resolvedValues.__INSTANCE_1__ = 'i-0123456789abcdef0';
  await writeFile(path, JSON.stringify(row));
  await expect(loadAwsCheckpoint(f.session, f.checkpoint.planId, f.checkpoint.planSha256)).rejects.toThrow('integrity');
});
test('self-consistent forked publications cannot choose a winning filename', async () => {
  const { canonicalSha256 } = await import('../../src/ce/canonical');
  const f = await fixture();
  await saveAwsCheckpoint(f.session, f.checkpoint);
  await saveAwsCheckpoint(f.session, { ...f.checkpoint, state: 'partial' });
  const second = await Bun.file(join(f.directory, 'opaque-alpha.aws-ce-checkpoint.log')).json();
  second.checkpoint.failedActionId = 'different-attempt';
  delete second.sha256;
  second.sha256 = canonicalSha256(second);
  await writeFile(join(f.directory, 'fork.aws-ce-checkpoint.log'), JSON.stringify(second), { mode: 0o600 });
  await expect(loadAwsCheckpoint(f.session, f.checkpoint.planId, f.checkpoint.planSha256)).rejects.toThrow('forked');
});
test('claimed artifact success without a published snapshot is rejected', async () => {
  const f = await fixture();
  await expect(
    saveAwsCheckpoint({ ...f.session, saveArtifact: async () => 'opaque-acknowledgement' }, f.checkpoint),
  ).rejects.toThrow('publication');
  expect(await loadAwsCheckpoint(f.session, f.checkpoint.planId, f.checkpoint.planSha256)).toBeUndefined();
});
test('the snapshot is copied before an asynchronous publication can mutate caller input', async () => {
  const f = await fixture();
  const expected = structuredClone(f.checkpoint);
  const save = f.session.saveArtifact;
  f.session.saveArtifact = async (content, kind) => {
    f.checkpoint.resolvedValues.__INSTANCE_1__ = 'caller-changed';
    return save(content, kind);
  };
  await saveAwsCheckpoint(f.session, f.checkpoint);
  expect(await loadAwsCheckpoint(f.session, expected.planId, expected.planSha256)).toEqual(expected);
});
test('a live publisher prevents stale reads and competing writes for the same journal', async () => {
  const f = await fixture();
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((r) => {
    entered = r;
  });
  const wait = new Promise<void>((r) => {
    release = r;
  });
  const save = f.session.saveArtifact;
  f.session.saveArtifact = async (content, kind) => {
    entered();
    await wait;
    return save(content, kind);
  };
  const publisher = saveAwsCheckpoint(f.session, f.checkpoint);
  await ready;
  try {
    await expect(loadAwsCheckpoint(f.session, f.checkpoint.planId, f.checkpoint.planSha256)).rejects.toThrow('lock');
    await expect(saveAwsCheckpoint(f.session, f.checkpoint)).rejects.toThrow('lock');
  } finally {
    release();
    await publisher;
  }
  expect(await loadAwsCheckpoint(f.session, f.checkpoint.planId, f.checkpoint.planSha256)).toEqual(f.checkpoint);
});

test('unclassifiable plan identity cannot hide a malformed tail behind another plan', async () => {
  const f = await fixture();
  await saveAwsCheckpoint(f.session, f.checkpoint);
  await writeFile(
    join(f.directory, 'unclassified.aws-ce-checkpoint.log'),
    JSON.stringify({ kind: 'aws-ce-checkpoint', checkpoint: {} }),
    { mode: 0o600 },
  );
  await expect(loadAwsCheckpoint(f.session, f.checkpoint.planId, f.checkpoint.planSha256)).rejects.toThrow('identity');
});
test('the same plan cannot publish a checkpoint under a different engine', async () => {
  const f = await fixture();
  await saveAwsCheckpoint(f.session, f.checkpoint);
  await expect(saveAwsCheckpoint(f.session, { ...f.checkpoint, engine: 'terraform' })).rejects.toThrow('engine');
});
