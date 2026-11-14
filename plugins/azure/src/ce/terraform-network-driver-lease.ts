import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';

declare const driverLeaseBrand: unique symbol;
export type AzureTerraformNetworkDriverLease = { readonly [driverLeaseBrand]: true };
type Ownership = { directory: string; claimSha256: string; active: boolean };
const ownership = new WeakMap<AzureTerraformNetworkDriverLease, Ownership>();
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network driver lease: ${message}`);
}
function held(lease: AzureTerraformNetworkDriverLease, directory: string) {
  const current = ownership.get(lease);
  require(current?.active && current.directory === directory, 'active exact owning lease required');
  return current;
}
export function assertAzureTerraformNetworkDriverLease(lease: AzureTerraformNetworkDriverLease, directory: string) {
  held(lease, directory);
}
async function claimBytes(directory: string) {
  const path = join(directory, '.terraform-network-driver-lock'),
    claim = join(path, 'claim.json'),
    stat = await lstat(path);
  require(stat.isDirectory() &&
    !stat.isSymbolicLink() &&
    stat.uid === process.getuid?.() &&
    (stat.mode & 0o077) === 0 &&
    (await realpath(path)) === path, 'driver lock private directory differs');
  const file = await lstat(claim);
  require(file.isFile() &&
    !file.isSymbolicLink() &&
    file.nlink === 1 &&
    file.uid === process.getuid?.() &&
    (file.mode & 0o077) === 0, 'driver lock private claim differs');
  return readFile(claim);
}
/** Only actual acquisition issues a lease. Callers cannot substitute a path, PID or boolean.
 * Its process-bound immutable claim remains authenticated through serial power operations.
 */
export async function acquireAzureTerraformNetworkDriverLease(directory: string) {
  const unlock = await acquireProcessLock(join(directory, '.terraform-network-driver-lock'));
  try {
    const claimSha256 = hash(await claimBytes(directory)),
      lease = Object.freeze({}) as AzureTerraformNetworkDriverLease,
      current: Ownership = { directory, claimSha256, active: true };
    ownership.set(lease, current);
    return {
      lease,
      async release() {
        held(lease, directory);
        current.active = false;
        await unlock();
      },
    };
  } catch (error) {
    await unlock();
    throw error;
  }
}
export async function verifyAzureTerraformNetworkDriverLease(
  lease: AzureTerraformNetworkDriverLease,
  directory: string,
) {
  const current = held(lease, directory),
    expected = current.claimSha256;
  require(hash(await claimBytes(directory)) === expected, 'original owning driver claim changed');
  require(held(lease, directory) === current &&
    current.claimSha256 === expected, 'driver ownership changed during verification');
}
