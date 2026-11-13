import { createHash, randomUUID } from 'node:crypto';
import { lstat, readdir, readFile, readlink, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encode, type IndependentCleanupEvidence } from './cleanup-verifier-worker';
import { verifyRetainedCleanup } from './independent-cleanup';

const markerName = 'artifact-retirement.json';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
interface Artifact {
  path: string;
  kind: 'file' | 'directory' | 'symlink';
  sha256?: string;
}
interface Marker {
  schemaVersion: 1;
  status: 'retiring' | 'runner-artifacts-retired';
  manifestSha256: string;
  evidenceSha256: string;
  finalPlanSha256: string;
  planReceiptSha256: string;
  artifacts: Artifact[];
  inventorySha256: string;
  independentCleanup: IndependentCleanupEvidence;
  independentCleanupSha256: string;
}
export interface ArtifactRetirementReceipt {
  status: 'runner-artifacts-retired';
  manifestSha256: string;
  evidenceSha256: string;
  finalPlanSha256: string;
  inventorySha256: string;
  retiredArtifacts: number;
  independentCleanupSha256: string;
}
/** Internal authenticated barrier observation. No cloud absence or parent retirement claim. */
export type ArtifactRetirementProvenance =
  | { status: 'absent' }
  | { status: 'retiring'; markerSha256: string; remainingArtifacts: number; independentCleanupSha256: string }
  | { status: 'runner-artifacts-retired'; markerSha256: string; receipt: ArtifactRetirementReceipt };
interface Binding {
  manifestSha256: string;
  evidenceSha256: string;
  finalPlanSha256: string;
  planReceiptSha256: string;
}
const exactKeys = (value: unknown, keys: string[]): boolean =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
function validateMarker(marker: Marker, binding: Binding) {
  if (
    !exactKeys(marker, [
      'schemaVersion',
      'status',
      'manifestSha256',
      'evidenceSha256',
      'finalPlanSha256',
      'planReceiptSha256',
      'artifacts',
      'inventorySha256',
      'independentCleanup',
      'independentCleanupSha256',
    ]) ||
    marker.schemaVersion !== 1 ||
    (marker.status !== 'retiring' && marker.status !== 'runner-artifacts-retired') ||
    marker.manifestSha256 !== binding.manifestSha256 ||
    marker.evidenceSha256 !== binding.evidenceSha256 ||
    marker.finalPlanSha256 !== binding.finalPlanSha256 ||
    marker.planReceiptSha256 !== binding.planReceiptSha256 ||
    !Array.isArray(marker.artifacts) ||
    marker.inventorySha256 !== hash(JSON.stringify(marker.artifacts))
  )
    throw Error('Terraform artifact retirement belongs to different evidence');
  const seen = new Map<string, Artifact>();
  for (const artifact of marker.artifacts) {
    if (
      !artifact ||
      !exactKeys(artifact, artifact.kind === 'directory' ? ['path', 'kind'] : ['path', 'kind', 'sha256']) ||
      typeof artifact.path !== 'string' ||
      artifact.path.includes('\\') ||
      artifact.path.split('/').some((part) => !part || part === '.' || part === '..') ||
      ['deployment.json', markerName, '.runner-lock'].includes(artifact.path.split('/')[0]) ||
      (artifact.kind !== 'file' && artifact.kind !== 'directory' && artifact.kind !== 'symlink') ||
      (artifact.kind !== 'directory' && !sha(artifact.sha256)) ||
      seen.has(artifact.path)
    )
      throw Error('Terraform artifact retirement inventory is malformed');
    const parent = artifact.path.slice(0, artifact.path.lastIndexOf('/'));
    if (artifact.path.includes('/') && seen.get(parent)?.kind !== 'directory')
      throw Error('Terraform artifact retirement inventory parent is malformed');
    seen.set(artifact.path, artifact);
  }
  verifyRetainedCleanup(marker.independentCleanup, { ...binding }, marker.independentCleanupSha256);
}
function receiptFor(marker: Marker): ArtifactRetirementReceipt {
  return {
    status: 'runner-artifacts-retired',
    manifestSha256: marker.manifestSha256,
    evidenceSha256: marker.evidenceSha256,
    finalPlanSha256: marker.finalPlanSha256,
    inventorySha256: marker.inventorySha256,
    retiredArtifacts: marker.artifacts.length,
    independentCleanupSha256: marker.independentCleanupSha256,
  };
}
async function readMarker(directory: string, binding: Binding): Promise<{ marker: Marker; bytes: Buffer } | undefined> {
  let stat: import('node:fs').Stats;
  try {
    stat = await lstat(join(directory, markerName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.uid !== process.getuid?.() ||
    stat.mode & 0o077
  )
    throw Error('Terraform artifact retirement marker ownership differs');
  const bytes = await readFile(join(directory, markerName));
  const marker: Marker = JSON.parse(bytes.toString());
  validateMarker(marker, binding);
  const after = await lstat(join(directory, markerName));
  if (
    after.dev !== stat.dev ||
    after.ino !== stat.ino ||
    after.size !== stat.size ||
    after.mtimeMs !== stat.mtimeMs ||
    after.ctimeMs !== stat.ctimeMs ||
    after.mode !== stat.mode ||
    after.uid !== stat.uid ||
    after.nlink !== stat.nlink
  )
    throw Error('Terraform artifact retirement marker changed during observation');
  return { marker, bytes };
}
function validateRemaining(marker: Marker, remaining: Artifact[]) {
  const expected = new Map(marker.artifacts.map((row) => [row.path, row]));
  if (
    (marker.status === 'runner-artifacts-retired' && remaining.length) ||
    remaining.some((row) => JSON.stringify(row) !== JSON.stringify(expected.get(row.path)))
  )
    throw Error('Terraform artifact retirement inventory changed');
}
/** Runner holds its deployment lock and verifies the persisted owner before this read. */
export async function readPrivateArtifactRetirement(
  directory: string,
  manifestSha256: string,
  evidenceSha256: string,
  finalPlanSha256: string,
  planReceiptSha256: string,
  signal?: AbortSignal,
): Promise<ArtifactRetirementProvenance> {
  signal?.throwIfAborted();
  const binding = { manifestSha256, evidenceSha256, finalPlanSha256, planReceiptSha256 };
  if (!Object.values(binding).every(sha)) throw Error('Terraform artifact retirement evidence is unresolved');
  const first = await readMarker(directory, binding);
  if (!first) {
    signal?.throwIfAborted();
    if (await hasArtifactRetirement(directory))
      throw Error('Terraform artifact retirement appeared during observation');
    return { status: 'absent' };
  }
  const remaining = await inventory(directory);
  validateRemaining(first.marker, remaining);
  const second = await readMarker(directory, binding);
  if (!second?.bytes.equals(first.bytes) || JSON.stringify(await inventory(directory)) !== JSON.stringify(remaining))
    throw Error('Terraform artifact retirement changed during observation');
  signal?.throwIfAborted();
  const markerSha256 = hash(first.bytes);
  return first.marker.status === 'runner-artifacts-retired'
    ? { status: 'runner-artifacts-retired', markerSha256, receipt: receiptFor(first.marker) }
    : {
        status: 'retiring',
        markerSha256,
        remainingArtifacts: remaining.length,
        independentCleanupSha256: first.marker.independentCleanupSha256,
      };
}
async function item(directory: string, path: string): Promise<Artifact> {
  const full = join(directory, path),
    stat = await lstat(full);
  if (stat.uid !== process.getuid?.()) throw Error('Terraform retirement artifact ownership differs');
  if (stat.isSymbolicLink()) return { path, kind: 'symlink', sha256: hash(await readlink(full)) };
  if (stat.isDirectory()) return { path, kind: 'directory' };
  if (!stat.isFile() || stat.nlink !== 1) throw Error('Terraform retirement artifact type or ownership differs');
  return { path, kind: 'file', sha256: hash(await readFile(full)) };
}
async function inventory(directory: string): Promise<Artifact[]> {
  const result: Artifact[] = [];
  const walk = async (prefix: string) => {
    for (const name of (await readdir(join(directory, prefix))).sort()) {
      if (!prefix && ['deployment.json', markerName, '.runner-lock'].includes(name)) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      const artifact = await item(directory, path);
      result.push(artifact);
      if (artifact.kind === 'directory') await walk(path);
    }
  };
  await walk('');
  return result;
}
async function writeMarker(directory: string, marker: Marker) {
  const temporary = join(directory, `retirement-${randomUUID()}.new`);
  try {
    await writeFile(temporary, JSON.stringify(marker), { flag: 'wx', mode: 0o600 });
    await rename(temporary, join(directory, markerName));
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
export async function hasArtifactRetirement(directory: string) {
  try {
    await lstat(join(directory, markerName));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return false;
  }
}
/** Called only after runner-owned empty-state and exact refreshed-plan validation.
 * External cloud/F5 absence remains the caller's separate evidence obligation.
 * No links are followed; deletion is nonrecursive and scoped to the recorded inventory.
 */
export async function retirePrivateArtifacts(
  directory: string,
  manifestSha256: string,
  evidenceSha256: string,
  finalPlanSha256: string,
  planReceiptSha256: string,
  signal?: AbortSignal,
  independentCleanup?: IndependentCleanupEvidence,
): Promise<ArtifactRetirementReceipt> {
  signal?.throwIfAborted();
  if (![manifestSha256, evidenceSha256, finalPlanSha256, planReceiptSha256].every(sha))
    throw Error('Terraform artifact retirement evidence is unresolved');
  let marker: Marker;
  if (await hasArtifactRetirement(directory)) {
    const observed = await readMarker(directory, {
      manifestSha256,
      evidenceSha256,
      finalPlanSha256,
      planReceiptSha256,
    });
    if (!observed) throw Error('Terraform artifact retirement marker disappeared');
    marker = observed.marker;
  } else {
    if (!independentCleanup) throw Error('Independent original Terraform cleanup evidence is required');
    const artifacts = await inventory(directory);
    marker = {
      schemaVersion: 1,
      status: 'retiring',
      manifestSha256,
      evidenceSha256,
      finalPlanSha256,
      planReceiptSha256,
      artifacts,
      inventorySha256: hash(JSON.stringify(artifacts)),
      independentCleanup,
      independentCleanupSha256: hash(encode(independentCleanup)),
    };
    validateMarker(marker, { manifestSha256, evidenceSha256, finalPlanSha256, planReceiptSha256 });
    signal?.throwIfAborted();
    await writeMarker(directory, marker); // Permanent execution barrier precedes the first removal.
  }
  verifyRetainedCleanup(
    marker.independentCleanup,
    { manifestSha256, evidenceSha256, finalPlanSha256, planReceiptSha256 },
    marker.independentCleanupSha256,
  );
  const remaining = await inventory(directory);
  validateRemaining(marker, remaining);
  for (const artifact of [...remaining].reverse()) {
    signal?.throwIfAborted();
    if (JSON.stringify(await item(directory, artifact.path)) !== JSON.stringify(artifact))
      throw Error('Terraform artifact retirement inventory changed during removal');
    if (artifact.kind === 'directory') await rmdir(join(directory, artifact.path));
    else await unlink(join(directory, artifact.path));
  }
  if ((await inventory(directory)).length) throw Error('Terraform artifact retirement is incomplete');
  if (marker.status !== 'runner-artifacts-retired') {
    marker.status = 'runner-artifacts-retired';
    await writeMarker(directory, marker);
  }
  return receiptFor(marker);
}
