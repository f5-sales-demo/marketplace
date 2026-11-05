import { lstat, mkdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import { type GcloudExecApi, GcloudExecError } from './exec';

export type GcloudOptionalGroup = 'alpha' | 'beta';
export class GcloudCommandGroupError extends GcloudExecError {
  constructor(
    readonly group: GcloudOptionalGroup,
    readonly reason:
      | 'inspection_unavailable'
      | 'installation_unavailable'
      | 'installation_not_verified'
      | 'lock_unavailable',
  ) {
    super(
      `Google Cloud ${group} command group ${reason.replaceAll('_', ' ')}. Install the matching SDK component using this installation's supported package manager, then retry.`,
    );
    this.name = 'GcloudCommandGroupError';
  }
}
async function componentLock(signal?: AbortSignal) {
  const directory = join(
    process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'),
    'xcsh',
    'gcloud-command-groups',
  );
  if (!isAbsolute(directory)) throw new Error('SDK component lock directory must be absolute');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0)
    throw new Error('SDK component lock directory ownership differs');
  const path = join(await realpath(directory), '.gcloud-components-lock');
  const deadline = Date.now() + 5 * 60_000;
  for (;;) {
    signal?.throwIfAborted();
    try {
      return await acquireProcessLock(path);
    } catch (error) {
      if ((error as Error).message !== 'Operation lock is held by a live process' || Date.now() >= deadline)
        throw error;
      await Bun.sleep(250);
    }
  }
}
/** Prepare only explicitly requested SDK release-track groups; cloud argv and guards stay intact. */
export function withGcloudCommandGroups(
  raw: GcloudExecApi,
  lock: (signal?: AbortSignal) => Promise<() => Promise<void>> = componentLock,
): GcloudExecApi {
  return {
    async exec(command, args, options) {
      const group = args[0];
      if (command !== 'gcloud' || (group !== 'alpha' && group !== 'beta')) return raw.exec(command, args, options);
      const signal = options?.signal;
      signal?.throwIfAborted();
      const installed = async () => {
        signal?.throwIfAborted();
        const response = await raw.exec(
          'gcloud',
          [
            'components',
            'list',
            '--only-local-state',
            `--filter=id=${group}`,
            '--format=json(id,current_version_string)',
            '--quiet',
          ],
          options,
        );
        signal?.throwIfAborted();
        if (response.exitCode !== 0) throw new GcloudCommandGroupError(group, 'inspection_unavailable');
        let rows: unknown;
        try {
          rows = JSON.parse(response.stdout);
        } catch {
          throw new GcloudCommandGroupError(group, 'inspection_unavailable');
        }
        if (!Array.isArray(rows) || rows.length > 1) throw new GcloudCommandGroupError(group, 'inspection_unavailable');
        if (!rows.length) return false;
        const row = rows[0];
        if (
          !row ||
          typeof row !== 'object' ||
          row.id !== group ||
          (row.current_version_string !== undefined &&
            row.current_version_string !== null &&
            typeof row.current_version_string !== 'string')
        )
          throw new GcloudCommandGroupError(group, 'inspection_unavailable');
        return typeof row.current_version_string === 'string' && row.current_version_string.length > 0;
      };
      if (!(await installed())) {
        let release: () => Promise<void>;
        try {
          release = await lock(signal);
        } catch {
          throw new GcloudCommandGroupError(group, 'lock_unavailable');
        }
        try {
          // A concurrent caller can finish installing while this caller acquires the lock.
          if (!(await installed())) {
            signal?.throwIfAborted();
            const response = await raw.exec('gcloud', ['components', 'install', group, '--quiet'], options);
            signal?.throwIfAborted();
            if (response.exitCode !== 0) throw new GcloudCommandGroupError(group, 'installation_unavailable');
            if (!(await installed())) throw new GcloudCommandGroupError(group, 'installation_not_verified');
          }
        } finally {
          await release();
        }
      }
      signal?.throwIfAborted();
      return raw.exec(command, args, options);
    },
  };
}
