import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type CleanupRequest,
  encode,
  executableIdentity,
  hash,
  type IndependentCleanupEvidence,
  inputDigests,
  workerDigest,
} from './cleanup-verifier-worker';

export type CleanupVerifier = (
  request: CleanupRequest,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) => Promise<IndependentCleanupEvidence>;
const sha = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const evidenceKeys =
  'commands,completedAt,evidenceSha256,executorPid,finalPlanSha256,inputInventorySha256,interpreterSha256,manifestSha256,nonce,originalPlanJsonSha256,parentPid,planReceiptSha256,refreshedPlanJsonSha256,refreshedPlanSha256,requestSha256,schemaVersion,startedAt,stateJsonSha256,status,terraformExecutablePathSha256,terraformExecutableSha256,terraformVersion,workerSha256';
export function validateIndependentCleanup(value: unknown, request: CleanupRequest): IndependentCleanupEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Independent cleanup evidence is missing or malformed');
  const evidence = value as IndependentCleanupEvidence,
    began = Date.parse(evidence.startedAt),
    completed = Date.parse(evidence.completedAt);
  if (
    Object.keys(evidence).sort().join(',') !== evidenceKeys ||
    evidence.schemaVersion !== 1 ||
    evidence.status !== 'independently-verified' ||
    evidence.nonce !== request.nonce ||
    evidence.requestSha256 !== hash(encode(request)) ||
    !Number.isFinite(began) ||
    !Number.isFinite(completed) ||
    began < Date.parse(request.startedAt) ||
    completed < began ||
    completed > Date.now() ||
    completed > Date.parse(request.deadline) ||
    Date.now() - completed > 60000 ||
    !Number.isSafeInteger(evidence.executorPid) ||
    evidence.executorPid <= 0 ||
    evidence.executorPid === request.parentPid ||
    evidence.parentPid !== request.parentPid
  )
    throw Error('Independent cleanup evidence is stale, replayed or foreign');
  const bindings = {
    manifestSha256: request.manifestSha256,
    evidenceSha256: request.evidenceSha256,
    finalPlanSha256: request.finalPlanSha256,
    planReceiptSha256: request.planReceiptSha256,
    inputInventorySha256: hash(encode(request.inputs)),
    terraformExecutableSha256: request.terraform.sha256,
    terraformExecutablePathSha256: hash(request.terraform.path),
    interpreterSha256: request.interpreter.sha256,
    workerSha256: request.workerSha256,
  };
  if (
    Object.entries(bindings).some(
      ([key, expected]) => evidence[key as keyof IndependentCleanupEvidence] !== expected,
    ) ||
    ![
      evidence.stateJsonSha256,
      evidence.originalPlanJsonSha256,
      evidence.refreshedPlanSha256,
      evidence.refreshedPlanJsonSha256,
    ].every(sha) ||
    !/^\d+\.\d+\.\d+$/.test(evidence.terraformVersion) ||
    encode(evidence.commands) !==
      encode([
        ['version', '-json'],
        ['show', '-json', 'saved.tfplan'],
        ['show', '-json'],
        [
          'plan',
          '-input=false',
          '-lock=true',
          '-lock-timeout=60s',
          '-refresh=true',
          `-out=independent-cleanup-${request.nonce}.tfplan`,
        ],
        ['show', '-json', `independent-cleanup-${request.nonce}.tfplan`],
      ])
  )
    throw Error('Independent cleanup evidence identities or execution differ');
  return evidence;
}
/** Retained evidence may be old only after the permanent retirement barrier exists.
 * This validates provenance for idempotent removal; it does not authorize fresh execution.
 */
export function verifyRetainedCleanup(value: unknown, bindings: Record<string, string>, expectedSha256: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Independent cleanup retirement evidence is missing');
  const evidence = value as IndependentCleanupEvidence;
  if (
    Object.keys(evidence).sort().join(',') !== evidenceKeys ||
    evidence.schemaVersion !== 1 ||
    evidence.status !== 'independently-verified' ||
    !sha(expectedSha256) ||
    hash(encode(evidence)) !== expectedSha256 ||
    Object.entries(bindings).some(
      ([key, expected]) => evidence[key as keyof IndependentCleanupEvidence] !== expected,
    ) ||
    ![
      evidence.nonce,
      evidence.requestSha256,
      evidence.inputInventorySha256,
      evidence.terraformExecutableSha256,
      evidence.terraformExecutablePathSha256,
      evidence.interpreterSha256,
      evidence.workerSha256,
      evidence.stateJsonSha256,
      evidence.originalPlanJsonSha256,
      evidence.refreshedPlanSha256,
      evidence.refreshedPlanJsonSha256,
    ].every(sha) ||
    !Number.isFinite(Date.parse(evidence.startedAt)) ||
    !Number.isFinite(Date.parse(evidence.completedAt)) ||
    Date.parse(evidence.completedAt) < Date.parse(evidence.startedAt) ||
    !Number.isSafeInteger(evidence.parentPid) ||
    evidence.parentPid <= 0 ||
    !Number.isSafeInteger(evidence.executorPid) ||
    evidence.executorPid <= 0 ||
    evidence.executorPid === evidence.parentPid ||
    !/^\d+\.\d+\.\d+$/.test(evidence.terraformVersion) ||
    encode(evidence.commands) !==
      encode([
        ['version', '-json'],
        ['show', '-json', 'saved.tfplan'],
        ['show', '-json'],
        [
          'plan',
          '-input=false',
          '-lock=true',
          '-lock-timeout=60s',
          '-refresh=true',
          `-out=independent-cleanup-${evidence.nonce}.tfplan`,
        ],
        ['show', '-json', `independent-cleanup-${evidence.nonce}.tfplan`],
      ])
  )
    throw Error('Independent cleanup retirement provenance differs');
  return evidence;
}
export async function cleanupRequest(
  directory: string,
  bindings: Pick<
    CleanupRequest,
    'manifestSha256' | 'evidenceSha256' | 'finalPlanSha256' | 'planReceiptSha256' | 'terraform'
  >,
): Promise<CleanupRequest> {
  return {
    schemaVersion: 1,
    nonce: randomBytes(32).toString('hex'),
    startedAt: new Date().toISOString(),
    deadline: new Date(Date.now() + 300000).toISOString(),
    parentPid: process.pid,
    directory,
    ...bindings,
    inputs: await inputDigests(directory),
    interpreter: await executableIdentity(process.execPath),
    workerSha256: await workerDigest(),
  };
}
async function liveGroup(pgid: number) {
  const probe = Bun.spawn(['/bin/ps', '-eo', 'uid=,pgid=,stat='], { stdout: 'pipe', stderr: 'pipe' });
  const output = await new Response(probe.stdout).text();
  await new Response(probe.stderr).text();
  if ((await probe.exited) !== 0) throw Error('Independent cleanup process group inspection failed');
  return output
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((row) => Number(row[1]) === pgid && !row[2]?.startsWith('Z'));
}
/** A distinct process owns the original-input checks. The whole process group is bounded. */
export const executeIndependentCleanup: CleanupVerifier = async (request, ambient, signal) => {
  signal?.throwIfAborted();
  const worker = fileURLToPath(new URL('./cleanup-verifier-entry.ts', import.meta.url));
  if (
    (await workerDigest()) !== request.workerSha256 ||
    encode(await executableIdentity(request.interpreter.path)) !== encode(request.interpreter)
  )
    throw Error('Independent cleanup worker identity changed');
  signal?.throwIfAborted();
  return await new Promise((accept, reject) => {
    const env = Object.fromEntries(
      Object.entries(ambient).filter(([key, value]) => !key.startsWith('TF_') && value !== undefined),
    ) as Record<string, string>;
    const child = spawn(request.interpreter.path, [worker], {
      cwd: request.directory,
      env,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [],
      diagnostics: Buffer[] = [];
    let size = 0,
      failed = false,
      escalation: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') failed = true;
      }
    };
    const stop = () => {
      if (failed) return;
      failed = true;
      kill('SIGTERM');
      escalation = setTimeout(() => kill('SIGKILL'), 2000);
    };
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    const timer = setTimeout(stop, Math.max(1, Date.parse(request.deadline) - Date.now()));
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 65536) stop();
      if (!failed) chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 65536) stop();
      if (!failed) diagnostics.push(chunk);
    });
    child.stdin.on('error', stop);
    child.on('error', stop);
    child.on('close', async (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      try {
        if (!child.pid) throw Error('Independent cleanup process identity unavailable');
        const live = await liveGroup(child.pid);
        if (live.length) {
          failed = true;
          if (live.some((row) => Number(row[0]) !== process.getuid?.()))
            throw Error('Independent cleanup process group ownership differs');
          kill('SIGKILL');
          const deadline = Date.now() + 2000;
          while ((await liveGroup(child.pid)).length) {
            if (Date.now() >= deadline) throw Error('Independent cleanup process group remains active');
            await Bun.sleep(20);
          }
        }
        if (failed || code !== 0) throw Error('Independent original Terraform cleanup verification failed');
        const evidence = validateIndependentCleanup(JSON.parse(Buffer.concat(chunks).toString('utf8')), request);
        if (evidence.executorPid !== child.pid) throw Error('Independent cleanup process identity differs');
        accept(evidence);
      } catch {
        try {
          await writeFile(
            join(request.directory, `cleanup-verifier-failure-${request.nonce}.json`),
            JSON.stringify({ schemaVersion: 1, exitCode: code, stderr: Buffer.concat(diagnostics).toString('utf8') }),
            { mode: 0o600, flag: 'wx' },
          );
        } catch {
          reject(Error('Independent cleanup failed and private diagnostics could not be retained'));
          return;
        }
        reject(Error('Independent original Terraform cleanup verification failed'));
      } finally {
        if (escalation) clearTimeout(escalation);
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
};
