import { randomUUID } from 'node:crypto';
import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { linuxMonotonicMs } from './linux-clock';
import type { Executor } from './runner';
import { type SignalFreeExecutionPolicy, signalFreeTerraformExecutor } from './signal-free-executor';

interface InstalledCleanupExecutorOptions {
  readonly directory: string;
  readonly diagnosticsDirectory: string;
  readonly python: SignalFreeExecutionPolicy['python'];
  readonly terraform: SignalFreeExecutionPolicy['executable'];
  /** Compiled domain callbacks over original credential/configuration/provider inputs. */
  assertInputs(): Promise<void>;
  /** Original executor and every original reader must be independently absent. */
  assertIndependentClosure(): Promise<void>;
}

/** Transport for the shared reviewed cleanup runner. It grants no ownership or
 * mutation authorization and never clears an original failed executor claim. */
export function createInstalledCleanupExecutor(options: InstalledCleanupExecutorOptions): Executor {
  const directory = options.directory;
  const diagnosticsDirectory = options.diagnosticsDirectory;
  if (
    !isAbsolute(directory) ||
    resolve(directory) !== directory ||
    !isAbsolute(diagnosticsDirectory) ||
    resolve(diagnosticsDirectory) !== diagnosticsDirectory ||
    directory === diagnosticsDirectory ||
    diagnosticsDirectory === join(directory, '.terraform-executor-lock') ||
    diagnosticsDirectory.startsWith(`${join(directory, '.terraform-executor-lock')}/`) ||
    typeof options.assertInputs !== 'function' ||
    typeof options.assertIndependentClosure !== 'function'
  )
    throw new Error('Original cleanup workspace, separate diagnostics and source guards required');
  const python = Object.freeze({ ...options.python });
  const terraform = Object.freeze({ ...options.terraform });
  const assertInputs = options.assertInputs.bind(options);
  const assertIndependentClosure = options.assertIndependentClosure.bind(options);
  const start = linuxMonotonicMs(),
    deadline = start + 7200000;
  let active = false,
    retired = false;
  const inspect = async (path: string) => {
    const value = await lstat(path, { bigint: true });
    if (
      !value.isDirectory() ||
      value.isSymbolicLink() ||
      value.uid !== BigInt(process.getuid?.() ?? -1) ||
      (value.mode & 0o777n) !== 0o700n ||
      (await realpath(path)) !== path
    )
      throw new Error('Original private cleanup directory required');
    return value;
  };
  const roots = Promise.all([inspect(directory), inspect(diagnosticsDirectory)]);
  roots.catch(() => {});
  const guard = async () => {
    if (retired) throw new Error('Original cleanup executor is retired');
    const originals = await roots;
    for (const [index, path] of [directory, diagnosticsDirectory].entries()) {
      const current = await inspect(path),
        original = originals[index];
      if (
        !original ||
        current.dev !== original.dev ||
        current.ino !== original.ino ||
        current.uid !== original.uid ||
        current.mode !== original.mode
      )
        throw new Error('Original cleanup directory identity changed');
    }
    await assertInputs();
    await assertIndependentClosure();
    await assertInputs();
  };
  return async (invocation) => {
    if (active || retired) throw new Error('Original cleanup executor remains active or retired');
    if (
      invocation.cwd !== directory ||
      !['version', 'init', 'validate', 'plan', 'show', 'output', 'apply'].includes(invocation.args[0]) ||
      invocation.args.some((arg) => arg.startsWith('-chdir') || arg.startsWith('-state=') || arg === '-auto-approve') ||
      (invocation.args[0] === 'apply' && invocation.args.at(-1) !== 'saved.tfplan')
    )
      throw new Error('Cleanup invocation escaped its original runner workspace');
    invocation.signal?.throwIfAborted();
    if (linuxMonotonicMs() >= deadline) throw new Error('Original cleanup operation budget exhausted');
    active = true;
    try {
      await guard();
      const commandDirectory = join(diagnosticsDirectory, randomUUID());
      await mkdir(commandDirectory, { mode: 0o700 });
      const execute = signalFreeTerraformExecutor({
        python,
        executable: terraform,
        originalStartMs: start,
        originalDeadlineMs: deadline,
        ...(invocation.args[0] === 'apply' ? {} : { timeoutMs: 60000 }),
        assertOriginal: guard,
        finalCapture: async (capture) => {
          await writeFile(join(commandDirectory, 'cleanup-final.private.json'), JSON.stringify(capture), {
            flag: 'wx',
            mode: 0o400,
          });
        },
      });
      const result = await execute({
        ...invocation,
        cwd: commandDirectory,
        args: [`-chdir=${directory}`, ...invocation.args],
      });
      await guard();
      return result;
    } catch (error) {
      retired = true;
      throw error;
    } finally {
      active = false;
    }
  };
}
