import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Continue only a matching pre-run preparation whose runner directory never
 * existed. Any execution/authorization evidence keeps the original resume path.
 */
export async function resolveGcpTerraformPreparationResume(
  store: { directory: string; verify(): Promise<void> },
  deploymentId: string,
  resume: boolean | 'current',
): Promise<boolean | 'current'> {
  if (!resume) return false;
  await store.verify();
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(deploymentId)) throw new Error('Original preparation identity required');
  try {
    const existing = await lstat(join(store.directory, deploymentId));
    if (!existing.isDirectory() || existing.isSymbolicLink())
      throw new Error('Original runner directory differs; reconcile preparation');
    return resume;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const required = ['owner.json', 'gcp-terraform-input-identity.json', 'gcp-terraform-session-inputs.json'];
  const allowed = new Set([...required, 'gcp-campaign-access', 'google-runtime-mode.json']);
  const snapshot = async () => {
    const names = (await readdir(store.directory)).sort();
    if (required.some((name) => !names.includes(name)) || names.some((name) => !allowed.has(name)))
      throw new Error('Original preparation has missing or additional evidence; reconcile without recreation');
    const records = [];
    for (const name of ['', ...names]) {
      const stat = await lstat(join(store.directory, name), { bigint: true });
      const directory = name === '' || name === 'gcp-campaign-access';
      if (
        stat.isSymbolicLink() ||
        (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1n) ||
        stat.uid !== BigInt(process.getuid?.() ?? -1) ||
        (stat.mode & 0o022n) !== 0n
      )
        throw new Error('Original preparation record differs; reconcile without recreation');
      const fields = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'] as const;
      records.push([name, ...fields.map((key) => stat[key].toString())]);
    }
    return JSON.stringify(records);
  };
  const before = await snapshot();
  await store.verify();
  let after: string;
  try {
    after = await snapshot();
  } catch {
    throw new Error('Original preparation changed; reconcile without recreation');
  }
  if (before !== after) throw new Error('Original preparation changed; reconcile without recreation');
  // Runner.prepare uses exclusive mkdir/writes, so concurrent actors cannot
  // overwrite an initialized directory or consume an existing execution slot.
  return false;
}
