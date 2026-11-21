import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { type SessionManagerLike, verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import type { AzureCePlan } from './types';

const memory = new WeakMap<SessionManagerLike, Record<string, unknown>[]>();

/** Record only after the public outcome artifact has actually persisted. */
export async function saveAzureTerraformOutcome(
  session: SessionManagerLike,
  result: Record<string, unknown>,
): Promise<string> {
  const id = await session.saveArtifact(JSON.stringify(result), 'azure-ce-terraform-checkpoint');
  if (!id) throw Error('Azure Terraform outcome artifact persistence failed; checkpoint is retained');
  const rows = memory.get(session) ?? [];
  rows.push(structuredClone(result));
  memory.set(session, rows);
  return id;
}

/** Only a successful exhaustive public namespace search can report absence. */
export class AzureTerraformOutcomeAbsent extends Error {
  readonly code = 'ENOENT';
  constructor() {
    super('Azure Terraform prior public execution outcome is absent');
  }
}

/** Read the complete native namespace before selecting an outcome. Collection time and
 * filesystem custody establish neither current operational health nor CE heartbeats. */
export async function loadAzureTerraformOutcome(
  session: SessionManagerLike,
  source: AzureCePlan,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const original = structuredClone(source);
  verifyAzureCePlan(original);
  if (original.engine !== 'terraform') throw Error('Azure Terraform outcome requires its owning engine');
  const callbacks = [session.getSessionId, session.getArtifactsDir, session.getArtifactPath, session.saveArtifact];
  const sessionId = session.getSessionId(),
    directory = session.getArtifactsDir();
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    if (
      canonicalSha256(source) !== canonicalSha256(original) ||
      session.getSessionId() !== sessionId ||
      session.getArtifactsDir() !== directory ||
      callbacks.some(
        (callback, index) =>
          callback !==
          [session.getSessionId, session.getArtifactsDir, session.getArtifactPath, session.saveArtifact][index],
      )
    )
      throw Error('Azure Terraform public outcome context changed during inspection');
  };
  const step = async <T>(task: () => Promise<T>): Promise<T> => {
    seal();
    const canceled = Promise.withResolvers<never>(),
      onAbort = () => canceled.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), canceled.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const matches = (row: Record<string, unknown>) =>
    row.planSha256 === original.planSha256 && row.planId === original.planId;
  seal();
  if (directory === null) {
    const snapshot = structuredClone(memory.get(session) ?? []);
    const outcome = snapshot.findLast(matches);
    seal();
    if (canonicalSha256(memory.get(session) ?? []) !== canonicalSha256(snapshot))
      throw Error('Azure Terraform memory outcome inventory changed');
    if (outcome) return structuredClone(outcome);
    // A nonpersistent context cannot establish exhaustive native absence.
    throw Error('Azure Terraform prior public execution outcome is unavailable');
  }
  try {
    const rootIdentity = async () => {
      const stat = await step(() => lstat(directory));
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        stat.uid !== process.getuid?.() ||
        (await step(() => realpath(directory))) !== resolve(directory)
      )
        throw Error('Azure Terraform public outcome directory identity differs');
      return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}:${stat.uid}`;
    };
    const root = await rootIdentity();
    const names = async () =>
      (await step(() => readdir(directory)))
        .filter((name) => name.endsWith('.azure-ce-terraform-checkpoint.log'))
        .sort()
        .reverse();
    const files = await names();
    const inspect = async (name: string) =>
      step(async () => {
        const path = join(directory, name),
          file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const before = await file.stat();
          if (
            !before.isFile() ||
            before.nlink !== 1 ||
            before.uid !== process.getuid?.() ||
            before.size > 32 * 1024 * 1024
          )
            throw Error('Azure Terraform public outcome packet identity differs');
          const bytes = await file.readFile(),
            after = await file.stat(),
            named = await lstat(path);
          const identity = (stat: typeof before) =>
            `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.birthtimeMs}:${stat.uid}:${stat.nlink}`;
          if (
            !named.isFile() ||
            named.isSymbolicLink() ||
            identity(before) !== identity(after) ||
            identity(before) !== identity(named) ||
            bytes.length !== before.size
          )
            throw Error('Azure Terraform public outcome packet changed during native read');
          let value: unknown;
          try {
            value = JSON.parse(bytes.toString());
          } catch {
            throw Error('Azure Terraform public outcome is malformed');
          }
          if (!value || typeof value !== 'object' || Array.isArray(value))
            throw Error('Azure Terraform public outcome is malformed');
          return {
            row: value as Record<string, unknown>,
            identity: identity(before),
            sha256: createHash('sha256').update(bytes).digest('hex'),
          };
        } finally {
          await file.close();
        }
      });
    const packets = [];
    for (const name of files) packets.push({ name, ...(await inspect(name)) });
    // Re-read every packet, including unselected generations, before returning or reporting absence.
    for (const packet of packets) {
      const current = await inspect(packet.name);
      if (current.identity !== packet.identity || current.sha256 !== packet.sha256)
        throw Error('Azure Terraform public outcome inventory changed during inspection');
    }
    if (canonicalSha256(await names()) !== canonicalSha256(files) || (await rootIdentity()) !== root)
      throw Error('Azure Terraform public outcome namespace changed during inspection');
    seal();
    const outcome = packets.find((packet) => matches(packet.row));
    if (outcome) return structuredClone(outcome.row);
    throw new AzureTerraformOutcomeAbsent();
  } catch (error) {
    deadline.throwIfAborted();
    if (error instanceof AzureTerraformOutcomeAbsent) throw error;
    // A failed file/directory read is missing evidence, never a completed absence search.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw Error('Azure Terraform public outcome evidence is unavailable', { cause: error });
    throw error;
  }
}
