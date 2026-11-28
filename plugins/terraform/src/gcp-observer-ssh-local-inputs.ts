import {
  assertOriginalGcpObserverSshCommandInputs,
  readOriginalGcpObserverSshCommand,
} from './gcp-observer-ssh-command';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';
import { freezeAdmittedCaptureInputs } from './installed-capture-context';
import { readOwnedInstalledInput } from './installed-runtime';
import { assertSameOriginalInput, monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';

/** Capture-only local guard over the same actual command inputs. It grants no
 * command, callback, guest or clock authority after the original lease retires. */
export async function openOriginalGcpObserverSshInputLease(command: unknown, callback: OriginalApplyCallbackContext) {
  const source = await readOriginalGcpObserverSshCommand(command);
  if (source.callback !== callback) throw new Error('Original SSH input lease and actual callback required');
  const config = source.args[source.args.indexOf('-F') + 1];
  const key = source.args[source.args.indexOf('-i') + 1];
  const hosts = source.args
    .find((value) => value.startsWith('UserKnownHostsFile='))
    ?.slice('UserKnownHostsFile='.length);
  if (!config || !key || !hosts) throw new Error('Complete original SSH local input mapping required');
  const admitted: Record<string, OriginalInputBinding> = {};
  for (const [name, path] of [
    ['config', config],
    ['key', key],
    ['hosts', hosts],
    ['ssh', source.executable.path],
    ['python', source.python.path],
  ]) {
    const input = await readOwnedInstalledInput(path);
    admitted[name] = input.binding;
  }
  if (admitted.ssh.sha256 !== source.executable.sha256 || admitted.python.sha256 !== source.python.sha256)
    throw new Error('Original SSH input executable mapping differs');
  await assertOriginalGcpObserverSshCommandInputs(command);
  const bindings = freezeAdmittedCaptureInputs(admitted);
  const monitor = await monitorOriginalInputs(bindings);
  let closed = false,
    failure: unknown;
  const assertOriginal = async () => {
    if (closed) throw new Error('Original SSH local input lease closed');
    if (failure) throw failure;
    try {
      await monitor.assertOriginal();
      for (const original of Object.values(bindings))
        assertSameOriginalInput(original, (await readOwnedInstalledInput(original.path)).binding);
      await monitor.assertOriginal();
    } catch (error) {
      failure = error;
      throw error;
    }
  };
  const assertOriginalIdentity = async () => {
    if (closed) throw new Error('Original SSH local input lease closed');
    if (failure) throw failure;
    try {
      await monitor.assertOriginalIdentity();
    } catch (error) {
      failure = error;
      throw error;
    }
  };
  await assertOriginal();
  return Object.freeze({
    bindings,
    assertOriginal,
    assertOriginalIdentity,
    close() {
      closed = true;
      monitor.close();
    },
  });
}
