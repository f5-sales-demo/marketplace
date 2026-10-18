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
  const fullArgs = [...args, '--format=json'];
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
  return {
    async exec(command, args, options) {
      const signal = options?.signal;
      const child = Bun.spawn([command, ...args], {
        cwd,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
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
  };
}
var init_shared = __esm(() => {
  init_exec();
});

// plugins/gcloud/src/gcloud/formatters.ts
function basename(url) {
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
    zone: basename(String(raw.zone ?? '')),
    machineType: basename(String(raw.machineType ?? '')),
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
      const args = ['projects', 'list'];
      if (params.filter) args.push(`--filter=${params.filter}`);
      if (params.limit !== undefined) args.push(`--limit=${String(params.limit)}`);
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
      const args = ['compute', 'instances', 'list'];
      if (params.zone) args.push(`--zones=${params.zone}`);
      if (params.filter) args.push(`--filter=${params.filter}`);
      if (params.limit !== undefined) args.push(`--limit=${String(params.limit)}`);
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
      const args = ['storage', 'buckets', 'list'];
      if (params.filter) args.push(`--filter=${params.filter}`);
      if (params.limit !== undefined) args.push(`--limit=${String(params.limit)}`);
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
var gcloud_exec_default =
  '# Execute Google Cloud CLI Commands\n\nExecute any `gcloud` CLI command directly.\n\nThis is the general-purpose tool for running Google Cloud CLI commands that are not covered by the typed tools. Use typed tools when available \u2014 they validate inputs and return structured data.\n\n## Usage\n\nPass the group, verb, and flags as an array of arguments. Do NOT include `gcloud` itself \u2014 it is prepended automatically.\n\n**Example:** To run `gcloud compute instances list --filter="status=RUNNING"`:\n\n```json\n{ "args": ["compute", "instances", "list", "--filter=status=RUNNING"] }\n```\n\n## Safety\n\n- Arguments are passed as an array directly to the `gcloud` binary \u2014 **no shell** is involved, so shell metacharacters are inert and never filtered. Any valid `gcloud` invocation runs, including full `--filter` and `--format` expressions. Only NUL/control bytes are rejected.\n- **Read-only by default.** Only recognized read verbs run:\n  - Exact reads: `list`, `describe`, `get-iam-policy`, `get-value`, `get-server-config`, `get-ancestors`, `list-grantable-roles`, `print-settings`, `version`, `info`.\n  - Read prefixes: any verb starting with `list-` or `describe-`.\n  - Top-level: `version`, `info`, `help`, `topic`, `cheat-sheet`.\n- **Mutating verbs are blocked** (`create`, `delete`, `update`, `patch`, `set`, `deploy`, `enable`, `disable`, `set-iam-policy`, `add-iam-policy-binding`, \u2026). Run write/destructive operations through an explicitly confirmed path \u2014 delegate to the `gcloud:cli-operator` agent, not `gcloud_exec`.\n- **Execution and credential vectors are blocked** even though some look read-shaped: `ssh`, `scp`, `connect`, `call`, `execute`, `interactive`, `login`, `revoke`, `get-credentials`, `print-access-token`, `print-identity-token`, `reset-windows-password`, `simulate-maintenance-event`, `enable-service`, `configure-docker`.\n  These open sessions, run code, or mint/print credentials \u2014 route them through the `gcloud:cli-operator` agent.\n- Unrecognized verbs are blocked (fail-safe): provide an explicit read-only verb.\n- Output is capped to prevent context overflow.\n\n## Querying: `--filter` vs `--format`\n\ngcloud splits querying into two distinct, complementary flags. This is **not** Azure `--query` (JMESPath): filtering and projection are separate.\n\n### `--filter` \u2014 server-side selection (which resources)\n\nRestricts *which* resources are returned, evaluated before results are sent back.\n\n- Equality: `--filter="status=RUNNING"` (`key=value`)\n- Boolean logic: `--filter="status=RUNNING AND zone:us-central1"` (`AND` / `OR`)\n- Substring match: `--filter="name:prod"` (`:` \u2014 has-substring)\n- Regex match: `--filter="name~^web-.*"` (`~`)\n\n### `--format` \u2014 client-side projection (how to show it)\n\nShapes *how* the selected resources are rendered locally.\n\n- `--format=json` (default when you pass no `--format`)\n- `--format=value(name)` \u2014 bare field value(s), no keys\n- `--format="table(name,status,zone)"` \u2014 tabular columns\n- `--format=csv(name,status)` \u2014 comma-separated\n- `--format=yaml` \u2014 YAML document\n- `--format=flattened` \u2014 flat `key: value` lines\n\n## Tips\n\n- `--format=json` is added automatically unless you pass your own `--format` (e.g. `--format="table(name)"`, `--format=yaml`), which is respected.\n- `--limit=N` caps the number of results; `--sort-by=field` orders them.\n- `--project=PROJECT_ID` targets a specific Google Cloud project.\n- Combine freely: `["compute", "instances", "list", "--filter=status=RUNNING", "--sort-by=name", "--format=value(name)"]`.\n';
var init_gcloud_exec = () => {};

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
          return errorResult(`gcloud command failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`, {
            ...base,
            errorType: detectErrorType(detectGcloudError(result.stderr, result.exitCode)),
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
      const args = [...parts, '--help'];
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
      const current = JSON.stringify(node.interfaces);
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

// plugins/gcloud/src/ce/contract.ts
import { createHash as createHash2 } from 'node:crypto';

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
  if (`sha256:${createHash2('sha256').update(bytes).digest('hex')}` !== GCP_CE_API_RELEASE.contractDigest)
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
  return {
    release: GCP_CE_API_RELEASE,
    fingerprint: fingerprint(contract),
    availability: 'unavailable',
    reason: Object.hasOwn(contract.providers, 'gcp')
      ? 'gcp_provider_requires_consumer_qualification'
      : 'gcp_provider_not_published',
    ...(observations ? { observations } : {}),
  };
}
var GCP_CE_API_RELEASE;
var init_contract = __esm(() => {
  init_discovery();
  GCP_CE_API_RELEASE = {
    repository: 'f5-sales-demo/api-specs-enriched',
    tag: 'v12.1.2',
    contractDigest: 'sha256:07f797c5d48fe8fc7557add08242cb5fff04ffe69f669c84ce377ca7c6abc325',
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

// plugins/platform/src/ce/process-lock.ts
var init_process_lock = () => {};

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

// plugins/platform/src/ce/gcp-observation.ts
var init_gcp_observation = __esm(() => {
  init_discovery();
  init_runtime();
});

// plugins/platform/src/ce/verified-api-release.ts
var repository = 'f5-sales-demo/api-specs-enriched',
  tag = 'v7.0.1',
  commit = '2513fe498149c98fb737ff2ab207704b8a86fec6',
  digest = 'sha256:48863c0a2e6c6a6fde050f4f8f5a6966b02872851fa1acb7830f26ef2e143cd9',
  _assetUrl,
  _CE_API_RELEASE;
var init_verified_api_release = __esm(() => {
  _assetUrl = `https://github.com/${repository}/releases/download/${tag}/openapi.json`;
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
  init_deployment_store();
  init_gcp_observation();
  init_runtime();
  init_verified_contract();
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
var COLLECTIONS;
var init_ownership = __esm(() => {
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

// plugins/gcloud/src/ce/interface-identity.ts
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed GCP interface identity evidence');
  return value;
}
function correlateGcpPhysicalInterfaces(expected, cloudValue, registrationValue, configurationValue) {
  const cloud = object(cloudValue),
    registration = object(registrationValue),
    configuration = object(configurationValue);
  if (
    !/^\d+$/.test(expected.instanceId) ||
    cloud.id !== expected.instanceId ||
    cloud.name !== expected.nodeName ||
    cloud.zone !== `https://www.googleapis.com/compute/v1/projects/${expected.project}/zones/${expected.zone}`
  )
    throw new Error('Owned GCP VM identity mismatch');
  const metadata = object(configuration.metadata);
  if (metadata.name !== expected.siteName || metadata.namespace !== 'system')
    throw new Error('Exact GCP site configuration identity required');
  const spec = object(registration.get_spec),
    infra = object(spec.infra),
    passport = object(spec.passport);
  const status = object(object(registration.object).status);
  if (
    infra.provider !== 'GOOGLE' ||
    String(infra.instance_id) !== expected.instanceId ||
    infra.hostname !== expected.nodeName ||
    infra.availability_zone !== expected.zone ||
    passport.cluster_name !== expected.siteName ||
    status.current_state !== 'ONLINE'
  )
    throw new Error('Registration is not ONLINE for the exact owned GCP node');
  const nodes = object(object(object(configuration.spec).gcp).not_managed).node_list;
  if (!Array.isArray(nodes)) throw new Error('Missing configured GCP node inventory');
  const matches = nodes.map(object).filter((node) => node.hostname === expected.nodeName);
  if (matches.length !== 1) throw new Error('Exact configured GCP node must be unique');
  const configured = matches[0].interface_list;
  const hardware = object(infra.hw_info).network;
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
      const nic = object(value),
        ethernet = object(nic.ethernet_interface),
        option = object(nic.network_option);
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
        .map(object)
        .filter(
          (item) =>
            item.name === ethernet.device &&
            typeof item.mac_address === 'string' &&
            item.mac_address.toLowerCase() === mac,
        );
      if (hw.length !== 1 || !Array.isArray(hw[0].ip_address)) throw new Error('Device/MAC hardware join is ambiguous');
      const addresses = hw[0].ip_address.map((address) => (typeof address === 'string' ? address.split('/')[0] : ''));
      const indices = cloudNics
        .map(object)
        .flatMap((cloudNic, index) => (addresses.includes(String(cloudNic.networkIP)) ? [index] : []));
      if (indices.length !== 1 || used.has(indices[0])) throw new Error('Cloud address/NIC join is ambiguous');
      const index = indices[0],
        cloudNic = object(cloudNics[index]);
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

// plugins/gcloud/src/ce/status.ts
function object2(value) {
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
    return object2(value);
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
    const metadata = object2(configuration.metadata);
    if (metadata.name !== expected.siteName || metadata.namespace !== 'system') return evidence;
    const response = await read('xc-site-registrations', () => source.registrations(expected.siteName, signal));
    if (
      !Array.isArray(response.items) ||
      (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length)) ||
      response.next_page_token ||
      response.continue
    )
      return evidence;
    const matches = response.items.map(object2).filter((item) => {
      const spec = object2(item.get_spec),
        infra = object2(spec.infra),
        passport = object2(spec.passport);
      return infra.hostname === expected.nodeName && passport.cluster_name === expected.siteName;
    });
    if (matches.length !== 1) return evidence;
    registration = matches[0];
    const infra = object2(object2(registration.get_spec).infra);
    const state = object2(object2(registration.object).status).current_state;
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
  return {
    schemaVersion: 1,
    project: intent.project,
    region: intent.region,
    deploymentName: intent.deploymentName,
    platformContext: intent.platformContext,
    engine: intent.engine,
    nodes: observations,
    routing: 'unknown',
    applicationTraffic: 'unknown',
    haHealth: 'not-established',
    absence: 'not-established',
  };
}
var init_owned_status = __esm(() => {
  init_discovery();
  init_ownership();
  init_status();
  init_validation();
});

// plugins/gcloud/src/ce/planner.ts
function planGcpCe(intent, discovery, now = Date.now(), policyReceipt) {
  validateIntent(intent);
  if (discovery.schemaVersion !== 1 || discovery.project !== intent.project || discovery.region !== intent.region)
    throw new Error('Discovery scope does not match the intent');
  const observed = Date.parse(discovery.observedAt);
  if (!Number.isFinite(observed) || observed > now || now - observed > 5 * 60000) throw new Error('Discovery is stale');
  if (!discovery.images.some((image) => fingerprint(image) === fingerprint(intent.image)))
    throw new Error('Exact image and license identity is not present in discovery');
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
    ...['compute.googleapis.com', 'serviceusage.googleapis.com']
      .filter((api) => !discovery.enabledApis.includes(api))
      .map((api) => `api_not_enabled:${api}`),
    ...Object.keys(discovery.checks).map((check) => `${check}_not_verified`),
    'quota_headroom_not_qualified',
    'routing_and_return_path_not_qualified',
  ];
  const body = {
    schemaVersion: 1,
    policyIdentity: GCP_CE_POLICY,
    ...(policyReceipt ? { policyReceipt } : {}),
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
  init_discovery();
  init_types2();
  init_validation();
});

// plugins/gcloud/src/ce/policy.ts
import { createHash as createHash3 } from 'node:crypto';

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
    normalizedSha256: `sha256:${createHash3('sha256').update(normalized).digest('hex')}`,
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

// plugins/gcloud/src/tools/gcp-ce.ts
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
) {
  const { Type } = pi.typebox;
  const definitions = [
    ['gcp_project_identity', 'Read explicit GCP project identity. Does not change the active project or authenticate.'],
    [
      'gcp_compute_discover',
      'Discover exact F5 images and licenses, billing, APIs, machines and quotas for an explicit project/region. Unknown prerequisites remain explicit.',
    ],
    [
      'gcp_ce_inventory',
      'List cloud instances labeled for a CE deployment. Labels are candidate ownership only; platform registration, interface identity and traffic remain unknown.',
    ],
    [
      'gcp_ce_plan',
      'Validate a versioned GCP CE intent and return a hashed, non-executable readiness plan. Supports native or explicit Terraform. Never accepts caller discovery/health evidence.',
    ],
    [
      'gcp_ce_apply',
      'Report GCP CE execution availability. Native/Terraform mutation is unavailable until verified API mappings and shared runtime/runner are integrated.',
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
    ['gcp_ce_teardown', 'Report GCP teardown availability; labels alone never authorize deletion.'],
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
      intent: Type.Optional(Type.Unknown({ description: 'Versioned GCP CE intent; only used by gcp_ce_plan' })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        validateScope(params.project, params.region);
        if (params.engine !== undefined && !['native', 'terraform'].includes(params.engine))
          throw new Error('Invalid owning engine');
        if (signal?.aborted) throw new Error('Operation cancelled');
        const api = makeApi(ctx.cwd);
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
          const policyReceipt = await readGcpCePolicy();
          const plan = planGcpCe(params.intent, discovery, Date.now(), policyReceipt);
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
          const raw = await execGcloudJson(
            api,
            [
              'compute',
              'instances',
              'list',
              `--project=${params.project}`,
              `--filter=labels.xcsh-deployment=${params.deploymentName}`,
              '--format=json(id,name,zone,status,labels)',
            ],
            signal,
          );
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
      } catch {
        signal?.throwIfAborted();
        return result(
          tool,
          { availability: 'unavailable', reason: 'validation_or_read_failed', mutationAttempted: false },
          true,
        );
      }
    },
  }));
}
var UNKNOWN;
var init_gcp_ce = __esm(() => {
  init_service();
  init_contract();
  init_discovery();
  init_owned_status();
  init_planner();
  init_policy();
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
function presentTool(tool, p) {
  return p.withPresentation(tool, {
    command: 'gcloud',
    scopeKeys: ['project', 'filter', 'zone', 'region', 'limit', 'deploymentName', 'engine'],
    collections: ['projects', 'instances', 'buckets'],
    labels: Object.fromEntries([
      ['projectId', 'Project ID'],
      ['projectNumber', 'Project number'],
      ['name', 'Name'],
      ['zone', 'Zone'],
      ['status', 'Status'],
      ['machineType', 'Machine type'],
      ['location', 'Location'],
    ]),
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
