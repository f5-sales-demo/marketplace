import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import type { CeOwner } from '../../platform/src/ce/runtime';
import { freezeAdmittedCaptureInputs } from './installed-capture-context';
import { readOwnedInstalledInput } from './installed-runtime';
import { assertSameOriginalInput, monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';

/** Retain the actual capture accessor's validated inputs without granting execution
 * or guest acceptance. Repeated inspection never replaces the original receipt. */
export function createInstalledReaderInputRetention(input: {
  readonly store: CeDeploymentStore;
  readonly owner: CeOwner;
  readonly executionDirectory: string;
  readonly readInputs: () => Promise<Readonly<Record<string, OriginalInputBinding>> | undefined>;
}): () => Promise<void> {
  const owner = Object.freeze(structuredClone(input.owner));
  const store = input.store;
  const executionDirectory = input.executionDirectory;
  const readInputs = input.readInputs;
  let savedBinding: OriginalInputBinding | undefined;
  let inFlight: Promise<void> | undefined;
  const verifyScope = async () => {
    await store.verify();
    if (
      !isAbsolute(executionDirectory) ||
      resolve(executionDirectory) !== executionDirectory ||
      (await realpath(executionDirectory)) !== executionDirectory ||
      (['provider', 'engine', 'account', 'region', 'deploymentId'] as const).some(
        (key) => store.owner[key] !== owner[key],
      )
    )
      throw new Error('Original installed reader retention scope differs');
  };
  const retain = async () => {
    const original = await readInputs();
    if (original === undefined) return;
    const inputs = freezeAdmittedCaptureInputs(original);
    await verifyScope();
    const monitor = await monitorOriginalInputs(inputs);
    try {
      await monitor.assertOriginal();
      await verifyScope();
      if (savedBinding) {
        const saved = await readOwnedInstalledInput(savedBinding.path, 16 * 1024 * 1024);
        assertSameOriginalInput(savedBinding, saved.binding);
        const record = JSON.parse(saved.bytes.toString());
        if (fingerprint(record.readerInputs) !== fingerprint(inputs))
          throw new Error('Original installed reader inputs changed after retention');
      } else {
        const saved = await store.writeImmutableBytes(
          `immutable-installed-reader-inputs-${randomUUID()}.json`,
          Buffer.from(
            JSON.stringify({
              schemaVersion: 1,
              kind: 'original-installed-reader-inputs',
              owner,
              executionDirectory,
              readerInputs: inputs,
              executionAccepted: false,
              guestAcceptanceComplete: false,
            }),
          ),
        );
        savedBinding = saved.binding;
      }
      await monitor.assertOriginal();
      await verifyScope();
    } finally {
      monitor.close();
    }
  };
  return () => {
    inFlight ??= retain().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };
}
