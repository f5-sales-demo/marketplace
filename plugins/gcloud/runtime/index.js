// @bun
var __esm = (fn, res, err) => () => {
  if (fn)
    try {
      const initialize = fn;
      fn = 0;
      res = initialize();
    } catch (e) {
      err = [e];
    }
  if (err) throw err[0];
  return res;
};

// plugins/gcloud/src/gcloud/arguments.ts
function jsonArgs(args) {
  const formats = args.flatMap((arg, i) =>
    arg === '--format' ? [args[i + 1] ?? ''] : arg.startsWith('--format=') ? [arg.slice(9)] : [],
  );
  if (formats.some((format) => !/^json(?:\([^\r\n]*\))?$/.test(format)))
    throw new Error('Typed gcloud tools require a JSON format');
  return formats.length ? [...args] : [...args, '--format=json'];
}
function listArgs(kind, params) {
  const args =
    kind === 'projects'
      ? ['projects', 'list']
      : kind === 'instances'
        ? ['compute', 'instances', 'list']
        : ['storage', 'buckets', 'list'];
  if (kind === 'instances' && params.zone) args.push(`--zones=${params.zone}`);
  if (params.filter) args.push(`--filter=${params.filter}`);
  if (params.limit !== undefined) args.push(`--limit=${String(params.limit)}`);
  return args;
}
function helpArgs(path) {
  return [...(path?.trim().split(' ').filter(Boolean) ?? []), '--help'];
}
function inventoryArgs(project, deploymentName) {
  return [
    'compute',
    'instances',
    'list',
    `--project=${project}`,
    `--filter=labels.xcsh-deployment=${deploymentName}`,
    '--format=json(id,name,zone,status,labels)',
  ];
}

// plugins/gcloud/src/tools/gcloud-exec-guard.ts
function getPositionals(args) {
  return args.filter((arg) => !arg.startsWith('-'));
}
function isKnownVerb(tok) {
  return (
    READ_EXACT.has(tok) ||
    READ_PREFIXES.some((p) => tok.startsWith(p)) ||
    DANGEROUS_VERBS.has(tok) ||
    MUTATING_VERBS.has(tok)
  );
}
function findVerb(positionals) {
  return positionals.find((tok) => isKnownVerb(tok)) ?? null;
}
function findDangerous(positionals) {
  return positionals.find((tok) => DANGEROUS_VERBS.has(tok)) ?? null;
}
function findMutating(positionals) {
  return positionals.find((tok) => MUTATING_VERBS.has(tok)) ?? null;
}
function isRead(verb) {
  return READ_EXACT.has(verb) || READ_PREFIXES.some((p) => verb.startsWith(p));
}
function checkGcloud(args) {
  const positionals = getPositionals(args);
  if (positionals.length === 0) {
    return { blocked: true, reason: 'no gcloud command provided' };
  }
  const d = findDangerous(positionals);
  if (d) {
    return {
      blocked: true,
      reason: `"${d}" is an execution/credential vector (opens a session, runs code, or mints/consumes credentials) and cannot run through gcloud_exec. Run it through the gcloud:cli-operator agent.`,
    };
  }
  const m = findMutating(positionals);
  if (m) {
    return { blocked: true, reason: `"${m}" is a mutating operation. ${WRITE_DELEGATION}` };
  }
  if (READ_TOP.has(positionals[0])) {
    return { blocked: false };
  }
  const v = findVerb(positionals);
  if (v && isRead(v)) {
    return { blocked: false };
  }
  return {
    blocked: true,
    reason: `unrecognized gcloud command; provide a read-only verb (list/describe/get-iam-policy/\u2026). ${WRITE_DELEGATION}`,
  };
}
function buildGcloudArgs(args) {
  const hasFormat = args.some((a) => a === '--format' || a.startsWith('--format='));
  return hasFormat ? [...args] : [...args, '--format=json'];
}
var READ_EXACT, READ_PREFIXES, READ_TOP, DANGEROUS_VERBS, MUTATING_VERBS, WRITE_DELEGATION;
var init_gcloud_exec_guard = __esm(() => {
  READ_EXACT = new Set([
    'list',
    'describe',
    'get-iam-policy',
    'get-value',
    'get-server-config',
    'get-ancestors',
    'list-grantable-roles',
    'print-settings',
    'version',
    'info',
  ]);
  READ_PREFIXES = ['list-', 'describe-'];
  READ_TOP = new Set(['version', 'info', 'help', 'topic', 'cheat-sheet']);
  DANGEROUS_VERBS = new Set([
    'ssh',
    'scp',
    'connect',
    'call',
    'execute',
    'interactive',
    'login',
    'revoke',
    'get-credentials',
    'print-access-token',
    'print-identity-token',
    'reset-windows-password',
    'simulate-maintenance-event',
    'enable-service',
    'configure-docker',
  ]);
  MUTATING_VERBS = new Set([
    'install',
    'uninstall',
    'create',
    'delete',
    'update',
    'patch',
    'remove',
    'add',
    'set',
    'set-iam-policy',
    'add-iam-policy-binding',
    'remove-iam-policy-binding',
    'deploy',
    'import',
    'export',
    'apply',
    'enable',
    'disable',
    'start',
    'stop',
    'restart',
    'resize',
    'suspend',
    'resume',
    'reset',
    'rollback',
    'promote',
    'migrate',
    'undelete',
    'restore',
    'activate',
    'deactivate',
    'attach',
    'detach',
    'bind',
    'unbind',
    'clear',
    'move',
    'clone',
    'copy',
    'wait',
    'abandon',
    'recreate',
    'rotate',
    'acknowledge',
    'publish',
    'seek',
    'purge',
    'cancel',
    'override',
    'unset',
    'snapshot',
    'upgrade',
    'downgrade',
    'repair',
    'drain',
    'uncordon',
    'cordon',
    'add-tags',
    'remove-tags',
  ]);
  WRITE_DELEGATION =
    'gcloud_exec is read-only by default. Run write/destructive operations through an ' +
    'explicitly confirmed path (delegate to the gcloud:cli-operator agent), not gcloud_exec.';
});

// plugins/platform/src/ce/process-lock.ts
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

async function bootId() {
  let value;
  if (process.platform === 'darwin') {
    const child = Bun.spawn(['/usr/sbin/sysctl', '-n', 'kern.bootsessionuuid'], { stdout: 'pipe', stderr: 'ignore' });
    value = (await new Response(child.stdout).text()).trim().toLowerCase();
    if ((await child.exited) !== 0) throw new Error('Process boot identity is unavailable');
  } else {
    value = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
  }
  if (!bootPattern.test(value)) throw new Error('Process boot identity is unavailable');
  return value;
}
async function processStartTicks(pid) {
  if (process.platform === 'darwin') {
    const script = `import ctypes, sys
class Info(ctypes.Structure):
 _fields_=[('prefix',ctypes.c_uint32*12),('comm',ctypes.c_char*16),('name',ctypes.c_char*32),('tail',ctypes.c_uint32*6),('seconds',ctypes.c_uint64),('microseconds',ctypes.c_uint64)]
lib=ctypes.CDLL('/usr/lib/libproc.dylib',use_errno=True)
lib.proc_pidinfo.argtypes=[ctypes.c_int,ctypes.c_int,ctypes.c_uint64,ctypes.c_void_p,ctypes.c_int]
info=Info()
result=lib.proc_pidinfo(int(sys.argv[1]),3,0,ctypes.byref(info),ctypes.sizeof(info))
if result==ctypes.sizeof(info): print(info.seconds*1000000+info.microseconds)
elif result==0 and ctypes.get_errno()==3: sys.exit(3)
else: sys.exit(2)
`;
    const child = Bun.spawn(['/usr/bin/python3', '-c', script, String(pid)], { stdout: 'pipe', stderr: 'ignore' });
    const start = (await new Response(child.stdout).text()).trim();
    const code = await child.exited;
    if (code === 3) return;
    if (code !== 0 || !/^\d+$/.test(start)) throw new Error('Process identity is unavailable');
    return start;
  }
  try {
    const value = await readFile(`/proc/${pid}/stat`, 'utf8');
    const end = value.lastIndexOf(') ');
    const fields =
      end < 0
        ? []
        : value
            .slice(end + 2)
            .trim()
            .split(/\s+/);
    const start = fields[19];
    if (!/^\d+$/.test(start ?? '')) throw new Error('Malformed process identity');
    return start;
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}
function claim(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'bootId,pid,processStartTicks,schemaVersion,token'
  )
    throw new Error('Operation lock evidence cannot be reconciled');
  const row = value;
  if (
    row.schemaVersion !== 1 ||
    typeof row.token !== 'string' ||
    !tokenPattern.test(row.token) ||
    !Number.isSafeInteger(row.pid) ||
    Number(row.pid) < 1 ||
    typeof row.bootId !== 'string' ||
    !bootPattern.test(row.bootId) ||
    typeof row.processStartTicks !== 'string' ||
    !/^\d+$/.test(row.processStartTicks)
  )
    throw new Error('Operation lock evidence cannot be reconciled');
  return row;
}
async function readClaim(path) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.())
    throw new Error('Operation lock evidence cannot be reconciled');
  try {
    const claimPath = join(path, 'claim.json');
    const claimStat = await lstat(claimPath);
    if (
      !claimStat.isFile() ||
      claimStat.isSymbolicLink() ||
      claimStat.nlink !== 1 ||
      claimStat.uid !== process.getuid?.() ||
      (claimStat.mode & 63) !== 0
    )
      throw new Error('Operation lock evidence cannot be reconciled');
    return claim(JSON.parse(await readFile(claimPath, 'utf8')));
  } catch (error) {
    if (error instanceof SyntaxError || error.code === 'ENOENT')
      throw new Error('Operation lock evidence cannot be reconciled');
    throw error;
  }
}
async function acquireProcessLock(path, ownerPid = process.pid) {
  if (!path.startsWith('/') || !/^\.[a-z][a-z0-9-]*-lock$/.test(basename(path)))
    throw new Error('Invalid operation lock path');
  const currentBootId = await bootId();
  if (!Number.isSafeInteger(ownerPid) || ownerPid < 1) throw new Error('Invalid executor process identity');
  const currentStart = await processStartTicks(ownerPid);
  if (!currentStart) throw new Error('Current process identity is unavailable');
  const mine = {
    schemaVersion: 1,
    token: randomUUID(),
    pid: ownerPid,
    bootId: currentBootId,
    processStartTicks: currentStart,
  };
  const parent = dirname(path);
  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = join(parent, `${basename(path)}.claim-${mine.token}`);
    await mkdir(candidate, { mode: 448 });
    await writeFile(join(candidate, 'claim.json'), JSON.stringify(mine), { mode: 384, flag: 'wx' });
    try {
      await rename(candidate, path);
      return async () => {
        const owned = await readClaim(path);
        if (owned.token !== mine.token) throw new Error('Operation lock ownership changed');
        await rm(path, { recursive: true });
      };
    } catch (error) {
      await rm(candidate, { recursive: true });
      if (error.code !== 'EEXIST' && error.code !== 'ENOTEMPTY') throw error;
    }
    let existing;
    try {
      existing = await readClaim(path);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const liveStart = existing.bootId === currentBootId ? await processStartTicks(existing.pid) : undefined;
    if (existing.bootId === currentBootId && liveStart === existing.processStartTicks)
      throw new Error('Operation lock is held by a live process');
    const stale = join(parent, `${basename(path)}.stale-${randomUUID()}`);
    try {
      await rename(path, stale);
      await rm(stale, { recursive: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Operation lock could not be acquired');
}
var tokenPattern, bootPattern;
var init_process_lock = __esm(() => {
  tokenPattern = /^[a-f0-9-]{36}$/;
  bootPattern = /^[a-f0-9-]{36}$/;
});

// plugins/gcloud/src/gcloud/exec.ts
function detectGcloudError(stderr, exitCode) {
  const lower = stderr.toLowerCase();
  if (
    lower.includes('do not currently have an active account') ||
    lower.includes('gcloud auth login') ||
    lower.includes('does not have any valid credentials') ||
    lower.includes('no active account')
  ) {
    return new GcloudAuthError(
      `${stderr.trim()}
Run: xcsh plugin setup gcloud`,
      exitCode,
    );
  }
  if (
    lower.includes('reauthentication required') ||
    lower.includes('reauthentication failed') ||
    lower.includes('invalid_grant') ||
    lower.includes('token has been expired or revoked')
  ) {
    return new GcloudSessionExpiredError(
      `${stderr.trim()}
Run: xcsh plugin setup gcloud`,
      exitCode,
    );
  }
  if (
    lower.includes('permission_denied') ||
    lower.includes('does not have permission') ||
    lower.includes('permission denied') ||
    lower.includes('caller does not have permission') ||
    lower.includes('forbidden') ||
    lower.includes('403')
  ) {
    return new GcloudPermissionError(stderr, exitCode);
  }
  if (
    lower.includes('not_found') ||
    lower.includes('was not found') ||
    lower.includes('does not exist') ||
    lower.includes('404')
  ) {
    return new GcloudNotFoundError(stderr, exitCode);
  }
  return new GcloudExecError(stderr, exitCode);
}
function parseGcloudJsonOutput(raw) {
  try {
    if (!raw || raw.trim().length === 0) {
      throw new GcloudExecError('Empty output from gcloud CLI');
    }
    return JSON.parse(raw);
  } catch (err) {
    if (err instanceof GcloudExecError) throw err;
    throw new GcloudExecError(`Failed to parse gcloud CLI output: ${err.message}`);
  }
}
async function execGcloudJson(api, args, signal) {
  const fullArgs = jsonArgs(args);
  const result = await api.exec('gcloud', fullArgs, { signal });
  if (result.exitCode !== 0) {
    throw detectGcloudError(result.stderr, result.exitCode);
  }
  return parseGcloudJsonOutput(result.stdout);
}
var GcloudExecError, GcloudAuthError, GcloudSessionExpiredError, GcloudNotFoundError, GcloudPermissionError;
var init_exec = __esm(() => {
  GcloudExecError = class GcloudExecError extends Error {
    exitCode;
    constructor(message, exitCode = 1) {
      super(message);
      this.exitCode = exitCode;
      this.name = 'GcloudExecError';
    }
  };
  GcloudAuthError = class GcloudAuthError extends GcloudExecError {
    constructor(message, exitCode = 1) {
      super(message, exitCode);
      this.name = 'GcloudAuthError';
    }
  };
  GcloudSessionExpiredError = class GcloudSessionExpiredError extends GcloudExecError {
    constructor(message, exitCode = 1) {
      super(message, exitCode);
      this.name = 'GcloudSessionExpiredError';
    }
  };
  GcloudNotFoundError = class GcloudNotFoundError extends GcloudExecError {
    constructor(message, exitCode = 1) {
      super(message, exitCode);
      this.name = 'GcloudNotFoundError';
    }
  };
  GcloudPermissionError = class GcloudPermissionError extends GcloudExecError {
    constructor(message, exitCode = 1) {
      super(message, exitCode);
      this.name = 'GcloudPermissionError';
    }
  };
});

// plugins/gcloud/src/gcloud/command-groups.ts
import { lstat as lstat2, mkdir as mkdir2, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join as join2 } from 'node:path';

async function componentLock(signal) {
  const directory = join2(
    process.env.XDG_STATE_HOME ?? join2(homedir(), '.local', 'state'),
    'xcsh',
    'gcloud-command-groups',
  );
  if (!isAbsolute(directory)) throw new Error('SDK component lock directory must be absolute');
  await mkdir2(directory, { recursive: true, mode: 448 });
  const stat = await lstat2(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 63) !== 0)
    throw new Error('SDK component lock directory ownership differs');
  const path = join2(await realpath(directory), '.gcloud-components-lock');
  const deadline = Date.now() + 5 * 60000;
  for (;;) {
    signal?.throwIfAborted();
    try {
      return await acquireProcessLock(path);
    } catch (error) {
      if (error.message !== 'Operation lock is held by a live process' || Date.now() >= deadline) throw error;
      await Bun.sleep(250);
    }
  }
}
function withGcloudCommandGroups(raw, lock = componentLock) {
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
        let rows;
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
        let release;
        try {
          release = await lock(signal);
        } catch {
          throw new GcloudCommandGroupError(group, 'lock_unavailable');
        }
        try {
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
var GcloudCommandGroupError;
var init_command_groups = __esm(() => {
  init_process_lock();
  init_exec();
  GcloudCommandGroupError = class GcloudCommandGroupError extends GcloudExecError {
    group;
    reason;
    constructor(group, reason) {
      super(
        `Google Cloud ${group} command group ${reason.replaceAll('_', ' ')}. Install the matching SDK component using this installation's supported package manager, then retry.`,
      );
      this.group = group;
      this.reason = reason;
      this.name = 'GcloudCommandGroupError';
    }
  };
});

// plugins/gcloud/src/tools/shared.ts
function textResult(text, details) {
  return { content: [{ type: 'text', text }], details };
}
function errorResult(text, details) {
  return { content: [{ type: 'text', text }], isError: true, details };
}
function detectErrorType(err) {
  if (err instanceof GcloudAuthError) return 'auth_required';
  if (err instanceof GcloudSessionExpiredError) return 'session_expired';
  if (err instanceof GcloudPermissionError) return 'permission_denied';
  if (err instanceof GcloudNotFoundError) return 'not_found';
  return 'exec_error';
}
function renderError(err) {
  return err instanceof Error ? err.message : String(err);
}
function hasControlChars(arg) {
  for (let i = 0; i < arg.length; i++) {
    const c = arg.charCodeAt(i);
    if (c <= 8 || c === 11 || c === 12 || (c >= 14 && c <= 31) || c === 127) return true;
  }
  return false;
}
function makeExecApi(cwd) {
  return withGcloudCommandGroups({
    async exec(command, args, options) {
      const signal = options?.signal;
      const child = Bun.spawn([command, ...args], {
        cwd,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, CLOUDSDK_CORE_DISABLE_PROMPTS: '1' },
        ...(signal && !signal.aborted ? { signal } : {}),
      });
      if (!child.stdout || !child.stderr) {
        return { stdout: '', stderr: 'Failed to capture output', exitCode: 1 };
      }
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: exitCode ?? 0 };
    },
  });
}
var init_shared = __esm(() => {
  init_command_groups();
  init_exec();
});

// plugins/gcloud/src/gcloud/formatters.ts
function basename2(url) {
  const idx = url.lastIndexOf('/');
  return idx === -1 ? url : url.slice(idx + 1);
}
function normalizeConfig(raw) {
  const core = raw.core ?? {};
  const compute = raw.compute ?? {};
  return {
    project: String(core.project ?? ''),
    account: String(core.account ?? ''),
    region: String(compute.region ?? ''),
    zone: String(compute.zone ?? ''),
  };
}
function normalizeProject(raw) {
  return {
    projectId: String(raw.projectId ?? ''),
    name: String(raw.name ?? ''),
    projectNumber: String(raw.projectNumber ?? ''),
    lifecycleState: String(raw.lifecycleState ?? ''),
  };
}
function normalizeInstance(raw) {
  const interfaces = raw.networkInterfaces ?? [];
  const primary = interfaces[0] ?? {};
  const accessConfigs = primary.accessConfigs ?? [];
  const primaryAccess = accessConfigs[0] ?? {};
  return {
    name: String(raw.name ?? ''),
    zone: basename2(String(raw.zone ?? '')),
    machineType: basename2(String(raw.machineType ?? '')),
    status: String(raw.status ?? ''),
    internalIp: String(primary.networkIP ?? ''),
    externalIp: String(primaryAccess.natIP ?? ''),
  };
}
function normalizeBucket(raw) {
  return {
    name: String(raw.name ?? ''),
    location: String(raw.location ?? ''),
    storageClass: String(raw.storageClass ?? raw.storage_class ?? ''),
    created: String(raw.timeCreated ?? raw.creation_time ?? ''),
  };
}
function normalizeProjects(raw) {
  return raw.map((item) => normalizeProject(item));
}
function normalizeInstances(raw) {
  return raw.map((item) => normalizeInstance(item));
}
function normalizeBuckets(raw) {
  return raw.map((item) => normalizeBucket(item));
}
function formatConfigDetail(config) {
  return [
    `**Project:** ${config.project || '-'}`,
    `**Account:** ${config.account || '-'}`,
    `**Region:** ${config.region || '-'}`,
    `**Zone:** ${config.zone || '-'}`,
  ].join(`
`);
}
function formatProjectTable(projects) {
  if (projects.length === 0) return 'No projects found.';
  const header = '| Project ID | Name | Number | State |';
  const sep = '|------------|------|--------|-------|';
  const rows = projects.map(
    (p) => `| ${p.projectId} | ${p.name || '-'} | ${p.projectNumber || '-'} | ${p.lifecycleState || '-'} |`,
  );
  return [header, sep, ...rows].join(`
`);
}
function formatInstanceTable(instances) {
  if (instances.length === 0) return 'No instances found.';
  const header = '| Name | Zone | Machine Type | Status | Internal IP | External IP |';
  const sep = '|------|------|--------------|--------|-------------|-------------|';
  const rows = instances.map(
    (i) =>
      `| ${i.name} | ${i.zone} | ${i.machineType} | ${i.status} | ${i.internalIp || '-'} | ${i.externalIp || '-'} |`,
  );
  return [header, sep, ...rows].join(`
`);
}
function formatBucketTable(buckets) {
  if (buckets.length === 0) return 'No buckets found.';
  const header = '| Name | Location | Storage Class | Created |';
  const sep = '|------|----------|---------------|---------|';
  const rows = buckets.map(
    (b) => `| ${b.name} | ${b.location || '-'} | ${b.storageClass || '-'} | ${b.created || '-'} |`,
  );
  return [header, sep, ...rows].join(`
`);
}

// plugins/gcloud/src/prompts/gcloud-config-list.md
var gcloud_config_list_default =
  '# Show Google Cloud CLI Configuration\n\nShow the active Google Cloud CLI configuration via `gcloud config list`.\n\nReturns the resolved project, account, region, and zone for the current `gcloud` configuration. Use this to confirm which project and identity subsequent commands will target.\n\nTakes no parameters. For richer configuration queries (all properties, named configurations), run `gcloud_exec` with `config list --all` and your own `--filter`/`--format` expressions.\n';
var init_gcloud_config_list = () => {};

// plugins/gcloud/src/tools/gcloud-config-list.ts
function createGcloudConfigListTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({});
  return {
    name: 'gcloud_config_list',
    label: 'Google Cloud Config',
    description: gcloud_config_list_default,
    parameters,
    async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
      const base = { tool: 'gcloud_config_list' };
      const api = makeApi(ctx.cwd);
      const args = ['config', 'list'];
      try {
        const raw = await execGcloudJson(api, args, signal);
        const config = normalizeConfig(raw);
        return textResult(formatConfigDetail(config), { ...base, config });
      } catch (err) {
        return errorResult(`Error: ${renderError(err)}`, { ...base, errorType: detectErrorType(err) });
      }
    },
  };
}
var init_gcloud_config_list2 = __esm(() => {
  init_exec();
  init_gcloud_config_list();
  init_shared();
});

// plugins/gcloud/src/prompts/gcloud-projects-list.md
var gcloud_projects_list_default =
  '# List Google Cloud Projects\n\nList the Google Cloud projects accessible to the active account via `gcloud projects list`.\n\nReturns a table of project ID, name, number, and lifecycle state.\n\n## Parameters\n\n| Parameter | Description                                                           |\n| --------- | --------------------------------------------------------------------- |\n| `filter`  | Optional gcloud `--filter` expression, e.g. `"lifecycleState=ACTIVE"` |\n| `limit`   | Optional positive integer capping the number of results               |\n\nFor richer queries (custom projections, sorting, sub-field selection), run `gcloud_exec` with `projects list` and your own `--filter`/`--format` flags.\n';
var init_gcloud_projects_list = () => {};

// plugins/gcloud/src/tools/gcloud-projects-list.ts
function createGcloudProjectsListTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    filter: Type.Optional(Type.String({ description: 'gcloud --filter expression, e.g. "lifecycleState=ACTIVE"' })),
    limit: Type.Optional(Type.Number({ description: 'Maximum number of projects to return (positive integer)' })),
  });
  return {
    name: 'gcloud_projects_list',
    label: 'Google Cloud Projects',
    description: gcloud_projects_list_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'gcloud_projects_list' };
      if (params.limit !== undefined && (!Number.isInteger(params.limit) || params.limit <= 0)) {
        return errorResult(`Error: limit must be a positive integer, got "${params.limit}".`, base);
      }
      const api = makeApi(ctx.cwd);
      const args = listArgs('projects', params);
      try {
        const raw = await execGcloudJson(api, args, signal);
        const projects = normalizeProjects(raw);
        return textResult(formatProjectTable(projects), { ...base, projects });
      } catch (err) {
        return errorResult(`Error: ${renderError(err)}`, { ...base, errorType: detectErrorType(err) });
      }
    },
  };
}
var init_gcloud_projects_list2 = __esm(() => {
  init_exec();
  init_gcloud_projects_list();
  init_shared();
});

// plugins/gcloud/src/gcloud/types.ts
var PROJECT_ID_PATTERN, ZONE_PATTERN, HELP_PATH_PATTERN;
var init_types = __esm(() => {
  PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
  ZONE_PATTERN = /^[a-z]+-[a-z]+\d-[a-z]$/;
  HELP_PATH_PATTERN = /^[a-z][a-z0-9 -]*$/;
});

// plugins/gcloud/src/prompts/gcloud-compute-instances-list.md
var gcloud_compute_instances_list_default =
  '# List Compute Engine Instances\n\nList Compute Engine virtual machine instances via `gcloud compute instances list`.\n\nReturns a table of instance name, zone, machine type, status, and internal/external IP.\n\n## Parameters\n\n| Parameter | Description                                                                            |\n| --------- | -------------------------------------------------------------------------------------- |\n| `zone`    | Optional zone to restrict results (mapped to gcloud `--zones`), e.g. `"us-central1-a"` |\n| `filter`  | Optional gcloud `--filter` expression, e.g. `"status=RUNNING"`                         |\n| `limit`   | Optional positive integer capping the number of results                                |\n\nFor richer queries (custom projections, sorting, sub-field selection), run `gcloud_exec` with `compute instances list` and your own `--filter`/`--format` flags.\n';
var init_gcloud_compute_instances_list = () => {};

// plugins/gcloud/src/tools/gcloud-compute-instances-list.ts
function createGcloudComputeInstancesListTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    zone: Type.Optional(Type.String({ description: 'Restrict results to a zone, e.g. "us-central1-a"' })),
    filter: Type.Optional(Type.String({ description: 'gcloud --filter expression, e.g. "status=RUNNING"' })),
    limit: Type.Optional(Type.Number({ description: 'Maximum number of instances to return (positive integer)' })),
  });
  return {
    name: 'gcloud_compute_instances_list',
    label: 'Google Cloud Compute Instances',
    description: gcloud_compute_instances_list_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'gcloud_compute_instances_list' };
      if (params.zone !== undefined && !ZONE_PATTERN.test(params.zone)) {
        return errorResult(`Error: invalid zone "${params.zone}". Expected a gcloud zone like "us-central1-a".`, base);
      }
      if (params.limit !== undefined && (!Number.isInteger(params.limit) || params.limit <= 0)) {
        return errorResult(`Error: limit must be a positive integer, got "${params.limit}".`, base);
      }
      const api = makeApi(ctx.cwd);
      const args = listArgs('instances', params);
      try {
        const raw = await execGcloudJson(api, args, signal);
        const instances = normalizeInstances(raw);
        return textResult(formatInstanceTable(instances), { ...base, instances });
      } catch (err) {
        return errorResult(`Error: ${renderError(err)}`, { ...base, errorType: detectErrorType(err) });
      }
    },
  };
}
var init_gcloud_compute_instances_list2 = __esm(() => {
  init_exec();
  init_types();
  init_gcloud_compute_instances_list();
  init_shared();
});

// plugins/gcloud/src/prompts/gcloud-storage-buckets-list.md
var gcloud_storage_buckets_list_default =
  '# List Cloud Storage Buckets\n\nList Cloud Storage buckets via `gcloud storage buckets list`.\n\nReturns a table of bucket name, location, storage class, and creation time.\n\n## Parameters\n\n| Parameter | Description                                                 |\n| --------- | ----------------------------------------------------------- |\n| `filter`  | Optional gcloud `--filter` expression, e.g. `"location=US"` |\n| `limit`   | Optional positive integer capping the number of results     |\n\nFor richer queries (custom projections, sorting, sub-field selection), run `gcloud_exec` with `storage buckets list` and your own `--filter`/`--format` flags.\n';
var init_gcloud_storage_buckets_list = () => {};

// plugins/gcloud/src/tools/gcloud-storage-buckets-list.ts
function createGcloudStorageBucketsListTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    filter: Type.Optional(Type.String({ description: 'gcloud --filter expression, e.g. "location=US"' })),
    limit: Type.Optional(Type.Number({ description: 'Maximum number of buckets to return (positive integer)' })),
  });
  return {
    name: 'gcloud_storage_buckets_list',
    label: 'Google Cloud Storage Buckets',
    description: gcloud_storage_buckets_list_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'gcloud_storage_buckets_list' };
      if (params.limit !== undefined && (!Number.isInteger(params.limit) || params.limit <= 0)) {
        return errorResult(`Error: limit must be a positive integer, got "${params.limit}".`, base);
      }
      const api = makeApi(ctx.cwd);
      const args = listArgs('buckets', params);
      try {
        const raw = await execGcloudJson(api, args, signal);
        const buckets = normalizeBuckets(raw);
        return textResult(formatBucketTable(buckets), { ...base, buckets });
      } catch (err) {
        return errorResult(`Error: ${renderError(err)}`, { ...base, errorType: detectErrorType(err) });
      }
    },
  };
}
var init_gcloud_storage_buckets_list2 = __esm(() => {
  init_exec();
  init_gcloud_storage_buckets_list();
  init_shared();
});

// plugins/gcloud/src/prompts/gcloud-exec.md
var gcloud_exec_default = `# Execute Google Cloud CLI Commands

Execute any \`gcloud\` CLI command directly.

This is the general-purpose tool for running Google Cloud CLI commands that are not covered by the typed tools. Use typed tools when available \u2014 they validate inputs and return structured data.

## Usage

Pass the group, verb, and flags as an array of arguments. Do NOT include \`gcloud\` itself \u2014 it is prepended automatically.

**Example:** To run \`gcloud compute instances list --filter="status=RUNNING"\`:

\`\`\`json
{ "args": ["compute", "instances", "list", "--filter=status=RUNNING"] }
\`\`\`

When the command starts with \`alpha\` or \`beta\`, the plugin checks local SDK
component state and automatically installs that missing command group with
\`gcloud components install <group> --quiet\`. Installation is coordinated across
callers and verified before the requested command runs. Child CLI prompts are
disabled. If the installation's component manager is unavailable or installation
cannot be verified, the command fails with package-manager recovery guidance.
Cloud write and credential guards still apply before group preparation.

## Safety

- Arguments are passed as an array directly to the \`gcloud\` binary \u2014 **no shell** is involved, so shell metacharacters are inert and never filtered. Any valid \`gcloud\` invocation runs, including full \`--filter\` and \`--format\` expressions. Only NUL/control bytes are rejected.
- **Read-only by default.** Only recognized read verbs run:
  - Exact reads: \`list\`, \`describe\`, \`get-iam-policy\`, \`get-value\`, \`get-server-config\`, \`get-ancestors\`, \`list-grantable-roles\`, \`print-settings\`, \`version\`, \`info\`.
  - Read prefixes: any verb starting with \`list-\` or \`describe-\`.
  - Top-level: \`version\`, \`info\`, \`help\`, \`topic\`, \`cheat-sheet\`.
- **Mutating verbs are blocked** (\`create\`, \`delete\`, \`update\`, \`patch\`, \`set\`, \`deploy\`, \`enable\`, \`disable\`, \`set-iam-policy\`, \`add-iam-policy-binding\`, \u2026). Run write/destructive operations through an explicitly confirmed path \u2014 delegate to the \`gcloud:cli-operator\` agent, not \`gcloud_exec\`.
- **Execution and credential vectors are blocked** even though some look read-shaped: \`ssh\`, \`scp\`, \`connect\`, \`call\`, \`execute\`, \`interactive\`, \`login\`, \`revoke\`, \`get-credentials\`, \`print-access-token\`, \`print-identity-token\`, \`reset-windows-password\`, \`simulate-maintenance-event\`, \`enable-service\`, \`configure-docker\`.
  These open sessions, run code, or mint/print credentials \u2014 route them through the \`gcloud:cli-operator\` agent.
- Unrecognized verbs are blocked (fail-safe): provide an explicit read-only verb.
- Output is capped to prevent context overflow.

## Querying: \`--filter\` vs \`--format\`

gcloud splits querying into two distinct, complementary flags. This is **not** Azure \`--query\` (JMESPath): filtering and projection are separate.

### \`--filter\` \u2014 server-side selection (which resources)

Restricts *which* resources are returned, evaluated before results are sent back.

- Equality: \`--filter="status=RUNNING"\` (\`key=value\`)
- Boolean logic: \`--filter="status=RUNNING AND zone:us-central1"\` (\`AND\` / \`OR\`)
- Substring match: \`--filter="name:prod"\` (\`:\` \u2014 has-substring)
- Regex match: \`--filter="name~^web-.*"\` (\`~\`)

### \`--format\` \u2014 client-side projection (how to show it)

Shapes *how* the selected resources are rendered locally.

- \`--format=json\` (default when you pass no \`--format\`)
- \`--format=value(name)\` \u2014 bare field value(s), no keys
- \`--format="table(name,status,zone)"\` \u2014 tabular columns
- \`--format=csv(name,status)\` \u2014 comma-separated
- \`--format=yaml\` \u2014 YAML document
- \`--format=flattened\` \u2014 flat \`key: value\` lines

## Tips

- \`--format=json\` is added automatically unless you pass your own \`--format\` (e.g. \`--format="table(name)"\`, \`--format=yaml\`), which is respected.
- \`--limit=N\` caps the number of results; \`--sort-by=field\` orders them.
- \`--project=PROJECT_ID\` targets a specific Google Cloud project.
- Combine freely: \`["compute", "instances", "list", "--filter=status=RUNNING", "--sort-by=name", "--format=value(name)"]\`.
`;
var init_gcloud_exec = () => {};

// plugins/gcloud/src/tools/gcloud-exec.ts
function createGcloudExecTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    args: Type.Array(Type.String({ description: 'Individual argument (do NOT include "gcloud" itself)' }), {
      description: 'gcloud group, verb, and flags as an array, e.g. ["compute", "instances", "list", "--format=json"]',
    }),
  });
  return {
    name: 'gcloud_exec',
    label: 'Google Cloud CLI Execute',
    description: gcloud_exec_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'gcloud_exec' };
      const args = params.args ?? [];
      if (args.length === 0) {
        return errorResult('Error: args array must not be empty. Provide a gcloud group and verb.', base);
      }
      for (const arg of args) {
        if (hasControlChars(arg)) {
          return errorResult(
            `Error: argument contains a control character and cannot be passed to gcloud: "${arg}"`,
            base,
          );
        }
      }
      const c = checkGcloud(args);
      if (c.blocked) {
        return errorResult(`Error: ${c.reason}`, base);
      }
      try {
        const api = makeApi(ctx.cwd);
        const result = await api.exec('gcloud', buildGcloudArgs(args), { signal });
        if (result.exitCode !== 0) {
          const failure = detectGcloudError(result.stderr || result.stdout, result.exitCode);
          return errorResult(`gcloud command failed (exit ${result.exitCode}): ${failure.message}`, {
            ...base,
            errorType: detectErrorType(failure),
          });
        }
        let output = result.stdout;
        const fullOutput = output;
        if (output.length > MAX_OUTPUT_LENGTH) {
          output = `${output.slice(0, MAX_OUTPUT_LENGTH)}

[Output truncated at ${MAX_OUTPUT_LENGTH} characters]`;
        }
        return textResult(output, { ...base, fullOutput, modelPreviewTruncated: output !== fullOutput });
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}
var MAX_OUTPUT_LENGTH = 50000;
var init_gcloud_exec2 = __esm(() => {
  init_exec();
  init_gcloud_exec();
  init_gcloud_exec_guard();
  init_shared();
});

// plugins/gcloud/src/prompts/gcloud-help.md
var gcloud_help_default = `# View Google Cloud CLI Help

Fetch help documentation for any \`gcloud\` CLI group or command.

Use this tool to discover available groups, commands, and flags for Google Cloud CLI operations that are not covered by the embedded typed tools.

## Usage

Pass the command path (without the \`gcloud\` prefix) to get help. The tool appends \`--help\` for you.

Paths beginning with \`alpha\` or \`beta\` automatically prepare the matching missing
SDK command group before loading help. Installation uses noninteractive CLI
arguments and verifies local component state. An unavailable component manager
returns explicit package-manager recovery guidance.

**Example:** To see help for the \`compute instances\` group:

\`\`\`json
{ "command_path": "compute instances" }
\`\`\`

**Example:** To see help for a top-level group:

\`\`\`json
{ "command_path": "projects" }
\`\`\`

**Example:** To see top-level \`gcloud\` help:

\`\`\`json
{ "command_path": "" }
\`\`\`

## When to Use

- Before using \`gcloud_exec\` with an unfamiliar group or command
- To discover available commands within a group
- To find the correct flags for a specific command (e.g. \`--filter\`, \`--format\`)
- To check required versus optional arguments

## Output

Returns the raw \`gcloud <command> --help\` output as plain text, including available commands, flags, and usage examples. Once you know the command, run the read through \`gcloud_exec\`.
`;
var init_gcloud_help = () => {};

// plugins/gcloud/src/tools/gcloud-help.ts
function createGcloudHelpTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    command_path: Type.Optional(
      Type.String({
        description:
          'Command path without "gcloud" prefix, e.g. "compute instances" or "projects". Empty for top-level help.',
      }),
    ),
  });
  return {
    name: 'gcloud_help',
    label: 'Google Cloud CLI Help',
    description: gcloud_help_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'gcloud_help' };
      const commandPath = params.command_path?.trim() ?? '';
      if (commandPath.length > 0 && !HELP_PATH_PATTERN.test(commandPath)) {
        return errorResult(
          `Error: invalid command path "${commandPath}". Only lowercase letters, digits, hyphens, and spaces are allowed.`,
          base,
        );
      }
      const parts = commandPath.length > 0 ? commandPath.split(' ').filter(Boolean) : [];
      if (parts.some((p) => p.startsWith('-'))) {
        return errorResult(
          `Error: invalid command path "${commandPath}". Command path parts must not start with "-".`,
          base,
        );
      }
      const args = helpArgs(params.command_path);
      const api = makeApi(ctx.cwd);
      try {
        const result = await api.exec('gcloud', args, { signal });
        if (result.exitCode !== 0) {
          const msg = result.stderr || result.stdout || `gcloud ${commandPath} --help failed (exit ${result.exitCode})`;
          return errorResult(`Error: ${msg}`, { ...base, errorType: 'exec_error' });
        }
        const output = result.stdout || result.stderr;
        if (!output.trim()) {
          return errorResult(`No help output for "gcloud ${commandPath}".`, { ...base, errorType: 'exec_error' });
        }
        return textResult(output, base);
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}
var init_gcloud_help2 = __esm(() => {
  init_types();
  init_gcloud_help();
  init_shared();
});

// plugins/gcloud/src/ce/types.ts
var GCP_CE_POLICY = 'f5xc-ce-automation-policy/v2',
  GCP_CE_IMAGE_PROJECT = 'f5-7626-networks-public',
  GCP_CE_OPERATIONS;
var init_types2 = __esm(() => {
  GCP_CE_OPERATIONS = [
    'deploy',
    'reconcile',
    'start',
    'stop',
    'resize',
    'update-network',
    'replace-node',
    'repair',
    'upgrade',
    'failover',
    'teardown',
  ];
});

// plugins/gcloud/src/ce/validation.ts
function validateScope(project, region) {
  if (!PROJECT_ID_PATTERN.test(project)) throw new Error('Invalid explicit GCP project');
  if (region !== undefined && !/^[a-z]+(?:-[a-z]+)+\d$/.test(region)) throw new Error('Invalid GCP region');
}
function name(value) {
  if (typeof value !== 'string' || !NAME.test(value)) throw new Error('Invalid GCP resource name');
}
function ipv4Range(cidr) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(cidr);
  if (!match) throw new Error('Invalid IPv4 CIDR');
  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some((value) => value > 255) || prefix > 32) throw new Error('Invalid IPv4 CIDR');
  const ip = octets.reduce((value, octet) => value * 256 + octet, 0);
  const size = 2 ** (32 - prefix);
  if (ip % size !== 0) throw new Error('CIDR must use a network boundary');
  return [ip, ip + size - 1];
}
function validateImage(image) {
  name(image.name);
  if (!/^f5xc-ce(?:-crt|crt)-[a-z0-9-]+$/.test(image.name)) throw new Error('Image is not an F5 CE image');
  const expected = `https://www.googleapis.com/compute/v1/projects/${GCP_CE_IMAGE_PROJECT}/global/images/${image.name}`;
  if (
    !/^\d+$/.test(image.id) ||
    image.selfLink !== expected ||
    image.status !== 'READY' ||
    image.architecture !== 'X86_64'
  )
    throw new Error('Image must pin an exact ready x86 F5-owned image identity');
  if (
    !Array.isArray(image.licenses) ||
    image.licenses.length === 0 ||
    image.licenses.some(
      (license) =>
        !/^https:\/\/www\.googleapis\.com\/compute\/v1\/projects\/[a-z][a-z0-9-]+\/global\/licenses\/[a-z0-9-]+$/.test(
          license,
        ),
    )
  )
    throw new Error('Image must pin its exact license identities');
}
function keys(value, allowed) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('Unsupported intent field');
}
function validateIntent(intent) {
  if (intent?.schemaVersion !== 1) throw new Error('Unsupported GCP CE intent version');
  keys(intent, [
    'schemaVersion',
    'project',
    'region',
    'deploymentName',
    'platformContext',
    'engine',
    'operation',
    'sites',
    'machineType',
    'diskGiB',
    'image',
    'ipForwarding',
    'initialVersions',
    'egress',
    'ingress',
    'routing',
  ]);
  keys(intent.image, ['id', 'name', 'selfLink', 'licenses', 'architecture', 'status']);
  keys(intent.egress, ['mode', 'resource']);
  keys(intent.ingress, ['profile']);
  keys(intent.routing, ['profile', 'destinationCidrs']);
  validateScope(intent.project, intent.region);
  name(intent.deploymentName);
  name(intent.machineType);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(intent.platformContext)) throw new Error('Explicit F5 context required');
  if (!['native', 'terraform'].includes(intent.engine)) throw new Error('Explicit owning engine required');
  if (!GCP_CE_OPERATIONS.includes(intent.operation)) throw new Error('Unsupported CE operation');
  if (intent.ipForwarding !== true) throw new Error('CE requires IP forwarding');
  if (!Number.isInteger(intent.diskGiB) || intent.diskGiB < 80) throw new Error('CE disk requires at least 80 GiB');
  validateImage(intent.image);
  if (intent.initialVersions) {
    keys(intent.initialVersions, ['software', 'os']);
    if (
      !/^crt-\d{8}-\d{4}$/.test(intent.initialVersions.software) ||
      !/^\d+\.\d{4}\.\d+$/.test(intent.initialVersions.os)
    )
      throw new Error('Explicit initial software/OS version pair required');
  }
  if (!['external-ip', 'cloud-nat', 'firewall', 'proxy'].includes(intent.egress.mode))
    throw new Error('Unsupported egress');
  if (['firewall', 'proxy'].includes(intent.egress.mode) && !intent.egress.resource)
    throw new Error('Explicit egress resource required');
  if (!['none', 'internal-passthrough-lb'].includes(intent.ingress.profile)) throw new Error('Unsupported ingress');
  if (!['static-insertion', 'ilb-next-hop', 'ncc-router-appliance'].includes(intent.routing.profile))
    throw new Error('Unsupported routing');
  for (const cidr of intent.routing.destinationCidrs) ipv4Range(cidr);
  if (!Array.isArray(intent.sites) || !intent.sites.length) throw new Error('Explicitly named sites required');
  const sites = new Set();
  const nodes = new Set();
  for (const site of intent.sites) {
    keys(site, ['name', 'nodes']);
    name(site.name);
    if (sites.has(site.name)) throw new Error('Independent sites require unique names');
    sites.add(site.name);
    if (![1, 3].includes(site.nodes.length)) throw new Error('Sites require one node or three HA nodes');
    let shape;
    for (const node of site.nodes) {
      keys(node, ['name', 'zone', 'interfaces']);
      name(node.name);
      if (nodes.has(node.name)) throw new Error('Node names must be unique');
      nodes.add(node.name);
      if (!new RegExp(`^${intent.region}-[a-z]$`).test(node.zone))
        throw new Error('Node zone must belong to the explicit region');
      if (!node.interfaces.length || node.interfaces.length > 8)
        throw new Error('CE requires 1-8 interfaces; machine limit remains a separate gate');
      const networks = new Set();
      const ranges = [];
      for (const [index, nic] of node.interfaces.entries()) {
        keys(nic, ['index', 'role', 'vrf', 'network', 'subnet', 'cidr']);
        if (nic.index !== index || (index === 0 && nic.role !== 'slo'))
          throw new Error('Contiguous NIC order must start with SLO');
        if (!['slo', 'sli', 'management'].includes(nic.role) || (index > 0 && nic.role === 'slo'))
          throw new Error('Invalid NIC role');
        name(nic.vrf);
        name(nic.network);
        name(nic.subnet);
        if (networks.has(nic.network)) throw new Error('Each NIC requires a distinct VPC');
        networks.add(nic.network);
        const range = ipv4Range(nic.cidr);
        if (ranges.some(([start, end]) => range[0] <= end && start <= range[1]))
          throw new Error('NIC subnets must not overlap');
        ranges.push(range);
      }
      const current = JSON.stringify(
        node.interfaces.map(({ index, role, vrf, network, subnet, cidr }) => [index, role, vrf, network, subnet, cidr]),
      );
      if (shape !== undefined && shape !== current)
        throw new Error('HA NIC order, networks, subnets and VRFs must be homogeneous');
      shape = current;
    }
  }
}
var NAME;
var init_validation = __esm(() => {
  init_types();
  init_types2();
  NAME = /^[a-z][a-z0-9-]{0,61}[a-z0-9]$|^[a-z]$/;
});

// plugins/gcloud/src/ce/discovery.ts
import { createHash } from 'node:crypto';

function fingerprint(value) {
  const stable = (item) =>
    Array.isArray(item)
      ? item.map(stable)
      : item && typeof item === 'object'
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, stable(v)]),
          )
        : item;
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex')}`;
}
function selectF5Images(rows) {
  if (!Array.isArray(rows)) throw new Error('Malformed image inventory');
  return rows
    .flatMap((image) => {
      try {
        image = { ...image, architecture: image.architecture ?? 'X86_64' };
        validateImage(image);
        return [
          {
            id: image.id,
            name: image.name,
            selfLink: image.selfLink,
            licenses: [...image.licenses],
            architecture: image.architecture,
            status: image.status,
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
async function discoverGcp(api, project, region, signal) {
  validateScope(project, region);
  const receipts = [];
  async function query(args) {
    if (signal?.aborted) throw new Error('Discovery cancelled');
    const output = await api.exec('gcloud', args, { signal });
    if (output.exitCode !== 0) throw new Error('GCP discovery query failed');
    const value = parseGcloudJsonOutput(output.stdout);
    receipts.push({
      source: 'gcloud',
      argv: [...args],
      observedAt: new Date().toISOString(),
      sha256: fingerprint(value),
    });
    return value;
  }
  const images = selectF5Images(
    await query([
      'compute',
      'images',
      'list',
      `--project=${GCP_CE_IMAGE_PROJECT}`,
      '--no-standard-images',
      '--filter=name~^f5xc-ce',
      '--format=json(id,name,selfLink,status,licenses,architecture)',
    ]),
  );
  const billing = await query([
    'billing',
    'projects',
    'describe',
    project,
    `--project=${project}`,
    '--format=json(billingEnabled)',
  ]);
  const services = await query(['services', 'list', '--enabled', `--project=${project}`, '--format=json(config.name)']);
  const cloudRegion = await query([
    'compute',
    'regions',
    'describe',
    region,
    `--project=${project}`,
    '--format=json(quotas)',
  ]);
  const machines = await query([
    'compute',
    'machine-types',
    'list',
    `--project=${project}`,
    `--filter=zone:(${region}-)`,
    '--format=json(name,zone,guestCpus,memoryMb)',
  ]);
  if (!Array.isArray(services) || !Array.isArray(machines) || !Array.isArray(cloudRegion.quotas))
    throw new Error('Incomplete discovery response');
  return {
    schemaVersion: 1,
    project,
    region,
    observedAt: new Date().toISOString(),
    receipts,
    images,
    machineTypes: machines.map((m) => ({
      name: m.name,
      zone: m.zone.split('/').at(-1) ?? '',
      guestCpus: m.guestCpus,
      memoryMb: m.memoryMb,
    })),
    billingEnabled: typeof billing.billingEnabled === 'boolean' ? billing.billingEnabled : null,
    enabledApis: services.flatMap((s) => (s.config?.name ? [s.config.name] : [])),
    quotas: cloudRegion.quotas,
    checks: {
      iam: 'unknown',
      organizationPolicy: 'unknown',
      zoneCapacity: 'unknown',
      machineNicLimit: 'unknown',
      licenseAcceptance: 'unknown',
    },
  };
}
var init_discovery = __esm(() => {
  init_exec();
  init_types2();
  init_validation();
});

// plugins/gcloud/src/ce/operational-health.ts
function safeFingerprint(value) {
  try {
    return fingerprint(value);
  } catch {
    return;
  }
}
function matchesGcpOperationalPod(pod, mapping) {
  if (!pod.startsWith(mapping.podPrefix)) return false;
  const suffix = pod.slice(mapping.podPrefix.length);
  return (
    mapping.podShape === undefined ||
    (mapping.podShape === 'daemon' && /^[a-z0-9]{5}$/.test(suffix)) ||
    (mapping.podShape === 'deployment' && /^[a-z0-9]{8,10}-[a-z0-9]{5}$/.test(suffix)) ||
    (mapping.podShape === 'stateful' && /^[0-9]+$/.test(suffix))
  );
}
function qualifiedOperationalProfile(value, pinnedFingerprint) {
  const p = object(value);
  if (
    !p ||
    !HASH.test(pinnedFingerprint) ||
    safeFingerprint(p) !== pinnedFingerprint ||
    p.schemaVersion !== 2 ||
    p.scope !== 'original-three-node-operational-health' ||
    p.maximumAgeMs !== 300000 ||
    p.minimumRoundIntervalMs !== 45000
  )
    return false;
  for (const field of ['sourceHashes', 'parserVersions', 'roles', 'qualification'])
    if (!object(p[field]) || !Object.keys(p[field]).length) return false;
  if (
    !Object.values(p.sourceHashes).every((hash) => typeof hash === 'string' && HASH.test(hash)) ||
    !Object.values(p.parserVersions).every(
      (version) => typeof version === 'string' && /^[a-z0-9/-]+\/v[1-9][0-9]*$/.test(version),
    )
  )
    return false;
  const qualification = p.qualification;
  if (
    Object.keys(qualification).sort().join(',') !== 'discoveryCleanupSha256,evidenceSha256' ||
    !Object.values(qualification).every((hash) => typeof hash === 'string' && HASH.test(hash))
  )
    return false;
  if (
    !names(p.inventoryServices) ||
    !GCP_OPERATIONAL_CORE_SEED.every((name) => p.inventoryServices.includes(name)) ||
    !Array.isArray(p.verRunningStates) ||
    !p.verRunningStates.length ||
    !p.verRunningStates.every((state) => typeof state === 'string' && /^[A-Za-z][A-Za-z0-9_/-]{0,62}$/.test(state)) ||
    new Set(p.verRunningStates).size !== p.verRunningStates.length
  )
    return false;
  if (
    !Array.isArray(p.exclusions) ||
    p.exclusions.some((raw) => {
      const e = object(raw);
      return (
        !e ||
        !GCP_OPERATIONAL_AUXILIARIES.includes(e.service) ||
        e.reason !== 'auxiliary-outside-operational-scope' ||
        typeof e.evidenceSha256 !== 'string' ||
        !HASH.test(e.evidenceSha256)
      );
    }) ||
    new Set(p.exclusions.map((e) => e.service)).size !== p.exclusions.length
  )
    return false;
  for (const [name, raw] of Object.entries(p.roles)) {
    const role = object(raw);
    if (
      !NAME2.test(name) ||
      !role ||
      !names(role.components) ||
      !names(role.diagnostics) ||
      !Array.isArray(role.containers) ||
      !role.containers.length
    )
      return false;
    if (role.runtimeRole !== undefined && !names([role.runtimeRole])) return false;
    const containers = role.containers.map(object);
    if (
      containers.some(
        (c) =>
          !c ||
          !names([c.service]) ||
          !names([c.name]) ||
          !names([c.namespace]) ||
          !['daemon', 'deployment', 'stateful'].includes(String(c.podShape)) ||
          typeof c.podPrefix !== 'string' ||
          !/^[a-z][a-z0-9-]{0,251}$/.test(c.podPrefix),
      )
    )
      return false;
    const services = containers.map((c) => c?.service);
    if (
      new Set(containers.map((c) => `${c?.namespace}:${c?.name}:${c?.podPrefix}:${c?.podShape}`)).size !==
        containers.length ||
      !GCP_OPERATIONAL_DEPENDENCIES.every((dependency) => services.includes(dependency))
    )
      return false;
    if (!['peer-connectivity', 'required-domains'].every((check) => role.diagnostics.includes(check))) return false;
    for (const service of role.components) if (!services.includes(service)) return false;
    if (role.components.some((component) => !p.inventoryServices.includes(component))) return false;
  }
  const declaredRoles = Object.values(p.roles);
  for (const auxiliary of GCP_OPERATIONAL_AUXILIARIES)
    if (
      !p.exclusions.some((e) => e.service === auxiliary) &&
      !declaredRoles.some((role) => role.containers.some((c) => c.service === auxiliary))
    )
      return false;
  for (const service of p.inventoryServices)
    if (
      !declaredRoles.some(
        (role) => role.components.includes(service) || role.containers.some((c) => c.service === service),
      )
    )
      return false;
  for (const service of GCP_OPERATIONAL_CORE_SEED)
    if (!declaredRoles.some((role) => role.components.includes(service))) return false;
  if (p.placementCounts !== undefined) {
    const counts = object(p.placementCounts);
    const required = new Set([
      ...p.inventoryServices,
      ...declaredRoles.flatMap((role) => role.containers.map((c) => c.service)),
    ]);
    if (
      !counts ||
      Object.keys(counts).length !== required.size ||
      [...required].some(
        (service) => !Number.isInteger(counts[service]) || Number(counts[service]) < 1 || Number(counts[service]) > 3,
      ) ||
      declaredRoles.some(
        (role) => !role.runtimeRole || !GCP_OPERATIONAL_CORE_SEED.every((service) => role.components.includes(service)),
      ) ||
      [...GCP_OPERATIONAL_CORE_SEED, ...GCP_OPERATIONAL_DEPENDENCIES].some((service) => counts[service] !== 3)
    )
      return false;
  }
  return true;
}
function hasGcpOperationalPlacementCoverage(profile, roles) {
  return (
    roles.length === 3 &&
    roles.every((name) => !!profile.roles[name]) &&
    Object.entries(profile.placementCounts ?? {}).every(
      ([service, count]) =>
        roles.filter(
          (name) =>
            profile.roles[name].components.includes(service) ||
            profile.roles[name].containers.some((c) => c.service === service),
        ).length === count,
    )
  );
}
function validBinding(value) {
  if (
    !object(value) ||
    !NAME2.test(value.siteName) ||
    ![
      value.contextFingerprint,
      value.ownershipFingerprint,
      value.configurationIdentitySha256,
      value.runtimeIdentitySha256,
    ].every((hash) => typeof hash === 'string' && HASH.test(hash)) ||
    !Array.isArray(value.nodes) ||
    value.nodes.length !== 3
  )
    return false;
  return (
    value.nodes.every(
      (node) =>
        object(node) &&
        NAME2.test(node.nodeName) &&
        /^\d+$/.test(node.instanceId) &&
        NAME2.test(node.role) &&
        [node.registrationIdentitySha256, node.tokenIdentitySha256].every(
          (hash) => typeof hash === 'string' && HASH.test(hash),
        ) &&
        Array.isArray(node.nics) &&
        node.nics.length === 2 &&
        node.nics.every((hash) => typeof hash === 'string' && HASH.test(hash)) &&
        node.nics[0] !== node.nics[1],
    ) &&
    ['nodeName', 'instanceId', 'registrationIdentitySha256', 'tokenIdentitySha256'].every(
      (key) => new Set(value.nodes.map((node) => node[key])).size === 3,
    )
  );
}
function evaluateGcpOperationalHealth(value, expected, profileValue, pinnedFingerprint, now = Date.now()) {
  const reasons = new Set();
  const profile = qualifiedOperationalProfile(profileValue, pinnedFingerprint) ? profileValue : undefined;
  const c = object(value);
  if (!profile) reasons.add('operational-contract-unqualified');
  if (!validBinding(expected)) reasons.add('invalid-original-binding');
  if (
    profile &&
    !hasGcpOperationalPlacementCoverage(
      profile,
      Array.isArray(expected.nodes) ? expected.nodes.map((node) => node.role) : [],
    )
  )
    reasons.add('required-service-placement-count-mismatch');
  if (
    profile &&
    Array.isArray(expected.nodes) &&
    [
      ...profile.inventoryServices,
      ...GCP_OPERATIONAL_AUXILIARIES.filter((service) => !profile.exclusions.some((e) => e.service === service)),
    ].some(
      (service) =>
        !expected.nodes.some((node) => {
          const role = profile.roles[node?.role];
          return (
            role?.components.includes(service) || role?.containers.some((container) => container.service === service)
          );
        }),
    )
  )
    reasons.add('required-service-placement-uncovered');
  if (
    c?.schemaVersion !== 2 ||
    c.contractFingerprint !== pinnedFingerprint ||
    safeFingerprint(c.bindingBefore) !== safeFingerprint(expected) ||
    safeFingerprint(c.bindingAfter) !== safeFingerprint(expected) ||
    c.qualificationFingerprint !== (profile ? fingerprint(profile.qualification) : undefined)
  )
    reasons.add('collection-binding-mismatch');
  const start = typeof c?.startedAt === 'string' ? Date.parse(c.startedAt) : NaN;
  const finish = typeof c?.finishedAt === 'string' ? Date.parse(c.finishedAt) : NaN;
  if (![start, finish, now].every(Number.isFinite) || start > finish || finish > now || now - start > 300000)
    reasons.add('stale-or-malformed-observation');
  const rawNodes = Array.isArray(c?.nodes) ? c.nodes.map(object) : [];
  const expectedNodes = Array.isArray(expected.nodes) ? expected.nodes : [];
  if (
    rawNodes.length !== 3 ||
    rawNodes.some((row) => !row || !expectedNodes.some((node) => object(node) && node.nodeName === row.nodeName)) ||
    new Set(rawNodes.map((row) => row?.nodeName)).size !== 3
  )
    reasons.add('invalid-observed-node-set');
  const nodes = expectedNodes
    .filter((node) => object(node))
    .map((node) => {
      const row = rawNodes.find((row) => row?.nodeName === node.nodeName);
      const checks = [];
      const check = (name, state, reasonCode) =>
        checks.push({ check: name, state, ...(state !== 'healthy' && reasonCode ? { reasonCode } : {}) });
      const read = (key) => {
        const r = object(row?.[key]);
        const at = typeof r?.observedAt === 'string' ? Date.parse(r.observedAt) : NaN;
        if (
          r?.available !== true ||
          !Number.isFinite(at) ||
          at < start ||
          at > finish ||
          typeof r.projectionFingerprint !== 'string' ||
          !HASH.test(r.projectionFingerprint) ||
          safeFingerprint(r.projection) !== r.projectionFingerprint
        ) {
          check(key, 'unknown', 'required-read-unavailable-or-invalid');
          return;
        }
        if (r.projection === undefined || r.projection === null) {
          check(key, 'unknown', 'required-projection-malformed');
          return;
        }
        return r.projection;
      };
      const registrationValue = read('registration');
      const registration = object(registrationValue);
      if (registrationValue !== undefined && !registration)
        check('registration', 'unknown', 'required-projection-malformed');
      if (registration)
        check(
          'registration',
          registration.state === 'ONLINE'
            ? 'healthy'
            : typeof registration.state === 'string' && ['OFFLINE', 'CONNECTING'].includes(registration.state)
              ? 'degraded'
              : 'unknown',
          registration.identitySha256 === node.registrationIdentitySha256
            ? 'registration-not-online-or-invalid'
            : 'registration-identity-mismatch',
        );
      if (registration && registration.identitySha256 !== node.registrationIdentitySha256)
        checks[checks.length - 1].state = 'unknown';
      const interfaces = read('interfaces');
      if (interfaces !== undefined)
        check(
          'interfaces',
          Array.isArray(interfaces) && interfaces.length === 2 && safeFingerprint(interfaces) === fingerprint(node.nics)
            ? 'healthy'
            : 'unknown',
          'nic-join-mismatch',
        );
      const role = profile?.roles[node.role];
      if (!role) check('role', 'unknown', 'role-requalification-required');
      const siteValue = read('siteStatus');
      const site = object(siteValue);
      if (siteValue !== undefined && !site) check('siteStatus', 'unknown', 'required-projection-malformed');
      if (site) {
        if (role?.runtimeRole)
          check(
            'runtime-role',
            site.runtimeRole === role.runtimeRole ? 'healthy' : 'unknown',
            'runtime-role-requalification-required',
          );
        check(
          'runtime-identity',
          site.runtimeIdentitySha256 === expected.runtimeIdentitySha256 && site.role === node.role
            ? 'healthy'
            : 'unknown',
          'runtime-or-role-drift',
        );
        check(
          'ver',
          typeof site.verState !== 'string'
            ? 'unknown'
            : profile?.verRunningStates.includes(site.verState)
              ? 'healthy'
              : ['stopped', 'failed'].includes(site.verState)
                ? 'degraded'
                : 'unknown',
          'ver-not-qualified-running',
        );
        check(
          'interface-state',
          safeFingerprint(site.interfacesUp) === fingerprint([true, true])
            ? 'healthy'
            : Array.isArray(site.interfacesUp) &&
                site.interfacesUp.length === 2 &&
                site.interfacesUp.every((up) => typeof up === 'boolean')
              ? 'degraded'
              : 'unknown',
          'interface-not-up',
        );
      }
      const components = read('components');
      if (components !== undefined) {
        const rows = Array.isArray(components) ? components.map(object) : [];
        if (
          !rows.length ||
          rows.some((r) => !r || typeof r.name !== 'string' || typeof r.state !== 'string') ||
          new Set(rows.map((r) => r?.name)).size !== rows.length ||
          rows.some((r) => !role?.components.includes(String(r?.name)))
        )
          check('components', 'unknown', 'malformed-or-duplicate-component');
        for (const name of role?.components ?? []) {
          const matches = rows.filter((r) => r?.name === name);
          const component = matches.length === 1 ? matches[0] : undefined;
          check(
            `component:${name}`,
            !component
              ? 'unknown'
              : component.state === 'Ready'
                ? 'healthy'
                : ['NotReady', 'Failed'].includes(String(component.state))
                  ? 'degraded'
                  : 'unknown',
            'component-not-ready-or-missing',
          );
        }
      }
      const inventory = read('inventory');
      let repeatedReferences = 0;
      if (inventory !== undefined) {
        const rows = Array.isArray(inventory) ? inventory.map(object) : [];
        const identities = new Map();
        let invalid = !rows.length;
        for (const r of rows) {
          if (!r || typeof r.service !== 'string') {
            invalid = true;
            continue;
          }
          const previous = identities.get(r.service);
          const hash = fingerprint(r);
          if (previous) {
            if (previous !== hash) invalid = true;
            else repeatedReferences++;
          }
          identities.set(r.service, hash);
        }
        const permitted = new Set([
          ...(profile?.inventoryServices ?? []),
          ...(role?.containers.map((r) => r.service) ?? []),
          ...(profile?.exclusions.map((e) => e.service) ?? []),
        ]);
        check(
          'inventory',
          invalid ||
            (role?.components ?? []).some((name) => !identities.has(name)) ||
            [...identities.keys()].some((name) => !permitted.has(name))
            ? 'unknown'
            : 'healthy',
          'inventory-coverage-or-drift',
        );
      }
      const runtime = read('runtime');
      if (runtime !== undefined) {
        const envelope = object(runtime);
        if (profile?.placementCounts)
          check(
            'runtime-placement',
            envelope?.schemaVersion === 2 && envelope.placementState === 'unchanged' ? 'healthy' : 'unknown',
            'runtime-placement-requalification-required',
          );
        const entries = profile?.placementCounts ? envelope?.containers : runtime;
        const rows = Array.isArray(entries) ? entries.map(object) : [];
        if (
          !rows.length ||
          rows.some(
            (r) =>
              !r ||
              typeof r.containerIdentitySha256 !== 'string' ||
              !HASH.test(r.containerIdentitySha256) ||
              typeof r.name !== 'string' ||
              typeof r.pod !== 'string' ||
              typeof r.namespace !== 'string' ||
              !['running', 'not-running'].includes(String(r.liveness)),
          ) ||
          new Set(rows.map((r) => r?.containerIdentitySha256)).size !== rows.length
        )
          check('runtime', 'unknown', 'malformed-runtime');
        else
          for (const mapping of role?.containers ?? []) {
            const matches = rows.filter(
              (r) =>
                r?.namespace === mapping.namespace &&
                r.name === mapping.name &&
                matchesGcpOperationalPod(String(r.pod), mapping),
            );
            check(
              `container:${mapping.service}:${mapping.namespace}:${mapping.name}:${mapping.podPrefix}:${mapping.podShape}`,
              matches.length !== 1 ? 'unknown' : matches[0]?.liveness === 'running' ? 'healthy' : 'degraded',
              'runtime-coverage-ambiguous-or-not-running',
            );
          }
      }
      const diagnosticsValue = read('diagnostics');
      const diagnostics = object(diagnosticsValue);
      if (diagnosticsValue !== undefined && !diagnostics)
        check('diagnostics', 'unknown', 'required-projection-malformed');
      if (diagnostics) {
        if (
          safeFingerprint(diagnostics.peers) !==
          fingerprint(
            expectedNodes
              .filter((peer) => peer.nodeName !== node.nodeName)
              .map((peer) => ({ nodeName: peer.nodeName, instanceId: peer.instanceId })),
          )
        )
          check('peers', 'unknown', 'diagnostic-peer-join-mismatch');
        for (const name of role?.diagnostics ?? []) {
          const state = object(diagnostics.checks)?.[name];
          check(
            `diagnostic:${name}`,
            state === 'pass' ? 'healthy' : state === 'fail' ? 'degraded' : 'unknown',
            'diagnostic-unavailable-or-failed',
          );
        }
      }
      const state =
        reasons.size || checks.some((c) => c.state === 'unknown')
          ? 'unknown'
          : checks.some((c) => c.state === 'degraded')
            ? 'degraded'
            : 'healthy';
      return {
        nodeName: node.nodeName,
        role: node.role,
        ...(role?.runtimeRole ? { runtimeRole: role.runtimeRole } : {}),
        status: state,
        checks,
        knownFailures: checks.filter((c) => c.state === 'degraded').map((c) => c.check),
        repeatedInventoryReferences: repeatedReferences,
      };
    });
  const status =
    reasons.size || nodes.some((node) => node.status === 'unknown')
      ? 'unknown'
      : nodes.some((node) => node.status === 'degraded')
        ? 'degraded'
        : 'healthy';
  const projection = {
    schemaVersion: 2,
    scope: 'original-three-node-operational-health',
    status,
    contractFingerprint: pinnedFingerprint,
    qualificationFingerprint: profile ? fingerprint(profile.qualification) : undefined,
    bindingFingerprint: safeFingerprint(expected),
    nodes,
    reasonCodes: [...reasons],
    exclusions:
      profile?.exclusions.map(({ service, evidenceSha256, reason }) => ({ service, evidenceSha256, reason })) ?? [],
    coverage: {
      containers: 'liveness-only',
      siteHealthScores: 'informational',
      gatewayIcmp: 'informational',
      traffic: 'excluded',
      quorum: 'excluded',
      failover: 'excluded',
    },
    startedAt: Number.isFinite(start) ? new Date(start).toISOString() : undefined,
    finishedAt: Number.isFinite(finish) ? new Date(finish).toISOString() : undefined,
  };
  return { ...projection, projectionFingerprint: fingerprint(projection) };
}
function qualifiedOperationalRelease(value, pinnedReceiptFingerprint, contractFingerprint) {
  const receipt = object(value);
  return (
    !!receipt &&
    HASH.test(pinnedReceiptFingerprint) &&
    safeFingerprint(receipt) === pinnedReceiptFingerprint &&
    receipt.schemaVersion === 2 &&
    receipt.contractFingerprint === contractFingerprint &&
    HASH.test(contractFingerprint) &&
    ['bindingFingerprint', 'evidenceSha256', 'campaignCleanupSha256'].every(
      (key) => typeof receipt[key] === 'string' && HASH.test(receipt[key]),
    ) &&
    Array.isArray(receipt.healthyRoundFingerprints) &&
    receipt.healthyRoundFingerprints.length === 2 &&
    receipt.healthyRoundFingerprints.every((hash) => typeof hash === 'string' && HASH.test(hash)) &&
    receipt.healthyRoundFingerprints[0] !== receipt.healthyRoundFingerprints[1] &&
    receipt.objectsAbsent === 18 &&
    receipt.emptyDestroy === true &&
    receipt.stableState === true &&
    receipt.repeatedResumeNoSubmission === true
  );
}
var GCP_OPERATIONAL_CORE_SEED,
  GCP_OPERATIONAL_DEPENDENCIES,
  GCP_OPERATIONAL_AUXILIARIES,
  HASH,
  NAME2,
  object = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : undefined),
  names = (value) =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((name) => typeof name === 'string' && NAME2.test(name)) &&
    new Set(value).size === value.length;
var init_operational_health = __esm(() => {
  init_discovery();
  GCP_OPERATIONAL_CORE_SEED = [
    'argo',
    'asaf',
    'aspen',
    'bdbewaf',
    'clank',
    'envoy',
    'etcd',
    'frr',
    'gubernator',
    'ike',
    'keepalived',
    'komodo',
    'obelix',
    'openvpn',
    'opera',
    'pmtud',
    'ver',
  ];
  GCP_OPERATIONAL_DEPENDENCIES = ['coredns', 'kube-proxy', 'kube-multus-ds'];
  GCP_OPERATIONAL_AUXILIARIES = ['vector-agent', 'voucher', 'kube-state-metrics'];
  HASH = /^sha256:[a-f0-9]{64}$/;
  NAME2 = /^[a-z][a-z0-9-]{0,62}$/;
});

// plugins/gcloud/src/ce/operational-source-hashes.json
var operational_source_hashes_default;
var init_operational_source_hashes = __esm(() => {
  operational_source_hashes_default = {
    'gcp-operational-source': 'sha256:1405b6d0bcdf5d92c9aa4b9e14ca96660b9fdf5872f0d126dc6f5dc903739ad9',
    'gcp-operational-command': 'sha256:e73c188a7b416750834edf33b95ddba931c35cecdee1b885e8c2e88ff53c0846',
    'gcp-runtime-diagnostics': 'sha256:ee99d0713c713cb2348020a3b3e152feff52caf15af612c5f65a5899a8ce9580',
    'gcp-operational-diagnosis': 'sha256:30645976567fdae118487ad3d2ee67283a240717bcdbfef5c0e70e629a9ca0e1',
    'gcp-operational-site-status': 'sha256:b753c42c382440aaab47084ef4dab39b2466c5fc0a0a6431f3c2c932483de87d',
    'gcp-operational-observation': 'sha256:af188452e9691f4a937de9f4a0431dffc0a953c02328d318c03dbe9cc41f44ec',
    'gcp-operational-runtime': 'sha256:86093df90f14194d94570773008203e0b5af2e8d041ccb21cce19459f2b2a4b8',
    'gcp-operational-binding': 'sha256:5241e6662bcad89e4ef3048b60005dbcfb333c692877b73348e3f3dcdf086a16',
    'gcp-operational-placement': 'sha256:6bdda37171ee119261cbe88a6959ebdd84bb21c5fd2aceb110de895016347e5f',
    evaluator: 'sha256:4f1d71527a8a2b9d91806744c4db47879827fc52ffdb803201a070403fe39b39',
  };
});

// plugins/gcloud/src/ce/terraform-ha-profile.ts
function qualifiedGcpTerraformHaProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value;
  return (
    Object.keys(p).sort().join(',') ===
      'diskGiB,imageIdentitySha256,lifecycleEvidenceSha256,machineType,operationalContractFingerprint,providerLockSha256,region,schemaVersion,scope,versions,zones' &&
    Array.isArray(p.zones) &&
    !!p.versions &&
    typeof p.versions === 'object' &&
    p.schemaVersion === 2 &&
    p.scope === 'original-three-node-terraform-ha' &&
    p.region === 'northamerica-northeast1' &&
    fingerprint(p.zones) ===
      fingerprint(['northamerica-northeast1-a', 'northamerica-northeast1-b', 'northamerica-northeast1-c']) &&
    p.machineType === 'n2-standard-8' &&
    p.diskGiB === 80 &&
    fingerprint(p.versions) === fingerprint({ terraform: '1.16.6', google: '8.7.0', xcsh: '15.13.0' }) &&
    [p.imageIdentitySha256, p.providerLockSha256, p.operationalContractFingerprint, p.lifecycleEvidenceSha256].every(
      hash,
    )
  );
}
function assertGcpTerraformHaProfile(intent, boundary, deployment = false) {
  const p = boundary.terraformHaLifecycle;
  const contract = boundary.operationalHealthContract;
  const expected = boundary.operationalHealthExpected;
  if (
    !qualifiedGcpTerraformHaProfile(p) ||
    p.operationalContractFingerprint !== (contract?.contractFingerprint ?? expected?.contractFingerprint) ||
    !hash(contract?.qualificationFingerprint ?? expected?.qualificationFingerprint) ||
    intent.engine !== 'terraform' ||
    intent.sites.length !== 1 ||
    intent.sites[0].nodes.length !== 3 ||
    intent.region !== p.region ||
    intent.machineType !== p.machineType ||
    intent.diskGiB !== p.diskGiB ||
    fingerprint(intent.image) !== p.imageIdentitySha256 ||
    fingerprint(intent.sites[0].nodes.map((n) => n.zone).sort()) !== fingerprint(p.zones) ||
    intent.sites[0].nodes.some(
      (n) => n.interfaces.length !== 2 || n.interfaces[0].role !== 'slo' || n.interfaces[1].role !== 'sli',
    )
  )
    throw new Error('Qualified immutable Terraform HA lifecycle scope required');
  if (
    deployment &&
    (!contract ||
      !qualifiedOperationalRelease(
        contract.qualification,
        contract.qualificationFingerprint,
        contract.contractFingerprint,
      ))
  )
    throw new Error('Qualified operational release required for Terraform HA deployment');
  return p;
}
function gcpDeploymentLifecycleFingerprint(intent, boundary) {
  if (intent.sites[0]?.nodes.length !== 3) return fingerprint(boundary.singleNodeLifecycle);
  const profile = assertGcpTerraformHaProfile(intent, boundary);
  return fingerprint({
    profile,
    operationalQualificationFingerprint:
      boundary.operationalHealthContract?.qualificationFingerprint ??
      boundary.operationalHealthExpected?.qualificationFingerprint,
  });
}
var hash = (v) => typeof v === 'string' && /^sha256:[a-f0-9]{64}$/.test(v);
var init_terraform_ha_profile = __esm(() => {
  init_discovery();
  init_operational_health();
});

// plugins/gcloud/src/ce/operational-release.ts
import { createHash as createHash2 } from 'node:crypto';

async function resolveGcpOperationalRelease(
  fetcher = fetch,
  signal,
  pin = GCP_OPERATIONAL_RELEASE_PIN,
  compiledSourceHashes = operational_source_hashes_default,
) {
  if (!pin) return;
  if (
    !/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(pin.tag) ||
    !/^[a-f0-9]{40}$/.test(pin.sourceCommit) ||
    ![
      pin.profileAssetDigest,
      pin.contractFingerprint,
      pin.qualificationAssetDigest,
      pin.qualificationFingerprint,
    ].every((value) => /^sha256:[a-f0-9]{64}$/.test(value))
  )
    throw new Error('Operational release pin malformed');
  const bounded = signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
  const read = async (url, maximum = 4 * 1024 * 1024) => {
    bounded.throwIfAborted();
    const response = await fetcher(url, { signal: bounded, headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok || !response.body) throw new Error('Operational immutable asset unavailable');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        bounded.throwIfAborted();
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maximum) throw new Error('Operational immutable asset exceeds bound');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    bounded.throwIfAborted();
    return Buffer.concat(chunks);
  };
  const decode = (bytes) => {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Operational release JSON malformed');
    return value;
  };
  const base = `https://api.github.com/repos/${repository}`;
  const release = decode(await read(`${base}/releases/tags/${pin.tag}`));
  if (
    release.tag_name !== pin.tag ||
    release.immutable !== true ||
    release.draft !== false ||
    release.prerelease !== false
  )
    throw new Error('Operational release is not final and immutable');
  const reference = decode(await read(`${base}/git/ref/tags/${pin.tag}`));
  let target = reference.object;
  if (target?.type === 'tag' && typeof target.sha === 'string' && /^[a-f0-9]{40}$/.test(target.sha)) {
    const tag = decode(await read(`${base}/git/tags/${target.sha}`));
    target = tag.object;
  }
  if (target?.type !== 'commit' || target.sha !== pin.sourceCommit)
    throw new Error('Operational release immutable source differs');
  const asset = async (name, digest) => {
    if (!Array.isArray(release.assets)) throw new Error('Operational release assets malformed');
    const assets = release.assets.filter((value) => value && typeof value === 'object' && value.name === name);
    const url = `https://github.com/${repository}/releases/download/${pin.tag}/${name}`;
    if (assets.length !== 1 || assets[0].digest !== digest || assets[0].browser_download_url !== url)
      throw new Error('Operational release asset identity differs');
    const bytes = await read(url);
    if (`sha256:${createHash2('sha256').update(bytes).digest('hex')}` !== digest)
      throw new Error('Operational release asset bytes differ');
    return decode(bytes);
  };
  const profile = await asset('gcp-operational-health-v2.json', pin.profileAssetDigest);
  const qualification = await asset('gcp-operational-qualification-v2.json', pin.qualificationAssetDigest);
  if (
    !qualifiedOperationalProfile(profile, pin.contractFingerprint) ||
    !qualifiedOperationalRelease(qualification, pin.qualificationFingerprint, pin.contractFingerprint)
  )
    throw new Error('Operational profile or qualification differs');
  if (fingerprint(profile.sourceHashes) !== fingerprint(compiledSourceHashes))
    throw new Error('Operational parser source drift requires explicit requalification');
  if (
    (pin.terraformHaLifecycle !== undefined || pin.terraformHaLifecycleFingerprint !== undefined) &&
    (!qualifiedGcpTerraformHaProfile(pin.terraformHaLifecycle) ||
      pin.terraformHaLifecycle.operationalContractFingerprint !== pin.contractFingerprint ||
      fingerprint(pin.terraformHaLifecycle) !== pin.terraformHaLifecycleFingerprint ||
      fingerprint(qualification.terraformHaLifecycle) !== pin.terraformHaLifecycleFingerprint)
  )
    throw new Error('Operational lifecycle qualification differs');
  return {
    profile,
    contractFingerprint: pin.contractFingerprint,
    qualification,
    qualificationFingerprint: pin.qualificationFingerprint,
    ...(pin.terraformHaLifecycle ? { terraformHaLifecycle: structuredClone(pin.terraformHaLifecycle) } : {}),
  };
}
var GCP_OPERATIONAL_RELEASE_PIN,
  repository = 'f5-sales-demo/api-specs-enriched';
var init_operational_release = __esm(() => {
  init_discovery();
  init_operational_health();
  init_operational_source_hashes();
  init_terraform_ha_profile();
});

// plugins/gcloud/src/ce/contract.ts
import { createHash as createHash3 } from 'node:crypto';

function qualifiedGcpHaObservationMappings(assets) {
  if (!Array.isArray(assets)) return;
  const matches = assets.filter((asset) => asset && asset.name === 'openapi.json');
  if (
    matches.length !== 1 ||
    matches[0].digest !== 'sha256:3738c3267be63ec2c82716bdf197f7633b8845692ea7fe72e5a11bf2b8d10b77' ||
    matches[0].browser_download_url !==
      `https://github.com/${GCP_CE_API_RELEASE.repository}/releases/download/${GCP_CE_API_RELEASE.tag}/openapi.json`
  )
    return;
  return {
    componentStatus: '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/ves-system/status?cached=false',
    serviceInventory: '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/list-service',
  };
}
async function resolveGcpContract(fetcher = fetch, signal) {
  const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
  const read = async (url, maximum = 1024 * 1024) => {
    combined.throwIfAborted();
    const response = await fetcher(url, {
      signal: combined,
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`Contract release unavailable: HTTP ${response.status}`);
    if (!response.body) throw new Error('Contract response body unavailable');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        combined.throwIfAborted();
        const { done, value } = await reader.read();
        combined.throwIfAborted();
        if (done) break;
        size += value.length;
        if (size > maximum) throw new Error('Contract response exceeds size limit');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    return Buffer.concat(chunks);
  };
  const decode = (bytes) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const base = `https://api.github.com/repos/${GCP_CE_API_RELEASE.repository}`;
  const release = decode(await read(`${base}/releases/tags/${GCP_CE_API_RELEASE.tag}`));
  if (
    release.tag_name !== GCP_CE_API_RELEASE.tag ||
    release.immutable !== true ||
    release.draft !== false ||
    release.prerelease !== false
  )
    throw new Error('Contract release is not final and immutable');
  const assets = release.assets;
  if (!Array.isArray(assets)) throw new Error('Malformed contract release assets');
  const matches = assets.filter((asset) => asset.name === 'smsv2-contract.json');
  const expectedUrl = `https://github.com/${GCP_CE_API_RELEASE.repository}/releases/download/${GCP_CE_API_RELEASE.tag}/smsv2-contract.json`;
  if (
    matches.length !== 1 ||
    matches[0].digest !== GCP_CE_API_RELEASE.contractDigest ||
    matches[0].browser_download_url !== expectedUrl
  )
    throw new Error('Contract asset identity mismatch');
  const bytes = await read(expectedUrl, 4 * 1024 * 1024);
  if (`sha256:${createHash3('sha256').update(bytes).digest('hex')}` !== GCP_CE_API_RELEASE.contractDigest)
    throw new Error('Contract asset digest mismatch');
  const contract = decode(bytes);
  if (
    contract.contract_id !== 'f5xc-smsv2-api/v1' ||
    !contract.providers ||
    typeof contract.providers !== 'object' ||
    Array.isArray(contract.providers)
  )
    throw new Error('Malformed executable CE contract');
  const gcp = contract.providers.gcp;
  const observations =
    gcp?.registration_observation?.availability === 'observational_read_only' &&
    gcp.registration_observation.path === '/api/register/namespaces/system/registrations_by_site/{site_name}' &&
    gcp.registration_observation.method === 'GET' &&
    gcp.registration_observation.required_provider === 'GOOGLE' &&
    gcp.physical_interface_observation?.availability === 'observational_read_only' &&
    gcp.global_health_observation?.availability === 'observational_read_only' &&
    gcp.global_health_observation.path === '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/health' &&
    gcp.global_health_observation.method === 'GET' &&
    gcp.global_health_observation.healthy_state === 'PROVISIONED' &&
    gcp.global_health_observation.exact_node_join_required === true &&
    fingerprint(gcp.global_health_observation.state_values) ===
      fingerprint(['WAITING_FOR_CONFIG', 'WAITING_FOR_APPROVAL', 'PROVISIONING', 'PROVISIONED', 'FAILED', 'RESETTING'])
      ? {
          configuration: '/api/config/namespaces/system/securemesh_site_v2s/{site}',
          registrations: '/api/register/namespaces/system/registrations_by_site/{site}',
          health: '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/health',
        }
      : undefined;
  let operationalHealthContract;
  if (observations) {
    try {
      operationalHealthContract = await resolveGcpOperationalRelease(fetcher, combined);
    } catch {
      signal?.throwIfAborted();
    }
  }
  return {
    release: GCP_CE_API_RELEASE,
    fingerprint: fingerprint(contract),
    availability: 'unavailable',
    reason: Object.hasOwn(contract.providers, 'gcp')
      ? 'gcp_provider_requires_consumer_qualification'
      : 'gcp_provider_not_published',
    ...(observations ? { observations } : {}),
    ...(operationalHealthContract ? { operationalHealthContract } : {}),
    ...(GCP_OPERATIONAL_RELEASE_PIN?.terraformHaLifecycle &&
    qualifiedGcpTerraformHaProfile(GCP_OPERATIONAL_RELEASE_PIN.terraformHaLifecycle) &&
    fingerprint(GCP_OPERATIONAL_RELEASE_PIN.terraformHaLifecycle) ===
      GCP_OPERATIONAL_RELEASE_PIN.terraformHaLifecycleFingerprint
      ? { terraformHaLifecycle: structuredClone(GCP_OPERATIONAL_RELEASE_PIN.terraformHaLifecycle) }
      : {}),
    ...(GCP_OPERATIONAL_RELEASE_PIN
      ? {
          operationalHealthExpected: {
            contractFingerprint: GCP_OPERATIONAL_RELEASE_PIN.contractFingerprint,
            qualificationFingerprint: GCP_OPERATIONAL_RELEASE_PIN.qualificationFingerprint,
          },
        }
      : {}),
    ...(observations && qualifiedGcpHaObservationMappings(assets)
      ? { haObservations: qualifiedGcpHaObservationMappings(assets) }
      : {}),
    ...(gcp?.single_node_lifecycle?.availability === 'evidence_backed_single_node' &&
    gcp.single_node_lifecycle.node_count === 1 &&
    gcp.single_node_lifecycle.interface_count === 2 &&
    gcp.single_node_lifecycle.consumer_runtime_qualification_required === true
      ? { singleNodeLifecycle: structuredClone(gcp.single_node_lifecycle) }
      : {}),
  };
}
var GCP_CE_API_RELEASE;
var init_contract = __esm(() => {
  init_discovery();
  init_operational_release();
  init_terraform_ha_profile();
  GCP_CE_API_RELEASE = {
    repository: 'f5-sales-demo/api-specs-enriched',
    tag: 'v12.1.3',
    contractDigest: 'sha256:ae71bf8f1d69bb248f21a664bfec974c322188b6e17755c245d20d24e1e0e6bc',
  };
});

// plugins/platform/src/ce/deployment-store.ts
var init_deployment_store = () => {};

// plugins/platform/src/ce/bgp-evidence.ts
var init_bgp_evidence = () => {};

// plugins/platform/src/ce/bgp-route-evidence.ts
var init_bgp_route_evidence = () => {};

// plugins/platform/src/ce/bootstrap.ts
var init_bootstrap = () => {};

// plugins/platform/src/ce/ingress-lifecycle.ts
var init_ingress_lifecycle = __esm(() => {
  init_process_lock();
  init_runtime();
});
// plugins/platform/src/ce/interface-evidence.ts
var init_interface_evidence = () => {};

// plugins/platform/src/ce/origin-teardown.ts
var init_origin_teardown = __esm(() => {
  init_runtime();
});

// plugins/platform/src/ce/platform-drain.ts
var init_platform_drain = __esm(() => {
  init_runtime();
});
// plugins/platform/src/ce/teardown-inventory.ts
var init_teardown_inventory = __esm(() => {
  init_runtime();
});

// plugins/platform/src/ce/upgrade-evidence.ts
var init_upgrade_evidence = () => {};

// plugins/platform/src/ce/runtime.ts
var init_runtime = __esm(() => {
  init_bgp_evidence();
  init_bgp_route_evidence();
  init_bootstrap();
  init_ingress_lifecycle();
  init_interface_evidence();
  init_origin_teardown();
  init_platform_drain();
  init_teardown_inventory();
  init_upgrade_evidence();
});

// plugins/platform/src/ce/gcp-http.ts
var init_gcp_http = __esm(() => {
  init_runtime();
});

// plugins/platform/src/ce/gcp-lifecycle.ts
var init_gcp_lifecycle = __esm(() => {
  init_discovery();
  init_validation();
});

// plugins/gcloud/src/ce/ownership.ts
function validateGcpResourceIdentity(resource) {
  if (
    !resource ||
    typeof resource !== 'object' ||
    Array.isArray(resource) ||
    Object.keys(resource).some(
      (key) => !['id', 'selfLink', 'kind', 'project', 'deploymentName', 'siteName', 'nodeName', 'engine'].includes(key),
    )
  )
    throw new Error('Unexpected GCP ownership identity fields');
  if (
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(resource.project) ||
    !/^\d+$/.test(resource.id) ||
    !['native', 'terraform'].includes(resource.engine)
  )
    throw new Error('Invalid GCP resource identity');
  for (const name of [resource.deploymentName, resource.siteName, resource.nodeName].filter((x) => x !== undefined))
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(name)) throw new Error('Invalid GCP ownership binding');
  const collection = COLLECTIONS[resource.kind];
  if (!collection) throw new Error('Unsupported GCP resource kind');
  const prefix = `https://www.googleapis.com/compute/v1/projects/${resource.project}/`;
  const suffix = resource.selfLink.slice(prefix.length);
  if (
    !resource.selfLink.startsWith(prefix) ||
    !new RegExp(
      `^${resource.kind === 'instance' || resource.kind === 'disk' ? 'zones/[a-z]+(?:-[a-z]+)+[0-9]-[a-z]' : resource.kind === 'subnetwork' || resource.kind === 'router' ? 'regions/[a-z]+(?:-[a-z]+)+[0-9]' : resource.kind === 'address' ? '(?:global|regions/[a-z]+(?:-[a-z]+)+[0-9])' : 'global'}/${collection}/[a-z][a-z0-9-]{0,62}$`,
    ).test(suffix)
  )
    throw new Error('Resource must have an exact scoped selfLink');
}
async function readGcpResourceInventory(store, scope) {
  const ledger = await store.read('gcp-resources.json');
  if (ledger?.schemaVersion !== 1 || !sameScope(ledger, scope) || !Array.isArray(ledger.resources))
    throw new Error('GCP ownership ledger is unavailable');
  const links = new Set();
  for (const resource of ledger.resources) {
    validateGcpResourceIdentity(resource);
    if (!sameScope(resource, scope) || links.has(resource.selfLink))
      throw new Error('GCP ledger contains mixed ownership or duplicate identities');
    links.add(resource.selfLink);
  }
  return structuredClone(ledger.resources);
}
function sameScope(a, b) {
  return a.project === b.project && a.deploymentName === b.deploymentName && a.engine === b.engine;
}
async function recordGcpResource(store, resource) {
  validateGcpResourceIdentity(resource);
  let ledger;
  try {
    ledger = await store.read('gcp-resources.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    ledger = {
      schemaVersion: 1,
      project: resource.project,
      deploymentName: resource.deploymentName,
      engine: resource.engine,
      resources: [],
    };
  }
  if (ledger?.schemaVersion !== 1 || !sameScope(ledger, resource) || !Array.isArray(ledger.resources))
    throw new Error('GCP ledger scope differs');
  if (ledger.resources.length) await readGcpResourceInventory(store, resource);
  const prior = ledger.resources.find((r) => r.selfLink === resource.selfLink);
  if (prior && fingerprint(prior) !== fingerprint(resource))
    throw new Error('GCP resource identity changed; explicit replacement required');
  if (!prior) {
    ledger.resources.push(structuredClone(resource));
    await store.write('gcp-resources.json', ledger);
  }
}
async function assertGcpResourceOwnership(store, expected, observed) {
  validateGcpResourceIdentity(expected);
  const resources = await readGcpResourceInventory(store, expected);
  const owned = resources.find((r) => r.id === expected.id && r.selfLink === expected.selfLink);
  if (
    !owned ||
    fingerprint(owned) !== fingerprint(expected) ||
    observed.id !== expected.id ||
    observed.selfLink !== expected.selfLink
  )
    throw new Error('GCP resource ownership mismatch');
}
var COLLECTIONS;
var init_ownership = __esm(() => {
  init_discovery();
  COLLECTIONS = {
    instance: 'instances',
    disk: 'disks',
    network: 'networks',
    subnetwork: 'subnetworks',
    address: 'addresses',
    firewall: 'firewalls',
    router: 'routers',
    route: 'routes',
  };
});

// plugins/gcloud/src/ce/interface-identity.ts
function object2(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed GCP interface identity evidence');
  return value;
}
function correlateGcpPhysicalInterfaces(expected, cloudValue, registrationValue, configurationValue) {
  const cloud = object2(cloudValue),
    registration = object2(registrationValue),
    configuration = object2(configurationValue);
  if (
    !/^\d+$/.test(expected.instanceId) ||
    cloud.id !== expected.instanceId ||
    cloud.name !== expected.nodeName ||
    cloud.zone !== `https://www.googleapis.com/compute/v1/projects/${expected.project}/zones/${expected.zone}`
  )
    throw new Error('Owned GCP VM identity mismatch');
  const metadata = object2(configuration.metadata);
  if (metadata.name !== expected.siteName || metadata.namespace !== 'system')
    throw new Error('Exact GCP site configuration identity required');
  const spec = object2(registration.get_spec),
    infra = object2(spec.infra),
    passport = object2(spec.passport);
  const status = object2(object2(registration.object).status);
  if (
    infra.provider !== 'GOOGLE' ||
    String(infra.instance_id) !== expected.instanceId ||
    infra.hostname !== expected.nodeName ||
    infra.availability_zone !== expected.zone ||
    passport.cluster_name !== expected.siteName ||
    status.current_state !== 'ONLINE'
  )
    throw new Error('Registration is not ONLINE for the exact owned GCP node');
  const nodes = object2(object2(object2(configuration.spec).gcp).not_managed).node_list;
  if (!Array.isArray(nodes)) throw new Error('Missing configured GCP node inventory');
  const matches = nodes.map(object2).filter((node) => node.hostname === expected.nodeName);
  if (matches.length !== 1) throw new Error('Exact configured GCP node must be unique');
  const configured = matches[0].interface_list;
  const hardware = object2(infra.hw_info).network;
  const cloudNics = cloud.networkInterfaces;
  if (
    !Array.isArray(configured) ||
    !Array.isArray(hardware) ||
    !Array.isArray(cloudNics) ||
    configured.length !== expected.nics.length ||
    cloudNics.length !== expected.nics.length
  )
    throw new Error('GCP interface topology evidence is incomplete');
  const used = new Set();
  const macs = new Set();
  return configured
    .map((value) => {
      const nic = object2(value),
        ethernet = object2(nic.ethernet_interface),
        option = object2(nic.network_option);
      if (
        typeof ethernet.device !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(ethernet.device) ||
        typeof ethernet.mac !== 'string' ||
        !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(ethernet.mac)
      )
        throw new Error('Configured device and MAC are required');
      const mac = ethernet.mac;
      if (macs.has(mac)) throw new Error('Duplicate configured MAC');
      macs.add(mac);
      const hw = hardware
        .map(object2)
        .filter(
          (item) =>
            item.name === ethernet.device &&
            typeof item.mac_address === 'string' &&
            item.mac_address.toLowerCase() === mac,
        );
      if (hw.length !== 1 || !Array.isArray(hw[0].ip_address)) throw new Error('Device/MAC hardware join is ambiguous');
      const addresses = hw[0].ip_address.map((address) => (typeof address === 'string' ? address.split('/')[0] : ''));
      const indices = cloudNics
        .map(object2)
        .flatMap((cloudNic, index) => (addresses.includes(String(cloudNic.networkIP)) ? [index] : []));
      if (indices.length !== 1 || used.has(indices[0])) throw new Error('Cloud address/NIC join is ambiguous');
      const index = indices[0],
        cloudNic = object2(cloudNics[index]);
      const wanted = expected.nics.find((item) => item.index === index);
      if (
        !wanted ||
        cloudNic.name !== `nic${index}` ||
        cloudNic.network !== wanted.network ||
        cloudNic.subnetwork !== wanted.subnet
      )
        throw new Error('Cloud NIC network/subnet/order differs');
      const roleField = wanted.role === 'slo' ? 'site_local_network' : 'site_local_inside_network';
      if (
        Object.keys(option).length !== 1 ||
        !Object.hasOwn(option, roleField) ||
        nic.is_primary !== (index === 0) ||
        (wanted.role === 'slo') !== (index === 0)
      )
        throw new Error('Configured role/primary interface differs');
      used.add(index);
      return {
        cloudNicIndex: index,
        role: wanted.role,
        vrf: wanted.vrf,
        device: ethernet.device,
        mac,
        source: 'owned-cloud-vm-and-site-registration',
      };
    })
    .sort((a, b) => a.cloudNicIndex - b.cloudNicIndex);
}

// plugins/gcloud/src/ce/compute-plan.ts
function assertComputeOnly(intent) {
  if (
    intent.ingress.profile !== 'none' ||
    intent.routing.profile !== 'static-insertion' ||
    intent.routing.destinationCidrs.length !== 0
  )
    throw new Error('Compute translation cannot configure ingress or destination routes');
}
function translateGcpNativeCompute(intent) {
  validateIntent(intent);
  if (intent.engine !== 'native') throw new Error('Native translation requires native ownership');
  if (intent.operation !== 'deploy' || intent.egress.mode !== 'external-ip')
    throw new Error('Compute candidate supports external-IP deployment only');
  assertComputeOnly(intent);
  const actions = [];
  const networks = new Map();
  for (const site of intent.sites)
    for (const node of site.nodes)
      for (const nic of node.interfaces) {
        const prior = networks.get(nic.network);
        if (prior && (prior.subnet !== nic.subnet || prior.cidr !== nic.cidr))
          throw new Error('Shared network identity has conflicting subnet intent');
        networks.set(nic.network, { subnet: nic.subnet, cidr: nic.cidr });
      }
  const scope = `--project=${intent.project}`;
  for (const [network, subnet] of networks) {
    actions.push({
      id: `network-${network}`,
      kind: 'network',
      argv: [
        'compute',
        'networks',
        'create',
        network,
        scope,
        '--subnet-mode=custom',
        '--bgp-routing-mode=REGIONAL',
        '--quiet',
        '--format=json',
      ],
      dependencies: [],
    });
    actions.push({
      id: `subnetwork-${subnet.subnet}`,
      kind: 'subnetwork',
      argv: [
        'compute',
        'networks',
        'subnets',
        'create',
        subnet.subnet,
        scope,
        `--region=${intent.region}`,
        `--network=${network}`,
        `--range=${subnet.cidr}`,
        '--quiet',
        '--format=json',
      ],
      dependencies: [`network-${network}`],
    });
  }
  for (const site of intent.sites)
    for (const node of site.nodes) {
      const argv = [
        'compute',
        'instances',
        'create',
        node.name,
        scope,
        `--zone=${node.zone}`,
        `--machine-type=${intent.machineType}`,
        `--image=${intent.image.name}`,
        '--image-project=f5-7626-networks-public',
        `--boot-disk-size=${intent.diskGiB}GB`,
        '--boot-disk-type=pd-balanced',
        '--can-ip-forward',
        '--no-service-account',
        '--no-scopes',
        `--labels=xcsh-deployment=${intent.deploymentName},xcsh-engine=native,xcsh-site=${site.name},xcsh-node=${node.name}`,
      ];
      for (const nic of node.interfaces)
        argv.push(
          `--network-interface=network=${nic.network},subnet=${nic.subnet}${nic.index === 0 ? '' : ',no-address'}`,
        );
      argv.push('--metadata=VmDnsSetting=ZonePreferred', '--async', '--quiet', '--format=json');
      actions.push({
        id: `instance-${node.name}`,
        kind: 'instance',
        argv,
        dependencies: node.interfaces.map((nic) => `subnetwork-${nic.subnet}`),
        sensitiveInput: 'restricted-node-metadata-file',
      });
    }
  if (new Set(actions.map((a) => a.id)).size !== actions.length) throw new Error('GCP action identities collide');
  return { schemaVersion: 1, engine: 'native', executable: false, actions, sha256: fingerprint({ intent, actions }) };
}
function translateGcpTerraformCompute(intent, googleProviderVersion) {
  validateIntent(intent);
  if (intent.engine !== 'terraform') throw new Error('Terraform translation requires Terraform ownership');
  if (!/^\d+\.\d+\.\d+$/.test(googleProviderVersion)) throw new Error('Exact Google provider version required');
  if (intent.operation !== 'deploy' || intent.egress.mode !== 'external-ip')
    throw new Error('Compute candidate supports external-IP deployment only');
  assertComputeOnly(intent);
  const networks = {},
    subnets = {},
    instances = {};
  const variable = {};
  for (const site of intent.sites)
    for (const node of site.nodes) {
      for (const nic of node.interfaces) {
        networks[nic.network.replaceAll('-', '_')] = {
          name: nic.network,
          project: intent.project,
          auto_create_subnetworks: false,
          routing_mode: 'REGIONAL',
        };
        const key = nic.subnet.replaceAll('-', '_');
        const subnet = {
          name: nic.subnet,
          project: intent.project,
          region: intent.region,
          ip_cidr_range: nic.cidr,
          network: `\${google_compute_network.${nic.network.replaceAll('-', '_')}.id}`,
        };
        if (subnets[key] && fingerprint(subnets[key]) !== fingerprint(subnet))
          throw new Error('Subnet identity has conflicting intent');
        subnets[key] = subnet;
      }
      const key = node.name.replaceAll('-', '_');
      variable[`${key}_user_data`] = {
        type: 'string',
        sensitive: true,
        description: 'Restricted node-bound one-use bootstrap; never export as an output',
      };
      instances[key] = {
        name: node.name,
        project: intent.project,
        zone: node.zone,
        machine_type: intent.machineType,
        can_ip_forward: true,
        boot_disk: [
          {
            auto_delete: true,
            initialize_params: [{ image: intent.image.selfLink, size: intent.diskGiB, type: 'pd-balanced' }],
          },
        ],
        network_interface: node.interfaces.map((nic) => ({
          network: `\${google_compute_network.${nic.network.replaceAll('-', '_')}.id}`,
          subnetwork: `\${google_compute_subnetwork.${nic.subnet.replaceAll('-', '_')}.id}`,
          ...(nic.index === 0 ? { access_config: [{}] } : {}),
        })),
        labels: {
          'xcsh-deployment': intent.deploymentName,
          'xcsh-engine': 'terraform',
          'xcsh-site': site.name,
          'xcsh-node': node.name,
        },
        metadata: { VmDnsSetting: 'ZonePreferred', 'user-data': `\${var.${key}_user_data}` },
      };
    }
  return {
    schemaVersion: 1,
    engine: 'terraform',
    executable: false,
    configuration: {
      terraform: {
        required_providers: { google: { source: 'hashicorp/google', version: `= ${googleProviderVersion}` } },
      },
      provider: { google: [{ project: intent.project, region: intent.region }] },
      variable,
      resource: {
        google_compute_network: networks,
        google_compute_subnetwork: subnets,
        google_compute_instance: instances,
      },
    },
  };
}
function translateGcpTerraformSiteCompute(intent, versions) {
  for (const version of Object.values(versions))
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Exact Terraform/provider versions required');
  const cloud = translateGcpTerraformCompute(intent, versions.google);
  const sites = {};
  const tokens = {};
  const instances = cloud.configuration.resource.google_compute_instance;
  for (const site of intent.sites) {
    const siteKey = site.name.replaceAll('-', '_');
    sites[siteKey] = {
      name: site.name,
      namespace: 'system',
      labels: { 'xcsh-deployment': intent.deploymentName, 'xcsh-engine': 'terraform' },
      gcp: { not_managed: {} },
      ...(intent.initialVersions
        ? {
            software_settings: {
              sw: { volterra_software_version: intent.initialVersions.software },
              os: { operating_system_version: intent.initialVersions.os },
            },
          }
        : {}),
      ...(site.nodes.length === 3 ? { enable_ha: {} } : { disable_ha: {} }),
      disable_management_network: {},
      block_all_services: {},
      no_network_policy: {},
      no_forward_proxy: {},
      f5_proxy: {},
      no_proxy_bypass: {},
      logs_streaming_disabled: {},
      no_s2s_connectivity_sli: {},
      no_s2s_connectivity_slo: {},
      disable_url_categorization: {},
      local_vrf: { default_config: {}, default_sli_config: {} },
    };
    for (const node of site.nodes) {
      const key = node.name.replaceAll('-', '_');
      if (`${node.name}-token`.length > 63) throw new Error('Node name leaves no space for bound token name');
      tokens[key] = {
        name: `${node.name}-token`,
        namespace: 'system',
        type: 1,
        site_name: `\${xcsh_securemesh_site_v2.${siteKey}.name}`,
        labels: { 'xcsh-deployment': intent.deploymentName, 'xcsh-node': node.name, 'xcsh-engine': 'terraform' },
      };
      const userData = `#cloud-config
write_files:
  - path: /etc/vpm/user_data
    permissions: "0600"
    owner: root
    content: |
      token: \${xcsh_token.${key}.content}
`;
      instances[key].metadata = {
        VmDnsSetting: 'ZonePreferred',
        'user-data': `\${sensitive(${JSON.stringify(userData)})}`,
      };
    }
  }
  return {
    schemaVersion: 1,
    engine: 'terraform',
    executable: false,
    configuration: {
      terraform: {
        required_version: `= ${versions.terraform}`,
        required_providers: {
          google: { source: 'hashicorp/google', version: `= ${versions.google}` },
          xcsh: { source: 'f5-sales-demo/xcsh', version: `= ${versions.xcsh}` },
        },
      },
      provider: { ...cloud.configuration.provider, xcsh: [{}] },
      resource: { ...cloud.configuration.resource, xcsh_securemesh_site_v2: sites, xcsh_token: tokens },
    },
  };
}
function translateGcpPublicTerraformSiteCompute(intent, versions) {
  const translated = translateGcpTerraformSiteCompute(intent, versions);
  const disks = {};
  for (const site of intent.sites)
    for (const node of site.nodes) {
      const key = node.name.replaceAll('-', '_');
      disks[key] = {
        name: node.name,
        project: intent.project,
        zone: node.zone,
        image: intent.image.selfLink,
        size: intent.diskGiB,
        type: 'pd-balanced',
      };
      const instance = translated.configuration.resource.google_compute_instance[key];
      instance.boot_disk = [{ auto_delete: false, source: `\${google_compute_disk.${key}.self_link}` }];
    }
  const firewalls = {};
  for (const site of intent.sites.filter((site) => site.nodes.length === 3)) {
    const tag = `${site.name}-ha-peer`;
    const dependencies = [];
    for (const nic of site.nodes[0].interfaces)
      for (const direction of ['INGRESS', 'EGRESS']) {
        const name = `${site.name}-ha-${nic.role}-${direction.toLowerCase()}`;
        if (name.length > 63 || tag.length > 63) throw new Error('HA site name leaves no space for firewall identity');
        const key = name.replaceAll('-', '_');
        firewalls[key] = {
          name,
          project: intent.project,
          network: `\${google_compute_network.${nic.network.replaceAll('-', '_')}.self_link}`,
          direction,
          ...(direction === 'INGRESS' ? { source_ranges: ['0.0.0.0/0'] } : { destination_ranges: ['0.0.0.0/0'] }),
          target_tags: [tag],
          allow: [{ protocol: 'all' }],
        };
        dependencies.push(`google_compute_firewall.${key}`);
      }
    for (const node of site.nodes) {
      const instance = translated.configuration.resource.google_compute_instance[node.name.replaceAll('-', '_')];
      instance.tags = [...new Set([...(instance.tags ?? []), tag])];
      instance.depends_on = dependencies;
    }
  }
  return {
    ...translated,
    schemaVersion: 2,
    configuration: {
      ...translated.configuration,
      resource: {
        ...translated.configuration.resource,
        google_compute_disk: disks,
        ...(Object.keys(firewalls).length ? { google_compute_firewall: firewalls } : {}),
      },
    },
  };
}
var init_compute_plan = __esm(() => {
  init_discovery();
  init_validation();
});

// plugins/gcloud/src/ce/teardown-plan.ts
function planGcpOwnedTeardown(resources, scope) {
  if (!/^[a-z]+(?:-[a-z]+)+\d$/.test(scope.region)) throw new Error('Explicit teardown region required');
  if (!resources.length) throw new Error('Independent absence verification required for empty teardown inventory');
  const identities = new Set();
  for (const r of resources) {
    validateGcpResourceIdentity(r);
    if (
      r.project !== scope.project ||
      r.deploymentName !== scope.deploymentName ||
      r.engine !== scope.engine ||
      !/^\d+$/.test(r.id) ||
      identities.has(r.selfLink)
    )
      throw new Error('Teardown inventory ownership differs or duplicates');
    identities.add(r.selfLink);
    const prefix = `https://www.googleapis.com/compute/v1/projects/${scope.project}/`;
    if (!r.selfLink.startsWith(prefix) || !Number.isInteger(ORDER[r.kind]))
      throw new Error('Teardown inventory identity is invalid');
    const segments = r.selfLink.slice(prefix.length).split('/');
    if (
      (segments[0] === 'regions' && segments[1] !== scope.region) ||
      (segments[0] === 'zones' && !new RegExp(`^${scope.region}-[a-z]$`).test(segments[1]))
    )
      throw new Error('Teardown resource region differs');
  }
  const ordered = [...resources].sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.selfLink.localeCompare(b.selfLink));
  return {
    schemaVersion: 1,
    scope: structuredClone(scope),
    resources: structuredClone(ordered),
    executable: false,
    required: [
      'exact ledger/live ownership recheck',
      'reviewed teardown approval',
      'platform drain and registration cleanup',
      'brownfield restoration inventory',
      'independent absence checks',
    ],
    sha256: fingerprint({ scope, resources: ordered }),
  };
}
var ORDER;
var init_teardown_plan = __esm(() => {
  init_discovery();
  init_ownership();
  ORDER = {
    route: 0,
    firewall: 1,
    instance: 2,
    disk: 3,
    address: 4,
    router: 5,
    subnetwork: 6,
    network: 7,
  };
});

// plugins/gcloud/src/ce/native-teardown.ts
async function applyGcpNativeTeardown(store, api, plan, approvedHash, signal) {
  const expected = planGcpOwnedTeardown(plan.resources, plan.scope);
  if (plan.scope.engine !== 'native' || approvedHash !== expected.sha256 || plan.sha256 !== expected.sha256)
    throw new Error('Reviewed native teardown differs');
  signal?.throwIfAborted();
  return store.exclusive(async () => {
    const owned = await readGcpResourceInventory(store, plan.scope);
    if (
      fingerprint(owned.slice().sort((a, b) => a.selfLink.localeCompare(b.selfLink))) !==
      fingerprint(plan.resources.slice().sort((a, b) => a.selfLink.localeCompare(b.selfLink)))
    )
      throw new Error('Complete teardown ledger differs');
    const filename = `gcp-teardown-${plan.sha256.slice(7)}.json`;
    let checkpoint;
    try {
      checkpoint = await store.read(filename);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      checkpoint = { planHash: plan.sha256, resources: {} };
    }
    if (checkpoint.planHash !== approvedHash || !checkpoint.resources) throw new Error('Teardown checkpoint differs');
    for (const resource of plan.resources) {
      signal?.throwIfAborted();
      const parts = resource.selfLink.split('/'),
        scope = parts[7],
        location = scope === 'global' ? undefined : parts[8],
        name = parts.at(-1);
      const base =
        resource.kind === 'subnetwork'
          ? ['compute', 'networks', 'subnets']
          : [
              'compute',
              resource.kind === 'instance'
                ? 'instances'
                : resource.kind === 'network'
                  ? 'networks'
                  : resource.kind === 'disk'
                    ? 'disks'
                    : resource.kind === 'address'
                      ? 'addresses'
                      : resource.kind === 'firewall'
                        ? 'firewall-rules'
                        : resource.kind === 'router'
                          ? 'routers'
                          : 'routes',
            ];
      const flags = [
        `--project=${plan.scope.project}`,
        ...(scope === 'zones' ? [`--zone=${location}`] : scope === 'regions' ? [`--region=${location}`] : []),
      ];
      const observe = async () => {
        const r = await api.exec('gcloud', [...base, 'describe', name, ...flags, '--format=json(id,selfLink)'], {
          signal,
        });
        if (r.exitCode !== 0) {
          if (/\b404\b|was not found|not found/i.test(r.stderr)) return null;
          throw new Error('Teardown observation unavailable');
        }
        let v;
        try {
          v = JSON.parse(r.stdout);
        } catch {
          throw new Error('Malformed teardown identity');
        }
        return v;
      };
      const live = await observe();
      if (!live) {
        checkpoint.resources[resource.selfLink] = 'done';
        await store.write(filename, checkpoint);
        continue;
      }
      await assertGcpResourceOwnership(store, resource, live);
      if (checkpoint.resources[resource.selfLink] === 'done') throw new Error('Deleted resource reappeared');
      if (!checkpoint.resources[resource.selfLink]) {
        checkpoint.resources[resource.selfLink] = 'submitting';
        await store.write(filename, checkpoint);
        const r = await api.exec('gcloud', [...base, 'delete', name, ...flags, '--quiet', '--format=json'], {
          signal,
        });
        if (r.exitCode !== 0) throw new Error('Teardown submission requires reconciliation');
        if (await observe()) return { state: 'pending', resource: resource.selfLink };
      } else {
        throw new Error('Ambiguous deletion requires independent outcome reconciliation');
      }
      checkpoint.resources[resource.selfLink] = 'done';
      await store.write(filename, checkpoint);
    }
    return { state: 'done', absence: 'cloud-observed', independentAbsence: 'not-established', planHash: plan.sha256 };
  });
}
var init_native_teardown = __esm(() => {
  init_discovery();
  init_ownership();
  init_teardown_plan();
});

// plugins/gcloud/src/ce/deployment-teardown.ts
import { join as join3 } from 'node:path';

function assertGcpTeardownProfile(intent, contract, engine = 'native') {
  validateIntent(intent);
  if (intent.engine !== engine) throw new Error(`Teardown requires owning engine ${engine}`);
  const ha = engine === 'terraform' && intent.sites.length === 1 && intent.sites[0].nodes.length === 3;
  if (ha) assertGcpTerraformHaProfile(intent, contract);
  if (!contract.singleNodeLifecycle || fingerprint(contract.release) !== fingerprint(GCP_CE_API_RELEASE))
    throw new Error('Qualified immutable teardown contract required');
  if (
    intent.sites.length !== 1 ||
    (!ha && intent.sites[0].nodes.length !== 1) ||
    intent.sites[0].nodes[0].interfaces.length !== 2 ||
    intent.sites[0].nodes[0].interfaces[1].role !== 'sli' ||
    intent.egress.mode !== 'external-ip' ||
    intent.ingress.profile !== 'none' ||
    intent.routing.profile !== 'static-insertion' ||
    intent.routing.destinationCidrs.length !== 0
  )
    throw new Error('Qualified disposable single-node teardown profile required');
}
async function storage(platform, intent) {
  const store = await platform.storage({
    deploymentId: intent.deploymentName,
    provider: 'gcp',
    engine: 'native',
    account: intent.project,
    region: intent.region,
  });
  const saved = await store.read('gcp-deployment-intent.json');
  if (
    !saved.intent ||
    saved.intentFingerprint !== fingerprint(intent) ||
    fingerprint(saved.intent) !== fingerprint(intent) ||
    saved.platformContext !== intent.platformContext
  )
    throw new Error('Persisted teardown deployment context differs');
  return store;
}
function assertGcpTeardownTopology(intent, resources) {
  const node = intent.sites[0].nodes[0],
    site = intent.sites[0].name;
  const prefix = `https://www.googleapis.com/compute/v1/projects/${intent.project}`;
  const required = [
    `${prefix}/zones/${node.zone}/instances/${node.name}`,
    ...node.interfaces.flatMap((nic) => [
      `${prefix}/global/networks/${nic.network}`,
      `${prefix}/regions/${intent.region}/subnetworks/${nic.subnet}`,
    ]),
  ];
  const disks = resources.filter((resource) => resource.kind === 'disk');
  if (
    resources.length !== 6 ||
    disks.length !== 1 ||
    disks[0].nodeName !== node.name ||
    disks[0].siteName !== site ||
    !disks[0].selfLink.startsWith(`${prefix}/zones/${node.zone}/disks/`) ||
    required.some((link) => resources.filter((r) => r.selfLink === link).length !== 1)
  )
    throw new Error('Complete disposable teardown topology required');
}
async function assertNativeCleanupTopology(store, intent, resources) {
  if (resources.length === 6) return assertGcpTeardownTopology(intent, resources);
  const cloud = translateGcpNativeCompute(intent);
  const checkpoint = await store.read(`gcp-create-${cloud.sha256.slice(7)}.json`);
  if (
    checkpoint.planHash !== cloud.sha256 ||
    !checkpoint.actions ||
    !resources.length ||
    Object.entries(checkpoint.actions).some(
      ([id, action]) => action.state !== 'done' || !cloud.actions.some((a) => a.id === id),
    )
  )
    throw new Error('Partial cleanup requires reconciled creation journal');
  const node = intent.sites[0].nodes[0];
  const prefix = `https://www.googleapis.com/compute/v1/projects/${intent.project}`;
  const expected = cloud.actions
    .filter((action) => checkpoint.actions?.[action.id]?.state === 'done')
    .map((action) => {
      if (action.dependencies.some((id) => checkpoint.actions?.[id]?.state !== 'done'))
        throw new Error('Creation journal dependency differs');
      const name = action.argv[action.kind === 'subnetwork' ? 4 : 3];
      const scope =
        action.kind === 'instance'
          ? `zones/${node.zone}/instances`
          : action.kind === 'network'
            ? 'global/networks'
            : `regions/${intent.region}/subnetworks`;
      return `${prefix}/${scope}/${name}`;
    });
  const disks = resources.filter((resource) => resource.kind === 'disk');
  const hasInstance = expected.includes(`${prefix}/zones/${node.zone}/instances/${node.name}`);
  if (
    disks.length !== (hasInstance ? 1 : 0) ||
    resources.length !== expected.length + disks.length ||
    expected.some((link) => resources.filter((resource) => resource.selfLink === link).length !== 1) ||
    disks.some(
      (disk) =>
        disk.nodeName !== node.name ||
        disk.siteName !== intent.sites[0].name ||
        !disk.selfLink.startsWith(`${prefix}/zones/${node.zone}/disks/`),
    )
  )
    throw new Error('Partial cleanup ledger differs from completed creation journal');
}
async function observeGcpTeardownResource(api, resource, signal) {
  validateGcpResourceIdentity(resource);
  if (!['instance', 'disk', 'network', 'subnetwork', 'firewall'].includes(resource.kind))
    throw new Error('Qualified disposable teardown resource kind required');
  const parts = resource.selfLink.split('/'),
    scope = parts[7],
    location = parts[8],
    name = parts.at(-1);
  const base =
    resource.kind === 'subnetwork'
      ? ['compute', 'networks', 'subnets']
      : [
          'compute',
          resource.kind === 'instance'
            ? 'instances'
            : resource.kind === 'disk'
              ? 'disks'
              : resource.kind === 'firewall'
                ? 'firewall-rules'
                : 'networks',
        ];
  const response = await api.exec(
    'gcloud',
    [
      ...base,
      'describe',
      name,
      `--project=${resource.project}`,
      ...(scope === 'zones' ? [`--zone=${location}`] : scope === 'regions' ? [`--region=${location}`] : []),
      '--format=json(id,selfLink)',
    ],
    { signal },
  );
  signal?.throwIfAborted();
  if (response.exitCode !== 0) {
    if (/\b404\b|was not found|not found/i.test(response.stderr)) return null;
    throw new Error('Teardown ownership observation unavailable');
  }
  const result = JSON.parse(response.stdout);
  return { id: String(result.id), selfLink: result.selfLink };
}
function assertGcpTeardownPolicyFresh(policy) {
  const age = Date.now() - Date.parse(policy.observedAt);
  if (
    policy.identity !== 'f5xc-ce-automation-policy/v2' ||
    !/^sha256:[a-f0-9]{64}$/.test(policy.normalizedSha256) ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 5 * 60000
  )
    throw new Error('Current teardown policy required');
}
async function planGcpDeploymentTeardown(platform, api, intent, contract, policy, signal) {
  assertGcpTeardownProfile(intent, contract);
  assertGcpTeardownPolicyFresh(policy);
  signal?.throwIfAborted();
  if (!platform.gcpLifecycle) throw new Error('Qualified shared teardown lifecycle unavailable');
  const store = await storage(platform, intent),
    resources = await readGcpResourceInventory(store, intent);
  await assertNativeCleanupTopology(store, intent, resources);
  const cloud = planGcpOwnedTeardown(resources, {
    project: intent.project,
    region: intent.region,
    deploymentName: intent.deploymentName,
    engine: 'native',
  });
  const sources = [];
  for (const resource of resources) {
    const live = await observeGcpTeardownResource(api, resource, signal);
    if (!live) throw new Error('Initial teardown planning requires complete live inventory');
    await assertGcpResourceOwnership(store, resource, live);
    sources.push({ source: resource.selfLink, sha256: fingerprint(live) });
  }
  const lifecycle = await platform.gcpLifecycle(
    {
      deploymentId: intent.deploymentName,
      provider: 'gcp',
      engine: 'native',
      account: intent.project,
      region: intent.region,
    },
    intent.platformContext,
    signal,
  );
  const node = intent.sites[0].nodes[0],
    tokenName = `${node.name}-token`;
  const binding = await lifecycle.observeTeardown(tokenName, signal);
  const body = {
    schemaVersion: 1,
    operation: 'teardown',
    engine: 'native',
    intentFingerprint: fingerprint(intent),
    deploymentName: intent.deploymentName,
    project: intent.project,
    region: intent.region,
    platformContext: intent.platformContext,
    apiRelease: contract.release,
    policyReceipt: policy,
    createdAt: new Date().toISOString(),
    cloud,
    platform: binding,
    sourceReceipts: sources,
    approval: 'required',
    independentAbsence: 'required',
  };
  const plan = { ...body, planHash: fingerprint(body) };
  await store.write(`gcp-reviewed-${plan.planHash.slice(7)}.json`, plan);
  return plan;
}
async function applyGcpDeploymentTeardown(platform, api, intent, approvedHash, contract, policy, signal, onMutation) {
  assertGcpTeardownProfile(intent, contract);
  assertGcpTeardownPolicyFresh(policy);
  signal?.throwIfAborted();
  if (!/^sha256:[a-f0-9]{64}$/.test(approvedHash) || !platform.gcpLifecycle)
    throw new Error('Exact reviewed teardown authorization required');
  const store = await storage(platform, intent);
  const plan = await store.read(`gcp-reviewed-${approvedHash.slice(7)}.json`);
  const { planHash, ...body } = plan;
  if (
    plan.schemaVersion !== 1 ||
    plan.operation !== 'teardown' ||
    plan.engine !== 'native' ||
    plan.project !== intent.project ||
    plan.region !== intent.region ||
    plan.deploymentName !== intent.deploymentName ||
    plan.platformContext !== intent.platformContext ||
    planHash !== approvedHash ||
    fingerprint(body) !== approvedHash ||
    plan.intentFingerprint !== fingerprint(intent) ||
    fingerprint(plan.apiRelease) !== fingerprint(contract.release) ||
    plan.policyReceipt.normalizedSha256 !== policy.normalizedSha256
  )
    throw new Error('Reviewed teardown plan/contract differs');
  const authorizationName = `gcp-authorized-${approvedHash.slice(7)}.json`;
  let authorization;
  try {
    authorization = await store.read(authorizationName);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const age = Date.now() - Date.parse(plan.createdAt);
  if (authorization ? authorization.planHash !== approvedHash : !Number.isFinite(age) || age < 0 || age > 5 * 60000)
    throw new Error('Teardown authorization missing or review stale');
  const release = await acquireProcessLock(join3(store.directory, '.gcp-deployment-lock'));
  try {
    const resources = await readGcpResourceInventory(store, intent);
    await assertNativeCleanupTopology(store, intent, resources);
    if (
      fingerprint(plan.cloud.resources.slice().sort((a, b) => a.selfLink.localeCompare(b.selfLink))) !==
      fingerprint(resources.slice().sort((a, b) => a.selfLink.localeCompare(b.selfLink)))
    )
      throw new Error('Reviewed teardown inventory differs');
    for (const resource of resources) {
      const live = await observeGcpTeardownResource(api, resource, signal);
      if (live) await assertGcpResourceOwnership(store, resource, live);
    }
    const lifecycle = await platform.gcpLifecycle(
      {
        deploymentId: intent.deploymentName,
        provider: 'gcp',
        engine: 'native',
        account: intent.project,
        region: intent.region,
      },
      intent.platformContext,
      signal,
    );
    const current = await lifecycle.observeTeardown(plan.platform.tokenName, signal);
    if (
      current.siteUid !== plan.platform.siteUid ||
      (plan.platform.siteAbsent && !current.siteAbsent) ||
      (!current.tokenAbsent && current.tokenIdentityHash !== plan.platform.tokenIdentityHash)
    )
      throw new Error('Reviewed teardown platform identity differs');
    await store.write(authorizationName, { planHash: approvedHash });
    const mutatingApi = {
      exec: async (command, args, options) => {
        if (args.includes('delete')) onMutation?.();
        return api.exec(command, args, options);
      },
    };
    const shared = {
      read: (name) => store.read(name),
      write: (name, value) => store.write(name, value),
      exclusive: async (fn) => fn(),
    };
    const outcome = await applyGcpNativeTeardown(shared, mutatingApi, plan.cloud, plan.cloud.sha256, signal);
    if (outcome.state !== 'done') return { state: 'pending', phase: 'cloud', planHash: approvedHash };
    const token = current.tokenAbsent
      ? { absent: true }
      : await (async () => {
          onMutation?.();
          return lifecycle.revokeToken(plan.platform.tokenName, signal, plan.platform.tokenIdentityHash);
        })();
    if (!token.absent) return { state: 'pending', phase: 'token-revocation', planHash: approvedHash };
    const site = current.siteAbsent
      ? { absent: true }
      : await (async () => {
          onMutation?.();
          return lifecycle.deleteSite(signal);
        })();
    if (!site.absent) return { state: 'pending', phase: 'site-deletion', planHash: approvedHash };
    for (const resource of resources)
      if (await observeGcpTeardownResource(api, resource, signal))
        throw new Error('Independent cloud absence check failed');
    const absence = await lifecycle.observeTeardown(plan.platform.tokenName, signal);
    if (!absence.siteAbsent || !absence.tokenAbsent) throw new Error('Independent platform absence check failed');
    const evidence = {
      schemaVersion: 1,
      engine: 'native',
      deploymentName: intent.deploymentName,
      planHash: approvedHash,
      observedAt: new Date().toISOString(),
      cloudAbsent: resources.length,
      siteAbsent: true,
      tokenAbsent: true,
      state: 'done',
    };
    await store.write(`gcp-evidence-${approvedHash.slice(7)}.json`, evidence);
    return evidence;
  } finally {
    await release();
  }
}
var init_deployment_teardown = __esm(() => {
  init_process_lock();
  init_compute_plan();
  init_contract();
  init_discovery();
  init_native_teardown();
  init_ownership();
  init_teardown_plan();
  init_terraform_ha_profile();
  init_validation();
});

// plugins/gcloud/src/ce/terraform-public-ownership.ts
function publicTerraformPlatformScope(intent) {
  return intent.sites.flatMap((site) => [
    { address: `xcsh_securemesh_site_v2.${site.name.replaceAll('-', '_')}`, siteName: site.name },
    ...site.nodes.map((node) => ({
      address: `xcsh_token.${node.name.replaceAll('-', '_')}`,
      siteName: site.name,
      tokenName: `${node.name}-token`,
    })),
  ]);
}
function publicTerraformAddresses(intent) {
  return [
    ...publicTerraformCloudScope(intent).map(
      (resource) =>
        `google_compute_${resource.kind}.${resource.selfLink.substring(resource.selfLink.lastIndexOf('/') + 1).replaceAll('-', '_')}`,
    ),
    ...publicTerraformPlatformScope(intent).map((resource) => resource.address),
  ];
}
function publicTerraformSelections(intent) {
  return Object.fromEntries(
    publicTerraformAddresses(intent).map((address) => {
      const common = ['name', 'project', 'self_link'];
      if (address.startsWith('google_compute_instance.'))
        return [
          address,
          [
            ...common,
            'zone',
            'instance_id',
            'boot_disk.length',
            'boot_disk.0.source',
            'boot_disk.0.auto_delete',
            'network_interface.length',
            ...(intent.sites.some((site) => site.nodes.length === 3) ? ['tags'] : []),
            ...[0, 1].flatMap((n) => [`network_interface.${n}.network`, `network_interface.${n}.subnetwork`]),
          ],
        ];
      if (address.startsWith('google_compute_disk.')) return [address, [...common, 'zone', 'disk_id']];
      if (address.startsWith('google_compute_network.')) return [address, [...common, 'numeric_id']];
      if (address.startsWith('google_compute_firewall.'))
        return [
          address,
          [
            ...common,
            'creation_timestamp',
            'network',
            'direction',
            'source_ranges',
            'destination_ranges',
            'target_tags',
            'allow',
          ],
        ];
      if (address.startsWith('google_compute_subnetwork.'))
        return [address, [...common, 'region', 'subnetwork_id', 'network', 'ip_cidr_range']];
      return [
        address,
        ['name', 'namespace', 'creation_identity_sha256', ...(address.startsWith('xcsh_token.') ? ['site_name'] : [])],
      ];
    }),
  );
}
function publicTerraformCloudScope(intent) {
  validateIntent(intent);
  const prefix = `https://www.googleapis.com/compute/v1/projects/${intent.project}`;
  const resources = intent.sites.flatMap((site) =>
    site.nodes.flatMap((node) => [
      {
        kind: 'instance',
        selfLink: `${prefix}/zones/${node.zone}/instances/${node.name}`,
        siteName: site.name,
        nodeName: node.name,
      },
      {
        kind: 'disk',
        selfLink: `${prefix}/zones/${node.zone}/disks/${node.name}`,
        siteName: site.name,
        nodeName: node.name,
      },
      ...node.interfaces.flatMap((nic) => [
        { kind: 'network', selfLink: `${prefix}/global/networks/${nic.network}` },
        { kind: 'subnetwork', selfLink: `${prefix}/regions/${intent.region}/subnetworks/${nic.subnet}` },
      ]),
    ]),
  );
  for (const site of intent.sites.filter((site) => site.nodes.length === 3))
    for (const nic of site.nodes[0].interfaces)
      for (const direction of ['ingress', 'egress'])
        resources.push({
          kind: 'firewall',
          selfLink: `${prefix}/global/firewalls/${site.name}-ha-${nic.role}-${direction}`,
        });
  return [...new Map(resources.map((resource) => [resource.selfLink, resource])).values()].map((resource) => ({
    ...resource,
    id: '0',
    project: intent.project,
    deploymentName: intent.deploymentName,
    engine: 'terraform',
  }));
}
async function inspectPublicTerraformOwnership(runtime, intent, receipt, signal) {
  if (intent.engine !== 'terraform') throw new Error('Terraform ownership requires the owning engine');
  if (!runtime.session.readApplyAttemptResourceFields) throw new Error('Restricted attempt inspection unavailable');
  const selections = publicTerraformSelections(intent);
  const projected = await runtime.session.readApplyAttemptResourceFields(
    receipt,
    selections,
    runtime.environment,
    signal,
  );
  assertPublicTerraformSnapshot(intent, receipt, projected);
  const resources = [];
  const scope = publicTerraformCloudScope(intent);
  for (let index = 0; index < scope.length; index++) {
    const address = publicTerraformAddresses(intent)[index];
    const value = projected.resources[address];
    const expected = scope[index];
    const live = await observeGcpTeardownResource(runtime.api, expected, signal);
    if (!value) {
      if (live) throw new Error('Unidentified cloud object requires reconciliation');
      continue;
    }
    if (!live || live.selfLink !== expected.selfLink || !/^\d+$/.test(live.id))
      throw new Error('Missing owning cloud object requires reconciliation');
    const idField = ['instance_id', 'disk_id', 'numeric_id', 'subnetwork_id'][
      ['instance', 'disk', 'network', 'subnetwork', 'firewall'].indexOf(expected.kind)
    ];
    if (
      value.name !== expected.selfLink.split('/').at(-1) ||
      value.project !== intent.project ||
      value.self_link !== expected.selfLink ||
      (expected.kind !== 'firewall' && String(value[idField]) !== live.id)
    )
      throw new Error('Replacement cloud identity requires reconciliation');
    if (
      ['instance', 'disk'].includes(expected.kind) &&
      value.zone !== expected.selfLink.split('/zones/')[1]?.split('/')[0]
    )
      throw new Error('Cloud zone identity differs');
    if (expected.kind === 'subnetwork') {
      const nic = intent.sites
        .flatMap((site) => site.nodes.flatMap((node) => node.interfaces))
        .find((n) => expected.selfLink.endsWith(`/subnetworks/${n.subnet}`));
      if (
        !nic ||
        value.region !== intent.region ||
        value.ip_cidr_range !== nic.cidr ||
        value.network !==
          scope.find((r) => r.kind === 'network' && r.selfLink.endsWith(`/networks/${nic.network}`))?.selfLink
      )
        throw new Error('Subnet ownership topology differs');
    }
    if (expected.kind === 'firewall') {
      await assertOriginalFirewallInsert(runtime, intent, value, live.id, signal);
      const binding = intent.sites
        .flatMap((site) =>
          site.nodes[0].interfaces.flatMap((nic) =>
            ['INGRESS', 'EGRESS'].map((direction) => ({
              site,
              nic,
              direction,
              name: `${site.name}-ha-${nic.role}-${direction.toLowerCase()}`,
            })),
          ),
        )
        .find((row) => expected.selfLink.endsWith(`/firewalls/${row.name}`));
      if (
        !binding ||
        value.network !==
          `https://www.googleapis.com/compute/v1/projects/${intent.project}/global/networks/${binding.nic.network}` ||
        value.direction !== binding.direction ||
        fingerprint(value.source_ranges ?? []) !== fingerprint(binding.direction === 'INGRESS' ? ['0.0.0.0/0'] : []) ||
        fingerprint(value.destination_ranges ?? []) !==
          fingerprint(binding.direction === 'EGRESS' ? ['0.0.0.0/0'] : []) ||
        fingerprint(value.target_tags) !== fingerprint([`${binding.site.name}-ha-peer`]) ||
        fingerprint(value.allow) !== fingerprint([{ protocol: 'all', ports: [] }])
      )
        throw new Error('HA interface firewall ownership topology differs');
    }
    resources.push({ ...expected, id: live.id });
  }
  const prefix = `https://www.googleapis.com/compute/v1/projects/${intent.project}`;
  for (const site of intent.sites)
    for (const node of site.nodes) {
      const key = node.name.replaceAll('-', '_');
      const instance = projected.resources[`google_compute_instance.${key}`];
      if (
        instance &&
        (instance['boot_disk.length'] !== 1 ||
          instance['boot_disk.0.source'] !== `${prefix}/zones/${node.zone}/disks/${node.name}` ||
          instance['boot_disk.0.auto_delete'] !== false ||
          !projected.resources[`google_compute_disk.${key}`] ||
          instance['network_interface.length'] !== node.interfaces.length ||
          (site.nodes.length === 3 &&
            (!Array.isArray(instance.tags) || !instance.tags.includes(`${site.name}-ha-peer`))) ||
          node.interfaces.some(
            (nic) =>
              instance[`network_interface.${nic.index}.network`] !== `${prefix}/global/networks/${nic.network}` ||
              instance[`network_interface.${nic.index}.subnetwork`] !==
                `${prefix}/regions/${intent.region}/subnetworks/${nic.subnet}`,
          ))
      )
        throw new Error('VM/disk/NIC owning topology differs');
    }
  const platform = {};
  for (const observation of await observePublicTerraformPlatform(runtime, intent, signal)) {
    const { address, absent, hash, siteName, tokenName } = observation;
    const value = projected.resources[address];
    if (!value) {
      if (!absent) throw new Error('Unidentified XC object requires reconciliation');
      continue;
    }
    if (
      absent ||
      typeof hash !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(hash) ||
      value.creation_identity_sha256 !== hash ||
      value.namespace !== 'system' ||
      value.name !== (tokenName ?? siteName) ||
      (tokenName && value.site_name !== siteName)
    )
      throw new Error('Original XC creation identity differs');
    platform[address] = hash;
  }
  const addresses = Object.keys(projected.resources).filter((address) => projected.resources[address] !== null);
  return {
    schemaVersion: 2,
    intentFingerprint: fingerprint(intent),
    receiptFingerprint: fingerprint(receipt),
    state: { sha256: projected.stateSha256, lineage: projected.lineage, serial: projected.serial },
    projectionHash: fingerprint(projected.resources),
    addresses,
    resources,
    platform,
    complete: addresses.length === publicTerraformAddresses(intent).length,
  };
}
async function observePublicTerraformPlatform(runtime, intent, signal) {
  const rows = new Map();
  for (const site of intent.sites)
    for (const node of site.nodes) {
      signal?.throwIfAborted();
      const tokenName = `${node.name}-token`;
      const observed = await runtime.observePlatform(site.name, tokenName, signal);
      signal?.throwIfAborted();
      if (
        observed.siteName !== site.name ||
        observed.tokenName !== tokenName ||
        typeof observed.siteAbsent !== 'boolean' ||
        typeof observed.tokenAbsent !== 'boolean'
      )
        throw new Error('Scoped Platform observation differs');
      const siteRow = {
        address: `xcsh_securemesh_site_v2.${site.name.replaceAll('-', '_')}`,
        siteName: site.name,
        absent: observed.siteAbsent,
        hash: observed.siteIdentitySha256,
      };
      const prior = rows.get(siteRow.address);
      if (prior && fingerprint(prior) !== fingerprint(siteRow))
        throw new Error('XC site identity changed during node observations');
      rows.set(siteRow.address, siteRow);
      const address = `xcsh_token.${node.name.replaceAll('-', '_')}`;
      rows.set(address, {
        address,
        siteName: site.name,
        tokenName,
        absent: observed.tokenAbsent,
        hash: observed.tokenIdentitySha256,
      });
    }
  return [...rows.values()];
}
function assertPublicTerraformSnapshot(intent, receipt, projected) {
  const selections = publicTerraformSelections(intent);
  if (
    projected.schemaVersion !== 1 ||
    projected.planSha256 !== receipt.planSha256 ||
    !['applying', 'applied'].includes(projected.applyState) ||
    !/^[a-f0-9]{64}$/.test(projected.stateSha256) ||
    !projected.lineage?.trim() ||
    !Number.isSafeInteger(projected.serial) ||
    projected.serial < 0 ||
    fingerprint(Object.keys(projected.resources).sort()) !== fingerprint(Object.keys(selections).sort())
  )
    throw new Error('Original state snapshot binding differs');
  for (const [address, value] of Object.entries(projected.resources))
    if (value !== null && fingerprint(Object.keys(value).sort()) !== fingerprint(selections[address].slice().sort()))
      throw new Error('Unexpected or sensitive state projection');
}
async function assertOriginalFirewallInsert(runtime, intent, value, originalId, signal) {
  if (
    typeof value.creation_timestamp !== 'string' ||
    !Number.isFinite(Date.parse(value.creation_timestamp)) ||
    typeof value.name !== 'string' ||
    typeof value.self_link !== 'string' ||
    !/^[1-9]\d*$/.test(originalId)
  )
    throw new Error('Original firewall insert timestamp unavailable');
  const creation = Date.parse(value.creation_timestamp);
  const observation = await runtime.api.exec(
    'gcloud',
    [
      'compute',
      'firewall-rules',
      'describe',
      value.name,
      '--project',
      intent.project,
      '--format=json(id,selfLink,creationTimestamp)',
      '--quiet',
    ],
    { signal },
  );
  if (observation.exitCode !== 0) throw new Error('Original firewall creation identity unavailable');
  const live = parseGcloudJsonOutput(observation.stdout);
  if (
    !live ||
    String(live.id) !== originalId ||
    live.selfLink !== value.self_link ||
    typeof live.creationTimestamp !== 'string' ||
    Date.parse(live.creationTimestamp) !== creation
  )
    throw new Error('Original firewall live creation identity differs');
  const result = await runtime.api.exec(
    'gcloud',
    [
      'compute',
      'operations',
      'list',
      '--project',
      intent.project,
      '--filter',
      `operationType=insert AND targetLink=${value.self_link}`,
      '--format=json',
      '--quiet',
    ],
    { signal },
  );
  if (result.exitCode !== 0) throw new Error('Original firewall insert evidence unavailable');
  const rows = parseGcloudJsonOutput(result.stdout);
  if (!Array.isArray(rows)) throw new Error('Original firewall insert evidence malformed');
  const original = rows.filter(
    (row) =>
      row.operationType === 'insert' &&
      row.status === 'DONE' &&
      !row.error &&
      row.targetLink === value.self_link &&
      typeof row.insertTime === 'string' &&
      typeof row.startTime === 'string' &&
      typeof row.endTime === 'string' &&
      Date.parse(row.insertTime) <= creation &&
      creation <= Date.parse(row.endTime) &&
      Date.parse(row.insertTime) <= Date.parse(row.startTime) &&
      Date.parse(row.startTime) <= Date.parse(row.endTime),
  );
  if (original.length !== 1 || String(original[0].targetId) !== originalId)
    throw new Error('Original firewall insert target identity differs');
  return {
    targetId: originalId,
    creationTimestamp: value.creation_timestamp,
    evidenceHash: fingerprint({ operation: original[0], live }),
  };
}
var init_terraform_public_ownership = __esm(() => {
  init_exec();
  init_deployment_teardown();
  init_discovery();
  init_validation();
});

// plugins/platform/src/ce/gcp-operational-binding.ts
var init_gcp_operational_binding = __esm(() => {
  init_discovery();
});

// plugins/platform/src/ce/gcp-runtime-diagnostics.ts
var init_gcp_runtime_diagnostics = __esm(() => {
  init_discovery();
});

// plugins/platform/src/ce/gcp-operational-command.ts
var init_gcp_operational_command = __esm(() => {
  init_discovery();
  init_gcp_runtime_diagnostics();
});

// plugins/platform/src/ce/gcp-operational-placement.ts
var init_gcp_operational_placement = __esm(() => {
  init_operational_health();
});

// plugins/platform/src/ce/gcp-operational-diagnosis.ts
var init_gcp_operational_diagnosis = () => {};

// plugins/platform/src/ce/gcp-operational-observation.ts
var init_gcp_operational_observation = __esm(() => {
  init_discovery();
  init_operational_health();
});

// plugins/platform/src/ce/gcp-operational-runtime.ts
var init_gcp_operational_runtime = __esm(() => {
  init_operational_health();
  init_gcp_runtime_diagnostics();
});

// plugins/platform/src/ce/gcp-operational-site-status.ts
var init_gcp_operational_site_status = __esm(() => {
  init_discovery();
});

// plugins/platform/src/ce/gcp-operational-source.ts
var init_gcp_operational_source = __esm(() => {
  init_discovery();
  init_gcp_operational_command();
  init_gcp_operational_diagnosis();
  init_gcp_operational_observation();
  init_gcp_operational_runtime();
  init_gcp_operational_site_status();
});

// plugins/platform/src/ce/gcp-owned-operational.ts
var init_gcp_owned_operational = __esm(() => {
  init_discovery();
  init_operational_health();
  init_ownership();
  init_terraform_public_ownership();
  init_gcp_operational_binding();
  init_gcp_operational_command();
  init_gcp_operational_placement();
  init_gcp_operational_source();
  init_gcp_runtime_diagnostics();
  init_process_lock();
});

// plugins/platform/src/ce/gcp-observation.ts
var init_gcp_observation = __esm(() => {
  init_discovery();
  init_operational_health();
  init_ownership();
  init_gcp_http();
  init_gcp_owned_operational();
  init_runtime();
});

// plugins/platform/src/ce/verified-api-release.ts
var repository2 = 'f5-sales-demo/api-specs-enriched',
  tag = 'v7.0.1',
  commit = '2513fe498149c98fb737ff2ab207704b8a86fec6',
  digest = 'sha256:48863c0a2e6c6a6fde050f4f8f5a6966b02872851fa1acb7830f26ef2e143cd9',
  _assetUrl,
  _CE_API_RELEASE;
var init_verified_api_release = __esm(() => {
  _assetUrl = `https://github.com/${repository2}/releases/download/${tag}/openapi.json`;
  _CE_API_RELEASE = Object.freeze({ tag, commit, fingerprint: digest });
});
// plugins/platform/src/ce/wire-schema.ts
var _keywords;
var init_wire_schema = __esm(() => {
  _keywords = new Set([
    'type',
    'enum',
    'const',
    'required',
    'minLength',
    'maxLength',
    'pattern',
    'minimum',
    'maximum',
    'multipleOf',
    'minItems',
    'maxItems',
    'uniqueItems',
    'minProperties',
    'maxProperties',
    'format',
    'nullable',
  ]);
});

// plugins/platform/src/ce/wire-routing.ts
var init_wire_routing = __esm(() => {
  init_wire_schema();
});

// plugins/platform/src/ce/wire-site.ts
var init_wire_site = __esm(() => {
  init_wire_schema();
});

// plugins/platform/src/ce/verified-contract.ts
var _publishedAssets;
var init_verified_contract = __esm(() => {
  init_verified_api_release();
  init_wire_routing();
  init_wire_schema();
  init_wire_site();
  _publishedAssets = Object.freeze({
    'smsv2-contract.json': 'sha256:3602ecd09b744449f1bf036c42e10e8be7133f6073e5d1553edb49e46cd2429c',
    'smsv2-contract-manifest.json': 'sha256:75899912ef4c0d243caca5b466d2e8a467d541e7721c8abefd19c890d88d9a07',
    'smsv2-evidence-receipt.json': 'sha256:4e90ee602aa6b00c78f7034691b36ef3d439d5f6ee12bf321c29dca6b0d53a8c',
  });
});

// plugins/platform/src/ce/service.ts
var CE_SERVICE_CHANNEL = 'xcsh:ce-platform:v2:service';
var init_service = __esm(() => {
  init_contract();
  init_discovery();
  init_deployment_store();
  init_gcp_http();
  init_gcp_lifecycle();
  init_gcp_observation();
  init_process_lock();
  init_runtime();
  init_verified_contract();
});

// plugins/gcloud/skills/gcp-ce/references/byol-vm-contract.json
var byol_vm_contract_default;
var init_byol_vm_contract = __esm(() => {
  byol_vm_contract_default = {
    contractId: 'f5xc-gcp-byol-terms/v1',
    publisherProject: 'f5-7626-networks-public',
    billingService: 'f5-distributed-cloud-customer-edge.endpoints.f5-7626-networks-public.cloud.goog',
    productUrl:
      'https://console.cloud.google.com/marketplace/product/f5-7626-networks-public/f5-distributed-cloud-customer-edge',
    configurationUrl:
      'https://console.cloud.google.com/marketplace/vm/config/f5-7626-networks-public/f5-distributed-cloud-customer-edge',
    productType: 'BYOL',
    acceptanceMechanism: 'explicit-authorization-for-access-or-use',
    evidence: {
      source: 'authenticated Chrome CDP product and launch-form observation',
      imageVersion: 'f5xc-ce-crt-20260801-0205-byol',
      observedSeparatePurchaseOrConsentControl: false,
      softwareLicenseAcquired: false,
      deploymentSubmitted: false,
      imageId: '1689146860273445475',
      licenseId: '2214615995702558918',
      licenseCode: '8535603005418881222',
      licenseSelfLink:
        'https://www.googleapis.com/compute/v1/projects/f5-7626-networks-public/global/licenses/cloud-marketplace-59c41a5addf4dd72-df1ebeb69c0ba664',
    },
    documents: [
      {
        role: 'google-marketplace',
        url: 'https://cloud.google.com/terms/marketplace/launcher?hl=en_US',
        version: 'November 13, 2025',
        digestKind: 'normalized-current-legal-text',
        sha256: 'sha256:0b7cc7b34a8cf50f1da72c4e73905b7d640e3084a3ee6599d768a73e5118e14a',
      },
      {
        role: 'f5-platform',
        url: 'https://www.f5.com/pdf/customer-support/eusa.pdf',
        version: 'July 1, 2026',
        digestKind: 'document-bytes',
        sha256: 'sha256:48ca1f9f22f4b399213e723de36c9853ad767283645b0721e5b74452b3862b97',
      },
    ],
  };
});

// plugins/gcloud/src/ce/corporate-funding.ts
import { createHash as createHash4 } from 'node:crypto';
import { lstat as lstat3, readFile as readFile2 } from 'node:fs/promises';
import { homedir as homedir2 } from 'node:os';
import { join as join4 } from 'node:path';

async function readGcpCorporateFundingPolicy(
  project,
  filename = process.env.XCSH_GCP_FUNDING_POLICY_FILE ?? join4(homedir2(), '.config', 'xcsh', 'gcp-ce-funding.json'),
) {
  validateScope(project);
  const stat = await lstat3(filename);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 63) !== 0 ||
    stat.size > 64 * 1024
  )
    throw new Error('Restricted corporate funding policy required');
  const raw = await readFile2(filename, 'utf8');
  const policy = JSON.parse(raw);
  validatePolicy(policy, project);
  return { policy, policySha256: `sha256:${createHash4('sha256').update(raw).digest('hex')}` };
}
function validatePolicy(policy, project) {
  if (
    policy.schemaVersion !== 1 ||
    policy.project !== project ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(policy.expectedOrganizationDomain) ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(policy.expectedAccountDomain) ||
    !/^billingAccounts\/[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}$/.test(policy.expectedBillingAccountName) ||
    policy.fundingAuthority !== 'explicit-user-confirmation-in-current-session' ||
    policy.billingChangesAuthorized !== false ||
    policy.personalPaymentAuthorized !== false
  )
    throw new Error('Explicit corporate funding binding required');
}
async function collectGcpCorporateFunding(api, policy, policySha256, signal) {
  validateScope(policy.project);
  validatePolicy(policy, policy.project);
  if (!/^sha256:[a-f0-9]{64}$/.test(policySha256)) throw new Error('Corporate funding policy digest required');
  const sourceReceipts = [];
  const read = async (source, args) => {
    signal?.throwIfAborted();
    const result = await api.exec('gcloud', [...args, `--project=${policy.project}`, '--format=json', '--quiet'], {
      signal,
    });
    signal?.throwIfAborted();
    if (result.exitCode !== 0) throw new Error('Corporate funding observation unavailable');
    const value = JSON.parse(result.stdout);
    sourceReceipts.push({ source, sha256: fingerprint(value) });
    return value;
  };
  const accounts = await read('active-account', ['auth', 'list', '--filter=status:ACTIVE']);
  if (
    !Array.isArray(accounts) ||
    accounts.length !== 1 ||
    accounts[0].status !== 'ACTIVE' ||
    typeof accounts[0].account !== 'string' ||
    accounts[0].account.split('@').length !== 2 ||
    accounts[0].account.split('@')[1].toLowerCase() !== policy.expectedAccountDomain
  )
    throw new Error('Active Google account is not the approved corporate identity');
  const billing = await read('project-billing', ['billing', 'projects', 'describe', policy.project]);
  if (
    billing.projectId !== policy.project ||
    billing.billingEnabled !== true ||
    billing.billingAccountName !== policy.expectedBillingAccountName
  )
    throw new Error('Project corporate billing association changed or is unavailable');
  const ancestors = await read('project-ancestors', ['projects', 'get-ancestors', policy.project]);
  const organizations = Array.isArray(ancestors)
    ? ancestors.filter((row) => row.type === 'organization' && /^\d+$/.test(row.id))
    : [];
  if (organizations.length !== 1) throw new Error('Corporate project organization unavailable');
  const organization = await read('organization', ['organizations', 'describe', organizations[0].id]);
  if (organization.displayName?.toLowerCase() !== policy.expectedOrganizationDomain)
    throw new Error('Project is outside the approved corporate organization');
  return {
    schemaVersion: 1,
    project: policy.project,
    accountDomain: policy.expectedAccountDomain,
    organizationDomain: policy.expectedOrganizationDomain,
    billingAccountName: policy.expectedBillingAccountName,
    billingEnabled: true,
    policySha256,
    observedAt: new Date().toISOString(),
    sourceReceipts,
  };
}
async function collectCurrentGcpCorporateFunding(api, project, signal) {
  const { policy, policySha256 } = await readGcpCorporateFundingPolicy(project);
  return collectGcpCorporateFunding(api, policy, policySha256, signal);
}
function assertGcpCorporateFundingCurrent(receipt, project, expectedBillingAccountName) {
  const age = Date.now() - Date.parse(receipt.observedAt);
  if (
    receipt.schemaVersion !== 1 ||
    receipt.project !== project ||
    receipt.billingEnabled !== true ||
    receipt.billingAccountName !== expectedBillingAccountName ||
    !/^billingAccounts\/[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}$/.test(receipt.billingAccountName) ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(receipt.accountDomain) ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(receipt.organizationDomain) ||
    !Array.isArray(receipt.sourceReceipts) ||
    receipt.sourceReceipts.length !== 4 ||
    receipt.sourceReceipts.some((source) => !/^sha256:[a-f0-9]{64}$/.test(source.sha256)) ||
    !/^sha256:[a-f0-9]{64}$/.test(receipt.policySha256) ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 5 * 60000
  )
    throw new Error('Current corporate funding receipt required before billable execution');
}
var init_corporate_funding = __esm(() => {
  init_discovery();
  init_validation();
});

// plugins/gcloud/src/ce/byol-terms.ts
import { createHash as createHash5 } from 'node:crypto';

async function normalizedGoogleMarketplaceTerms(bytes) {
  const cleaned = await new HTMLRewriter()
    .on('script,style,head', {
      element(element) {
        element.remove();
      },
    })
    .transform(new Response(new Uint8Array(bytes)))
    .text();
  const chunks = [];
  await new HTMLRewriter()
    .onDocument({
      text(text) {
        chunks.push(text.text);
      },
    })
    .transform(new Response(cleaned))
    .text();
  const text = chunks.join(' ').replace(/\s+/g, ' ').trim();
  const start = text.indexOf('Google Cloud Marketplace Terms of Service');
  const end = text.indexOf('Previous versions', start);
  if (start < 0 || end <= start || end - start < 1000 || !text.slice(start, end).includes('By using the Marketplace'))
    throw new Error('Current Google Marketplace legal text unavailable');
  return text.slice(start, end).trim();
}
async function fetchGcpByolDocument(url, signal) {
  if (!byol_vm_contract_default.documents.some((document) => document.url === url))
    throw new Error('Unqualified BYOL document URL');
  const response = await fetch(url, {
    credentials: 'omit',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
  });
  if (!response.ok || !response.body) throw new Error('BYOL legal document unavailable');
  const reader = response.body.getReader();
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4 * 1024 * 1024) throw new Error('BYOL document exceeds size limit');
      parts.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return Buffer.concat(parts);
}
async function binding(intent, source, signal, profile = byol_vm_contract_default) {
  const contract = profile;
  validateIntent(intent);
  if (
    intent.image.name !== contract.evidence.imageVersion ||
    intent.image.id !== contract.evidence.imageId ||
    intent.image.licenses.length !== 1 ||
    intent.image.licenses[0] !== contract.evidence.licenseSelfLink
  )
    throw new Error('Evidence-backed BYOL image profile unavailable');
  const image = await source.query(intent.image.selfLink.replace('https://www.googleapis.com', ''), undefined, signal);
  if (
    String(image.id) !== intent.image.id ||
    image.name !== intent.image.name ||
    image.selfLink !== intent.image.selfLink ||
    image.status !== 'READY' ||
    fingerprint(image.licenses) !== fingerprint(intent.image.licenses)
  )
    throw new Error('BYOL image identity changed');
  const link = intent.image.licenses[0];
  const license = await source.query(link.replace('https://www.googleapis.com', ''), undefined, signal);
  if (
    String(license.id) !== contract.evidence.licenseId ||
    String(license.licenseCode) !== contract.evidence.licenseCode ||
    license.selfLink !== link ||
    license.chargesUseFee !== false ||
    license.description !==
      `License for Cloud Marketplace virtual machine image solution with billing service ${contract.billingService}: default`
  )
    throw new Error('BYOL license/product identity unqualified');
  const documents = [];
  for (const expected of contract.documents) {
    const bytes = await source.document(expected.url, signal);
    const content =
      expected.digestKind === 'normalized-current-legal-text' ? await normalizedGoogleMarketplaceTerms(bytes) : bytes;
    const sha256 = `sha256:${createHash5('sha256').update(content).digest('hex')}`;
    if (sha256 !== expected.sha256) throw new Error('BYOL legal document changed; requalification required');
    documents.push({ role: expected.role, url: expected.url, version: expected.version, sha256 });
  }
  return {
    contractId: contract.contractId,
    contractSha256: fingerprint(contract),
    apiRelease: GCP_CE_API_RELEASE,
    intentFingerprint: fingerprint(intent),
    project: intent.project,
    engine: intent.engine,
    platformContext: intent.platformContext,
    imageId: intent.image.id,
    imageSelfLink: intent.image.selfLink,
    licenseId: String(license.id),
    licenseCode: String(license.licenseCode),
    licenseSelfLink: link,
    billingService: contract.billingService,
    productUrl: contract.productUrl,
    documents,
  };
}
async function planGcpByolTerms(intent, source, funding, store, signal, profile = byol_vm_contract_default) {
  assertGcpCorporateFundingCurrent(funding, intent.project, funding.billingAccountName);
  const evidence = await binding(intent, source, signal, profile);
  const body = {
    schemaVersion: 1,
    operation: 'authorize-byol-terms',
    acceptanceMechanism: profile.acceptanceMechanism,
    binding: evidence,
    funding,
    createdAt: new Date().toISOString(),
    approval: 'required',
    purchases: 0,
    resourcesCreated: 0,
    softwareLicenseAcquired: false,
  };
  const plan = { ...body, planHash: fingerprint(body) };
  await store.write(`gcp-byol-reviewed-${plan.planHash.slice(7)}.json`, plan);
  return plan;
}
async function authorizeGcpByolTerms(
  intent,
  source,
  funding,
  store,
  approvedHash,
  signal,
  profile = byol_vm_contract_default,
) {
  if (!/^sha256:[a-f0-9]{64}$/.test(approvedHash)) throw new Error('Exact BYOL terms review required');
  const plan = await store.read(`gcp-byol-reviewed-${approvedHash.slice(7)}.json`);
  const { planHash, ...body } = plan;
  const age = Date.now() - Date.parse(plan.createdAt);
  if (
    planHash !== approvedHash ||
    fingerprint(body) !== approvedHash ||
    plan.schemaVersion !== 1 ||
    plan.operation !== 'authorize-byol-terms' ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 5 * 60000
  )
    throw new Error('BYOL terms review changed or expired');
  assertGcpCorporateFundingCurrent(funding, intent.project, plan.funding.billingAccountName);
  if (funding.policySha256 !== plan.funding.policySha256)
    throw new Error('Corporate funding changed after terms review');
  const current = await binding(intent, source, signal, profile);
  if (fingerprint(current) !== fingerprint(plan.binding)) throw new Error('BYOL terms/image/context binding changed');
  const authorization = {
    schemaVersion: 1,
    state: 'authorized-for-access-or-use',
    planHash: approvedHash,
    binding: current,
    fundingPolicySha256: funding.policySha256,
    billingAccountName: funding.billingAccountName,
    authorizedAt: new Date().toISOString(),
    remoteConsentGranted: false,
    purchases: 0,
    resourcesCreated: 0,
    softwareLicenseAcquired: false,
  };
  const receipt = { ...authorization, authorizationHash: fingerprint(authorization) };
  await store.write('gcp-byol-authorization.json', receipt);
  return receipt;
}
async function assertGcpByolAuthorization(intent, source, funding, store, signal) {
  const receipt = await store.read('gcp-byol-authorization.json');
  const { authorizationHash, ...body } = receipt;
  if (
    receipt.schemaVersion !== 1 ||
    receipt.state !== 'authorized-for-access-or-use' ||
    authorizationHash !== fingerprint(body) ||
    !/^sha256:[a-f0-9]{64}$/.test(receipt.planHash)
  )
    throw new Error('Original BYOL terms authorization required');
  assertGcpCorporateFundingCurrent(funding, intent.project, receipt.billingAccountName);
  if (receipt.fundingPolicySha256 !== funding.policySha256) throw new Error('BYOL corporate funding policy changed');
  const current = await binding(intent, source, signal);
  if (fingerprint(current) !== fingerprint(receipt.binding))
    throw new Error('BYOL authorization image/context/documents changed');
  return receipt;
}
var init_byol_terms = __esm(() => {
  init_byol_vm_contract();
  init_contract();
  init_corporate_funding();
  init_discovery();
  init_validation();
});

// plugins/gcloud/src/ce/native-operation.ts
function valid(binding) {
  if (binding.engine !== 'native') throw new Error('GCP native reconciliation requires owning engine native');
  if (
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(binding.project) ||
    [binding.zone !== undefined, binding.region !== undefined, binding.global === true].filter(Boolean).length !== 1 ||
    (binding.zone !== undefined && !/^[a-z]+(?:-[a-z]+)+\d-[a-z]$/.test(binding.zone)) ||
    (binding.region !== undefined && !/^[a-z]+(?:-[a-z]+)+\d$/.test(binding.region))
  )
    throw new Error('Explicit GCP operation scope required');
  for (const name of [binding.deploymentName, binding.actionId])
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(name)) throw new Error('Invalid GCP operation binding');
}
function scopePath(binding) {
  return binding.zone ? `zones/${binding.zone}` : binding.region ? `regions/${binding.region}` : 'global';
}
function parseOperation(value, binding) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed GCP operation');
  const row = value;
  const prefix = `https://www.googleapis.com/compute/v1/projects/${binding.project}/${scopePath(binding)}/operations/`;
  if (typeof row.name !== 'string' || !/^operation-[a-z0-9-]+$/.test(row.name) || row.selfLink !== prefix + row.name)
    throw new Error('GCP operation identity mismatch');
  if (!['PENDING', 'RUNNING', 'DONE'].includes(String(row.status))) throw new Error('Unknown GCP operation state');
  const error = row.error;
  if (error && (!Array.isArray(error.errors) || error.errors.length === 0))
    throw new Error('Malformed GCP operation failure');
  const errors = (error?.errors ?? []).map((item) =>
    typeof item.code === 'string' && /^[A-Z0-9_]+$/.test(item.code) ? item.code : 'UNKNOWN_OPERATION_ERROR',
  );
  return { name: row.name, status: String(row.status), errors };
}
function filename(binding) {
  return `gcp-operation-${binding.actionId}.json`;
}
async function recordGcpOperation(store, binding, response) {
  valid(binding);
  const operation = parseOperation(response, binding);
  const checkpoint = {
    schemaVersion: 1,
    binding: structuredClone(binding),
    operationName: operation.name,
    state: operation.status === 'DONE' ? (operation.errors.length ? 'failed' : 'done') : 'pending',
    errorCodes: operation.errors,
  };
  let previous;
  try {
    previous = await store.read(filename(binding));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (previous) {
    if (
      previous.schemaVersion !== 1 ||
      fingerprint(previous.binding) !== fingerprint(binding) ||
      previous.operationName !== checkpoint.operationName
    )
      throw new Error('Operation checkpoint identity cannot be overwritten');
    if (!['pending', 'done', 'failed'].includes(previous.state))
      throw new Error('Malformed operation checkpoint state');
    if (previous.state !== 'pending' && fingerprint(previous) !== fingerprint(checkpoint))
      throw new Error('Terminal operation evidence cannot change');
  }
  await store.write(filename(binding), checkpoint);
  return checkpoint;
}
async function reconcileGcpOperation(store, api, binding, signal) {
  valid(binding);
  const checkpoint = await store.read(filename(binding));
  if (
    checkpoint?.schemaVersion !== 1 ||
    fingerprint(checkpoint.binding) !== fingerprint(binding) ||
    !/^operation-[a-z0-9-]+$/.test(checkpoint.operationName)
  )
    throw new Error('Operation checkpoint ownership differs');
  if (checkpoint.state === 'done' || checkpoint.state === 'failed') return checkpoint;
  if (checkpoint.state !== 'pending') throw new Error('Malformed operation checkpoint state');
  if (signal?.aborted) throw new Error('GCP operation observation cancelled');
  const args = [
    'compute',
    'operations',
    'describe',
    checkpoint.operationName,
    `--project=${binding.project}`,
    ...(binding.zone ? [`--zone=${binding.zone}`] : binding.region ? [`--region=${binding.region}`] : ['--global']),
    '--format=json(name,selfLink,status,error.errors.code)',
  ];
  const output = await api.exec('gcloud', args, { signal });
  if (output.exitCode !== 0) throw new Error('GCP operation observation failed');
  let value;
  try {
    value = JSON.parse(output.stdout);
  } catch {
    throw new Error('Malformed GCP operation response');
  }
  const operation = parseOperation(value, binding);
  if (operation.name !== checkpoint.operationName) throw new Error('GCP operation identity changed');
  return recordGcpOperation(store, binding, value);
}
var init_native_operation = __esm(() => {
  init_discovery();
});

// plugins/gcloud/src/ce/native-create-driver.ts
import { lstat as lstat4, realpath as realpath2, rm as rm2, writeFile as writeFile2 } from 'node:fs/promises';
import { join as join5 } from 'node:path';

function createGcpNativeCreationDriver(api, store, privateDirectory, intent) {
  const plan = translateGcpNativeCompute(intent);
  const admit = (action) => {
    if (!plan.actions.some((expected) => fingerprint(expected) === fingerprint(action)))
      throw new Error('Cloud creation action differs from translated plan');
    const node = intent.sites.flatMap((site) => site.nodes).find((node) => action.id === `instance-${node.name}`);
    const site = intent.sites.find((site) => site.nodes.some((n) => n.name === node?.name));
    const name = action.argv[action.kind === 'subnetwork' ? 4 : 3];
    return { node, site, name };
  };
  const binding = (action, executionId) => {
    const { node } = admit(action);
    return {
      project: intent.project,
      deploymentName: intent.deploymentName,
      engine: 'native',
      actionId: executionId,
      ...(action.kind === 'instance'
        ? { zone: node?.zone }
        : action.kind === 'subnetwork'
          ? { region: intent.region }
          : { global: true }),
    };
  };
  const observe = async (action, signal) => {
    const { node, site, name } = admit(action);
    const args =
      action.kind === 'subnetwork'
        ? ['compute', 'networks', 'subnets', 'describe', name, `--region=${intent.region}`]
        : [
            'compute',
            action.kind === 'instance' ? 'instances' : 'networks',
            'describe',
            name,
            ...(node ? [`--zone=${node.zone}`] : []),
          ];
    const result = await api.exec(
      'gcloud',
      [...args, `--project=${intent.project}`, '--format=json(id,selfLink,name,labels)'],
      { signal },
    );
    if (result.exitCode !== 0) {
      if (/\b404\b|was not found|not found/i.test(result.stderr)) return null;
      throw new Error('Scoped cloud creation observation failed');
    }
    let row;
    try {
      row = JSON.parse(result.stdout);
    } catch {
      throw new Error('Malformed creation observation');
    }
    if (row.name !== name || typeof row.id !== 'string' || typeof row.selfLink !== 'string')
      throw new Error('Creation observation identity differs');
    if (
      node &&
      (row.labels?.['xcsh-deployment'] !== intent.deploymentName ||
        row.labels['xcsh-engine'] !== 'native' ||
        row.labels['xcsh-node'] !== node.name ||
        row.labels['xcsh-site'] !== site?.name)
    )
      throw new Error('Created VM ownership labels differ');
    return {
      id: row.id,
      selfLink: row.selfLink,
      kind: action.kind,
      project: intent.project,
      deploymentName: intent.deploymentName,
      engine: 'native',
      ...(node ? { nodeName: node.name, siteName: site?.name } : {}),
    };
  };
  return {
    observe,
    async submit(action, executionId, signal) {
      const { node, site } = admit(action);
      if (!/^create-[a-f0-9]{40}$/.test(executionId)) throw new Error('Exact creation execution ID required');
      let metadataPath;
      const args = [...action.argv];
      try {
        if (node) {
          if ((await realpath2(privateDirectory)) !== privateDirectory)
            throw new Error('Private bootstrap directory differs');
          const stat = await lstat4(privateDirectory);
          if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || stat.mode & 63)
            throw new Error('Private bootstrap directory ownership differs');
          const material = await store.read(`gcp-bootstrap-material-${node.name}.json`);
          if (
            material.nodeName !== node.name ||
            material.project !== intent.project ||
            material.deploymentName !== intent.deploymentName ||
            material.siteName !== site?.name ||
            material.engine !== 'native' ||
            !Number.isFinite(Date.parse(material.expiresAt)) ||
            Date.parse(material.expiresAt) <= Date.now() ||
            material.consumed ||
            typeof material.userData !== 'string' ||
            !material.userData.startsWith(`#cloud-config
`)
          )
            throw new Error('Bound staged bootstrap unavailable');
          metadataPath = join5(privateDirectory, `bootstrap-${executionId}.private`);
          await writeFile2(metadataPath, material.userData, { flag: 'wx', mode: 384 });
          await store.write(`gcp-bootstrap-material-${node.name}.json`, {
            nodeName: node.name,
            project: material.project,
            deploymentName: material.deploymentName,
            siteName: material.siteName,
            engine: material.engine,
            expiresAt: material.expiresAt,
            userData: '',
            consumed: true,
          });
          args.push(`--metadata-from-file=user-data=${metadataPath}`);
        }
        signal?.throwIfAborted();
        const result = await api.exec('gcloud', args, { signal });
        if (result.exitCode !== 0) throw new Error('Cloud creation outcome requires reconciliation');
        let response;
        try {
          response = JSON.parse(result.stdout);
        } catch {
          throw new Error('Creation operation receipt unavailable');
        }
        const row = Array.isArray(response) ? response[0] : response;
        if (action.kind !== 'instance') {
          await store.write(`gcp-create-completed-${executionId}.json`, {
            actionFingerprint: fingerprint(action),
            completed: true,
          });
          return { completedCommand: true };
        }
        await recordGcpOperation(store, binding(action, executionId), row);
        return { operationRecorded: true };
      } finally {
        if (metadataPath) await rm2(metadataPath, { force: true });
      }
    },
    async reconcile(action, executionId, _receipt, signal) {
      if (action.kind !== 'instance') {
        const completed = await store.read(`gcp-create-completed-${executionId}.json`);
        if (completed.actionFingerprint !== fingerprint(action) || completed.completed !== true)
          throw new Error('Ambiguous creation requires a completed command receipt');
        return (await observe(action, signal)) ? 'done' : 'pending';
      }
      let recorded;
      try {
        recorded = await store.read(`gcp-operation-${executionId}.json`);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (!recorded) throw new Error('Ambiguous creation needs exact operation receipt reconciliation');
      const outcome = await reconcileGcpOperation(store, api, binding(action, executionId), signal);
      if (outcome.state === 'done' && action.kind === 'instance') {
        const { node, site } = admit(action);
        if (!node || !site) throw new Error('Exact node binding required');
        const prefix = `https://www.googleapis.com/compute/v1/projects/${intent.project}/zones/${node.zone}`;
        const vmResult = await api.exec(
          'gcloud',
          [
            'compute',
            'instances',
            'describe',
            node.name,
            `--project=${intent.project}`,
            `--zone=${node.zone}`,
            '--format=json(id,selfLink,disks)',
          ],
          { signal },
        );
        if (vmResult.exitCode !== 0) throw new Error('Boot disk ownership observation unavailable');
        const vm = JSON.parse(vmResult.stdout);
        const boots = vm.disks?.filter((d) => d.boot === true) ?? [];
        if (
          vm.selfLink !== `${prefix}/instances/${node.name}` ||
          boots.length !== 1 ||
          !boots[0].source?.startsWith(`${prefix}/disks/`)
        )
          throw new Error('Exact owned boot disk link required');
        const diskName = boots[0].source.split('/').at(-1);
        if (!/^[a-z][a-z0-9-]{0,62}$/.test(diskName)) throw new Error('Invalid boot disk name');
        const diskResult = await api.exec(
          'gcloud',
          [
            'compute',
            'disks',
            'describe',
            diskName,
            `--project=${intent.project}`,
            `--zone=${node.zone}`,
            '--format=json(id,selfLink,users)',
          ],
          { signal },
        );
        if (diskResult.exitCode !== 0) throw new Error('Boot disk identity observation unavailable');
        const disk = JSON.parse(diskResult.stdout);
        if (disk.selfLink !== boots[0].source || disk.users?.length !== 1 || disk.users[0] !== vm.selfLink)
          throw new Error('Boot disk attachment ownership differs');
        await recordGcpResource(store, {
          id: disk.id,
          selfLink: disk.selfLink,
          kind: 'disk',
          project: intent.project,
          deploymentName: intent.deploymentName,
          siteName: site.name,
          nodeName: node.name,
          engine: 'native',
        });
      }
      return outcome.state;
    },
  };
}
var init_native_create_driver = __esm(() => {
  init_compute_plan();
  init_discovery();
  init_native_operation();
  init_ownership();
});

// plugins/gcloud/src/ce/bootstrap.ts
function formatGcpUserData(binding, now = Date.now()) {
  for (const name of [binding.deploymentName, binding.siteName, binding.nodeName]) {
    if (!/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) throw new Error('Invalid GCP bootstrap binding');
  }
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(binding.jwt))
    throw new Error('Invalid site-bound JWT syntax');
  const expiry = Date.parse(binding.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now || expiry - now > 24 * 60 * 60 * 1000)
    throw new Error('Bootstrap expiry must be within 24 hours');
  return [
    '#cloud-config',
    'write_files:',
    '  - path: /etc/vpm/user_data',
    '    permissions: "0600"',
    '    owner: root',
    '    content: |',
    `      token: ${binding.jwt}`,
    '',
  ].join(`
`);
}

// plugins/gcloud/src/ce/bootstrap-checkout.ts
function ownerEqual(a, b) {
  return ['project', 'deploymentName', 'siteName', 'nodeName', 'engine'].every((field) => a[field] === b[field]);
}
function valid2(owner) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(owner.project) || !['native', 'terraform'].includes(owner.engine))
    throw new Error('Invalid bootstrap ownership');
  for (const name of [owner.deploymentName, owner.siteName, owner.nodeName])
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(name)) throw new Error('Invalid bootstrap ownership');
}
function path(owner) {
  return `gcp-bootstrap-${owner.nodeName}.json`;
}
async function storeGcpBootstrap(store, owner, binding) {
  valid2(owner);
  if (
    binding.deploymentName !== owner.deploymentName ||
    binding.siteName !== owner.siteName ||
    binding.nodeName !== owner.nodeName
  )
    throw new Error('Bootstrap deployment/site/node binding differs');
  formatGcpUserData(binding);
  await store.exclusive(async () => {
    let prior;
    try {
      prior = await store.read(path(owner));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (prior !== undefined)
      throw new Error('Bootstrap already issued; explicit revocation and new node identity required');
    const record = {
      schemaVersion: 1,
      owner: structuredClone(owner),
      expiresAt: binding.expiresAt,
      jwt: binding.jwt,
      state: 'issued',
    };
    await store.write(path(owner), record);
  });
}
async function checkoutGcpBootstrap(store, owner, now = Date.now()) {
  valid2(owner);
  return store.exclusive(async () => {
    const record = await store.read(path(owner));
    if (record?.schemaVersion !== 1 || !ownerEqual(record.owner, owner) || record.state !== 'issued')
      throw new Error('Bootstrap unavailable for this deployment/site/node/engine');
    const material = formatGcpUserData({ ...owner, jwt: record.jwt, expiresAt: record.expiresAt }, now);
    await store.write(path(owner), { ...record, jwt: '', state: 'consumed' });
    return material;
  });
}
var init_bootstrap_checkout = () => {};

// plugins/gcloud/src/ce/bootstrap-issue.ts
function token(value, plan) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed bound registration token');
  const row = value;
  if (
    row.metadata?.name !== plan.tokenName ||
    row.metadata.namespace !== 'system' ||
    row.metadata.labels?.['xcsh-deployment'] !== plan.owner.deploymentName ||
    row.metadata.labels['xcsh-engine'] !== plan.owner.engine ||
    row.metadata.labels['xcsh-node'] !== plan.owner.nodeName ||
    row.spec?.site_name !== plan.owner.siteName ||
    ![1, 'JWT'].includes(row.spec.type) ||
    typeof row.spec.content !== 'string'
  )
    throw new Error('Registration token ownership differs');
  return row.spec.content;
}
async function issueUnlocked(store, plan, approvedHash, qualifiedContractDigest, driver, signal) {
  const { sha256, ...body } = plan;
  if (
    plan.schemaVersion !== 1 ||
    sha256 !== fingerprint(body) ||
    approvedHash !== sha256 ||
    plan.owner.engine !== 'native' ||
    !/^sha256:[a-f0-9]{64}$/.test(qualifiedContractDigest) ||
    qualifiedContractDigest !== plan.contractDigest ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(plan.tokenName)
  )
    throw new Error('Reviewed native bootstrap contract/authorization differs');
  signal?.throwIfAborted();
  formatGcpUserData({ ...plan.owner, jwt: 'fixtureheader.fixturepayload.fixturesignature', expiresAt: plan.expiresAt });
  const checkpointName = `gcp-bootstrap-issue-${sha256.slice(7)}.json`;
  let checkpoint;
  try {
    checkpoint = await store.read(checkpointName);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (
    checkpoint &&
    (checkpoint.planHash !== sha256 || !['prepared', 'submitting', 'issued'].includes(checkpoint.state))
  )
    throw new Error('Bootstrap issuance checkpoint differs');
  if (checkpoint?.state === 'issued') return { issued: true, nodeName: plan.owner.nodeName, replay: false };
  await driver.assertSiteOwnership(plan.owner, signal);
  let response = await driver.readToken(plan.tokenName, signal);
  if (!checkpoint && response !== null) throw new Error('Existing registration token is not owned by this issuance');
  if (checkpoint?.state === 'submitting' && response === null)
    throw new Error('Ambiguous bootstrap submission requires reconciliation');
  if (response === null) {
    checkpoint = { state: 'submitting', planHash: sha256 };
    await store.write(checkpointName, checkpoint);
    signal?.throwIfAborted();
    response = await driver.createToken(plan.tokenName, plan.owner, signal);
  }
  const jwt = token(response, plan);
  let stored;
  try {
    stored = await store.read(`gcp-bootstrap-${plan.owner.nodeName}.json`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!stored) await storeGcpBootstrap(store, plan.owner, { ...plan.owner, jwt, expiresAt: plan.expiresAt });
  else if (
    (stored.state !== 'issued' && stored.state !== 'consumed') ||
    fingerprint(stored.owner) !== fingerprint(plan.owner) ||
    stored.expiresAt !== plan.expiresAt ||
    (stored.state === 'issued' && stored.jwt !== jwt) ||
    (stored.state === 'consumed' && stored.jwt !== '')
  )
    throw new Error('Stored bootstrap state differs');
  await store.write(checkpointName, { state: 'issued', planHash: sha256 });
  return { issued: true, nodeName: plan.owner.nodeName, replay: false };
}
async function issueGcpBootstrap(store, plan, approvedHash, qualifiedContractDigest, driver, signal) {
  return store.exclusive(() =>
    issueUnlocked(
      {
        read: (name) => store.read(name),
        write: (name, value) => store.write(name, value),
        exclusive: async (fn) => fn(),
      },
      plan,
      approvedHash,
      qualifiedContractDigest,
      driver,
      signal,
    ),
  );
}
var init_bootstrap_issue = __esm(() => {
  init_bootstrap_checkout();
  init_discovery();
});

// plugins/gcloud/src/ce/native-create.ts
async function applyGcpNativeCreation(store, intent, reviewedHash, driver, signal, beforeInstance) {
  const plan = translateGcpNativeCompute(intent);
  if (reviewedHash !== plan.sha256) throw new Error('Reviewed native creation plan differs');
  signal?.throwIfAborted();
  return store.exclusive(async () => {
    const name = `gcp-create-${plan.sha256.slice(7)}.json`;
    let checkpoint;
    try {
      checkpoint = await store.read(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      checkpoint = { planHash: plan.sha256, actions: {} };
    }
    if (
      checkpoint.planHash !== reviewedHash ||
      !checkpoint.actions ||
      typeof checkpoint.actions !== 'object' ||
      Array.isArray(checkpoint.actions) ||
      Object.keys(checkpoint.actions).some((id) => !plan.actions.some((action) => action.id === id))
    )
      throw new Error('Native creation checkpoint differs');
    for (const action of plan.actions) {
      signal?.throwIfAborted();
      const prior = checkpoint.actions[action.id];
      if (prior && !['submitting', 'pending', 'done', 'failed'].includes(prior.state))
        throw new Error('Invalid creation checkpoint state');
      if (action.dependencies.some((id) => checkpoint.actions[id]?.state !== 'done'))
        return { state: 'pending', actionId: action.id };
      if (prior?.state === 'failed') throw new Error('Creation failed; reviewed repair plan required');
      const executionId = `create-${fingerprint({ plan: plan.sha256, action: action.id }).slice(7, 47)}`;
      if (prior?.state === 'done') {
        const observed = await driver.observe(action, signal);
        if (!observed) throw new Error('Created resource disappeared');
        await assertGcpResourceOwnership(store, observed, observed);
        continue;
      }
      if (!prior) {
        if (await driver.observe(action, signal)) throw new Error('Preexisting cloud resource collision');
        if (action.kind === 'instance') await beforeInstance?.(action, signal);
        checkpoint.actions[action.id] = { state: 'submitting' };
        await store.write(name, checkpoint);
        signal?.throwIfAborted();
        const receipt = await driver.submit(action, executionId, signal);
        checkpoint.actions[action.id] = { state: 'pending', receipt };
        await store.write(name, checkpoint);
      }
      const current = checkpoint.actions[action.id];
      const result = await driver.reconcile(action, executionId, current.receipt, signal);
      if (result !== 'done') {
        if (result === 'failed') {
          current.state = 'failed';
          await store.write(name, checkpoint);
        }
        return { state: result, actionId: action.id };
      }
      const observed = await driver.observe(action, signal);
      if (
        !observed ||
        observed.project !== intent.project ||
        observed.deploymentName !== intent.deploymentName ||
        observed.engine !== 'native' ||
        observed.kind !== action.kind
      )
        throw new Error('Created cloud identity differs');
      const node = intent.sites.flatMap((site) => site.nodes).find((node) => action.id === `instance-${node.name}`);
      const resourceName = action.argv[action.kind === 'subnetwork' ? 4 : 3];
      const scope =
        action.kind === 'instance'
          ? `zones/${node?.zone}`
          : action.kind === 'subnetwork'
            ? `regions/${intent.region}`
            : 'global';
      const collection =
        action.kind === 'instance' ? 'instances' : action.kind === 'subnetwork' ? 'subnetworks' : 'networks';
      if (
        observed.selfLink !==
        `https://www.googleapis.com/compute/v1/projects/${intent.project}/${scope}/${collection}/${resourceName}`
      )
        throw new Error('Created resource is not the exact planned identity');
      await recordGcpResource(store, observed);
      current.state = 'done';
      await store.write(name, checkpoint);
    }
    return { state: 'done', planHash: plan.sha256 };
  });
}
var init_native_create = __esm(() => {
  init_compute_plan();
  init_discovery();
  init_ownership();
});

// plugins/gcloud/src/ce/preflight-port.ts
function createGcpPreflightPort(api, project, fetcher = fetch) {
  validateScope(project);
  let credential;
  const request = async (path, body, signal) => {
    const compute = `/compute/v1/projects/${project}`;
    const publisher = '/compute/v1/projects/f5-7626-networks-public/global';
    const iam = `/cloudresourcemanager/v1/projects/${project}:testIamPermissions`;
    const suffix = path.startsWith(compute) ? path.slice(compute.length) : undefined;
    const allowedCompute =
      suffix !== undefined &&
      /^(?:|\/regions\/[a-z]+(?:-[a-z]+)+\d|\/zones\/[a-z]+(?:-[a-z]+)+\d-[a-z](?:\/machineTypes\/[a-z][a-z0-9-]{0,62})?)$/.test(
        suffix,
      );
    const allowedPublisher =
      path.startsWith(publisher) && /^\/(?:images|licenses)\/[a-z][a-z0-9-]{0,62}$/.test(path.slice(publisher.length));
    if (!allowedCompute && !allowedPublisher && path !== iam)
      throw new Error('Preflight request escaped explicit project scope');
    if ((path === iam) !== (body !== undefined)) throw new Error('Preflight request method differs');
    const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
    combined.throwIfAborted();
    if (!credential) {
      const result = await api.exec('gcloud', ['auth', 'print-access-token', `--project=${project}`, '--quiet'], {
        signal: combined,
      });
      if (result.exitCode !== 0 || !result.stdout.trim() || /\s/.test(result.stdout.trim()))
        throw new Error('GCP preflight authentication unavailable');
      credential = result.stdout.trim();
    }
    combined.throwIfAborted();
    const url =
      path === iam
        ? `https://cloudresourcemanager.googleapis.com/v1/projects/${project}:testIamPermissions`
        : `https://compute.googleapis.com${path}`;
    const response = await fetcher(url, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      signal: combined,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credential}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok || !response.body) throw new Error('GCP preflight source unavailable');
    const reader = response.body.getReader(),
      chunks = [];
    let size = 0;
    try {
      for (;;) {
        combined.throwIfAborted();
        const { done, value } = await reader.read();
        combined.throwIfAborted();
        if (done) break;
        size += value.length;
        if (size > 4 * 1024 * 1024) throw new Error('GCP preflight response exceeds size limit');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      throw new Error('GCP preflight response malformed');
    }
  };
  return {
    query: request,
    async policy(requestedProject, constraint, signal) {
      if (
        requestedProject !== project ||
        ![
          'compute.vmExternalIpAccess',
          'compute.trustedImageProjects',
          'compute.requireShieldedVm',
          'compute.restrictNonConfidentialComputing',
          'compute.disableSerialPortAccess',
        ].includes(constraint)
      )
        throw new Error('Preflight policy escaped explicit scope');
      signal?.throwIfAborted();
      const result = await api.exec(
        'gcloud',
        [
          'org-policies',
          'describe',
          `constraints/${constraint}`,
          `--project=${project}`,
          '--effective',
          '--format=json',
        ],
        { signal },
      );
      signal?.throwIfAborted();
      if (result.exitCode !== 0) throw new Error('GCP effective policy unavailable');
      try {
        return JSON.parse(result.stdout);
      } catch {
        throw new Error('GCP effective policy malformed');
      }
    },
  };
}
var init_preflight_port = __esm(() => {
  init_validation();
});

// plugins/gcloud/src/ce/qualification-gates.ts
function assertGcpLaunchGates(gates, reviewedHash) {
  if (
    gates.schemaVersion !== 1 ||
    gates.approvalPlanHash !== reviewedHash ||
    !/^sha256:[a-f0-9]{64}$/.test(reviewedHash)
  )
    throw new Error('Reviewed launch identity differs');
  if (
    gates.apiContract.publication !== 'immutable-release' ||
    gates.apiContract.gcpMapping !== 'available' ||
    !/^sha256:[a-f0-9]{64}$/.test(gates.apiContract.sha256)
  )
    throw new Error('Immutable qualified GCP API mapping required before launch');
  if (
    gates.policy.identity !== 'f5xc-ce-automation-policy/v2' ||
    gates.policy.verified !== true ||
    !/^sha256:[a-f0-9]{64}$/.test(gates.policy.sha256)
  )
    throw new Error('Current verified CE policy required before launch');
  if (
    !gates.sharedRuntime ||
    !gates.exactImageVerified ||
    !gates.iamVerified ||
    !gates.quotaVerified ||
    !gates.organizationPolicyVerified ||
    !['accepted', 'not-required', 'authorized-for-access-or-use'].includes(gates.legalAcceptance)
  )
    throw new Error('Launch prerequisites remain unavailable');
  if (gates.engine === 'terraform' && !gates.providerLocksVerified)
    throw new Error('Exact Terraform provider locks required');
}
var init_qualification_gates = __esm(() => {
  init_discovery();
});

// plugins/gcloud/src/ce/native-deploy.ts
import { join as join6 } from 'node:path';

async function applyGcpNativeDeployment(
  platform,
  api,
  intent,
  approvedHash,
  gates,
  signal,
  funding = collectCurrentGcpCorporateFunding,
  onMutation,
) {
  const plan = translateGcpNativeCompute(intent);
  assertGcpLaunchGates(gates, approvedHash);
  if (
    intent.engine !== 'native' ||
    plan.sha256 !== approvedHash ||
    gates.project !== intent.project ||
    gates.region !== intent.region ||
    gates.engine !== 'native' ||
    gates.apiContract.sha256 !== GCP_CE_API_RELEASE.contractDigest ||
    !platform.gcpLifecycle
  )
    throw new Error('Native deployment ownership/qualified contract differs');
  if (!gates.fundingReceipt) throw new Error('Reviewed corporate funding binding required');
  assertGcpCorporateFundingCurrent(gates.fundingReceipt, intent.project, gates.fundingReceipt.billingAccountName);
  const currentFunding = await funding(api, intent.project, signal);
  assertGcpCorporateFundingCurrent(currentFunding, intent.project, gates.fundingReceipt.billingAccountName);
  if (currentFunding.policySha256 !== gates.fundingReceipt.policySha256)
    throw new Error('Corporate funding policy changed after launch review');
  const owner = {
    deploymentId: intent.deploymentName,
    provider: 'gcp',
    engine: 'native',
    account: intent.project,
    region: intent.region,
  };
  const store = await platform.storage(owner);
  const release = await acquireProcessLock(join6(store.directory, '.gcp-deployment-lock'));
  try {
    if (intent.image.name.endsWith('-byol') || gates.legalAcceptance === 'authorized-for-access-or-use')
      await assertGcpByolAuthorization(
        intent,
        { query: createGcpPreflightPort(api, intent.project).query, document: fetchGcpByolDocument },
        currentFunding,
        store,
        signal,
      );
    const identity = {
      intent: structuredClone(intent),
      intentFingerprint: fingerprint(intent),
      platformContext: intent.platformContext,
    };
    let saved;
    try {
      saved = await store.read('gcp-deployment-intent.json');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (saved && fingerprint(saved) !== fingerprint(identity))
      throw new Error('Persisted native deployment intent differs');
    if (!saved) await store.write('gcp-deployment-intent.json', identity);
    const shared = {
      read: (name) => store.read(name),
      write: (name, value) => store.write(name, value),
      exclusive: async (fn) => fn(),
    };
    const lifecycle = await platform.gcpLifecycle(owner, intent.platformContext, signal);
    const driver = createGcpNativeCreationDriver(api, shared, store.directory, intent);
    const trackedDriver = {
      ...driver,
      submit: async (...args) => {
        onMutation?.();
        return driver.submit(...args);
      },
    };
    return await applyGcpNativeCreation(
      shared,
      intent,
      approvedHash,
      trackedDriver,
      signal,
      async (_action, signal) => {
        onMutation?.();
        await lifecycle.store.exclusive(() => lifecycle.ensureSite(signal));
        const site = intent.sites[0],
          node = site.nodes[0],
          tokenName = `${node.name}-token`;
        if (tokenName.length > 63) throw new Error('Node name leaves no token suffix space');
        const bootstrapOwner = {
          project: intent.project,
          deploymentName: intent.deploymentName,
          siteName: site.name,
          nodeName: node.name,
          engine: 'native',
        };
        const key = `gcp-bootstrap-plan-${node.name}.json`;
        let bootstrap;
        try {
          bootstrap = await store.read(key);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        if (!bootstrap) {
          const body = {
            schemaVersion: 1,
            owner: bootstrapOwner,
            tokenName,
            expiresAt: new Date(Date.now() + 60 * 60000).toISOString(),
            contractDigest: gates.apiContract.sha256,
          };
          bootstrap = { ...body, sha256: fingerprint(body) };
          await store.write(key, bootstrap);
        }
        await issueGcpBootstrap(
          shared,
          bootstrap,
          bootstrap.sha256,
          gates.apiContract.sha256,
          lifecycle.bootstrapDriver(),
          signal,
        );
        const materialKey = `gcp-bootstrap-material-${node.name}.json`;
        let staged;
        try {
          staged = await store.read(materialKey);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        if (!staged) {
          const userData = await checkoutGcpBootstrap(shared, bootstrapOwner);
          await store.write(materialKey, {
            ...bootstrapOwner,
            expiresAt: bootstrap.expiresAt,
            userData,
            consumed: false,
          });
        }
      },
    );
  } finally {
    await release();
  }
}
var init_native_deploy = __esm(() => {
  init_process_lock();
  init_bootstrap_checkout();
  init_bootstrap_issue();
  init_byol_terms();
  init_compute_plan();
  init_contract();
  init_corporate_funding();
  init_discovery();
  init_native_create();
  init_native_create_driver();
  init_preflight_port();
  init_qualification_gates();
});

// plugins/gcloud/src/ce/planner.ts
function planGcpCe(intent, discovery, now = Date.now(), policyReceipt, preflight, fundingReceipt, byolAuthorization) {
  validateIntent(intent);
  if (fundingReceipt)
    assertGcpCorporateFundingCurrent(fundingReceipt, intent.project, fundingReceipt.billingAccountName);
  if (byolAuthorization) {
    const { authorizationHash, ...authorizationBody } = byolAuthorization;
    if (
      authorizationHash !== fingerprint(authorizationBody) ||
      byolAuthorization.state !== 'authorized-for-access-or-use' ||
      byolAuthorization.binding.intentFingerprint !== fingerprint(intent) ||
      !fundingReceipt ||
      byolAuthorization.fundingPolicySha256 !== fundingReceipt.policySha256 ||
      byolAuthorization.billingAccountName !== fundingReceipt.billingAccountName
    )
      throw new Error('BYOL authorization does not match readiness intent/funding');
  }
  if (discovery.schemaVersion !== 1 || discovery.project !== intent.project || discovery.region !== intent.region)
    throw new Error('Discovery scope does not match the intent');
  const observed = Date.parse(discovery.observedAt);
  if (!Number.isFinite(observed) || observed > now || now - observed > 5 * 60000) throw new Error('Discovery is stale');
  if (!discovery.images.some((image) => fingerprint(image) === fingerprint(intent.image)))
    throw new Error('Exact image and license identity is not present in discovery');
  if (preflight) {
    const timestamp = Date.parse(preflight.observedAt);
    if (
      preflight.schemaVersion !== 1 ||
      preflight.project !== intent.project ||
      preflight.region !== intent.region ||
      preflight.intentFingerprint !== fingerprint(intent) ||
      !Number.isFinite(timestamp) ||
      timestamp > now ||
      now - timestamp > 5 * 60000
    )
      throw new Error('Preflight scope/intent differs or evidence is stale');
  }
  for (const site of intent.sites)
    for (const node of site.nodes) {
      const machine = discovery.machineTypes.find((m) => m.name === intent.machineType && m.zone === node.zone);
      if (
        !machine ||
        !Number.isFinite(machine.guestCpus) ||
        machine.guestCpus < 8 ||
        !Number.isFinite(machine.memoryMb) ||
        machine.memoryMb < 32 * 1024
      )
        throw new Error('Every node requires an observed machine with at least 8 vCPUs and 32 GiB RAM');
    }
  const unavailable = [
    'gcp_executable_api_mapping_not_qualified',
    ...(policyReceipt ? [] : ['current_policy_release_not_bound']),
    'shared_platform_gcp_runtime_not_available',
    ...(intent.engine === 'terraform' ? ['shared_terraform_gcp_runner_not_available'] : []),
    ...(discovery.billingEnabled !== true ? ['billing_not_verified'] : []),
    ...(fundingReceipt ? [] : ['corporate_funding_not_verified']),
    ...['compute.googleapis.com', 'serviceusage.googleapis.com']
      .filter((api) => !discovery.enabledApis.includes(api))
      .map((api) => `api_not_enabled:${api}`),
    ...(preflight
      ? [
          ...['iam', 'organizationPolicy', 'machineNicLimit', 'image', 'zone']
            .filter((check) => preflight.checks[check] !== 'verified')
            .map((check) => `${check}_not_verified`),
          ...(preflight.checks.quota === 'verified' ? [] : ['quota_headroom_not_qualified']),
          ...(byolAuthorization ? [] : ['licenseAcceptance_not_verified']),
          'zone_capacity_not_reserved',
        ]
      : [...Object.keys(discovery.checks).map((check) => `${check}_not_verified`), 'quota_headroom_not_qualified']),
    'routing_and_return_path_not_qualified',
  ];
  const body = {
    schemaVersion: 1,
    policyIdentity: GCP_CE_POLICY,
    ...(policyReceipt ? { policyReceipt } : {}),
    ...(preflight ? { preflight: structuredClone(preflight) } : {}),
    ...(fundingReceipt ? { fundingReceipt: structuredClone(fundingReceipt) } : {}),
    ...(byolAuthorization ? { byolAuthorization: structuredClone(byolAuthorization) } : {}),
    apiRelease: GCP_CE_API_RELEASE,
    engine: intent.engine,
    intent: structuredClone(intent),
    discoveryFingerprint: fingerprint(discovery),
    executable: false,
    unavailable,
    actions: [],
    approval: 'not-requested',
  };
  return { ...body, planHash: fingerprint(body) };
}
var init_planner = __esm(() => {
  init_contract();
  init_corporate_funding();
  init_discovery();
  init_types2();
  init_validation();
});

// plugins/gcloud/src/ce/policy.ts
import { createHash as createHash6 } from 'node:crypto';

function parseGcpCePolicy(text, observedAt = new Date().toISOString()) {
  if (!/^contract_id:\s*f5xc-ce-automation-policy\s*$/m.test(text) || !/^contract_version:\s*v2\s*$/m.test(text))
    throw new Error('Unknown CE policy identity/version');
  for (const phrase of ['exact reviewed saved plan', 'registration', 'ownership', 'restoration', 'Marketplace'])
    if (!text.includes(phrase)) throw new Error('Incomplete CE automation policy');
  const normalized = `${text
    .replace(
      /\r\n?/g,
      `
`,
    )
    .trim()}
`;
  return {
    identity: 'f5xc-ce-automation-policy/v2',
    url: GCP_CE_POLICY_URL,
    observedAt,
    normalizedSha256: `sha256:${createHash6('sha256').update(normalized).digest('hex')}`,
  };
}
async function readGcpCePolicy(fetcher = fetch) {
  const response = await fetcher(GCP_CE_POLICY_URL);
  if (!response.ok) throw new Error('CE policy retrieval failed');
  return parseGcpCePolicy(await response.text());
}
var GCP_CE_POLICY_URL =
  'https://f5-sales-demo.github.io/multi-cloud-networking/_llms-txt/en/customer-edge/automation-contract.txt';
var init_policy = () => {};

// plugins/gcloud/src/ce/preflight.ts
function object3(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed preflight source');
  return value;
}
function quota(value, metric, required) {
  const rows = object3(value).quotas;
  if (!Array.isArray(rows)) return false;
  const matches = rows.map(object3).filter((row) => row.metric === metric);
  return (
    matches.length === 1 &&
    typeof matches[0].limit === 'number' &&
    typeof matches[0].usage === 'number' &&
    Number.isFinite(matches[0].limit) &&
    Number.isFinite(matches[0].usage) &&
    matches[0].usage >= 0 &&
    matches[0].limit - matches[0].usage >= required
  );
}
function unconditional(value, field, expected) {
  const spec = object3(object3(value).spec),
    rules = spec.rules;
  return (
    !spec.reset &&
    Array.isArray(rules) &&
    rules.length === 1 &&
    !object3(rules[0]).condition &&
    object3(rules[0])[field] === expected
  );
}
function supportsGcpLaunchPreflight(intent) {
  return (
    intent.egress.mode === 'external-ip' &&
    intent.sites.every((site) =>
      site.nodes.every((node) => node.interfaces.length === 2 && node.interfaces[1].role === 'sli'),
    )
  );
}
async function collectGcpLaunchPreflight(intent, port, signal) {
  validateIntent(intent);
  if (!supportsGcpLaunchPreflight(intent)) throw new Error('Preflight requires the two-interface external-IP profile');
  signal?.throwIfAborted();
  const nodes = intent.sites.flatMap((site) => site.nodes),
    zones = [...new Set(nodes.map((node) => node.zone))],
    networks = new Set(nodes.flatMap((node) => node.interfaces.map((nic) => nic.network))),
    prefix = `/compute/v1/projects/${intent.project}`;
  const checks = {
    iam: 'unavailable',
    quota: 'unavailable',
    organizationPolicy: 'unavailable',
    image: 'unavailable',
    machineNicLimit: 'unavailable',
    zone: 'unavailable',
    licenseUseFee: 'unknown',
    legalAcceptance: 'unknown',
    zoneCapacity: 'not-reserved',
  };
  const receipts = [];
  const read = async (source, fn) => {
    signal?.throwIfAborted();
    const value = await fn();
    signal?.throwIfAborted();
    receipts.push({ source, observedAt: new Date().toISOString(), sha256: fingerprint(value) });
    return object3(value);
  };
  const attempt = async (fn) => {
    try {
      await fn();
    } catch {
      signal?.throwIfAborted();
    }
  };
  await attempt(async () => {
    const result = await read('project-iam', () =>
      port.query(
        `/cloudresourcemanager/v1/projects/${intent.project}:testIamPermissions`,
        { permissions: [...GCP_CREATE_PERMISSIONS] },
        signal,
      ),
    );
    const permissions = result.permissions;
    if (Array.isArray(permissions) && GCP_CREATE_PERMISSIONS.every((permission) => permissions.includes(permission)))
      checks.iam = 'verified';
  });
  const machines = new Map();
  const availableZones = new Set();
  for (const zone of zones) {
    await attempt(async () => {
      const machine = await read(`machine-type:${zone}`, () =>
        port.query(`${prefix}/zones/${zone}/machineTypes/${intent.machineType}`, undefined, signal),
      );
      if (
        intent.machineType === 'n2-standard-8' &&
        machine.name === intent.machineType &&
        machine.guestCpus === 8 &&
        machine.memoryMb === 32768
      )
        machines.set(zone, machine);
    });
    await attempt(async () => {
      const result = await read(`zone:${zone}`, () => port.query(`${prefix}/zones/${zone}`, undefined, signal));
      if (result.name === zone && result.status === 'UP') availableZones.add(zone);
    });
  }
  if (machines.size === zones.length) checks.machineNicLimit = 'verified';
  if (availableZones.size === zones.length) checks.zone = 'verified';
  await attempt(async () => {
    const region = await read('regional-quotas', () =>
      port.query(`${prefix}/regions/${intent.region}`, undefined, signal),
    );
    const project = await read('project-quotas', () => port.query(prefix, undefined, signal));
    if (
      checks.machineNicLimit === 'verified' &&
      quota(region, 'N2_CPUS', nodes.length * 8) &&
      quota(region, 'DISKS_TOTAL_GB', nodes.length * intent.diskGiB) &&
      quota(region, 'IN_USE_ADDRESSES', nodes.length) &&
      quota(project, 'NETWORKS', networks.size)
    )
      checks.quota = 'verified';
  });
  await attempt(async () => {
    const raw = await read('exact-image', () =>
      port.query(intent.image.selfLink.replace('https://www.googleapis.com', ''), undefined, signal),
    );
    const result = { ...raw, architecture: raw.architecture ?? 'X86_64' };
    if (
      ['id', 'name', 'selfLink', 'status', 'architecture', 'licenses'].every(
        (key) => fingerprint(result[key]) === fingerprint(intent.image[key]),
      )
    )
      checks.image = 'verified';
    const licenses = [];
    for (const license of intent.image.licenses)
      licenses.push(
        await read('image-license', () =>
          port.query(license.replace('https://www.googleapis.com', ''), undefined, signal),
        ),
      );
    if (licenses.every((license) => license.chargesUseFee === false)) checks.licenseUseFee = 'none';
    else if (licenses.some((license) => license.chargesUseFee === true)) checks.licenseUseFee = 'charged';
  });
  await attempt(async () => {
    const values = [];
    for (const constraint of [
      'compute.vmExternalIpAccess',
      'compute.trustedImageProjects',
      'compute.requireShieldedVm',
      'compute.restrictNonConfidentialComputing',
      'compute.disableSerialPortAccess',
    ])
      values.push(await read(constraint, () => port.policy(intent.project, constraint, signal)));
    if (
      unconditional(values[0], 'allowAll', true) &&
      unconditional(values[1], 'allowAll', true) &&
      unconditional(values[2], 'enforce', false) &&
      unconditional(values[3], 'allowAll', true) &&
      unconditional(values[4], 'enforce', true)
    )
      checks.organizationPolicy = 'verified';
  });
  return {
    schemaVersion: 1,
    project: intent.project,
    region: intent.region,
    intentFingerprint: fingerprint(intent),
    observedAt: new Date().toISOString(),
    checks,
    receipts,
  };
}
var GCP_CREATE_PERMISSIONS;
var init_preflight = __esm(() => {
  init_discovery();
  init_validation();
  GCP_CREATE_PERMISSIONS = [
    'compute.instances.create',
    'compute.instances.delete',
    'compute.instances.get',
    'compute.instances.setMetadata',
    'compute.instances.setLabels',
    'compute.instances.setTags',
    'compute.disks.create',
    'compute.disks.delete',
    'compute.disks.get',
    'compute.disks.use',
    'compute.images.useReadOnly',
    'compute.networks.create',
    'compute.networks.delete',
    'compute.networks.get',
    'compute.networks.use',
    'compute.subnetworks.create',
    'compute.subnetworks.delete',
    'compute.subnetworks.get',
    'compute.subnetworks.use',
    'compute.subnetworks.useExternalIp',
    'compute.zoneOperations.get',
    'compute.globalOperations.get',
    'compute.regionOperations.get',
    'compute.machineTypes.get',
    'compute.regions.get',
    'compute.zones.get',
  ];
});

// plugins/gcloud/src/ce/deployment-review.ts
import { join as join7 } from 'node:path';

function createGcpDeploymentSources(platform, api) {
  return {
    contract: (signal) => resolveGcpContract(undefined, signal),
    policy: readGcpCePolicy,
    discovery: (intent, signal) => discoverGcp(api, intent.project, intent.region, signal),
    preflight: (intent, signal) =>
      collectGcpLaunchPreflight(intent, createGcpPreflightPort(api, intent.project), signal),
    funding: (intent, signal) => collectCurrentGcpCorporateFunding(api, intent.project, signal),
    byol: async (intent, funding, signal) =>
      assertGcpByolAuthorization(
        intent,
        { query: createGcpPreflightPort(api, intent.project).query, document: fetchGcpByolDocument },
        funding,
        await storage2(platform, intent),
        signal,
      ),
  };
}
function storage2(platform, intent) {
  return platform.storage({
    deploymentId: intent.deploymentName,
    provider: 'gcp',
    engine: intent.engine,
    account: intent.project,
    region: intent.region,
  });
}
function profile(intent, boundary, platform) {
  assertGcpTeardownProfile(intent, boundary);
  if (intent.operation !== 'deploy' || intent.machineType !== 'n2-standard-8' || !intent.image.name.endsWith('-byol'))
    throw new Error('Qualified native single-node BYOL deployment profile required');
  if (!platform.gcpLifecycle) throw new Error('Qualified native shared deployment runtime unavailable');
}
function fundingBinding(funding) {
  return {
    project: funding.project,
    billingAccountName: funding.billingAccountName,
    policySha256: funding.policySha256,
    accountDomain: funding.accountDomain,
    organizationDomain: funding.organizationDomain,
  };
}
async function collectGcpDeploymentPrerequisites(platform, intent, sources, signal, resume = false, engine = 'native') {
  signal?.throwIfAborted();
  const boundary = await sources.contract(signal);
  if (engine === 'native') profile(intent, boundary, platform);
  else {
    assertGcpTeardownProfile(intent, boundary, 'terraform');
    if (intent.sites[0].nodes.length === 3) assertGcpTerraformHaProfile(intent, boundary, true);
    if (
      intent.operation !== 'deploy' ||
      intent.machineType !== 'n2-standard-8' ||
      !intent.image.name.endsWith('-byol') ||
      !platform.gcpObservations
    )
      throw new Error('Qualified Terraform single-node BYOL profile required');
  }
  const policy = await sources.policy();
  assertGcpTeardownPolicyFresh(policy);
  const discovery = await sources.discovery(intent, signal);
  const preflight = await sources.preflight(intent, signal);
  const funding = await sources.funding(intent, signal);
  planGcpCe(intent, discovery, Date.now(), policy, preflight, funding);
  if (
    discovery.billingEnabled !== true ||
    !['compute.googleapis.com', 'serviceusage.googleapis.com'].every((api) => discovery.enabledApis.includes(api))
  )
    throw new Error('Deployment billing/APIs unavailable');
  if (
    ['iam', ...(resume ? [] : ['quota']), 'organizationPolicy', 'image', 'machineNicLimit', 'zone'].some(
      (key) => preflight.checks[key] !== 'verified',
    ) ||
    preflight.checks.licenseUseFee !== 'none'
  )
    throw new Error('Current deployment prerequisites unavailable');
  const byol = await sources.byol(intent, funding, signal);
  if (!/^sha256:[a-f0-9]{64}$/.test(byol.authorizationHash)) throw new Error('Exact BYOL authorization required');
  return { boundary, policy, discovery, preflight, funding, byol };
}
async function planGcpDeploymentReview(
  platform,
  api,
  intent,
  sources = createGcpDeploymentSources(platform, api),
  signal,
) {
  intent = structuredClone(intent);
  const current = await collectGcpDeploymentPrerequisites(platform, intent, sources, signal);
  const cloud = translateGcpNativeCompute(intent);
  const store = await storage2(platform, intent);
  const release = await acquireProcessLock(join7(store.directory, '.gcp-review-lock'));
  try {
    const identity = { intent, intentFingerprint: fingerprint(intent), platformContext: intent.platformContext };
    let prior;
    try {
      prior = await store.read('gcp-deployment-intent.json');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (prior && fingerprint(prior) !== fingerprint(identity)) throw new Error('Persisted native intent differs');
    if (!prior) await store.write('gcp-deployment-intent.json', identity);
    const lifecycle = await platform.gcpLifecycle?.(
      {
        deploymentId: intent.deploymentName,
        provider: 'gcp',
        engine: 'native',
        account: intent.project,
        region: intent.region,
      },
      intent.platformContext,
      signal,
    );
    if (!lifecycle) throw new Error('Scoped native lifecycle unavailable');
    const objects = await lifecycle.observeTeardown(`${intent.sites[0].nodes[0].name}-token`, signal);
    if (!objects.siteAbsent || !objects.tokenAbsent) throw new Error('Deployment site/token already exists');
    const driver = createGcpNativeCreationDriver(
      api,
      {
        read: (name) => store.read(name),
        write: (name, value) => store.write(name, value),
        exclusive: async (fn) => fn(),
      },
      store.directory,
      intent,
    );
    for (const action of cloud.actions)
      if (await driver.observe(action, signal)) throw new Error('Deployment cloud resource already exists');
    const body = {
      schemaVersion: 1,
      operation: 'deploy',
      engine: 'native',
      intent,
      intentFingerprint: fingerprint(intent),
      platformContext: intent.platformContext,
      apiRelease: current.boundary.release,
      contractFingerprint: current.boundary.fingerprint,
      lifecycleFingerprint: fingerprint(current.boundary.singleNodeLifecycle),
      policyReceipt: current.policy,
      funding: fundingBinding(current.funding),
      byolAuthorizationHash: current.byol.authorizationHash,
      discoveryFingerprint: fingerprint(current.discovery),
      preflight: current.preflight,
      cloud,
      createdAt: new Date().toISOString(),
      approval: 'required',
      capacity: 'not-reserved',
      routing: 'unknown',
      applicationTraffic: 'unknown',
    };
    const plan = { ...body, planHash: fingerprint(body) };
    await store.write(`gcp-deploy-reviewed-${plan.planHash.slice(7)}.json`, plan);
    return plan;
  } finally {
    await release();
  }
}
async function applyGcpDeploymentReview(
  platform,
  api,
  intent,
  approvedHash,
  sources = createGcpDeploymentSources(platform, api),
  signal,
  onMutation,
  execute = applyGcpNativeDeployment,
) {
  intent = structuredClone(intent);
  signal?.throwIfAborted();
  if (!/^sha256:[a-f0-9]{64}$/.test(approvedHash)) throw new Error('Exact deployment review hash required');
  const boundary = await sources.contract(signal);
  profile(intent, boundary, platform);
  const store = await storage2(platform, intent);
  const release = await acquireProcessLock(join7(store.directory, '.gcp-review-lock'));
  try {
    const plan = await store.read(`gcp-deploy-reviewed-${approvedHash.slice(7)}.json`);
    const { planHash, ...body } = plan;
    if (
      planHash !== approvedHash ||
      fingerprint(body) !== approvedHash ||
      plan.schemaVersion !== 1 ||
      plan.operation !== 'deploy' ||
      plan.engine !== 'native' ||
      plan.intentFingerprint !== fingerprint(intent) ||
      fingerprint(plan.intent) !== fingerprint(intent) ||
      plan.platformContext !== intent.platformContext ||
      fingerprint(plan.apiRelease) !== fingerprint(boundary.release) ||
      plan.contractFingerprint !== boundary.fingerprint ||
      plan.lifecycleFingerprint !== fingerprint(boundary.singleNodeLifecycle) ||
      fingerprint(plan.cloud) !== fingerprint(translateGcpNativeCompute(intent))
    )
      throw new Error('Reviewed deployment intent/contract/translation differs');
    const name = `gcp-deploy-authorized-${approvedHash.slice(7)}.json`;
    let authorization;
    try {
      authorization = await store.read(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const age = Date.now() - Date.parse(plan.createdAt);
    let original;
    try {
      original = await store.read('gcp-deploy-original-authorization.json');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (original && (original.planHash !== approvedHash || original.intentFingerprint !== fingerprint(intent)))
      throw new Error('Deployment must resume original overall authorization');
    if (authorization && !original) throw new Error('Deployment original authorization unavailable');
    if (
      authorization
        ? authorization.planHash !== approvedHash || authorization.intentFingerprint !== fingerprint(intent)
        : !Number.isFinite(age) || age < 0 || age > 5 * 60000
    )
      throw new Error('Deployment authorization differs or review stale');
    const policy = await sources.policy();
    assertGcpTeardownPolicyFresh(policy);
    if (policy.normalizedSha256 !== plan.policyReceipt.normalizedSha256) throw new Error('Reviewed policy changed');
    const funding = await sources.funding(intent, signal);
    assertGcpCorporateFundingCurrent(funding, intent.project, plan.funding.billingAccountName);
    if (fingerprint(fundingBinding(funding)) !== fingerprint(plan.funding))
      throw new Error('Reviewed corporate funding changed');
    const byol = await sources.byol(intent, funding, signal);
    if (byol.authorizationHash !== plan.byolAuthorizationHash) throw new Error('Reviewed BYOL authorization changed');
    {
      const launch = await collectGcpDeploymentPrerequisites(platform, intent, sources, signal, !!authorization);
      if (
        fingerprint(fundingBinding(launch.funding)) !== fingerprint(plan.funding) ||
        launch.byol.authorizationHash !== plan.byolAuthorizationHash ||
        launch.policy.normalizedSha256 !== plan.policyReceipt.normalizedSha256 ||
        launch.boundary.fingerprint !== plan.contractFingerprint
      )
        throw new Error('Launch binding changed during qualification');
      signal?.throwIfAborted();
      if (!authorization) {
        const launchAge = Date.now() - Date.parse(plan.createdAt);
        if (!Number.isFinite(launchAge) || launchAge < 0 || launchAge > 5 * 60000)
          throw new Error('Deployment review expired during qualification');
        const binding = { planHash: approvedHash, intentFingerprint: fingerprint(intent) };
        if (!original) await store.write('gcp-deploy-original-authorization.json', binding);
        await store.write(name, binding);
      }
    }
    const gates = {
      schemaVersion: 1,
      project: intent.project,
      region: intent.region,
      engine: 'native',
      approvalPlanHash: plan.cloud.sha256,
      apiContract: {
        publication: 'immutable-release',
        gcpMapping: 'available',
        sha256: boundary.release.contractDigest,
      },
      policy: { identity: policy.identity, sha256: policy.normalizedSha256, verified: true },
      fundingReceipt: funding,
      sharedRuntime: true,
      exactImageVerified: true,
      legalAcceptance: 'authorized-for-access-or-use',
      iamVerified: true,
      quotaVerified: true,
      organizationPolicyVerified: true,
      providerLocksVerified: false,
    };
    const outcome = await execute(
      platform,
      api,
      intent,
      plan.cloud.sha256,
      gates,
      signal,
      async () => funding,
      onMutation,
    );
    return {
      ...outcome,
      planHash: approvedHash,
      engine: 'native',
      cloudProvisioning: outcome.state === 'done' ? 'created' : 'pending',
      registration: 'unknown',
      physicalInterfaceIdentity: 'unknown',
      platformHealth: 'unknown',
      routing: 'unknown',
      applicationTraffic: 'unknown',
    };
  } finally {
    await release();
  }
}
var init_deployment_review = __esm(() => {
  init_process_lock();
  init_byol_terms();
  init_compute_plan();
  init_contract();
  init_corporate_funding();
  init_deployment_teardown();
  init_discovery();
  init_native_create_driver();
  init_native_deploy();
  init_planner();
  init_policy();
  init_preflight();
  init_preflight_port();
  init_terraform_ha_profile();
});

// plugins/gcloud/src/ce/marketplace-agreement.ts
function validateGcpMarketplaceBinding(binding) {
  if (
    Object.keys(binding).some(
      (key) =>
        ![
          'project',
          'projectNumber',
          'imageId',
          'imageSelfLink',
          'licenseId',
          'licenseSelfLink',
          'billingService',
          'agreement',
          'agreementDocument',
        ].includes(key),
    ) ||
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(binding.project) ||
    ![binding.projectNumber, binding.imageId, binding.licenseId].every((id) => /^\d+$/.test(id)) ||
    !/^https:\/\/www\.googleapis\.com\/compute\/v1\/projects\/f5-7626-networks-public\/global\/images\/[a-z][a-z0-9-]{0,62}$/.test(
      binding.imageSelfLink,
    ) ||
    !/^https:\/\/www\.googleapis\.com\/compute\/v1\/projects\/f5-7626-networks-public\/global\/licenses\/[a-z][a-z0-9-]{0,62}$/.test(
      binding.licenseSelfLink,
    ) ||
    !/^[a-z][a-z0-9-]*\.endpoints\.f5-7626-networks-public\.cloud\.goog$/.test(binding.billingService)
  )
    throw new Error('Exact Marketplace image/project/license identity required');
  const prefix = `commerceoffercatalog.googleapis.com/services/${binding.billingService}/standardOffers/`;
  const suffix = binding.agreement.slice(prefix.length);
  if (
    !binding.agreement.startsWith(prefix) ||
    !/^[a-zA-Z0-9_-]+\/agreements\/[a-zA-Z0-9_-]+$/.test(suffix) ||
    !binding.agreementDocument.startsWith(`${binding.agreement}/documents/`) ||
    !/^[a-zA-Z0-9_-]+$/.test(binding.agreementDocument.slice(`${binding.agreement}/documents/`.length))
  )
    throw new Error('Agreement document must match the image billing service');
}
function activeConsent(value, binding) {
  const consent = value?.consent;
  if (!consent) return;
  if (
    consent.state !== 'ACTIVE' ||
    consent.agreement !== binding.agreement ||
    consent.agreementDocument !== binding.agreementDocument ||
    typeof consent.name !== 'string' ||
    !consent.name.startsWith(`projects/${binding.projectNumber}/consents/`) ||
    !/^[a-zA-Z0-9_-]+$/.test(consent.name.slice(`projects/${binding.projectNumber}/consents/`.length))
  )
    throw new Error('Marketplace consent identity/state differs');
  return {
    nameHash: fingerprint(consent.name),
    identityHash: fingerprint({
      name: consent.name,
      agreement: consent.agreement,
      agreementDocument: consent.agreementDocument,
    }),
  };
}
async function planGcpMarketplaceAcceptance(port, store) {
  const binding = await port.binding();
  validateGcpMarketplaceBinding(binding);
  const current = activeConsent(await port.check(binding), binding);
  if (!current) await port.validateGrant(binding);
  const body = {
    schemaVersion: 1,
    operation: 'marketplace-consent',
    binding,
    createdAt: new Date().toISOString(),
    alreadyAccepted: !!current,
    action: current ? 'observe' : 'grant-consent',
    purchases: 0,
    approval: 'required',
  };
  const plan = { ...body, planHash: fingerprint(body) };
  await store.write(`gcp-marketplace-plan-${plan.planHash.slice(7)}.json`, plan);
  return plan;
}
async function applyGcpMarketplaceAcceptance(port, store, approvedHash, onMutation) {
  if (!/^sha256:[a-f0-9]{64}$/.test(approvedHash)) throw new Error('Exact agreement review required');
  const plan = await store.read(`gcp-marketplace-plan-${approvedHash.slice(7)}.json`);
  const { planHash, ...body } = plan;
  if (planHash !== approvedHash || fingerprint(body) !== approvedHash) throw new Error('Agreement review changed');
  validateGcpMarketplaceBinding(plan.binding);
  const live = await port.binding();
  if (fingerprint(live) !== fingerprint(plan.binding)) throw new Error('Marketplace binding changed after review');
  const checkpointName = `gcp-marketplace-grant-${approvedHash.slice(7)}.json`;
  let checkpoint;
  try {
    checkpoint = await store.read(checkpointName);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (checkpoint && (checkpoint.planHash !== approvedHash || !['submitting', 'accepted'].includes(checkpoint.state)))
    throw new Error('Marketplace consent checkpoint differs');
  const age = Date.now() - Date.parse(plan.createdAt);
  if (!checkpoint && (!Number.isFinite(age) || age < 0 || age > 5 * 60000)) throw new Error('Marketplace review stale');
  let consent = activeConsent(await port.check(live), live);
  if (!consent) {
    if (checkpoint) throw new Error('Ambiguous or revoked Marketplace consent requires reconciliation');
    if (plan.alreadyAccepted) throw new Error('Reviewed Marketplace consent is no longer active');
    await port.validateGrant(live);
    await store.write(checkpointName, { planHash: approvedHash, state: 'submitting' });
    onMutation?.();
    await port.grant(live);
    consent = activeConsent(await port.check(live), live);
    if (!consent) throw new Error('Marketplace consent not independently established');
  }
  await store.write(checkpointName, { planHash: approvedHash, state: 'accepted' });
  const receipt = {
    schemaVersion: 1,
    project: live.project,
    planHash: approvedHash,
    bindingHash: fingerprint(live),
    ...consent,
    state: 'accepted',
    observedAt: new Date().toISOString(),
    purchases: 0,
  };
  await store.write(`gcp-marketplace-receipt-${approvedHash.slice(7)}.json`, receipt);
  return receipt;
}
var init_marketplace_agreement = __esm(() => {
  init_discovery();
});

// plugins/gcloud/src/ce/marketplace-port.ts
function gcpMarketplacePrerequisiteGuidance(reason) {
  if (reason !== 'cloud_terms_not_accepted') return {};
  return {
    prerequisite: 'google-cloud-terms',
    providerCode: 'UREQ_TOS_NOT_ACCEPTED',
    acceptanceUrl: GCP_CLOUD_TERMS_URL,
    nextSteps: [
      'Open the acceptance URL and sign in with the same Google account used by gcloud.',
      'Review and accept the Google Cloud terms shown; select the intended project if prompted.',
      'Retry scoped Consumer Procurement API enablement and agreement qualification to verify recovery.',
    ],
    marketplaceConsent: 'not-established',
  };
}
async function enableGcpMarketplaceApi(api, project, signal) {
  validateScope(project);
  signal?.throwIfAborted();
  const response = await api.exec(
    'gcloud',
    ['services', 'enable', 'cloudcommerceconsumerprocurement.googleapis.com', `--project=${project}`, '--quiet'],
    { signal },
  );
  if (response.exitCode !== 0) {
    if (response.stderr.includes('UREQ_TOS_NOT_ACCEPTED'))
      throw new GcpMarketplaceUnavailable('cloud_terms_not_accepted');
    throw new GcpMarketplaceUnavailable('source_unavailable');
  }
}
function createGcpMarketplacePort(api, intent, reference, fetcher = fetch, signal) {
  validateIntent(intent);
  const scoped = structuredClone(intent);
  const selected = reference ? structuredClone(reference) : undefined;
  let credential;
  let admittedBinding;
  const request = async (url, body) => {
    const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
    combined.throwIfAborted();
    if (!credential) {
      const response = await api.exec(
        'gcloud',
        ['auth', 'print-access-token', `--project=${scoped.project}`, '--quiet'],
        { signal: combined },
      );
      if (response.exitCode !== 0 || !response.stdout.trim() || /\s/.test(response.stdout.trim()))
        throw new GcpMarketplaceUnavailable('source_unavailable');
      credential = response.stdout.trim();
    }
    const response = await fetcher(url, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      signal: combined,
      headers: {
        Authorization: `Bearer ${credential}`,
        'Content-Type': 'application/json',
        'x-goog-user-project': scoped.project,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    if (text.length > 4 * 1024 * 1024) throw new GcpMarketplaceUnavailable('source_unavailable');
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new GcpMarketplaceUnavailable('source_unavailable');
    }
    if (!response.ok) {
      const reasons = value.error?.details?.map((d) => d.reason) ?? [];
      if (reasons.includes('UREQ_TOS_NOT_ACCEPTED')) throw new GcpMarketplaceUnavailable('cloud_terms_not_accepted');
      if (reasons.includes('SERVICE_DISABLED')) throw new GcpMarketplaceUnavailable('api_disabled');
      if (response.status === 404 && value.error?.message === 'Method not found.')
        throw new GcpMarketplaceUnavailable('method_unavailable');
      if (response.status === 403) throw new GcpMarketplaceUnavailable('permission_denied');
      throw new GcpMarketplaceUnavailable('source_unavailable');
    }
    return value;
  };
  const apiRoot = 'https://cloudcommerceconsumerprocurement.googleapis.com/v1alpha1';
  const assertBinding = (b) => {
    validateGcpMarketplaceBinding(b);
    if (
      admittedBinding !== fingerprint(b) ||
      b.project !== scoped.project ||
      b.imageId !== scoped.image.id ||
      b.imageSelfLink !== scoped.image.selfLink ||
      !scoped.image.licenses.includes(b.licenseSelfLink)
    )
      throw new Error('Consent escaped pinned image/project');
  };
  const grant = async (binding, validateOnly) => {
    assertBinding(binding);
    return request(`${apiRoot}/projects/${binding.projectNumber}/consents:grant`, {
      consent: { agreementDocument: binding.agreementDocument },
      validateOnly,
    });
  };
  return {
    async binding() {
      if (scoped.image.licenses.length !== 1) throw new GcpMarketplaceUnavailable('agreement_mapping_unavailable');
      const project = await request(`https://cloudresourcemanager.googleapis.com/v1/projects/${scoped.project}`);
      if (
        project.projectId !== scoped.project ||
        typeof project.projectNumber !== 'string' ||
        !/^\d+$/.test(project.projectNumber)
      )
        throw new Error('Marketplace project differs');
      const imagePrefix = 'https://www.googleapis.com/compute/v1/projects/f5-7626-networks-public/global/images/';
      if (
        !scoped.image.selfLink.startsWith(imagePrefix) ||
        !/^[a-z][a-z0-9-]{0,62}$/.test(scoped.image.selfLink.slice(imagePrefix.length))
      )
        throw new Error('Pinned F5 image required');
      const image = await request(scoped.image.selfLink.replace('www.googleapis.com', 'compute.googleapis.com'));
      if (
        String(image.id) !== scoped.image.id ||
        image.selfLink !== scoped.image.selfLink ||
        image.status !== 'READY' ||
        JSON.stringify(image.licenses) !== JSON.stringify(scoped.image.licenses)
      )
        throw new Error('Marketplace image changed');
      const licenseLink = scoped.image.licenses[0];
      if (
        !/^https:\/\/www\.googleapis\.com\/compute\/v1\/projects\/f5-7626-networks-public\/global\/licenses\/[a-z][a-z0-9-]{0,62}$/.test(
          licenseLink,
        )
      )
        throw new Error('Pinned F5 license required');
      const license = await request(licenseLink.replace('www.googleapis.com', 'compute.googleapis.com'));
      const billingService =
        typeof license.description === 'string'
          ? license.description.match(
              /^License for Cloud Marketplace virtual machine image solution with billing service ([a-z][a-z0-9-]*\.endpoints\.f5-7626-networks-public\.cloud\.goog): default$/,
            )?.[1]
          : undefined;
      if (!billingService || license.selfLink !== licenseLink || !/^\d+$/.test(String(license.id)))
        throw new GcpMarketplaceUnavailable('agreement_mapping_unavailable');
      let resolved = selected;
      if (!resolved) {
        const prefix = `commerceoffercatalog.googleapis.com/services/${billingService}/standardOffers/`;
        const matches = [];
        const tokens = new Set();
        let pageToken = '';
        do {
          const url = new URL(`${apiRoot}/projects/${project.projectNumber}/consents`);
          url.searchParams.set('pageSize', '100');
          if (pageToken) url.searchParams.set('pageToken', pageToken);
          const page = await request(url.href);
          if (page.consents !== undefined && !Array.isArray(page.consents))
            throw new GcpMarketplaceUnavailable('source_unavailable');
          for (const consent of page.consents ?? [])
            if (
              typeof consent.agreement === 'string' &&
              consent.agreement.startsWith(prefix) &&
              typeof consent.agreementDocument === 'string'
            )
              matches.push({ agreement: consent.agreement, agreementDocument: consent.agreementDocument });
          if (page.nextPageToken !== undefined && typeof page.nextPageToken !== 'string')
            throw new GcpMarketplaceUnavailable('source_unavailable');
          pageToken = page.nextPageToken ?? '';
          if (pageToken && tokens.has(pageToken)) throw new GcpMarketplaceUnavailable('source_unavailable');
          tokens.add(pageToken);
          if (tokens.size > 100) throw new GcpMarketplaceUnavailable('source_unavailable');
        } while (pageToken);
        const unique = [...new Map(matches.map((m) => [m.agreementDocument, m])).values()];
        if (unique.length !== 1) throw new GcpMarketplaceUnavailable('agreement_mapping_unavailable');
        resolved = unique[0];
      }
      const binding = {
        project: scoped.project,
        projectNumber: String(project.projectNumber),
        imageId: scoped.image.id,
        imageSelfLink: scoped.image.selfLink,
        licenseId: String(license.id),
        licenseSelfLink: licenseLink,
        billingService,
        ...resolved,
      };
      validateGcpMarketplaceBinding(binding);
      admittedBinding = fingerprint(binding);
      return binding;
    },
    async check(binding) {
      assertBinding(binding);
      return request(`${apiRoot}/projects/${binding.projectNumber}/consents:check`, {
        agreement: binding.agreement,
      });
    },
    async validateGrant(binding) {
      await grant(binding, true);
    },
    grant(binding) {
      return grant(binding, false);
    },
  };
}
var GCP_CLOUD_TERMS_URL = 'https://console.developers.google.com/terms/cloud',
  GcpMarketplaceUnavailable;
var init_marketplace_port = __esm(() => {
  init_discovery();
  init_marketplace_agreement();
  init_validation();
  GcpMarketplaceUnavailable = class GcpMarketplaceUnavailable extends Error {
    reason;
    constructor(reason) {
      super(`GCP Marketplace unavailable: ${reason}`);
      this.reason = reason;
    }
  };
});

// plugins/gcloud/src/ce/health.ts
function parseGcpGlobalHealth(value, nodeName) {
  const base = { nodeName, source: 'f5xc-global-health', scope: 'site-global-only' };
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(nodeName)) throw new Error('Invalid expected GCP node');
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { ...base, status: 'unknown', reason: 'malformed-health' };
  const row = value;
  if (typeof row.hostname !== 'string' || (row.hostname !== nodeName && !row.hostname.startsWith(`${nodeName}.`)))
    return { ...base, status: 'unknown', reason: 'node-identity-mismatch' };
  if (
    typeof row.state !== 'string' ||
    !['WAITING_FOR_CONFIG', 'WAITING_FOR_APPROVAL', 'PROVISIONING', 'PROVISIONED', 'FAILED', 'RESETTING'].includes(
      row.state,
    )
  )
    return { ...base, status: 'unknown', reason: 'unknown-health-state' };
  return { ...base, state: row.state, status: row.state === 'PROVISIONED' ? 'healthy' : 'degraded' };
}
function record2(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}
function evidenceFingerprint(value) {
  try {
    return fingerprint(value);
  } catch {
    return;
  }
}
function qualifiedGcpHaHealthContract(value) {
  const row = record2(value);
  if (!row) return false;
  const { evidenceSha256, ...semantics } = row;
  return (
    typeof evidenceSha256 === 'string' &&
    HASH2.test(evidenceSha256) &&
    evidenceFingerprint(semantics) === fingerprint(GCP_HA_HEALTH_SEMANTICS)
  );
}
function evaluateGcpHaHealth(value, expected, contractFingerprint, healthContract, now = Date.now()) {
  const reasons = new Set();
  const collection = record2(value);
  if (!qualifiedGcpHaHealthContract(healthContract)) reasons.add('health-contract-unqualified');
  if (
    expected.length !== 3 ||
    new Set(expected.map((n) => n.nodeName)).size !== 3 ||
    new Set(expected.map((n) => n.instanceId)).size !== 3 ||
    expected.some((n) => !/^[a-z][a-z0-9-]{0,62}$/.test(n.nodeName) || !/^\d+$/.test(n.instanceId))
  )
    reasons.add('invalid-original-node-set');
  if (
    collection?.schemaVersion !== 1 ||
    collection.contractFingerprint !== contractFingerprint ||
    collection.ownershipFingerprint !== fingerprint(expected) ||
    evidenceFingerprint(collection?.ownedNodes) !== fingerprint(expected) ||
    typeof collection.siteIdentitySha256 !== 'string' ||
    !HASH2.test(collection.siteIdentitySha256)
  )
    reasons.add('collection-binding-mismatch');
  const start = typeof collection?.startedAt === 'string' ? Date.parse(collection.startedAt) : NaN;
  const finish = typeof collection?.finishedAt === 'string' ? Date.parse(collection.finishedAt) : NaN;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(finish) ||
    !Number.isFinite(now) ||
    start > finish ||
    finish > now ||
    now - start > 300000
  )
    reasons.add('stale-or-malformed-observation');
  const receipts = [];
  const reads = (key) => {
    const read = record2(collection?.[key]);
    const at = typeof read?.observedAt === 'string' ? Date.parse(read.observedAt) : NaN;
    if (!Number.isFinite(at) || at < start || at > finish) reasons.add(`${key}-observation-time-invalid`);
    if (read?.available !== true || typeof read.receiptHash !== 'string' || !HASH2.test(read.receiptHash)) {
      reasons.add(`${key}-unavailable`);
      return;
    }
    if (evidenceFingerprint(read.value) !== read.receiptHash) {
      reasons.add(`${key}-receipt-mismatch`);
      return;
    }
    if (Number.isFinite(at) && at >= start && at <= finish)
      receipts.push({ source: key, sha256: read.receiptHash, observedAt: new Date(at).toISOString() });
    const body = record2(read.value);
    if (
      !body ||
      body.next_page_token ||
      body.continue ||
      (body.errors !== undefined && (!Array.isArray(body.errors) || body.errors.length))
    ) {
      reasons.add(`${key}-malformed-or-partial`);
      return;
    }
    return body;
  };
  const component = reads('componentStatus'),
    inventory = reads('serviceInventory'),
    global = reads('globalHealth');
  const parseRows = (body, field, identity, source) => {
    const map = new Map();
    const rows = body?.[field];
    if (!Array.isArray(rows) || !rows.length) reasons.add(`${source}-missing-rows`);
    for (const raw of Array.isArray(rows) ? rows : []) {
      const row = record2(raw);
      if (!row || typeof row.node !== 'string' || !row.node || typeof row[identity] !== 'string' || !row[identity]) {
        reasons.add(`${source}-malformed-row`);
        continue;
      }
      if (!expected.some((n) => n.nodeName === row.node)) {
        reasons.add(`${source}-foreign-node`);
        continue;
      }
      const nodeRows = map.get(row.node) ?? new Map();
      const name = row[identity];
      if (nodeRows.has(name)) reasons.add(`${source}-duplicate-identity`);
      nodeRows.set(name, row);
      map.set(row.node, nodeRows);
    }
    return map;
  };
  const components = parseRows(component, 'status', 'name', 'component-status');
  const services = parseRows(inventory, 'service', 'value', 'service-inventory');
  if (global && (typeof global.hostname !== 'string' || !expected.some((n) => n.nodeName === global.hostname)))
    reasons.add('global-health-foreign-hostname');
  const nodes = expected.map((node) => {
    const nodeReasons = new Set();
    const required = services.get(node.nodeName) ?? new Map();
    const statuses = components.get(node.nodeName) ?? new Map();
    if (!required.size) nodeReasons.add('missing-service-inventory');
    let covered = 0,
      unhealthy = 0;
    for (const name of required.keys()) {
      const row = statuses.get(name);
      if (!row) {
        nodeReasons.add('missing-component-coverage');
        continue;
      }
      covered++;
      if (typeof row.status !== 'string' || !row.status || typeof row.message !== 'string')
        nodeReasons.add('malformed-component-state');
      else if (row.status !== 'Ready') unhealthy++;
    }
    if ([...statuses.keys()].some((name) => !required.has(name))) nodeReasons.add('unmapped-component');
    let globalStatus = 'unknown';
    if (global?.hostname === node.nodeName) {
      globalStatus = parseGcpGlobalHealth(global, node.nodeName).status;
      if (globalStatus === 'unknown') nodeReasons.add('malformed-global-health');
    }
    return {
      nodeName: node.nodeName,
      status: nodeReasons.size ? 'unknown' : unhealthy || globalStatus === 'degraded' ? 'degraded' : 'healthy',
      requiredServices: required.size,
      coveredServices: covered,
      unhealthyServices: unhealthy,
      globalHealth: globalStatus,
      reasonCodes: [...nodeReasons],
    };
  });
  if (reasons.size)
    for (const node of nodes) {
      node.status = 'unknown';
      node.reasonCodes.push(...reasons);
    }
  const status =
    nodes.some((n) => n.status === 'unknown') || reasons.size
      ? 'unknown'
      : nodes.some((n) => n.status === 'degraded')
        ? 'degraded'
        : 'healthy';
  return {
    schemaVersion: 1,
    status,
    nodes,
    reasonCodes: [...new Set([...reasons, ...nodes.flatMap((n) => n.reasonCodes)])],
    startedAt: Number.isFinite(start) ? new Date(start).toISOString() : undefined,
    finishedAt: Number.isFinite(finish) ? new Date(finish).toISOString() : undefined,
    sourceReceipts: receipts,
  };
}
var GCP_HA_HEALTH_SEMANTICS, HASH2;
var init_health = __esm(() => {
  init_discovery();
  GCP_HA_HEALTH_SEMANTICS = {
    schemaVersion: 1,
    completeInventory: true,
    requiredServices: 'all-inventoried',
    inventoryIdentity: 'service[].(node,value)',
    componentIdentity: 'status[].(node,name)',
    healthyState: 'Ready',
    duplicateIdentity: 'reject',
    globalScope: 'exact-hostname-only',
    maximumAgeMs: 300000,
  };
  HASH2 = /^sha256:[a-f0-9]{64}$/;
});

// plugins/gcloud/src/ce/status.ts
function object4(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed status observation');
  return value;
}
async function observeGcpSiteStatus(expected, engine, source, signal) {
  signal?.throwIfAborted();
  if (!['native', 'terraform'].includes(engine)) throw new Error('Explicit status owning engine required');
  const evidence = {
    schemaVersion: 1,
    project: expected.project,
    zone: expected.zone,
    siteName: expected.siteName,
    nodeName: expected.nodeName,
    instanceId: expected.instanceId,
    engine,
    observedAt: new Date().toISOString(),
    cloudProvisioning: 'unknown',
    registration: 'unknown',
    physicalInterfaceIdentity: 'unknown',
    platformHealth: 'unknown',
    routing: 'unknown',
    applicationTraffic: 'unknown',
    sourceReceipts: [],
  };
  const read = async (name, fn) => {
    signal?.throwIfAborted();
    const value = await fn();
    signal?.throwIfAborted();
    evidence.sourceReceipts.push({ source: name, sha256: fingerprint(value) });
    return object4(value);
  };
  let cloud;
  try {
    cloud = await read('gcloud-instance', () => source.cloud(expected.nodeName, signal));
    if (
      String(cloud.id) !== expected.instanceId ||
      cloud.name !== expected.nodeName ||
      cloud.zone !== `https://www.googleapis.com/compute/v1/projects/${expected.project}/zones/${expected.zone}`
    )
      return evidence;
    evidence.cloudProvisioning = cloud.status === 'RUNNING' ? 'running' : 'observed';
  } catch {
    signal?.throwIfAborted();
    return evidence;
  }
  let configuration, registration;
  try {
    configuration = await read('xc-site-configuration', () => source.configuration(expected.siteName, signal));
    const metadata = object4(configuration.metadata);
    if (metadata.name !== expected.siteName || metadata.namespace !== 'system') return evidence;
    const response = await read('xc-site-registrations', () => source.registrations(expected.siteName, signal));
    if (
      !Array.isArray(response.items) ||
      (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length)) ||
      response.next_page_token ||
      response.continue
    )
      return evidence;
    const matches = response.items.map(object4).filter((item) => {
      const spec = object4(item.get_spec),
        infra = object4(spec.infra),
        passport = object4(spec.passport);
      return infra.hostname === expected.nodeName && passport.cluster_name === expected.siteName;
    });
    if (matches.length !== 1) return evidence;
    registration = matches[0];
    const infra = object4(object4(registration.get_spec).infra);
    const state = object4(object4(registration.object).status).current_state;
    if (
      infra.provider !== 'GOOGLE' ||
      String(infra.instance_id) !== expected.instanceId ||
      infra.availability_zone !== expected.zone
    )
      return evidence;
    evidence.registration = state === 'ONLINE' ? 'online' : 'observed-not-online';
    if (state !== 'ONLINE') return evidence;
  } catch {
    signal?.throwIfAborted();
    return evidence;
  }
  try {
    correlateGcpPhysicalInterfaces(expected, cloud, registration, configuration);
    evidence.physicalInterfaceIdentity = 'observed';
  } catch {
    return evidence;
  }
  try {
    const health = await read('xc-global-health', () => source.health(expected.siteName, signal));
    evidence.platformHealth = parseGcpGlobalHealth(health, expected.nodeName).status;
  } catch {
    signal?.throwIfAborted();
    evidence.platformHealth = 'unknown';
  }
  return evidence;
}
var init_status = __esm(() => {
  init_discovery();
  init_health();
});

// plugins/gcloud/src/ce/owned-status.ts
async function observeGcpOwnedDeployment(store, intent, source, signal) {
  signal?.throwIfAborted();
  validateIntent(intent);
  const saved = await store.read(
    intent.engine === 'terraform' ? 'gcp-terraform-input-identity.json' : 'gcp-deployment-intent.json',
  );
  if (
    !saved?.intent ||
    saved.intentFingerprint !== fingerprint(saved.intent) ||
    saved.intentFingerprint !== fingerprint(intent) ||
    saved.platformContext !== intent.platformContext
  )
    throw new Error('Status intent is not bound to persisted deployment context');
  const resources = await readGcpResourceInventory(store, intent);
  const instances = resources.filter((resource) => resource.kind === 'instance');
  const nodes = intent.sites.flatMap((site) => site.nodes.map((node) => ({ site, node })));
  if (instances.length !== nodes.length) throw new Error('Complete owned deployment node inventory required');
  const identities = nodes.map(({ site, node }) => {
    const matches = instances.filter((resource) => resource.siteName === site.name && resource.nodeName === node.name);
    const expectedLink = `https://www.googleapis.com/compute/v1/projects/${intent.project}/zones/${node.zone}/instances/${node.name}`;
    if (matches.length !== 1 || matches[0].selfLink !== expectedLink)
      throw new Error('Owned deployment node identity differs');
    return {
      project: intent.project,
      zone: node.zone,
      instanceId: matches[0].id,
      siteName: site.name,
      nodeName: node.name,
      nics: node.interfaces.map((nic) => {
        if (nic.role === 'management') throw new Error('Management interface observation is not qualified');
        return {
          index: nic.index,
          role: nic.role,
          vrf: nic.vrf,
          network: `https://www.googleapis.com/compute/v1/projects/${intent.project}/global/networks/${nic.network}`,
          subnet: `https://www.googleapis.com/compute/v1/projects/${intent.project}/regions/${intent.region}/subnetworks/${nic.subnet}`,
        };
      }),
    };
  });
  const observations = [];
  for (const expected of identities) {
    signal?.throwIfAborted();
    observations.push(
      await observeGcpSiteStatus(expected, intent.engine, source(expected.nodeName, expected.zone), signal),
    );
  }
  const haResults = [];
  const operationalResults = [];
  for (const site of intent.sites.filter((site) => site.nodes.length === 3)) {
    const expected = identities
      .filter((n) => n.siteName === site.name)
      .map(({ nodeName, instanceId }) => ({ nodeName, instanceId }));
    const port = source(site.nodes[0].name, site.nodes[0].zone);
    if (port.operationalHealthExpected && !port.operationalHealthContract) {
      const binding = {
        contextFingerprint: '',
        ownershipFingerprint: '',
        configurationIdentitySha256: '',
        runtimeIdentitySha256: '',
        siteName: site.name,
        nodes: expected.map((node) => ({
          ...node,
          role: '',
          registrationIdentitySha256: '',
          tokenIdentitySha256: '',
          nics: ['', ''],
        })),
      };
      operationalResults.push({
        ...evaluateGcpOperationalHealth(
          undefined,
          binding,
          undefined,
          port.operationalHealthExpected.contractFingerprint,
        ),
        releaseQualificationFingerprint: port.operationalHealthExpected.qualificationFingerprint,
      });
      continue;
    }
    if (port.operationalHealthContract) {
      const contract = port.operationalHealthContract;
      const original = await store.read('gcp-tf-public-ownership.json');
      if (!original.complete || original.intentFingerprint !== fingerprint(intent))
        throw new Error('Original operational deployment ownership unavailable');
      let binding = {
        contextFingerprint: '',
        ownershipFingerprint: '',
        configurationIdentitySha256: '',
        runtimeIdentitySha256: '',
        siteName: site.name,
        nodes: expected.map((node) => ({
          ...node,
          role: '',
          registrationIdentitySha256: '',
          tokenIdentitySha256: '',
          nics: ['', ''],
        })),
      };
      let collection;
      let returnedBinding;
      try {
        const collected = await port.operationalHealth?.(
          site.name,
          async (nodeName, readSignal) => {
            const node = site.nodes.find((node) => node.name === nodeName);
            if (!node) throw new Error('Original operational cloud node required');
            return source(node.name, node.zone).cloud(node.name, readSignal);
          },
          signal,
        );
        collection = collected?.collection;
        returnedBinding = collected?.binding;
      } catch {
        signal?.throwIfAborted();
      }
      try {
        const persisted = await store.read('gcp-operational-original-binding.json');
        const candidate = persisted.binding;
        if (
          persisted.contractFingerprint === contract.contractFingerprint &&
          candidate?.siteName === site.name &&
          candidate.ownershipFingerprint === fingerprint(original) &&
          Array.isArray(candidate.nodes) &&
          candidate.nodes.length === 3 &&
          candidate.configurationIdentitySha256 ===
            original.platform?.[`xcsh_securemesh_site_v2.${site.name.replaceAll('-', '_')}`] &&
          candidate.nodes.every(
            (node) =>
              expected.filter(
                (identity) => identity.nodeName === node.nodeName && identity.instanceId === node.instanceId,
              ).length === 1 &&
              node.tokenIdentitySha256 === original.platform?.[`xcsh_token.${node.nodeName.replaceAll('-', '_')}`],
          )
        ) {
          binding = candidate;
          if (returnedBinding !== undefined && fingerprint(returnedBinding) !== fingerprint(binding))
            collection = undefined;
        } else collection = undefined;
      } catch {
        collection = undefined;
        signal?.throwIfAborted();
      }
      const releaseQualified = qualifiedOperationalRelease(
        contract.qualification,
        contract.qualificationFingerprint,
        contract.contractFingerprint,
      );
      operationalResults.push({
        ...evaluateGcpOperationalHealth(
          collection,
          binding,
          releaseQualified ? contract.profile : undefined,
          contract.contractFingerprint,
        ),
        releaseQualificationFingerprint: contract.qualificationFingerprint,
      });
      if (fingerprint(await store.read('gcp-tf-public-ownership.json')) !== fingerprint(original))
        throw new Error('Operational creation ownership changed during observation');
      continue;
    }
    let collection;
    try {
      collection = await port.haHealth?.(site.name, signal);
    } catch {
      signal?.throwIfAborted();
    }
    const health = evaluateGcpHaHealth(collection, expected, port.contractFingerprint ?? '', port.haHealthContract);
    for (const node of health.nodes) {
      const observed = observations.find((n) => n.nodeName === node.nodeName && n.siteName === site.name);
      if (observed?.registration !== 'online' || observed.physicalInterfaceIdentity !== 'observed') {
        node.status = 'unknown';
        node.reasonCodes.push('node-not-online-with-both-nics');
        health.status = 'unknown';
        health.reasonCodes.push('node-not-online-with-both-nics');
      }
    }
    haResults.push(health);
  }
  const reloaded = await store.read(
    intent.engine === 'terraform' ? 'gcp-terraform-input-identity.json' : 'gcp-deployment-intent.json',
  );
  if (
    fingerprint(reloaded) !== fingerprint(saved) ||
    fingerprint(await readGcpResourceInventory(store, intent)) !== fingerprint(resources)
  )
    throw new Error('Status ownership changed during collection');
  const ha = haResults.length
    ? {
        schemaVersion: 1,
        status: haResults.some((r) => r.status === 'unknown')
          ? 'unknown'
          : haResults.some((r) => r.status === 'degraded')
            ? 'degraded'
            : 'healthy',
        sites: haResults,
      }
    : undefined;
  const operationalHealth = operationalResults.length
    ? {
        schemaVersion: 2,
        scope: 'original-three-node-operational-health',
        status: operationalResults.some((result) => result.status === 'unknown')
          ? 'unknown'
          : operationalResults.some((result) => result.status === 'degraded')
            ? 'degraded'
            : 'healthy',
        sites: operationalResults,
      }
    : undefined;
  return {
    schemaVersion: operationalHealth ? 2 : 1,
    project: intent.project,
    region: intent.region,
    deploymentName: intent.deploymentName,
    platformContext: intent.platformContext,
    engine: intent.engine,
    nodes: observations,
    routing: 'unknown',
    applicationTraffic: 'unknown',
    haHealth: 'not-established',
    ...(ha ? { ha } : {}),
    ...(operationalHealth ? { operationalHealth } : {}),
    absence: 'not-established',
  };
}
var init_owned_status = __esm(() => {
  init_discovery();
  init_health();
  init_operational_health();
  init_ownership();
  init_status();
  init_validation();
});

// plugins/gcloud/src/ce/terraform-context.ts
function publicTerraformContextHash(intent, apiUrl) {
  if (!apiUrl) throw new Error('Scoped Terraform context endpoint unavailable');
  const base = new URL(apiUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash)
    throw new Error('Scoped Terraform context endpoint differs');
  return fingerprint({ platformContext: intent.platformContext, apiUrl: base.href });
}
async function assertPublicTerraformContext(runtime, intent) {
  const saved = await runtime.store.read('gcp-tf-public-platform-context.json');
  if (
    saved.schemaVersion !== 1 ||
    saved.contextHash !== publicTerraformContextHash(intent, runtime.environment.XCSH_API_URL)
  )
    throw new Error('Original public Terraform context endpoint changed');
  return saved.contextHash;
}
var init_terraform_context = __esm(() => {
  init_discovery();
});

// plugins/gcloud/src/ce/terraform-admission.ts
function admitGcpTerraformTransition(intent, receipt) {
  if (
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== intent.deploymentName ||
    receipt.backendIdentity !== intent.backendIdentity ||
    receipt.backendIdentity !== `local:${intent.deploymentName}`
  )
    throw new Error('Terraform transition ownership/backend differs');
  for (const [actual, expected] of [
    [receipt.planSha256, intent.savedPlanSha256],
    [receipt.configurationSha256, intent.configurationSha256],
    [receipt.providerLockSha256, intent.providerLockSha256],
  ])
    if (!/^[a-f0-9]{64}$/.test(actual) || actual !== expected)
      throw new Error('Reviewed Terraform transition artifact differs');
  if (
    !['deploy', 'start', 'stop', 'resize', 'replace-node', 'teardown'].includes(intent.operation) ||
    !intent.addresses.length ||
    new Set(intent.addresses).size !== intent.addresses.length
  )
    throw new Error('Explicit unique transition resource inventory required');
  if (receipt.actionInvocations?.length) throw new Error('Compute transitions do not admit implicit provider actions');
  const allowedTypes = new Set([
    'google_compute_instance',
    'google_compute_disk',
    'google_compute_network',
    'google_compute_subnetwork',
    'google_compute_address',
    'google_compute_firewall',
    'google_compute_route',
    'google_compute_router',
    'google_compute_router_nat',
    'google_compute_region_backend_service',
    'google_compute_forwarding_rule',
    'google_compute_region_health_check',
    'google_compute_instance_group',
    'xcsh_securemesh_site_v2',
    'xcsh_token',
  ]);
  const actual = new Map();
  for (const change of receipt.changes) {
    if (actual.has(change.address) || !allowedTypes.has(change.type) || !change.address.startsWith(`${change.type}.`))
      throw new Error('Unknown or duplicate Terraform transition resource');
    actual.set(change.address, change.actions);
    if (change.actions.join(',') === 'no-op') continue;
    if (
      !intent.addresses.includes(change.address) ||
      fingerprint(change.actions) !== fingerprint(intent.expectedActions[change.address])
    )
      throw new Error('Terraform plan contains unrelated or unexpected changes');
    const actions = change.actions.join(',');
    if (intent.operation === 'deploy' && actions !== 'create') throw new Error('Deploy admits only owned creates');
    if (intent.operation === 'teardown' && actions !== 'delete') throw new Error('Teardown admits only owned deletes');
    if (
      ['start', 'stop', 'resize'].includes(intent.operation) &&
      (change.type !== 'google_compute_instance' || actions !== 'update')
    )
      throw new Error('Power/resize plan must update only the owned VM');
    if (
      intent.operation === 'replace-node' &&
      !['delete,create', 'create,delete', 'update', 'create', 'delete'].includes(actions)
    )
      throw new Error('Replacement transition unsupported');
  }
  for (const address of intent.addresses) {
    if (
      !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(address) ||
      !intent.expectedActions[address] ||
      fingerprint(actual.get(address)) !== fingerprint(intent.expectedActions[address])
    )
      throw new Error('Expected Terraform transition missing from saved plan');
  }
  if ((intent.operation === 'teardown') !== (receipt.operation === 'destroy'))
    throw new Error('Saved-plan destroy mode differs');
  return {
    admitted: true,
    engine: 'terraform',
    operation: intent.operation,
    planSha256: receipt.planSha256,
    fingerprint: fingerprint({ intent, receipt }),
  };
}
var init_terraform_admission = __esm(() => {
  init_discovery();
});

// plugins/gcloud/src/ce/terraform-teardown.ts
import { join as join8 } from 'node:path';

function gcpTerraformResourceAddresses(intent) {
  const site = intent.sites[0],
    node = site.nodes[0];
  return [
    `google_compute_instance.${node.name.replaceAll('-', '_')}`,
    ...node.interfaces.flatMap((nic) => [
      `google_compute_network.${nic.network.replaceAll('-', '_')}`,
      `google_compute_subnetwork.${nic.subnet.replaceAll('-', '_')}`,
    ]),
    `xcsh_securemesh_site_v2.${site.name.replaceAll('-', '_')}`,
    `xcsh_token.${node.name.replaceAll('-', '_')}`,
  ];
}
function assertGcpTerraformOwnedTransition(intent, receipt, operation, expected) {
  if (receipt.noChanges || receipt.changes.length !== expected.length)
    throw new Error('Complete Terraform transition inventory required');
  const action = operation === 'deploy' ? 'create' : 'delete';
  return admitGcpTerraformTransition(
    {
      operation,
      deploymentName: intent.deploymentName,
      addresses: expected,
      expectedActions: Object.fromEntries(expected.map((address) => [address, [action]])),
      savedPlanSha256: receipt.planSha256,
      configurationSha256: receipt.configurationSha256,
      providerLockSha256: receipt.providerLockSha256,
      backendIdentity: `local:${intent.deploymentName}`,
    },
    receipt,
  );
}
async function savedIntent(store, intent) {
  const saved = await store.read('gcp-terraform-input-identity.json');
  if (
    !saved.intent ||
    fingerprint(saved.intent) !== fingerprint(intent) ||
    saved.intentFingerprint !== fingerprint(intent) ||
    saved.platformContext !== intent.platformContext
  )
    throw new Error('Persisted Terraform teardown context differs');
}
function platformNames(intent, observation) {
  if (
    Object.keys(observation).some(
      (key) =>
        ![
          'siteName',
          'siteUid',
          'tokenName',
          'tokenIdentityHash',
          'siteIdentitySha256',
          'tokenIdentitySha256',
          'siteAbsent',
          'tokenAbsent',
        ].includes(key),
    ) ||
    typeof observation.siteAbsent !== 'boolean' ||
    typeof observation.tokenAbsent !== 'boolean' ||
    (!observation.siteAbsent &&
      (typeof observation.siteUid !== 'string' || !observation.siteUid || observation.siteUid.includes('.'))) ||
    (!observation.tokenAbsent && !/^sha256:[a-f0-9]{64}$/.test(observation.tokenIdentityHash ?? '')) ||
    observation.siteName !== intent.sites[0].name ||
    observation.tokenName !== `${intent.sites[0].nodes[0].name}-token`
  )
    throw new Error('Terraform platform observation escaped intent');
}
async function platformIdentity(runtime, intent, contract) {
  const saved = await runtime.store.read('gcp-terraform-platform-identity.json');
  const { identityHash, ...body } = saved;
  if (
    saved.schemaVersion !== 1 ||
    saved.engine !== 'terraform' ||
    saved.intentFingerprint !== fingerprint(intent) ||
    fingerprint(saved.apiRelease) !== fingerprint(contract.release) ||
    !/^[a-f0-9]{64}$/.test(saved.creationPlanSha256) ||
    identityHash !== fingerprint(body) ||
    !saved.observation.siteUid ||
    !saved.observation.tokenIdentityHash ||
    saved.observation.siteAbsent ||
    saved.observation.tokenAbsent
  )
    throw new Error('Original Terraform Platform ledger required');
  platformNames(intent, saved.observation);
  return saved;
}
async function observe(runtime, intent, resources, original, signal) {
  let cloudAbsent = 0;
  for (const resource of resources) {
    const live = await observeGcpTeardownResource(runtime.api, resource, signal);
    if (live) await assertGcpResourceOwnership(runtime.store, resource, live);
    else cloudAbsent++;
  }
  const platform = await runtime.observePlatform(original.siteName, original.tokenName, signal);
  platformNames(intent, platform);
  if (
    (!platform.siteAbsent && platform.siteUid !== original.siteUid) ||
    (!platform.tokenAbsent && platform.tokenIdentityHash !== original.tokenIdentityHash)
  )
    throw new Error('Original Terraform Platform object was replaced');
  return { cloudAbsent, siteAbsent: platform.siteAbsent, tokenAbsent: platform.tokenAbsent };
}
function gcpTerraformIdentitySelections(intent) {
  const selections = {};
  const expected = gcpTerraformResourceAddresses(intent);
  for (const address of expected) {
    if (address.startsWith('google_compute_instance.'))
      selections[address] = [
        'name',
        'project',
        'zone',
        'self_link',
        'instance_id',
        'boot_disk.length',
        'boot_disk.0.source',
        'boot_disk.0.auto_delete',
        'network_interface.length',
        ...intent.sites[0].nodes[0].interfaces.flatMap((_, index) => [
          `network_interface.${index}.network`,
          `network_interface.${index}.subnetwork`,
        ]),
      ];
    else if (address.startsWith('google_compute_network.'))
      selections[address] = ['name', 'project', 'self_link', 'numeric_id'];
    else if (address.startsWith('google_compute_subnetwork.'))
      selections[address] = ['name', 'project', 'region', 'self_link'];
    else
      selections[address] = [
        'id',
        'name',
        'namespace',
        'labels',
        ...(address.startsWith('xcsh_token.') ? ['site_name'] : []),
      ];
  }
  return selections;
}
function assertGcpTerraformProjectedIdentities(intent, fields, resources) {
  const expected = gcpTerraformResourceAddresses(intent),
    selections = gcpTerraformIdentitySelections(intent);
  if (fingerprint(Object.keys(fields).sort()) !== fingerprint(expected.slice().sort()))
    throw new Error('Terraform ownership projection resource inventory differs');
  const node = intent.sites[0].nodes[0],
    disk = resources.find((resource) => resource.kind === 'disk');
  for (const address of expected) {
    const value = fields[address];
    if (!value) throw new Error('Complete Terraform ownership ownership projection required');
    if (fingerprint(Object.keys(value).sort()) !== fingerprint(selections[address].slice().sort()))
      throw new Error('Terraform ownership projection contains unexpected fields');
    if (address.startsWith('xcsh_')) {
      const name = address.startsWith('xcsh_token.') ? `${node.name}-token` : intent.sites[0].name;
      const labels = value.labels;
      if (
        value.id !== name ||
        value.name !== name ||
        value.namespace !== 'system' ||
        labels?.['xcsh-deployment'] !== intent.deploymentName ||
        labels['xcsh-engine'] !== 'terraform' ||
        (address.startsWith('xcsh_token.') &&
          (value.site_name !== intent.sites[0].name || labels['xcsh-node'] !== node.name))
      )
        throw new Error('Terraform ownership Platform ownership differs');
    } else {
      const resource = resources.find((resource) => resource.selfLink === value.self_link);
      if (!resource || value.project !== intent.project || value.name !== resource.selfLink.split('/').at(-1))
        throw new Error('Terraform ownership cloud identity differs');
      if (address.startsWith('google_compute_instance.')) {
        if (
          resource.kind !== 'instance' ||
          String(value.instance_id) !== resource.id ||
          value.zone !== node.zone ||
          !disk ||
          value['boot_disk.length'] !== 1 ||
          value['boot_disk.0.source'] !== disk.selfLink ||
          value['boot_disk.0.auto_delete'] !== true ||
          value['network_interface.length'] !== node.interfaces.length ||
          node.interfaces.some(
            (_, index) =>
              value[`network_interface.${index}.network`] !==
                `https://www.googleapis.com/compute/v1/projects/${intent.project}/global/networks/${node.interfaces[index].network}` ||
              value[`network_interface.${index}.subnetwork`] !==
                `https://www.googleapis.com/compute/v1/projects/${intent.project}/regions/${intent.region}/subnetworks/${node.interfaces[index].subnet}`,
          )
        )
          throw new Error('Terraform ownership VM/disk identity differs');
      } else if (address.startsWith('google_compute_network.')) {
        if (resource.kind !== 'network' || String(value.numeric_id) !== resource.id)
          throw new Error('Terraform ownership VPC identity differs');
      } else if (resource.kind !== 'subnetwork' || value.region !== intent.region)
        throw new Error('Terraform ownership subnet identity differs');
    }
  }
  return fingerprint(fields);
}
async function projectSavedPlan(runtime, intent, receipt, resources, signal) {
  const selections = gcpTerraformIdentitySelections(intent);
  const fields = await runtime.session.readPlannedResourceFields(receipt, selections, runtime.environment, signal);
  return assertGcpTerraformProjectedIdentities(intent, fields, resources);
}
async function planGcpTerraformTeardown(runtime, intent, contract, policy, signal) {
  assertGcpTeardownProfile(intent, contract, 'terraform');
  assertGcpTeardownPolicyFresh(policy);
  await savedIntent(runtime.store, intent);
  const release = await acquireProcessLock(join8(runtime.store.directory, '.gcp-deployment-lock'));
  try {
    const resources = await readGcpResourceInventory(runtime.store, intent);
    assertGcpTeardownTopology(intent, resources);
    const original = await platformIdentity(runtime, intent, contract);
    const current = await observe(runtime, intent, resources, original.observation, signal);
    if (current.cloudAbsent || current.siteAbsent || current.tokenAbsent)
      throw new Error('Initial Terraform teardown review requires complete live inventory');
    const receipt = await runtime.session.planDestroy(runtime.environment, signal);
    assertGcpTerraformOwnedTransition(intent, receipt, 'teardown', gcpTerraformResourceAddresses(intent));
    const projectionHash = await projectSavedPlan(runtime, intent, receipt, resources, signal);
    const body = {
      schemaVersion: 1,
      operation: 'teardown',
      engine: 'terraform',
      intentFingerprint: fingerprint(intent),
      apiRelease: contract.release,
      policyReceipt: policy,
      createdAt: new Date().toISOString(),
      resources,
      platform: original.observation,
      savedPlan: receipt,
      projectionHash,
    };
    const plan = { ...body, planHash: fingerprint(body) };
    await runtime.store.write(`gcp-tf-reviewed-${plan.planHash.slice(7)}.json`, plan);
    return plan;
  } finally {
    await release();
  }
}
async function applyGcpTerraformTeardown(runtime, intent, contract, policy, approvedHash, signal, onMutation) {
  assertGcpTeardownProfile(intent, contract, 'terraform');
  assertGcpTeardownPolicyFresh(policy);
  if (!/^sha256:[a-f0-9]{64}$/.test(approvedHash)) throw new Error('Exact Terraform teardown review required');
  await savedIntent(runtime.store, intent);
  const release = await acquireProcessLock(join8(runtime.store.directory, '.gcp-deployment-lock'));
  try {
    const plan = await runtime.store.read(`gcp-tf-reviewed-${approvedHash.slice(7)}.json`);
    const { planHash, ...body } = plan;
    if (
      plan.schemaVersion !== 1 ||
      plan.operation !== 'teardown' ||
      plan.engine !== 'terraform' ||
      planHash !== approvedHash ||
      fingerprint(body) !== approvedHash ||
      plan.intentFingerprint !== fingerprint(intent) ||
      fingerprint(plan.apiRelease) !== fingerprint(contract.release) ||
      plan.policyReceipt.normalizedSha256 !== policy.normalizedSha256
    )
      throw new Error('Reviewed Terraform teardown binding differs');
    const resources = await readGcpResourceInventory(runtime.store, intent);
    assertGcpTeardownTopology(intent, resources);
    if (fingerprint(resources) !== fingerprint(plan.resources))
      throw new Error('Reviewed Terraform teardown ledger changed');
    const original = await platformIdentity(runtime, intent, contract);
    if (fingerprint(original.observation) !== fingerprint(plan.platform))
      throw new Error('Reviewed Terraform Platform ledger changed');
    const checkpointName = `gcp-tf-authorized-${approvedHash.slice(7)}.json`;
    let checkpoint;
    try {
      checkpoint = await runtime.store.read(checkpointName);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const age = Date.now() - Date.parse(plan.createdAt);
    if (
      checkpoint
        ? checkpoint.planHash !== approvedHash || !['submitting', 'applied', 'absent'].includes(checkpoint.state)
        : !Number.isFinite(age) || age < 0 || age > 5 * 60000
    )
      throw new Error('Terraform teardown authorization differs or review stale');
    let absence = await observe(runtime, intent, resources, plan.platform, signal);
    const allAbsent = () => absence.cloudAbsent === resources.length && absence.siteAbsent && absence.tokenAbsent;
    if (!checkpoint) {
      if (absence.cloudAbsent || absence.siteAbsent || absence.tokenAbsent)
        throw new Error('Initial approved destroy requires complete live inventory');
      assertGcpTerraformOwnedTransition(intent, plan.savedPlan, 'teardown', gcpTerraformResourceAddresses(intent));
      if ((await projectSavedPlan(runtime, intent, plan.savedPlan, resources, signal)) !== plan.projectionHash)
        throw new Error('Saved destroy ownership projection changed');
      checkpoint = { planHash: approvedHash, state: 'submitting' };
      await runtime.store.write(checkpointName, checkpoint);
      onMutation?.();
      await runtime.session.apply(plan.savedPlan, runtime.environment, signal);
      checkpoint.state = 'applied';
      await runtime.store.write(checkpointName, checkpoint);
      absence = await observe(runtime, intent, resources, plan.platform, signal);
    } else if (checkpoint.state === 'absent' && !allAbsent()) throw new Error('Deleted Terraform resources reappeared');
    if (!allAbsent()) return { state: 'pending', planHash: approvedHash, phase: 'independent-absence' };
    const evidenceHash = fingerprint({ planHash: approvedHash, absence });
    await runtime.store.write(`gcp-tf-outcome-${approvedHash.slice(7)}.json`, {
      planHash: approvedHash,
      evidenceHash,
      absence,
    });
    if (checkpoint.state === 'submitting')
      await runtime.session.reconcileApplyFromEvidence(plan.savedPlan, evidenceHash.slice(7));
    checkpoint.state = 'absent';
    await runtime.store.write(checkpointName, checkpoint);
    const finalPlan = await runtime.session.planDestroy(runtime.environment, signal);
    if (
      !finalPlan.noChanges ||
      finalPlan.changes.length ||
      finalPlan.operation !== 'destroy' ||
      finalPlan.actionInvocations?.length ||
      finalPlan.engine !== 'terraform' ||
      finalPlan.deploymentId !== intent.deploymentName ||
      finalPlan.backendIdentity !== plan.savedPlan.backendIdentity ||
      finalPlan.configurationSha256 !== plan.savedPlan.configurationSha256 ||
      finalPlan.providerLockSha256 !== plan.savedPlan.providerLockSha256
    )
      throw new Error('Final Terraform destroy reconciliation is not empty/current');
    absence = await observe(runtime, intent, resources, plan.platform, signal);
    if (!allAbsent()) throw new Error('Independent Terraform absence changed during final reconciliation');
    const evidence = {
      schemaVersion: 1,
      engine: 'terraform',
      state: 'done',
      planHash: approvedHash,
      absence,
      finalPlanSha256: finalPlan.planSha256,
      observedAt: new Date().toISOString(),
    };
    await runtime.store.write(`gcp-tf-evidence-${approvedHash.slice(7)}.json`, evidence);
    return evidence;
  } finally {
    await release();
  }
}
var init_terraform_teardown = __esm(() => {
  init_process_lock();
  init_deployment_teardown();
  init_discovery();
  init_ownership();
  init_terraform_admission();
});

// plugins/gcloud/src/ce/terraform-public-teardown.ts
import { join as join9 } from 'node:path';

async function verifyPublicTerraformLiveOwnership(runtime, intent, owned, signal, allowAbsent = true) {
  if (
    owned.schemaVersion !== 2 ||
    owned.intentFingerprint !== fingerprint(intent) ||
    new Set(owned.addresses).size !== owned.addresses.length ||
    owned.addresses.some((a) => !publicTerraformAddresses(intent).includes(a))
  )
    throw new Error('Original Terraform ownership binding differs');
  const absent = [];
  const addresses = publicTerraformAddresses(intent),
    scope = publicTerraformCloudScope(intent);
  for (let n = 0; n < scope.length; n++) {
    const original = owned.resources.find((resource) => resource.selfLink === scope[n].selfLink);
    const live = await observeGcpTeardownResource(runtime.api, scope[n], signal);
    if (live ? !original || original.id !== live.id || original.selfLink !== live.selfLink : !!original && !allowAbsent)
      throw new Error('Original cloud identity replaced or unavailable');
    if (!live) absent.push(addresses[n]);
  }
  for (const { address, absent: isAbsent, hash } of await observePublicTerraformPlatform(runtime, intent, signal)) {
    if (
      isAbsent
        ? !!owned.platform[address] && !allowAbsent
        : !owned.platform[address] || hash !== owned.platform[address]
    )
      throw new Error('Original XC identity replaced or unavailable');
    if (isAbsent) absent.push(address);
  }
  return absent;
}
async function stableState(runtime) {
  if (!runtime.session.readStateIdentity) throw new Error('Stable owning state binding unavailable');
  return runtime.session.readStateIdentity();
}
async function ownership(runtime, intent) {
  const original = await runtime.store.read('gcp-tf-deploy-original-authorization.json');
  const owned = await runtime.store.read('gcp-tf-public-ownership.json');
  const journal = await runtime.store.read('gcp-tf-public-deployment.json');
  if (
    original.intentFingerprint !== fingerprint(intent) ||
    owned.intentFingerprint !== fingerprint(intent) ||
    owned.receiptFingerprint !== original.receiptFingerprint ||
    journal.planHash !== original.planHash ||
    journal.receiptFingerprint !== original.receiptFingerprint ||
    !['completed', 'partial'].includes(journal.phase)
  )
    throw new Error('Reconciled original creation subset required for cleanup');
  return { original, owned };
}
function assertDeleteOnly(intent, receipt, addresses) {
  if (!addresses.length) {
    if (
      !receipt.noChanges ||
      receipt.changes.length ||
      receipt.operation !== 'destroy' ||
      receipt.actionInvocations?.length
    )
      throw new Error('Expected empty destroy plan');
  } else assertGcpTerraformOwnedTransition(intent, receipt, 'teardown', addresses);
}
function assertFinalDestroy(intent, original, final) {
  assertDeleteOnly(intent, final, []);
  if (
    final.engine !== 'terraform' ||
    final.deploymentId !== intent.deploymentName ||
    final.backendIdentity !== original.backendIdentity ||
    final.configurationSha256 !== original.configurationSha256 ||
    final.providerLockSha256 !== original.providerLockSha256
  )
    throw new Error('Final empty destroy ownership binding differs');
}
async function projectDestroy(runtime, intent, receipt, owned, absent, signal) {
  const selections = publicTerraformSelections(intent);
  const fields = await runtime.session.readPlannedResourceFields(receipt, selections, runtime.environment, signal);
  if (fingerprint(Object.keys(fields).sort()) !== fingerprint(Object.keys(selections).sort()))
    throw new Error('Destroy projection escaped owning configuration');
  const remaining = [];
  for (const [address, value] of Object.entries(fields)) {
    if (!value) {
      if (!absent.includes(address)) throw new Error('Live object is missing from owning state');
      continue;
    }
    if (
      absent.includes(address) ||
      !owned.addresses.includes(address) ||
      fingerprint(Object.keys(value).sort()) !== fingerprint(selections[address].slice().sort())
    )
      throw new Error('Destroy projection contains absent, foreign or sensitive identity');
    if (address.startsWith('xcsh_')) {
      const binding = publicTerraformPlatformScope(intent).find((row) => row.address === address);
      const tokenName = binding && 'tokenName' in binding ? binding.tokenName : undefined;
      if (
        !binding ||
        value.creation_identity_sha256 !== owned.platform[address] ||
        value.namespace !== 'system' ||
        value.name !== (tokenName ?? binding.siteName) ||
        (tokenName && value.site_name !== binding.siteName)
      )
        throw new Error('Destroy XC original identity differs');
    } else {
      const resource = owned.resources.find((r) => r.selfLink === value.self_link);
      const field = address.startsWith('google_compute_instance.')
        ? 'instance_id'
        : address.startsWith('google_compute_disk.')
          ? 'disk_id'
          : address.startsWith('google_compute_network.')
            ? 'numeric_id'
            : address.startsWith('google_compute_firewall.')
              ? 'firewall_id'
              : 'subnetwork_id';
      if (resource && address.startsWith('google_compute_firewall.'))
        await assertOriginalFirewallInsert(runtime, intent, value, resource.id, signal);
      if (
        !resource ||
        (address.startsWith('google_compute_firewall.') ? false : String(value[field]) !== resource.id) ||
        value.project !== intent.project ||
        value.name !== resource.selfLink.split('/').at(-1)
      )
        throw new Error('Destroy cloud original identity differs');
    }
    remaining.push(address);
  }
  assertDeleteOnly(intent, receipt, remaining);
  return { remaining, projectionHash: fingerprint(fields) };
}
async function planPublicTerraformTeardown(runtime, intent, contract, policy, signal) {
  assertGcpTeardownProfile(intent, contract, 'terraform');
  await assertPublicTerraformContext(runtime, intent);
  assertGcpTeardownPolicyFresh(policy);
  const release = await acquireProcessLock(join9(runtime.store.directory, '.gcp-deployment-lock'));
  try {
    const { original, owned } = await ownership(runtime, intent);
    const absent = await verifyPublicTerraformLiveOwnership(runtime, intent, owned, signal);
    const before = await stableState(runtime);
    if (before.lineage !== owned.state.lineage || before.serial < owned.state.serial)
      throw new Error('Foreign or rolled-back cleanup state');
    const receipt = await runtime.session.planDestroy(runtime.environment, signal);
    const projection = await projectDestroy(runtime, intent, receipt, owned, absent, signal);
    const state = await stableState(runtime);
    if (state.lineage !== before.lineage || state.serial < before.serial)
      throw new Error('Cleanup state lineage changed');
    const body = {
      schemaVersion: 2,
      operation: 'teardown',
      engine: 'terraform',
      intentFingerprint: fingerprint(intent),
      apiRelease: contract.release,
      ...(intent.sites[0].nodes.length === 3
        ? { lifecycleFingerprint: gcpDeploymentLifecycleFingerprint(intent, contract) }
        : {}),
      policyReceipt: policy,
      originalAuthorization: original,
      ownershipHash: fingerprint(owned),
      state,
      savedPlan: receipt,
      ...projection,
      createdAt: new Date().toISOString(),
    };
    const plan = { ...body, planHash: fingerprint(body) };
    await runtime.store.write(`gcp-tf-public-cleanup-reviewed-${plan.planHash.slice(7)}.json`, plan);
    return plan;
  } finally {
    await release();
  }
}
async function applyPublicTerraformTeardown(runtime, intent, contract, policy, approvedHash, signal, onMutation) {
  assertGcpTeardownProfile(intent, contract, 'terraform');
  await assertPublicTerraformContext(runtime, intent);
  assertGcpTeardownPolicyFresh(policy);
  if (!/^sha256:[a-f0-9]{64}$/.test(approvedHash)) throw new Error('Exact cleanup review required');
  const release = await acquireProcessLock(join9(runtime.store.directory, '.gcp-deployment-lock'));
  try {
    const plan = await runtime.store.read(`gcp-tf-public-cleanup-reviewed-${approvedHash.slice(7)}.json`);
    const { planHash, ...body } = plan;
    if (
      plan.schemaVersion !== 2 ||
      plan.operation !== 'teardown' ||
      plan.engine !== 'terraform' ||
      planHash !== approvedHash ||
      fingerprint(body) !== approvedHash ||
      plan.intentFingerprint !== fingerprint(intent) ||
      fingerprint(plan.apiRelease) !== fingerprint(contract.release) ||
      plan.lifecycleFingerprint !==
        (intent.sites[0].nodes.length === 3 ? gcpDeploymentLifecycleFingerprint(intent, contract) : undefined) ||
      plan.policyReceipt.normalizedSha256 !== policy.normalizedSha256
    )
      throw new Error('Reviewed cleanup binding changed');
    const { original, owned } = await ownership(runtime, intent);
    if (fingerprint(original) !== fingerprint(plan.originalAuthorization) || fingerprint(owned) !== plan.ownershipHash)
      throw new Error('Original cleanup attempt changed');
    const name = `gcp-tf-public-cleanup-authorized-${approvedHash.slice(7)}.json`;
    let journal = await readOptional(runtime, name);
    if (
      journal &&
      (journal.planHash !== approvedHash || !['authorized', 'submitting', 'applied', 'absent'].includes(journal.phase))
    )
      throw new Error('Cleanup authorization changed');
    let absent = await verifyPublicTerraformLiveOwnership(runtime, intent, owned, signal);
    if (!journal) {
      const age = Date.now() - Date.parse(plan.createdAt);
      if (!Number.isFinite(age) || age < 0 || age > 300000) throw new Error('Initial cleanup review is stale');
      if (fingerprint(await stableState(runtime)) !== fingerprint(plan.state))
        throw new Error('Reviewed stable cleanup state changed');
      const projection = await projectDestroy(runtime, intent, plan.savedPlan, owned, absent, signal);
      if (
        projection.projectionHash !== plan.projectionHash ||
        fingerprint(projection.remaining) !== fingerprint(plan.remaining)
      )
        throw new Error('Reviewed delete projection changed');
      journal = { planHash: approvedHash, phase: 'authorized' };
      await runtime.store.write(name, journal);
    }
    if (['authorized', 'submitting'].includes(journal.phase)) {
      if (plan.remaining.length) {
        if (!runtime.session.readApplyCheckpoint) throw new Error('Executor/checkpoint inspection unavailable');
        const checkpoint = await runtime.session.readApplyCheckpoint(plan.savedPlan);
        if (checkpoint.state === 'planned') {
          if (fingerprint(await stableState(runtime)) !== fingerprint(plan.state))
            throw new Error('Authorized cleanup state changed before submission');
          journal.phase = 'submitting';
          await runtime.store.write(name, journal);
          signal?.throwIfAborted();
          onMutation?.();
          try {
            await runtime.session.apply(plan.savedPlan, runtime.environment, signal);
          } catch {
            signal?.throwIfAborted();
          }
        }
      }
      absent = await verifyPublicTerraformLiveOwnership(runtime, intent, owned, signal);
      if (absent.length !== publicTerraformAddresses(intent).length)
        return {
          state: 'reconciliation-required',
          phase: 'partial-cleanup',
          planHash: approvedHash,
          engine: 'terraform',
          reconciliation: 'new-delete-only-review-required',
        };
      if (plan.remaining.length) {
        const checkpoint = await runtime.session.readApplyCheckpoint?.(plan.savedPlan);
        if (!checkpoint) throw new Error('Original cleanup checkpoint unavailable');
        if (checkpoint.state === 'applying')
          await runtime.session.reconcileApplyFromEvidence(
            plan.savedPlan,
            fingerprint({ planHash: approvedHash, absent }).slice(7),
          );
        else if (checkpoint.state !== 'applied') throw new Error('Unsubmitted cleanup cannot be attested');
      }
      journal.phase = 'applied';
      await runtime.store.write(name, journal);
    }
    if (absent.length !== publicTerraformAddresses(intent).length)
      throw new Error('Resources reappeared after cleanup');
    if (journal.phase !== 'absent') {
      const before = await stableState(runtime);
      const finalPlan = await runtime.session.planDestroy(runtime.environment, signal);
      assertFinalDestroy(intent, plan.savedPlan, finalPlan);
      const finalState = await stableState(runtime);
      if (fingerprint(before) !== fingerprint(finalState))
        throw new Error('Final empty destroy state changed during verification');
      const after = await verifyPublicTerraformLiveOwnership(runtime, intent, owned, signal);
      if (after.length !== publicTerraformAddresses(intent).length) throw new Error('Independent absence changed');
      journal = { ...journal, phase: 'absent', finalPlan, finalState };
      await runtime.store.write(name, journal);
    }
    if (!journal.finalPlan) throw new Error('Final empty destroy receipt unavailable');
    assertFinalDestroy(intent, plan.savedPlan, journal.finalPlan);
    if (!journal.finalState || fingerprint(journal.finalState) !== fingerprint(await stableState(runtime)))
      throw new Error('Final empty destroy state binding changed');
    return {
      schemaVersion: 2,
      engine: 'terraform',
      state: 'done',
      phase: 'independent-absence',
      planHash: approvedHash,
      absentObjects: absent.length,
      finalPlanSha256: journal.finalPlan?.planSha256,
    };
  } finally {
    await release();
  }
}
var init_terraform_public_teardown = __esm(() => {
  init_process_lock();
  init_deployment_teardown();
  init_discovery();
  init_terraform_context();
  init_terraform_ha_profile();
  init_terraform_public();
  init_terraform_public_ownership();
  init_terraform_teardown();
});

// plugins/gcloud/src/ce/terraform-public.ts
import { join as join10 } from 'node:path';

async function readOptional(runtime, name) {
  try {
    return await runtime.store.read(name);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}
async function sessionBinding(runtime, intent, boundary) {
  const saved = await runtime.store.read('gcp-terraform-session-inputs.json');
  const identity = await runtime.store.read('gcp-terraform-input-identity.json');
  if (
    saved.schemaVersion !== 1 ||
    saved.inputs?.configurationVersion !== 2 ||
    intent.engine !== 'terraform' ||
    fingerprint(saved.inputs.intent) !== fingerprint(intent) ||
    fingerprint(identity.intent) !== fingerprint(intent) ||
    identity.intentFingerprint !== fingerprint(intent) ||
    identity.platformContext !== intent.platformContext ||
    saved.inputs.expectedLockSha256 !== identity.providerLockSha256 ||
    !runtime.session.readConfigurationSha256
  )
    throw new Error('Original public Terraform input binding differs');
  if (intent.sites[0].nodes.length === 3) {
    const profile = assertGcpTerraformHaProfile(intent, boundary);
    if (
      fingerprint(saved.inputs.versions) !== fingerprint(profile.versions) ||
      saved.inputs.expectedLockSha256 !== profile.providerLockSha256
    )
      throw new Error('Qualified Terraform HA provider versions or lock differ');
  }
  return {
    platformContextHash: await assertPublicTerraformContext(runtime, intent),
    inputHash: fingerprint(saved),
    configurationSha256: await runtime.session.readConfigurationSha256(),
    providerLockSha256: saved.inputs.expectedLockSha256.slice(7),
    versions: saved.inputs.versions,
  };
}
async function planPublicTerraformDeployment(runtime, platform, intent, sources, signal) {
  intent = structuredClone(intent);
  const current = await collectGcpDeploymentPrerequisites(platform, intent, sources, signal, false, 'terraform');
  const release = await acquireProcessLock(join10(runtime.store.directory, '.gcp-deployment-lock'));
  try {
    if (await readOptional(runtime, 'gcp-tf-deploy-original-authorization.json'))
      throw new Error('Deployment must resume its original authorization');
    await verifyPublicTerraformLiveOwnership(
      runtime,
      intent,
      {
        schemaVersion: 2,
        intentFingerprint: fingerprint(intent),
        receiptFingerprint: '',
        state: { sha256: '', lineage: '', serial: 0 },
        projectionHash: '',
        addresses: [],
        resources: [],
        platform: {},
        complete: false,
      },
      signal,
    );
    const binding = await sessionBinding(runtime, intent, current.boundary);
    const receipt = await runtime.session.plan(runtime.environment, signal);
    assertGcpTerraformOwnedTransition(intent, receipt, 'deploy', publicTerraformAddresses(intent));
    if (
      receipt.configurationSha256 !== binding.configurationSha256 ||
      receipt.providerLockSha256 !== binding.providerLockSha256
    )
      throw new Error('Saved-plan configuration/lock differs');
    const body = {
      schemaVersion: 2,
      operation: 'deploy',
      engine: 'terraform',
      intentFingerprint: fingerprint(intent),
      platformContext: intent.platformContext,
      apiRelease: current.boundary.release,
      contractFingerprint: current.boundary.fingerprint,
      lifecycleFingerprint: gcpDeploymentLifecycleFingerprint(intent, current.boundary),
      ...(intent.sites[0].nodes.length === 3
        ? {
            operationalContractFingerprint: current.boundary.operationalHealthContract?.contractFingerprint,
            operationalQualificationFingerprint: current.boundary.operationalHealthContract?.qualificationFingerprint,
          }
        : {}),
      policyReceipt: current.policy,
      funding: fundingBinding(current.funding),
      byolAuthorizationHash: current.byol.authorizationHash,
      discoveryFingerprint: fingerprint(current.discovery),
      preflight: current.preflight,
      binding,
      savedPlan: receipt,
      createdAt: new Date().toISOString(),
      approval: 'required',
    };
    const plan = { ...body, planHash: fingerprint(body) };
    await runtime.store.write(`gcp-tf-deploy-reviewed-${plan.planHash.slice(7)}.json`, plan);
    return plan;
  } finally {
    await release();
  }
}
function publicResult(journal, ownership) {
  const phase = journal.completionReconciliation ? 'reconciliation-required' : journal.phase;
  return {
    schemaVersion: 2,
    engine: 'terraform',
    planHash: journal.planHash,
    state: phase === 'completed' ? 'done' : phase === 'partial' ? 'partial' : 'reconciliation-required',
    phase,
    cloudProvisioning: phase === 'completed' ? 'created' : 'incomplete',
    ...(ownership ? { ownedObjects: ownership.addresses.length, ownershipHash: fingerprint(ownership) } : {}),
    ...(journal.followUp ? { finalPlanSha256: journal.followUp.planSha256 } : {}),
    registration: 'unknown',
    physicalInterfaceIdentity: 'unknown',
    platformHealth: 'unknown',
    routing: 'unknown',
    applicationTraffic: 'unknown',
    ...(phase === 'partial'
      ? { cleanup: 'separate-delete-only-review-required' }
      : phase !== 'completed'
        ? { reconciliation: 'original-attempt-inspection-required' }
        : {}),
  };
}
function assertPublicTerraformNoChange(intent, original, followUp) {
  if (
    !followUp.noChanges ||
    followUp.engine !== 'terraform' ||
    followUp.deploymentId !== intent.deploymentName ||
    followUp.backendIdentity !== original.backendIdentity ||
    followUp.configurationSha256 !== original.configurationSha256 ||
    followUp.providerLockSha256 !== original.providerLockSha256 ||
    followUp.operation ||
    followUp.actionInvocations?.length ||
    followUp.changes.some((c) => c.actions.join(',') !== 'no-op') ||
    fingerprint(followUp.changes.map((c) => c.address).sort()) !== fingerprint(publicTerraformAddresses(intent).sort())
  )
    throw new Error('Follow-up Terraform plan is not an exact no-op');
}
async function applyPublicTerraformDeployment(runtime, platform, intent, approvedHash, sources, signal, onMutation) {
  intent = structuredClone(intent);
  signal?.throwIfAborted();
  if (!/^sha256:[a-f0-9]{64}$/.test(approvedHash)) throw new Error('Exact Terraform deployment review required');
  const boundary = await sources.contract(signal);
  assertGcpTeardownProfile(intent, boundary, 'terraform');
  const release = await acquireProcessLock(join10(runtime.store.directory, '.gcp-deployment-lock'));
  try {
    const plan = await runtime.store.read(`gcp-tf-deploy-reviewed-${approvedHash.slice(7)}.json`);
    const { planHash, ...body } = plan;
    if (
      plan.schemaVersion !== 2 ||
      plan.engine !== 'terraform' ||
      plan.operation !== 'deploy' ||
      planHash !== approvedHash ||
      fingerprint(body) !== approvedHash ||
      plan.intentFingerprint !== fingerprint(intent) ||
      plan.platformContext !== intent.platformContext ||
      fingerprint(plan.apiRelease) !== fingerprint(boundary.release) ||
      plan.contractFingerprint !== boundary.fingerprint ||
      plan.lifecycleFingerprint !== gcpDeploymentLifecycleFingerprint(intent, boundary) ||
      plan.operationalContractFingerprint !==
        (intent.sites[0].nodes.length === 3 ? boundary.operationalHealthContract?.contractFingerprint : undefined) ||
      plan.operationalQualificationFingerprint !==
        (intent.sites[0].nodes.length === 3
          ? boundary.operationalHealthContract?.qualificationFingerprint
          : undefined) ||
      fingerprint(plan.binding) !== fingerprint(await sessionBinding(runtime, intent, boundary))
    )
      throw new Error('Reviewed Terraform deployment bindings changed');
    assertGcpTerraformOwnedTransition(intent, plan.savedPlan, 'deploy', publicTerraformAddresses(intent));
    const original = await readOptional(runtime, 'gcp-tf-deploy-original-authorization.json');
    const authorization = {
      planHash: approvedHash,
      receiptFingerprint: fingerprint(plan.savedPlan),
      intentFingerprint: fingerprint(intent),
    };
    if (original && fingerprint(original) !== fingerprint(authorization))
      throw new Error('Original Terraform authorization differs');
    let journal = await readOptional(runtime, 'gcp-tf-public-deployment.json');
    if (
      journal &&
      (!original ||
        journal.schemaVersion !== 2 ||
        journal.planHash !== approvedHash ||
        journal.receiptFingerprint !== authorization.receiptFingerprint)
    )
      throw new Error('Original Terraform deployment journal differs');
    if (
      plan.savedPlan.configurationSha256 !== plan.binding.configurationSha256 ||
      plan.savedPlan.providerLockSha256 !== plan.binding.providerLockSha256
    )
      throw new Error('Reviewed saved binary bindings differ');
    if (!original) {
      if (
        !runtime.session.readApplyCheckpoint ||
        (await runtime.session.readApplyCheckpoint(plan.savedPlan)).state !== 'planned'
      )
        throw new Error('Initial saved plan is not unsubmitted');
    }
    if (!original) {
      const age = Date.now() - Date.parse(plan.createdAt);
      if (!Number.isFinite(age) || age < 0 || age > 300000) throw new Error('Initial Terraform review is stale');
    }
    const current = await collectGcpDeploymentPrerequisites(platform, intent, sources, signal, !!original, 'terraform');
    if (
      current.policy.normalizedSha256 !== plan.policyReceipt.normalizedSha256 ||
      fingerprint(fundingBinding(current.funding)) !== fingerprint(plan.funding) ||
      current.byol.authorizationHash !== plan.byolAuthorizationHash ||
      current.boundary.fingerprint !== plan.contractFingerprint ||
      gcpDeploymentLifecycleFingerprint(intent, current.boundary) !== plan.lifecycleFingerprint
    )
      throw new Error('Reviewed prerequisites/funding/BYOL changed');
    signal?.throwIfAborted();
    if (!original) {
      const age = Date.now() - Date.parse(plan.createdAt);
      if (!Number.isFinite(age) || age < 0 || age > 300000)
        throw new Error('Initial Terraform review expired during qualification');
      await runtime.store.write('gcp-tf-deploy-original-authorization.json', authorization);
    }
    journal ??= {
      schemaVersion: 2,
      planHash: approvedHash,
      receiptFingerprint: authorization.receiptFingerprint,
      phase: 'authorized',
    };
    await runtime.store.write('gcp-tf-public-deployment.json', journal);
    let ownership = await readOptional(runtime, 'gcp-tf-public-ownership.json');
    if (journal.phase === 'completed') {
      try {
        if (!ownership?.complete || !journal.followUp || !journal.finalState || !runtime.session.readStateIdentity)
          throw new Error('Completed Terraform evidence missing');
        assertPublicTerraformNoChange(intent, plan.savedPlan, journal.followUp);
        if (fingerprint(journal.finalState) !== fingerprint(await runtime.session.readStateIdentity()))
          throw new Error('Completed Terraform state binding changed');
        await verifyPublicTerraformLiveOwnership(runtime, intent, ownership, signal, false);
        delete journal.completionReconciliation;
      } catch {
        signal?.throwIfAborted();
        journal.completionReconciliation = true;
      }
      await runtime.store.write('gcp-tf-public-deployment.json', journal);
      return publicResult(journal, ownership);
    }
    try {
      if (journal.phase !== 'reconciling') {
        if (!runtime.session.readApplyCheckpoint)
          throw new Error('Original executor/checkpoint inspection unavailable');
        const checkpoint = await runtime.session.readApplyCheckpoint(plan.savedPlan);
        if (checkpoint.state === 'planned') {
          if (!['authorized', 'submitting'].includes(journal.phase))
            throw new Error('Consumed submission reverted to planned');
          journal.phase = 'submitting';
          await runtime.store.write('gcp-tf-public-deployment.json', journal);
          signal?.throwIfAborted();
          onMutation?.();
          try {
            await runtime.session.apply(plan.savedPlan, runtime.environment, signal);
          } catch {
            signal?.throwIfAborted();
          }
          const submitted = await runtime.session.readApplyCheckpoint(plan.savedPlan);
          if (submitted.state === 'planned') return publicResult(journal);
        }
        journal.phase = 'inspecting';
        await runtime.store.write('gcp-tf-public-deployment.json', journal);
        const inspected = await inspectPublicTerraformOwnership(runtime, intent, plan.savedPlan, signal);
        if (ownership && fingerprint(ownership) !== fingerprint(inspected))
          throw new Error('Original ownership snapshot changed');
        ownership = inspected;
        await runtime.store.write('gcp-tf-public-ownership.json', ownership);
        for (const resource of ownership.resources) await recordGcpResource(runtime.store, resource);
        if (!ownership.complete) {
          journal.phase = 'partial';
          await runtime.store.write('gcp-tf-public-deployment.json', journal);
          return publicResult(journal, ownership);
        }
        journal.phase = 'ownership-captured';
        await runtime.store.write('gcp-tf-public-deployment.json', journal);
        const applied = await runtime.session.readApplyCheckpoint(plan.savedPlan);
        if (applied.state === 'applying')
          await runtime.session.reconcileApplyFromEvidence(plan.savedPlan, fingerprint(ownership).slice(7));
        journal.phase = 'reconciling';
        await runtime.store.write('gcp-tf-public-deployment.json', journal);
      }
      if (!ownership?.complete) throw new Error('Complete ownership evidence required before follow-up');
      await verifyPublicTerraformLiveOwnership(runtime, intent, ownership, signal, false);
      if (!runtime.session.readStateIdentity) throw new Error('Stable owning state binding unavailable');
      const before = await runtime.session.readStateIdentity();
      if (before.lineage !== ownership.state.lineage || before.serial < ownership.state.serial)
        throw new Error('Foreign or rolled-back completion state');
      journal.followUp = await runtime.session.plan(runtime.environment, signal);
      assertPublicTerraformNoChange(intent, plan.savedPlan, journal.followUp);
      const finalState = await runtime.session.readStateIdentity();
      if (fingerprint(before) !== fingerprint(finalState))
        throw new Error('Completion state changed during no-op verification');
      await verifyPublicTerraformLiveOwnership(runtime, intent, ownership, signal, false);
      journal.finalState = finalState;
      journal.phase = 'completed';
      await runtime.store.write('gcp-tf-public-deployment.json', journal);
      return publicResult(journal, ownership);
    } catch (_error) {
      signal?.throwIfAborted();
      if (journal.phase !== 'reconciling') journal.phase = 'reconciliation-required';
      await runtime.store.write('gcp-tf-public-deployment.json', journal);
      return publicResult(journal);
    }
  } finally {
    await release();
  }
}
var init_terraform_public = __esm(() => {
  init_process_lock();
  init_deployment_review();
  init_deployment_teardown();
  init_discovery();
  init_ownership();
  init_terraform_context();
  init_terraform_ha_profile();
  init_terraform_public_ownership();
  init_terraform_public_teardown();
  init_terraform_teardown();
});

// plugins/gcloud/src/ce/terraform-public-artifacts.ts
var GCP_PUBLIC_TERRAFORM_ARTIFACTS;
var init_terraform_public_artifacts = __esm(() => {
  GCP_PUBLIC_TERRAFORM_ARTIFACTS = {
    configurationVersion: 2,
    versions: {
      terraform: '1.16.6',
      google: '8.7.0',
      xcsh: '15.13.0',
    },
    providerLock: `# This file is maintained automatically by "terraform init".
# Manual edits may be lost in future updates.

provider "registry.terraform.io/f5-sales-demo/xcsh" {
  version     = "15.13.0"
  constraints = "15.13.0"
  hashes = [
    "h1:CfB9Clvh4C1I4QucrCtv6YqlvX9Z6E5P3V6iBT2W9uE=",
    "h1:jFFVz1Mu+WqOMqYT48AcDSfm2MdFOkb78bJA86Sc/+c=",
    "zh:14f1155c9403858e0b158d44f318ec44863060c9d5db7559cbcceef5d006a424",
    "zh:1c5c910f9f307811dc89467e1abd8bb377daabb096718a9f6e85e03592bbfe58",
    "zh:3b24ef444843b72c3eaf9837a45705a3fbc0aad16e7fa86391f7e9ea7bc4dbb9",
    "zh:3bff1de417cf0509b5c25588f87ecce347d85cd5e05cd1a4ce2ba5ec4f259df7",
    "zh:52d065e9f92683a7bf6e8233f6fd0723af8a40264e57d9e35f58b1b46e44eb4b",
    "zh:575471e9607e67bb6c923c070ae9995ddd497ff8ae9730fad4974e0c1f095f5b",
    "zh:604a529d3df49d8488b998ee2480ef1db711ca7fccb9b99235d49e63410f9853",
    "zh:81fccfac3658c324c36b5102d5c5e18389f957ef2b50c841a59cb42fb5d48f43",
    "zh:9386d0ec3d5b0c4ab63f6c27e791bb24578f8ead9e8fe66f51b8c384acab3fed",
    "zh:95513584b227b9c7923e641aae986935821077b1eb4116845b5312ac412bbc72",
    "zh:c21b6380b084455a5e47040e5ec3df6cc0ae51cfd502e7b22038d4925b970697",
  ]
}

provider "registry.terraform.io/hashicorp/google" {
  version     = "8.7.0"
  constraints = "8.7.0"
  hashes = [
    "h1:r0evOKSNhYYj04qb6VCTVtm7/uWr67jMZ2TsgLubk6o=",
    "h1:vCPO1IbM2/WfU4R3QYtzxIyM5ZLYL0pgDS8bmap20hI=",
    "zh:087771b1c22126084ec1ac26272f7e0bce1030bedd9d692b6eef38e6baf5db2e",
    "zh:4e075872421717124f1a059f80a9cd2a742e868e94ee74546e52494a02f656d2",
    "zh:5024e53d378a551d354244db25085c2db530dfdd7bdbd3a3df03abdc957a8a20",
    "zh:52dd649ad0c39f51bf39218e896ced370d4c56d65876715b6c12e2ac17f16f71",
    "zh:70d6c8f5371a354f8265fe4f2c279e0c2f6a06054538dbe2d92e428692192439",
    "zh:7aceb5fe517d2dbd270644663a2b237fc3be3e06577a40d2009983b5a5088fcd",
    "zh:bb3a6fd8f472080f3199e57e61cbbdd253c8210b2b70e6c4e30e06b08c39e7de",
    "zh:cbd1a1de219397ba98f17203751300433766f5c36953e6aece4a1fb1817638a9",
    "zh:d12886e54a30e3b6f174f879777616401f8749466443bc6db870eddd42985fa7",
    "zh:d58a84d3a387c78e8ac58b200ceb51a3e332105a11420f33e03aa69b3ec4449f",
    "zh:ed11511bc8ee66fbe2d0e6b59f694c127f140cba7ea9654e332c3ebfbdf8bea9",
    "zh:f569b65999264a9416862bca5cd2a6177d94ccb0424f3a4ef424428912b9cb3c",
  ]
}
`,
    expectedLockSha256: 'sha256:6d7c7b6c9f2d2c0ca301e7c845b893b07722149b0bc6853f6058d5f27a28050a',
  };
});

// plugins/terraform/src/failure.ts
function terraformFailureCategories(text) {
  const plain = Bun.stripANSI(text);
  return patterns.filter(([, pattern]) => pattern.test(plain)).map(([category]) => category);
}
var patterns, TerraformCommandError;
var init_failure = __esm(() => {
  patterns = [
    ['capacity', /\bInsufficientInstanceCapacity\b/],
    ['quota', /\bVpcLimitExceeded\b/],
    ['authorization', /\b(?:AccessDenied|AccessDeniedException|UnauthorizedOperation|AuthorizationFailed)\b/],
    ['expired', /\b(?:ExpiredToken|ExpiredTokenException|AuthenticationTokenExpired)\b/],
    ['throttled', /\b(?:Throttling|ThrottlingException|RequestLimitExceeded|TooManyRequests)\b/],
    [
      'configuration',
      /(?:Error: (?:Missing block label|Unsupported argument|Invalid expression|Invalid reference)|"summary"\s*:\s*"(?:Missing block label|Unsupported argument|Invalid expression|Invalid reference)")/,
    ],
    ['state-lock', /Error (?:acquiring|releasing) the state lock/],
  ];
  TerraformCommandError = class TerraformCommandError extends Error {
    operation;
    exitCode;
    category;
    constructor(operation, exitCode, category = 'unknown') {
      const safe = category === 'unknown' || patterns.some(([value]) => value === category) ? category : 'unknown';
      super(`Terraform ${operation} failed (${safe}); exit code ${exitCode}`);
      this.operation = operation;
      this.exitCode = exitCode;
      this.name = 'TerraformCommandError';
      this.category = safe;
    }
  };
});

// plugins/terraform/src/runner.ts
import { createHash as createHash7, randomUUID as randomUUID2 } from 'node:crypto';
import {
  chmod,
  lstat as lstat5,
  mkdir as mkdir3,
  readFile as readFile3,
  realpath as realpath3,
  rename as rename2,
  rm as rm3,
  writeFile as writeFile3,
} from 'node:fs/promises';
import { isAbsolute as isAbsolute2, join as join11, resolve } from 'node:path';

function object5(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Terraform JSON object is malformed');
  return value;
}
function decode(value) {
  try {
    return object5(
      JSON.parse(value, (_key, parsed, context) => {
        if (typeof parsed === 'number' && Number.isInteger(parsed) && !Number.isSafeInteger(parsed)) {
          if (!context?.source || !/^-?\d+$/.test(context.source))
            throw new Error('Exact Terraform integer representation unavailable');
          return context.source;
        }
        return parsed;
      }),
    );
  } catch {
    throw new Error('Terraform returned malformed JSON');
  }
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function changeActions(value, output = false) {
  const allowed = output
    ? ['no-op', 'create', 'update', 'delete']
    : ['no-op', 'read', 'create', 'update', 'delete', 'delete,create', 'create,delete'];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.includes(',')) ||
    !allowed.includes(value.join(','))
  )
    throw new Error('Terraform change actions are malformed or unsupported');
  return value;
}
function validateActionIntent(intent) {
  if (
    !intent ||
    Object.keys(intent).sort().join(',') !== 'address,configValuesSha256,providerName,type' ||
    Object.values(intent).some((value) => typeof value !== 'string') ||
    !/^[a-z][a-z0-9_]*$/.test(intent.type) ||
    !new RegExp(`^action\\.${intent.type}\\.[a-z][a-z0-9_]*(?:\\["[a-z][a-z0-9_-]*"\\])?$`).test(intent.address) ||
    !/^[a-z0-9.-]+\/[a-z0-9-]+\/[a-z0-9-]+$/.test(intent.providerName) ||
    !/^[a-f0-9]{64}$/.test(intent.configValuesSha256)
  )
    throw new Error('Explicit action address, provider and configuration digest required');
}
function allFalse(value) {
  return value === false || (value !== null && typeof value === 'object' && Object.values(value).every(allFalse));
}
function inspectActionInvocations(plan, expected) {
  const invocations = plan.action_invocations === undefined ? [] : plan.action_invocations;
  const deferred = plan.deferred_action_invocations === undefined ? [] : plan.deferred_action_invocations;
  if (
    !Array.isArray(invocations) ||
    !Array.isArray(deferred) ||
    deferred.length ||
    invocations.length !== (expected ? 1 : 0)
  )
    throw new Error('Terraform actions are unrequested, missing, duplicated or deferred');
  if (!expected) return [];
  const action = object5(invocations[0]);
  if (
    action.address !== expected.address ||
    action.type !== expected.type ||
    action.provider_name !== expected.providerName ||
    action.lifecycle_action_trigger !== undefined ||
    Object.keys(object5(action.invoke_action_trigger)).length ||
    !allFalse(action.config_unknown) ||
    !allFalse(action.config_sensitive) ||
    digest2(canonical(object5(action.config_values))) !== expected.configValuesSha256
  )
    throw new Error('Terraform action identity, trigger or configuration differs');
  return [{ ...expected }];
}
async function privateDirectory(path) {
  await mkdir3(path, { recursive: true, mode: 448 });
  const stat = await lstat5(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (await realpath3(path)) !== path
  )
    throw new Error('Terraform storage ownership is invalid');
  await chmod(path, 448);
}
async function privateRead(path) {
  const stat = await lstat5(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 63) !== 0
  )
    throw new Error('Terraform artifact ownership is invalid');
  return readFile3(path);
}
async function persist(path, value) {
  const temporary = `${path}.new`;
  await writeFile3(temporary, JSON.stringify(value), { mode: 384, flag: 'wx' });
  await rename2(temporary, path);
}
async function startTerraformGate(child, acquire, timeoutMs = 15000, killAfterMs = 5000, transition = async () => {}) {
  let stopped = false;
  let failed = false;
  let release;
  let releasing;
  const releaseOnce = () => (releasing ??= release?.());
  let timer;
  const startup = (async () => {
    await transition('identity-pending');
    release = await acquire();
    if (failed) {
      if (stopped) await releaseOnce();
      throw new Error('Terraform executor gate startup deadline exceeded');
    }
    await transition('identity-persisted');
    if (failed) throw new Error('Terraform executor gate startup deadline exceeded');
    child.stdin.write(`go
`);
    await child.stdin.flush();
    await child.stdin.end();
    await transition('gate-released');
    return release;
  })();
  try {
    return await Promise.race([
      startup,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Terraform executor gate startup deadline exceeded')), timeoutMs);
      }),
    ]);
  } catch (error) {
    failed = true;
    try {
      child.kill('SIGKILL');
    } catch {}
    let exitTimer;
    try {
      await Promise.race([
        child.exited,
        new Promise((_, reject) => {
          exitTimer = setTimeout(
            () => reject(new Error('Terraform executor stop unresolved; recovery remains blocked')),
            killAfterMs,
          );
        }),
      ]);
      stopped = true;
      if (release) await releaseOnce();
      await transition('startup-failed-child-exited');
    } finally {
      if (exitTimer) clearTimeout(exitTimer);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function terraformExecutor(
  limits = {
    timeoutMs: 900000,
    applyTimeoutMs: 3600000,
    maxOutputBytes: 64 * 1024 * 1024,
    killAfterMs: 5000,
    startupTimeoutMs: 15000,
  },
  retainFailure = false,
) {
  return async ({ cwd, args, env, signal }) => {
    signal?.throwIfAborted();
    const child = Bun.spawn(
      [
        '/bin/sh',
        '-c',
        'umask 077; IFS= read -r gate && test "$gate" = go && exec "$@"',
        'ce-terraform',
        'terraform',
        ...args,
      ],
      {
        cwd,
        env,
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const invocationId = randomUUID2();
    const transition = async (phase) => {
      if (!retainFailure) return;
      const directory = join11(cwd, 'executor-diagnostics');
      await privateDirectory(directory);
      const claim = await privateRead(join11(cwd, '.terraform-executor-lock', 'claim.json')).then(
        (bytes) => JSON.parse(bytes.toString('utf8')),
        () => {
          return;
        },
      );
      const executable = Bun.which('terraform', { cwd, PATH: env.PATH });
      await persist(join11(directory, `${invocationId}-${phase}.json`), {
        schemaVersion: 1,
        invocationId,
        phase,
        observedAt: new Date().toISOString(),
        pid: child.pid,
        operation: args[0],
        launcher: '/bin/sh',
        executable,
        executableSha256: executable ? digest2(await readFile3(executable)) : undefined,
        executorIdentity: claim?.pid === child.pid ? claim : undefined,
      });
    };
    const releaseExecutor = await startTerraformGate(
      child,
      () => acquireProcessLock(join11(cwd, '.terraform-executor-lock'), child.pid),
      limits.startupTimeoutMs ?? 15000,
      limits.killAfterMs,
      transition,
    );
    let failure;
    let escalation;
    const stop = (reason) => {
      if (failure) return;
      failure = reason;
      child.kill('SIGTERM');
      escalation = setTimeout(() => child.kill('SIGKILL'), limits.killAfterMs);
    };
    const abort = () => stop('Terraform operation cancelled');
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timeoutMs = args[0] === 'apply' ? limits.applyTimeoutMs : limits.timeoutMs;
    const timer = setTimeout(() => stop('Terraform operation deadline exceeded'), timeoutMs);
    const categories = new Set();
    const collect = async (stream, retain, classify = false) => {
      const reader = stream.getReader();
      const chunks = [];
      let size = 0;
      let tail = '';
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limits.maxOutputBytes) stop('Terraform response exceeded size limit');
          if (retain && !failure) chunks.push(value);
          if (classify && !failure) {
            const text = tail + Buffer.from(value).toString('utf8');
            for (const category of terraformFailureCategories(text)) categories.add(category);
            tail = text.slice(-512);
          }
        }
      } finally {
        reader.releaseLock();
      }
      return retain && !failure ? Buffer.concat(chunks).toString('utf8') : '';
    };
    try {
      const [stdout, stderr, code] = await Promise.all([
        collect(child.stdout, true),
        collect(child.stderr, retainFailure, true),
        child.exited,
      ]);
      if (failure) throw new Error(failure);
      if (code !== 0 && args[0] === 'validate') {
        try {
          const diagnostics = JSON.parse(stdout).diagnostics;
          if (Array.isArray(diagnostics)) {
            for (const item of diagnostics)
              if (item?.severity === 'error' && typeof item.summary === 'string')
                for (const category of terraformFailureCategories(`Error: ${item.summary}`)) categories.add(category);
          }
        } catch {}
      }
      const failureCategory = categories.size === 1 ? [...categories][0] : 'unknown';
      if (code !== 0 && retainFailure) {
        await privateDirectory(cwd);
        const directory = join11(cwd, 'failure-diagnostics');
        await privateDirectory(directory);
        await persist(join11(directory, `${randomUUID2()}.json`), {
          schemaVersion: 1,
          observedAt: new Date().toISOString(),
          operation: args[0],
          exitCode: code,
          category: failureCategory,
          stdout,
          stderr,
        });
      }
      return code === 0 ? { code, stdout } : { code, stdout: '', failureCategory };
    } catch {
      stop('Terraform process failed');
      await child.exited;
      throw new Error(failure ?? 'Terraform process failed');
    } finally {
      clearTimeout(timer);
      if (escalation) clearTimeout(escalation);
      signal?.removeEventListener('abort', abort);
      await releaseExecutor?.();
    }
  };
}
function validateResourceSelections(selections) {
  if (
    !selections ||
    typeof selections !== 'object' ||
    Array.isArray(selections) ||
    !Object.keys(selections).length ||
    Object.entries(selections).some(
      ([address, fields]) =>
        !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(address) ||
        !Array.isArray(fields) ||
        !fields.length ||
        new Set(fields).size !== fields.length ||
        fields.some(
          (field) =>
            typeof field !== 'string' ||
            !/^[a-z][a-z0-9_]*(?:\.(?:[a-z][a-z0-9_]*|0|[1-9][0-9]*))*$/.test(field) ||
            field.split('.').some((part) => ['__proto__', 'constructor', 'prototype'].includes(part)),
        ),
    )
  )
    throw new Error('Explicit root resource addresses and unique fields with explicit paths are required');
}
function projectResourceFields(values, sensitivity, fields) {
  const nonsensitive = (value) =>
    value === undefined ||
    value === false ||
    (value !== null && typeof value === 'object' && Object.values(value).every(nonsensitive));
  const selected = {};
  for (const field of fields) {
    let value = values;
    let marker = sensitivity;
    const parts = field.split('.');
    for (const [index, part] of parts.entries()) {
      if (
        marker === true ||
        !value ||
        typeof value !== 'object' ||
        !Object.hasOwn(value, part) ||
        (Array.isArray(value) && !(part === 'length' && index === parts.length - 1) && !/^(0|[1-9][0-9]*)$/.test(part))
      )
        throw new Error('Terraform resource field is unavailable or sensitive');
      marker =
        Array.isArray(value) && part === 'length'
          ? false
          : marker !== null && typeof marker === 'object'
            ? marker[part]
            : marker;
      value = value[part];
    }
    if (!nonsensitive(marker)) throw new Error('Terraform resource field is unavailable or sensitive');
    selected[field] = value;
  }
  return selected;
}

class TerraformRunner {
  root;
  execute;
  #directory;
  #manifest;
  #busy = false;
  constructor(root, execute = executeTerraform) {
    this.root = root;
    this.execute = execute;
    if (!isAbsolute2(root) || resolve(root) !== root) throw new Error('Terraform storage must be an absolute path');
  }
  async prepare(deployment) {
    if (deployment.schemaVersion !== 1 || deployment.engine !== 'terraform' || !safeId.test(deployment.deploymentId))
      throw new Error('Terraform deployment identity or owning engine is unsupported');
    if (deployment.stage !== undefined && !safeId.test(deployment.stage))
      throw new Error('Invalid Terraform stage identity');
    if (!/^\d+\.\d+\.\d+$/.test(deployment.terraformVersion) || !deployment.providerLock.trim())
      throw new Error('Exact Terraform version and provider lock are required');
    const configuration = decode(deployment.configuration);
    if (
      object5(configuration.terraform ?? {}).backend ||
      object5(configuration.terraform ?? {}).cloud ||
      deployment.backendIdentity !==
        `local:${deployment.deploymentId}${deployment.stage ? `:stage:${deployment.stage}` : ''}`
    )
      throw new Error('This runner currently admits isolated local backends only');
    if (
      !deployment.scope.account ||
      !deployment.scope.region ||
      !['aws', 'azure', 'gcp'].includes(deployment.scope.cloud)
    )
      throw new Error('Explicit deployment scope is required');
    await privateDirectory(this.root);
    const directory = join11(this.root, deployment.deploymentId);
    await mkdir3(directory, { mode: 448 });
    const { configuration: source, providerLock, ...identity } = deployment;
    const manifest = { ...identity, configurationSha256: digest2(source), providerLockSha256: digest2(providerLock) };
    await writeFile3(join11(directory, 'main.tf.json'), source, { mode: 384, flag: 'wx' });
    await writeFile3(join11(directory, '.terraform.lock.hcl'), providerLock, { mode: 384, flag: 'wx' });
    await writeFile3(join11(directory, 'deployment.tfrc'), cliConfig, { mode: 384, flag: 'wx' });
    await persist(join11(directory, 'deployment.json'), manifest);
    this.#directory = directory;
    this.#manifest = manifest;
  }
  async readConfigurationSha256() {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      return this.#state().manifest.configurationSha256;
    });
  }
  async readConfiguration(expectedSha256) {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      if (manifest.configurationSha256 !== expectedSha256) throw new Error('Terraform configuration snapshot is stale');
      const configuration = await privateRead(join11(directory, 'main.tf.json'));
      if (digest2(configuration) !== expectedSha256) throw new Error('Terraform configuration snapshot changed');
      return configuration.toString();
    });
  }
  async reconcileApplyFromEvidence(receipt, evidenceSha256) {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const journal = decode((await privateRead(join11(directory, 'plan-receipt.json'))).toString());
      if (
        !['applying', 'applied'].includes(String(journal.state)) ||
        canonical(receipt) !== canonical(journal.receipt) ||
        receipt.engine !== 'terraform' ||
        receipt.deploymentId !== manifest.deploymentId ||
        receipt.backendIdentity !== manifest.backendIdentity ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.providerLockSha256 !== manifest.providerLockSha256 ||
        receipt.planSha256 !== digest2(await privateRead(join11(directory, 'saved.tfplan'))) ||
        !/^[a-f0-9]{64}$/.test(evidenceSha256)
      )
        throw new Error('Terraform interrupted apply evidence differs from the exact saved plan');
      await this.#replacePrivate(
        join11(directory, 'plan-receipt.json'),
        JSON.stringify({ state: 'applied', receipt, reconciledEvidenceSha256: evidenceSha256 }),
      );
    });
  }
  async reviseConfiguration(expectedSha256, configuration) {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      if (manifest.configurationSha256 !== expectedSha256) throw new Error('Terraform configuration revision is stale');
      this.#validateRevision(configuration, (await privateRead(join11(directory, 'main.tf.json'))).toString());
      const nextSha256 = digest2(configuration);
      if (nextSha256 === expectedSha256) return nextSha256;
      let receipt;
      try {
        receipt = decode((await privateRead(join11(directory, 'plan-receipt.json'))).toString());
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (receipt?.state === 'applying')
        throw new Error('Reconcile interrupted Terraform apply before revising configuration');
      const transition = {
        previous: manifest,
        next: { ...manifest, configurationSha256: nextSha256 },
        configuration,
        archiveId: randomUUID2(),
      };
      await this.#replacePrivate(join11(directory, 'configuration-transition.json'), JSON.stringify(transition));
      await this.#recoverRevision();
      return nextSha256;
    });
  }
  #validateRevision(configuration, previousConfiguration) {
    const next = decode(configuration);
    const terraform = object5(next.terraform ?? {});
    if (terraform.backend || terraform.cloud) throw new Error('Terraform configuration revision cannot change backend');
    if (previousConfiguration !== undefined) {
      const previous = decode(previousConfiguration);
      for (const key of ['terraform', 'provider'])
        if (canonical(previous[key] ?? {}) !== canonical(next[key] ?? {}))
          throw new Error('Terraform configuration revision cannot change provider or execution identity');
    }
  }
  async #replacePrivate(path, content) {
    const temporary = `${path}.${randomUUID2()}.new`;
    await writeFile3(temporary, content, { mode: 384, flag: 'wx' });
    await rename2(temporary, path);
  }
  async #recoverRevision() {
    const { directory } = this.#state();
    let transition;
    try {
      transition = decode((await privateRead(join11(directory, 'configuration-transition.json'))).toString());
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    const previous = object5(transition.previous);
    const next = object5(transition.next);
    if (
      typeof transition.configuration !== 'string' ||
      typeof transition.archiveId !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(transition.archiveId) ||
      !/^[0-9a-f]{64}$/.test(previous.configurationSha256) ||
      canonical({ ...previous, configurationSha256: next.configurationSha256 }) !== canonical(next) ||
      next.configurationSha256 !== digest2(transition.configuration)
    )
      throw new Error('Terraform configuration transition is malformed');
    this.#validateRevision(transition.configuration);
    const owner = decode((await privateRead(join11(directory, 'deployment.json'))).toString());
    const current = await privateRead(join11(directory, 'main.tf.json'));
    if (
      ![canonical(previous), canonical(next)].includes(canonical(owner)) ||
      ![previous.configurationSha256, next.configurationSha256].includes(digest2(current)) ||
      digest2(await privateRead(join11(directory, '.terraform.lock.hcl'))) !== previous.providerLockSha256 ||
      digest2(await privateRead(join11(directory, 'deployment.tfrc'))) !== digest2(cliConfig)
    )
      throw new Error('Terraform configuration transition ownership or inputs changed');
    const archive = join11(directory, 'revisions', transition.archiveId);
    await privateDirectory(archive);
    const archiveFile = async (name, content) => {
      try {
        await writeFile3(join11(archive, name), content, { mode: 384, flag: 'wx' });
      } catch (error) {
        if (error.code !== 'EEXIST' || digest2(await privateRead(join11(archive, name))) !== digest2(content))
          throw error;
      }
    };
    if (digest2(current) === previous.configurationSha256) await archiveFile('main.tf.json', current);
    if (digest2(await privateRead(join11(archive, 'main.tf.json'))) !== previous.configurationSha256)
      throw new Error('Previous Terraform configuration archive is missing');
    this.#validateRevision(transition.configuration, (await privateRead(join11(archive, 'main.tf.json'))).toString());
    await archiveFile('deployment.json', Buffer.from(JSON.stringify(previous)));
    for (const name of ['saved.tfplan', 'plan-receipt.json']) {
      try {
        await archiveFile(name, await privateRead(join11(directory, name)));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    await this.#replacePrivate(join11(directory, 'main.tf.json'), transition.configuration);
    await this.#replacePrivate(join11(directory, 'deployment.json'), JSON.stringify(next));
    this.#manifest = next;
    await rm3(join11(directory, 'configuration-transition.json'));
  }
  async resume(deploymentId, expected, configurationMode = 'exact') {
    if (configurationMode === 'current' && !expected) throw new Error('Current configuration resume requires identity');
    if (!safeId.test(deploymentId)) throw new Error('Invalid Terraform deployment identity');
    const directory = join11(this.root, deploymentId);
    await privateDirectory(directory);
    const manifest = decode((await privateRead(join11(directory, 'deployment.json'))).toString());
    if (manifest.schemaVersion !== 1 || manifest.engine !== 'terraform' || manifest.deploymentId !== deploymentId)
      throw new Error('Terraform deployment ownership is invalid');
    this.#directory = directory;
    this.#manifest = manifest;
    await this.#exclusive(() => this.#recoverRevision());
    const recoveredManifest = this.#state().manifest;
    if (expected) {
      const { configuration, providerLock, ...identity } = expected;
      const expectedManifest = {
        ...identity,
        configurationSha256:
          configurationMode === 'current' ? recoveredManifest.configurationSha256 : digest2(configuration),
        providerLockSha256: digest2(providerLock),
      };
      if (canonical(recoveredManifest) !== canonical(expectedManifest))
        throw new Error('Terraform deployment differs from the requested identity or configuration');
      if (configurationMode === 'current')
        this.#validateRevision((await privateRead(join11(directory, 'main.tf.json'))).toString(), configuration);
    }
    this.#directory = directory;
    this.#manifest = recoveredManifest;
    await this.#verifyInputs();
  }
  #state() {
    if (!this.#directory || !this.#manifest) throw new Error('Prepare or resume the deployment first');
    return { directory: this.#directory, manifest: this.#manifest };
  }
  async #verifyInputs() {
    if (!this.#manifest || !this.#directory) throw new Error('Prepare or resume the deployment first');
    try {
      await lstat5(join11(this.#directory, 'configuration-transition.json'));
      throw new Error('Resume the interrupted Terraform configuration transition before execution');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const owner = decode((await privateRead(join11(this.#directory, 'deployment.json'))).toString());
    if (canonical(owner) !== canonical(this.#manifest) || owner.engine !== 'terraform')
      throw new Error('Terraform deployment ownership changed');
    for (const [file, expected] of [
      ['main.tf.json', this.#manifest.configurationSha256],
      ['.terraform.lock.hcl', this.#manifest.providerLockSha256],
      ['deployment.tfrc', digest2(cliConfig)],
    ]) {
      if (digest2(await privateRead(join11(this.#directory, file))) !== expected)
        throw new Error('Terraform configuration or provider lock changed');
    }
  }
  #environment(ambient) {
    const env = Object.fromEntries(Object.entries(ambient).filter(([key]) => !key.startsWith('TF_')));
    return {
      ...env,
      TF_CLI_CONFIG_FILE: join11(this.#state().directory, 'deployment.tfrc'),
      TF_DATA_DIR: join11(this.#state().directory, '.terraform'),
      TF_IN_AUTOMATION: '1',
      TF_INPUT: '0',
      TF_WORKSPACE: 'default',
    };
  }
  async #run(args, env, signal) {
    signal?.throwIfAborted();
    const result = await this.execute({ cwd: this.#state().directory, args, env: this.#environment(env), signal });
    if (result.code !== 0) throw new TerraformCommandError(args[0], result.code, result.failureCategory);
    return result.stdout;
  }
  async #exclusive(operation) {
    if (this.#busy) throw new Error('Terraform deployment operation is already running');
    if (!this.#directory) throw new Error('Prepare or resume the deployment first');
    this.#busy = true;
    const lock = join11(this.#directory, '.runner-lock');
    let release;
    try {
      release = await acquireProcessLock(lock);
      const executorStopped = await acquireProcessLock(join11(this.#directory, '.terraform-executor-lock'));
      await executorStopped();
      return await operation();
    } finally {
      if (release) await release();
      this.#busy = false;
    }
  }
  async readStateIdentity() {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const state = await privateRead(join11(this.#state().directory, 'terraform.tfstate'));
      const value = decode(state.toString());
      if (
        typeof value.lineage !== 'string' ||
        !value.lineage.trim() ||
        !Number.isSafeInteger(value.serial) ||
        value.serial < 0
      )
        throw new Error('Stable Terraform state identity unavailable');
      return { sha256: digest2(state), lineage: value.lineage, serial: value.serial };
    });
  }
  async #archivePlanAttempt() {
    const { directory } = this.#state();
    const files = new Map();
    for (const name of ['saved.tfplan', 'plan-receipt.json']) {
      try {
        files.set(name, await privateRead(join11(directory, name)));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (!files.size) return;
    for (const name of ['main.tf.json', 'deployment.json', '.terraform.lock.hcl', 'deployment.tfrc'])
      files.set(name, await privateRead(join11(directory, name)));
    const inventory = JSON.stringify(Object.fromEntries([...files].map(([name, bytes]) => [name, digest2(bytes)])));
    const archive = join11(directory, 'plan-history', digest2(inventory));
    await privateDirectory(archive);
    files.set('inventory.json', Buffer.from(inventory));
    for (const [name, bytes] of files) {
      try {
        await writeFile3(join11(archive, name), bytes, { mode: 384, flag: 'wx' });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (digest2(await privateRead(join11(archive, name))) !== digest2(bytes))
          throw new Error('Terraform plan history differs');
      }
    }
  }
  async plan(env, signal) {
    return this.#plan(env, signal);
  }
  async planDestroy(env, signal) {
    return this.#plan(env, signal, undefined, true);
  }
  async planAction(intent, env, signal) {
    intent = structuredClone(intent);
    validateActionIntent(intent);
    return this.#plan(env, signal, intent);
  }
  async #plan(env, signal, action, destroy = false) {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      await this.#preserveActionSubmission();
      if (action) await this.#assertActionUnsubmitted();
      await this.#archivePlanAttempt();
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== this.#state().manifest.terraformVersion)
        throw new Error('Terraform version changed');
      await this.#run(['init', '-input=false', '-lockfile=readonly'], env, signal);
      await this.#verifyInputs();
      await this.#run(['validate', '-json'], env, signal);
      await this.#run(
        [
          'plan',
          '-input=false',
          '-lock=true',
          '-lock-timeout=60s',
          '-refresh=true',
          '-out=saved.tfplan',
          ...(action ? [`-invoke=${action.address}`] : []),
          ...(destroy ? ['-destroy'] : []),
        ],
        env,
        signal,
      );
      const raw = await this.#run(['show', '-json', 'saved.tfplan'], env, signal);
      const plan = decode(raw);
      if (
        !plan ||
        typeof plan.format_version !== 'string' ||
        !/^1\.\d+$/.test(plan.format_version) ||
        plan.terraform_version !== this.#state().manifest.terraformVersion ||
        plan.errored !== false ||
        plan.complete !== true ||
        typeof plan[['apply', 'able'].join('')] !== 'boolean' ||
        !Array.isArray(plan.resource_changes ?? [])
      )
        throw new Error('Terraform plan JSON is malformed or unsupported');
      const actionInvocations = inspectActionInvocations(plan, action);
      const changes = [];
      for (const value of plan.resource_changes ?? []) {
        const resource = object5(value);
        const actions = changeActions(object5(resource.change).actions);
        if (
          typeof resource.address !== 'string' ||
          typeof resource.type !== 'string' ||
          changes.some((change) => change.address === resource.address)
        )
          throw new Error('Terraform resource change is malformed');
        changes.push({ address: resource.address, type: resource.type, actions });
      }
      const outputs = Object.values(object5(plan.output_changes ?? {})).map((output) =>
        changeActions(object5(output).actions, true),
      );
      const resourcesUnchanged =
        changes.every((change) => change.actions[0] === 'no-op') && outputs.every((actions) => actions[0] === 'no-op');
      if (action && !resourcesUnchanged)
        throw new Error('Terraform action plan contains unrelated resource or output changes');
      if (
        destroy &&
        (changes.some((change) => !['delete', 'no-op'].includes(change.actions.join(','))) ||
          outputs.some((actions) => !['delete', 'no-op'].includes(actions.join(','))))
      )
        throw new Error('Terraform destroy plan contains non-delete changes');
      const noChanges = resourcesUnchanged && actionInvocations.length === 0;
      if (!noChanges && !plan[['apply', 'able'].join('')])
        throw new Error('Terraform plan has changes but cannot be applied');
      const manifest = this.#state().manifest;
      const receipt = {
        schemaVersion: 1,
        deploymentId: manifest.deploymentId,
        engine: 'terraform',
        backendIdentity: manifest.backendIdentity,
        configurationSha256: manifest.configurationSha256,
        providerLockSha256: manifest.providerLockSha256,
        planSha256: digest2(await privateRead(join11(this.#state().directory, 'saved.tfplan'))),
        changes,
        noChanges,
        ...(actionInvocations.length ? { actionInvocations } : {}),
        ...(destroy ? { operation: 'destroy' } : {}),
      };
      await persist(join11(this.#state().directory, 'plan-receipt.json'), { state: 'planned', receipt });
      return receipt;
    });
  }
  async #assertActionUnsubmitted() {
    try {
      await privateRead(join11(this.#state().directory, 'action-attempt.json'));
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    throw new Error('This stage already recorded an action submission; observe its outcome instead of replaying it');
  }
  async #preserveActionSubmission() {
    const directory = this.#state().directory;
    let journal;
    try {
      journal = decode((await privateRead(join11(directory, 'plan-receipt.json'))).toString());
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (!['applying', 'applied'].includes(String(journal.state))) return;
    const actions = object5(journal.receipt).actionInvocations;
    if (!Array.isArray(actions) || actions.length === 0) return;
    try {
      await privateRead(join11(directory, 'action-attempt.json'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await persist(join11(directory, 'action-attempt.json'), {
        schemaVersion: 1,
        legacyJournalState: journal.state,
        receipt: journal.receipt,
      });
    }
  }
  async readOutputs(names, env, signal) {
    names = [...names];
    if (
      !names.length ||
      new Set(names).size !== names.length ||
      names.some((name) => !/^[a-z][a-z0-9_]{0,63}$/.test(name))
    )
      throw new Error('Explicit unique Terraform output names are required');
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const journal = decode((await privateRead(join11(directory, 'plan-receipt.json'))).toString());
      const receipt = object5(journal.receipt);
      if (
        !(journal.state === 'applied' || (journal.state === 'planned' && receipt.noChanges === true)) ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.providerLockSha256 !== manifest.providerLockSha256
      )
        throw new Error('Terraform outputs require an applied or converged current configuration');
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== manifest.terraformVersion) throw new Error('Terraform version changed');
      const outputs = decode(await this.#run(['output', '-json'], env, signal));
      const selected = {};
      for (const name of names) {
        const output = object5(outputs[name]);
        if (output.sensitive !== false || !Object.hasOwn(output, 'value') || !Object.hasOwn(output, 'type'))
          throw new Error('Requested Terraform output is unavailable, malformed or sensitive');
        selected[name] = output.value;
      }
      return selected;
    });
  }
  async assertApplied(receipt) {
    receipt = structuredClone(receipt);
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const journal = decode((await privateRead(join11(directory, 'plan-receipt.json'))).toString());
      if (
        journal.state !== 'applied' ||
        canonical(journal.receipt) !== canonical(receipt) ||
        receipt.deploymentId !== manifest.deploymentId ||
        receipt.engine !== 'terraform' ||
        receipt.backendIdentity !== manifest.backendIdentity ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.providerLockSha256 !== manifest.providerLockSha256 ||
        receipt.planSha256 !== digest2(await privateRead(join11(directory, 'saved.tfplan')))
      )
        throw new Error('Exact applied Terraform receipt required for ownership capture');
    });
  }
  async readPlannedResourceIds(receipt, addresses, env, signal) {
    if (
      !addresses.length ||
      new Set(addresses).size !== addresses.length ||
      addresses.some((address) => !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(address))
    )
      throw new Error('Explicit unique root resource addresses are required');
    const projected = await this.readPlannedResourceFields(
      receipt,
      Object.fromEntries(addresses.map((address) => [address, ['id']])),
      env,
      signal,
    );
    return Object.fromEntries(
      Object.entries(projected).map(([address, values]) => {
        if (values === null) return [address, null];
        if (typeof values.id !== 'string' || !values.id)
          throw new Error('Terraform resource ID is unavailable or sensitive');
        return [address, values.id];
      }),
    );
  }
  async readPlannedResourceFields(receipt, selections, env, signal) {
    validateResourceSelections(selections);
    selections = structuredClone(selections);
    receipt = structuredClone(receipt);
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const journal = decode((await privateRead(join11(directory, 'plan-receipt.json'))).toString());
      if (
        journal.state !== 'planned' ||
        canonical(journal.receipt) !== canonical(receipt) ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.planSha256 !== digest2(await privateRead(join11(directory, 'saved.tfplan')))
      )
        throw new Error('Terraform identity inspection saved plan differs');
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== manifest.terraformVersion) throw new Error('Terraform version changed');
      const plan = decode(await this.#run(['show', '-json', 'saved.tfplan'], env, signal));
      const changes = plan.resource_changes === undefined ? [] : plan.resource_changes;
      if (!Array.isArray(changes)) throw new Error('Terraform plan resource identities unavailable');
      const result = {};
      for (const [address, fields] of Object.entries(selections)) {
        const matches = changes.map(object5).filter((resource) => resource.address === address);
        if (matches.length > 1) throw new Error('Terraform resource identity is ambiguous');
        if (!matches.length) {
          result[address] = null;
          continue;
        }
        const change = object5(matches[0].change);
        if (change.before === null || change.before === undefined) {
          result[address] = null;
          continue;
        }
        const before = object5(change.before);
        const sensitivity =
          change.before_sensitive === undefined || change.before_sensitive === false
            ? {}
            : change.before_sensitive === true
              ? true
              : object5(change.before_sensitive);
        const selected = projectResourceFields(before, sensitivity, fields);
        result[address] = selected;
      }
      if (receipt.planSha256 !== digest2(await privateRead(join11(directory, 'saved.tfplan'))))
        throw new Error('Terraform identity inspection saved plan changed');
      return result;
    });
  }
  async readAppliedResourceFields(receipt, selections, env, signal) {
    const { applyState: _applyState, ...projection } = await this.#readApplyStateFields(
      receipt,
      selections,
      env,
      signal,
      ['applied'],
    );
    return projection;
  }
  async readApplyAttemptResourceFields(receipt, selections, env, signal) {
    return this.#readApplyStateFields(receipt, selections, env, signal, ['applying', 'applied']);
  }
  async readApplyCheckpoint(receipt) {
    receipt = structuredClone(receipt);
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const state = await this.#verifyApplyReceipt(receipt, ['planned', 'applying', 'applied']);
      return { schemaVersion: 1, planSha256: receipt.planSha256, state };
    });
  }
  async #verifyApplyReceipt(receipt, states) {
    const { directory, manifest } = this.#state();
    const journal = decode((await privateRead(join11(directory, 'plan-receipt.json'))).toString());
    const state = journal.state;
    if (
      !states.includes(state) ||
      canonical(journal.receipt) !== canonical(receipt) ||
      receipt.engine !== 'terraform' ||
      receipt.deploymentId !== manifest.deploymentId ||
      receipt.backendIdentity !== manifest.backendIdentity ||
      receipt.configurationSha256 !== manifest.configurationSha256 ||
      receipt.providerLockSha256 !== manifest.providerLockSha256 ||
      receipt.planSha256 !== digest2(await privateRead(join11(directory, 'saved.tfplan')))
    )
      throw new Error(`Exact ${states.join('/')} Terraform receipt required for state identity inspection`);
    return state;
  }
  async #readApplyStateFields(receipt, selections, env, signal, states) {
    validateResourceSelections(selections);
    selections = structuredClone(selections);
    receipt = structuredClone(receipt);
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const applyState = await this.#verifyApplyReceipt(receipt, states);
      const statePath = join11(directory, 'terraform.tfstate');
      const snapshot = await privateRead(statePath);
      const identity = decode(snapshot.toString());
      if (
        typeof identity.lineage !== 'string' ||
        !identity.lineage.trim() ||
        !Number.isSafeInteger(identity.serial) ||
        identity.serial < 0
      )
        throw new Error('Terraform state identity is malformed');
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== manifest.terraformVersion) throw new Error('Terraform version changed');
      const state = decode(await this.#run(['show', '-json', 'terraform.tfstate'], env, signal));
      if (state.format_version !== '1.0' || state.terraform_version !== manifest.terraformVersion)
        throw new Error('Terraform state format or version changed');
      const module = object5(object5(state.values ?? {}).root_module ?? {});
      const resources = module.resources ?? [];
      if (!Array.isArray(resources)) throw new Error('Terraform state resource identities unavailable');
      if (
        (Array.isArray(module.child_modules) && module.child_modules.length) ||
        resources
          .map(object5)
          .some((resource) => typeof resource.address !== 'string' || !Object.hasOwn(selections, resource.address))
      )
        throw new Error('Foreign state resource requires reconciliation');
      const result = {};
      for (const [address, fields] of Object.entries(selections)) {
        const reviewed = receipt.changes.filter((change) => change.address === address);
        if (reviewed.length !== 1) throw new Error('Terraform state resource is outside the reviewed plan');
        const matches = resources.map(object5).filter((resource) => resource.address === address);
        if (matches.length > 1) throw new Error('Terraform state resource identity is ambiguous');
        if (!matches.length) {
          result[address] = null;
          continue;
        }
        const resource = matches[0];
        if (
          resource.mode !== 'managed' ||
          resource.type !== reviewed[0].type ||
          resource.type !== address.split('.')[0]
        )
          throw new Error('Terraform state resource differs from reviewed identity');
        if (!Object.hasOwn(resource, 'sensitive_values')) throw new Error('Terraform state sensitivity unavailable');
        result[address] = projectResourceFields(object5(resource.values), resource.sensitive_values, fields);
      }
      if (digest2(snapshot) !== digest2(await privateRead(statePath)))
        throw new Error('Terraform state changed during identity inspection');
      await this.#verifyInputs();
      if ((await this.#verifyApplyReceipt(receipt, states)) !== applyState)
        throw new Error('Terraform apply checkpoint changed during inspection');
      if (receipt.planSha256 !== digest2(await privateRead(join11(directory, 'saved.tfplan'))))
        throw new Error('Terraform saved plan changed during state identity inspection');
      return {
        schemaVersion: 1,
        applyState,
        planSha256: receipt.planSha256,
        stateSha256: digest2(snapshot),
        lineage: identity.lineage,
        serial: identity.serial,
        resources: result,
      };
    });
  }
  async apply(receipt, env, signal) {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const journal = decode((await privateRead(join11(this.#state().directory, 'plan-receipt.json'))).toString());
      if (journal.state !== 'planned') throw new Error('Saved plan is consumed or requires reconciliation');
      if (
        canonical(receipt) !== canonical(journal.receipt) ||
        receipt.engine !== 'terraform' ||
        receipt.deploymentId !== this.#state().manifest.deploymentId ||
        receipt.configurationSha256 !== this.#state().manifest.configurationSha256 ||
        receipt.providerLockSha256 !== this.#state().manifest.providerLockSha256 ||
        receipt.planSha256 !== digest2(await privateRead(join11(this.#state().directory, 'saved.tfplan')))
      )
        throw new Error('Terraform saved-plan receipt does not match');
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== this.#state().manifest.terraformVersion)
        throw new Error('Terraform version changed');
      const expectedActions = receipt.actionInvocations ?? [];
      if (!Array.isArray(expectedActions) || expectedActions.length > 1)
        throw new Error('Saved action receipt is malformed');
      if (expectedActions.length) validateActionIntent(expectedActions[0]);
      const plan = decode(await this.#run(['show', '-json', 'saved.tfplan'], env, signal));
      inspectActionInvocations(plan, expectedActions[0]);
      if (receipt.planSha256 !== digest2(await privateRead(join11(this.#state().directory, 'saved.tfplan'))))
        throw new Error('Terraform saved plan changed during action inspection');
      if (expectedActions.length) {
        await this.#assertActionUnsubmitted();
        await persist(join11(this.#state().directory, 'action-attempt.json'), {
          schemaVersion: 1,
          submittedAt: new Date().toISOString(),
          receipt,
        });
      }
      await persist(join11(this.#state().directory, 'plan-receipt.json'), { state: 'applying', receipt });
      await this.#run(['apply', '-input=false', '-lock=true', '-lock-timeout=60s', 'saved.tfplan'], env, signal);
      await persist(join11(this.#state().directory, 'plan-receipt.json'), { state: 'applied', receipt });
    });
  }
}
var cliConfig = `provider_installation {
  direct {}
}
disable_checkpoint = true
`,
  digest2 = (value) => createHash7('sha256').update(value).digest('hex'),
  safeId,
  executeTerraform;
var init_runner = __esm(() => {
  init_process_lock();
  init_failure();
  safeId = /^[a-z][a-z0-9-]{0,62}$/;
  executeTerraform = terraformExecutor(undefined, true);
});

// plugins/terraform/src/service.ts
import { join as join12 } from 'node:path';

function createCeTerraformService(platform) {
  return {
    async open(owner, deployment, resume) {
      owner = structuredClone(owner);
      deployment = structuredClone(deployment);
      if (
        owner.engine !== 'terraform' ||
        deployment.engine !== 'terraform' ||
        owner.deploymentId !== deployment.deploymentId ||
        owner.provider !== deployment.scope.cloud ||
        owner.account !== deployment.scope.account ||
        owner.region !== deployment.scope.region
      )
        throw new Error('Terraform deployment and cloud ownership differ');
      const shared = await platform();
      const store = await shared.storage(owner);
      if (deployment.stage !== undefined && !/^[a-z][a-z0-9-]{0,62}$/.test(deployment.stage))
        throw new Error('Invalid Terraform stage identity');
      const runner = new TerraformRunner(
        deployment.stage ? join12(store.directory, 'terraform-stages', deployment.stage) : store.directory,
      );
      if (resume) await runner.resume(deployment.deploymentId, deployment, resume === 'current' ? 'current' : 'exact');
      else await runner.prepare(deployment);
      const checkOwner = async () => {
        await shared.storage(owner);
      };
      return {
        async readStateIdentity() {
          await checkOwner();
          return runner.readStateIdentity();
        },
        async assertApplied(receipt) {
          await checkOwner();
          return runner.assertApplied(receipt);
        },
        async readConfigurationSha256() {
          await checkOwner();
          return runner.readConfigurationSha256();
        },
        async readPlannedResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readPlannedResourceFields(receipt, selections, env, signal);
        },
        async readAppliedResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readAppliedResourceFields(receipt, selections, env, signal);
        },
        async readApplyCheckpoint(receipt) {
          await checkOwner();
          return runner.readApplyCheckpoint(receipt);
        },
        async readApplyAttemptResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readApplyAttemptResourceFields(receipt, selections, env, signal);
        },
        async readPlannedResourceIds(receipt, addresses, env, signal) {
          await checkOwner();
          return runner.readPlannedResourceIds(receipt, addresses, env, signal);
        },
        async readConfiguration(expectedSha256) {
          await checkOwner();
          return runner.readConfiguration(expectedSha256);
        },
        async readOutputs(names, env, signal) {
          await checkOwner();
          return runner.readOutputs(names, env, signal);
        },
        async reviseConfiguration(expectedSha256, configuration) {
          await checkOwner();
          return runner.reviseConfiguration(expectedSha256, configuration);
        },
        async reconcileApplyFromEvidence(receipt, evidenceSha256) {
          await checkOwner();
          return runner.reconcileApplyFromEvidence(receipt, evidenceSha256);
        },
        async planDestroy(env, signal) {
          await checkOwner();
          return runner.planDestroy(env, signal);
        },
        async planAction(intent, env, signal) {
          await checkOwner();
          return runner.planAction(intent, env, signal);
        },
        async plan(env, signal) {
          await checkOwner();
          return runner.plan(env, signal);
        },
        async apply(receipt, env, signal) {
          await checkOwner();
          await runner.apply(receipt, env, signal);
        },
      };
    },
  };
}
var init_service2 = __esm(() => {
  init_runner();
});

// plugins/gcloud/src/ce/funding-session.ts
function billable(receipt) {
  return receipt.changes.some(
    (change) =>
      change.type.startsWith('google_') && change.actions.some((action) => action === 'create' || action === 'update'),
  );
}
function withGcpCorporateFunding(session, store, api, project, collect = collectCurrentGcpCorporateFunding, intent) {
  return {
    ...session,
    async plan(environment, signal) {
      const receipt = await session.plan(environment, signal);
      if (billable(receipt)) {
        const funding = await collect(api, project, signal);
        await store.write(`gcp-funding-${receipt.planSha256}.json`, {
          schemaVersion: 1,
          receiptFingerprint: fingerprint(receipt),
          funding,
        });
      }
      return receipt;
    },
    async apply(receipt, environment, signal) {
      if (billable(receipt)) {
        const saved = await store.read(`gcp-funding-${receipt.planSha256}.json`);
        if (saved.schemaVersion !== 1 || saved.receiptFingerprint !== fingerprint(receipt))
          throw new Error('Reviewed Terraform corporate funding binding differs');
        const current = await collect(api, project, signal);
        assertGcpCorporateFundingCurrent(current, project, saved.funding.billingAccountName);
        if (current.policySha256 !== saved.funding.policySha256)
          throw new Error('Corporate funding policy changed after Terraform review');
        if (intent?.image.name.endsWith('-byol'))
          await assertGcpByolAuthorization(
            intent,
            { query: createGcpPreflightPort(api, project).query, document: fetchGcpByolDocument },
            current,
            store,
            signal,
          );
      }
      return session.apply(receipt, environment, signal);
    },
  };
}
var init_funding_session = __esm(() => {
  init_byol_terms();
  init_corporate_funding();
  init_discovery();
  init_preflight_port();
});

// plugins/gcloud/src/ce/terraform-session.ts
async function openGcpTerraformSession(platform, inputs, resume = false) {
  if (inputs.intent.engine !== 'terraform') throw new Error('Terraform adapter cannot mutate a native deployment');
  if (!/^sha256:[a-f0-9]{64}$/.test(inputs.expectedLockSha256)) throw new Error('Exact provider lock digest required');
  const { createHash } = await import('node:crypto');
  const digest = `sha256:${createHash('sha256').update(inputs.providerLock).digest('hex')}`;
  if (digest !== inputs.expectedLockSha256) throw new Error('GCP Terraform provider lock bytes changed');
  for (const [provider, version] of [
    ['hashicorp/google', inputs.versions.google],
    ['f5-sales-demo/xcsh', inputs.versions.xcsh],
  ]) {
    const blocks = inputs.providerLock
      .split('provider "')
      .filter((block) => block.startsWith(`registry.terraform.io/${provider}"`));
    if (
      blocks.length !== 1 ||
      !blocks[0].includes(`version     = "${version}"`) ||
      !/"(?:h1:[A-Za-z0-9+/=]+|zh:[a-f0-9]{64})"/.test(blocks[0])
    )
      throw new Error('Pinned provider version/checksums missing from lock');
  }
  const translated =
    inputs.configurationVersion === 2
      ? translateGcpPublicTerraformSiteCompute(inputs.intent, inputs.versions)
      : translateGcpTerraformSiteCompute(inputs.intent, inputs.versions);
  const owner = {
    deploymentId: inputs.intent.deploymentName,
    engine: 'terraform',
    provider: 'gcp',
    account: inputs.intent.project,
    region: inputs.intent.region,
  };
  const deployment = {
    schemaVersion: 1,
    deploymentId: owner.deploymentId,
    engine: 'terraform',
    scope: { cloud: 'gcp', account: owner.account, region: owner.region },
    terraformVersion: inputs.versions.terraform,
    configuration: JSON.stringify(translated.configuration),
    providerLock: inputs.providerLock,
    backendIdentity: `local:${owner.deploymentId}`,
  };
  const store = await platform.storage(owner);
  const identity = {
    schemaVersion: 1,
    engine: 'terraform',
    platformContext: inputs.intent.platformContext,
    intentFingerprint: fingerprint(inputs.intent),
    intent: structuredClone(inputs.intent),
    configurationFingerprint: fingerprint(translated.configuration),
    providerLockSha256: digest,
  };
  if (resume) {
    const saved = await store.read('gcp-terraform-input-identity.json');
    if (fingerprint(saved) !== fingerprint(identity)) throw new Error('GCP Terraform resume input identity differs');
  } else {
    let prior;
    try {
      prior = await store.read('gcp-terraform-input-identity.json');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (prior !== undefined) throw new Error('Existing GCP Terraform deployment must resume');
    await store.write('gcp-terraform-input-identity.json', identity);
    await store.write('gcp-terraform-session-inputs.json', { schemaVersion: 1, inputs: structuredClone(inputs) });
  }
  const session = await createCeTerraformService(async () => platform).open(owner, deployment, resume);
  return withGcpCorporateFunding(
    session,
    store,
    makeExecApi(store.directory),
    inputs.intent.project,
    undefined,
    inputs.intent,
  );
}
async function resumeGcpTerraformSession(platform, intent) {
  if (intent.engine !== 'terraform') throw new Error('Terraform session cannot change owning engine');
  const store = await platform.storage({
    deploymentId: intent.deploymentName,
    provider: 'gcp',
    engine: 'terraform',
    account: intent.project,
    region: intent.region,
  });
  const saved = await store.read('gcp-terraform-session-inputs.json');
  if (saved.schemaVersion !== 1 || !saved.inputs || fingerprint(saved.inputs.intent) !== fingerprint(intent))
    throw new Error('Persisted Terraform session inputs unavailable or changed');
  return openGcpTerraformSession(platform, saved.inputs, 'current');
}
var init_terraform_session = __esm(() => {
  init_service2();
  init_shared();
  init_compute_plan();
  init_discovery();
  init_funding_session();
});

// plugins/gcloud/src/ce/terraform-public-runtime.ts
async function openPublicTerraformRuntime(platform, api, intent, signal) {
  if (
    intent.engine !== 'terraform' ||
    !GCP_PUBLIC_TERRAFORM_ARTIFACTS ||
    GCP_PUBLIC_TERRAFORM_ARTIFACTS.configurationVersion !== 2
  )
    throw new Error('Published creation identity provider qualification unavailable');
  const owner = {
    deploymentId: intent.deploymentName,
    provider: 'gcp',
    engine: 'terraform',
    account: intent.project,
    region: intent.region,
  };
  const store = await platform.storage(owner);
  let inputs;
  try {
    inputs = await store.read('gcp-terraform-session-inputs.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const expected = { schemaVersion: 1, inputs: { ...GCP_PUBLIC_TERRAFORM_ARTIFACTS, intent } };
  if (inputs && fingerprint(inputs) !== fingerprint(expected))
    throw new Error('Public Terraform original packaged inputs differ');
  const session = inputs
    ? await resumeGcpTerraformSession(platform, intent)
    : await openGcpTerraformSession(platform, expected.inputs);
  if (!platform.gcpObservations) throw new Error('Scoped Terraform observations unavailable');
  const observations = await platform.gcpObservations(owner, intent.platformContext, signal);
  if (!observations.teardown || !observations.terraformEnvironment)
    throw new Error('Qualified Terraform runtime channels unavailable');
  const credentials = await observations.terraformEnvironment();
  const context = { schemaVersion: 1, contextHash: publicTerraformContextHash(intent, credentials.XCSH_API_URL) };
  let originalContext;
  try {
    originalContext = await store.read('gcp-tf-public-platform-context.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try {
      await store.read('gcp-tf-deploy-original-authorization.json');
      throw new Error('Original authorized public Terraform context receipt unavailable');
    } catch (authorizationError) {
      if (authorizationError.code !== 'ENOENT') throw authorizationError;
    }
    await store.write('gcp-tf-public-platform-context.json', context);
    originalContext = context;
  }
  if (fingerprint(originalContext) !== fingerprint(context))
    throw new Error('Original public Terraform context endpoint changed');
  const access = await api.exec('gcloud', ['auth', 'print-access-token', `--project=${intent.project}`, '--quiet'], {
    signal,
  });
  if (access.exitCode !== 0 || !access.stdout.trim() || /\s/.test(access.stdout.trim()))
    throw new Error('Scoped Terraform Google authentication unavailable');
  return {
    store,
    session,
    api,
    observePlatform: observations.teardown,
    environment: { ...process.env, ...credentials, GOOGLE_OAUTH_ACCESS_TOKEN: access.stdout.trim() },
  };
}
var init_terraform_public_runtime = __esm(() => {
  init_discovery();
  init_terraform_context();
  init_terraform_public_artifacts();
  init_terraform_session();
});

// plugins/gcloud/src/tools/gcp-ce.ts
import { join as join13 } from 'node:path';

function result(tool, data, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    details: { tool, ...data },
    ...(isError ? { isError: true } : {}),
  };
}
async function platformService(pi) {
  const events = pi.events;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Shared Platform CE service unavailable')), 2000);
    events?.emit?.(CE_SERVICE_CHANNEL, {
      version: 2,
      resolve: (service) => {
        clearTimeout(timer);
        resolve(service);
      },
    });
  });
}
function createGcpCeTools(
  pi,
  makeApi = makeExecApi,
  contract = resolveGcpContract,
  getPlatform = () => platformService(pi),
  preflight = collectGcpLaunchPreflight,
  policy = readGcpCePolicy,
  terraformSession = resumeGcpTerraformSession,
  funding = collectCurrentGcpCorporateFunding,
  publicTerraformRuntime = openPublicTerraformRuntime,
) {
  const { Type } = pi.typebox;
  const definitions = [
    ['gcp_project_identity', 'Read explicit GCP project identity. Does not change the active project or authenticate.'],
    [
      'gcp_compute_discover',
      'Discover exact F5 images and licenses, billing, APIs, machines and quotas for an explicit project/region. Unknown prerequisites remain explicit.',
    ],
    [
      'gcp_marketplace_agreement',
      'Discover and qualify the pinned F5 image Marketplace consent. Save an exact agreement document review and accept programmatically with its approvedPlanHash. Unavailable API, prerequisite terms and ambiguous mappings remain explicit; this tool places no orders.',
    ],
    [
      'gcp_ce_inventory',
      'List cloud instances labeled for a CE deployment. Labels are candidate ownership only; platform registration, interface identity and traffic remain unknown.',
    ],
    [
      'gcp_ce_plan',
      'Review a single-node BYOL deployment through the selected native or qualified Terraform engine when operation=deploy, or exact owning-engine teardown when operation=teardown. Collects prerequisites server-side. Terraform requires the packaged creation-identity provider. Without an operation, returns non-executable readiness.',
    ],
    [
      'gcp_ce_apply',
      'Apply or resume an exact reviewed single-node deployment or owning-engine teardown with operation and approvedPlanHash. Terraform inspects consumed submissions and requires a separate delete-only review for partial cleanup. Cloud creation does not imply registration, health or traffic.',
    ],
    [
      'gcp_ce_status',
      'Observe cloud instance provisioning for an explicit deployment without inferring F5 or traffic health.',
    ],
    [
      'gcp_ce_diagnose',
      'Report read-only cloud provisioning and separate unknown platform/interface/routing/traffic evidence. No packet collection or intrusive diagnostics.',
    ],
    ['gcp_ce_upgrade', 'Report GCP upgrade availability; upgrades require a reviewed plan and qualified F5 contract.'],
    ['gcp_ce_failover', 'Report GCP failover availability; no outage is induced without a qualified reviewed plan.'],
    [
      'gcp_ce_teardown',
      'Prepare a single-node teardown plan from exact deployment and owning-engine ledgers. Apply only with its approvedPlanHash; labels alone never authorize deletion.',
    ],
  ];
  return definitions.map(([tool, description]) => ({
    name: tool,
    label: tool.replaceAll('_', ' '),
    description,
    parameters: Type.Object({
      project: Type.String({ description: 'Explicit target project ID' }),
      region: Type.Optional(Type.String({ description: 'Explicit region; required for discovery and plan' })),
      deploymentName: Type.Optional(
        Type.String({ description: 'Exact deployment label; required for inventory/status/diagnose' }),
      ),
      platformContext: Type.Optional(
        Type.String({ description: 'Persisted F5 context; use with explicit region for ledger-bound status/diagnose' }),
      ),
      engine: Type.Optional(
        Type.Union([Type.Literal('native'), Type.Literal('terraform')], {
          description: 'Owning engine; native is the conversational default',
        }),
      ),
      intent: Type.Optional(
        Type.Unknown({
          description: 'Versioned GCP CE intent for readiness planning or Marketplace agreement qualification',
        }),
      ),
      operation: Type.Optional(
        Type.Union([Type.Literal('deploy'), Type.Literal('teardown')], {
          description: 'Explicit reviewed deployment or owned teardown lifecycle',
        }),
      ),
      approvedPlanHash: Type.Optional(
        Type.String({
          description: 'Exact SHA-256 of the saved deployment, teardown or agreement plan approved for execution',
        }),
      ),
      agreement: Type.Optional(
        Type.String({
          description: 'Exact Google Marketplace agreement resource, if automatic mapping is unavailable',
        }),
      ),
      agreementDocument: Type.Optional(
        Type.String({ description: 'Exact versioned document beneath that agreement; server validation is required' }),
      ),
      enableMarketplaceApi: Type.Optional(
        Type.Boolean({
          description:
            'Explicitly request enabling the scoped Consumer Procurement API prerequisite before consent qualification',
        }),
      ),
    }),
    async execute(_id, params, signal, _update, ctx) {
      let mutationAttempted = false;
      try {
        validateScope(params.project, params.region);
        if (params.engine !== undefined && !['native', 'terraform'].includes(params.engine))
          throw new Error('Invalid owning engine');
        if (signal?.aborted) throw new Error('Operation cancelled');
        const api = makeApi(ctx.cwd);
        if (['gcp_ce_plan', 'gcp_ce_apply'].includes(tool) && params.operation === 'deploy') {
          const intent = params.intent;
          if (
            !intent ||
            intent.project !== params.project ||
            intent.region !== params.region ||
            intent.engine !== (params.engine ?? 'native') ||
            intent.operation !== 'deploy' ||
            (params.deploymentName !== undefined && params.deploymentName !== intent.deploymentName) ||
            (params.platformContext !== undefined && params.platformContext !== intent.platformContext)
          )
            throw new Error('Explicit deployment intent scope required');
          validateIntent(intent);
          if (tool === 'gcp_ce_plan' && params.approvedPlanHash)
            throw new Error('Planning tool cannot apply authorization');
          if (tool === 'gcp_ce_apply' && !params.approvedPlanHash)
            throw new Error('Exact reviewed deployment hash required');
          const platform = await getPlatform();
          const sources = createGcpDeploymentSources(platform, api);
          sources.contract = (signal) => contract(undefined, signal);
          sources.policy = policy;
          sources.preflight = (intent, signal) =>
            preflight(intent, createGcpPreflightPort(api, intent.project), signal);
          sources.funding = (intent, signal) => funding(api, intent.project, signal);
          if (intent.engine === 'terraform') {
            const runtime = await publicTerraformRuntime(platform, api, intent, signal);
            if (tool === 'gcp_ce_plan') {
              const plan = await planPublicTerraformDeployment(runtime, platform, intent, sources, signal);
              return result(tool, { availability: 'review-required', plan, mutationAttempted: false });
            }
            const evidence = await applyPublicTerraformDeployment(
              runtime,
              platform,
              intent,
              params.approvedPlanHash,
              sources,
              signal,
              () => {
                mutationAttempted = true;
              },
            );
            return result(
              tool,
              { availability: 'terraform-deployment', ...evidence, mutationAttempted },
              evidence.state === 'reconciliation-required',
            );
          }
          if (tool === 'gcp_ce_apply') {
            const evidence = await applyGcpDeploymentReview(
              platform,
              api,
              intent,
              params.approvedPlanHash,
              sources,
              signal,
              () => {
                mutationAttempted = true;
              },
            );
            return result(tool, { availability: 'native-deployment', ...evidence, mutationAttempted });
          }
          const plan = await planGcpDeploymentReview(platform, api, intent, sources, signal);
          return result(tool, { availability: 'review-required', plan, mutationAttempted: false });
        }
        if (tool === 'gcp_marketplace_agreement') {
          const intent = params.intent;
          if (
            !intent ||
            intent.project !== params.project ||
            intent.region !== params.region ||
            intent.engine !== (params.engine ?? 'native')
          )
            throw new Error('Explicit Marketplace intent scope required');
          validateIntent(intent);
          if (!!params.agreement !== !!params.agreementDocument)
            throw new Error('Both agreement and document references required');
          const platform = await getPlatform();
          const store = await platform.storage({
            deploymentId: intent.deploymentName,
            provider: 'gcp',
            engine: intent.engine,
            account: intent.project,
            region: intent.region,
          });
          const port = createGcpMarketplacePort(
            api,
            intent,
            params.agreement && params.agreementDocument
              ? { agreement: params.agreement, agreementDocument: params.agreementDocument }
              : undefined,
            undefined,
            signal,
          );
          const release = await acquireProcessLock(join13(store.directory, '.gcp-deployment-lock'));
          try {
            if (params.enableMarketplaceApi) await enableGcpMarketplaceApi(api, intent.project, signal);
            if (intent.image.name.endsWith('-byol') && !params.agreement) {
              const currentFunding = await funding(api, intent.project, signal);
              const source = {
                query: createGcpPreflightPort(api, intent.project).query,
                document: fetchGcpByolDocument,
              };
              if (params.approvedPlanHash) {
                const authorization = await authorizeGcpByolTerms(
                  intent,
                  source,
                  currentFunding,
                  store,
                  params.approvedPlanHash,
                  signal,
                );
                return result(tool, { availability: 'byol-terms-authorized', authorization, mutationAttempted: false });
              }
              const plan = await planGcpByolTerms(intent, source, currentFunding, store, signal);
              return result(tool, { availability: 'review-required', plan, mutationAttempted: false });
            }
            if (params.approvedPlanHash) {
              const receipt = await applyGcpMarketplaceAcceptance(port, store, params.approvedPlanHash, () => {
                mutationAttempted = true;
              });
              return result(tool, { availability: 'accepted', receipt, mutationAttempted });
            }
            const plan = await planGcpMarketplaceAcceptance(port, store);
            return result(tool, { availability: 'review-required', plan, mutationAttempted: false });
          } finally {
            await release();
          }
        }
        if (
          (tool === 'gcp_ce_teardown' && params.deploymentName) ||
          (['gcp_ce_plan', 'gcp_ce_apply'].includes(tool) && params.operation === 'teardown')
        ) {
          if (tool === 'gcp_ce_plan' && params.approvedPlanHash)
            throw new Error('Planning tool cannot apply teardown authorization');
          const engine = params.engine ?? 'native';
          if (
            !params.region ||
            !params.deploymentName ||
            !/^[a-z][a-z0-9-]{0,62}$/.test(params.deploymentName) ||
            !params.platformContext ||
            !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(params.platformContext)
          )
            throw new Error('Explicit persisted teardown scope required');
          const platform = await getPlatform();
          const store = await platform.storage({
            deploymentId: params.deploymentName,
            provider: 'gcp',
            engine,
            account: params.project,
            region: params.region,
          });
          const saved = await store.read(
            engine === 'terraform' ? 'gcp-terraform-input-identity.json' : 'gcp-deployment-intent.json',
          );
          const intent = saved.intent;
          if (
            !intent ||
            intent.project !== params.project ||
            intent.region !== params.region ||
            intent.deploymentName !== params.deploymentName ||
            intent.platformContext !== params.platformContext ||
            intent.engine !== engine
          )
            throw new Error('Persisted teardown intent differs');
          const boundary = await contract(undefined, signal);
          const receipt = await policy();
          if (engine === 'terraform') {
            if (!platform.gcpObservations) throw new Error('Scoped Terraform Platform observations unavailable');
            const observations = await platform.gcpObservations(
              {
                deploymentId: intent.deploymentName,
                provider: 'gcp',
                engine,
                account: intent.project,
                region: intent.region,
              },
              intent.platformContext,
              signal,
            );
            if (!observations.teardown || !observations.terraformEnvironment)
              throw new Error('Qualified Terraform teardown channels unavailable');
            const session = await terraformSession(platform, intent);
            const credentials = await observations.terraformEnvironment();
            const access = await api.exec(
              'gcloud',
              ['auth', 'print-access-token', `--project=${intent.project}`, '--quiet'],
              { signal },
            );
            if (access.exitCode !== 0 || !access.stdout.trim() || /\s/.test(access.stdout.trim()))
              throw new Error('Scoped Terraform Google authentication unavailable');
            const runtime = {
              store,
              session,
              api,
              observePlatform: observations.teardown,
              environment: { ...process.env, ...credentials, GOOGLE_OAUTH_ACCESS_TOKEN: access.stdout.trim() },
            };
            let storedInputs;
            try {
              storedInputs = await store.read('gcp-terraform-session-inputs.json');
            } catch (error) {
              if (error.code !== 'ENOENT') throw error;
            }
            if (storedInputs?.inputs?.configurationVersion === 2) {
              if (params.approvedPlanHash) {
                const evidence = await applyPublicTerraformTeardown(
                  runtime,
                  intent,
                  boundary,
                  receipt,
                  params.approvedPlanHash,
                  signal,
                  () => {
                    mutationAttempted = true;
                  },
                );
                return result(
                  tool,
                  { availability: 'terraform-teardown', ...evidence, mutationAttempted },
                  evidence.state === 'reconciliation-required',
                );
              }
              if (tool === 'gcp_ce_apply') throw new Error('Exact reviewed Terraform cleanup hash required');
              const plan = await planPublicTerraformTeardown(runtime, intent, boundary, receipt, signal);
              return result(tool, { availability: 'review-required', plan, mutationAttempted: false });
            }
            if (params.approvedPlanHash) {
              const evidence = await applyGcpTerraformTeardown(
                runtime,
                intent,
                boundary,
                receipt,
                params.approvedPlanHash,
                signal,
                () => {
                  mutationAttempted = true;
                },
              );
              return result(tool, { availability: 'candidate-terraform-teardown', ...evidence, mutationAttempted });
            }
            if (tool === 'gcp_ce_apply') throw new Error('Exact reviewed Terraform hash required');
            const plan = await planGcpTerraformTeardown(runtime, intent, boundary, receipt, signal);
            return result(tool, { availability: 'review-required', plan, mutationAttempted: false });
          }
          if (params.approvedPlanHash) {
            const evidence = await applyGcpDeploymentTeardown(
              platform,
              api,
              intent,
              params.approvedPlanHash,
              boundary,
              receipt,
              signal,
              () => {
                mutationAttempted = true;
              },
            );
            return result(tool, {
              availability: 'supported-native-teardown',
              ...evidence,
              mutationAttempted,
            });
          }
          if (tool === 'gcp_ce_apply') throw new Error('Exact reviewed hash required');
          const plan = await planGcpDeploymentTeardown(platform, api, intent, boundary, receipt, signal);
          return result(tool, { availability: 'review-required', plan, mutationAttempted: false });
        }
        if (tool === 'gcp_project_identity') {
          const raw = await execGcloudJson(
            api,
            ['projects', 'describe', params.project, `--project=${params.project}`],
            signal,
          );
          if (raw.projectId !== params.project || !/^\d+$/.test(raw.projectNumber ?? ''))
            throw new Error('Project identity mismatch');
          return result(tool, {
            project: raw.projectId,
            projectNumber: raw.projectNumber,
            lifecycleState: raw.lifecycleState,
          });
        }
        if (['gcp_compute_discover', 'gcp_ce_plan'].includes(tool)) {
          if (!params.region) throw new Error('Explicit region required');
          if (
            tool === 'gcp_ce_plan' &&
            (!params.intent ||
              params.intent.project !== params.project ||
              params.intent.region !== params.region ||
              params.intent.engine !== (params.engine ?? 'native'))
          )
            throw new Error('Intent scope/owning engine mismatch');
          if (tool === 'gcp_ce_plan') validateIntent(params.intent);
          const discovery = await discoverGcp(api, params.project, params.region, signal);
          if (tool === 'gcp_compute_discover') return result(tool, { discovery });
          const boundary = await contract(undefined, signal);
          const policyReceipt = await policy();
          const intent = params.intent;
          const profileSupported = supportsGcpLaunchPreflight(intent);
          const prerequisites = profileSupported
            ? await preflight(intent, createGcpPreflightPort(api, params.project), signal)
            : undefined;
          let fundingReceipt;
          try {
            fundingReceipt = await funding(api, intent.project, signal);
          } catch {
            signal?.throwIfAborted();
          }
          let byolAuthorization;
          if (fundingReceipt && intent.image.name.endsWith('-byol')) {
            try {
              const platform = await getPlatform();
              const store = await platform.storage({
                deploymentId: intent.deploymentName,
                provider: 'gcp',
                engine: intent.engine,
                account: intent.project,
                region: intent.region,
              });
              byolAuthorization = await assertGcpByolAuthorization(
                intent,
                { query: createGcpPreflightPort(api, intent.project).query, document: fetchGcpByolDocument },
                fundingReceipt,
                store,
                signal,
              );
            } catch {
              signal?.throwIfAborted();
            }
          }
          const plan = planGcpCe(
            intent,
            discovery,
            Date.now(),
            policyReceipt,
            prerequisites,
            fundingReceipt,
            byolAuthorization,
          );
          return result(tool, { availability: 'unavailable', boundary, plan });
        }
        if (['gcp_ce_inventory', 'gcp_ce_status', 'gcp_ce_diagnose'].includes(tool)) {
          if (!params.deploymentName || !/^[a-z][a-z0-9-]{0,62}$/.test(params.deploymentName))
            throw new Error('Exact deployment name required');
          if (['gcp_ce_status', 'gcp_ce_diagnose'].includes(tool) && params.platformContext) {
            if (!params.region || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(params.platformContext))
              throw new Error('Explicit region and persisted platform context required');
            const platform = await getPlatform();
            if (!platform.gcpObservations) throw new Error('Shared GCP observations unavailable');
            const owner = {
              deploymentId: params.deploymentName,
              provider: 'gcp',
              engine: params.engine ?? 'native',
              account: params.project,
              region: params.region,
            };
            const store = await platform.storage(owner);
            const saved = await store.read(
              owner.engine === 'terraform' ? 'gcp-terraform-input-identity.json' : 'gcp-deployment-intent.json',
            );
            if (
              !saved?.intent ||
              saved.platformContext !== params.platformContext ||
              saved.intent.platformContext !== params.platformContext ||
              saved.intent.engine !== owner.engine ||
              saved.intent.project !== params.project ||
              saved.intent.region !== params.region ||
              saved.intent.deploymentName !== params.deploymentName
            )
              throw new Error('Persisted deployment intent/context differs');
            const observations = await platform.gcpObservations(owner, params.platformContext, signal);
            const evidence = await observeGcpOwnedDeployment(
              store,
              saved.intent,
              (node, zone) => ({
                cloud: () =>
                  execGcloudJson(
                    api,
                    [
                      'compute',
                      'instances',
                      'describe',
                      node,
                      `--project=${params.project}`,
                      `--zone=${zone}`,
                      '--format=json(id,name,zone,status,networkInterfaces)',
                    ],
                    signal,
                  ),
                ...observations,
              }),
              signal,
            );
            return result(tool, { availability: 'read-only', evidence, mutationAttempted: false });
          }
          const raw = await execGcloudJson(api, inventoryArgs(params.project, params.deploymentName), signal);
          if (!Array.isArray(raw)) throw new Error('Malformed inventory');
          const instances = raw
            .filter((r) => r.labels?.['xcsh-deployment'] === params.deploymentName)
            .map((r) => ({
              id: r.id,
              name: r.name,
              zone: r.zone,
              status: r.status,
              ownership: 'candidate-label-only',
            }));
          return result(tool, {
            schemaVersion: 1,
            project: params.project,
            deploymentName: params.deploymentName,
            observedAt: new Date().toISOString(),
            instances,
            cloudProvisioning: 'observed',
            ...UNKNOWN,
            absence: 'not-established',
            owningEngine: 'not-established',
          });
        }
        const boundary = await contract(undefined, signal);
        return result(
          tool,
          {
            availability: 'unavailable',
            reason: boundary.reason,
            boundary,
            engine: params.engine ?? 'native',
            mutationAttempted: false,
            required: [
              'qualified GCP API/policy mappings',
              'shared Platform CE runtime',
              'owning-engine deployment ledger',
              ...(params.engine === 'terraform' ? ['shared Terraform GCP runner'] : []),
            ],
          },
          true,
        );
      } catch (error) {
        signal?.throwIfAborted();
        return result(
          tool,
          {
            availability: 'unavailable',
            reason: mutationAttempted
              ? tool === 'gcp_marketplace_agreement'
                ? 'consent_requires_reconciliation'
                : params.operation === 'deploy'
                  ? 'deployment_requires_reconciliation'
                  : 'teardown_requires_reconciliation'
              : error instanceof GcpMarketplaceUnavailable
                ? error.reason
                : 'validation_or_read_failed',
            mutationAttempted,
            ...(error instanceof GcpMarketplaceUnavailable ? gcpMarketplacePrerequisiteGuidance(error.reason) : {}),
          },
          true,
        );
      }
    },
  }));
}
var UNKNOWN;
var init_gcp_ce = __esm(() => {
  init_process_lock();
  init_service();
  init_byol_terms();
  init_contract();
  init_corporate_funding();
  init_deployment_review();
  init_deployment_teardown();
  init_discovery();
  init_marketplace_agreement();
  init_marketplace_port();
  init_owned_status();
  init_planner();
  init_policy();
  init_preflight();
  init_preflight_port();
  init_terraform_public();
  init_terraform_public_runtime();
  init_terraform_public_teardown();
  init_terraform_session();
  init_terraform_teardown();
  init_validation();
  init_exec();
  init_shared();
  UNKNOWN = {
    registration: 'unknown',
    physicalInterfaceIdentity: 'unknown',
    platformHealth: 'unknown',
    routing: 'unknown',
    applicationTraffic: 'unknown',
  };
});

// plugins/gcloud/src/presentation.ts
init_gcloud_exec_guard();
var record = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});
var rows = (v) => Array.isArray(v) && v.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
var fields = (values, title) => ({
  kind: 'fields',
  title,
  values,
  previewFields: 'all',
});
var labels = new Map([
  ['projectId', 'Project ID'],
  ['projectNumber', 'Project number'],
  ['lifecycleState', 'Lifecycle state'],
  ['name', 'Name'],
  ['zone', 'Zone'],
  ['machineType', 'Machine type'],
  ['status', 'Status'],
  ['internalIp', 'Internal IP'],
  ['externalIp', 'External IP'],
  ['location', 'Location'],
  ['storageClass', 'Storage class'],
  ['created', 'Created'],
  ['ownership', 'Ownership evidence'],
]);
function argv(name, args) {
  switch (name) {
    case 'gcloud_config_list':
      return ['gcloud', ...jsonArgs(['config', 'list'])];
    case 'gcloud_projects_list':
      return ['gcloud', ...jsonArgs(listArgs('projects', args))];
    case 'gcloud_compute_instances_list':
      return ['gcloud', ...jsonArgs(listArgs('instances', args))];
    case 'gcloud_storage_buckets_list':
      return ['gcloud', ...jsonArgs(listArgs('buckets', args))];
    case 'gcloud_help':
      return ['gcloud', ...helpArgs(typeof args.command_path === 'string' ? args.command_path : undefined)];
    case 'gcloud_exec':
      return Array.isArray(args.args) && args.args.every((x) => typeof x === 'string')
        ? ['gcloud', ...buildGcloudArgs(args.args)]
        : undefined;
    case 'gcp_project_identity':
      return typeof args.project === 'string'
        ? ['gcloud', ...jsonArgs(['projects', 'describe', args.project, `--project=${args.project}`])]
        : undefined;
    case 'gcp_ce_inventory':
    case 'gcp_ce_status':
    case 'gcp_ce_diagnose':
      return typeof args.project === 'string' && typeof args.deploymentName === 'string'
        ? ['gcloud', ...jsonArgs(inventoryArgs(args.project, args.deploymentName))]
        : undefined;
  }
}
function presentTool(tool, p) {
  const prefix = (args) => {
    const command = argv(tool.name, args);
    const scope = Object.fromEntries(
      Object.entries(args).filter(([key]) =>
        ['project', 'region', 'zone', 'filter', 'limit', 'deploymentName', 'engine'].includes(key),
      ),
    );
    return [
      ...(command ? [p.command(command)] : []),
      fields(
        {
          ...scope,
          Coverage: 'Returned cloud data does not establish platform, interface, routing or application health.',
        },
        'Scope',
      ),
    ];
  };
  return p.withPresentation(tool, {
    call: (input, options) => ({
      sections: options.expanded ? p.data(record(input)) : prefix(record(input)),
    }),
    result: (result, options, input) => {
      const details = record(result.details),
        base = prefix(record(input));
      const texts = result.content
        .filter((b) => b.type === 'text')
        .map((b) => ({
          kind: 'code',
          title: result.isError ? 'Complete corrective guidance' : 'CLI evidence',
          text: b.text ?? '',
        }));
      if (result.isError) return { summary: 'Google Cloud operation failed', sections: [...base, ...texts] };
      const collection = {
        gcloud_projects_list: 'projects',
        gcloud_compute_instances_list: 'instances',
        gcloud_storage_buckets_list: 'buckets',
        gcp_ce_inventory: 'instances',
        gcp_ce_status: 'instances',
        gcp_ce_diagnose: 'instances',
      }[tool.name];
      if (collection && rows(details[collection])) {
        const items = details[collection],
          { [collection]: _items, ...metadata } = details;
        const keys = [...new Set(items.flatMap((row) => Object.keys(row)))];
        return {
          expandedEvidence: 'provided',
          sections: [
            ...base,
            fields({ 'Returned rows': items.length }, 'Results'),
            {
              ...p.table(
                items,
                keys.map((key) => ({ key, label: labels.get(key) ?? key })),
                collection,
              ),
              previewRows: 12,
            },
            ...(tool.name.startsWith('gcp_')
              ? [fields(metadata, 'Coverage and health boundaries')]
              : p.data(metadata, 'Coverage and metadata')),
          ],
          warnings: options.isPartial ? ['Partial result; execution has not completed.'] : [],
        };
      }
      if (tool.name === 'gcloud_config_list' && Object.keys(record(details.config)).length)
        return {
          expandedEvidence: 'provided',
          sections: [
            ...base,
            fields(record(details.config), 'Configuration identity'),
            ...p.data(
              Object.fromEntries(Object.entries(details).filter(([key]) => !['config', 'tool'].includes(key))),
              'Metadata',
            ),
          ],
        };
      if (
        tool.name === 'gcp_project_identity' &&
        typeof details.project === 'string' &&
        typeof details.projectNumber === 'string'
      )
        return { expandedEvidence: 'provided', sections: [...base, fields(details, 'Project identity')] };
      const discovery = record(details.discovery);
      if (
        tool.name === 'gcp_compute_discover' &&
        discovery.schemaVersion === 1 &&
        typeof discovery.project === 'string' &&
        rows(discovery.images) &&
        rows(discovery.machineTypes) &&
        rows(discovery.quotas) &&
        Array.isArray(discovery.enabledApis) &&
        Array.isArray(discovery.receipts) &&
        Object.keys(record(discovery.checks)).length
      ) {
        const summary = fields(
          {
            Project: discovery.project,
            Region: discovery.region,
            'Observed at': discovery.observedAt,
            'Billing enabled': discovery.billingEnabled,
            Images: discovery.images.length,
            'Machine types': discovery.machineTypes.length,
            'Enabled APIs': discovery.enabledApis.length,
            IAM: record(discovery.checks).iam,
            ...Object.fromEntries(Object.entries(record(discovery.checks)).filter(([key]) => key !== 'iam')),
          },
          'Compute readiness',
        );
        return {
          expandedEvidence: 'provided',
          sections: [
            ...base,
            ...(options.expanded
              ? p.data(details, 'Complete safe discovery evidence')
              : [
                  summary,
                  {
                    ...p.table(
                      discovery.machineTypes,
                      [
                        { key: 'name', label: 'Name' },
                        { key: 'zone', label: 'Zone' },
                        { key: 'guestCpus', label: 'vCPUs' },
                        { key: 'memoryMb', label: 'Memory (MB)' },
                      ],
                      'Machine types',
                    ),
                    previewRows: 12,
                  },
                  {
                    ...p.table(
                      discovery.quotas,
                      [
                        { key: 'metric', label: 'Quota metric' },
                        { key: 'limit', label: 'Limit (metric units)' },
                        { key: 'usage', label: 'Usage (metric units)' },
                      ],
                      'Quotas',
                    ),
                    previewRows: 12,
                  },
                ]),
          ],
          warnings: [
            'Discovery does not qualify IAM, organization policy, capacity, NIC limits or license acceptance.',
          ],
        };
      }
      const plan = record(details.plan);
      if (
        tool.name === 'gcp_ce_plan' &&
        plan.schemaVersion === 1 &&
        typeof plan.planHash === 'string' &&
        plan.executable === false &&
        Array.isArray(plan.actions) &&
        Array.isArray(plan.unavailable) &&
        Object.keys(record(plan.intent)).length
      ) {
        return {
          expandedEvidence: 'provided',
          sections: [
            ...base,
            ...(options.expanded
              ? p.data(details, 'Complete safe plan evidence')
              : [
                  fields(
                    {
                      'Plan hash': plan.planHash,
                      Executable: plan.executable,
                      Engine: plan.engine,
                      Approval: plan.approval,
                      'Disk (GiB)': record(plan.intent).diskGiB,
                      Prerequisites: plan.unavailable,
                      Availability: details.availability,
                    },
                    'Customer Edge readiness plan',
                  ),
                ]),
          ],
          warnings: ['Readiness plan is non-executable; no mutation or approval was attempted.'],
        };
      }
      if (tool.name === 'gcloud_exec' && typeof details.fullOutput === 'string') {
        try {
          return {
            expandedEvidence: 'provided',
            sections: [...base, ...p.data(JSON.parse(details.fullOutput), 'Complete CLI result')],
            warnings: details.modelPreviewTruncated
              ? ['Model preview was truncated; complete CLI output is available.']
              : [],
          };
        } catch {}
      }
      return { sections: [...base, ...texts] };
    },
  });
}

// plugins/gcloud/src/index.ts
init_shared();
function sanitizeHintField(value, maxLen = 200) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen);
}
function retryAfterMsFromHeaders(text, now = Date.now()) {
  const retryAfter = text.match(/(?:^|\r?\n)retry-after:\s*([^\r\n]+)/i)?.[1]?.trim();
  if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1000;
  if (retryAfter) {
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - now);
  }
  const reset = text.match(/(?:^|\r?\n)x-ratelimit-reset:\s*(\d+)/i)?.[1];
  return reset ? Math.max(0, Number(reset) * 1000 - now) : undefined;
}
function gcloudInstallArgv(platform = process.platform) {
  if (platform === 'darwin') return ['brew', 'install', '--cask', 'google-cloud-sdk'];
  if (platform === 'win32') return ['winget', 'install', '--exact', '--id', 'Google.CloudSDK'];
  return ['sudo', 'apt-get', 'install', '--yes', 'google-cloud-cli'];
}
function withErrorType(tool) {
  const originalExecute = tool.execute.bind(tool);
  return {
    ...tool,
    execute: async (...args) => {
      try {
        return await originalExecute(...args);
      } catch (err) {
        const name = err?.name;
        if (name === 'AbortError' || name === 'ToolAbortError') throw err;
        return errorResult(renderError(err), { tool: tool.name, errorType: detectErrorType(err) });
      }
    },
  };
}
var factory = async (pi) => {
  const presentTool2 = (tool) => presentTool(tool, pi.presentation);
  pi.setLabel('GCloud');
  const integration = pi.integrations.register({
    id: 'gcloud',
    name: 'Google Cloud',
    plugin: 'gcloud',
    kind: 'network',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: [],
      profileFields: ['accounts'],
      steps: [
        {
          kind: 'install',
          argv: gcloudInstallArgv(),
          timeoutMs: 300000,
        },
        { kind: 'login', argv: ['gcloud', 'auth', 'login'], timeoutMs: 300000 },
      ],
      verification: [{ argv: ['gcloud', 'auth', 'list', '--filter=status:ACTIVE', '--format=json'], timeoutMs: 30000 }],
    },
    async probe() {
      const checker = process.platform === 'win32' ? 'where' : 'which';
      if (Bun.spawnSync([checker, 'gcloud']).exitCode !== 0) return { state: 'setup_required', reason: 'cli_missing' };
      const auth = Bun.spawnSync(['gcloud', 'auth', 'list', '--filter=status:ACTIVE', '--format=json']);
      if (auth.exitCode !== 0) {
        const rawError = new TextDecoder().decode(auth.stderr);
        if (/rate limit|too many requests|resource_exhausted|429/i.test(rawError))
          return { state: 'rate_limited', reason: 'rate_limited', retryAfterMs: retryAfterMsFromHeaders(rawError) };
        return { state: 'setup_required', reason: 'not_authenticated' };
      }
      try {
        const accounts = JSON.parse(new TextDecoder().decode(auth.stdout));
        const account = accounts[0]?.account;
        if (!account) return { state: 'setup_required', reason: 'not_authenticated' };
        const configResult = Bun.spawnSync(['gcloud', 'config', 'list', '--format=json']);
        if (configResult.exitCode !== 0) {
          const rawError = new TextDecoder().decode(configResult.stderr);
          if (/rate limit|too many requests|resource_exhausted|429/i.test(rawError))
            return { state: 'rate_limited', reason: 'rate_limited', retryAfterMs: retryAfterMsFromHeaders(rawError) };
          return { state: 'degraded', reason: 'invalid_response' };
        }
        const config = JSON.parse(new TextDecoder().decode(configResult.stdout));
        return {
          state: 'ready',
          value: {
            account,
            project: config.core?.project,
            region: config.compute?.region,
            zone: config.compute?.zone,
          },
        };
      } catch {
        return { state: 'error', reason: 'invalid_response' };
      }
    },
    profile(value) {
      const principalType = value.account.endsWith('.gserviceaccount.com') ? 'service' : 'user';
      return {
        facts: {
          accounts: [
            {
              provider: 'gcloud',
              identifier: value.account,
              principalType,
              accountId: value.project,
              username: value.account,
            },
          ],
        },
        observations: [],
      };
    },
  });
  let gcloudAvailable = false;
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    gcloudAvailable = Bun.spawnSync([checker, 'gcloud']).exitCode === 0;
  } catch {}
  if (gcloudAvailable && typeof pi.registerTool === 'function') {
    await Promise.resolve().then(() => init_gcloud_config_list2());
    await Promise.resolve().then(() => init_gcloud_projects_list2());
    await Promise.resolve().then(() => init_gcloud_compute_instances_list2());
    await Promise.resolve().then(() => init_gcloud_storage_buckets_list2());
    await Promise.resolve().then(() => init_gcloud_exec2());
    await Promise.resolve().then(() => init_gcloud_help2());
    await Promise.resolve().then(() => init_gcp_ce());
    pi.registerTool(presentTool2(withErrorType(createGcloudConfigListTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createGcloudProjectsListTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createGcloudComputeInstancesListTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createGcloudStorageBucketsListTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createGcloudExecTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createGcloudHelpTool(pi))));
    for (const tool of createGcpCeTools(pi)) pi.registerTool(presentTool2(withErrorType(tool)));
  }
  if (gcloudAvailable && typeof pi.on === 'function') {
    pi.on('before_agent_start', async () => {
      try {
        const snapshot = await integration.get();
        if (snapshot.state !== 'ready' || !snapshot.value) return;
        const config = snapshot.value;
        const lines = [
          config.project ? `Project: ${sanitizeHintField(config.project)}` : '',
          config.account ? `Account: ${sanitizeHintField(config.account)}` : '',
          config.region ? `Region: ${sanitizeHintField(config.region)}` : '',
          config.zone ? `Zone: ${sanitizeHintField(config.zone)}` : '',
        ]
          .filter(Boolean)
          .join(`
`);
        if (!lines) return;
        return {
          message: { customType: 'gcloud_hint', content: lines, display: false },
        };
      } catch {
        return;
      }
    });
  }
  if (typeof pi.on === 'function') {
    pi.on('session_start', async (_event, _ctx) => {
      if (!gcloudAvailable) {
        pi.logger.debug('GCloud: gcloud CLI not found');
      }
    });
  }
};
var src_default = factory;

export { gcloudInstallArgv, retryAfterMsFromHeaders, src_default as default, withErrorType };
