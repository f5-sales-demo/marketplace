// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
// plugins/aws/src/aws/arguments.ts
var normalizeProfile = (profile) => (profile !== undefined && /^ *$/.test(profile) ? undefined : profile);
var jsonArgs = (args) => [...args, '--output', 'json'];
function identityArgs(profile) {
  const selected = normalizeProfile(profile);
  return ['sts', 'get-caller-identity', ...(selected ? ['--profile', selected] : [])];
}
function instanceArgs(params) {
  return [
    'ec2',
    'describe-instances',
    ...(params.region ? ['--region', params.region] : []),
    ...(params.instanceIds?.length ? ['--instance-ids', ...params.instanceIds] : []),
    ...(params.filters?.length ? ['--filters', ...params.filters] : []),
  ];
}
var s3Args = (target) => (target ? ['s3', 'ls', target] : ['s3api', 'list-buckets']);
var helpArgs = (path) => [...(path?.trim().split(' ').filter(Boolean) ?? []), 'help'];

// plugins/aws/src/tools/aws-exec-guard.ts
var READ_TOP = new Set(['help']);
var S3_READ_OPS = new Set(['ls']);
var S3_WRITE_OPS = new Set(['cp', 'mv', 'rm', 'sync', 'mb', 'rb']);
var READ_PREFIXES = [
  'describe-',
  'list-',
  'get-',
  'lookup-',
  'search-',
  'batch-get-',
  'head-',
  'estimate-',
  'simulate-',
  'preview-',
  'filter-',
  'check-',
  'resolve-',
];
var READ_EXACT = new Set(['ls', 'wait', 'help', 'scan', 'select', 'query']);
var VALUE_FLAGS = new Set([
  '--region',
  '--profile',
  '--output',
  '--query',
  '--endpoint-url',
  '--color',
  '--ca-bundle',
  '--cli-read-timeout',
  '--cli-connect-timeout',
  '--page-size',
  '--max-items',
  '--starting-token',
]);
function getPositionals(args) {
  return args.filter((a, i) => {
    if (a.startsWith('-')) return false;
    if (i > 0) {
      const prev = args[i - 1];
      if (VALUE_FLAGS.has(prev) && !prev.includes('=')) return false;
    }
    return true;
  });
}
var WRITE_DELEGATION =
  'aws_exec is read-only by default. Run write/destructive operations through an ' +
  'explicitly confirmed path (delegate to the aws:cli-operator agent), not aws_exec.';
function findMutation(args) {
  const positionals = getPositionals(args);
  if (positionals.length === 0) {
    return { blocked: true, reason: 'no aws command provided' };
  }
  const service = positionals[0];
  const op = positionals[1];
  if (READ_TOP.has(service)) return { blocked: false };
  if (service === 's3') {
    if (op && S3_READ_OPS.has(op)) return { blocked: false };
    if (op && S3_WRITE_OPS.has(op)) {
      return { blocked: true, reason: `"s3 ${op}" writes to S3. ${WRITE_DELEGATION}` };
    }
    return {
      blocked: true,
      reason: op
        ? `"s3 ${op}" is not a recognized read-only S3 command. ${WRITE_DELEGATION}`
        : `"s3" requires a subcommand; only "s3 ls" is allowed as read-only. ${WRITE_DELEGATION}`,
    };
  }
  if (!op) {
    return {
      blocked: true,
      reason: `"${service}" has no operation; provide a read-only operation. ${WRITE_DELEGATION}`,
    };
  }
  const isRead = READ_EXACT.has(op) || READ_PREFIXES.some((p) => op.startsWith(p));
  if (isRead) return { blocked: false };
  return {
    blocked: true,
    reason: `"${service} ${op}" is not a recognized read-only aws operation. ${WRITE_DELEGATION}`,
  };
}
function buildAwsArgs(args) {
  const hasOutput = args.some(
    (a) => a === '--output' || a === '-o' || a.startsWith('--output=') || a.startsWith('-o='),
  );
  return hasOutput ? [...args] : [...args, '--output', 'json'];
}

// plugins/aws/src/aws/exec.ts
class AwsExecError extends Error {
  exitCode;
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
    this.name = 'AwsExecError';
  }
}

class AwsAuthError extends AwsExecError {
  constructor(message, exitCode = 1) {
    super(message, exitCode);
    this.name = 'AwsAuthError';
  }
}

class AwsSessionExpiredError extends AwsExecError {
  constructor(message, exitCode = 1) {
    super(message, exitCode);
    this.name = 'AwsSessionExpiredError';
  }
}

class AwsNotFoundError extends AwsExecError {
  constructor(message, exitCode = 1) {
    super(message, exitCode);
    this.name = 'AwsNotFoundError';
  }
}

class AwsThrottlingError extends AwsExecError {
  constructor(message, exitCode = 1) {
    super(message, exitCode);
    this.name = 'AwsThrottlingError';
  }
}

class AwsAccessDeniedError extends AwsExecError {
  constructor(message, exitCode = 1) {
    super(message, exitCode);
    this.name = 'AwsAccessDeniedError';
  }
}
function detectAwsError(stderr, exitCode) {
  const lower = stderr.toLowerCase();
  if (
    lower.includes('unable to locate credentials') ||
    lower.includes('could not be found') ||
    lower.includes('no credentials')
  ) {
    return new AwsAuthError(
      `${stderr.trim()}
Run: xcsh plugin setup aws`,
      exitCode,
    );
  }
  if (
    lower.includes('expiredtoken') ||
    lower.includes('invalidclienttokenid') ||
    lower.includes('token included in the request is expired') ||
    lower.includes('sso token') ||
    (lower.includes('sso') && lower.includes('expired'))
  ) {
    return new AwsSessionExpiredError(
      `${stderr.trim()}
Run: xcsh plugin setup aws`,
      exitCode,
    );
  }
  if (
    lower.includes('throttling') ||
    lower.includes('requestlimitexceeded') ||
    lower.includes('rate exceeded') ||
    lower.includes('toomanyrequests')
  ) {
    return new AwsThrottlingError(stderr, exitCode);
  }
  if (
    lower.includes('accessdenied') ||
    lower.includes('unauthorizedoperation') ||
    lower.includes('not authorized to perform')
  ) {
    return new AwsAccessDeniedError(stderr, exitCode);
  }
  if (
    lower.includes('notfound') ||
    lower.includes('does not exist') ||
    lower.includes('nosuchentity') ||
    lower.includes('nosuchbucket')
  ) {
    return new AwsNotFoundError(stderr, exitCode);
  }
  return new AwsExecError(stderr, exitCode);
}
function parseAwsJsonOutput(raw) {
  try {
    if (!raw || raw.trim().length === 0) {
      throw new AwsExecError('Empty output from aws CLI');
    }
    return JSON.parse(raw);
  } catch (err) {
    if (err instanceof AwsExecError) throw err;
    throw new AwsExecError(`Failed to parse aws CLI output: ${err.message}`);
  }
}
async function execAwsJson(api, args, signal) {
  const fullArgs = jsonArgs(args);
  const result = await api.exec('aws', fullArgs, { signal });
  if (result.exitCode !== 0) {
    throw detectAwsError(result.stderr, result.exitCode);
  }
  return parseAwsJsonOutput(result.stdout);
}
async function execAwsRaw(api, args, signal) {
  const result = await api.exec('aws', args, { signal });
  if (result.exitCode !== 0) {
    throw detectAwsError(result.stderr, result.exitCode);
  }
  return result;
}

// plugins/aws/src/tools/shared.ts
function textResult(text, details) {
  return { content: [{ type: 'text', text }], details };
}
function errorResult(text, details) {
  return { content: [{ type: 'text', text }], isError: true, details };
}
function detectErrorType(err) {
  if (err instanceof AwsAuthError) return 'auth_required';
  if (err instanceof AwsSessionExpiredError) return 'session_expired';
  if (err instanceof AwsThrottlingError) return 'throttled';
  if (err instanceof AwsAccessDeniedError) return 'access_denied';
  if (err instanceof AwsNotFoundError) return 'not_found';
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

export {
  AwsExecError,
  AwsNotFoundError,
  buildAwsArgs,
  detectAwsError,
  detectErrorType,
  errorResult,
  execAwsJson,
  execAwsRaw,
  findMutation,
  hasControlChars,
  helpArgs,
  identityArgs,
  instanceArgs,
  jsonArgs,
  makeExecApi,
  normalizeProfile,
  renderError,
  s3Args,
  textResult,
};
