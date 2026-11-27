import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { freezeAdmittedCaptureInputs } from './installed-capture-context';
import { linuxMonotonicMs } from './linux-clock';
import { monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';
import type { Executor } from './runner';
import { signalFreeTerraformExecutor } from './signal-free-executor';

const retained = new Map<string, Awaited<ReturnType<typeof monitorOriginalInputs>>>();
interface LegacyExecutionOptions {
  readonly directory: string;
  readonly inputs: Readonly<Record<string, OriginalInputBinding>>;
  readonly python: Readonly<{ path: string; sha256: string }>;
  readonly executable: Readonly<{ path: string; sha256: string }>;
}
/** Preserve the stored engine and version without introducing an ADC mode or guest controller. */
export function createLegacyInstalledTerraformExecutor(options: LegacyExecutionOptions): Executor {
  const directory = options.directory;
  const inputs = freezeAdmittedCaptureInputs(options.inputs);
  const python = Object.freeze({ ...options.python });
  const executable = Object.freeze({ ...options.executable });
  let start: number | undefined;
  let active = false;
  return async (invocation) => {
    if (invocation.cwd !== directory) throw new Error('Original legacy Terraform workspace differs');
    if (
      !['version', 'init', 'validate', 'plan', 'show', 'output', 'apply'].includes(invocation.args[0]) ||
      invocation.args.includes('-auto-approve') ||
      (invocation.args[0] === 'apply' && invocation.args.at(-1) !== 'saved.tfplan')
    )
      throw new Error('Original legacy Terraform invocation is outside the owning runner');
    if (active) throw new Error('Original legacy Terraform invocation remains active');
    start ??= linuxMonotonicMs();
    if (linuxMonotonicMs() >= start + 7200000) throw new Error('Original legacy Terraform budget exhausted');
    active = true;
    const key = randomUUID();
    let monitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
    let completed = false;
    try {
      monitor = await monitorOriginalInputs(inputs);
      const guard = monitor.assertOriginal;
      const execute = signalFreeTerraformExecutor({
        python,
        executable,
        originalStartMs: start,
        originalDeadlineMs: start + 7200000,
        assertOriginal: guard,
        finalCapture: async (capture) => {
          await writeFile(join(dirname(capture.stdoutPath), 'legacy-final.private.json'), JSON.stringify(capture), {
            flag: 'wx',
            mode: 0o400,
          });
        },
      });
      const result = await execute(invocation);
      // The original executor returns only after durable completion, group
      // absence and lock release. Its earlier capture snapshot can precede exit.
      completed = true;
      return result;
    } finally {
      if (completed) monitor?.close();
      else if (monitor) retained.set(key, monitor);
      // Refuse another actor after unresolved execution or evidence. A new
      // owning runner must review the retained lock; never clear it here.
      active = !!monitor && !completed;
    }
  };
}
