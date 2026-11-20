import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { assertOriginalGcpObserverCampaignKeyContext } from './gcp-observer-campaign-key';
import { buildGcpObserverClockCommand } from './gcp-observer-clock';
import { assertOriginalGcpObserverHostTrustContext } from './gcp-observer-host-trust-reader';
import { readOriginalGcpSshClientProfile } from './gcp-ssh-client-profile';
import {
  assertOriginalApplyCallback,
  assertOriginalApplyLifetime,
  type OriginalApplyCallbackContext,
} from './installed-apply-controller';
import { readOwnedInstalledInput } from './installed-runtime';
import { monitorOriginalInputs } from './original-input-monitor';

export interface OriginalGcpObserverSshCommand {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-observer-ssh-probe-reference';
}
interface CommandView {
  readonly callback: OriginalApplyCallbackContext;
  readonly executable: { readonly path: string; readonly sha256: string };
  readonly python: { readonly path: string; readonly sha256: string };
  readonly args: readonly string[];
  readonly challenge: string;
  readonly instanceId: string;
}
const origins = new WeakMap<
  OriginalGcpObserverSshCommand,
  { read(): Promise<Readonly<CommandView>>; identity(): Promise<void>; inputs(): Promise<void>; close(): void }
>();
export async function readOriginalGcpObserverSshCommand(value: unknown) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverSshCommand) : undefined;
  if (!origin) throw new Error('Original observer SSH command required');
  return origin.read();
}
export async function assertOriginalGcpObserverSshCommandIdentity(value: unknown) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverSshCommand) : undefined;
  if (!origin) throw new Error('Original observer SSH command required');
  await origin.identity();
}
export function closeOriginalGcpObserverSshCommand(value: unknown) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverSshCommand) : undefined;
  if (!origin) throw new Error('Original observer SSH command required');
  origin.close();
}
export async function assertOriginalGcpObserverSshCommandInputs(value: unknown) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverSshCommand) : undefined;
  if (!origin) throw new Error('Original observer SSH command required');
  await origin.inputs();
}
/** Fixed, nonce-bound observer proof only. No caller target, username, remote
 * command, authentication fallback, agent, proxy or forwarding is accepted. */
export async function openOriginalGcpObserverSshCommand(
  trust: unknown,
  key: unknown,
  clients: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const originalTrust = await assertOriginalGcpObserverHostTrustContext(trust, callback);
  const originalKey = await assertOriginalGcpObserverCampaignKeyContext(key, callback);
  const profile = await readOriginalGcpSshClientProfile(clients);
  const python = callback.original.inputs.python;
  if (!python || originalTrust.instanceId !== originalKey.instanceId)
    throw new Error('Original observer host/key/Python join required');
  // OpenSSH configuration paths have token expansion semantics. This shipped
  // mapping admits literal canonical installation paths only.
  for (const path of [originalTrust.knownHosts.path, originalKey.key.path, profile.files.ssh.path])
    if (!/^\/[A-Za-z0-9_./-]+$/.test(path)) throw new Error('Literal original SSH input path required');
  const root = join(callback.original.executionDirectory, `gcp-observer-ssh-${randomUUID()}`);
  await mkdir(root, { mode: 0o700 });
  const configPath = join(root, 'ssh_config.private');
  if (!/^\/[A-Za-z0-9_./-]+$/.test(configPath)) throw new Error('Literal original SSH configuration path required');
  const configFile = await open(configPath, 'wx', 0o400);
  try {
    await configFile.writeFile('# xcsh original observer SSH configuration\n');
    await configFile.sync();
  } finally {
    await configFile.close();
  }
  const config = (await readOwnedInstalledInput(configPath)).binding;
  const monitor = await monitorOriginalInputs({
    config,
    key: originalKey.key,
    hosts: originalTrust.knownHosts,
    ssh: profile.files.ssh,
    python,
  });
  const challenge = `XCSH_OBSERVER_PROBE_${randomBytes(32).toString('hex')}_${originalTrust.instanceId}`;
  const remote = buildGcpObserverClockCommand(challenge, originalTrust.instanceId);
  const options = [
    'BatchMode=yes',
    'IdentitiesOnly=yes',
    'IdentityAgent=none',
    'AddKeysToAgent=no',
    'ForwardAgent=no',
    'ForwardX11=no',
    'ClearAllForwardings=yes',
    'PasswordAuthentication=no',
    'KbdInteractiveAuthentication=no',
    'PreferredAuthentications=publickey',
    'PubkeyAuthentication=yes',
    'HostbasedAuthentication=no',
    'GSSAPIAuthentication=no',
    'StrictHostKeyChecking=yes',
    `UserKnownHostsFile=${originalTrust.knownHosts.path}`,
    'GlobalKnownHostsFile=/dev/null',
    'HostKeyAlgorithms=ssh-ed25519',
    'UpdateHostKeys=no',
    'VerifyHostKeyDNS=no',
    'ControlMaster=no',
    'ControlPath=none',
    'ControlPersist=no',
    'ProxyCommand=none',
    'ProxyJump=none',
    'PermitLocalCommand=no',
    'LocalCommand=none',
    'ConnectionAttempts=1',
    'ConnectTimeout=15',
    'ServerAliveInterval=15',
    'ServerAliveCountMax=1',
    'RequestTTY=no',
    'LogLevel=ERROR',
  ];
  const args = Object.freeze([
    '-4',
    '-T',
    '-F',
    configPath,
    '-p',
    '22',
    '-l',
    'ubuntu',
    '-i',
    originalKey.key.path,
    ...options.flatMap((option) => ['-o', option]),
    '--',
    originalTrust.address,
    remote,
  ]);
  const executable = Object.freeze({ path: profile.files.ssh.path, sha256: profile.files.ssh.sha256 });
  let retired = false;
  const identity = async () => {
    if (retired) throw new Error('Original observer SSH command retired');
    try {
      if (callback.phase === 'after') await assertOriginalApplyCallback(callback);
      else await assertOriginalApplyLifetime(callback);
      await monitor.assertOriginalIdentity();
    } catch (error) {
      retired = true;
      monitor.close();
      throw error;
    }
  };
  const read = async (): Promise<Readonly<CommandView>> => {
    await identity();
    try {
      await monitor.assertOriginal();
      const currentTrust = await assertOriginalGcpObserverHostTrustContext(trust, callback),
        currentKey = await assertOriginalGcpObserverCampaignKeyContext(key, callback),
        currentProfile = await readOriginalGcpSshClientProfile(clients);
      if (
        JSON.stringify(currentTrust) !== JSON.stringify(originalTrust) ||
        JSON.stringify(currentKey) !== JSON.stringify(originalKey) ||
        currentProfile.files.ssh.path !== executable.path ||
        currentProfile.files.ssh.sha256 !== executable.sha256
      )
        throw new Error('Original observer SSH trust/key/client binding changed');
      await monitor.assertOriginal();
      await identity();
      return Object.freeze({ callback, executable, python, args, challenge, instanceId: originalTrust.instanceId });
    } catch (error) {
      retired = true;
      monitor.close();
      throw error;
    }
  };
  const inputs = async () => {
    await identity();
    try {
      await monitor.assertOriginal();
      await identity();
    } catch (error) {
      retired = true;
      monitor.close();
      throw error;
    }
  };
  await read();
  const reference: OriginalGcpObserverSshCommand = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-observer-ssh-probe-reference',
  });
  origins.set(reference, {
    read,
    identity,
    inputs,
    close() {
      if (!retired) {
        retired = true;
        monitor.close();
      }
    },
  });
  return reference;
}
