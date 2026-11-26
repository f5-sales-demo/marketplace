import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { assertExecutorProcessGroupAbsent } from '../../platform/src/ce/process-lock';
import { monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';

export interface OriginalInstalledRuntimeGroup {
  readonly directory: string;
  readonly inputs: Readonly<Record<string, OriginalInputBinding>>;
}

/** Physical parent closure permits inspection of owned nested sources. Capture
 * failure remains a refusal and never retires credentials or clears a lock. */
export async function closeInstalledOriginalRuntimeSources(input: {
  readonly active: number;
  readonly executionDirectory: string;
  readonly groups: readonly OriginalInstalledRuntimeGroup[];
  readonly closeCapture: () => Promise<void>;
  readonly retainCaptureSources?: () => Promise<void>;
  readonly retire: () => void;
}) {
  if (!Number.isSafeInteger(input.active) || input.active !== 0)
    throw new Error('Original installed executor remains in flight');
  const monitors: Awaited<ReturnType<typeof monitorOriginalInputs>>[] = [];
  try {
    for (const group of input.groups) {
      if (
        Object.keys(group.inputs).sort().join(',') !== 'claim,lifetime' ||
        group.inputs.claim.path !== join(group.directory, 'claim.json') ||
        group.inputs.lifetime.path !== join(group.directory, 'lifetime.json')
      )
        throw new Error('Original installed runtime group bindings required');
      const monitor = await monitorOriginalInputs(group.inputs);
      monitors.push(monitor);
      await monitor.assertOriginal();
      await assertExecutorProcessGroupAbsent(group.directory);
      await monitor.assertOriginal();
    }
    const failures: unknown[] = [];
    try {
      await input.closeCapture();
    } catch (error) {
      failures.push(error);
    }
    // Retain independent reader bindings even when capture acceptance failed.
    try {
      await input.retainCaptureSources?.();
    } catch (error) {
      failures.push(error);
    }
    try {
      await lstat(join(input.executionDirectory, '.terraform-executor-lock', 'capture-unresolved.json'));
      failures.push(new Error('Original installed capture remains unresolved'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failures.push(error);
    }
    for (const monitor of monitors) {
      try {
        await monitor.assertOriginal();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length)
      throw new AggregateError(failures, 'Original installed source closure and capture remain unresolved');
    input.retire();
  } finally {
    for (const monitor of monitors) monitor.close();
  }
}
