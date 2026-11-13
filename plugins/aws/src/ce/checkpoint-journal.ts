import type { Stats } from 'node:fs';
import { lstat, mkdir, readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { AwsCeSessionManager } from './artifacts';
import { canonicalSha256 } from './canonical';
import { AWS_CE_SCHEMA_VERSION, type AwsCeCheckpoint } from './types';

interface Record {
  kind: 'aws-ce-checkpoint';
  checkpoint: AwsCeCheckpoint;
  journal: { schemaVersion: 1; sequence: number; previousSha256: string | null };
  sha256: string;
}
const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = (value: unknown): value is { [key: string]: unknown } =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function checkpoint(value: unknown): asserts value is AwsCeCheckpoint {
  if (
    !object(value) ||
    value.schemaVersion !== AWS_CE_SCHEMA_VERSION ||
    !['native', 'terraform'].includes(String(value.engine)) ||
    typeof value.planId !== 'string' ||
    !value.planId ||
    !hex(value.planSha256) ||
    !['running', 'partial', 'complete'].includes(String(value.state)) ||
    !Array.isArray(value.completedActionIds) ||
    value.completedActionIds.some((id) => typeof id !== 'string' || !id) ||
    new Set(value.completedActionIds).size !== value.completedActionIds.length ||
    !object(value.resolvedValues) ||
    Object.values(value.resolvedValues).some((v) => typeof v !== 'string')
  )
    throw Error('AWS CE checkpoint snapshot is malformed');
}
function record(value: unknown): Record {
  if (
    !object(value) ||
    value.kind !== 'aws-ce-checkpoint' ||
    !object(value.journal) ||
    value.journal.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.journal.sequence) ||
    Number(value.journal.sequence) < 1 ||
    !(value.journal.previousSha256 === null || hex(value.journal.previousSha256)) ||
    !hex(value.sha256)
  )
    throw Error('AWS CE checkpoint journal is malformed or unsupported');
  checkpoint(value.checkpoint);
  const { sha256, ...body } = value;
  if (canonicalSha256(body) !== sha256) throw Error('AWS CE checkpoint journal integrity differs');
  return value as unknown as Record;
}
async function head(directory: string, planId: string, planSha256: string): Promise<Record | undefined> {
  const rows = new Map<string, Record>();
  for (const name of await readdir(directory)) {
    if (!name.endsWith('.aws-ce-checkpoint.log')) continue;
    const path = join(directory, name),
      stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o022) !== 0
    )
      throw Error('AWS CE checkpoint artifact ownership differs');
    let value: unknown;
    try {
      value = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      throw Error('AWS CE checkpoint artifact is unreadable or malformed');
    }
    if (!object(value) || value.kind !== 'aws-ce-checkpoint' || !object(value.checkpoint))
      throw Error('AWS CE checkpoint artifact identity is malformed');
    if (typeof value.checkpoint.planId !== 'string' || !value.checkpoint.planId || !hex(value.checkpoint.planSha256))
      throw Error('AWS CE checkpoint artifact plan identity is malformed');
    if (value.checkpoint.planId !== planId || value.checkpoint.planSha256 !== planSha256) continue;
    const item = record(value);
    rows.set(item.sha256, item);
  }
  if (!rows.size) return undefined;
  const children = new Map<string, Record>(),
    roots: Record[] = [];
  for (const item of rows.values()) {
    const previous = item.journal.previousSha256;
    if (previous === null) {
      if (item.journal.sequence !== 1) throw Error('AWS CE checkpoint journal ancestry is incomplete');
      roots.push(item);
      continue;
    }
    const parent = rows.get(previous);
    if (
      !parent ||
      parent.journal.sequence + 1 !== item.journal.sequence ||
      parent.checkpoint.engine !== item.checkpoint.engine
    )
      throw Error('AWS CE checkpoint journal ancestry or engine differs');
    if (children.has(previous)) throw Error('AWS CE checkpoint journal is forked');
    children.set(previous, item);
  }
  if (roots.length !== 1) throw Error('AWS CE checkpoint journal has ambiguous roots');
  let latest = roots[0],
    count = 1;
  while (true) {
    const child = children.get(latest.sha256);
    if (!child) break;
    latest = child;
    count++;
  }
  if (count !== rows.size) throw Error('AWS CE checkpoint journal is incomplete');
  return latest;
}
async function locked<T>(
  session: AwsCeSessionManager,
  hash: string,
  create: boolean,
  run: (directory: string) => Promise<T>,
): Promise<T | undefined> {
  const directory = session.getArtifactsDir();
  if (!directory) {
    if (create) throw Error('Durable AWS CE checkpoint artifact directory is unavailable');
    return undefined;
  }
  if (!hex(hash) || !isAbsolute(directory) || resolve(directory) !== directory)
    throw Error('AWS CE checkpoint journal scope differs');
  if (create) await mkdir(directory, { recursive: true, mode: 0o700 });
  let stat: Stats;
  try {
    stat = await lstat(directory);
  } catch (error) {
    if (!create && (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.())
    throw Error('AWS CE checkpoint directory ownership differs');
  const release = await acquireProcessLock(join(directory, `.aws-ce-checkpoint-${hash}-lock`));
  try {
    return await run(directory);
  } finally {
    await release();
  }
}
export async function readAwsCheckpointJournal(
  session: AwsCeSessionManager,
  planId: string,
  hash: string,
): Promise<AwsCeCheckpoint | undefined> {
  return locked(session, hash, false, async (directory) => (await head(directory, planId, hash))?.checkpoint);
}
export async function publishAwsCheckpointJournal(
  session: AwsCeSessionManager,
  value: AwsCeCheckpoint,
): Promise<string> {
  const snapshot = JSON.parse(JSON.stringify(value));
  checkpoint(snapshot);
  const result = await locked(session, snapshot.planSha256, true, async (directory) => {
    const previous = await head(directory, snapshot.planId, snapshot.planSha256);
    if (previous && previous.checkpoint.engine !== snapshot.engine) throw Error('AWS CE checkpoint engine changed');
    const body = {
      kind: 'aws-ce-checkpoint' as const,
      checkpoint: snapshot,
      journal: {
        schemaVersion: 1 as const,
        sequence: (previous?.journal.sequence ?? 0) + 1,
        previousSha256: previous?.sha256 ?? null,
      },
    };
    const item = { ...body, sha256: canonicalSha256(body) };
    record(item);
    const id = await session.saveArtifact(JSON.stringify(item), 'aws-ce-checkpoint');
    if (typeof id !== 'string' || !id) throw Error('AWS CE checkpoint could not be persisted');
    if ((await head(directory, snapshot.planId, snapshot.planSha256))?.sha256 !== item.sha256)
      throw Error('AWS CE checkpoint publication is unavailable or ambiguous');
    return id;
  });
  if (!result) throw Error('Durable AWS CE checkpoint publication is unavailable');
  return result;
}
