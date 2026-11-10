import { createHash, randomUUID } from 'node:crypto';
import { lstat, readdir, readFile, readlink, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
}
export interface ArtifactRetirementReceipt {
  status: 'runner-artifacts-retired';
  manifestSha256: string;
  evidenceSha256: string;
  finalPlanSha256: string;
  inventorySha256: string;
  retiredArtifacts: number;
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
): Promise<ArtifactRetirementReceipt> {
  signal?.throwIfAborted();
  if (![manifestSha256, evidenceSha256, finalPlanSha256, planReceiptSha256].every(sha))
    throw Error('Terraform artifact retirement evidence is unresolved');
  let marker: Marker;
  if (await hasArtifactRetirement(directory)) {
    const stat = await lstat(join(directory, markerName));
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.uid !== process.getuid?.() ||
      stat.mode & 0o077
    )
      throw Error('Terraform artifact retirement marker ownership differs');
    marker = JSON.parse((await readFile(join(directory, markerName))).toString());
    if (
      marker?.schemaVersion !== 1 ||
      !['retiring', 'runner-artifacts-retired'].includes(marker.status) ||
      marker.manifestSha256 !== manifestSha256 ||
      marker.evidenceSha256 !== evidenceSha256 ||
      marker.finalPlanSha256 !== finalPlanSha256 ||
      marker.planReceiptSha256 !== planReceiptSha256 ||
      !Array.isArray(marker.artifacts) ||
      marker.inventorySha256 !== hash(JSON.stringify(marker.artifacts))
    )
      throw Error('Terraform artifact retirement belongs to different evidence');
    const seen = new Set<string>();
    for (const artifact of marker.artifacts) {
      if (
        !artifact ||
        typeof artifact.path !== 'string' ||
        artifact.path.split('/').some((part) => !part || part === '.' || part === '..') ||
        ['deployment.json', markerName, '.runner-lock'].includes(artifact.path.split('/')[0]) ||
        !['file', 'directory', 'symlink'].includes(artifact.kind) ||
        (artifact.kind === 'directory' ? artifact.sha256 !== undefined : !sha(artifact.sha256)) ||
        seen.has(artifact.path)
      )
        throw Error('Terraform artifact retirement inventory is malformed');
      seen.add(artifact.path);
    }
  } else {
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
    };
    signal?.throwIfAborted();
    await writeMarker(directory, marker); // Permanent execution barrier precedes the first removal.
  }
  const remaining = await inventory(directory),
    expected = new Map(marker.artifacts.map((row) => [row.path, row]));
  if (
    (marker.status === 'runner-artifacts-retired' && remaining.length) ||
    remaining.some((row) => JSON.stringify(row) !== JSON.stringify(expected.get(row.path)))
  )
    throw Error('Terraform artifact retirement inventory changed');
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
  return {
    status: 'runner-artifacts-retired',
    manifestSha256,
    evidenceSha256,
    finalPlanSha256,
    inventorySha256: marker.inventorySha256,
    retiredArtifacts: marker.artifacts.length,
  };
}
