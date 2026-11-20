import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { prepareOriginalGcpCampaignAccess, readOriginalGcpCampaignAccess } from '../src/gcp-campaign-access';
import { monitorOriginalInputs } from '../src/original-input-monitor';

/** Required host qualification, separate from portable unit tests. Missing OpenSSH is an unmet gate. */
export async function qualifyGcpCampaignOpenSsh(selected: string | null = Bun.which('ssh-keygen')) {
  if (!selected || !isAbsolute(selected)) throw new Error('OpenSSH key format qualification prerequisite unavailable');
  const executable = await realpath(selected),
    file = await lstat(executable);
  if (!file.isFile() || file.isSymbolicLink() || !(file.mode & 0o111) || file.mode & 0o022)
    throw new Error('Verified OpenSSH executable required');
  const executableSha256 = createHash('sha256')
    .update(await readFile(executable))
    .digest('hex');
  const root = await mkdtemp(join(tmpdir(), 'gcp-openssh-qualification-'));
  try {
    const store = await CeDeploymentStore.open(root, {
      deploymentId: 'example-key-format',
      provider: 'gcp',
      engine: 'terraform',
      account: 'example-project',
      region: 'northamerica-northeast1',
    });
    const request = { platformContext: 'example-context', sshSourceCidr: '192.0.2.4/32' };
    const access = await prepareOriginalGcpCampaignAccess(store, request);
    const original = await readOriginalGcpCampaignAccess(store, request);
    const monitor = await monitorOriginalInputs(original.inputs);
    try {
      for (const [name, publicKey] of [
        ['ce_key', access.cePublicKey],
        ['observer_key', access.observerPublicKey],
      ]) {
        await monitor.assertOriginal();
        const child = Bun.spawn([executable, '-y', '-f', original.inputs[name].path], {
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
        });
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        await monitor.assertOriginal();
        if (exitCode !== 0 || stderr || stdout !== `${publicKey}\n`)
          throw new Error('Independent OpenSSH key format qualification failed');
      }
      if (
        createHash('sha256')
          .update(await readFile(executable))
          .digest('hex') !== executableSha256
      )
        throw new Error('Original OpenSSH executable changed during qualification');
      return Object.freeze({
        schemaVersion: 1,
        kind: 'gcp-campaign-openssh-host-qualification',
        executableSha256,
        validatedKeys: 2,
        managedCloudSubmissions: 0,
        guestAcceptanceComplete: false,
      });
    } finally {
      monitor.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--ssh-keygen'))
    throw new Error('Use --ssh-keygen with one original absolute executable path');
  console.log(JSON.stringify(await qualifyGcpCampaignOpenSsh(args[1] ?? Bun.which('ssh-keygen'))));
}
