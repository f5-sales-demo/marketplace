// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
var __esm = (fn, res, err) => () => {
  if (fn)
    try {
      res = fn((fn = 0));
    } catch (e) {
      err = [e];
    }
  if (err) throw err[0];
  return res;
};

// plugins/aws/src/aws/exec.ts
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
  const fullArgs = [...args, '--output', 'json'];
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
var AwsExecError, AwsAuthError, AwsSessionExpiredError, AwsNotFoundError, AwsThrottlingError, AwsAccessDeniedError;
var init_exec = __esm(() => {
  AwsExecError = class AwsExecError extends Error {
    exitCode;
    constructor(message, exitCode = 1) {
      super(message);
      this.exitCode = exitCode;
      this.name = 'AwsExecError';
    }
  };
  AwsAuthError = class AwsAuthError extends AwsExecError {
    constructor(message, exitCode = 1) {
      super(message, exitCode);
      this.name = 'AwsAuthError';
    }
  };
  AwsSessionExpiredError = class AwsSessionExpiredError extends AwsExecError {
    constructor(message, exitCode = 1) {
      super(message, exitCode);
      this.name = 'AwsSessionExpiredError';
    }
  };
  AwsNotFoundError = class AwsNotFoundError extends AwsExecError {
    constructor(message, exitCode = 1) {
      super(message, exitCode);
      this.name = 'AwsNotFoundError';
    }
  };
  AwsThrottlingError = class AwsThrottlingError extends AwsExecError {
    constructor(message, exitCode = 1) {
      super(message, exitCode);
      this.name = 'AwsThrottlingError';
    }
  };
  AwsAccessDeniedError = class AwsAccessDeniedError extends AwsExecError {
    constructor(message, exitCode = 1) {
      super(message, exitCode);
      this.name = 'AwsAccessDeniedError';
    }
  };
});

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
var init_shared = __esm(() => {
  init_exec();
});

// plugins/aws/src/aws/formatters.ts
function normalizeIdentity(raw) {
  return {
    Account: String(raw.Account ?? ''),
    Arn: String(raw.Arn ?? ''),
    UserId: String(raw.UserId ?? ''),
  };
}
function normalizeBucket(raw) {
  return {
    name: String(raw.Name ?? ''),
    creationDate: String(raw.CreationDate ?? ''),
  };
}
function normalizeInstance(raw) {
  const state = raw.State ?? {};
  const placement = raw.Placement ?? {};
  const tags = raw.Tags ?? [];
  const nameTag = tags.find((t) => String(t.Key ?? '') === 'Name');
  return {
    instanceId: String(raw.InstanceId ?? ''),
    state: String(state.Name ?? ''),
    type: String(raw.InstanceType ?? ''),
    az: String(placement.AvailabilityZone ?? ''),
    privateIp: String(raw.PrivateIpAddress ?? ''),
    publicIp: String(raw.PublicIpAddress ?? ''),
    name: nameTag ? String(nameTag.Value ?? '') : '',
  };
}
function normalizeReservations(raw) {
  const reservations = raw.Reservations ?? [];
  const out = [];
  for (const reservation of reservations) {
    const instances = reservation.Instances ?? [];
    for (const inst of instances) out.push(normalizeInstance(inst));
  }
  return out;
}
function parseS3LsOutput(raw) {
  const out = [];
  for (const line of raw.split(`
`)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith('PRE ')) {
      out.push({ key: trimmed.slice(4).trim(), size: 0, lastModified: '' });
      continue;
    }
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+(\d+)\s+(.+)$/);
    if (match) {
      out.push({ key: match[3], size: Number(match[2]), lastModified: match[1] });
    }
  }
  return out;
}
function formatIdentityDetail(identity) {
  return [
    `**Account:** ${identity.Account || '-'}`,
    `**ARN:** ${identity.Arn || '-'}`,
    `**User ID:** ${identity.UserId || '-'}`,
  ].join(`
`);
}
function formatBucketTable(buckets) {
  if (buckets.length === 0) return 'No buckets found.';
  const header = '| Name | Creation Date |';
  const sep = '|------|---------------|';
  const rows = buckets.map((b) => `| ${b.name} | ${b.creationDate || '-'} |`);
  return [header, sep, ...rows].join(`
`);
}
function formatS3ObjectTable(objects) {
  if (objects.length === 0) return 'No objects found.';
  const header = '| Key | Size | Last Modified |';
  const sep = '|-----|------|---------------|';
  const rows = objects.map((o) => `| ${o.key} | ${o.size} | ${o.lastModified || '-'} |`);
  return [header, sep, ...rows].join(`
`);
}
function formatInstanceTable(instances) {
  if (instances.length === 0) return 'No instances found.';
  const header = '| Instance ID | Name | State | Type | AZ | Private IP | Public IP |';
  const sep = '|-------------|------|-------|------|-----|------------|-----------|';
  const rows = instances.map(
    (i) =>
      `| ${i.instanceId} | ${i.name || '-'} | ${i.state} | ${i.type} | ${i.az} | ${i.privateIp || '-'} | ${i.publicIp || '-'} |`,
  );
  return [header, sep, ...rows].join(`
`);
}

// plugins/aws/src/aws/types.ts
var INSTANCE_ID_PATTERN, REGION_PATTERN, S3_URI_PATTERN, RESOURCE_NAME_PATTERN, HELP_PATH_PATTERN;
var init_types = __esm(() => {
  INSTANCE_ID_PATTERN = /^i-[0-9a-f]{8,17}$/;
  REGION_PATTERN = /^[a-z]{2}-[a-z]+-\d$/;
  S3_URI_PATTERN = /^s3:\/\/[a-z0-9./-]+$/;
  RESOURCE_NAME_PATTERN = /^[A-Za-z0-9._:/][A-Za-z0-9._:/-]*$/;
  HELP_PATH_PATTERN = /^[a-z][a-z0-9 -]*$/;
});

// plugins/aws/src/prompts/aws-sts-whoami.md
var aws_sts_whoami_default = `# Show AWS Caller Identity

Show the caller identity for the active AWS credentials via \`aws sts get-caller-identity\`.

## Usage

\`\`\`bash
aws sts get-caller-identity [--profile NAME] --output json
\`\`\`

## Parameters

| Parameter | Description                                                        |
| --------- | ------------------------------------------------------------------ |
| \`profile\` | Optional named profile from \`~/.aws/config\` / \`~/.aws/credentials\` |

## Output Fields (JSON)

- \`Account\` \u2014 12-digit AWS account ID
- \`Arn\` \u2014 ARN of the calling principal (IAM user, assumed role, etc.)
- \`UserId\` \u2014 Unique identifier of the principal

## Notes

Use this to confirm which account and identity your credentials resolve to before
running privileged operations. It requires no IAM permissions and is the quickest
way to verify that a profile or SSO session is active.

For advanced field selection, add \`--query\` with a JMESPath expression, e.g.
\`--query Account\`.

## Related Commands

- \`aws configure list\` \u2014 Show the resolved credential/config sources
- \`xcsh plugin setup aws\` \u2014 Run the reviewed human-only setup flow for missing or expired authentication
`;
var init_aws_sts_whoami = () => {};

// plugins/aws/src/tools/aws-sts-whoami.ts
function createAwsStsWhoamiTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    profile: Type.Optional(
      Type.String({
        description:
          'Named AWS profile. Omit, use an empty string, or use spaces for the existing default profile. Control characters and unsafe nonblank names are rejected.',
      }),
    ),
  });
  return {
    name: 'aws_sts_whoami',
    label: 'AWS Caller Identity',
    description: aws_sts_whoami_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'aws_sts_whoami' };
      const profile = params.profile !== undefined && /^ *$/.test(params.profile) ? undefined : params.profile;
      if (profile !== undefined && !RESOURCE_NAME_PATTERN.test(profile)) {
        return errorResult(
          `Error: invalid profile "${params.profile}". Only alphanumeric characters, dots, underscores, colons, slashes, and hyphens are allowed.`,
          base,
        );
      }
      const api = makeApi(ctx.cwd);
      const args = ['sts', 'get-caller-identity'];
      if (profile) args.push('--profile', profile);
      try {
        const raw = await execAwsJson(api, args, signal);
        const identity = normalizeIdentity(raw);
        return textResult(formatIdentityDetail(identity), { ...base, identity });
      } catch (err) {
        return errorResult(`Error: ${renderError(err)}`, { ...base, errorType: detectErrorType(err) });
      }
    },
  };
}
var init_aws_sts_whoami2 = __esm(() => {
  init_exec();
  init_types();
  init_aws_sts_whoami();
  init_shared();
});

// plugins/aws/src/prompts/aws-s3-ls.md
var aws_s3_ls_default = `# List Amazon S3 Resources

List Amazon S3 buckets, or the contents of a bucket or prefix, via the AWS CLI.

## Usage

\`\`\`bash
aws s3api list-buckets --output json      # no target: list all buckets
aws s3 ls s3://bucket/prefix/             # with target: list objects/prefixes
\`\`\`

## Parameters

| Parameter | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| \`target\`  | Optional \`s3://bucket[/prefix]\` URI. Omit to list all buckets in the account. |

## Output Fields

Bucket listing (JSON):

- \`Name\` \u2014 Bucket name
- \`CreationDate\` \u2014 When the bucket was created

Object listing (text, parsed):

- \`key\` \u2014 Object key or common prefix (directory)
- \`size\` \u2014 Object size in bytes (0 for prefixes)
- \`lastModified\` \u2014 Last modified timestamp

## Notes

Without a target, buckets are listed globally for the account (bucket names are
not region-scoped). With a target, a trailing slash lists the contents of that
prefix; \`PRE\` entries are common prefixes ("folders").

For advanced filtering on the JSON bucket list, add \`--query\` with a JMESPath
expression, e.g. \`--query "Buckets[?starts_with(Name, 'log')].Name"\`.

## Related Commands

- \`aws s3 ls s3://bucket --recursive\` \u2014 List all objects under a bucket
- \`aws s3api head-object --bucket B --key K\` \u2014 Object metadata
`;
var init_aws_s3_ls = () => {};

// plugins/aws/src/tools/aws-s3-ls.ts
function createAwsS3LsTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    target: Type.Optional(Type.String({ description: 'Optional s3://bucket[/prefix] URI. Omit to list all buckets.' })),
  });
  return {
    name: 'aws_s3_ls',
    label: 'AWS S3 List',
    description: aws_s3_ls_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'aws_s3_ls' };
      if (params.target !== undefined && !S3_URI_PATTERN.test(params.target)) {
        return errorResult(
          `Error: invalid S3 target "${params.target}". Must be an s3:// URI using lowercase letters, digits, dots, slashes, and hyphens.`,
          base,
        );
      }
      const api = makeApi(ctx.cwd);
      try {
        if (params.target) {
          const result = await execAwsRaw(api, ['s3', 'ls', params.target], signal);
          const objects = parseS3LsOutput(result.stdout);
          return textResult(formatS3ObjectTable(objects), { ...base, objects });
        }
        const raw = await execAwsJson(api, ['s3api', 'list-buckets'], signal);
        const buckets = (raw.Buckets ?? []).map(normalizeBucket);
        return textResult(formatBucketTable(buckets), { ...base, buckets });
      } catch (err) {
        return errorResult(`Error: ${renderError(err)}`, { ...base, errorType: detectErrorType(err) });
      }
    },
  };
}
var init_aws_s3_ls2 = __esm(() => {
  init_exec();
  init_types();
  init_aws_s3_ls();
  init_shared();
});

// plugins/aws/src/prompts/aws-ec2-describe-instances.md
var aws_ec2_describe_instances_default =
  '# Describe Amazon EC2 instances\n\nUse `aws ec2 describe-instances`.\n\n## Usage\n\n```bash\naws ec2 describe-instances [--region REGION] [--instance-ids ID ...] [--filters ...] --output json\n```\n\n## Parameters\n\n| Parameter | Description |\n| --- | --- |\n| `region` | Optional AWS region (e.g. `us-east-1`) |\n| `instanceIds` | Optional list of instance IDs (e.g. `i-0123456789abcdef0`) |\n| `filters` | Optional list of `Name=...,Values=...` filter expressions |\n\n## Output Fields (JSON, flattened)\n\nResults arrive as `Reservations[].Instances[]` and are flattened to:\n\n- `instanceId` \u2014 Instance ID\n- `name` \u2014 Value of the `Name` tag, if present\n- `state` \u2014 Lifecycle state (running, stopped, terminated, etc.)\n- `type` \u2014 Instance type (e.g. `t3.micro`)\n- `az` \u2014 Availability Zone\n- `privateIp` \u2014 Private IPv4 address\n- `publicIp` \u2014 Public IPv4 address, if assigned\n\n## Notes\n\nWithout a region, the CLI\'s default region is used. Combine `--filters` for\nserver-side narrowing, e.g. `Name=instance-state-name,Values=running`.\n\nFor advanced field selection, add `--query` with a JMESPath expression, e.g.\n`--query "Reservations[].Instances[].InstanceId"`.\n\n## Related Commands\n\n- `aws ec2 describe-instance-status` \u2014 Health and status checks\n- `aws ec2 start-instances --instance-ids ID` \u2014 Start a stopped instance\n';
var init_aws_ec2_describe_instances = () => {};

// plugins/aws/src/tools/aws-ec2-describe-instances.ts
function createAwsEc2DescribeInstancesTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    region: Type.Optional(Type.String({ description: 'AWS region, e.g. us-east-1' })),
    instanceIds: Type.Optional(Type.Array(Type.String(), { description: 'Instance IDs, e.g. i-0123456789abcdef0' })),
    filters: Type.Optional(
      Type.Array(Type.String(), { description: 'Filters, e.g. Name=instance-state-name,Values=running' }),
    ),
  });
  return {
    name: 'aws_ec2_describe_instances',
    label: 'AWS EC2 Instances',
    description: aws_ec2_describe_instances_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'aws_ec2_describe_instances' };
      if (params.region !== undefined && !REGION_PATTERN.test(params.region)) {
        return errorResult(`Error: invalid region "${params.region}". Expected a form like "us-east-1".`, base);
      }
      if (params.instanceIds) {
        for (const id of params.instanceIds) {
          if (!INSTANCE_ID_PATTERN.test(id)) {
            return errorResult(`Error: invalid instance ID "${id}". Expected a form like "i-0123456789abcdef0".`, base);
          }
        }
      }
      if (params.filters) {
        for (const filter of params.filters) {
          if (hasControlChars(filter)) {
            return errorResult(`Error: invalid filter "${filter}". Control characters are not allowed.`, base);
          }
          if (filter.startsWith('-') || !EC2_FILTER_PATTERN.test(filter)) {
            return errorResult(
              `Error: invalid filter "${filter}". Expected the form "Name=<name>,Values=<v1,v2,...>", e.g. "Name=instance-state-name,Values=running".`,
              base,
            );
          }
        }
      }
      const api = makeApi(ctx.cwd);
      const args = ['ec2', 'describe-instances'];
      if (params.region) args.push('--region', params.region);
      if (params.instanceIds && params.instanceIds.length > 0) args.push('--instance-ids', ...params.instanceIds);
      if (params.filters && params.filters.length > 0) args.push('--filters', ...params.filters);
      try {
        const raw = await execAwsJson(api, args, signal);
        const instances = normalizeReservations(raw);
        return textResult(formatInstanceTable(instances), { ...base, instances });
      } catch (err) {
        return errorResult(`Error: ${renderError(err)}`, { ...base, errorType: detectErrorType(err) });
      }
    },
  };
}
var EC2_FILTER_PATTERN;
var init_aws_ec2_describe_instances2 = __esm(() => {
  init_exec();
  init_types();
  init_aws_ec2_describe_instances();
  init_shared();
  EC2_FILTER_PATTERN = /^Name=[A-Za-z0-9:._/-]+,Values=[A-Za-z0-9:._/,*-]+$/;
});

// plugins/aws/src/prompts/aws-exec.md
var aws_exec_default =
  '# Execute AWS CLI Commands\n\nExecute any `aws` CLI command directly.\n\nThis is the general-purpose tool for running AWS CLI commands that are not covered by the typed tools (aws_sts_whoami, aws_s3_ls, aws_ec2_describe_instances). Prefer the typed tools when available \u2014 they validate inputs and return structured data.\n\n## Usage\n\nPass the service, operation, and flags as an array of arguments. Do NOT include `aws` itself \u2014 it is prepended automatically.\n\n**Example:** To run `aws ec2 describe-instances --region us-east-1`:\n\n```json\n{ "args": ["ec2", "describe-instances", "--region", "us-east-1"] }\n```\n\nThe AWS CLI grammar is `aws <service> <operation>` (for example `ec2 describe-instances`, `iam list-users`, `s3 ls`).\n\n## Safety\n\n- Arguments are passed as an array directly to the `aws` binary \u2014 **no shell** is involved, so shell metacharacters are inert and never filtered. Any valid `aws` invocation runs, including full JMESPath `--query` syntax.\n- **Read-only by default:** only read operations are allowed. Reads are recognized by operation prefix (`describe-`, `list-`, `get-`, `lookup-`, `search-`, `head-`, `check-`, `resolve-`, \u2026) plus a few exact reads (`scan`, `query`, `select`, `wait`, and `s3 ls`).\n- Everything else \u2014 including `run-instances`, `terminate-instances`, `create-*`, `update-*`, `delete-*`, and the mutating `s3` verbs (`cp`, `mv`, `rm`, `sync`, `mb`, `rb`) \u2014 is blocked. Run write/destructive operations through an explicitly confirmed path (delegate to the `aws:cli-operator` agent), not `aws_exec`.\n- Output is capped to prevent context overflow.\n\n## Output format with `--output`\n\nControl the response format with `--output json|text|table` (JSON is added automatically when you do not supply your own):\n\n- `--output json` \u2014 machine-readable JSON (the default)\n- `--output text` \u2014 tab-separated, good for piping\n- `--output table` \u2014 human-readable ASCII table\n\n## Filtering with `--filters`\n\nMany `describe-*` operations accept server-side `--filters` in `Name=...,Values=...` form, which narrows results before they are returned:\n\n```json\n{ "args": ["ec2", "describe-instances", "--filters", "Name=instance-state-name,Values=running"] }\n```\n\n## Querying with `--query` (JMESPath)\n\nAWS uses the JMESPath grammar for the client-side `--query` flag \u2014 pass the expression as a single argument value. This is NOT the GitHub CLI `--json`/`--jq` model; there is no `--jq`. Common patterns:\n\n- Field projection: `--query "Reservations[].Instances[].{id:InstanceId, type:InstanceType}"`\n- Filter: `--query "Reservations[].Instances[?State.Name==\'running\']"`\n- Substring match: `--query "Buckets[?contains(Name, \'prod\')]"`\n- Backtick literals (numbers/booleans/quoted enums): `` --query "Volumes[?Size==`100`]" ``\n- OR / AND / NOT: `--query "[?a==\'x\' || b==\'y\']"`, `--query "[?a && b]"`, `--query "[?!Encrypted]"`\n- Pipe to post-process a projection: `--query "Reservations[].Instances[].InstanceId | [0]"`\n\nAll of the above \u2014 including `||`, `|`, and backticks \u2014 are accepted verbatim, because arguments bypass the shell.\n\n## Tips\n\n- `--output json` is added automatically unless you pass your own `--output`/`-o` (for example `-o table`, `-o text`), which is respected.\n- Use `--region NAME` to target a specific region and `--profile NAME` to select credentials.\n- Use the `aws_help` tool first if you are unsure about a service\'s available operations or flags.\n';
var init_aws_exec = () => {};

// plugins/aws/src/tools/aws-exec-guard.ts
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
  const hasOutput = args.some((a) => a === '--output' || a === '-o');
  return hasOutput ? [...args] : [...args, '--output', 'json'];
}
var READ_TOP, S3_READ_OPS, S3_WRITE_OPS, READ_PREFIXES, READ_EXACT, VALUE_FLAGS, WRITE_DELEGATION;
var init_aws_exec_guard = __esm(() => {
  READ_TOP = new Set(['help']);
  S3_READ_OPS = new Set(['ls']);
  S3_WRITE_OPS = new Set(['cp', 'mv', 'rm', 'sync', 'mb', 'rb']);
  READ_PREFIXES = [
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
  READ_EXACT = new Set(['ls', 'wait', 'help', 'scan', 'select', 'query']);
  VALUE_FLAGS = new Set([
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
  WRITE_DELEGATION =
    'aws_exec is read-only by default. Run write/destructive operations through an ' +
    'explicitly confirmed path (delegate to the aws:cli-operator agent), not aws_exec.';
});

// plugins/aws/src/tools/aws-exec.ts
function createAwsExecTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    args: Type.Array(Type.String({ description: 'Individual argument (do NOT include "aws" itself)' }), {
      description:
        'aws service, operation, and flags as an array, e.g. ["ec2", "describe-instances", "--output", "json"]',
    }),
  });
  return {
    name: 'aws_exec',
    label: 'AWS CLI Execute',
    description: aws_exec_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'aws_exec' };
      const args = params.args ?? [];
      if (args.length === 0) {
        return errorResult('Error: args array must not be empty. Provide an aws service and operation.', base);
      }
      for (const arg of args) {
        if (hasControlChars(arg)) {
          return errorResult(
            `Error: argument contains a control character and cannot be passed to aws: "${arg}"`,
            base,
          );
        }
      }
      const mutation = findMutation(args);
      if (mutation.blocked) {
        return errorResult(`Error: ${mutation.reason}`, base);
      }
      const api = makeApi(ctx.cwd);
      const builtArgs = buildAwsArgs(args);
      const result = await api.exec('aws', builtArgs, { signal });
      if (result.exitCode !== 0) {
        throw detectAwsError(result.stderr, result.exitCode);
      }
      let output = result.stdout;
      const fullOutput = output;
      if (output.length > MAX_OUTPUT_LENGTH) {
        output = `${output.slice(0, MAX_OUTPUT_LENGTH)}

[Output truncated at ${MAX_OUTPUT_LENGTH} characters]`;
      }
      return textResult(output, { ...base, fullOutput, modelPreviewTruncated: output !== fullOutput });
    },
  };
}
var MAX_OUTPUT_LENGTH = 50000;
var init_aws_exec2 = __esm(() => {
  init_exec();
  init_aws_exec();
  init_aws_exec_guard();
  init_shared();
});

// plugins/aws/src/prompts/aws-help.md
var aws_help_default = `# View AWS CLI Help

Fetch help documentation for any \`aws\` CLI service or operation.

Use this tool to discover available services, operations, and flags for AWS CLI commands that are not covered by the embedded tool documentation.

## Usage

Pass the command path (without the \`aws\` prefix) to get help:

**Example:** To see help for the \`ec2\` service:

\`\`\`json
{ "command_path": "ec2" }
\`\`\`

**Example:** To see help for a specific operation:

\`\`\`json
{ "command_path": "ec2 describe-instances" }
\`\`\`

**Example:** To see top-level \`aws\` help:

\`\`\`json
{ "command_path": "" }
\`\`\`

Note that the AWS CLI exposes help through the \`help\` subcommand (for example \`aws ec2 help\`), not a \`--help\` flag \u2014 this tool appends \`help\` for you.

## When to Use

- Before using \`aws_exec\` with an unfamiliar service
- To discover available operations within a service
- To find the correct flags for a specific operation
- To check required versus optional parameters

## Output

Returns the raw \`aws <command> help\` output, which includes:

- Available services and operations
- Command arguments with descriptions
- Required versus optional parameters
- Usage examples
`;
var init_aws_help = () => {};

// plugins/aws/src/tools/aws-help.ts
function createAwsHelpTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    command_path: Type.Optional(
      Type.String({
        description: 'Command path without "aws" prefix, e.g. "ec2 describe-instances". Empty for top-level help.',
      }),
    ),
  });
  return {
    name: 'aws_help',
    label: 'AWS CLI Help',
    description: aws_help_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'aws_help' };
      const commandPath = params.command_path?.trim() ?? '';
      if (commandPath.length > 0 && !HELP_PATH_PATTERN.test(commandPath)) {
        return errorResult(
          `Error: invalid command path "${commandPath}". Only lowercase letters, hyphens, and spaces are allowed.`,
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
      const api = makeApi(ctx.cwd);
      const args = [...parts, 'help'];
      try {
        const result = await api.exec('aws', args, { signal });
        const output = result.stdout || result.stderr;
        if (!output.trim()) {
          return errorResult(`No help output for "aws ${commandPath}".`, { ...base, errorType: 'exec_error' });
        }
        return textResult(output, base);
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: 'exec_error',
        });
      }
    },
  };
}
var init_aws_help2 = __esm(() => {
  init_types();
  init_aws_help();
  init_shared();
});

// plugins/aws/src/ce/canonical.ts
import { createHash, timingSafeEqual } from 'node:crypto';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}
function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}
function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
function canonicalSha256(value) {
  return sha256Hex(canonicalStringify(value));
}
function safeHexEqual(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
function resourceConfiguration(resources) {
  const normalize = (value) => {
    if (Array.isArray(value))
      return value.map(normalize).sort((a, b) => canonicalStringify(a).localeCompare(canonicalStringify(b)));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !['State', 'Status', 'StateTransitionReason', 'TargetHealth'].includes(key))
          .map(([key, item]) => [key, normalize(item)]),
      );
    return value;
  };
  return resources
    .map((resource) => ({ ...resource, state: normalize(resource.state) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
function fingerprintOwnedResources(resources) {
  return canonicalSha256(resourceConfiguration(resources));
}
function matchesBgpRuntimeVariants(expected, value, fingerprint) {
  if (safeHexEqual(expected, fingerprint(value))) return true;
  const candidate = structuredClone(value);
  const statuses = [];
  const visit = (current) => {
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    if (!current || typeof current !== 'object') return;
    for (const [key, item] of Object.entries(current)) {
      if (key === 'BgpStatus') {
        if (!['up', 'down'].includes(String(item))) return;
        statuses.push({ object: current, key });
      } else visit(item);
    }
  };
  visit(candidate);
  if (!statuses.length || statuses.length > 16) return false;
  for (let mask = 0; mask < 2 ** statuses.length; mask++) {
    statuses.forEach((status, index) => {
      status.object[status.key] = mask & (2 ** index) ? 'up' : 'down';
    });
    if (safeHexEqual(expected, fingerprint(candidate))) return true;
  }
  return false;
}
function matchesOwnedResourceFingerprint(expected, resources) {
  return matchesBgpRuntimeVariants(expected, resources, fingerprintOwnedResources);
}
function fingerprintObservation(observation, brownfieldIds) {
  const allowlist = new Set(brownfieldIds);
  return canonicalSha256({
    schemaVersion: observation.schemaVersion,
    identity: { ...observation.identity, awsProfile: observation.identity.awsProfile ?? 'default' },
    agreement: observation.agreement,
    regions: observation.regions.map(
      ({ elasticIpCapacity, vcpuCapacity, vpcCapacity, internetGatewayCapacity, ...region }) => ({
        ...region,
        ...(elasticIpCapacity
          ? {
              elasticIpCapacity: {
                limit: elasticIpCapacity.limit,
                foreignAllocated: elasticIpCapacity.allocated - elasticIpCapacity.reusableOwned,
              },
            }
          : {}),
        ...Object.fromEntries(
          Object.entries({ vcpuCapacity, vpcCapacity, internetGatewayCapacity })
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, { limit: value.limit, foreignUsed: value.used - value.reusableOwned }]),
        ),
      }),
    ),
    resources: resourceConfiguration(observation.resources.filter((resource) => allowlist.has(resource.id))),
    research: observation.research,
    f5Capabilities: observation.f5Capabilities,
    f5CapabilitiesSha256: observation.f5CapabilitiesSha256,
  });
}
function matchesObservationFingerprint(expected, observation, resourceIds) {
  const allowlist = new Set(resourceIds);
  const scoped = {
    ...observation,
    resources: observation.resources.filter((resource) => allowlist.has(resource.id)),
  };
  return matchesBgpRuntimeVariants(expected, scoped, (candidate) => fingerprintObservation(candidate, resourceIds));
}
function normalizeResearchDocument(body) {
  return `${body
    .replace(/^\uFEFF/, '')
    .replace(
      /\r\n?/g,
      `
`,
    )
    .normalize('NFC')
    .split(`
`)
    .map((line) => line.replace(/[\t ]+$/g, ''))
    .join(`
`)
    .trimEnd()}
`;
}
var init_canonical = () => {};

// plugins/aws/src/ce/types.ts
var AWS_CE_SCHEMA_VERSION = 2,
  AWS_CE_SHARED_CONTRACT_URL =
    'https://f5-sales-demo.github.io/multi-cloud-networking/_llms-txt/en/customer-edge/automation-contract.txt',
  AWS_CE_F5_GUIDE_URL =
    'https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/how-to/site-management/deploy-sms-aws-clickops',
  AWS_CE_TGW_GUIDE_URL =
    'https://f5-sales-demo.github.io/multi-cloud-networking/_llms-txt/en/customer-edge/smsv2/aws-tgw-connect.txt',
  AWS_CE_MARKETPLACE_PRODUCT_ID = 'prod-wrwzhcymymama',
  AWS_CE_SSM_PARAMETER,
  AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB = 100,
  AWS_CE_DEFAULT_INTERFACE_MTU = 1500;
var init_types2 = __esm(() => {
  AWS_CE_SSM_PARAMETER = `/aws/service/marketplace/${AWS_CE_MARKETPLACE_PRODUCT_ID}/latest`;
});

// plugins/aws/src/ce/artifacts.ts
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

function verifyAwsCePlan(plan) {
  if (plan.schemaVersion !== AWS_CE_SCHEMA_VERSION || plan.intent.schemaVersion !== AWS_CE_SCHEMA_VERSION)
    throw new Error('Persisted AWS CE plan uses an unsupported schema version');
  if (!['native', 'terraform'].includes(plan.engine) || plan.intent.engine !== plan.engine)
    throw new Error('Persisted AWS CE engine ownership is invalid');
  if (
    plan.intent.ingress?.mode === 'nlb' &&
    (!plan.intent.ingress.listener ||
      typeof plan.intent.ingress.listener.name !== 'string' ||
      typeof plan.intent.ingress.listener.domain !== 'string' ||
      typeof plan.intent.ingress.listener.originPool?.name !== 'string' ||
      !plan.intent.ingress.probe ||
      typeof plan.intent.ingress.probe.sourceInstanceId !== 'string' ||
      typeof plan.intent.ingress.probe.expectedBodySha256 !== 'string')
  )
    throw new Error('Persisted AWS CE plan uses the obsolete cloud-only NLB ingress schema');
  const { planId, planSha256, ...draft } = plan;
  if (!safeHexEqual(canonicalSha256(draft), planSha256) || planId !== `aws-ce-${planSha256.slice(0, 24)}`)
    throw new Error('Persisted AWS CE plan failed integrity validation');
}
function verifyAwsCePlanForInspection(plan) {
  if (![1, AWS_CE_SCHEMA_VERSION].includes(plan.schemaVersion) || plan.intent?.schemaVersion !== plan.schemaVersion)
    throw new Error('Unsupported AWS CE inspection artifact');
  const { planId, planSha256, ...draft } = plan;
  if (!safeHexEqual(canonicalSha256(draft), planSha256) || planId !== `aws-ce-${planSha256.slice(0, 24)}`)
    throw new Error('AWS CE inspection artifact failed integrity validation');
}
async function saveAwsDiscovery(session, observation) {
  if (observation.schemaVersion !== AWS_CE_SCHEMA_VERSION)
    throw new Error('AWS CE discovery uses an unsupported schema version');
  return session.saveArtifact(JSON.stringify({ kind: 'aws-ce-discovery', observation }), 'aws-ce-discovery');
}
async function loadAwsDiscovery(session, id) {
  if (!/^\d+$/.test(id)) throw new Error('Invalid AWS CE discovery artifact ID');
  const path = await session.getArtifactPath(id);
  if (!path) throw new Error(`AWS CE discovery artifact ${id} was not found in this session`);
  const envelope = JSON.parse(await Bun.file(path).text());
  if (envelope.kind !== 'aws-ce-discovery' || envelope.observation?.schemaVersion !== AWS_CE_SCHEMA_VERSION)
    throw new Error('Artifact is not an AWS CE schema-v2 discovery observation');
  return envelope.observation;
}
async function saveAwsPlan(session, plan, observation) {
  verifyAwsCePlan(plan);
  const envelope = { kind: 'aws-ce-plan', plan, observation };
  const plans = memoryPlans.get(session.getSessionId()) ?? [];
  plans.push(envelope);
  memoryPlans.set(session.getSessionId(), plans);
  return session.saveArtifact(JSON.stringify(envelope), 'aws-ce-plan');
}
async function loadAwsPlan(session, planId, planSha256, mode = 'execute') {
  const verify = mode === 'inspect' ? verifyAwsCePlanForInspection : verifyAwsCePlan;
  const memory = memoryPlans
    .get(session.getSessionId())
    ?.find((item) => item.plan.planId === planId && item.plan.planSha256 === planSha256);
  if (memory) {
    verify(memory.plan);
    return memory;
  }
  const directory = session.getArtifactsDir();
  if (!directory) throw new Error('The exact AWS CE plan is unavailable in this session');
  let files = [];
  try {
    files = (await readdir(directory)).filter((file) => file.endsWith('.aws-ce-plan.log')).sort();
  } catch {}
  for (const file of files) {
    try {
      const envelope = JSON.parse(await Bun.file(join(directory, file)).text());
      if (envelope.kind !== 'aws-ce-plan' || envelope.plan.planId !== planId || envelope.plan.planSha256 !== planSha256)
        continue;
      verify(envelope.plan);
      return envelope;
    } catch {}
  }
  throw new Error('No exact, integrity-valid AWS CE plan was found in this session');
}
async function saveAwsCheckpoint(session, checkpoint) {
  const id = await session.saveArtifact(JSON.stringify({ kind: 'aws-ce-checkpoint', checkpoint }), 'aws-ce-checkpoint');
  if (!id) throw new Error('AWS CE checkpoint could not be persisted');
  return id;
}
async function loadAwsCheckpoint(session, planId, planSha256) {
  const directory = session.getArtifactsDir();
  if (!directory) return;
  let files = [];
  try {
    files = (await readdir(directory))
      .filter((file) => file.endsWith('.aws-ce-checkpoint.log'))
      .sort()
      .reverse();
  } catch {
    return;
  }
  for (const file of files) {
    try {
      const envelope = JSON.parse(await Bun.file(join(directory, file)).text());
      if (
        envelope.kind === 'aws-ce-checkpoint' &&
        envelope.checkpoint.schemaVersion === AWS_CE_SCHEMA_VERSION &&
        envelope.checkpoint.planId === planId &&
        envelope.checkpoint.planSha256 === planSha256
      )
        return envelope.checkpoint;
    } catch {}
  }
  return;
}
var memoryPlans;
var init_artifacts = __esm(() => {
  init_canonical();
  init_types2();
  memoryPlans = new Map();
});

// plugins/aws/src/ce/scoped-exec.ts
function scopedAwsApi(api, profile, signal) {
  if (profile !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}$/.test(profile))
    throw new Error('Invalid AWS profile');
  return {
    async exec(command, args, options) {
      if (command !== 'aws') throw new Error('CE AWS executor accepts only AWS commands');
      const cancellation =
        options?.signal && signal ? AbortSignal.any([signal, options.signal]) : (options?.signal ?? signal);
      cancellation?.throwIfAborted();
      const existing = args.indexOf('--profile');
      if (args.some((arg) => arg.startsWith('--profile=')) || (existing >= 0 && args[existing + 1] !== profile))
        throw new Error('AWS command profile differs from deployment');
      return api.exec(command, profile && existing < 0 ? [...args, '--profile', profile] : args, {
        signal: cancellation,
      });
    },
  };
}

// plugins/aws/src/ce/inventory.ts
function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed AWS inventory evidence');
  return value;
}
function string(value, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error('Malformed AWS inventory identity');
  return value;
}
function tags(value) {
  if (value === undefined) return new Map();
  if (!Array.isArray(value)) throw new Error('Malformed AWS inventory tags');
  const result = new Map();
  for (const item of value) {
    const row = record(item);
    if (typeof row.Key !== 'string' || typeof row.Value !== 'string' || result.has(row.Key))
      throw new Error('Malformed AWS inventory tags');
    result.set(row.Key, row.Value);
  }
  return result;
}
async function readAwsEc2Pages(api, command, field, region, args = []) {
  const result = [];
  const tokens = new Set();
  let token;
  do {
    const response = await api.exec('aws', [
      'ec2',
      command,
      '--region',
      region,
      '--no-paginate',
      '--max-results',
      '100',
      ...args,
      ...(token ? ['--next-token', token] : []),
      '--output',
      'json',
    ]);
    if (response.exitCode !== 0) throw detectAwsError(response.stderr, response.exitCode);
    let raw;
    try {
      raw = record(JSON.parse(response.stdout));
    } catch {
      throw new Error('Malformed AWS inventory page');
    }
    if (!Array.isArray(raw[field])) throw new Error('Missing AWS inventory page collection');
    result.push(...raw[field].map(record));
    if (result.length > 1e5) throw new Error('AWS inventory exceeded collection bound');
    if (
      raw.NextToken !== undefined &&
      (typeof raw.NextToken !== 'string' || !raw.NextToken || tokens.has(raw.NextToken))
    )
      throw new Error('AWS inventory pagination is incomplete');
    token = raw.NextToken;
    if (token) tokens.add(token);
    if (tokens.size > 1e4) throw new Error('AWS inventory pagination exceeded bound');
  } while (token);
  return result;
}
async function collectAwsCeInventory(input, executor, signal) {
  if (
    !/^\d{12}$/.test(input.accountId) ||
    !Array.isArray(input.regions) ||
    !input.regions.length ||
    input.regions.length > 40 ||
    input.regions.some((region) => !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region)) ||
    new Set(input.regions).size !== input.regions.length
  )
    throw new Error('Invalid AWS inventory scope');
  input = { ...input, awsProfile: input.awsProfile ?? 'default' };
  const api = scopedAwsApi(executor, input.awsProfile, signal);
  const identityResult = await api.exec('aws', ['sts', 'get-caller-identity', '--output', 'json']);
  if (identityResult.exitCode !== 0) throw detectAwsError(identityResult.stderr, identityResult.exitCode);
  const identity = record(JSON.parse(identityResult.stdout));
  if (identity.Account !== input.accountId) throw new Error('AWS inventory account differs from authenticated account');
  const collectedAt = new Date().toISOString();
  const nodes = [];
  for (const region of [...input.regions].sort()) {
    const reservations = await readAwsEc2Pages(api, 'describe-instances', 'Reservations', region);
    const instances = reservations.flatMap((reservation) => {
      if (!Array.isArray(reservation.Instances)) throw new Error('Malformed AWS reservation');
      return reservation.Instances.map(record);
    });
    const enis = await readAwsEc2Pages(api, 'describe-network-interfaces', 'NetworkInterfaces', region);
    const eniById = new Map();
    for (const eni of enis) {
      const id = string(eni.NetworkInterfaceId, resourceId);
      if (eniById.has(id)) throw new Error('Duplicate AWS interface identity');
      eniById.set(id, eni);
    }
    const instanceIds = new Set();
    for (const instance of instances) {
      const id = string(instance.InstanceId, resourceId);
      if (instanceIds.has(id)) throw new Error('Duplicate AWS instance identity');
      instanceIds.add(id);
      const resourceTags = tags(instance.Tags);
      const site = resourceTags.get('ves-io-site-name');
      const managed = resourceTags.get('xcsh-managed-by') === 'aws-ce';
      if (!site && !managed) continue;
      const deployment = resourceTags.get('xcsh-deployment-id');
      const engine = resourceTags.get('xcsh-execution-engine');
      const owned =
        managed &&
        name.test(deployment ?? '') &&
        ['native', 'terraform'].includes(engine ?? '') &&
        /^[a-f0-9]{64}$/.test(resourceTags.get('xcsh-plan-sha256') ?? '');
      if (!Array.isArray(instance.NetworkInterfaces)) throw new Error('Missing CE interface attachment evidence');
      const indexes = new Set();
      const macs = new Set();
      const interfaces = instance.NetworkInterfaces.map((value) => {
        const attached = record(value);
        const eniId = string(attached.NetworkInterfaceId, resourceId);
        const eni = eniById.get(eniId);
        if (!eni) return { id: eniId, correlation: 'unavailable' };
        const attachment = record(eni.Attachment);
        const index = attachment.DeviceIndex;
        const mac = string(eni.MacAddress, /^(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/).toLowerCase();
        if (
          attachment.InstanceId !== id ||
          !Number.isInteger(index) ||
          Number(index) < 0 ||
          indexes.has(Number(index)) ||
          macs.has(mac) ||
          (attached.MacAddress !== undefined && String(attached.MacAddress).toLowerCase() !== mac)
        )
          throw new Error('Ambiguous AWS CE attachment evidence');
        indexes.add(Number(index));
        macs.add(mac);
        return {
          id: eniId,
          correlation: 'instance-attachment-and-mac',
          attachmentIndex: Number(index),
          mac,
          subnetId: string(eni.SubnetId, resourceId),
          vpcId: string(eni.VpcId, resourceId),
        };
      });
      const rawState = record(instance.State).Name;
      nodes.push({
        instanceId: id,
        accountId: input.accountId,
        region,
        siteName: site && name.test(site) ? site : null,
        siteBinding: site && name.test(site) ? 'cloud-tag-only' : 'unavailable',
        deploymentId: deployment && name.test(deployment) ? deployment : null,
        ownership: owned ? 'managed' : managed ? 'ambiguous' : 'unmanaged',
        engine: owned ? engine : null,
        state: ['pending', 'running', 'shutting-down', 'terminated', 'stopping', 'stopped'].includes(String(rawState))
          ? rawState
          : 'unknown',
        interfaces,
        platformRegistration: 'unknown',
        platformHealth: 'unknown',
      });
    }
  }
  return {
    schemaVersion: 2,
    kind: 'aws-ce-inventory',
    source: 'aws-cli-live',
    collectedAt,
    scope: {
      accountId: input.accountId,
      regions: [...input.regions].sort(),
      ...(input.awsProfile ? { awsProfile: input.awsProfile } : {}),
    },
    completeness: 'complete-for-requested-regions',
    selection: 'CE cloud ownership or site tags',
    nodes,
    counts: { instances: nodes.length, interfaces: nodes.reduce((sum, node) => sum + node.interfaces.length, 0) },
    platformEvidence: 'unavailable',
  };
}
var resourceId, name;
var init_inventory = __esm(() => {
  init_exec();
  resourceId = /^(?:i|eni|subnet|vpc)-[0-9a-f]{8,21}$/;
  name = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;
});

// plugins/aws/src/ce/capacity.ts
async function observeTaggedResourceCapacity(api, region, command, field, idField, limit, ownership) {
  if (!Number.isFinite(limit) || limit < 0 || !/^\d{12}$/.test(ownership.accountId ?? ''))
    throw new Error('Resource quota or authenticated account is unavailable or malformed');
  const resources = await readAwsEc2Pages(api, command, field, region);
  const ids = new Set();
  let reusableOwned = 0;
  let used = 0;
  for (const resource of resources) {
    const id = resource[idField];
    if (typeof id !== 'string' || !/^(vpc|igw)-[0-9a-f]{8,21}$/.test(id) || ids.has(id))
      throw new Error('Resource capacity identity is missing or ambiguous');
    ids.add(id);
    if (typeof resource.OwnerId !== 'string' || !/^\d{12}$/.test(resource.OwnerId))
      throw new Error('Capacity resource account is missing');
    if (resource.OwnerId !== ownership.accountId) continue;
    used++;
    if (resource.Tags !== undefined && !Array.isArray(resource.Tags))
      throw new Error('Capacity ownership tags malformed');
    const tags = new Map();
    for (const value of resource.Tags ?? []) {
      if (typeof value?.Key !== 'string' || typeof value?.Value !== 'string' || tags.has(value.Key))
        throw new Error('Capacity ownership tags malformed');
      tags.set(value.Key, value.Value);
    }
    if (
      tags.get('xcsh-managed-by') === 'aws-ce' &&
      tags.get('xcsh-deployment-id') === ownership.deploymentName &&
      ['native', 'terraform'].includes(tags.get('xcsh-execution-engine') ?? '') &&
      ownership.planSha256s.includes(tags.get('xcsh-plan-sha256') ?? '')
    )
      reusableOwned++;
  }
  if (reusableOwned > 1) throw new Error('Ambiguous owned resource capacity');
  return {
    limit,
    used,
    reusableOwned,
    remaining: Math.max(0, limit - used + reusableOwned),
    source: 'aws-cli-live',
  };
}
async function observeStandardVcpuCapacity(api, region, limit, ownership, nodeCount) {
  if (!Number.isFinite(limit) || limit < 0) throw new Error('vCPU quota is malformed');
  const rows = await readAwsEc2Pages(api, 'describe-instances', 'Reservations', region, [
    '--filters',
    'Name=instance-state-name,Values=pending,running',
  ]);
  const instances = rows.flatMap((row) => {
    if (!Array.isArray(row.Instances)) throw new Error('vCPU usage reservation is malformed');
    return row.Instances;
  });
  const ids = new Set();
  const counted = instances.filter((instance) => {
    if (
      !instance ||
      typeof instance !== 'object' ||
      !/^i-[0-9a-f]{8,21}$/.test(instance.InstanceId) ||
      ids.has(instance.InstanceId) ||
      typeof instance.InstanceType !== 'string' ||
      !['pending', 'running'].includes(instance.State?.Name)
    )
      throw new Error('vCPU usage instance identity or state is malformed');
    ids.add(instance.InstanceId);
    if (
      instance.InstanceLifecycle !== undefined &&
      !['spot', 'scheduled', 'capacity-block'].includes(instance.InstanceLifecycle)
    )
      throw new Error('Unknown instance lifecycle in vCPU quota observation');
    return instance.InstanceLifecycle === undefined && /^[acdhimrtz]\d/.test(instance.InstanceType);
  });
  const types = [...new Set(counted.map((instance) => instance.InstanceType))].sort();
  const cpus = new Map();
  for (let offset = 0; offset < types.length; offset += 100) {
    const batch = types.slice(offset, offset + 100);
    const response = await api.exec('aws', [
      'ec2',
      'describe-instance-types',
      '--instance-types',
      ...batch,
      '--region',
      region,
      '--output',
      'json',
    ]);
    if (response.exitCode !== 0) throw new Error('vCPU usage type lookup unavailable');
    const data = JSON.parse(response.stdout);
    if (
      !data ||
      data.NextToken !== undefined ||
      !Array.isArray(data.InstanceTypes) ||
      data.InstanceTypes.length !== batch.length
    )
      throw new Error('vCPU usage type lookup incomplete');
    for (const type of data.InstanceTypes) {
      const vcpus = type?.VCpuInfo?.DefaultVCpus;
      if (!batch.includes(type?.InstanceType) || cpus.has(type.InstanceType) || !Number.isInteger(vcpus) || vcpus < 1)
        throw new Error('vCPU usage type mapping malformed');
      cpus.set(type.InstanceType, vcpus);
    }
  }
  let used = 0;
  let reusableOwned = 0;
  const ownedNodes = new Set();
  for (const instance of counted) {
    const vcpus = cpus.get(instance.InstanceType);
    if (!vcpus) throw new Error('vCPU usage type mapping missing');
    used += vcpus;
    if (instance.Tags !== undefined && !Array.isArray(instance.Tags)) throw new Error('vCPU ownership tags malformed');
    const tags = new Map();
    for (const tag of instance.Tags ?? []) {
      if (typeof tag?.Key !== 'string' || typeof tag?.Value !== 'string' || tags.has(tag.Key))
        throw new Error('vCPU ownership tags malformed');
      tags.set(tag.Key, tag.Value);
    }
    const node = Number(tags.get('xcsh-node-index'));
    if (
      tags.get('xcsh-managed-by') === 'aws-ce' &&
      tags.get('xcsh-deployment-id') === ownership.deploymentName &&
      ['native', 'terraform'].includes(tags.get('xcsh-execution-engine') ?? '') &&
      ownership.planSha256s.includes(tags.get('xcsh-plan-sha256') ?? '') &&
      Number.isInteger(node) &&
      node >= 1 &&
      node <= nodeCount
    ) {
      if (ownedNodes.has(node)) throw new Error('Ambiguous owned-node vCPU capacity');
      ownedNodes.add(node);
      reusableOwned += vcpus;
    }
  }
  return {
    limit,
    used,
    reusableOwned,
    remaining: Math.max(0, limit - used + reusableOwned),
    source: 'aws-cli-live',
  };
}
var init_capacity = __esm(() => {
  init_inventory();
});

// plugins/aws/src/ce/discovery.ts
async function json(api, args) {
  const result = await api.exec('aws', [...args, '--output', 'json']);
  if (result.exitCode !== 0) throw new Error(`AWS discovery command failed: aws ${args.join(' ')}: ${result.stderr}`);
  try {
    const data = JSON.parse(result.stdout);
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      ['NextToken', 'NextMarker', 'nextToken'].some((key) => Object.hasOwn(data, key))
    )
      throw new Error('Malformed or incomplete AWS discovery response');
    return data;
  } catch {
    throw new Error(`Incomplete or invalid AWS discovery JSON for: aws ${args.join(' ')}`);
  }
}
async function mapLimit(items, limit, task) {
  const result = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        result[index] = await task(items[index]);
      }
    }),
  );
  return result;
}
function validateCapabilities(value) {
  if (
    value?.smsv2ContractVersion !== 'v2' ||
    !value.supportedProviders?.includes('aws') ||
    !value.bootstrapDrivers?.some((driver) => driver === 'api' || driver === 'console') ||
    !Array.isArray(value.providerNetworkingProfiles?.aws) ||
    typeof value.awsSmsv2TgwConnect?.supported !== 'boolean' ||
    (value.awsSmsv2TgwConnect.supported && !value.awsSmsv2TgwConnect.schemaVersion) ||
    (!value.awsSmsv2TgwConnect.supported && value.awsSmsv2TgwConnect.schemaVersion !== null)
  )
    throw new Error('F5 platform capabilities do not advertise the required AWS Secure Mesh Site v2 contract');
}
function regionMatchesPartition(region, partition) {
  if (partition === 'aws-us-gov') return region.startsWith('us-gov-');
  if (partition === 'aws-cn') return region.startsWith('cn-');
  return !region.startsWith('us-gov-') && !region.startsWith('cn-');
}
function validateInput(input) {
  if (input.vpcMode !== undefined && !['greenfield', 'brownfield'].includes(input.vpcMode))
    throw new Error('Invalid VPC discovery mode');
  if (!ACCOUNT.test(input.accountId)) throw new Error('accountId must be a 12-digit AWS account ID');
  if (!['aws', 'aws-us-gov', 'aws-cn'].includes(input.partition)) throw new Error('Unsupported AWS partition');
  if (!SAFE_NAME.test(input.deploymentName)) throw new Error('deploymentName contains unsupported characters');
  if (!Number.isInteger(input.requiredEnis) || input.requiredEnis < 1 || input.requiredEnis > 8)
    throw new Error('requiredEnis must be between 1 and 8');
  if (input.nodeCount !== 1 && input.nodeCount !== 3) throw new Error('nodeCount must be one or three');
  if (input.egressMode && !['elastic-ip', 'nat-gateway', 'firewall', 'proxy'].includes(input.egressMode))
    throw new Error('egressMode is invalid');
  if (
    input.routingProfile &&
    !['direct-eni', 'nlb-ingress', 'tgw-static', 'tgw-connect'].includes(input.routingProfile)
  )
    throw new Error('routingProfile is invalid');
  const instanceTypes = [...new Set(input.instanceTypes?.length ? input.instanceTypes : DEFAULT_INSTANCE_TYPES)].sort();
  if (instanceTypes.some((name) => !INSTANCE_TYPE.test(name)))
    throw new Error('instanceTypes contains an invalid value');
  for (const id of [...input.brownfieldResourceIds, ...(input.observedOwnedResourceIds ?? [])]) {
    if (!RESOURCE_ID.test(id)) throw new Error(`Invalid AWS brownfield resource ID: ${id}`);
    if (id.startsWith('arn:')) {
      const [, partition, , region, accountId] = id.split(':');
      if (
        partition !== input.partition ||
        accountId !== input.accountId ||
        (input.resourceRegion && region && region !== input.resourceRegion)
      )
        throw new Error(`AWS resource ARN is outside the requested partition, account, or region: ${id}`);
    }
  }
  const ownedPlanSha256s = [...new Set(input.ownedPlanSha256s ?? [])].sort();
  if (ownedPlanSha256s.some((digest) => !/^[a-f0-9]{64}$/.test(digest)))
    throw new Error('ownedPlanSha256s contains an invalid SHA-256');
  if ((input.observedOwnedResourceIds?.length ?? 0) > 0 && ownedPlanSha256s.length === 0)
    throw new Error('ownedPlanSha256s is required when observing existing owned resources');
  if (input.resourceRegion && !REGION.test(input.resourceRegion)) throw new Error('resourceRegion is invalid');
  if (input.resourceRegion && !regionMatchesPartition(input.resourceRegion, input.partition))
    throw new Error('resourceRegion does not match partition');
  if ([...input.brownfieldResourceIds, ...(input.observedOwnedResourceIds ?? [])].length > 0 && !input.resourceRegion)
    throw new Error('resourceRegion is required when observing brownfield or owned resources');
  validateCapabilities(input.f5Capabilities);
  return instanceTypes;
}
function extractF5AwsGuideDocument(body) {
  if (!/<html[\s>]/i.test(body)) return body;
  const nextData = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(body)?.[1];
  if (!nextData) throw new Error('F5 guide HTML did not contain its document payload');
  let parsed;
  try {
    parsed = JSON.parse(nextData);
  } catch {
    throw new Error('F5 guide document payload was invalid JSON');
  }
  const pageProps = parsed.props;
  const page = pageProps?.pageProps;
  const docData = page?.docData;
  const compiledSource = docData?.compiledSource;
  if (typeof compiledSource !== 'string' || compiledSource.length < 100)
    throw new Error('F5 guide document payload did not contain compiled source');
  return compiledSource;
}
function isF5Smsv2TgwConnectDocumented(body) {
  return (
    /secure mesh site v2/i.test(body) &&
    /transit gateway connect|\btgw connect\b/i.test(body) &&
    /\bgre\b/i.test(body) &&
    /\bbgp\b/i.test(body)
  );
}
function isMcnAwsTgwConnectDocumented(body) {
  return (
    /MCN deploys three independent/i.test(body) &&
    /Secure Mesh Site v2/i.test(body) &&
    /six GRE Connect peers/i.test(body) &&
    /twelve BGP sessions/i.test(body) &&
    /SLI payload/i.test(body)
  );
}
async function research(fetcher) {
  const urls = [AWS_CE_SHARED_CONTRACT_URL, AWS_CE_F5_GUIDE_URL, AWS_CE_TGW_GUIDE_URL, ...AWS_SOURCES];
  let f5Body = '';
  let tgwBody = '';
  const sourceReceipts = await Promise.all(
    urls.map(async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetcher(url, {
          redirect: 'follow',
          signal: controller.signal,
          headers: { 'user-agent': 'xcsh-aws-ce-research/2' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.text();
        const normalized = normalizeResearchDocument(
          url === AWS_CE_F5_GUIDE_URL ? extractF5AwsGuideDocument(body) : body,
        );
        if (normalized.trim().length < 100) throw new Error('response was empty');
        if (
          url === AWS_CE_SHARED_CONTRACT_URL &&
          (!/^contract_id: f5xc-ce-automation-policy$/m.test(normalized) ||
            !/^contract_version: v2$/m.test(normalized) ||
            !normalized.includes('f5xc-ce-automation-policy/v2'))
        )
          throw new Error('document did not advertise f5xc-ce-automation-policy/v2');
        if (url === AWS_CE_F5_GUIDE_URL) f5Body = normalized;
        if (url === AWS_CE_TGW_GUIDE_URL) tgwBody = normalized;
        return { url, normalizedSha256: sha256Hex(normalized) };
      } catch (error) {
        throw new Error(
          `Official AWS CE research failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  sourceReceipts.sort((left, right) => left.url.localeCompare(right.url));
  const shared = sourceReceipts.find((item) => item.url === AWS_CE_SHARED_CONTRACT_URL);
  const f5 = sourceReceipts.find((item) => item.url === AWS_CE_F5_GUIDE_URL);
  const tgw = sourceReceipts.find((item) => item.url === AWS_CE_TGW_GUIDE_URL);
  if (!shared || !f5 || !tgw) throw new Error('Official AWS CE research did not return every required source receipt');
  const tgwConnectDocumented = isF5Smsv2TgwConnectDocumented(f5Body);
  return {
    method: 'aws-cli-live',
    officialSourceRetrieval: 'live',
    commands: [],
    officialSources: [AWS_CE_F5_GUIDE_URL, AWS_CE_TGW_GUIDE_URL, ...AWS_SOURCES],
    mcnTgwGuide: {
      url: AWS_CE_TGW_GUIDE_URL,
      normalizedSha256: tgw.normalizedSha256,
      documented: isMcnAwsTgwConnectDocumented(tgwBody),
    },
    sourceReceipts,
    sharedContract: {
      url: AWS_CE_SHARED_CONTRACT_URL,
      contractId: 'f5xc-ce-automation-policy',
      contractVersion: 'v2',
      normalizedSha256: shared.normalizedSha256,
    },
    f5AwsGuide: {
      url: AWS_CE_F5_GUIDE_URL,
      normalizedSha256: f5.normalizedSha256,
      tgwConnectDocumented,
    },
  };
}
function memoryMiB(raw) {
  return Number(raw.MemoryInfo?.SizeInMiB ?? 0);
}
function eniLimit(raw) {
  const network = raw.NetworkInfo ?? {};
  return {
    maxEnis: Number(network.MaximumNetworkInterfaces ?? 0),
    ipv4PerEni: Number(network.Ipv4AddressesPerInterface ?? 0),
  };
}
async function observeRegion(
  api,
  region,
  optInStatus,
  instanceTypes,
  requiredEnis,
  nodeCount,
  egressMode,
  routingProfile,
  ownership,
  vpcMode = 'greenfield',
) {
  const enabled = optInStatus === 'opt-in-not-required' || optInStatus === 'opted-in';
  if (!enabled)
    return {
      name: region,
      optInStatus,
      enabled: false,
      rank: 0,
      eligible: false,
      reasons: ['region-disabled'],
      instanceTypes: [],
      vcpuQuota: 0,
      networkQuotas: [],
      transitGatewaySupported: false,
      brownfieldProximity: 0,
    };
  const reasons = [];
  let ami;
  try {
    const [parameter, allowed] = await Promise.all([
      json(api, ['ssm', 'get-parameter', '--name', AWS_CE_SSM_PARAMETER, '--region', region]),
      json(api, ['ec2', 'get-allowed-images-settings', '--region', region]),
    ]);
    const parameterData = parameter.Parameter ?? {};
    const imageId = String(parameterData.Value ?? '');
    if (!/^ami-[0-9a-f]{8,17}$/.test(imageId)) throw new Error('SSM parameter returned an invalid AMI ID');
    const images = await json(api, [
      'ec2',
      'describe-images',
      '--image-ids',
      imageId,
      '--include-deprecated',
      '--region',
      region,
    ]);
    const image = images.Images?.find((item) => item.ImageId === imageId);
    if (!image) throw new Error('AMI was not returned by describe-images');
    const permissions = await json(api, [
      'ec2',
      'describe-image-attribute',
      '--image-id',
      imageId,
      '--attribute',
      'launchPermission',
      '--region',
      region,
    ]).catch(() => ({ LaunchPermissions: [] }));
    const mappings = Array.isArray(image.BlockDeviceMappings) ? image.BlockDeviceMappings : [];
    const root = mappings.find((item) => item.DeviceName === image.RootDeviceName) ?? mappings[0] ?? {};
    const ebs = root.Ebs ?? {};
    const productCodes = (Array.isArray(image.ProductCodes) ? image.ProductCodes : [])
      .map((item) => String(item.ProductCodeId ?? ''))
      .filter(Boolean)
      .sort();
    const deprecation = typeof image.DeprecationTime === 'string' ? image.DeprecationTime : undefined;
    const allowedByPolicy = allowed.State !== 'enabled' || image.ImageAllowed !== false;
    const launchPermission = Boolean(image.Public) || (permissions.LaunchPermissions?.length ?? 0) > 0;
    ami = {
      id: imageId,
      ssmParameter: AWS_CE_SSM_PARAMETER,
      ssmVersion: Number(parameterData.Version ?? 0),
      ownerAlias: String(image.ImageOwnerAlias ?? image.OwnerAlias ?? ''),
      ownerId: String(image.OwnerId ?? ''),
      productCodes,
      architecture: String(image.Architecture ?? ''),
      creationDate: String(image.CreationDate ?? ''),
      deprecationTime: deprecation,
      state: String(image.State ?? ''),
      rootDeviceName: String(image.RootDeviceName ?? ''),
      rootVolumeGiB: Number(ebs.VolumeSize ?? 0),
      launchPermission,
      allowedByPolicy,
    };
    if (ami.ownerAlias !== 'aws-marketplace' || ami.productCodes.length === 0)
      reasons.push('ami-not-marketplace-owned');
    if (ami.architecture !== 'x86_64') reasons.push('ami-architecture');
    if (ami.state !== 'available') reasons.push('ami-state');
    if (!ami.ssmVersion) reasons.push('ssm-version');
    if (!ami.rootDeviceName || ami.rootVolumeGiB < 1) reasons.push('ami-root-disk');
    if (!ami.launchPermission) reasons.push('ami-launch-permission');
    if (!ami.allowedByPolicy) reasons.push('ami-policy');
    if (deprecation && Date.parse(deprecation) <= Date.now()) reasons.push('ami-deprecated');
  } catch {
    reasons.push('ami-observation-failed');
  }
  const [details, offerings, quota, networkQuotaResults, tgw] = await Promise.all([
    json(api, ['ec2', 'describe-instance-types', '--instance-types', ...instanceTypes, '--region', region]).catch(
      () => ({ InstanceTypes: [] }),
    ),
    json(api, [
      'ec2',
      'describe-instance-type-offerings',
      '--location-type',
      'availability-zone',
      '--filters',
      `Name=instance-type,Values=${instanceTypes.join(',')}`,
      '--region',
      region,
    ]).catch(() => ({ InstanceTypeOfferings: [] })),
    json(api, [
      'service-quotas',
      'get-service-quota',
      '--service-code',
      'ec2',
      '--quota-code',
      'L-1216C47A',
      '--region',
      region,
    ]).catch(() => ({})),
    Promise.all(
      ['ec2', 'vpc', 'elasticloadbalancing'].map(async (serviceCode) => {
        try {
          const result = await json(api, [
            'service-quotas',
            'list-service-quotas',
            '--service-code',
            serviceCode,
            '--region',
            region,
          ]);
          return { serviceCode, quotas: result.Quotas ?? [], ok: true };
        } catch {
          return { serviceCode, quotas: [], ok: false };
        }
      }),
    ),
    api.exec('aws', ['ec2', 'describe-transit-gateways', '--max-results', '5', '--region', region, '--output', 'json']),
  ]);
  const zonesByType = new Map();
  for (const offering of offerings.InstanceTypeOfferings ?? []) {
    const name = String(offering.InstanceType ?? '');
    const zones = zonesByType.get(name) ?? [];
    zones.push(String(offering.Location ?? ''));
    zonesByType.set(name, zones);
  }
  const observedTypes = (details.InstanceTypes ?? [])
    .map((item) => {
      const name = String(item.InstanceType ?? '');
      const limits = eniLimit(item);
      const vCpus = Number(item.VCpuInfo?.DefaultVCpus ?? 0);
      const memory = memoryMiB(item);
      const zones = [...new Set(zonesByType.get(name) ?? [])].sort();
      const supportedArchitectures = item.ProcessorInfo?.SupportedArchitectures;
      const itemReasons = [];
      if (!Array.isArray(supportedArchitectures) || !ami || !supportedArchitectures.includes(ami.architecture))
        itemReasons.push('ami-architecture');
      if (vCpus < 8 || memory < 32 * 1024) itemReasons.push('ce-minimum-size');
      if (limits.maxEnis < requiredEnis) itemReasons.push('eni-limit');
      if (zones.length < nodeCount) itemReasons.push('az-offering');
      return {
        name,
        vCpus,
        supportedArchitectures: Array.isArray(supportedArchitectures)
          ? supportedArchitectures.filter((value) => typeof value === 'string')
          : [],
        memoryMiB: memory,
        maxEnis: limits.maxEnis,
        ipv4PerEni: limits.ipv4PerEni,
        availabilityZones: zones,
        supported: itemReasons.length === 0,
        reasons: itemReasons,
      };
    })
    .sort((left, right) => Number(right.supported) - Number(left.supported) || left.name.localeCompare(right.name));
  if (!observedTypes.some((item) => item.supported)) reasons.push('instance-type');
  const quotaRecord = quota;
  const vcpuQuota = Number(quotaRecord.Quota?.Value ?? 0);
  const selected = observedTypes.find((item) => item.supported);
  let vcpuCapacity;
  try {
    vcpuCapacity = await observeStandardVcpuCapacity(
      api,
      region,
      vcpuQuota,
      ownership ?? { deploymentName: '', planSha256s: [] },
      nodeCount,
    );
    if (vcpuCapacity.remaining < (selected?.vCpus ?? 8) * nodeCount) reasons.push('vcpu-quota');
    for (const type of observedTypes) {
      if (type.vCpus * nodeCount > vcpuCapacity.remaining) {
        type.supported = false;
        type.reasons.push('remaining-vcpu-quota');
      }
    }
  } catch {
    reasons.push('vcpu-usage-unavailable');
    for (const type of observedTypes) {
      type.supported = false;
      type.reasons.push('vcpu-usage-unavailable');
    }
  }
  const networkQuotas = networkQuotaResults
    .flatMap((result) =>
      result.quotas.map((item) => ({
        serviceCode: result.serviceCode,
        quotaCode: String(item.QuotaCode ?? ''),
        quotaName: String(item.QuotaName ?? ''),
        value: Number(item.Value ?? 0),
      })),
    )
    .filter((item) => item.quotaCode && item.quotaName && Number.isFinite(item.value))
    .sort(
      (left, right) =>
        left.serviceCode.localeCompare(right.serviceCode) ||
        left.quotaCode.localeCompare(right.quotaCode) ||
        left.quotaName.localeCompare(right.quotaName),
    );
  if (networkQuotaResults.some((result) => !result.ok)) reasons.push('network-quota-observation-failed');
  const quotaValue = (pattern) => networkQuotas.find((item) => pattern.test(item.quotaName))?.value;
  let vpcCapacity;
  let internetGatewayCapacity;
  try {
    const owner = ownership ?? { deploymentName: '', planSha256s: [], accountId: undefined };
    vpcCapacity = await observeTaggedResourceCapacity(
      api,
      region,
      'describe-vpcs',
      'Vpcs',
      'VpcId',
      quotaValue(/^vpcs per region$/i) ?? NaN,
      owner,
    );
    if (vpcMode === 'greenfield' && vpcCapacity.remaining < 1) reasons.push('vpc-quota');
    if (egressMode === 'elastic-ip' && vpcMode === 'greenfield') {
      internetGatewayCapacity = await observeTaggedResourceCapacity(
        api,
        region,
        'describe-internet-gateways',
        'InternetGateways',
        'InternetGatewayId',
        quotaValue(/internet gateways per region/i) ?? NaN,
        owner,
      );
      if (internetGatewayCapacity.remaining < 1) reasons.push('internet-gateway-quota');
    }
  } catch {
    if (vpcMode === 'greenfield') reasons.push('vpc-or-gateway-capacity-unavailable');
  }
  let elasticIpCapacity;
  if (egressMode === 'elastic-ip') {
    try {
      const response = await json(api, ['ec2', 'describe-addresses', '--region', region]);
      if (response.NextToken || !Array.isArray(response.Addresses)) throw new Error('Incomplete EIP usage evidence');
      const ids = new Set();
      let reusableOwned = 0;
      for (const address of response.Addresses) {
        if (
          typeof address.AllocationId !== 'string' ||
          !/^eipalloc-[0-9a-f]{8,17}$/.test(address.AllocationId) ||
          ids.has(address.AllocationId)
        )
          throw new Error('Ambiguous EIP identity');
        ids.add(address.AllocationId);
        const tags = Array.isArray(address.Tags) ? address.Tags : [];
        const tag = (key) =>
          tags.filter((item) => item.Key === key).length === 1
            ? tags.find((item) => item.Key === key)?.Value
            : undefined;
        if (
          ownership?.resourceIds.includes(address.AllocationId) &&
          tag('xcsh-managed-by') === 'aws-ce' &&
          tag('xcsh-deployment-id') === ownership.deploymentName &&
          ownership.planSha256s.includes(tag('xcsh-plan-sha256') ?? '') &&
          ['native', 'terraform'].includes(tag('xcsh-execution-engine') ?? '')
        )
          reusableOwned++;
      }
      const limit = quotaValue(/elastic ips/i) ?? 0;
      elasticIpCapacity = {
        limit,
        allocated: ids.size,
        reusableOwned,
        available: Math.max(0, limit - ids.size),
        requiredAdditional: Math.max(0, nodeCount - reusableOwned),
      };
      if (elasticIpCapacity.available < elasticIpCapacity.requiredAdditional) reasons.push('elastic-ip-quota');
    } catch {
      reasons.push('elastic-ip-usage-observation-failed');
    }
  }
  if (routingProfile === 'nlb-ingress' && (quotaValue(/network load balancers.*region/i) ?? 0) < 1)
    reasons.push('nlb-quota');
  return {
    name: region,
    optInStatus,
    enabled: true,
    rank: 0,
    eligible: reasons.length === 0,
    reasons: [...new Set(reasons)].sort(),
    ami,
    instanceTypes: observedTypes,
    vcpuQuota,
    vcpuCapacity,
    vpcCapacity,
    internetGatewayCapacity,
    networkQuotas,
    elasticIpCapacity,
    transitGatewaySupported: tgw.exitCode === 0,
    brownfieldProximity: 0,
  };
}
async function observeResource(api, id, region, deploymentName, ownedPlanSha256s) {
  let args;
  if (id.startsWith('i-')) args = ['ec2', 'describe-instances', '--instance-ids', id];
  else if (id.startsWith('eni-')) args = ['ec2', 'describe-network-interfaces', '--network-interface-ids', id];
  else if (id.startsWith('sg-')) args = ['ec2', 'describe-security-groups', '--group-ids', id];
  else if (id.startsWith('eipalloc-')) args = ['ec2', 'describe-addresses', '--allocation-ids', id];
  else if (id.startsWith('eipassoc-'))
    args = ['ec2', 'describe-addresses', '--filters', `Name=association-id,Values=${id}`];
  else if (id.startsWith('nat-')) args = ['ec2', 'describe-nat-gateways', '--nat-gateway-ids', id];
  else if (id.startsWith('vpce-')) args = ['ec2', 'describe-vpc-endpoints', '--vpc-endpoint-ids', id];
  else if (id.startsWith('rtb-')) args = ['ec2', 'describe-route-tables', '--route-table-ids', id];
  else if (id.startsWith('subnet-')) args = ['ec2', 'describe-subnets', '--subnet-ids', id];
  else if (id.startsWith('igw-')) args = ['ec2', 'describe-internet-gateways', '--internet-gateway-ids', id];
  else if (id.startsWith('vpc-')) args = ['ec2', 'describe-vpcs', '--vpc-ids', id];
  else if (id.startsWith('tgw-rtb-'))
    args = ['ec2', 'get-transit-gateway-route-table-associations', '--transit-gateway-route-table-id', id];
  else if (id.startsWith('tgw-connect-peer-'))
    args = ['ec2', 'describe-transit-gateway-connect-peers', '--transit-gateway-connect-peer-ids', id];
  else if (id.startsWith('tgw-attach-'))
    args = ['ec2', 'describe-transit-gateway-attachments', '--transit-gateway-attachment-ids', id];
  else if (id.startsWith('tgw-')) args = ['ec2', 'describe-transit-gateways', '--transit-gateway-ids', id];
  else if (/^arn:[^:]+:elasticloadbalancing:.*:targetgroup\//.test(id))
    args = ['elbv2', 'describe-target-health', '--target-group-arn', id];
  else if (/^arn:[^:]+:elasticloadbalancing:.*:loadbalancer\//.test(id))
    args = ['elbv2', 'describe-load-balancers', '--load-balancer-arns', id];
  else if (/^arn:[^:]+:elasticloadbalancing:.*:listener\//.test(id))
    args = ['elbv2', 'describe-listeners', '--listener-arns', id];
  else args = ['resourcegroupstaggingapi', 'get-resources', '--resource-arn-list', id];
  const result = await api.exec('aws', [...args, '--region', region, '--output', 'json']);
  if (result.exitCode !== 0) {
    if (/not.?found|does not exist|invalid.*not found/i.test(result.stderr))
      return { id, region, exists: false, owned: false, tags: {}, state: {} };
    throw new Error(`AWS resource observation failed for ${id}: ${result.stderr}`);
  }
  const raw = JSON.parse(result.stdout);
  const complete = (response) => {
    if (response.NextToken || response.NextMarker || response.nextToken)
      throw new Error('Incomplete AWS resource observation');
  };
  complete(raw);
  if (id.startsWith('tgw-rtb-')) {
    const table = await json(api, [
      'ec2',
      'describe-transit-gateway-route-tables',
      '--transit-gateway-route-table-ids',
      id,
      '--region',
      region,
    ]);
    complete(table);
    raw.TransitGatewayRouteTables = table.TransitGatewayRouteTables;
    const propagation = await api.exec('aws', [
      'ec2',
      'get-transit-gateway-route-table-propagations',
      '--transit-gateway-route-table-id',
      id,
      '--region',
      region,
      '--output',
      'json',
    ]);
    if (propagation.exitCode !== 0)
      throw new Error(`AWS TGW propagation observation failed for ${id}: ${propagation.stderr}`);
    const propagated = JSON.parse(propagation.stdout);
    complete(propagated);
    if (!Array.isArray(propagated.TransitGatewayRouteTablePropagations))
      throw new Error('Incomplete AWS TGW propagation observation');
    raw.Propagations = propagated.TransitGatewayRouteTablePropagations;
  }
  if (/^arn:[^:]+:elasticloadbalancing:/.test(id)) {
    const tagResult = await api.exec('aws', [
      'elbv2',
      'describe-tags',
      '--resource-arns',
      id,
      '--region',
      region,
      '--output',
      'json',
    ]);
    if (tagResult.exitCode !== 0) throw new Error(`AWS ELB tag observation failed for ${id}: ${tagResult.stderr}`);
    let descriptions = JSON.parse(tagResult.stdout).TagDescriptions ?? [];
    if (/^arn:[^:]+:elasticloadbalancing:.*:listener\//.test(id)) {
      const direct = Array.isArray(descriptions) ? descriptions : [];
      const directTags = direct.find((item) => item.ResourceArn === id)?.Tags;
      if (!Array.isArray(directTags) || directTags.length === 0) {
        const listeners = Array.isArray(raw.Listeners) ? raw.Listeners : [];
        const parent = listeners.length === 1 ? listeners[0].LoadBalancerArn : undefined;
        if (typeof parent !== 'string' || !/^arn:[^:]+:elasticloadbalancing:.*:loadbalancer\//.test(parent))
          throw new Error('AWS listener parent ownership evidence is unavailable');
        const parentResult = await api.exec('aws', [
          'elbv2',
          'describe-tags',
          '--resource-arns',
          parent,
          '--region',
          region,
          '--output',
          'json',
        ]);
        if (parentResult.exitCode !== 0)
          throw new Error(`AWS listener parent tag observation failed for ${id}: ${parentResult.stderr}`);
        const parents = JSON.parse(parentResult.stdout).TagDescriptions;
        const rows = Array.isArray(parents) ? parents : [];
        const inherited = rows.filter((item) => item.ResourceArn === parent);
        if (inherited.length !== 1 || !Array.isArray(inherited[0].Tags))
          throw new Error('AWS listener parent ownership evidence is ambiguous');
        descriptions = [{ ResourceArn: id, Tags: inherited[0].Tags, OwnershipParentArn: parent }];
      }
    }
    raw.TagDescriptions = descriptions;
  }
  const matches = [];
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else if (value && typeof value === 'object') {
      const object = value;
      if (Object.values(object).some((item) => item === id)) matches.push(object);
      for (const item of Object.values(object)) visit(item);
    }
  };
  visit(raw);
  const tagSets = matches.filter((object) => Array.isArray(object.Tags) || Array.isArray(object.TagSet));
  if (tagSets.length > 1) throw new Error('AWS ownership evidence is ambiguous');
  if (tagSets[0]?.Tags !== undefined && tagSets[0]?.TagSet !== undefined)
    throw new Error('AWS ownership tag representation is ambiguous');
  const tags = {};
  for (const item of tagSets[0]?.TagSet ?? tagSets[0]?.Tags ?? []) {
    if (!item || typeof item !== 'object') throw new Error('AWS ownership tags are malformed');
    const { Key, Value } = item;
    if (typeof Key !== 'string' || typeof Value !== 'string' || Object.hasOwn(tags, Key))
      throw new Error('AWS ownership tags are malformed or duplicated');
    tags[Key] = Value;
  }
  const terminalDeleted = (() => {
    const rows = id.startsWith('tgw-connect-peer-')
      ? raw.TransitGatewayConnectPeers
      : id.startsWith('tgw-attach-')
        ? raw.TransitGatewayAttachments
        : undefined;
    return (
      Array.isArray(rows) &&
      rows.length === 1 &&
      rows[0] !== null &&
      typeof rows[0] === 'object' &&
      String(rows[0].State ?? '').toLowerCase() === 'deleted'
    );
  })();
  return {
    id,
    region,
    exists: matches.length > 0 && !terminalDeleted,
    owned:
      !terminalDeleted &&
      tags['xcsh-managed-by'] === 'aws-ce' &&
      ['native', 'terraform'].includes(tags['xcsh-execution-engine']) &&
      tags['xcsh-deployment-id'] === deploymentName &&
      ownedPlanSha256s.includes(tags['xcsh-plan-sha256'] ?? ''),
    tags,
    state: raw,
  };
}
async function observeAwsResources(api, ids, region, ownership) {
  const normalized = [...new Set(ids)].sort();
  for (const id of normalized) if (!RESOURCE_ID.test(id)) throw new Error(`Invalid AWS resource observation ID: ${id}`);
  if (!SAFE_NAME.test(ownership.deploymentName)) throw new Error('Invalid AWS ownership deployment name');
  if (ownership.planSha256s.some((digest) => !/^[a-f0-9]{64}$/.test(digest)))
    throw new Error('Invalid AWS ownership plan SHA-256');
  return mapLimit(normalized, 3, (id) =>
    observeResource(api, id, region, ownership.deploymentName, ownership.planSha256s),
  );
}
async function discoverAwsCompute(input, api, fetcher = fetch) {
  input = { ...input, awsProfile: input.awsProfile ?? 'default' };
  api = scopedAwsApi(api, input.awsProfile);
  const instanceTypes = validateInput(input);
  const researchReceipt = await research(fetcher);
  const identity = await json(api, ['sts', 'get-caller-identity']);
  if (String(identity.Account) !== input.accountId) throw new Error('AWS CLI returned a different account');
  const arn = String(identity.Arn ?? '');
  if (!arn.startsWith(`arn:${input.partition}:`)) throw new Error('AWS CLI returned a different partition');
  const [regionResult, agreements] = await Promise.all([
    json(api, ['ec2', 'describe-regions', '--all-regions']),
    json(api, [
      'marketplace-agreement',
      'search-agreements',
      '--catalog',
      'AWSMarketplace',
      '--filters',
      JSON.stringify([
        { name: 'PartyType', values: ['Acceptor'] },
        { name: 'AgreementType', values: ['PurchaseAgreement'] },
        { name: 'ResourceIdentifier', values: [AWS_CE_MARKETPLACE_PRODUCT_ID] },
        { name: 'Status', values: ['ACTIVE'] },
      ]),
      '--region',
      input.partition === 'aws' ? 'us-east-1' : input.partition === 'aws-us-gov' ? 'us-gov-west-1' : 'cn-north-1',
    ]),
  ]);
  const activeAgreements = (agreements.agreementViewSummaries ?? [])
    .filter((item) => String(item.status ?? '').toUpperCase() === 'ACTIVE')
    .map((item) => String(item.agreementId ?? ''))
    .filter(Boolean)
    .sort();
  const rawRegions = (regionResult.Regions ?? [])
    .map((item) => ({ name: String(item.RegionName ?? ''), status: String(item.OptInStatus ?? '') }))
    .filter((item) => REGION.test(item.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const regions = await mapLimit(rawRegions, 3, (item) =>
    observeRegion(
      api,
      item.name,
      item.status,
      instanceTypes,
      input.requiredEnis,
      input.nodeCount,
      input.egressMode,
      input.routingProfile,
      {
        deploymentName: input.deploymentName,
        accountId: input.accountId,
        resourceIds: input.observedOwnedResourceIds ?? [],
        planSha256s: input.ownedPlanSha256s ?? [],
      },
      input.vpcMode ?? 'greenfield',
    ),
  );
  regions.sort(
    (left, right) =>
      Number(right.eligible) - Number(left.eligible) ||
      Number(right.enabled) - Number(left.enabled) ||
      right.brownfieldProximity - left.brownfieldProximity ||
      left.reasons.length - right.reasons.length ||
      left.name.localeCompare(right.name),
  );
  regions.forEach((region, index) => {
    region.rank = index + 1;
  });
  const selectedRegion =
    input.resourceRegion ?? regions.find((region) => region.enabled)?.name ?? rawRegions[0]?.name ?? 'us-east-1';
  const resources = await observeAwsResources(
    api,
    [...input.brownfieldResourceIds, ...(input.observedOwnedResourceIds ?? [])],
    selectedRegion,
    { deploymentName: input.deploymentName, planSha256s: [...new Set(input.ownedPlanSha256s ?? [])].sort() },
  );
  researchReceipt.commands = [
    'aws sts get-caller-identity',
    'aws ec2 describe-regions --all-regions',
    `aws ssm get-parameter --name ${AWS_CE_SSM_PARAMETER}`,
    'aws ec2 describe-images',
    'aws ec2 describe-image-attribute',
    'aws ec2 get-allowed-images-settings',
    'aws ec2 describe-instance-types',
    'aws ec2 describe-instance-type-offerings',
    'aws service-quotas get-service-quota',
    'aws service-quotas list-service-quotas',
    'aws marketplace-agreement search-agreements',
  ];
  return {
    schemaVersion: AWS_CE_SCHEMA_VERSION,
    identity: {
      accountId: input.accountId,
      partition: input.partition,
      arn,
      ...(input.awsProfile ? { awsProfile: input.awsProfile } : {}),
    },
    agreement: {
      productId: AWS_CE_MARKETPLACE_PRODUCT_ID,
      active: activeAgreements.length > 0,
      agreementIds: activeAgreements,
    },
    regions,
    resources,
    ownershipPlanSha256s: [...new Set(input.ownedPlanSha256s ?? [])].sort(),
    f5Capabilities: input.f5Capabilities,
    f5CapabilitiesSha256: canonicalSha256(input.f5Capabilities),
    research: researchReceipt,
  };
}
var AWS_SOURCES, ACCOUNT, SAFE_NAME, INSTANCE_TYPE, REGION, RESOURCE_ID, DEFAULT_INSTANCE_TYPES;
var init_discovery = __esm(() => {
  init_canonical();
  init_capacity();
  init_types2();
  AWS_SOURCES = [
    'https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-regions.html',
    'https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-public-parameters.html',
    'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/allowed-amis.html',
    'https://docs.aws.amazon.com/marketplace/latest/userguide/programmatically-accessing-agreement-details.html',
    'https://docs.aws.amazon.com/vpc/latest/tgw/tgw-connect.html',
  ];
  ACCOUNT = /^\d{12}$/;
  SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;
  INSTANCE_TYPE = /^[a-z0-9][a-z0-9.-]{1,40}$/;
  REGION = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
  RESOURCE_ID =
    /^(?:arn:(?:aws|aws-us-gov|aws-cn):[a-z0-9-]+:[a-z0-9-]*:\d{12}:[A-Za-z0-9_+=,.@:/-]+|(?:i|vpc|subnet|rtb|igw|tgw|tgw-attach|tgw-connect-peer|tgw-rtb|eni|sg|eipalloc|eipassoc|nat|vpce)-[0-9a-f]{8,21})$/;
  DEFAULT_INSTANCE_TYPES = ['m5.2xlarge', 'm5.4xlarge', 'm6i.2xlarge', 'm6i.4xlarge', 'm7i.2xlarge', 'm7i.4xlarge'];
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
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join as join2 } from 'node:path';

async function bootId() {
  const value = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
  if (!bootPattern.test(value)) throw new Error('Process boot identity is unavailable');
  return value;
}
async function processStartTicks(pid) {
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
    const claimPath = join2(path, 'claim.json');
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
async function acquireProcessLock(path) {
  if (!path.startsWith('/') || !/^\.[a-z][a-z0-9-]*-lock$/.test(basename(path)))
    throw new Error('Invalid operation lock path');
  const currentBootId = await bootId();
  const currentStart = await processStartTicks(process.pid);
  if (!currentStart) throw new Error('Current process identity is unavailable');
  const mine = {
    schemaVersion: 1,
    token: randomUUID(),
    pid: process.pid,
    bootId: currentBootId,
    processStartTicks: currentStart,
  };
  const parent = dirname(path);
  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = join2(parent, `${basename(path)}.claim-${mine.token}`);
    await mkdir(candidate, { mode: 448 });
    await writeFile(join2(candidate, 'claim.json'), JSON.stringify(mine), { mode: 384, flag: 'wx' });
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
    const stale = join2(parent, `${basename(path)}.stale-${randomUUID()}`);
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

// plugins/platform/src/ce/ingress-lifecycle.ts
var init_ingress_lifecycle = __esm(() => {
  init_process_lock();
  init_runtime();
});

// plugins/platform/src/ce/initial-versions.ts
function initialSoftwareSettings(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !['software', 'os'].includes(key)) ||
    typeof value.software !== 'string' ||
    !/^crt-\d{8}-\d{4}$/.test(value.software) ||
    typeof value.os !== 'string' ||
    !/^\d+\.\d{4}\.\d+$/.test(value.os)
  )
    throw new Error('Initial software and OS versions must be an explicit version pair');
  return { os: { operating_system_version: value.os }, sw: { volterra_software_version: value.software } };
}

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
// plugins/platform/src/ce/site-labels.ts
var discoveryLabels;
var init_site_labels = __esm(() => {
  discoveryLabels = new Set(['domain', 'host-os-version', 'hw-model', 'hw-serial-number', 'hw-vendor', 'hw-version']);
});

// plugins/platform/src/ce/teardown-inventory.ts
var init_teardown_inventory = __esm(() => {
  init_runtime();
});

// plugins/platform/src/ce/upgrade-evidence.ts
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed upgrade evidence');
  return value;
}
function text(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing upgrade evidence');
  return value;
}
function parseUpgradePrechecks(raw) {
  const list = object(raw).checklist;
  if (!Array.isArray(list) || !list.length) throw new Error('Missing upgrade prechecks');
  const seen = new Set();
  const checks = list.map((value) => {
    const row = object(value),
      name = text(row.item),
      status = text(row.status);
    if (
      seen.has(name) ||
      !['CHECKLIST_UNKNOWN', 'CHECKLIST_PASSED', 'CHECKLIST_WARNING', 'CHECKLIST_FAILED'].includes(status)
    )
      throw new Error('Duplicate or unknown upgrade precheck');
    seen.add(name);
    return { name, status };
  });
  return { checks, passing: checks.every((check) => ['CHECKLIST_PASSED', 'CHECKLIST_WARNING'].includes(check.status)) };
}
function parseSoftwareTargets(raw) {
  const values = object(raw).sw_versions;
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== 'string' || !/^crt-\d{8}-\d{4}$/.test(value)) ||
    new Set(values).size !== values.length
  )
    throw new Error('Missing or malformed software upgrade targets');
  return values;
}
var init_upgrade_evidence = () => {};

// plugins/platform/src/ce/runtime.ts
var CE_API_ERROR_BRAND, CeApiError;
var init_runtime = __esm(() => {
  init_bgp_evidence();
  init_bgp_route_evidence();
  init_bootstrap();
  init_ingress_lifecycle();
  init_interface_evidence();
  init_origin_teardown();
  init_platform_drain();
  init_site_labels();
  init_teardown_inventory();
  init_upgrade_evidence();
  CE_API_ERROR_BRAND = Symbol.for('xcsh.ce.api-error.v1');
  CeApiError = class CeApiError extends Error {
    category;
    status;
    [CE_API_ERROR_BRAND] = true;
    static [Symbol.hasInstance](value) {
      if (!(value instanceof Error)) return false;
      const candidate = value;
      return (
        candidate[CE_API_ERROR_BRAND] === true &&
        [
          'authorization',
          'expired',
          'throttled',
          'not-found',
          'conflict',
          'invalid-request',
          'transient',
          'malformed',
          'cancelled',
          'deadline',
        ].includes(String(candidate.category)) &&
        (candidate.status === undefined ||
          (Number.isInteger(candidate.status) && Number(candidate.status) >= 100 && Number(candidate.status) <= 599))
      );
    }
    constructor(category, status) {
      super(`F5 CE API ${category}${status ? ` (HTTP ${status})` : ''}`);
      this.category = category;
      this.status = status;
    }
  };
});

// plugins/platform/src/ce/contract-auth.ts
import { execFileSync } from 'node:child_process';

function existingContractCredential(env = process.env) {
  const configured = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (configured) return configured;
  try {
    return (
      execFileSync('gh', ['auth', 'token'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || undefined
    );
  } catch {
    return;
  }
}
function contractHeaders(url, token) {
  const headers = { Accept: 'application/vnd.github+json' };
  const target = new URL(url);
  if (
    token &&
    target.origin === 'https://api.github.com' &&
    target.pathname.startsWith('/repos/f5-sales-demo/api-specs-enriched/')
  )
    headers.Authorization = `Bearer ${token}`;
  return headers;
}
function authenticatedContractHeaders(url) {
  const target = new URL(url);
  const scoped =
    target.origin === 'https://api.github.com' &&
    target.pathname.startsWith('/repos/f5-sales-demo/api-specs-enriched/');
  return contractHeaders(url, scoped ? existingContractCredential() : undefined);
}
var init_contract_auth = () => {};

// plugins/platform/src/ce/verified-api-release.ts
import { createHash as createHash2 } from 'node:crypto';

function object2(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed CE API contract');
  return value;
}
function parse(bytes) {
  try {
    return object2(JSON.parse(Buffer.from(bytes).toString('utf8')));
  } catch {
    throw new Error('Malformed CE API contract JSON');
  }
}
async function loadPublishedCeApi(fetcher = fetch, signal) {
  signal?.throwIfAborted();
  let pending = verifiedSchemas.get(fetcher);
  if (!pending) {
    pending = verifyPublishedCeApi(fetcher, signal);
    verifiedSchemas.set(fetcher, pending);
    pending.catch(() => {
      if (verifiedSchemas.get(fetcher) === pending) verifiedSchemas.delete(fetcher);
    });
  }
  const api = await pending;
  signal?.throwIfAborted();
  return structuredClone(api);
}
async function verifyPublishedCeApi(fetcher, signal) {
  const deadline = AbortSignal.timeout(60000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const read = async (url, maximum = 1048576) => {
    combined.throwIfAborted();
    let response;
    try {
      response = await fetcher(url, { signal: combined, headers: authenticatedContractHeaders(url) });
    } catch {
      throw new CeContractFailure('public_contract_transport', 'Published contract transport failed');
    }
    if (!response.ok || !response.body)
      throw new CeContractFailure(
        'public_contract_transport',
        `CE API contract download failed: HTTP ${response.status}, ${new URL(url).hostname}`,
      );
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        combined.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maximum) throw new Error('CE API contract download exceeds size limit');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    return Buffer.concat(chunks);
  };
  const release = parse(await read(`https://api.github.com/repos/${repository}/releases/tags/${tag}`));
  if (release.tag_name !== tag || release.immutable !== true || release.draft !== false || release.prerelease !== false)
    throw new Error('CE API release is not the pinned immutable publication');
  const matches =
    typeof release.body === 'string' ? [...release.body.matchAll(/^<!-- publication-receipt:(.+) -->$/gm)] : [];
  if (matches.length !== 1) throw new Error('CE API publication receipt is missing or ambiguous');
  const receipt = parse(Buffer.from(matches[0][1]));
  if (receipt.commit !== commit || receipt.version !== '12.0.9' || object2(receipt.assets)['openapi.json'] !== digest)
    throw new Error('CE API publication receipt differs from the pinned contract');
  const assets = Array.isArray(release.assets)
    ? release.assets.map(object2).filter((asset) => asset.name === 'openapi.json')
    : [];
  if (assets.length !== 1 || assets[0].digest !== digest || assets[0].browser_download_url !== assetUrl)
    throw new Error('CE API schema asset binding differs from the pinned contract');
  const resolved = parse(await read(`https://api.github.com/repos/${repository}/commits/${tag}`));
  if (resolved.sha !== commit) throw new Error('CE API release tag moved');
  const bytes = await read(assetUrl, 64 * 1024 * 1024);
  if (`sha256:${createHash2('sha256').update(bytes).digest('hex')}` !== digest)
    throw new Error('CE API schema checksum mismatch');
  const api = parse(bytes);
  combined.throwIfAborted();
  return api;
}
var CeContractFailure,
  repository = 'f5-sales-demo/api-specs-enriched',
  tag = 'v12.0.9',
  commit = 'e04c5d45f7a4e103e2dc84bf52b767182b4de3bc',
  digest = 'sha256:8a3ea9bce1bab8aa228c10e0d646e693bcfb9c36562ad4efefef3c5b74062753',
  assetUrl,
  CE_API_RELEASE,
  verifiedSchemas;
var init_verified_api_release = __esm(() => {
  init_contract_auth();
  CeContractFailure = class CeContractFailure extends Error {
    category;
    constructor(category, message) {
      super(message);
      this.category = category;
    }
  };
  assetUrl = `https://github.com/${repository}/releases/download/${tag}/openapi.json`;
  CE_API_RELEASE = Object.freeze({ tag, commit, fingerprint: digest });
  verifiedSchemas = new WeakMap();
});

// plugins/platform/src/ce/release-contract.ts
var RELEASE_TAG, RELEASE_COMMIT, OPENAPI_SHA256, RELEASE_URL, TAG_URL, REQUIRED_ASSETS;
var init_release_contract = __esm(() => {
  init_verified_api_release();
  RELEASE_TAG = CE_API_RELEASE.tag;
  RELEASE_COMMIT = CE_API_RELEASE.commit;
  OPENAPI_SHA256 = CE_API_RELEASE.fingerprint;
  RELEASE_URL = `https://api.github.com/repos/f5-sales-demo/api-specs-enriched/releases/tags/${RELEASE_TAG}`;
  TAG_URL = `https://api.github.com/repos/f5-sales-demo/api-specs-enriched/commits/${RELEASE_TAG}`;
  REQUIRED_ASSETS = new Set([
    'api-catalog.json',
    'concurrency_contracts.json',
    'f5xc-api-specs-v12.0.9.zip',
    'index.json',
    'minimal-export-defaults.json',
    'openapi.json',
    'smsv2-contract-manifest.json',
    'smsv2-contract.json',
    'smsv2-evidence-receipt.json',
    'smsv2_parity_manifest.json',
    'upstream-contract-removals.json',
  ]);
});

// plugins/platform/src/ce/wire-replace.ts
function projectReplaceSnapshot(value, schemas, root, ignoredRootFields = []) {
  function shape(value, depth = 0) {
    if (depth > 50) throw new Error('Replacement schema nesting exceeds limit');
    const schema = object3(value);
    let resolved = {};
    if (schema.$ref) {
      if (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/components/schemas/'))
        throw new Error('Unsupported replacement reference');
      resolved = shape(schemas[schema.$ref.slice('#/components/schemas/'.length)], depth + 1);
    }
    if (schema.allOf)
      for (const item of schema.allOf) {
        const part = shape(item, depth + 1);
        resolved = {
          ...resolved,
          ...part,
          ...(resolved.properties || part.properties
            ? { properties: { ...resolved.properties, ...part.properties } }
            : {}),
        };
      }
    return {
      ...resolved,
      ...schema,
      ...(schema.properties ? { properties: { ...resolved.properties, ...object3(schema.properties) } } : {}),
    };
  }
  function project(value, schemaValue, top = false) {
    const schema = shape(schemaValue);
    if (schema.readOnly === true || value === null || (value === '' && Number(schema.minLength) > 0)) return;
    if (Array.isArray(value)) {
      if (!schema.items) throw new Error('Replacement array schema missing');
      return value.map((item) => {
        const projected = project(item, schema.items);
        if (projected === undefined) throw new Error('Replacement array contains an unset item');
        return projected;
      });
    }
    if (value && typeof value === 'object') {
      if (schema.properties === undefined && schema.additionalProperties === undefined) return structuredClone(value);
      const properties = object3(schema.properties ?? {});
      const result = {};
      for (const [key, item] of Object.entries(value)) {
        const canonicalKey = Object.hasOwn(properties, key)
          ? key
          : Object.keys(properties).find((name) => object3(properties[name])['x-f5xc-wire-name'] === key);
        if (canonicalKey === undefined) {
          if (top && ignoredRootFields.includes(key)) continue;
          if (schema.additionalProperties === true) {
            result[key] = structuredClone(item);
            continue;
          }
          if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const projected = project(item, schema.additionalProperties);
            if (projected !== undefined) result[key] = projected;
            continue;
          }
          throw new Error('GET snapshot contains an unsupported replacement field');
        }
        const wireName = object3(properties[canonicalKey])['x-f5xc-wire-name'];
        const outputKey = typeof wireName === 'string' ? wireName : canonicalKey;
        if (Object.hasOwn(result, outputKey)) throw new Error('Duplicate canonical and wire field aliases');
        const projected = project(item, properties[canonicalKey]);
        if (projected !== undefined) result[outputKey] = projected;
      }
      return result;
    }
    return structuredClone(value);
  }
  return object3(project(value, schemas[root], true));
}
var object3 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed replacement schema');
  return value;
};

// plugins/platform/src/ce/wire-schema.ts
import { isIP } from 'node:net';

function object4(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SMSv2 schema is malformed');
  return value;
}
function requestSchema(schemas, root) {
  const definitions = {};
  const referenced = new Set();
  function convert(value) {
    if (typeof value === 'boolean') return value;
    const source = object4(value);
    if (source.readOnly === true) return false;
    const result = {};
    for (const [key, item] of Object.entries(source)) {
      if (keywords.has(key)) result[key] = item;
      if (key === 'required' && Array.isArray(item))
        result.required = item.map((name) => {
          const property = object4(source.properties ?? {})[String(name)];
          return typeof property?.['x-f5xc-wire-name'] === 'string' ? property['x-f5xc-wire-name'] : name;
        });
      if (key === '$ref') {
        if (typeof item !== 'string' || !item.startsWith('#/components/schemas/'))
          throw new Error('Unsupported SMSv2 schema reference');
        const name = item.slice('#/components/schemas/'.length);
        if (!Object.hasOwn(schemas, name)) throw new Error('Missing SMSv2 schema reference');
        referenced.add(name);
        result.$ref = `#/definitions/${name}`;
      }
      if (key === 'properties') {
        result.properties = Object.fromEntries(
          Object.entries(object4(item)).map(([name, schema]) => {
            const wireName = object4(schema)['x-f5xc-wire-name'];
            return [typeof wireName === 'string' ? wireName : name, convert(schema)];
          }),
        );
        result.additionalProperties =
          source.additionalProperties === undefined ? false : convert(source.additionalProperties);
      }
      if (key === 'additionalProperties') result.additionalProperties = convert(item);
      if (key === 'items' || key === 'not') result[key] = convert(item);
      if (['allOf', 'anyOf', 'oneOf'].includes(key)) {
        if (!Array.isArray(item)) throw new Error('Malformed SMSv2 schema composition');
        result[key] = item.map(convert);
      }
      if (key === 'exclusiveMinimum' || key === 'exclusiveMaximum') {
        if (typeof item === 'number') result[key] = item;
        else if (item === true) result[key] = source[key === 'exclusiveMinimum' ? 'minimum' : 'maximum'];
      }
    }
    const exclusions = [];
    for (const [key, item] of Object.entries(source)) {
      if (!key.startsWith('x-ves-oneof-field-')) continue;
      let names;
      try {
        names = typeof item === 'string' ? JSON.parse(item) : item;
      } catch {
        throw new Error('Malformed SMSv2 oneof group');
      }
      if (!Array.isArray(names) || names.some((name) => typeof name !== 'string'))
        throw new Error('Malformed SMSv2 oneof group');
      const wireNames = names.map((name) => {
        const property = object4(source.properties ?? {})[String(name)];
        return typeof property?.['x-f5xc-wire-name'] === 'string' ? property['x-f5xc-wire-name'] : name;
      });
      for (let i = 0; i < wireNames.length; i++)
        for (let j = i + 1; j < wireNames.length; j++)
          exclusions.push({ not: { required: [wireNames[i], wireNames[j]] } });
    }
    if (exclusions.length) result.allOf = [...(result.allOf ?? []), ...exclusions];
    return result;
  }
  if (!Object.hasOwn(schemas, root)) throw new Error('Missing SMSv2 create schema');
  referenced.add(root);
  for (const name of referenced) definitions[name] = convert(schemas[name]);
  return { $ref: `#/definitions/${root}`, definitions };
}
function createWireValidator(
  schemas,
  root = 'viewssecuremesh_site_v2CreateSpecType',
  observedInterfaceIdentityEcho = false,
) {
  const schema = requestSchema(schemas, root);
  if (observedInterfaceIdentityEcho) {
    if (root !== 'securemesh_site_v2ReplaceRequest') throw new Error('Identity echo requires a replacement snapshot');
    const properties = object4(object4(schemas.securemesh_site_v2Interface).properties);
    const projected = object4(object4(object4(schema.definitions).securemesh_site_v2Interface).properties);
    for (const field of ['is_primary', 'is_management']) {
      const source = object4(properties[field]);
      if (source.readOnly !== true || source.type !== 'boolean') throw new Error('Interface identity schema changed');
      projected[field] = { type: 'boolean' };
    }
  }
  return (spec) => {
    const keyword = firstFailure(schema, spec, schema);
    if (keyword) {
      throw new Error(`SMSv2 request violates the verified schema (${keyword})`);
    }
  };
}
function equal(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return left.length === right.length && left.every((item, index) => equal(item, right[index]));
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftEntries = Object.entries(left);
    const rightObject = right;
    return (
      leftEntries.length === Object.keys(rightObject).length &&
      leftEntries.every(([key, value]) => Object.hasOwn(rightObject, key) && equal(value, rightObject[key]))
    );
  }
  return false;
}
function validFormat(format, value) {
  if (format === 'cidr') {
    const [address, length, extra] = value.split('/');
    const family = isIP(address);
    if (!family || extra !== undefined || !/^\d+$/.test(length ?? '')) return false;
    const bits = Number(length);
    return bits >= 0 && bits <= (family === 4 ? 32 : 128);
  }
  if (format === 'ipv4') return isIP(value) === 4;
  if (format === 'ipv6') return isIP(value) === 6;
  if (format === 'uuid')
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  if (format === 'dns-label') return /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i.test(value);
  if (format === 'hostname' || format === 'fqdn')
    return value.length <= 253 && value.split('.').every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i.test(label));
  if (format === 'uri') {
    try {
      return Boolean(new URL(value).protocol);
    } catch {
      return false;
    }
  }
  if (format === 'date-time')
    return (
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && !Number.isNaN(Date.parse(value))
    );
  return true;
}
function typeMatches(type, value) {
  if (Array.isArray(type)) return type.some((item) => typeMatches(item, value));
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return type === undefined || typeof value === type;
}
function firstFailure(schemaValue, value, document) {
  if (schemaValue === false) return 'false schema';
  if (schemaValue === true) return null;
  if (typeof schemaValue.$ref === 'string') {
    const prefix = '#/definitions/';
    if (!schemaValue.$ref.startsWith(prefix)) return '$ref';
    const definition = object4(document.definitions)[schemaValue.$ref.slice(prefix.length)];
    if (definition === undefined) return '$ref';
    const failure = firstFailure(definition, value, document);
    if (failure) return failure;
  }
  if (schemaValue.nullable === true && value === null) return null;
  if (!typeMatches(schemaValue.type, value)) return 'type';
  if (Array.isArray(schemaValue.enum) && !schemaValue.enum.some((item) => equal(item, value))) return 'enum';
  if (Object.hasOwn(schemaValue, 'const') && !equal(schemaValue.const, value)) return 'const';
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    const members = schemaValue[keyword];
    if (!Array.isArray(members)) continue;
    const matches = members.filter((member) => firstFailure(member, value, document) === null).length;
    if (
      (keyword === 'allOf' && matches !== members.length) ||
      (keyword === 'anyOf' && matches === 0) ||
      (keyword === 'oneOf' && matches !== 1)
    )
      return keyword;
  }
  if (schemaValue.not !== undefined && firstFailure(schemaValue.not, value, document) === null) return 'not';
  if (typeof value === 'string') {
    const length = [...value].length;
    if (typeof schemaValue.minLength === 'number' && length < schemaValue.minLength) return 'minLength';
    if (typeof schemaValue.maxLength === 'number' && length > schemaValue.maxLength) return 'maxLength';
    if (typeof schemaValue.pattern === 'string' && !new RegExp(schemaValue.pattern, 'u').test(value)) return 'pattern';
    if (typeof schemaValue.format === 'string' && !validFormat(schemaValue.format, value)) return 'format';
  }
  if (typeof value === 'number') {
    if (typeof schemaValue.minimum === 'number' && value < schemaValue.minimum) return 'minimum';
    if (typeof schemaValue.maximum === 'number' && value > schemaValue.maximum) return 'maximum';
    if (typeof schemaValue.exclusiveMinimum === 'number' && value <= schemaValue.exclusiveMinimum)
      return 'exclusiveMinimum';
    if (typeof schemaValue.exclusiveMaximum === 'number' && value >= schemaValue.exclusiveMaximum)
      return 'exclusiveMaximum';
    if (typeof schemaValue.multipleOf === 'number') {
      const quotient = value / schemaValue.multipleOf;
      if (!Number.isFinite(quotient) || Math.abs(quotient - Math.round(quotient)) > 0.000000000001) return 'multipleOf';
    }
  }
  if (Array.isArray(value)) {
    if (typeof schemaValue.minItems === 'number' && value.length < schemaValue.minItems) return 'minItems';
    if (typeof schemaValue.maxItems === 'number' && value.length > schemaValue.maxItems) return 'maxItems';
    if (
      schemaValue.uniqueItems === true &&
      value.some((item, index) => value.slice(0, index).some((seen) => equal(seen, item)))
    )
      return 'uniqueItems';
    if (schemaValue.items !== undefined)
      for (const item of value) {
        const failure = firstFailure(schemaValue.items, item, document);
        if (failure) return failure;
      }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value;
    if (
      Array.isArray(schemaValue.required) &&
      schemaValue.required.some((key) => typeof key === 'string' && !Object.hasOwn(record, key))
    )
      return 'required';
    const entries = Object.entries(record);
    if (typeof schemaValue.minProperties === 'number' && entries.length < schemaValue.minProperties)
      return 'minProperties';
    if (typeof schemaValue.maxProperties === 'number' && entries.length > schemaValue.maxProperties)
      return 'maxProperties';
    const properties = schemaValue.properties ? object4(schemaValue.properties) : undefined;
    for (const [key, item] of entries) {
      const propertySchema = properties?.[key];
      if (propertySchema !== undefined) {
        const failure = firstFailure(propertySchema, item, document);
        if (failure) return failure;
      } else if (schemaValue.additionalProperties === false) return 'additionalProperties';
      else if (schemaValue.additionalProperties && typeof schemaValue.additionalProperties === 'object') {
        const failure = firstFailure(schemaValue.additionalProperties, item, document);
        if (failure) return failure;
      }
    }
  }
  return null;
}
var keywords;
var init_wire_schema = __esm(() => {
  keywords = new Set([
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
var publishedAssets;
var init_verified_contract = __esm(() => {
  init_release_contract();
  init_verified_api_release();
  init_wire_routing();
  init_wire_schema();
  init_wire_site();
  publishedAssets = Object.freeze({
    'smsv2-contract.json': 'sha256:2dd4d33693c9e228bfb304d7558a2f50ca9cc0146407f8fb9b5f0ca7d7c56f3c',
    'smsv2-contract-manifest.json': 'sha256:3adcfb6462a887a0f65198ed392c742fbc2ab9ba9df1cac33f36e5fe54fd6662',
    'smsv2-evidence-receipt.json': 'sha256:e9bd60f46acd2a003010cbf20d0581af364cce0486f8a7eefc9eb85562ab0bff',
  });
});

// plugins/platform/src/ce/service.ts
function requestCePlatformService(bus, signal) {
  if (!bus || typeof bus.emit !== 'function')
    return Promise.reject(new Error('Platform CE v2 service is required and not loaded'));
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('CE operation cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      reject(new Error('Platform CE v2 service is required and not loaded'));
    }, 5000);
    signal?.addEventListener('abort', abort, { once: true });
    bus.emit(CE_SERVICE_CHANNEL, {
      version: 2,
      resolve: (service) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        resolve(service);
      },
    });
  });
}
var CE_SERVICE_CHANNEL = 'xcsh:ce-platform:v2:service';
var init_service = __esm(() => {
  init_deployment_store();
  init_runtime();
  init_verified_contract();
});

// plugins/aws/src/ce/platform.ts
function awsPlatformService(pi, signal) {
  return requestCePlatformService(pi.events, signal);
}
var init_platform = __esm(() => {
  init_service();
});

// plugins/aws/src/tools/aws-compute-discover.ts
function createAwsComputeDiscoverTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_compute_discover',
    label: 'Discover AWS CE Compute',
    description:
      'Mandatory read-only AWS Customer Edge research gate. Retrieves the canonical MCN contract and current F5/AWS sources, verifies STS identity and Marketplace agreement, enumerates all regions, pins the regional SSM AMI, and ranks instance, ENI, AZ, quota, policy, TGW, and brownfield evidence deterministically.',
    parameters: Type.Object({
      awsProfile: Type.Optional(Type.String()),
      vpcMode: Type.Optional(Type.Union([Type.Literal('greenfield'), Type.Literal('brownfield')])),
      accountId: Type.String(),
      partition: Type.Union([Type.Literal('aws'), Type.Literal('aws-us-gov'), Type.Literal('aws-cn')]),
      deploymentName: Type.String(),
      requiredEnis: Type.Number({
        minimum: 1,
        maximum: 8,
        description: 'Required physical ENIs per instance, not the deployment total.',
      }),
      nodeCount: Type.Union([Type.Literal(1), Type.Literal(3)]),
      instanceTypes: Type.Optional(Type.Array(Type.String())),
      brownfieldResourceIds: Type.Array(Type.String()),
      observedOwnedResourceIds: Type.Optional(Type.Array(Type.String())),
      ownedPlanSha256s: Type.Optional(Type.Array(Type.String())),
      resourceRegion: Type.Optional(Type.String()),
      egressMode: Type.Optional(
        Type.Union(['elastic-ip', 'nat-gateway', 'firewall', 'proxy'].map((value) => Type.Literal(value))),
      ),
      routingProfile: Type.Optional(
        Type.Union(['direct-eni', 'nlb-ingress', 'tgw-static', 'tgw-connect'].map((value) => Type.Literal(value))),
      ),
      platformContext: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        if (Object.hasOwn(params, 'f5Capabilities')) throw new Error('Caller-supplied F5 capabilities are unsupported');
        const platform = await awsPlatformService(pi, signal);
        const f5Capabilities = await platform.capabilities(params.platformContext);
        const observation = await discoverAwsCompute({ ...params, f5Capabilities }, makeApi(ctx.cwd));
        const artifactId = await saveAwsDiscovery(ctx.sessionManager, observation);
        const regions = observation.regions
          .map(
            (region) =>
              `${region.rank}. ${region.name}: ${region.eligible ? 'eligible' : `ineligible (${region.reasons.join(', ')})`}`,
          )
          .join(`
`);
        const leading = observation.regions.find((region) => region.eligible);
        return {
          content: [
            {
              type: 'text',
              text: `AWS identity: ${observation.identity.accountId} (${observation.identity.partition})
Shared contract: ${observation.research.sharedContract.contractId}/${observation.research.sharedContract.contractVersion} (${observation.research.sharedContract.normalizedSha256})
Marketplace agreement: ${observation.agreement.active ? 'active' : 'not active; subscribe in the AWS Marketplace console and rediscover'}
Leading eligible region: ${leading?.name ?? 'none'}
Pinned AMI: ${leading?.ami?.id ?? 'none'}
${regions}
Discovery artifact: ${artifactId ? `artifact://${artifactId}` : 'session memory only'}`,
            },
          ],
          details: { tool: 'aws_compute_discover', artifactId, observation },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE discovery failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_compute_discover' },
        };
      }
    },
  };
}
var init_aws_compute_discover = __esm(() => {
  init_artifacts();
  init_discovery();
  init_platform();
  init_shared();
});

// plugins/terraform/src/provider-lock.ts
import { createHash as createHash3 } from 'node:crypto';
import { readFile as readFile2 } from 'node:fs/promises';

async function loadXcshProviderLock() {
  const value = await readFile2(new URL('./assets/plugins/terraform/locks/xcsh-provider.hcl', import.meta.url), 'utf8');
  if (createHash3('sha256').update(value).digest('hex') !== XCSH_PROVIDER_LOCK_SHA256)
    throw new Error('Published XC provider lock changed');
  return value;
}
var XCSH_PROVIDER_VERSION = '15.12.1',
  XCSH_PROVIDER_LOCK_SHA256 = '6d9fd709ee430d66bfa6de99dbbbafca2801eb8471201e6c282102fb3bd1a782';
var init_provider_lock = () => {};

// plugins/aws/src/ce/create-recovery.ts
function prepareRecoverableAction(action) {
  if (action.command !== 'aws' || action.args?.[0] !== 'ec2' || !drivers[action.args[1]]) return;
  const start = action.args.indexOf('--tag-specifications');
  if (start < 0) throw new Error('Recoverable creation requires atomic ownership tags');
  for (let index = start + 1; index < action.args.length && !action.args[index].startsWith('--'); index++) {
    if (!action.args[index].endsWith(']')) throw new Error('Malformed atomic AWS ownership tags');
    action.args[index] = `${action.args[index].slice(0, -1)},{Key=xcsh-action-id,Value=${action.id}}]`;
  }
}
function hasCreateRecovery(action) {
  return action.args?.[0] === 'ec2' && !!drivers[action.args[1]];
}
async function executeRecoverableCreate(api, plan, action, args, checkpoint, persist, signal) {
  const driver = drivers[args[1]];
  if (!driver) throw new Error('AWS create recovery driver is unavailable');
  const requestSha256 = canonicalSha256({
    plan: plan.planSha256,
    action: action.id,
    args: args.map((arg, index) => (args[index - 1] === '--user-data' ? 'issued-site-bound-bootstrap' : arg)),
  });
  const pending = checkpoint.pendingCreate;
  if (pending && (pending.actionId !== action.id || pending.requestSha256 !== requestSha256))
    throw new Error('Pending AWS creation differs from the immutable request');
  if (!pending) {
    checkpoint.pendingCreate = { actionId: action.id, requestSha256 };
    try {
      await persist();
    } catch (error) {
      checkpoint.pendingCreate = undefined;
      throw error;
    }
    try {
      const result = await api.exec('aws', args, { signal });
      if (result.exitCode === 0) {
        return result;
      }
    } catch {
      signal?.throwIfAborted();
    }
  }
  signal?.throwIfAborted();
  const expected = {
    'xcsh-managed-by': 'aws-ce',
    'xcsh-execution-engine': plan.engine,
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
    'xcsh-action-id': action.id,
  };
  const result = await api.exec(
    'aws',
    [
      'ec2',
      driver.describe,
      '--filters',
      ...Object.entries(expected).map(([key, value]) => `Name=tag:${key},Values=${value}`),
      '--region',
      plan.region,
      '--output',
      'json',
    ],
    { signal },
  );
  if (result.exitCode !== 0) throw new Error('AWS ambiguous creation observation is unavailable');
  let raw;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    throw new Error('AWS creation observation is malformed');
  }
  if (!raw || raw.NextToken || !Array.isArray(raw[driver.list]))
    throw new Error('AWS creation observation is incomplete');
  let candidates = raw[driver.list];
  if (args[1] === 'run-instances') {
    if (candidates.some((item) => !item || !Array.isArray(item.Instances)))
      throw new Error('AWS creation observation is malformed');
    candidates = candidates.flatMap((item) => item.Instances);
  }
  if (candidates.length !== 1)
    throw new Error(
      candidates.length
        ? 'AWS creation identity is ambiguous'
        : 'AWS creation outcome remains unknown; resume observation before retrying',
    );
  const resource = candidates[0];
  if (!resource || typeof resource[driver.id] !== 'string' || !Array.isArray(resource.Tags))
    throw new Error('AWS creation identity is malformed');
  const tags = new Map();
  for (const item of resource.Tags) {
    if (!item || typeof item.Key !== 'string' || typeof item.Value !== 'string' || tags.has(item.Key))
      throw new Error('AWS creation ownership tags are malformed');
    tags.set(item.Key, item.Value);
  }
  if (Object.entries(expected).some(([key, value]) => tags.get(key) !== value))
    throw new Error('AWS creation belongs to another owner');
  const response =
    driver.result === 'Instances'
      ? { Instances: [resource] }
      : driver.result
        ? { [driver.result]: resource }
        : resource;
  return { exitCode: 0, stderr: '', stdout: JSON.stringify(response) };
}
var drivers;
var init_create_recovery = __esm(() => {
  init_canonical();
  drivers = {
    'create-vpc': { describe: 'describe-vpcs', list: 'Vpcs', result: 'Vpc', id: 'VpcId' },
    'create-subnet': { describe: 'describe-subnets', list: 'Subnets', result: 'Subnet', id: 'SubnetId' },
    'create-internet-gateway': {
      describe: 'describe-internet-gateways',
      list: 'InternetGateways',
      result: 'InternetGateway',
      id: 'InternetGatewayId',
    },
    'create-route-table': {
      describe: 'describe-route-tables',
      list: 'RouteTables',
      result: 'RouteTable',
      id: 'RouteTableId',
    },
    'create-security-group': {
      describe: 'describe-security-groups',
      list: 'SecurityGroups',
      result: '',
      id: 'GroupId',
    },
    'create-network-interface': {
      describe: 'describe-network-interfaces',
      list: 'NetworkInterfaces',
      result: 'NetworkInterface',
      id: 'NetworkInterfaceId',
    },
    'allocate-address': { describe: 'describe-addresses', list: 'Addresses', result: '', id: 'AllocationId' },
    'run-instances': { describe: 'describe-instances', list: 'Reservations', result: 'Instances', id: 'InstanceId' },
  };
});

// plugins/aws/src/ce/execution-contract.ts
function assertAwsWholeSitePowerSupported(intent) {
  if (intent.operation === 'start' || intent.operation === 'stop')
    throw new Error(
      `Whole-site ${intent.operation} is unavailable until reviewed service withdrawal, restoration and traffic gates are implemented; use the owning-engine selected-node failover workflow only for its supported topology`,
    );
}
var AWS_CE_TERRAFORM_VERSION = '1.16.5',
  AWS_CE_TERRAFORM_PROVIDER_VERSION = '6.63.0',
  AWS_CE_PROVIDER_LOCK_SHA256 = 'c4fbed57d353b4b7ee92bcdd16be57a9674dc3e70b41332ab0b866db7e7a9ede';

// plugins/aws/src/ce/ingress-settings.ts
function nlbSettings(intent) {
  const ingress = intent.ingress?.mode === 'nlb' ? intent.ingress : undefined;
  const targetInterfaceIndex = ingress?.targetInterfaceIndex ?? 1;
  const healthCheck = ingress?.healthCheck ?? {
    protocol: 'TCP',
    port: 'traffic-port',
    intervalSeconds: 30,
    timeoutSeconds: 10,
    healthyThreshold: 3,
    unhealthyThreshold: 3,
  };
  if (targetInterfaceIndex !== 1 || intent.interfaces[targetInterfaceIndex]?.role !== 'sli')
    throw new Error('NLB requires the explicitly observed SLI target interface');
  if (
    !['TCP', 'HTTP', 'HTTPS'].includes(healthCheck.protocol) ||
    (healthCheck.port !== 'traffic-port' &&
      (!Number.isInteger(healthCheck.port) || healthCheck.port < 1 || healthCheck.port > 65535)) ||
    !Number.isInteger(healthCheck.intervalSeconds) ||
    healthCheck.intervalSeconds < 5 ||
    healthCheck.intervalSeconds > 300 ||
    !Number.isInteger(healthCheck.timeoutSeconds) ||
    healthCheck.timeoutSeconds < 2 ||
    healthCheck.timeoutSeconds > 120 ||
    [healthCheck.healthyThreshold, healthCheck.unhealthyThreshold].some(
      (value) => !Number.isInteger(value) || value < 2 || value > 10,
    ) ||
    (healthCheck.protocol === 'TCP' && healthCheck.path !== undefined) ||
    (healthCheck.protocol !== 'TCP' && !/^\/[A-Za-z0-9._~/-]{0,512}$/.test(healthCheck.path ?? ''))
  )
    throw new Error('NLB health-check configuration is invalid');
  return { targetInterfaceIndex, healthCheck };
}

// plugins/aws/src/ce/interface-security.ts
function interfaceSecurityGroups(intent, index) {
  const groups =
    intent.interfaces[index]?.securityGroupNames ??
    (intent.securityGroups.length === 1 ? [intent.securityGroups[0].name] : undefined);
  if (
    !groups?.length ||
    new Set(groups).size !== groups.length ||
    groups.some((name) => !intent.securityGroups.some((group) => group.name === name))
  )
    throw new Error(
      'Each interface requires explicit known security groups when multiple role-specific groups are defined',
    );
  return [...groups].sort();
}

// plugins/aws/src/ce/static-routing.ts
import { isIP as isIP2 } from 'node:net';

function staticAzRoutes(intent) {
  const routes = intent.routing.staticAzRoutes;
  if (routes === undefined) return [];
  if (intent.routing.profile !== 'tgw-static' || !Array.isArray(routes) || routes.length !== intent.topology.nodeCount)
    throw new Error('Static TGW routing requires one appliance route set per node/AZ');
  const nodes = new Set();
  return routes
    .map((route) => {
      if (
        !Number.isInteger(route.node) ||
        route.node < 1 ||
        route.node > intent.topology.nodeCount ||
        nodes.has(route.node)
      )
        throw new Error('Static TGW appliance node identity is missing or ambiguous');
      nodes.add(route.node);
      if (route.availabilityZone !== intent.interfaces[1]?.subnets[route.node - 1]?.availabilityZone)
        throw new Error('Static TGW appliance target differs from the approved SLI AZ');
      const normalize = (values) => {
        if (!Array.isArray(values) || !values.length || new Set(values).size !== values.length)
          throw new Error('Static TGW requires explicit unique forward and return prefixes');
        return values
          .map((value) => {
            const [ip, prefix, extra] = value.split('/');
            if (isIP2(ip) !== 4 || !/^\d{1,2}$/.test(prefix ?? '') || Number(prefix) > 32 || extra !== undefined)
              throw new Error('Static TGW route prefix is invalid');
            const octets = ip.split('.').map(Number);
            const address = octets.reduce((acc, octet) => (acc * 256 + octet) >>> 0, 0);
            const mask = Number(prefix) === 0 ? 0 : (4294967295 << (32 - Number(prefix))) >>> 0;
            if ((address & mask) >>> 0 !== address) throw new Error('Static TGW route must use a network boundary');
            return { cidr: value, address, mask, prefix: Number(prefix) };
          })
          .sort((a, b) => a.cidr.localeCompare(b.cidr));
      };
      const forward = normalize(route.forwardCidrs);
      const backward = normalize(route.returnCidrs);
      if (
        forward.some((a) =>
          backward.some((b) => {
            const mask = a.prefix < b.prefix ? a.mask : b.mask;
            return (a.address & mask) >>> 0 === (b.address & mask) >>> 0;
          }),
        )
      )
        throw new Error('Static TGW forward and return prefixes overlap');
      return { ...route, forwardCidrs: forward.map((row) => row.cidr), returnCidrs: backward.map((row) => row.cidr) };
    })
    .sort((a, b) => a.node - b.node);
}
function routeNode(intent, route) {
  const node = route.node ?? (intent.topology.nodeCount === 1 ? 1 : undefined);
  if (!node || !Number.isInteger(node) || node > intent.topology.nodeCount || node < 1)
    throw new Error('Each multi-node VPC route requires an explicit appliance node');
  if (
    intent.topology.nodeCount > 1 &&
    route.availabilityZone !== intent.interfaces[1]?.subnets[node - 1]?.availabilityZone
  )
    throw new Error('VPC route AZ differs from its approved appliance target');
  return node;
}
var init_static_routing = () => {};

// plugins/aws/src/ce/topology.ts
function siteTopology(intent) {
  const sites = intent.topology.sites ?? [
    { name: intent.siteName, nodeIndexes: Array.from({ length: intent.topology.nodeCount }, (_, index) => index + 1) },
  ];
  if (!Array.isArray(sites) || !sites.length) throw new Error('CE site topology is required');
  const names = new Set();
  const indexes = new Set();
  for (const site of sites) {
    if (
      !site ||
      !/^[a-z][a-z0-9-]{0,62}$/.test(site.name) ||
      names.has(site.name) ||
      !Array.isArray(site.nodeIndexes) ||
      ![1, 3].includes(site.nodeIndexes.length)
    )
      throw new Error('CE sites require unique identities and one or three nodes each');
    names.add(site.name);
    for (const index of site.nodeIndexes) {
      if (!Number.isInteger(index) || index < 1 || index > intent.topology.nodeCount || indexes.has(index))
        throw new Error('CE node must belong to exactly one site');
      indexes.add(index);
    }
  }
  if (indexes.size !== intent.topology.nodeCount) throw new Error('CE topology does not assign every node to a site');
  return sites
    .map((site) => ({ name: site.name, nodeIndexes: [...site.nodeIndexes].sort((a, b) => a - b) }))
    .sort((a, b) => a.nodeIndexes[0] - b.nodeIndexes[0]);
}
function siteForNode(intent, node) {
  const site = siteTopology(intent).find((site) => site.nodeIndexes.includes(node));
  if (!site) throw new Error('CE node has no site binding');
  return site;
}
function siteBindings(plan) {
  return siteTopology(plan.intent).map((site) => ({
    site,
    binding: {
      owner: {
        deploymentId: plan.deploymentName,
        engine: plan.engine,
        provider: 'aws',
        account: plan.accountId,
        region: plan.region,
      },
      siteName: site.name,
      ...(plan.intent.initialVersions ? { initialVersions: structuredClone(plan.intent.initialVersions) } : {}),
      nodes: site.nodeIndexes.map((index) => `${plan.deploymentName}-${index}`),
    },
  }));
}

// plugins/aws/src/ce/transport-routes.ts
import { isIP as isIP3 } from 'node:net';

function network(value) {
  const [address, prefix, extra] = value.split('/');
  if (extra !== undefined || isIP3(address) !== 4 || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(prefix ?? ''))
    throw new Error('GRE transport requires canonical IPv4 CIDR evidence');
  const first = address.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);
  const size = 2 ** (32 - Number(prefix));
  if (first % size !== 0) throw new Error('GRE transport CIDR has host bits set');
  return { first, last: first + size - 1 };
}
function observedConnectCidrs(intent, observation) {
  const resources = observation.resources.filter((resource) => resource.id === intent.routing.transitGatewayId);
  if (resources.length !== 1 || !resources[0].exists || resources[0].region !== intent.region)
    throw new Error('GRE transport requires one current scoped Transit Gateway observation');
  const state = resources[0].state;
  const gateways = state.TransitGateways;
  if (state.NextToken || !Array.isArray(gateways) || gateways.length !== 1)
    throw new Error('GRE transport Transit Gateway evidence is incomplete');
  const gateway = gateways[0];
  const options = gateway.Options;
  if (
    !options ||
    gateway.TransitGatewayId !== intent.routing.transitGatewayId ||
    gateway.State !== 'available' ||
    options?.AmazonSideAsn !== intent.routing.transitGatewayAsn
  )
    throw new Error('GRE transport gateway identity, availability or ASN does not match');
  const cidrs = options.TransitGatewayCidrBlocks;
  if (
    !Array.isArray(cidrs) ||
    !cidrs.length ||
    cidrs.some((cidr) => typeof cidr !== 'string') ||
    new Set(cidrs).size !== cidrs.length
  )
    throw new Error('GRE transport requires observed Transit Gateway CIDR blocks');
  const ranges = cidrs.map(network);
  const vpc = intent.vpc.cidr ? network(intent.vpc.cidr) : undefined;
  for (const [index, range] of ranges.entries()) {
    if (
      (vpc && range.first <= vpc.last && vpc.first <= range.last) ||
      ranges.slice(0, index).some((other) => range.first <= other.last && other.first <= range.last)
    )
      throw new Error('GRE transport CIDRs overlap another transport block or the CE VPC');
  }
  for (const peer of intent.routing.connectPeers ?? []) {
    if (!peer.transitGatewayAddress) continue;
    const address = network(`${peer.transitGatewayAddress}/32`).first;
    if (!ranges.some((range) => address >= range.first && address <= range.last))
      throw new Error('GRE endpoint is outside the observed Transit Gateway CIDR blocks');
  }
  return cidrs.slice().sort();
}
var init_transport_routes = () => {};

// plugins/aws/src/ce/planner.ts
import { isIP as isIP4 } from 'node:net';

function fail(message) {
  throw new Error(`AWS CE plan validation failed: ${message}`);
}
function regionMatchesPartition2(region, partition) {
  if (partition === 'aws-us-gov') return region.startsWith('us-gov-');
  if (partition === 'aws-cn') return region.startsWith('cn-');
  return !region.startsWith('us-gov-') && !region.startsWith('cn-');
}
function safeString(value, label) {
  const normalized = value.trim();
  if (
    !normalized ||
    Array.from(normalized).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    fail(`${label} is empty or contains control characters`);
  return normalized;
}
function name2(value, label) {
  const normalized = safeString(value, label);
  if (!SAFE_NAME2.test(normalized)) fail(`${label} contains unsupported characters`);
  return normalized;
}
function cidr(value, label) {
  const normalized = safeString(value, label);
  if (!CIDR.test(normalized)) fail(`${label} is not a CIDR`);
  return normalized;
}
function ipv4Number(value) {
  if (isIP4(value) !== 4) fail('listener service address must be IPv4');
  return value.split('.').reduce((result, octet) => result * 256 + Number(octet), 0);
}
function cidrHost(value, offset) {
  const [address, length] = value.split('/');
  const prefix = Number(length);
  if (isIP4(address) !== 4 || !Number.isInteger(prefix) || prefix < 16 || prefix > 28)
    fail('NLB SLI subnet must be an IPv4 /16 through /28');
  const size = 2 ** (32 - prefix);
  const network = Math.floor(ipv4Number(address) / size) * size;
  const result = network + offset;
  return [24, 16, 8, 0].map((shift) => Math.floor(result / 2 ** shift) % 256).join('.');
}
function usableSubnetAddress(address, subnet) {
  const [base, length] = subnet.split('/');
  const prefix = Number(length);
  if (isIP4(base) !== 4 || !Number.isInteger(prefix) || prefix < 16 || prefix > 28) return false;
  const size = 2 ** (32 - prefix);
  const network = Math.floor(ipv4Number(base) / size) * size;
  const value = ipv4Number(address);
  return value >= network + 4 && value < network + size - 1;
}
function asn(value, label) {
  if (value === undefined || !Number.isInteger(value) || value < 1 || value > 4294967294)
    fail(`${label} must be a valid ASN`);
  return value;
}
function tgwInsideNetwork(value) {
  const match = /^169\.254\.(\d{1,3})\.(\d{1,3})\/29$/.exec(value);
  if (!match) fail('TGW Connect inside CIDR must be a 169.254.0.0/16 /29');
  const third = Number(match[1]);
  const fourth = Number(match[2]);
  if (third > 255 || fourth > 255 || fourth % 8 !== 0)
    fail('TGW Connect inside CIDR must be a valid /29 network boundary');
  const network = third * 256 + fourth;
  if (new Set([0, 256, 512, 768, 1024, 1280, 43512]).has(network)) fail('TGW Connect inside CIDR is reserved by AWS');
  return network;
}
function connectAttachmentCount(intent) {
  if (intent.routing.profile !== 'tgw-connect') return 0;
  const roles =
    intent.routing.connectPeers?.map((peer) => peer.transportInterfaceIndex) ??
    (intent.routing.insideCidrs ?? []).map(() => 0);
  return [0, 1].reduce((count, role) => count + Math.ceil(roles.filter((value) => value === role).length / 4), 0);
}
function awsCeNlbIngress(intent) {
  if (intent.ingress?.mode === 'nlb') return { port: intent.ingress.port, scheme: intent.ingress.scheme };
  return intent.routing.profile === 'nlb-ingress' ? { port: 443, scheme: 'internet-facing' } : undefined;
}
function normalizeIntent(input) {
  if (input.schemaVersion !== AWS_CE_SCHEMA_VERSION)
    fail(`unsupported intent schema version ${String(input.schemaVersion)}`);
  if (!ACCOUNT2.test(input.accountId)) fail('accountId must be a 12-digit AWS account ID');
  if (!REGION2.test(input.region)) fail('region is invalid');
  if (!['aws', 'aws-us-gov', 'aws-cn'].includes(input.partition)) fail('partition is invalid');
  if (!regionMatchesPartition2(input.region, input.partition)) fail('region does not match partition');
  const engine = input.engine ?? 'native';
  if (!['native', 'terraform'].includes(engine)) fail('execution engine must be native or terraform');
  staticAzRoutes(input);
  const deploymentName = name2(input.deploymentName, 'deploymentName');
  const siteName = name2(input.siteName, 'siteName');
  if (input.initialVersions !== undefined) initialSoftwareSettings(input.initialVersions);
  const namespace = name2(input.namespace, 'namespace');
  if (input.topology.nodeCount !== 1 && input.topology.nodeCount !== 3)
    fail('topology must contain one or three nodes');
  const sites = siteTopology(input);
  if (!Array.isArray(input.interfaces) || input.interfaces.length < 1 || input.interfaces.length > 8)
    fail('interfaces must contain between 1 and 8 entries');
  if (input.interfaces.some((item, index) => item.index !== index)) fail('interfaces must be ordered and zero-based');
  if (input.interfaces[0].role !== 'slo') fail('interface 0 must be SLO');
  if (input.interfaces.length > 1 && input.interfaces[1].role !== 'sli') fail('interface 1 must be SLI');
  const azOrder = input.interfaces[0].subnets.map((subnet) => subnet.availabilityZone);
  if (azOrder.length !== input.topology.nodeCount || new Set(azOrder).size !== input.topology.nodeCount)
    fail('each interface must define one unique Availability Zone per node');
  const interfaces = input.interfaces.map((item, index) => {
    if (!['slo', 'sli', 'management', 'service', 'workload'].includes(item.role))
      fail(`interface ${index} role is invalid`);
    const mtu = item.mtu ?? AWS_CE_DEFAULT_INTERFACE_MTU;
    const guestDevice =
      item.guestDevice === undefined ? undefined : safeString(item.guestDevice, `interfaces[${index}].guestDevice`);
    if (guestDevice !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(guestDevice))
      fail('interface guest device identity is invalid');
    if (!Number.isInteger(mtu) || mtu < 1500 || mtu > 9000) fail('interface MTU must be an integer from 1500 to 9000');
    const vrf = name2(item.vrf, `interfaces[${index}].vrf`);
    if (item.subnets.length !== input.topology.nodeCount) fail('interfaces must be symmetric across every node');
    const subnets = item.subnets.map((subnet, node) => {
      const availabilityZone = safeString(subnet.availabilityZone, 'availabilityZone');
      if (availabilityZone !== azOrder[node]) fail('interfaces must use the same ordered Availability Zones');
      if (input.vpc.mode === 'brownfield' && !/^subnet-[0-9a-f]{8,17}$/.test(subnet.subnetId ?? ''))
        fail('brownfield interfaces require exact subnet IDs');
      if (input.vpc.mode === 'brownfield') {
        const subnetId = subnet.subnetId ?? '';
        if (!input.brownfield.resourceIds.includes(subnetId))
          fail('brownfield subnet is outside the explicit resource allowlist');
      }
      if (input.vpc.mode === 'greenfield' && !subnet.cidr) fail('greenfield interfaces require subnet CIDRs');
      return {
        availabilityZone,
        ...(subnet.subnetId ? { subnetId: safeString(subnet.subnetId, 'subnetId') } : {}),
        ...(subnet.cidr ? { cidr: cidr(subnet.cidr, 'subnetCidr') } : {}),
      };
    });
    if (!['dhcp', 'static'].includes(item.addressing.mode)) fail('interface addressing mode is invalid');
    return {
      index,
      role: item.role,
      ...(input.operation === 'deploy'
        ? { securityGroupNames: interfaceSecurityGroups(input, index) }
        : item.securityGroupNames
          ? { securityGroupNames: [...item.securityGroupNames].sort() }
          : {}),
      mtu,
      ...(guestDevice === undefined ? {} : { guestDevice }),
      vrf,
      subnets,
      addressing: {
        mode: item.addressing.mode,
        ...(item.addressing.addresses
          ? { addresses: item.addressing.addresses.map((address) => cidr(address, 'interface address')) }
          : {}),
      },
    };
  });
  if (
    sites.some((site) => site.nodeIndexes.length === 3) &&
    (interfaces.some((item) => !item.guestDevice) ||
      new Set(interfaces.map((item) => item.guestDevice)).size !== interfaces.length)
  )
    fail('Three-node HA requires distinct verified guest device identities for every interface');
  if (input.vpc.mode === 'brownfield' && !/^vpc-[0-9a-f]{8,17}$/.test(input.vpc.vpcId ?? ''))
    fail('brownfield VPC requires an exact VPC ID');
  if (input.vpc.mode === 'brownfield') {
    const vpcId = input.vpc.vpcId ?? '';
    if (!input.brownfield.resourceIds.includes(vpcId))
      fail('brownfield VPC is outside the explicit resource allowlist');
  }
  if (input.vpc.mode === 'greenfield' && !input.vpc.cidr) fail('greenfield VPC requires a CIDR');
  if (input.vpc.cidr) cidr(input.vpc.cidr, 'vpc.cidr');
  if (input.image.productId !== AWS_CE_MARKETPLACE_PRODUCT_ID) fail('unsupported Marketplace product');
  if (!AMI.test(input.image.amiId)) fail('image.amiId must be an exact regional AMI ID');
  if (!/^[a-z0-9][a-z0-9.-]{1,40}$/.test(input.instance.type)) fail('instance type is invalid');
  if (!Number.isInteger(input.instance.diskGiB) || input.instance.diskGiB < 1)
    fail('instance disk must be a positive integer');
  const upgradeSafeDiskGiB = Math.max(input.instance.diskGiB, AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB);
  if (
    input.instance.instanceProfileArn &&
    !input.instance.instanceProfileArn.startsWith(`arn:${input.partition}:iam::${input.accountId}:instance-profile/`)
  )
    fail('instance profile is outside the intended account or partition');
  if (input.egress.mode !== 'elastic-ip') {
    if (!input.egress.resourceId || !AWS_ID.test(input.egress.resourceId))
      fail(`${input.egress.mode} requires an exact resource ID`);
    if (!input.brownfield.resourceIds.includes(input.egress.resourceId))
      fail('egress resource is outside the brownfield allowlist');
  }
  if (input.routing.profile === 'direct-eni' && input.topology.nodeCount !== 1)
    fail('direct ENI routing requires a one-node topology');
  const destinationCidrs = [
    ...new Set(input.routing.destinationCidrs.map((item) => cidr(item, 'destinationCidr'))),
  ].sort();
  for (const id of [
    ...input.brownfield.resourceIds,
    ...input.brownfield.routeTableIds,
    ...input.brownfield.transitGatewayRouteTableIds,
  ])
    if (!AWS_ID.test(id)) fail(`invalid brownfield identifier ${id}`);
    else if (id.startsWith('arn:')) {
      const [, partition, , region, accountId] = id.split(':');
      if (partition !== input.partition || accountId !== input.accountId || (region && region !== input.region))
        fail(`brownfield ARN is outside the intended partition, account, or region: ${id}`);
    }
  if (input.routes.some((route) => !input.brownfield.routeTableIds.includes(route.routeTableId)))
    fail('route target is outside the explicit brownfield route-table allowlist');
  const routes = input.routes.map((route) => ({
    routeTableId: route.routeTableId,
    destinationCidr: cidr(route.destinationCidr, 'routes.destinationCidr'),
    node: routeNode(input, route),
    ...(route.availabilityZone ? { availabilityZone: route.availabilityZone } : {}),
  }));
  if (input.routing.profile.startsWith('tgw-')) {
    if (!/^tgw-[0-9a-f]{8,17}$/.test(input.routing.transitGatewayId ?? ''))
      fail('TGW routing requires an exact transit gateway ID');
    if (!input.brownfield.resourceIds.includes(input.routing.transitGatewayId ?? ''))
      fail('transit gateway is outside the brownfield allowlist');
    if (
      input.routing.transitGatewayRouteTableId &&
      !input.brownfield.transitGatewayRouteTableIds.includes(input.routing.transitGatewayRouteTableId)
    )
      fail('Transit Gateway route table is outside the explicit allowlist');
  }
  if (input.routing.profile === 'tgw-connect') {
    const customerAsn = asn(input.routing.customerAsn, 'customerAsn');
    const transitGatewayAsn = asn(input.routing.transitGatewayAsn, 'transitGatewayAsn');
    if (customerAsn === transitGatewayAsn) fail('customer and Transit Gateway ASNs must differ');
    if (input.routing.transportAttachmentId) {
      if (!/^tgw-attach-[0-9a-f]{8,17}$/.test(input.routing.transportAttachmentId))
        fail('TGW Connect transport attachment ID is invalid');
      if (!input.brownfield.resourceIds.includes(input.routing.transportAttachmentId))
        fail('transport attachment is outside the brownfield allowlist');
    } else if (input.vpc.mode === 'brownfield') {
      fail('brownfield TGW Connect requires an exact allowlisted transport attachment ID');
    }
    if (input.topology.nodeCount !== 3) fail('TGW Connect requires three-zone symmetry');
    if (input.interfaces.length < 2) fail('TGW Connect requires an SLI interface');
    if (input.routing.connectPeers && input.routing.insideCidrs)
      fail('Select explicit Connect peers or legacy inside CIDRs, not both');
    const peers =
      input.routing.connectPeers ??
      input.routing.insideCidrs?.map((insideCidr, index) => ({
        node: index + 1,
        insideCidr,
        transportInterfaceIndex: 0,
      }));
    if (!peers?.length || peers.length > 12) fail('TGW Connect requires explicit peers or one inside CIDR per node');
    const counts = new Map();
    const endpoints = new Set();
    for (const peer of peers) {
      const transportRole = input.interfaces.find((item) => item.index === peer.transportInterfaceIndex)?.role;
      if (
        !Number.isInteger(peer.node) ||
        peer.node < 1 ||
        peer.node > input.topology.nodeCount ||
        !transportRole ||
        (input.operation === 'deploy' && !['slo', 'sli'].includes(transportRole))
      )
        fail(
          input.operation === 'deploy'
            ? 'Connect peer must select a real node and an SLO or SLI GRE transport interface'
            : 'Connect peer teardown must retain its observed transport interface',
        );
      counts.set(peer.node, (counts.get(peer.node) ?? 0) + 1);
      if ('transitGatewayAddress' in peer && peer.transitGatewayAddress !== undefined) {
        if (
          typeof peer.transitGatewayAddress !== 'string' ||
          isIP4(peer.transitGatewayAddress) !== 4 ||
          endpoints.has(peer.transitGatewayAddress)
        )
          fail('GRE transit gateway endpoints must be unique IPv4 addresses');
        endpoints.add(peer.transitGatewayAddress);
      }
    }
    if (counts.size !== input.topology.nodeCount || new Set(counts.values()).size !== 1)
      fail('Connect topology requires equal peer counts on every node');
    const insideNetworks = peers.map((peer) => tgwInsideNetwork(peer.insideCidr));
    if (new Set(insideNetworks).size !== insideNetworks.length)
      fail('TGW Connect inside CIDRs must be non-overlapping');
  }
  if (input.routing.profile === 'nlb-ingress') {
    if (input.ingress !== undefined) fail('Legacy NLB routing profile cannot be combined with explicit ingress');
    if (input.topology.nodeCount !== 3) fail('NLB ingress requires a three-node, three-zone topology');
    if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,26}[a-zA-Z0-9])?$/.test(deploymentName))
      fail('NLB ingress deploymentName must form a valid name of at most 28 characters');
  }
  if (input.ingress !== undefined) {
    const ingressKeys = Object.keys(input.ingress)
      .filter((key) => !['targetInterfaceIndex', 'healthCheck'].includes(key))
      .sort()
      .join(',');
    if (
      (input.ingress.mode === 'none' && ingressKeys !== 'mode') ||
      (input.ingress.mode === 'nlb' &&
        ingressKeys !== 'listener,loadBalancer,mode,port,probe,scheme' &&
        !(input.operation === 'teardown' && ingressKeys === 'listener,mode,port,probe,scheme'))
    )
      fail('Ingress fields differ from the selected mode');
    if (
      input.ingress.mode === 'nlb' &&
      (input.ingress.scheme !== 'internal' ||
        !Number.isInteger(input.ingress.port) ||
        input.ingress.port < 1 ||
        input.ingress.port > 65535)
    )
      fail('Explicit NLB ingress requires an internal scheme and a valid TCP port');
    if (!['none', 'nlb'].includes(input.ingress.mode)) fail('Ingress mode is invalid');
    if (input.ingress.mode === 'nlb' && input.topology.nodeCount !== 3)
      fail('NLB ingress requires a three-node, three-zone topology');
    if (input.ingress.mode === 'nlb' && sites.some((site) => site.nodeIndexes.length !== 1))
      fail('NLB ingress requires three independent one-node sites');
    if (input.ingress.mode === 'nlb' && !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,26}[a-zA-Z0-9])?$/.test(deploymentName))
      fail('NLB ingress deploymentName must form a valid name of at most 28 characters');
    if (input.ingress.mode === 'nlb') {
      nlbSettings(input);
      const listener = input.ingress.listener;
      const loadBalancer = input.ingress.loadBalancer;
      const probe = input.ingress.probe;
      const listenerKeys = Object.keys(listener ?? {})
        .sort()
        .join(',');
      const legacyTeardownListener =
        input.operation === 'teardown' && listenerKeys === 'domain,name,namespace,originPool';
      const domain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
      if (
        !listener ||
        (input.operation !== 'teardown' &&
          (!loadBalancer ||
            Object.keys(loadBalancer).sort().join(',') !== 'privateAddresses,subnetIds,vpcId' ||
            !/^vpc-[0-9a-f]{8,17}$/.test(loadBalancer.vpcId) ||
            !input.brownfield.resourceIds.includes(loadBalancer.vpcId) ||
            !Array.isArray(loadBalancer.subnetIds) ||
            loadBalancer.subnetIds.length < 1 ||
            loadBalancer.subnetIds.some(
              (id) => !/^subnet-[0-9a-f]{8,17}$/.test(id) || !input.brownfield.resourceIds.includes(id),
            ) ||
            !Array.isArray(loadBalancer.privateAddresses) ||
            loadBalancer.privateAddresses.length !== loadBalancer.subnetIds.length ||
            loadBalancer.privateAddresses.some((address) => isIP4(address) !== 4))) ||
        (listenerKeys !== 'domain,name,namespace,originPool,privateAddresses' && !legacyTeardownListener) ||
        Object.keys(listener.originPool ?? {})
          .sort()
          .join(',') !== 'name,namespace' ||
        name2(listener.name, 'ingress.listener.name') !== listener.name ||
        name2(listener.namespace, 'ingress.listener.namespace') !== listener.namespace ||
        name2(listener.originPool.name, 'ingress.listener.originPool.name') !== listener.originPool.name ||
        name2(listener.originPool.namespace, 'ingress.listener.originPool.namespace') !==
          listener.originPool.namespace ||
        listener.originPool.namespace !== listener.namespace ||
        (input.operation !== 'teardown' &&
          (!Array.isArray(listener.privateAddresses) ||
            listener.privateAddresses.length !== sites.length ||
            new Set(listener.privateAddresses).size !== listener.privateAddresses.length ||
            sites.some((site, index) => {
              const node = site.nodeIndexes[0];
              const subnet = input.interfaces.find((item) => item.role === 'sli')?.subnets[node - 1]?.cidr;
              return (
                !subnet ||
                !usableSubnetAddress(listener.privateAddresses?.[index] ?? '', subnet) ||
                listener.privateAddresses?.[index] === cidrHost(subnet, 5)
              );
            }))) ||
        typeof listener.domain !== 'string' ||
        listener.domain.length > 253 ||
        !domain.test(listener.domain) ||
        !probe ||
        Object.keys(probe).sort().join(',') !== 'expectedBodySha256,expectedStatus,path,sourceInstanceId' ||
        !/^i-[0-9a-f]{8,17}$/.test(probe.sourceInstanceId) ||
        !input.brownfield.resourceIds.includes(probe.sourceInstanceId) ||
        !/^\/[A-Za-z0-9._~/-]{0,512}$/.test(probe.path) ||
        !Number.isInteger(probe.expectedStatus) ||
        probe.expectedStatus < 100 ||
        probe.expectedStatus > 599 ||
        !/^[a-f0-9]{64}$/.test(probe.expectedBodySha256)
      )
        fail('NLB ingress requires exact listener and allowlisted traffic-probe identities');
    }
  }
  for (const routeTableId of [...input.routing.associations, ...input.routing.propagations])
    if (!input.brownfield.transitGatewayRouteTableIds.includes(routeTableId))
      fail('TGW association or propagation is outside the explicit route-table allowlist');
  return {
    ...input,
    engine,
    deploymentName,
    siteName,
    namespace,
    instance: {
      ...input.instance,
      diskGiB: upgradeSafeDiskGiB,
    },
    topology: { nodeCount: input.topology.nodeCount, sites },
    interfaces,
    routing: {
      ...input.routing,
      ...(input.routing.staticAzRoutes ? { staticAzRoutes: staticAzRoutes(input) } : {}),
      destinationCidrs,
      associations: [...new Set(input.routing.associations)].sort(),
      propagations: [...new Set(input.routing.propagations)].sort(),
    },
    ingress:
      input.ingress === undefined
        ? undefined
        : input.ingress.mode === 'nlb'
          ? { ...structuredClone(input.ingress), ...nlbSettings(input) }
          : structuredClone(input.ingress),
    securityGroups: [...input.securityGroups]
      .map((group) => ({
        ...group,
        name: name2(group.name, 'securityGroup.name'),
        ingress: group.ingress.map((rule) => normalizeSecurityGroupRule(rule)),
        egress: group.egress.map((rule) => normalizeSecurityGroupRule(rule)),
      }))
      .map((group, index) =>
        sites.some((site) => site.nodeIndexes.length === 3) && !group.ingress.some((rule) => rule.self)
          ? { ...group, ingress: [...group.ingress, { protocol: '-1', cidrs: [], self: true }] }
          : group,
      )
      .sort((left, right) => left.name.localeCompare(right.name)),
    routes: routes.sort(
      (left, right) =>
        left.routeTableId.localeCompare(right.routeTableId) ||
        left.destinationCidr.localeCompare(right.destinationCidr),
    ),
    brownfield: {
      resourceIds: [...new Set(input.brownfield.resourceIds)].sort(),
      routeTableIds: [...new Set(input.brownfield.routeTableIds)].sort(),
      transitGatewayRouteTableIds: [...new Set(input.brownfield.transitGatewayRouteTableIds)].sort(),
    },
  };
}
function normalizeSecurityGroupRule(rule) {
  const protocol = safeString(rule.protocol, 'securityGroup.protocol').toLowerCase();
  if (!/^(?:-1|tcp|udp|icmp|icmpv6|\d{1,3})$/.test(protocol)) fail('security group protocol is invalid');
  if ((rule.fromPort === undefined) !== (rule.toPort === undefined))
    fail('security group port range must specify both endpoints');
  if (rule.fromPort !== undefined) {
    const toPort = rule.toPort;
    if (
      toPort === undefined ||
      !Number.isInteger(rule.fromPort) ||
      !Number.isInteger(toPort) ||
      rule.fromPort < -1 ||
      toPort > 65535 ||
      rule.fromPort > toPort
    )
      fail('security group port range is invalid');
  }
  if (!Array.isArray(rule.cidrs) || rule.cidrs.length < 1) fail('security group rule requires at least one CIDR');
  return {
    protocol,
    ...(rule.fromPort === undefined ? {} : { fromPort: rule.fromPort, toPort: rule.toPort }),
    cidrs: [...new Set(rule.cidrs.map((item) => cidr(item, 'securityGroup.cidr')))].sort(),
  };
}
function validateResearch(observation) {
  if (observation.schemaVersion !== AWS_CE_SCHEMA_VERSION) fail('unsupported observation schema');
  if (observation.research?.method !== 'aws-cli-live' || observation.research.officialSourceRetrieval !== 'live')
    fail('live AWS research receipt is required');
  if (
    observation.research.sharedContract?.url !== AWS_CE_SHARED_CONTRACT_URL ||
    observation.research.sharedContract.contractId !== 'f5xc-ce-automation-policy' ||
    observation.research.sharedContract.contractVersion !== 'v2' ||
    !/^[a-f0-9]{64}$/.test(observation.research.sharedContract.normalizedSha256)
  )
    fail('valid shared Customer Edge automation contract receipt is required');
  if (
    observation.research.f5AwsGuide?.url !== AWS_CE_F5_GUIDE_URL ||
    !/^[a-f0-9]{64}$/.test(observation.research.f5AwsGuide.normalizedSha256)
  )
    fail('valid current F5 AWS SMSv2 guide receipt is required');
  const receipts = new Map(observation.research.sourceReceipts.map((item) => [item.url, item.normalizedSha256]));
  for (const source of [AWS_CE_SHARED_CONTRACT_URL, ...observation.research.officialSources])
    if (!/^[a-f0-9]{64}$/.test(receipts.get(source) ?? '')) fail(`source digest is missing for ${source}`);
  if (receipts.get(AWS_CE_SHARED_CONTRACT_URL) !== observation.research.sharedContract.normalizedSha256)
    fail('shared contract digest is inconsistent');
  if (receipts.get(AWS_CE_F5_GUIDE_URL) !== observation.research.f5AwsGuide.normalizedSha256)
    fail('F5 AWS guide digest is inconsistent');
  const tgwGuide = observation.research.mcnTgwGuide;
  if (
    tgwGuide &&
    (tgwGuide.url !== AWS_CE_TGW_GUIDE_URL ||
      !/^[a-f0-9]{64}$/.test(tgwGuide.normalizedSha256) ||
      receipts.get(tgwGuide.url) !== tgwGuide.normalizedSha256)
  )
    fail('MCN AWS TGW guide evidence is inconsistent');
  const requiredCommands = [
    'aws sts get-caller-identity',
    'aws ec2 describe-regions --all-regions',
    `aws ssm get-parameter --name ${AWS_CE_SSM_PARAMETER}`,
    'aws ec2 describe-images',
    'aws ec2 describe-image-attribute',
    'aws ec2 get-allowed-images-settings',
    'aws ec2 describe-instance-types',
    'aws ec2 describe-instance-type-offerings',
    'aws service-quotas get-service-quota',
    'aws service-quotas list-service-quotas',
    'aws marketplace-agreement search-agreements',
  ];
  for (const command of requiredCommands)
    if (!observation.research.commands.includes(command)) fail(`live AWS research receipt is missing ${command}`);
}
function tags2(intent, node, interfaceIndex) {
  const nodeTag = node === undefined ? '' : `,{Key=xcsh-node-index,Value=${node}}`;
  const interfaceTag = interfaceIndex === undefined ? '' : `,{Key=xcsh-interface-index,Value=${interfaceIndex}}`;
  return `ResourceType=instance,Tags=[{Key=xcsh-managed-by,Value=aws-ce},{Key=xcsh-execution-engine,Value=${intent.engine}},{Key=xcsh-deployment-id,Value=${intent.deploymentName}},{Key=xcsh-plan-sha256,Value=__PLAN_SHA256__},{Key=ves-io-site-name,Value=${node === undefined ? intent.siteName : siteForNode(intent, node).name}}${nodeTag}${interfaceTag}]`;
}
function tagSpec(intent, resourceType, node, interfaceIndex) {
  return tags2(intent, node, interfaceIndex).replace('ResourceType=instance', `ResourceType=${resourceType}`);
}
function nodeIndex(resource) {
  const value = Number(resource.tags['xcsh-node-index']);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}
function orderedOwnedInstances(observation, nodeCount) {
  const byNode = new Map();
  for (const resource of observation.resources.filter((item) => item.owned && item.id.startsWith('i-'))) {
    const node = nodeIndex(resource);
    if (!node || node > nodeCount || byNode.has(node)) fail('owned instances require unique xcsh-node-index tags');
    byNode.set(node, resource);
  }
  return Array.from({ length: nodeCount }, (_, index) => byNode.get(index + 1)).filter(
    (resource) => resource !== undefined,
  );
}
function ownedNodeEnis(observation, node, interfaceCount) {
  const byInterface = new Map();
  for (const resource of observation.resources.filter(
    (item) => item.owned && item.id.startsWith('eni-') && nodeIndex(item) === node,
  )) {
    const interfaceIndex = Number(resource.tags['xcsh-interface-index']);
    if (
      !Number.isInteger(interfaceIndex) ||
      interfaceIndex < 0 ||
      interfaceIndex >= interfaceCount ||
      byInterface.has(interfaceIndex)
    )
      fail(`owned node ${node} ENIs require unique xcsh-interface-index tags`);
    byInterface.set(interfaceIndex, resource);
  }
  return Array.from({ length: interfaceCount }, (_, index) => byInterface.get(index)).filter(
    (resource) => resource !== undefined,
  );
}
function resourceDeleteArgs(resource, base) {
  const id = resource.id;
  if (/^i-/.test(id)) return ['ec2', 'terminate-instances', '--instance-ids', id, ...base];
  if (/^eni-/.test(id)) return ['ec2', 'delete-network-interface', '--network-interface-id', id, ...base];
  if (/^subnet-/.test(id)) return ['ec2', 'delete-subnet', '--subnet-id', id, ...base];
  if (/^sg-/.test(id)) return ['ec2', 'delete-security-group', '--group-id', id, ...base];
  if (/^eipalloc-/.test(id)) return ['ec2', 'release-address', '--allocation-id', id, ...base];
  if (/^eipassoc-/.test(id)) return ['ec2', 'disassociate-address', '--association-id', id, ...base];
  if (/^igw-/.test(id)) return ['ec2', 'delete-internet-gateway', '--internet-gateway-id', id, ...base];
  if (/^rtb-/.test(id)) return ['ec2', 'delete-route-table', '--route-table-id', id, ...base];
  if (/^vpc-/.test(id)) return ['ec2', 'delete-vpc', '--vpc-id', id, ...base];
  if (/^tgw-attach-/.test(id))
    return JSON.stringify(resource.state).includes('"ResourceType":"connect"')
      ? ['ec2', 'delete-transit-gateway-connect', '--transit-gateway-attachment-id', id, ...base]
      : ['ec2', 'delete-transit-gateway-vpc-attachment', '--transit-gateway-attachment-id', id, ...base];
  if (/^tgw-connect-peer-/.test(id))
    return ['ec2', 'delete-transit-gateway-connect-peer', '--transit-gateway-connect-peer-id', id, ...base];
  if (/^arn:[^:]+:elasticloadbalancing:.*:targetgroup\//.test(id))
    return ['elbv2', 'delete-target-group', '--target-group-arn', id, ...base];
  if (/^arn:[^:]+:elasticloadbalancing:.*:listener\//.test(id))
    return ['elbv2', 'delete-listener', '--listener-arn', id, ...base];
  if (/^arn:[^:]+:elasticloadbalancing:.*:loadbalancer\//.test(id))
    return ['elbv2', 'delete-load-balancer', '--load-balancer-arn', id, ...base];
  throw new Error(`AWS CE teardown has no safe deletion driver for owned resource ${id}`);
}
function deletionPriority(resource) {
  const { id } = resource;
  if (/listener\//.test(id) || id.startsWith('tgw-connect-peer-')) return 10;
  if (/loadbalancer\//.test(id)) return 20;
  if (/targetgroup\//.test(id)) return 30;
  if (id.startsWith('tgw-attach-')) {
    const attachments = Array.isArray(resource.state.TransitGatewayAttachments)
      ? resource.state.TransitGatewayAttachments
      : [];
    return attachments[0]?.ResourceType === 'connect' ? 30 : 35;
  }
  if (id.startsWith('i-')) return 40;
  if (id.startsWith('eipassoc-')) return 50;
  if (id.startsWith('eipalloc-')) return 60;
  if (id.startsWith('eni-')) return 70;
  if (id.startsWith('sg-')) return 80;
  if (id.startsWith('rtb-')) return 85;
  if (id.startsWith('subnet-')) return 90;
  if (id.startsWith('igw-')) return 95;
  if (id.startsWith('vpc-')) return 100;
  return 75;
}
function originalRouteArgs(state, routeTableId, destinationCidr, base) {
  const tables = Array.isArray(state.RouteTables) ? state.RouteTables : [];
  const routes = Array.isArray(tables[0]?.Routes) ? tables[0].Routes : [];
  const route = routes.find((item) => item.DestinationCidrBlock === destinationCidr);
  if (!route)
    return [
      'ec2',
      'delete-route',
      '--route-table-id',
      routeTableId,
      '--destination-cidr-block',
      destinationCidr,
      ...base,
    ];
  const targets = [
    ['GatewayId', '--gateway-id'],
    ['NatGatewayId', '--nat-gateway-id'],
    ['NetworkInterfaceId', '--network-interface-id'],
    ['TransitGatewayId', '--transit-gateway-id'],
    ['VpcPeeringConnectionId', '--vpc-peering-connection-id'],
    ['EgressOnlyInternetGatewayId', '--egress-only-internet-gateway-id'],
  ];
  const target = targets.find(([key]) => typeof route[key] === 'string' && route[key]);
  if (!target) fail(`persisted restoration state for ${routeTableId}/${destinationCidr} has no supported route target`);
  return [
    'ec2',
    'replace-route',
    '--route-table-id',
    routeTableId,
    '--destination-cidr-block',
    destinationCidr,
    target[1],
    String(route[target[0]]),
    ...base,
  ];
}
function compileActions(intent, observation, restorationById) {
  let sequence = 0;
  const actions = [];
  const add = (action) => actions.push({ ...action, id: `aws-ce-action-${String(++sequence).padStart(4, '0')}` });
  const base = ['--region', intent.region];
  const rootDeviceName = observation.regions.find((item) => item.name === intent.region)?.ami?.rootDeviceName ?? '';
  if (!DEVICE_NAME.test(rootDeviceName)) fail('observed AMI root device name is invalid');
  if (intent.operation === 'teardown') {
    for (const route of intent.routes) {
      const state = restorationById.get(route.routeTableId);
      if (!state) fail(`teardown requires persisted pre-change restoration state for ${route.routeTableId}`);
      add({
        phase: 'teardown',
        kind: 'brownfield-restore',
        description: `Restore ${route.routeTableId}/${route.destinationCidr}`,
        command: 'aws',
        args: originalRouteArgs(state, route.routeTableId, route.destinationCidr, base),
        resourceId: route.routeTableId,
        mutates: true,
        destructive: true,
      });
    }
    const ownedAttachment = observation.resources.find(
      (resource) => resource.owned && resource.id.startsWith('tgw-attach-'),
    )?.id;
    for (const routeTableId of [...new Set([...intent.routing.associations, ...intent.routing.propagations])].sort()) {
      const state = restorationById.get(routeTableId);
      if (!state) fail(`teardown requires persisted TGW restoration state for ${routeTableId}`);
      const associations = Array.isArray(state.Associations) ? state.Associations : [];
      const propagations = Array.isArray(state.Propagations) ? state.Propagations : [];
      if (ownedAttachment && intent.routing.associations.includes(routeTableId))
        add({
          phase: 'teardown',
          kind: 'brownfield-restore',
          description: `Remove deployment association from ${routeTableId}`,
          command: 'aws',
          args: [
            'ec2',
            'disassociate-transit-gateway-route-table',
            '--transit-gateway-route-table-id',
            routeTableId,
            '--transit-gateway-attachment-id',
            ownedAttachment,
            ...base,
          ],
          resourceId: routeTableId,
          mutates: true,
          destructive: true,
        });
      if (ownedAttachment && intent.routing.propagations.includes(routeTableId))
        add({
          phase: 'teardown',
          kind: 'brownfield-restore',
          description: `Remove deployment propagation from ${routeTableId}`,
          command: 'aws',
          args: [
            'ec2',
            'disable-transit-gateway-route-table-propagation',
            '--transit-gateway-route-table-id',
            routeTableId,
            '--transit-gateway-attachment-id',
            ownedAttachment,
            ...base,
          ],
          resourceId: routeTableId,
          mutates: true,
          destructive: true,
        });
      for (const association of associations.sort((a, b) =>
        String(a.TransitGatewayAttachmentId).localeCompare(String(b.TransitGatewayAttachmentId)),
      )) {
        const attachmentId = String(association.TransitGatewayAttachmentId ?? '');
        if (!/^tgw-attach-[0-9a-f]{8,21}$/.test(attachmentId))
          fail(`invalid persisted TGW association for ${routeTableId}`);
        add({
          phase: 'teardown',
          kind: 'brownfield-restore',
          description: `Restore association ${attachmentId} to ${routeTableId}`,
          command: 'aws',
          args: [
            'ec2',
            'associate-transit-gateway-route-table',
            '--transit-gateway-route-table-id',
            routeTableId,
            '--transit-gateway-attachment-id',
            attachmentId,
            ...base,
          ],
          resourceId: routeTableId,
          mutates: true,
          destructive: true,
        });
      }
      for (const propagation of propagations.sort((a, b) =>
        String(a.TransitGatewayAttachmentId).localeCompare(String(b.TransitGatewayAttachmentId)),
      )) {
        const attachmentId = String(propagation.TransitGatewayAttachmentId ?? '');
        if (!/^tgw-attach-[0-9a-f]{8,21}$/.test(attachmentId))
          fail(`invalid persisted TGW propagation for ${routeTableId}`);
        add({
          phase: 'teardown',
          kind: 'brownfield-restore',
          description: `Restore propagation ${attachmentId} to ${routeTableId}`,
          command: 'aws',
          args: [
            'ec2',
            'enable-transit-gateway-route-table-propagation',
            '--transit-gateway-route-table-id',
            routeTableId,
            '--transit-gateway-attachment-id',
            attachmentId,
            ...base,
          ],
          resourceId: routeTableId,
          mutates: true,
          destructive: true,
        });
      }
    }
    for (const resource of observation.resources
      .filter((item) => item.owned)
      .sort((a, b) => deletionPriority(a) - deletionPriority(b) || a.id.localeCompare(b.id))) {
      if (resource.id.startsWith('rtb-')) {
        const tables = resource.state.RouteTables;
        for (const association of tables?.[0]?.Associations ?? []) {
          if (association.Main) fail('refusing to delete an owned route table promoted to VPC main');
          if (!/^rtbassoc-[0-9a-f]{8,21}$/.test(association.RouteTableAssociationId ?? ''))
            fail('invalid route table association');
          add({
            phase: 'teardown',
            kind: 'route-table-disassociate',
            description: `Disassociate ${resource.id}`,
            command: 'aws',
            args: [
              'ec2',
              'disassociate-route-table',
              '--association-id',
              String(association.RouteTableAssociationId),
              ...base,
            ],
            resourceId: resource.id,
            mutates: true,
            destructive: true,
          });
        }
      }
      if (resource.id.startsWith('igw-')) {
        const gateways = resource.state.InternetGateways;
        for (const attachment of gateways?.[0]?.Attachments ?? []) {
          if (!observation.resources.some((item) => item.id === attachment.VpcId && item.owned))
            fail('internet gateway attachment is outside the owned deployment');
          add({
            phase: 'teardown',
            kind: 'internet-gateway-detach',
            description: `Detach ${resource.id}`,
            command: 'aws',
            args: [
              'ec2',
              'detach-internet-gateway',
              '--internet-gateway-id',
              resource.id,
              '--vpc-id',
              String(attachment.VpcId),
              ...base,
            ],
            resourceId: resource.id,
            mutates: true,
            destructive: true,
          });
        }
      }
      add({
        phase: 'teardown',
        kind: 'resource-delete',
        description: `Delete owned ${resource.id}`,
        command: 'aws',
        args: resourceDeleteArgs(resource, base),
        resourceId: resource.id,
        mutates: true,
        destructive: true,
      });
      if (resource.id.startsWith('i-'))
        add({
          phase: 'teardown',
          kind: 'instance-termination-gate',
          description: `Wait for owned instance ${resource.id} to terminate before deleting its interfaces`,
          command: 'aws',
          args: ['ec2', 'wait', 'instance-terminated', '--instance-ids', resource.id, ...base],
          resourceId: resource.id,
          mutates: false,
          destructive: false,
        });
    }
    return actions;
  }
  assertAwsWholeSitePowerSupported(intent);
  const ownedInstances = orderedOwnedInstances(observation, intent.topology.nodeCount);
  if (intent.operation === 'resize') {
    if (ownedInstances.length !== intent.topology.nodeCount)
      fail(`resize requires exactly ${intent.topology.nodeCount} observed owned instance(s)`);
    for (const [index, instance] of ownedInstances.entries()) {
      add({
        phase: 'nodes',
        kind: 'instance-stop',
        description: `Stop ${instance.id}`,
        command: 'aws',
        args: ['ec2', 'stop-instances', '--instance-ids', instance.id, ...base],
        node: index + 1,
        resourceId: instance.id,
        mutates: true,
        destructive: true,
      });
      add({
        phase: 'nodes',
        kind: 'instance-resize',
        description: `Resize ${instance.id}`,
        command: 'aws',
        args: [
          'ec2',
          'modify-instance-attribute',
          '--instance-id',
          instance.id,
          '--instance-type',
          `Value=${intent.instance.type}`,
          ...base,
        ],
        node: index + 1,
        resourceId: instance.id,
        mutates: true,
        destructive: true,
      });
      add({
        phase: 'nodes',
        kind: 'instance-start',
        description: `Start ${instance.id}`,
        command: 'aws',
        args: ['ec2', 'start-instances', '--instance-ids', instance.id, ...base],
        node: index + 1,
        resourceId: instance.id,
        mutates: true,
        destructive: false,
      });
      add({
        phase: 'registration',
        kind: 'registration-gate',
        description: `Verify node ${index + 1} registration after resize`,
        node: index + 1,
        mutates: false,
        destructive: false,
      });
      add({
        phase: 'registration',
        kind: 'health-gate',
        description: `Verify node ${index + 1} after resize`,
        node: index + 1,
        mutates: false,
        destructive: false,
      });
      if (intent.routing.profile === 'tgw-connect')
        add({
          phase: 'verify',
          kind: 'bgp-gate',
          description: `Verify BGP after node ${index + 1} resize`,
          node: index + 1,
          mutates: false,
          destructive: false,
        });
      if (awsCeNlbIngress(intent))
        add({
          phase: 'verify',
          kind: 'nlb-gate',
          description: `Verify NLB after node ${index + 1} resize`,
          node: index + 1,
          mutates: false,
          destructive: false,
        });
      if (intent.routing.profile.startsWith('tgw-'))
        add({
          phase: 'verify',
          kind: 'tgw-route-gate',
          description: `Verify TGW routes after node ${index + 1} resize`,
          node: index + 1,
          mutates: false,
          destructive: false,
        });
      add({
        phase: 'verify',
        kind: 'traffic-gate',
        description: `Verify traffic after node ${index + 1}`,
        node: index + 1,
        mutates: false,
        destructive: false,
      });
    }
    return actions;
  }
  const addSteadyStateGates = () => {
    for (let node = 1; node <= intent.topology.nodeCount; node++) {
      add({
        phase: 'registration',
        kind: 'registration-gate',
        description: `Verify node ${node} registration`,
        node,
        mutates: false,
        destructive: false,
      });
      add({
        phase: 'registration',
        kind: 'health-gate',
        description: `Verify node ${node} health`,
        node,
        mutates: false,
        destructive: false,
      });
    }
    if (awsCeNlbIngress(intent))
      add({
        phase: 'verify',
        kind: 'nlb-gate',
        description: 'Verify NLB targets and health',
        mutates: false,
        destructive: false,
      });
    if (intent.routing.profile === 'tgw-connect')
      add({
        phase: 'verify',
        kind: 'bgp-gate',
        description: `Verify ${(intent.routing.connectPeers?.length ?? intent.routing.insideCidrs?.length ?? 0) * 2} AWS-managed BGP sessions across ${intent.routing.connectPeers?.length ?? intent.routing.insideCidrs?.length ?? 0} Connect peers`,
        mutates: false,
        destructive: false,
      });
    if (intent.routing.profile.startsWith('tgw-'))
      add({
        phase: 'verify',
        kind: 'tgw-route-gate',
        description: 'Verify TGW associations, propagations, and routes',
        mutates: false,
        destructive: false,
      });
    add({
      phase: 'verify',
      kind: 'traffic-gate',
      description: 'Verify end-to-end traffic',
      mutates: false,
      destructive: false,
    });
  };
  if (intent.operation === 'reconcile') {
    if (ownedInstances.length !== intent.topology.nodeCount)
      fail(`reconcile requires exactly ${intent.topology.nodeCount} observed owned instance(s)`);
    addSteadyStateGates();
    return actions;
  }
  if (intent.operation === 'update-network') {
    const ownedEnis = Array.from({ length: intent.topology.nodeCount }, (_, index) =>
      ownedNodeEnis(observation, index + 1, intent.interfaces.length),
    );
    if (ownedEnis.some((items) => items.length !== intent.interfaces.length))
      fail('update-network requires the complete observed owned ENI inventory');
    const sliIndex = intent.interfaces.length > 1 ? 1 : 0;
    for (const route of intent.routes)
      add({
        phase: 'routing',
        kind: 'route-replace',
        description: `Update ${route.destinationCidr} to the observed CE SLI ENI`,
        command: 'aws',
        args: [
          'ec2',
          'replace-route',
          '--route-table-id',
          route.routeTableId,
          '--destination-cidr-block',
          route.destinationCidr,
          '--network-interface-id',
          ownedEnis[routeNode(intent, route) - 1][sliIndex].id,
          ...base,
        ],
        resourceId: route.routeTableId,
        mutates: true,
        destructive: true,
      });
    const attachment = observation.resources.find((item) => item.owned && item.id.startsWith('tgw-attach-'))?.id;
    if (intent.routing.profile.startsWith('tgw-') && !attachment)
      fail('update-network requires the observed owned TGW attachment');
    const attachmentId = attachment ?? '';
    for (const routeTableId of intent.routing.associations)
      add({
        phase: 'routing',
        kind: 'tgw-associate',
        description: `Update association ${routeTableId}`,
        command: 'aws',
        args: [
          'ec2',
          'associate-transit-gateway-route-table',
          '--transit-gateway-route-table-id',
          routeTableId,
          '--transit-gateway-attachment-id',
          attachmentId,
          ...base,
        ],
        resourceId: routeTableId,
        mutates: true,
        destructive: true,
      });
    for (const routeTableId of intent.routing.propagations)
      add({
        phase: 'routing',
        kind: 'tgw-propagate',
        description: `Update propagation ${routeTableId}`,
        command: 'aws',
        args: [
          'ec2',
          'enable-transit-gateway-route-table-propagation',
          '--transit-gateway-route-table-id',
          routeTableId,
          '--transit-gateway-attachment-id',
          attachmentId,
          ...base,
        ],
        resourceId: routeTableId,
        mutates: true,
        destructive: true,
      });
    addSteadyStateGates();
    return actions;
  }
  if (intent.operation === 'replace-node' || intent.operation === 'repair') {
    const replacementNode = intent.replacementNode;
    if (
      replacementNode === undefined ||
      !Number.isInteger(replacementNode) ||
      replacementNode < 1 ||
      replacementNode > intent.topology.nodeCount
    )
      fail(`${intent.operation} requires an exact replacementNode`);
    if (ownedInstances.length !== intent.topology.nodeCount)
      fail(`${intent.operation} requires exactly ${intent.topology.nodeCount} observed owned instance(s)`);
    const nodeEnis = ownedNodeEnis(observation, replacementNode, intent.interfaces.length);
    if (nodeEnis.length !== intent.interfaces.length)
      fail(`${intent.operation} requires the complete observed owned ENI inventory`);
    const node = replacementNode;
    const instance = ownedInstances[node - 1];
    add({
      phase: 'nodes',
      kind: 'instance-terminate',
      description: `Terminate node ${node} instance ${instance.id}`,
      command: 'aws',
      args: ['ec2', 'terminate-instances', '--instance-ids', instance.id, ...base],
      node,
      resourceId: instance.id,
      mutates: true,
      destructive: true,
    });
    add({
      phase: 'nodes',
      kind: 'instance-run',
      description: `Launch replacement CE node ${node}`,
      command: 'aws',
      args: [
        'ec2',
        'run-instances',
        '--image-id',
        intent.image.amiId,
        '--instance-type',
        intent.instance.type,
        '--block-device-mappings',
        `DeviceName=${rootDeviceName},Ebs={VolumeSize=${intent.instance.diskGiB},VolumeType=gp3,DeleteOnTermination=true}`,
        '--network-interfaces',
        ...nodeEnis.map((eni, index) => `DeviceIndex=${index},NetworkInterfaceId=${eni.id}`),
        ...(intent.instance.instanceProfileArn
          ? ['--iam-instance-profile', `Arn=${intent.instance.instanceProfileArn}`]
          : []),
        '--user-data',
        'file://__BOOTSTRAP_FILE__',
        '--tag-specifications',
        tags2(intent, node),
        tagSpec(intent, 'volume', node),
        ...base,
      ],
      node,
      resourceId: `aws://${intent.region}/instance/${intent.deploymentName}-${node}-replacement`,
      mutates: true,
      destructive: false,
      requiresBootstrap: true,
      capture: { placeholder: `__INSTANCE_${node}_REPLACEMENT__`, path: 'Instances.0.InstanceId' },
    });
    for (const eni of nodeEnis)
      add({
        phase: 'nodes',
        kind: 'source-destination-check-disable',
        description: `Disable source/destination check on replacement node ${node} ENI ${eni.id}`,
        command: 'aws',
        args: [
          'ec2',
          'modify-network-interface-attribute',
          '--network-interface-id',
          eni.id,
          '--source-dest-check',
          'Value=false',
          ...base,
        ],
        node,
        resourceId: eni.id,
        mutates: true,
        destructive: false,
      });
    add({
      phase: 'registration',
      kind: 'registration-gate',
      description: `Verify replacement node ${node} registration`,
      node,
      mutates: false,
      destructive: false,
    });
    add({
      phase: 'registration',
      kind: 'health-gate',
      description: `Verify replacement node ${node} health`,
      node,
      mutates: false,
      destructive: false,
    });
    if (intent.routing.profile === 'tgw-connect')
      add({
        phase: 'verify',
        kind: 'bgp-gate',
        description: `Verify BGP after replacement node ${node}`,
        node,
        mutates: false,
        destructive: false,
      });
    if (awsCeNlbIngress(intent))
      add({
        phase: 'verify',
        kind: 'nlb-gate',
        description: `Verify NLB after replacement node ${node}`,
        node,
        mutates: false,
        destructive: false,
      });
    if (intent.routing.profile.startsWith('tgw-'))
      add({
        phase: 'verify',
        kind: 'tgw-route-gate',
        description: `Verify TGW routes after replacement node ${node}`,
        node,
        mutates: false,
        destructive: false,
      });
    add({
      phase: 'verify',
      kind: 'traffic-gate',
      description: `Verify traffic after replacement node ${node}`,
      node,
      mutates: false,
      destructive: false,
    });
    return actions;
  }
  if (observation.resources.some((resource) => resource.owned))
    fail('deploy refuses observed owned-resource collisions; use reconcile or an explicit lifecycle operation');
  if (intent.vpc.mode === 'greenfield') {
    const vpcCidr = intent.vpc.cidr ?? '';
    add({
      phase: 'network',
      kind: 'vpc-create',
      description: `Create VPC ${intent.deploymentName}`,
      command: 'aws',
      args: ['ec2', 'create-vpc', '--cidr-block', vpcCidr, '--tag-specifications', tagSpec(intent, 'vpc'), ...base],
      resourceId: `aws://${intent.region}/vpc/${intent.deploymentName}`,
      mutates: true,
      destructive: false,
      capture: { placeholder: '__VPC_ID__', path: 'Vpc.VpcId' },
    });
  }
  for (const item of intent.interfaces)
    for (const [nodeIndex, subnet] of item.subnets.entries())
      if (intent.vpc.mode === 'greenfield') {
        const subnetCidr = subnet.cidr ?? '';
        add({
          phase: 'network',
          kind: 'subnet-create',
          description: `Create node ${nodeIndex + 1} interface ${item.index} subnet`,
          command: 'aws',
          args: [
            'ec2',
            'create-subnet',
            '--vpc-id',
            '__VPC_ID__',
            '--availability-zone',
            subnet.availabilityZone,
            '--cidr-block',
            subnetCidr,
            '--tag-specifications',
            tagSpec(intent, 'subnet'),
            ...base,
          ],
          node: nodeIndex + 1,
          resourceId: `aws://${intent.region}/subnet/${intent.deploymentName}-${nodeIndex + 1}-${item.index}`,
          mutates: true,
          destructive: false,
          capture: { placeholder: `__SUBNET_${nodeIndex + 1}_${item.index}__`, path: 'Subnet.SubnetId' },
        });
      }
  if (intent.vpc.mode === 'greenfield' && intent.egress.mode === 'elastic-ip') {
    const gateway = `aws://${intent.region}/internet-gateway/${intent.deploymentName}`;
    const routeTable = `aws://${intent.region}/route-table/${intent.deploymentName}-slo`;
    add({
      phase: 'network',
      kind: 'internet-gateway-create',
      description: 'Create CE internet gateway',
      command: 'aws',
      args: ['ec2', 'create-internet-gateway', '--tag-specifications', tagSpec(intent, 'internet-gateway'), ...base],
      resourceId: gateway,
      mutates: true,
      destructive: false,
      capture: { placeholder: '__IGW_ID__', path: 'InternetGateway.InternetGatewayId' },
    });
    add({
      phase: 'network',
      kind: 'internet-gateway-attach',
      description: 'Attach CE internet gateway',
      command: 'aws',
      args: [
        'ec2',
        'attach-internet-gateway',
        '--internet-gateway-id',
        '__IGW_ID__',
        '--vpc-id',
        '__VPC_ID__',
        ...base,
      ],
      resourceId: gateway,
      mutates: true,
      destructive: false,
    });
    add({
      phase: 'network',
      kind: 'route-table-create',
      description: 'Create dedicated SLO route table',
      command: 'aws',
      args: [
        'ec2',
        'create-route-table',
        '--vpc-id',
        '__VPC_ID__',
        '--tag-specifications',
        tagSpec(intent, 'route-table'),
        ...base,
      ],
      resourceId: routeTable,
      mutates: true,
      destructive: false,
      capture: { placeholder: '__SLO_ROUTE_TABLE__', path: 'RouteTable.RouteTableId' },
    });
    add({
      phase: 'network',
      kind: 'route-create',
      description: 'Route SLO internet traffic through the CE gateway',
      command: 'aws',
      args: [
        'ec2',
        'create-route',
        '--route-table-id',
        '__SLO_ROUTE_TABLE__',
        '--destination-cidr-block',
        '0.0.0.0/0',
        '--gateway-id',
        '__IGW_ID__',
        ...base,
      ],
      resourceId: routeTable,
      mutates: true,
      destructive: false,
    });
    for (let node = 1; node <= intent.topology.nodeCount; node++)
      add({
        phase: 'network',
        kind: 'route-table-associate',
        description: `Associate node ${node} SLO subnet with internet routing`,
        command: 'aws',
        args: [
          'ec2',
          'associate-route-table',
          '--route-table-id',
          '__SLO_ROUTE_TABLE__',
          '--subnet-id',
          `__SUBNET_${node}_0__`,
          ...base,
        ],
        resourceId: routeTable,
        node,
        mutates: true,
        destructive: false,
        capture: { placeholder: `__SLO_ROUTE_ASSOCIATION_${node}__`, path: 'AssociationId' },
      });
  }
  for (const group of intent.securityGroups)
    add({
      phase: 'network',
      kind: 'security-group-create',
      description: `Create security group ${group.name}`,
      command: 'aws',
      args: [
        'ec2',
        'create-security-group',
        '--group-name',
        `${intent.deploymentName}-${group.name}`,
        '--description',
        `F5 CE ${group.name}`,
        '--vpc-id',
        intent.vpc.vpcId ?? '__VPC_ID__',
        '--tag-specifications',
        tagSpec(intent, 'security-group'),
        ...base,
      ],
      resourceId: `aws://${intent.region}/security-group/${intent.deploymentName}-${group.name}`,
      mutates: true,
      destructive: false,
      capture: { placeholder: `__SG_${group.name}__`, path: 'GroupId' },
    });
  for (const group of intent.securityGroups)
    add({
      phase: 'network',
      kind: 'security-group-egress-reset',
      description: `Remove default egress from newly owned security group ${group.name}`,
      resourceId: `__SG_${group.name}__`,
      mutates: true,
      destructive: false,
    });
  for (const group of intent.securityGroups)
    for (const direction of ['ingress', 'egress'])
      for (const [ruleIndex, rule] of group[direction].entries()) {
        const permission = {
          IpProtocol: rule.protocol,
          ...(rule.fromPort === undefined ? {} : { FromPort: rule.fromPort }),
          ...(rule.toPort === undefined ? {} : { ToPort: rule.toPort }),
          IpRanges: [...new Set(rule.cidrs)].sort().map((CidrIp) => ({ CidrIp })),
          ...(rule.self ? { UserIdGroupPairs: [{ GroupId: `__SG_${group.name}__` }] } : {}),
        };
        add({
          phase: 'network',
          kind: 'security-group-rule-create',
          description: `Create ${group.name} ${direction} rule ${ruleIndex + 1}`,
          command: 'aws',
          args: [
            'ec2',
            `authorize-security-group-${direction}`,
            '--group-id',
            `__SG_${group.name}__`,
            '--ip-permissions',
            JSON.stringify([permission]),
            ...base,
          ],
          resourceId: `aws://${intent.region}/security-group-rule/${intent.deploymentName}-${group.name}-${direction}-${ruleIndex + 1}`,
          mutates: true,
          destructive: false,
        });
      }
  const listenerAddressForNode = (node) => {
    if (intent.ingress?.mode !== 'nlb') return;
    const index = siteTopology(intent).findIndex((site) => site.nodeIndexes.includes(node));
    return index < 0 ? undefined : intent.ingress.listener.privateAddresses?.[index];
  };
  for (let node = 1; node <= intent.topology.nodeCount; node++) {
    for (const item of intent.interfaces)
      add({
        phase: 'network',
        kind: 'eni-create',
        description: `Create node ${node} ENI ${item.index}`,
        command: 'aws',
        args: [
          'ec2',
          'create-network-interface',
          '--subnet-id',
          item.subnets[node - 1].subnetId ?? `__SUBNET_${node}_${item.index}__`,
          '--description',
          `${intent.deploymentName} node ${node} ${item.role}`,
          ...(item.role === 'sli' && listenerAddressForNode(node)
            ? [
                '--private-ip-addresses',
                `PrivateIpAddress=${cidrHost(item.subnets[node - 1].cidr ?? '', 5)},Primary=true`,
                `PrivateIpAddress=${listenerAddressForNode(node)},Primary=false`,
              ]
            : []),
          ...['--groups', ...interfaceSecurityGroups(intent, item.index).map((name) => `__SG_${name}__`)],
          '--tag-specifications',
          tagSpec(intent, 'network-interface', node, item.index),
          ...base,
        ],
        node,
        resourceId: `aws://${intent.region}/eni/${intent.deploymentName}-${node}-${item.index}`,
        mutates: true,
        destructive: false,
        captures: [
          { placeholder: `__ENI_${node}_${item.index}__`, path: 'NetworkInterface.NetworkInterfaceId' },
          { placeholder: `__ENI_${node}_${item.index}_MAC__`, path: 'NetworkInterface.MacAddress' },
          { placeholder: `__NODE_${node}_${item.role.toUpperCase()}_IP__`, path: 'NetworkInterface.PrivateIpAddress' },
        ],
      });
    if (intent.egress.mode === 'elastic-ip')
      add({
        phase: 'network',
        kind: 'elastic-ip-allocate',
        description: `Allocate node ${node} Elastic IP`,
        command: 'aws',
        args: [
          'ec2',
          'allocate-address',
          '--domain',
          'vpc',
          '--tag-specifications',
          tagSpec(intent, 'elastic-ip', node),
          ...base,
        ],
        node,
        resourceId: `aws://${intent.region}/eip/${intent.deploymentName}-${node}`,
        mutates: true,
        destructive: false,
        capture: { placeholder: `__EIP_${node}__`, path: 'AllocationId' },
      });
    const networkInterfaces = intent.interfaces.map(
      (item) => `DeviceIndex=${item.index},NetworkInterfaceId=__ENI_${node}_${item.index}__`,
    );
    add({
      phase: 'nodes',
      kind: 'instance-run',
      description: `Launch CE node ${node}`,
      command: 'aws',
      args: [
        'ec2',
        'run-instances',
        '--image-id',
        intent.image.amiId,
        '--instance-type',
        intent.instance.type,
        '--block-device-mappings',
        `DeviceName=${rootDeviceName},Ebs={VolumeSize=${intent.instance.diskGiB},VolumeType=gp3,DeleteOnTermination=true}`,
        '--network-interfaces',
        ...networkInterfaces,
        ...(intent.instance.instanceProfileArn
          ? ['--iam-instance-profile', `Arn=${intent.instance.instanceProfileArn}`]
          : []),
        '--user-data',
        'file://__BOOTSTRAP_FILE__',
        '--tag-specifications',
        tags2(intent, node),
        tagSpec(intent, 'volume', node),
        ...base,
      ],
      node,
      resourceId: `aws://${intent.region}/instance/${intent.deploymentName}-${node}`,
      mutates: true,
      destructive: false,
      requiresBootstrap: true,
      capture: { placeholder: `__INSTANCE_${node}__`, path: 'Instances.0.InstanceId' },
    });
    if (intent.egress.mode === 'elastic-ip')
      add({
        phase: 'nodes',
        kind: 'elastic-ip-associate',
        description: `Associate node ${node} Elastic IP with SLO`,
        command: 'aws',
        args: [
          'ec2',
          'associate-address',
          '--allocation-id',
          `__EIP_${node}__`,
          '--network-interface-id',
          `__ENI_${node}_0__`,
          ...base,
        ],
        node,
        resourceId: `aws://${intent.region}/eip-association/${intent.deploymentName}-${node}`,
        mutates: true,
        destructive: false,
        capture: { placeholder: `__EIP_ASSOC_${node}__`, path: 'AssociationId' },
      });
    for (const iface of intent.interfaces)
      add({
        phase: 'nodes',
        kind: 'source-destination-check-disable',
        description: `Disable source/destination check on node ${node} ${iface.role} ENI`,
        command: 'aws',
        args: [
          'ec2',
          'modify-network-interface-attribute',
          '--network-interface-id',
          `__ENI_${node}_${iface.index}__`,
          '--source-dest-check',
          'Value=false',
          ...base,
        ],
        node,
        resourceId: `aws://${intent.region}/eni/${intent.deploymentName}-${node}-${iface.index}`,
        mutates: true,
        destructive: false,
      });
    add({
      phase: 'registration',
      kind: 'registration-gate',
      description: `Verify node ${node} registration`,
      node,
      mutates: false,
      destructive: false,
    });
    add({
      phase: 'registration',
      kind: 'health-gate',
      description: `Verify node ${node} health`,
      node,
      mutates: false,
      destructive: false,
    });
  }
  if (intent.routing.profile === 'direct-eni')
    for (const route of intent.routes)
      add({
        phase: 'routing',
        kind: 'route-replace',
        description: `Route ${route.destinationCidr} to the CE SLI ENI`,
        command: 'aws',
        args: [
          'ec2',
          'replace-route',
          '--route-table-id',
          route.routeTableId,
          '--destination-cidr-block',
          route.destinationCidr,
          '--network-interface-id',
          `__ENI_1_${intent.interfaces.length > 1 ? 1 : 0}__`,
          ...base,
        ],
        resourceId: route.routeTableId,
        mutates: true,
        destructive: true,
      });
  const nlbIngress = awsCeNlbIngress(intent);
  const check = nlbIngress ? nlbSettings(intent).healthCheck : undefined;
  if (nlbIngress) {
    const subnetIds =
      intent.ingress?.mode === 'nlb'
        ? intent.ingress.loadBalancer.subnetIds
        : intent.interfaces[0].subnets.map((subnet, index) => subnet.subnetId ?? `__SUBNET_${index + 1}_0__`);
    add({
      phase: 'routing',
      kind: 'nlb-create',
      description: 'Create three-zone Network Load Balancer ingress',
      command: 'aws',
      args: [
        'elbv2',
        'create-load-balancer',
        '--name',
        `${intent.deploymentName}-nlb`,
        '--type',
        'network',
        ...(nlbIngress.scheme === 'internal' ? ['--scheme', 'internal'] : []),
        ...(intent.ingress?.mode === 'nlb'
          ? [
              '--subnet-mappings',
              ...subnetIds.map(
                (subnetId, index) =>
                  `SubnetId=${subnetId},PrivateIPv4Address=${intent.ingress?.mode === 'nlb' ? intent.ingress.loadBalancer.privateAddresses[index] : ''}`,
              ),
            ]
          : ['--subnets', ...subnetIds]),
        '--tags',
        `Key=xcsh-managed-by,Value=aws-ce`,
        `Key=xcsh-execution-engine,Value=${intent.engine}`,
        `Key=xcsh-deployment-id,Value=${intent.deploymentName}`,
        `Key=xcsh-plan-sha256,Value=__PLAN_SHA256__`,
        `Key=ves-io-site-name,Value=${intent.siteName}`,
        ...base,
      ],
      resourceId: `aws://${intent.region}/nlb/${intent.deploymentName}`,
      mutates: true,
      destructive: false,
      capture: { placeholder: '__NLB_ARN__', path: 'LoadBalancers.0.LoadBalancerArn' },
    });
    add({
      phase: 'routing',
      kind: 'nlb-target-group-create',
      description: 'Create IP target group for three CE SLI addresses',
      command: 'aws',
      args: [
        'elbv2',
        'create-target-group',
        '--name',
        `${intent.deploymentName}-ce`,
        '--protocol',
        'TCP',
        '--port',
        String(nlbIngress.port),
        '--target-type',
        'ip',
        '--vpc-id',
        intent.ingress?.mode === 'nlb' ? intent.ingress.loadBalancer.vpcId : (intent.vpc.vpcId ?? '__VPC_ID__'),
        '--health-check-protocol',
        check.protocol,
        '--health-check-port',
        String(check.port),
        '--health-check-interval-seconds',
        String(check.intervalSeconds),
        '--health-check-timeout-seconds',
        String(check.timeoutSeconds),
        '--healthy-threshold-count',
        String(check.healthyThreshold),
        '--unhealthy-threshold-count',
        String(check.unhealthyThreshold),
        ...(check.path ? ['--health-check-path', check.path] : []),
        '--tags',
        `Key=xcsh-managed-by,Value=aws-ce`,
        `Key=xcsh-execution-engine,Value=${intent.engine}`,
        `Key=xcsh-deployment-id,Value=${intent.deploymentName}`,
        `Key=xcsh-plan-sha256,Value=__PLAN_SHA256__`,
        `Key=ves-io-site-name,Value=${intent.siteName}`,
        ...base,
      ],
      resourceId: `aws://${intent.region}/nlb-target-group/${intent.deploymentName}`,
      mutates: true,
      destructive: false,
      capture: { placeholder: '__NLB_TARGET_GROUP_ARN__', path: 'TargetGroups.0.TargetGroupArn' },
    });
    add({
      phase: 'routing',
      kind: 'nlb-register-targets',
      description: 'Register three CE SLI IP targets',
      command: 'aws',
      args: [
        'elbv2',
        'register-targets',
        '--target-group-arn',
        '__NLB_TARGET_GROUP_ARN__',
        '--targets',
        ...(intent.ingress?.mode === 'nlb'
          ? (intent.ingress.listener.privateAddresses?.map((address) => `Id=${address},AvailabilityZone=all`) ?? [])
          : ['Id=__NODE_1_SLI_IP__', 'Id=__NODE_2_SLI_IP__', 'Id=__NODE_3_SLI_IP__']),
        ...base,
      ],
      resourceId: `aws://${intent.region}/nlb-target-registration/${intent.deploymentName}`,
      mutates: true,
      destructive: false,
    });
    add({
      phase: 'routing',
      kind: 'nlb-listener-create',
      description: 'Create TCP ingress listener',
      command: 'aws',
      args: [
        'elbv2',
        'create-listener',
        '--load-balancer-arn',
        '__NLB_ARN__',
        '--protocol',
        'TCP',
        '--port',
        String(nlbIngress.port),
        '--default-actions',
        'Type=forward,TargetGroupArn=__NLB_TARGET_GROUP_ARN__',
        ...base,
      ],
      resourceId: `aws://${intent.region}/nlb-listener/${intent.deploymentName}`,
      mutates: true,
      destructive: false,
      capture: { placeholder: '__NLB_LISTENER_ARN__', path: 'Listeners.0.ListenerArn' },
    });
    add({
      phase: 'routing',
      kind: 'nlb-cross-zone-enable',
      description: 'Enable NLB cross-zone load balancing',
      command: 'aws',
      args: [
        'elbv2',
        'modify-load-balancer-attributes',
        '--load-balancer-arn',
        '__NLB_ARN__',
        '--attributes',
        'Key=load_balancing.cross_zone.enabled,Value=true',
        ...base,
      ],
      mutates: true,
      destructive: false,
    });
    if (intent.ingress?.mode === 'nlb')
      add({
        phase: 'routing',
        kind: 'f5-ingress-configure',
        description: 'Configure the owned XC inside HTTP listener on observed CE SLI addresses',
        mutates: true,
        destructive: false,
      });
  }
  if (intent.routing.profile === 'tgw-static' || intent.routing.profile === 'tgw-connect') {
    const transitGatewayId = intent.routing.transitGatewayId ?? '';
    if (!intent.routing.transportAttachmentId)
      add({
        phase: 'routing',
        kind: 'tgw-vpc-attachment-create',
        description: 'Create appliance VPC transport attachment',
        command: 'aws',
        args: [
          'ec2',
          'create-transit-gateway-vpc-attachment',
          '--transit-gateway-id',
          transitGatewayId,
          '--vpc-id',
          intent.vpc.vpcId ?? '__VPC_ID__',
          '--subnet-ids',
          ...intent.interfaces[1].subnets.map((subnet, index) => subnet.subnetId ?? `__SUBNET_${index + 1}_1__`),
          '--options',
          'ApplianceModeSupport=enable',
          '--tag-specifications',
          tagSpec(intent, 'transit-gateway-attachment'),
          ...base,
        ],
        resourceId: `aws://${intent.region}/tgw-attachment/${intent.deploymentName}`,
        mutates: true,
        destructive: false,
        capture: {
          placeholder: '__TGW_TRANSPORT_ATTACHMENT__',
          path: 'TransitGatewayVpcAttachment.TransitGatewayAttachmentId',
        },
      });
    add({
      phase: 'routing',
      kind: 'tgw-attachment-gate',
      description: 'Wait for scoped VPC transport attachment availability',
      resourceId: intent.routing.transportAttachmentId ?? '__TGW_TRANSPORT_ATTACHMENT__',
      mutates: false,
      destructive: false,
    });
    for (const az of staticAzRoutes(intent)) {
      const table = `__STATIC_ROUTE_TABLE_${az.node}__`;
      add({
        phase: 'routing',
        kind: 'route-table-create',
        description: `Create appliance route table in ${az.availabilityZone}`,
        command: 'aws',
        args: [
          'ec2',
          'create-route-table',
          '--vpc-id',
          intent.vpc.vpcId ?? '__VPC_ID__',
          '--tag-specifications',
          tagSpec(intent, 'route-table', az.node),
          ...base,
        ],
        node: az.node,
        resourceId: `aws://${intent.region}/route-table/${intent.deploymentName}-static-${az.node}`,
        mutates: true,
        destructive: false,
        capture: { placeholder: table, path: 'RouteTable.RouteTableId' },
      });
      add({
        phase: 'routing',
        kind: 'route-table-associate',
        description: `Associate ${az.availabilityZone} appliance subnet`,
        command: 'aws',
        args: [
          'ec2',
          'associate-route-table',
          '--route-table-id',
          table,
          '--subnet-id',
          intent.interfaces[1].subnets[az.node - 1].subnetId ?? `__SUBNET_${az.node}_1__`,
          ...base,
        ],
        node: az.node,
        resourceId: table,
        mutates: true,
        destructive: false,
        capture: { placeholder: `__STATIC_ROUTE_ASSOCIATION_${az.node}__`, path: 'AssociationId' },
      });
      for (const [direction, prefixes] of [
        ['forward', az.forwardCidrs],
        ['return', az.returnCidrs],
      ])
        for (const destination of prefixes)
          add({
            phase: 'routing',
            kind: 'route-create',
            description: `${direction} route ${destination} in ${az.availabilityZone}`,
            command: 'aws',
            args: [
              'ec2',
              'create-route',
              '--route-table-id',
              table,
              '--destination-cidr-block',
              destination,
              ...(direction === 'forward'
                ? ['--network-interface-id', `__ENI_${az.node}_1__`]
                : ['--transit-gateway-id', transitGatewayId]),
              ...base,
            ],
            node: az.node,
            resourceId: table,
            mutates: true,
            destructive: false,
          });
    }
    for (const routeTableId of intent.routing.associations)
      add({
        phase: 'routing',
        kind: 'tgw-associate',
        description: `Associate ${routeTableId}`,
        command: 'aws',
        args: [
          'ec2',
          'associate-transit-gateway-route-table',
          '--transit-gateway-route-table-id',
          routeTableId,
          '--transit-gateway-attachment-id',
          '__TGW_TRANSPORT_ATTACHMENT__',
          ...base,
        ],
        resourceId: routeTableId,
        mutates: true,
        destructive: true,
      });
    for (const routeTableId of intent.routing.propagations)
      add({
        phase: 'routing',
        kind: 'tgw-propagate',
        description: `Propagate ${routeTableId}`,
        command: 'aws',
        args: [
          'ec2',
          'enable-transit-gateway-route-table-propagation',
          '--transit-gateway-route-table-id',
          routeTableId,
          '--transit-gateway-attachment-id',
          '__TGW_TRANSPORT_ATTACHMENT__',
          ...base,
        ],
        resourceId: routeTableId,
        mutates: true,
        destructive: true,
      });
    for (const destination of intent.routing.destinationCidrs) {
      if (intent.routing.profile !== 'tgw-connect' && intent.routing.transitGatewayRouteTableId)
        add({
          phase: 'routing',
          kind: 'tgw-route-create',
          description: `Create TGW route ${destination}`,
          command: 'aws',
          args: [
            'ec2',
            'create-transit-gateway-route',
            '--transit-gateway-route-table-id',
            intent.routing.transitGatewayRouteTableId,
            '--destination-cidr-block',
            destination,
            '--transit-gateway-attachment-id',
            '__TGW_TRANSPORT_ATTACHMENT__',
            ...base,
          ],
          resourceId: intent.routing.transitGatewayRouteTableId,
          mutates: true,
          destructive: true,
        });
    }
    for (const route of intent.routes)
      add({
        phase: 'routing',
        kind: 'route-replace',
        description: `Route ${route.destinationCidr} to the CE SLI ENI`,
        command: 'aws',
        args: [
          'ec2',
          'replace-route',
          '--route-table-id',
          route.routeTableId,
          '--destination-cidr-block',
          route.destinationCidr,
          '--network-interface-id',
          `__ENI_${routeNode(intent, route)}_1__`,
          ...base,
        ],
        resourceId: route.routeTableId,
        mutates: true,
        destructive: true,
      });
  }
  if (intent.routing.profile === 'tgw-connect') {
    const peers =
      intent.routing.connectPeers ??
      (intent.routing.insideCidrs ?? []).map((insideCidr, index) => ({
        node: index + 1,
        insideCidr,
        transportInterfaceIndex: 0,
        transitGatewayAddress: undefined,
      }));
    if (intent.vpc.mode === 'greenfield') {
      const transportCidrs = observedConnectCidrs(intent, observation);
      const sliIndex = intent.interfaces.find((item) => item.role === 'sli')?.index;
      if (sliIndex === undefined) throw new Error('TGW Connect requires an explicit SLI payload interface');
      const transportRoles = new Set(peers.map((peer) => peer.transportInterfaceIndex));
      const routingRoles = [...new Set([...transportRoles, sliIndex])].sort();
      for (const role of routingRoles) {
        const interfaceRole = intent.interfaces.find((item) => item.index === role)?.role;
        const reuseSlo = interfaceRole === 'slo' && intent.egress.mode === 'elastic-ip';
        const table = reuseSlo ? '__SLO_ROUTE_TABLE__' : `__GRE_ROUTE_TABLE_${role}__`;
        const resourceId = `aws://${intent.region}/route-table/${intent.deploymentName}-${interfaceRole ?? role}`;
        if (!reuseSlo) {
          add({
            phase: 'routing',
            kind: 'route-table-create',
            description: `Create interface ${role} GRE transport route table`,
            command: 'aws',
            args: [
              'ec2',
              'create-route-table',
              '--vpc-id',
              '__VPC_ID__',
              '--tag-specifications',
              tagSpec(intent, 'route-table'),
              ...base,
            ],
            resourceId,
            mutates: true,
            destructive: false,
            capture: { placeholder: table, path: 'RouteTable.RouteTableId' },
          });
          for (let node = 1; node <= intent.topology.nodeCount; node++)
            add({
              phase: 'routing',
              kind: 'route-table-associate',
              description: `Associate node ${node} interface ${role} subnet with GRE transport routing`,
              command: 'aws',
              args: [
                'ec2',
                'associate-route-table',
                '--route-table-id',
                table,
                '--subnet-id',
                `__SUBNET_${node}_${role}__`,
                ...base,
              ],
              resourceId,
              node,
              mutates: true,
              destructive: false,
              capture: { placeholder: `__GRE_ROUTE_ASSOCIATION_${node}_${role}__`, path: 'AssociationId' },
            });
        }
        if (role === sliIndex)
          for (const destination of intent.routing.destinationCidrs)
            add({
              phase: 'routing',
              kind: 'route-create',
              description: `Route remote payload network ${destination} from the SLI subnet through the TGW`,
              command: 'aws',
              args: [
                'ec2',
                'create-route',
                '--route-table-id',
                table,
                '--destination-cidr-block',
                destination,
                '--transit-gateway-id',
                intent.routing.transitGatewayId ?? '',
                ...base,
              ],
              resourceId,
              mutates: true,
              destructive: false,
            });
        for (const destination of transportRoles.has(role) ? transportCidrs : [])
          add({
            phase: 'routing',
            kind: 'route-create',
            description: `Route interface ${role} GRE transport ${destination} to the Transit Gateway`,
            command: 'aws',
            args: [
              'ec2',
              'create-route',
              '--route-table-id',
              table,
              '--destination-cidr-block',
              destination,
              '--transit-gateway-id',
              intent.routing.transitGatewayId ?? '',
              ...base,
            ],
            resourceId,
            mutates: true,
            destructive: false,
          });
      }
    }
    const roleCounts = new Map();
    const peerGroups = peers.map((peer) => {
      const position = roleCounts.get(peer.transportInterfaceIndex) ?? 0;
      roleCounts.set(peer.transportInterfaceIndex, position + 1);
      return `${peer.transportInterfaceIndex}_${Math.floor(position / 4) + 1}`;
    });
    for (const group of [...new Set(peerGroups)].sort()) {
      add({
        phase: 'routing',
        kind: 'tgw-connect-attachment-create',
        description: `Create TGW Connect attachment ${group} with at most four peers`,
        command: 'aws',
        args: [
          'ec2',
          'create-transit-gateway-connect',
          '--transport-transit-gateway-attachment-id',
          intent.routing.transportAttachmentId ?? '__TGW_TRANSPORT_ATTACHMENT__',
          '--options',
          'Protocol=gre',
          '--tag-specifications',
          tagSpec(intent, 'transit-gateway-attachment'),
          ...base,
        ],
        resourceId: `aws://${intent.region}/tgw-connect/${intent.deploymentName}-${group}`,
        mutates: true,
        destructive: false,
        capture: {
          placeholder: `__TGW_CONNECT_ATTACHMENT_${group}__`,
          path: 'TransitGatewayConnect.TransitGatewayAttachmentId',
        },
      });
      add({
        phase: 'routing',
        kind: 'tgw-attachment-gate',
        description: `Wait for scoped Connect attachment ${group} availability`,
        resourceId: `__TGW_CONNECT_ATTACHMENT_${group}__`,
        mutates: false,
        destructive: false,
      });
      for (const [tables, operation, kind] of [
        [intent.routing.associations, 'associate-transit-gateway-route-table', 'tgw-associate'],
        [intent.routing.propagations, 'enable-transit-gateway-route-table-propagation', 'tgw-propagate'],
      ])
        for (const table of tables)
          add({
            phase: 'routing',
            kind,
            description: `${operation} for Connect attachment ${group}`,
            command: 'aws',
            args: [
              'ec2',
              operation,
              '--transit-gateway-route-table-id',
              table,
              '--transit-gateway-attachment-id',
              `__TGW_CONNECT_ATTACHMENT_${group}__`,
              ...base,
            ],
            resourceId: table,
            mutates: true,
            destructive: true,
          });
    }
    for (const [index, peer] of peers.entries())
      add({
        phase: 'routing',
        kind: 'tgw-connect-peer-create',
        description: `Create node ${peer.node} Connect peer with two AWS-managed BGP sessions`,
        command: 'aws',
        args: [
          'ec2',
          'create-transit-gateway-connect-peer',
          '--transit-gateway-attachment-id',
          `__TGW_CONNECT_ATTACHMENT_${peerGroups[index]}__`,
          '--peer-address',
          `__NODE_${peer.node}_${intent.interfaces.find((item) => item.index === peer.transportInterfaceIndex)?.role.toUpperCase()}_IP__`,
          ...(peer.transitGatewayAddress ? ['--transit-gateway-address', peer.transitGatewayAddress] : []),
          '--bgp-options',
          `PeerAsn=${intent.routing.customerAsn}`,
          '--inside-cidr-blocks',
          peer.insideCidr,
          '--tag-specifications',
          tagSpec(intent, 'transit-gateway-connect-peer', peer.node),
          ...base,
        ],
        node: peer.node,
        resourceId: `aws://${intent.region}/tgw-connect-peer/${intent.deploymentName}-${peer.node}-${index + 1}`,
        mutates: true,
        destructive: false,
        capture: {
          placeholder: `__TGW_CONNECT_PEER_${index + 1}__`,
          path: 'TransitGatewayConnectPeer.TransitGatewayConnectPeerId',
        },
      });
    add({
      phase: 'routing',
      kind: 'f5-routing-configure',
      description:
        'Configure site-bound XC GRE connectors and both BGP endpoints from observed interface and AWS peer identities',
      mutates: true,
      destructive: false,
    });
    add({
      phase: 'verify',
      kind: 'bgp-gate',
      description: `Verify ${(intent.routing.connectPeers?.length ?? intent.routing.insideCidrs?.length ?? 0) * 2} AWS-managed BGP sessions across ${intent.routing.connectPeers?.length ?? intent.routing.insideCidrs?.length ?? 0} Connect peers`,
      mutates: false,
      destructive: false,
    });
  }
  if (intent.routing.profile.startsWith('tgw-'))
    add({
      phase: 'verify',
      kind: 'tgw-route-gate',
      description: 'Verify TGW associations, propagations, and routes',
      mutates: false,
      destructive: false,
    });
  if (nlbIngress)
    add({
      phase: 'verify',
      kind: 'nlb-gate',
      description: 'Verify NLB targets and health after routing convergence',
      mutates: false,
      destructive: false,
    });
  add({
    phase: 'verify',
    kind: 'traffic-gate',
    description: 'Verify end-to-end traffic',
    mutates: false,
    destructive: false,
  });
  return actions;
}
function compileAwsCePlan(input, observation, restorationState = []) {
  const intent = normalizeIntent({
    ...input,
    awsProfile: input.awsProfile ?? observation.identity.awsProfile ?? 'default',
    platformContext: input.platformContext ?? observation.f5Capabilities.platformContext,
  });
  if (
    intent.awsProfile !== (observation.identity.awsProfile ?? 'default') ||
    intent.platformContext !== observation.f5Capabilities.platformContext
  )
    fail('execution contexts differ from discovery');
  validateResearch(observation);
  if (canonicalSha256(observation.f5Capabilities) !== observation.f5CapabilitiesSha256)
    fail('F5 capability digest is inconsistent');
  if (observation.identity.accountId !== intent.accountId || observation.identity.partition !== intent.partition)
    fail('observation identity does not match intent');
  if (
    observation.ownershipPlanSha256s.some((digest) => !/^[a-f0-9]{64}$/.test(digest)) ||
    JSON.stringify(observation.ownershipPlanSha256s) !==
      JSON.stringify([...new Set(observation.ownershipPlanSha256s)].sort())
  )
    fail('observation ownership plan digests are invalid or non-canonical');
  for (const resource of observation.resources.filter((item) => item.owned)) {
    const ownerPlanSha256 = resource.tags['xcsh-plan-sha256'] ?? '';
    if (
      resource.tags['xcsh-managed-by'] !== 'aws-ce' ||
      resource.tags['xcsh-execution-engine'] !== intent.engine ||
      resource.tags['xcsh-deployment-id'] !== intent.deploymentName ||
      !observation.ownershipPlanSha256s.includes(ownerPlanSha256)
    )
      fail(`owned resource ${resource.id} does not match the deployment and approved prior plan tags`);
  }
  if (!observation.agreement.active)
    fail(
      `AWS Marketplace agreement is not active. Open https://aws.amazon.com/marketplace/pp/${AWS_CE_MARKETPLACE_PRODUCT_ID}, subscribe without automation, then rerun aws_compute_discover and replan`,
    );
  const region = observation.regions.find((item) => item.name === intent.region);
  if (!region?.eligible || !region.ami)
    fail(`region ${intent.region} is not eligible: ${region?.reasons.join(', ') ?? 'not observed'}`);
  if (
    region.ami.id !== intent.image.amiId ||
    region.ami.ssmParameter !== AWS_CE_SSM_PARAMETER ||
    !region.ami.ssmVersion
  )
    fail('intent AMI does not match the exact regional SSM observation');
  const instance = region.instanceTypes.find((item) => item.name === intent.instance.type);
  if (!instance?.supported) fail(`instance type ${intent.instance.type} is not supported in ${intent.region}`);
  if (intent.topology.nodeCount === 3 && instance.availabilityZones.length < 3)
    fail('three-node topology requires three Availability Zones');
  if (
    intent.routing.profile === 'tgw-connect' &&
    (!observation.research.mcnTgwGuide?.documented ||
      !observation.f5Capabilities.awsSmsv2TgwConnect.supported ||
      observation.f5Capabilities.awsSmsv2TgwConnect.schemaVersion !== 'f5xc-smsv2-aws-tgw-telemetry/v2')
  )
    fail('AWS TGW Connect requires the current MCN routing recipe and the authenticated telemetry contract');
  if (
    !observation.f5Capabilities.supportedProviders.includes('aws') ||
    !observation.f5Capabilities.providerNetworkingProfiles.aws?.includes(intent.routing.profile)
  )
    fail(`F5 platform does not advertise ${intent.routing.profile} for AWS SMSv2`);
  if (
    intent.ingress?.mode === 'nlb' &&
    !observation.f5Capabilities.providerNetworkingProfiles.aws?.includes('nlb-ingress')
  )
    fail('F5 platform does not advertise NLB ingress for AWS SMSv2');
  if (
    intent.ingress?.mode === 'nlb' &&
    !region.networkQuotas.some((quota) => /network load balancers.*region/i.test(quota.quotaName) && quota.value >= 1)
  )
    fail('Fresh regional NLB quota evidence is unavailable');
  if (intent.routing.profile.startsWith('tgw-') && !region.transitGatewaySupported)
    fail('Transit Gateway is unavailable in the selected region');
  const observationById = new Map(observation.resources.map((resource) => [resource.id, resource]));
  const brownfieldIds = [
    ...new Set([
      ...intent.brownfield.resourceIds,
      ...intent.brownfield.routeTableIds,
      ...intent.brownfield.transitGatewayRouteTableIds,
    ]),
  ].sort();
  for (const id of brownfieldIds)
    if (!observationById.get(id)?.exists) fail(`brownfield resource was not observed: ${id}`);
  const restorationById = new Map(restorationState.map((item) => [item.id, item.before]));
  const actions = compileActions(intent, observation, restorationById);
  if (actions.some((action) => action.kind === 'registration-gate'))
    actions.splice(
      actions.findIndex((action) => action.kind === 'registration-gate'),
      0,
      {
        id: 'f5-registration-approval',
        phase: 'registration',
        kind: 'registration-approve',
        description: 'Approve registrations only after exact site, node and cloud instance correlation',
        mutates: true,
        destructive: false,
      },
    );
  for (const action of actions) {
    if (intent.routing.transportAttachmentId && action.args)
      action.args = action.args.map((arg) =>
        arg.replaceAll('__TGW_TRANSPORT_ATTACHMENT__', intent.routing.transportAttachmentId ?? ''),
      );
    prepareRecoverableAction(action);
  }
  const ownershipInventory = [
    ...brownfieldIds.map((resourceId) => ({ resourceId, owned: false, action: 'modify-approved' })),
    ...actions.flatMap((action) =>
      action.resourceId?.startsWith('aws://') ? [{ resourceId: action.resourceId, owned: true, action: 'create' }] : [],
    ),
    ...observation.resources
      .filter((resource) => resource.owned)
      .map((resource) => ({
        resourceId: resource.id,
        owned: true,
        action: intent.operation === 'teardown' ? 'delete' : 'reference',
      })),
  ].sort((left, right) => left.resourceId.localeCompare(right.resourceId));
  const warnings =
    intent.topology.nodeCount === 1 && ['resize', 'replace-node', 'update-network'].includes(intent.operation)
      ? ['Single-node lifecycle work is disruptive and requires a maintenance window.']
      : [];
  const billableResources = [
    { type: 'ec2-instance', count: intent.topology.nodeCount },
    { type: 'gp3-volume', count: intent.topology.nodeCount },
    ...(intent.egress.mode === 'elastic-ip' ? [{ type: 'elastic-ip', count: intent.topology.nodeCount }] : []),
    ...(awsCeNlbIngress(intent) ? [{ type: 'network-load-balancer', count: 1 }] : []),
    ...(intent.routing.profile.startsWith('tgw-')
      ? [
          {
            type: 'transit-gateway-attachment',
            count: 1 + connectAttachmentCount(intent),
          },
        ]
      : []),
  ];
  const draft = {
    execution: {
      engine: intent.engine,
      awsProfile: intent.awsProfile ?? 'default',
      ...(intent.engine === 'terraform'
        ? {
            terraform: {
              version: AWS_CE_TERRAFORM_VERSION,
              awsProvider: AWS_CE_TERRAFORM_PROVIDER_VERSION,
              awsProviderLockSha256: AWS_CE_PROVIDER_LOCK_SHA256,
              f5Provider: XCSH_PROVIDER_VERSION,
              f5ProviderLockSha256: XCSH_PROVIDER_LOCK_SHA256,
              backendIdentity: `local:${intent.deploymentName}`,
              f5BackendIdentity: `local:${intent.deploymentName}:stage:f5-resources`,
            },
          }
        : {}),
    },
    schemaVersion: AWS_CE_SCHEMA_VERSION,
    intent,
    engine: intent.engine,
    accountId: intent.accountId,
    partition: intent.partition,
    region: intent.region,
    deploymentName: intent.deploymentName,
    siteName: intent.siteName,
    namespace: intent.namespace,
    topology: {
      nodeCount: intent.topology.nodeCount,
      availabilityZones: intent.interfaces[0].subnets.map((item) => item.availabilityZone),
    },
    interfaces: intent.interfaces,
    image: region.ami,
    instance: intent.instance,
    egress: intent.egress,
    routing: intent.routing,
    securityGroups: intent.securityGroups,
    warnings,
    billableResources,
    actions:
      intent.operation === 'deploy'
        ? [
            ...actions.filter((action) => action.phase === 'network'),
            ...actions.filter((action) => action.phase === 'nodes'),
            ...actions.filter((action) => action.phase === 'registration'),
            ...actions.filter((action) => !['network', 'nodes', 'registration'].includes(action.phase)),
          ]
        : actions,
    rollback: {
      resources: (restorationState.length
        ? restorationState.filter((resource) => brownfieldIds.includes(resource.id))
        : observation.resources
            .filter((resource) => brownfieldIds.includes(resource.id))
            .map((resource) => ({ id: resource.id, before: resource.state }))
      ).sort((left, right) => left.id.localeCompare(right.id)),
    },
    ownershipInventory,
    ownershipTags: {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-execution-engine': intent.engine,
      'xcsh-deployment-id': intent.deploymentName,
      'xcsh-plan-sha256': '__PLAN_SHA256__',
      'ves-io-site-name': intent.siteName,
    },
    observationFingerprint: fingerprintObservation(observation, [
      ...brownfieldIds,
      ...observation.resources.filter((resource) => resource.owned).map((resource) => resource.id),
    ]),
    f5CapabilitiesSha256: observation.f5CapabilitiesSha256,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-${planSha256.slice(0, 24)}`, planSha256 };
}
var ACCOUNT2, REGION2, SAFE_NAME2, CIDR, AMI, DEVICE_NAME, AWS_ID;
var init_planner = __esm(() => {
  init_provider_lock();
  init_canonical();
  init_create_recovery();
  init_static_routing();
  init_transport_routes();
  init_types2();
  ACCOUNT2 = /^\d{12}$/;
  REGION2 = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
  SAFE_NAME2 = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;
  CIDR = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]+)\/\d{1,3}$/;
  AMI = /^ami-[0-9a-f]{8,17}$/;
  DEVICE_NAME = /^\/dev\/[a-zA-Z0-9._-]{1,32}$/;
  AWS_ID =
    /^(?:arn:(?:aws|aws-us-gov|aws-cn):[a-z0-9-]+:[a-z0-9-]*:\d{12}:[A-Za-z0-9_+=,.@:/-]+|(?:i|vpc|subnet|rtb|igw|tgw|tgw-attach|tgw-connect-peer|tgw-rtb|eni|sg|eipalloc|eipassoc|nat|vpce)-[0-9a-f]{8,21})$/;
});

// plugins/aws/src/tools/aws-ce-plan.ts
function createAwsCePlanTool(pi) {
  const { Type } = pi.typebox;
  const stringArray = Type.Array(Type.String());
  const subnet = Type.Object({
    availabilityZone: Type.String(),
    subnetId: Type.Optional(Type.String()),
    cidr: Type.Optional(Type.String()),
  });
  const networkInterface = Type.Object({
    index: Type.Number(),
    securityGroupNames: Type.Optional(stringArray),
    role: Type.Union(['slo', 'sli', 'management', 'service', 'workload'].map((value) => Type.Literal(value))),
    vrf: Type.String(),
    mtu: Type.Optional(Type.Integer({ minimum: 1500, maximum: 9000 })),
    guestDevice: Type.Optional(Type.String()),
    subnets: Type.Array(subnet),
    addressing: Type.Object({
      mode: Type.Union([Type.Literal('dhcp'), Type.Literal('static')]),
      addresses: Type.Optional(stringArray),
    }),
  });
  const rule = Type.Object({
    protocol: Type.String(),
    fromPort: Type.Optional(Type.Number()),
    toPort: Type.Optional(Type.Number()),
    cidrs: stringArray,
  });
  return {
    name: 'aws_ce_plan',
    label: 'Plan AWS Customer Edge',
    description:
      'Compile a live AWS discovery receipt and normalized SMSv2 intent into a deterministic, immutable, secret-free plan containing exact argv arrays, ownership, rollback, billable resources, and lifecycle gates.',
    parameters: Type.Object({
      discoveryArtifactId: Type.String(),
      restorationPlanId: Type.Optional(Type.String()),
      restorationPlanSha256: Type.Optional(Type.String()),
      intent: Type.Object({
        schemaVersion: Type.Literal(AWS_CE_SCHEMA_VERSION),
        engine: Type.Optional(Type.Union([Type.Literal('native'), Type.Literal('terraform')])),
        awsProfile: Type.Optional(Type.String()),
        platformContext: Type.Optional(Type.String()),
        operation: Type.Union(
          [
            'deploy',
            'reconcile',
            'start',
            'stop',
            'resize',
            'update-network',
            'replace-node',
            'repair',
            'teardown',
          ].map((value) => Type.Literal(value)),
        ),
        accountId: Type.String(),
        partition: Type.Union([Type.Literal('aws'), Type.Literal('aws-us-gov'), Type.Literal('aws-cn')]),
        region: Type.String(),
        deploymentName: Type.String(),
        siteName: Type.String(),
        namespace: Type.String(),
        initialVersions: Type.Optional(Type.Object({ software: Type.String(), os: Type.String() })),
        topology: Type.Object({
          nodeCount: Type.Union([Type.Literal(1), Type.Literal(3)]),
          sites: Type.Optional(
            Type.Array(
              Type.Object({
                name: Type.String(),
                nodeIndexes: Type.Array(Type.Integer({ minimum: 1, maximum: 3 }), { minItems: 1, maxItems: 3 }),
              }),
            ),
          ),
        }),
        vpc: Type.Object({
          mode: Type.Union([Type.Literal('greenfield'), Type.Literal('brownfield')]),
          vpcId: Type.Optional(Type.String()),
          cidr: Type.Optional(Type.String()),
        }),
        interfaces: Type.Array(networkInterface, { minItems: 1, maxItems: 8 }),
        egress: Type.Object({
          mode: Type.Union(['elastic-ip', 'nat-gateway', 'firewall', 'proxy'].map((value) => Type.Literal(value))),
          resourceId: Type.Optional(Type.String()),
        }),
        routing: Type.Object({
          profile: Type.Union(
            ['direct-eni', 'nlb-ingress', 'tgw-static', 'tgw-connect'].map((value) => Type.Literal(value)),
          ),
          destinationCidrs: stringArray,
          transitGatewayId: Type.Optional(Type.String()),
          transportAttachmentId: Type.Optional(Type.String()),
          transitGatewayRouteTableId: Type.Optional(Type.String()),
          customerAsn: Type.Optional(Type.Number()),
          transitGatewayAsn: Type.Optional(Type.Number()),
          insideCidrs: Type.Optional(stringArray),
          connectPeers: Type.Optional(
            Type.Array(
              Type.Object({
                node: Type.Integer({ minimum: 1, maximum: 3 }),
                insideCidr: Type.String(),
                transportInterfaceIndex: Type.Union([Type.Literal(0), Type.Literal(1)]),
                transitGatewayAddress: Type.Optional(Type.String()),
              }),
              { minItems: 1, maxItems: 12 },
            ),
          ),
          associations: stringArray,
          propagations: stringArray,
          staticAzRoutes: Type.Optional(
            Type.Array(
              Type.Object({
                node: Type.Number(),
                availabilityZone: Type.String(),
                forwardCidrs: stringArray,
                returnCidrs: stringArray,
              }),
            ),
          ),
        }),
        ingress: Type.Optional(
          Type.Union([
            Type.Object({ mode: Type.Literal('none') }),
            Type.Object({
              mode: Type.Literal('nlb'),
              port: Type.Integer({ minimum: 1, maximum: 65535 }),
              scheme: Type.Literal('internal'),
              targetInterfaceIndex: Type.Optional(Type.Literal(1)),
              healthCheck: Type.Optional(
                Type.Object({
                  protocol: Type.Union(['TCP', 'HTTP', 'HTTPS'].map((value) => Type.Literal(value))),
                  port: Type.Union([Type.Integer({ minimum: 1, maximum: 65535 }), Type.Literal('traffic-port')]),
                  path: Type.Optional(Type.String()),
                  intervalSeconds: Type.Integer({ minimum: 5, maximum: 300 }),
                  timeoutSeconds: Type.Integer({ minimum: 2, maximum: 120 }),
                  healthyThreshold: Type.Integer({ minimum: 2, maximum: 10 }),
                  unhealthyThreshold: Type.Integer({ minimum: 2, maximum: 10 }),
                }),
              ),
              loadBalancer: Type.Object({
                vpcId: Type.String(),
                subnetIds: stringArray,
                privateAddresses: stringArray,
              }),
              listener: Type.Object({
                privateAddresses: stringArray,
                name: Type.String(),
                namespace: Type.String(),
                domain: Type.String(),
                originPool: Type.Object({ name: Type.String(), namespace: Type.String() }),
              }),
              probe: Type.Object({
                sourceInstanceId: Type.String(),
                path: Type.String(),
                expectedStatus: Type.Integer({ minimum: 100, maximum: 599 }),
                expectedBodySha256: Type.String(),
              }),
            }),
          ]),
        ),
        image: Type.Object({ productId: Type.Literal(AWS_CE_MARKETPLACE_PRODUCT_ID), amiId: Type.String() }),
        instance: Type.Object({
          type: Type.String(),
          diskGiB: Type.Number(),
          instanceProfileArn: Type.Optional(Type.String()),
        }),
        securityGroups: Type.Array(
          Type.Object({ name: Type.String(), ingress: Type.Array(rule), egress: Type.Array(rule) }),
        ),
        routes: Type.Array(
          Type.Object({
            routeTableId: Type.String(),
            destinationCidr: Type.String(),
            node: Type.Optional(Type.Number()),
            availabilityZone: Type.Optional(Type.String()),
          }),
        ),
        brownfield: Type.Object({
          resourceIds: stringArray,
          routeTableIds: stringArray,
          transitGatewayRouteTableIds: stringArray,
        }),
        replacementNode: Type.Optional(Type.Number()),
      }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      try {
        const observation = await loadAwsDiscovery(ctx.sessionManager, params.discoveryArtifactId);
        let restorationState = [];
        if (params.intent.operation === 'teardown') {
          if (!params.restorationPlanId || !params.restorationPlanSha256)
            throw new Error('Teardown requires the exact original deployment plan ID and SHA-256 for restoration');
          const original = (
            await loadAwsPlan(ctx.sessionManager, params.restorationPlanId, params.restorationPlanSha256)
          ).plan;
          if (
            original.accountId !== params.intent.accountId ||
            original.partition !== params.intent.partition ||
            original.region !== params.intent.region ||
            original.deploymentName !== params.intent.deploymentName ||
            original.siteName !== params.intent.siteName ||
            canonicalSha256(siteTopology(original.intent)) !== canonicalSha256(siteTopology(params.intent))
          )
            throw new Error('Original restoration plan scope does not match teardown intent');
          restorationState = original.rollback.resources;
        } else if (params.restorationPlanId || params.restorationPlanSha256) {
          throw new Error('Restoration plan coordinates are valid only for teardown');
        }
        const plan = compileAwsCePlan(params.intent, observation, restorationState);
        const artifactId = await saveAwsPlan(ctx.sessionManager, plan, observation);
        return {
          content: [
            {
              type: 'text',
              text: `Plan ID: ${plan.planId}
SHA-256: ${plan.planSha256}
Region: ${plan.region}
Topology: ${plan.topology.nodeCount} node(s), ${plan.interfaces.length} ENI(s) each
Pinned AMI/SSM version: ${plan.image.id}/${plan.image.ssmVersion}
Billable resources: ${plan.billableResources.map((item) => `${item.count} ${item.type}`).join(', ')}
Ordered actions: ${plan.actions.length}
Plan artifact: ${artifactId ? `artifact://${artifactId}` : 'session memory only'}`,
            },
          ],
          details: { tool: 'aws_ce_plan', artifactId, plan },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE planning failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_plan' },
        };
      }
    },
  };
}
var init_aws_ce_plan = __esm(() => {
  init_artifacts();
  init_canonical();
  init_planner();
  init_types2();
});

// plugins/platform/src/ce/wire-ingress.ts
import { isIP as isIP5 } from 'node:net';

function projectInsideHttpListener(spec, schemas, validate) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('Malformed HTTP listener response');
  const source = structuredClone(spec);
  for (const key of ['api_rate_limit_legacy', 'malicious_user_mitigation'])
    if (source[key] === null) delete source[key];
  for (const key of [
    'downstream_tls_certificate_expiration_timestamps',
    'waf_exclusion_rules',
    'dns_info',
    'internet_vip_info',
  ])
    if (Array.isArray(source[key]) && source[key].length === 0) delete source[key];
  if (source.host_name === '') delete source.host_name;
  const placements = source.advertise_custom?.advertise_where;
  if (Array.isArray(placements))
    for (const placement of placements) {
      const site = placement?.site;
      if (site?.ipv6 === '') delete site.ipv6;
    }
  const result = projectReplaceSnapshot(source, schemas, 'viewshttp_loadbalancerCreateSpecType', [
    'state',
    'auto_cert_info',
    'cert_state',
  ]);
  validate(result);
  const omitEmpty = (value, keys) => {
    for (const key of keys) {
      const item = value[key];
      if (item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 0) delete value[key];
    }
  };
  omitEmpty(result, [
    'service_policies_from_namespace',
    'disable_trust_client_ip_headers',
    'disable_malicious_user_detection',
    'default_sensitive_data_policy',
    'disable_threat_mesh',
    'disable_malware_protection',
  ]);
  if (result.l7_ddos_protection)
    omitEmpty(result.l7_ddos_protection, [
      'mitigation_block',
      'default_rps_threshold',
      'clientside_action_none',
      'ddos_policy_none',
    ]);
  if (Array.isArray(result.default_route_pools))
    for (const pool of result.default_route_pools) omitEmpty(pool, ['endpoint_subsets']);
  return result;
}
function buildInsideHttpListener(input, validate) {
  const name = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const domain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (
    !input ||
    ![input.name, input.namespace, input.originPool?.name, input.originPool?.namespace].every(
      (value) => typeof value === 'string' && name.test(value),
    ) ||
    typeof input.domain !== 'string' ||
    input.domain.length > 253 ||
    !domain.test(input.domain) ||
    !Number.isInteger(input.port) ||
    input.port < 1 ||
    input.port > 65535 ||
    !Array.isArray(input.sites) ||
    input.sites.length < 1 ||
    input.sites.length > 32
  )
    throw new Error('Invalid inside HTTP listener identity or topology');
  const names = new Set();
  const addresses = new Set();
  const advertiseWhere = input.sites.map((site) => {
    if (
      !site ||
      typeof site.name !== 'string' ||
      !name.test(site.name) ||
      typeof site.insideAddress !== 'string' ||
      isIP5(site.insideAddress) !== 4 ||
      names.has(site.name) ||
      addresses.has(site.insideAddress)
    )
      throw new Error('Invalid or ambiguous inside HTTP listener placement');
    names.add(site.name);
    addresses.add(site.insideAddress);
    return {
      site: {
        site: { name: site.name, namespace: 'system' },
        ip: site.insideAddress,
        network: 'SITE_NETWORK_INSIDE',
      },
      use_default_port: {},
    };
  });
  const spec = {
    domains: [input.domain],
    http: { port: input.port },
    advertise_custom: { advertise_where: advertiseWhere },
    default_route_pools: [
      {
        pool: { name: input.originPool.name, namespace: input.originPool.namespace },
        weight: 1,
        priority: 1,
      },
    ],
    round_robin: {},
    no_challenge: {},
    user_id_client_ip: {},
    disable_waf: {},
    disable_rate_limit: {},
    disable_api_discovery: {},
    disable_api_testing: {},
    disable_api_definition: {},
    l7_ddos_protection: {},
  };
  validate(spec);
  return {
    metadata: { name: input.name, namespace: input.namespace },
    spec,
    evidence: { listener: 'unknown', routes: 'unknown', traffic: 'unknown' },
  };
}
var init_wire_ingress = () => {};

// plugins/platform/src/ce/wire-origin.ts
import { isIP as isIP6 } from 'node:net';

function projectSiteLocalHttpOrigin(spec, schemas, validate) {
  const result = projectReplaceSnapshot(spec, schemas, 'viewsorigin_poolCreateSpecType');
  for (const key of ['advanced_options', 'upstream_conn_pool_reuse_type']) {
    const value = result[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
      delete result[key];
  }
  if (Array.isArray(result.healthcheck) && result.healthcheck.length === 0) delete result.healthcheck;
  if (Array.isArray(result.origin_servers))
    for (const server of result.origin_servers) {
      if (!server || typeof server !== 'object' || Array.isArray(server)) continue;
      const privateIp = server.private_ip;
      if (!privateIp || typeof privateIp !== 'object' || Array.isArray(privateIp)) continue;
      const snat = privateIp.snat_pool;
      if (snat && typeof snat === 'object' && !Array.isArray(snat) && Object.keys(snat).length === 0)
        delete privateIp.snat_pool;
    }
  validate(result);
  return result;
}
function buildSiteLocalHttpOrigin(input, validate) {
  const name = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (
    !input ||
    Object.keys(input).sort().join(',') !== 'name,namespace,originAddress,port,siteNames' ||
    ![input.name, input.namespace].every((value) => typeof value === 'string' && name.test(value)) ||
    typeof input.originAddress !== 'string' ||
    isIP6(input.originAddress) !== 4 ||
    !Number.isInteger(input.port) ||
    input.port < 1 ||
    input.port > 65535 ||
    !Array.isArray(input.siteNames) ||
    input.siteNames.length < 1 ||
    input.siteNames.length > 32 ||
    new Set(input.siteNames).size !== input.siteNames.length ||
    input.siteNames.some((value) => typeof value !== 'string' || !name.test(value))
  )
    throw new Error('Explicit HTTP origin and distinct site identities are required');
  const spec = {
    port: input.port,
    origin_servers: input.siteNames.map((siteName) => ({
      labels: {},
      private_ip: {
        ip: input.originAddress,
        inside_network: {},
        site_locator: { site: { name: siteName, namespace: 'system' } },
      },
    })),
    no_tls: {},
    loadbalancer_algorithm: 'ROUND_ROBIN',
    endpoint_selection: 'LOCAL_PREFERRED',
  };
  validate(spec);
  return {
    metadata: { name: input.name, namespace: input.namespace },
    spec,
    evidence: { origin: 'unknown', traffic: 'unknown' },
  };
}
var init_wire_origin = () => {};

// plugins/platform/src/ce/ingress-contract.ts
function object5(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed ingress contract');
  return value;
}

class VerifiedIngressContract {
  identity = 'f5xc-ce-http-ingress-api/v1';
  publication = 'immutable-release';
  releaseTag = CE_API_RELEASE.tag;
  commit = CE_API_RELEASE.commit;
  fingerprint = CE_API_RELEASE.fingerprint;
  #validate;
  #validateOrigin;
  #schemas;
  constructor(schemas) {
    this.#schemas = schemas;
    this.#validate = createWireValidator(schemas, 'viewshttp_loadbalancerCreateSpecType');
    this.#validateOrigin = createWireValidator(schemas, 'viewsorigin_poolCreateSpecType');
  }
  static async release(fetcher = fetch, signal) {
    const api = await loadPublishedCeApi(fetcher, signal);
    const path = object5(object5(api.paths)['/api/config/namespaces/{metadata.namespace}/http_loadbalancers']);
    const schema = object5(
      object5(object5(object5(object5(path.post).requestBody).content)['application/json']).schema,
    );
    if (schema.$ref !== '#/components/schemas/http_loadbalancerCreateRequest')
      throw new Error('Unsupported ingress request path');
    const origin = object5(object5(api.paths)['/api/config/namespaces/{metadata.namespace}/origin_pools']);
    const originSchema = object5(
      object5(object5(object5(object5(origin.post).requestBody).content)['application/json']).schema,
    );
    if (originSchema.$ref !== '#/components/schemas/origin_poolCreateRequest')
      throw new Error('Unsupported origin request path');
    return new VerifiedIngressContract(object5(object5(api.components).schemas));
  }
  build(input) {
    return buildInsideHttpListener(input, this.#validate);
  }
  buildOrigin(input) {
    return buildSiteLocalHttpOrigin(input, this.#validateOrigin);
  }
  projectObserved(spec) {
    return projectInsideHttpListener(spec, this.#schemas, this.#validate);
  }
  projectOriginObserved(spec) {
    return projectSiteLocalHttpOrigin(spec, this.#schemas, this.#validateOrigin);
  }
}
var init_ingress_contract = __esm(() => {
  init_verified_api_release();
  init_wire_ingress();
  init_wire_origin();
  init_wire_schema();
});

// plugins/platform/src/ce/wire-upgrade.ts
function buildSiteUpgradeRequest(input, validate) {
  if (
    !input ||
    Object.keys(input).some((key) => !['siteName', 'kind', 'version'].includes(key)) ||
    typeof input.siteName !== 'string' ||
    !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(input.siteName) ||
    !['software', 'os'].includes(input.kind) ||
    typeof input.version !== 'string' ||
    !(input.kind === 'software' ? /^crt-\d{8}-\d{4}$/ : /^\d+\.\d{4}\.\d+$/).test(input.version)
  )
    throw new Error('An upgrade requires an exact site, operation and version');
  const body = { namespace: 'system', name: input.siteName, version: input.version, force: false };
  validate(body);
  return {
    method: 'POST',
    path: `/api/config/namespaces/system/sites/${input.siteName}/upgrade_${input.kind === 'software' ? 'sw' : 'os'}`,
    body,
  };
}

// plugins/platform/src/ce/upgrade-transition.ts
function matchesVersionIdentity(expected, observation) {
  if (observation.status !== 'observed') return false;
  const { binding } = expected;
  if (
    typeof expected.siteUid !== 'string' ||
    !expected.siteUid.trim() ||
    typeof expected.physicalSiteUid !== 'string' ||
    !expected.physicalSiteUid.trim() ||
    observation.siteUid !== expected.siteUid ||
    observation.physicalSiteUid !== expected.physicalSiteUid ||
    observation.siteName !== binding.siteName ||
    observation.source !== `/api/config/namespaces/system/sites/${binding.siteName}` ||
    !Array.isArray(binding.nodes) ||
    !binding.nodes.length ||
    binding.nodes.some((node) => typeof node !== 'string' || !node.trim()) ||
    !['native', 'terraform'].includes(binding.owner.engine) ||
    !['aws', 'azure'].includes(binding.owner.provider) ||
    new Set(binding.nodes).size !== binding.nodes.length ||
    !same(observation.nodes, binding.nodes) ||
    ['deploymentId', 'engine', 'provider', 'account', 'region'].some(
      (key) =>
        typeof binding.owner[key] !== 'string' ||
        !binding.owner[key].trim() ||
        observation.owner[key] !== binding.owner[key],
    ) ||
    !['contractFingerprint', 'siteContractFingerprint'].every(
      (key) => /^sha256:[a-f0-9]{64}$/.test(expected[key]) && observation[key] === expected[key],
    )
  )
    return false;
  const start = Date.parse(observation.startedAt),
    end = Date.parse(observation.observedAt),
    now = Date.now();
  if (![start, end].every(Number.isFinite) || start > end || end > now || now - start > 60000) return false;
  if (new Date(start).toISOString() !== observation.startedAt || new Date(end).toISOString() !== observation.observedAt)
    return false;
  if (observation.online !== (observation.siteState === 'ONLINE')) return false;
  initialSoftwareSettings({ software: observation.software.installed, os: observation.os.installed });
  return true;
}
function stableCeSiteVersions(expected, observation) {
  try {
    if (
      !matchesVersionIdentity(expected, observation) ||
      !observation.online ||
      observation.software.phase !== 'UPGRADE_COMPLETED' ||
      observation.os.phase !== 'UPGRADE_COMPLETED' ||
      observation.progress.status !== 'COMPLETED' ||
      observation.progress.version !== observation.software.installed ||
      observation.targetSoftware !== observation.software.installed
    )
      return;
    return { software: observation.software.installed, os: observation.os.installed };
  } catch {
    return;
  }
}
function assessCeUpgradeTransition(expected, observation) {
  try {
    initialSoftwareSettings(expected.before);
    if (Object.keys(expected.target).sort().join(',') !== 'kind,version') return 'unknown';
    buildSiteUpgradeRequest({ siteName: expected.binding.siteName, ...expected.target }, () => {});
    const kind = expected.target.kind,
      other = kind === 'software' ? 'os' : 'software';
    if (expected.target.version === expected.before[kind]) return 'unknown';
    if (!matchesVersionIdentity(expected, observation)) return 'unknown';
    const targetSoftware = kind === 'software' ? expected.target.version : expected.before.software;
    if (observation.targetSoftware !== targetSoftware) return 'unknown';
    const selected = observation[kind],
      unchanged = observation[other];
    if (unchanged.installed !== expected.before[other] || unchanged.phase !== 'UPGRADE_COMPLETED') return 'unknown';
    if (![expected.before[kind], expected.target.version].includes(selected.installed)) return 'unknown';
    if (observation.siteState === 'FAILED' || selected.phase === 'UPGRADE_FAILED') return 'failed';
    if (
      kind === 'software' &&
      observation.progress.version === expected.target.version &&
      observation.progress.status === 'FAILED'
    )
      return 'failed';
    if (
      selected.installed === expected.target.version &&
      selected.phase === 'UPGRADE_COMPLETED' &&
      observation.online
    ) {
      if (
        kind === 'software' &&
        (observation.progress.version !== expected.target.version || observation.progress.status !== 'COMPLETED')
      )
        return 'unknown';
      return 'versions-complete';
    }
    if (
      ['UPGRADE_TRIGGERED', 'UPGRADE_IN_PROGRESS'].includes(selected.phase) &&
      ['ONLINE', 'UPGRADING'].includes(observation.siteState)
    ) {
      if (
        kind === 'software' &&
        (observation.progress.version !== expected.target.version ||
          !['SCHEDULED', 'IN_PROGRESS'].includes(observation.progress.status))
      )
        return 'unknown';
      return 'converging';
    }
    if (selected.installed !== expected.before[kind] || selected.phase !== 'UPGRADE_COMPLETED' || !observation.online)
      return 'unknown';
    if (observation.progress.version !== expected.before.software || observation.progress.status !== 'COMPLETED')
      return 'unknown';
    const prechecks = parseUpgradePrechecks({
      checklist: observation.prechecks.checks.map((check) => ({ item: check.name, status: check.status })),
    });
    if (!prechecks.passing) return 'unknown';
    const targets = parseSoftwareTargets({ sw_versions: observation.targets });
    if (
      kind === 'software' ? !targets.includes(expected.target.version) : selected.available !== expected.target.version
    )
      return 'unknown';
    return 'ready';
  } catch {
    return 'unknown';
  }
}
var same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
var init_upgrade_transition = __esm(() => {
  init_upgrade_evidence();
});

// plugins/platform/src/ce/replacement-versions.ts
async function captureCeReplacementVersions(binding, siteUid, siteContractFingerprint, runtime, contract, signal) {
  binding = structuredClone(binding);
  const observation = await runtime.observeUpgrade(binding, contract, undefined, signal);
  if (observation.status !== 'observed') throw new Error('Replacement version evidence is unavailable');
  const identity = {
    binding,
    siteUid,
    physicalSiteUid: observation.physicalSiteUid,
    siteContractFingerprint,
    contractFingerprint: contract.fingerprint,
  };
  const versions = stableCeSiteVersions(identity, observation);
  if (!versions) throw new Error('Replacement site identity or effective versions are not stable');
  return { schemaVersion: 1, identity, versions };
}
async function verifyCeReplacementVersions(snapshot, runtime, contract, signal) {
  snapshot = structuredClone(snapshot);
  if (snapshot.schemaVersion !== 1 || snapshot.identity.contractFingerprint !== contract.fingerprint)
    throw new Error('Replacement version snapshot or published contract differs');
  initialSoftwareSettings(snapshot.versions);
  const observation = await runtime.observeUpgrade(snapshot.identity.binding, contract, undefined, signal);
  const current = stableCeSiteVersions(snapshot.identity, observation);
  if (!current || current.software !== snapshot.versions.software || current.os !== snapshot.versions.os)
    throw new Error('Replacement site identity or effective versions changed before mutation');
}
var init_replacement_versions = __esm(() => {
  init_upgrade_transition();
});

// plugins/platform/src/ce/upgrade-contract.ts
function object6(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed upgrade contract');
  return value;
}

class VerifiedUpgradeContract {
  identity = 'f5xc-ce-upgrade-api/v1';
  publication = 'immutable-release';
  releaseTag = CE_API_RELEASE.tag;
  commit = CE_API_RELEASE.commit;
  fingerprint = CE_API_RELEASE.fingerprint;
  #software;
  #os;
  constructor(schemas) {
    this.#software = createWireValidator(schemas, 'siteUpgradeSWRequest');
    this.#os = createWireValidator(schemas, 'siteUpgradeOSRequest');
  }
  static async release(fetcher = fetch, signal) {
    const api = await loadPublishedCeApi(fetcher, signal);
    const paths = object6(api.paths);
    for (const [path, method, schemaName] of Object.values(routes)) {
      const operation = object6(object6(paths[path])[method]);
      const container =
        method === 'post' ? object6(operation.requestBody) : object6(object6(operation.responses)['200']);
      const schema = object6(object6(object6(container.content)['application/json']).schema);
      if (schema.$ref !== `#/components/schemas/${schemaName}`) throw new Error('Upgrade API path or schema differs');
    }
    return new VerifiedUpgradeContract(object6(object6(api.components).schemas));
  }
  observationPaths(siteName, current, targetSoftware) {
    initialSoftwareSettings(current);
    this.build({ siteName, kind: 'software', version: targetSoftware });
    return {
      site: `/api/config/namespaces/system/sites/${siteName}`,
      targets: `/api/maurice/upgradable_sw_versions?${new URLSearchParams({ current_os_version: current.os, current_sw_version: current.software })}`,
      precheck: `/api/maurice/namespaces/system/sites/${siteName}/pre_upgrade_check?${new URLSearchParams({ sw_version: targetSoftware })}`,
      progress: `/api/maurice/namespaces/system/sites/${siteName}/upgrade_status`,
    };
  }
  build(input) {
    return buildSiteUpgradeRequest(input, input.kind === 'software' ? this.#software : this.#os);
  }
}
var routes;
var init_upgrade_contract = __esm(() => {
  init_verified_api_release();
  init_wire_schema();
  routes = {
    software: ['/api/config/namespaces/{namespace}/sites/{name}/upgrade_sw', 'post', 'siteUpgradeSWRequest'],
    os: ['/api/config/namespaces/{namespace}/sites/{name}/upgrade_os', 'post', 'siteUpgradeOSRequest'],
    site: ['/api/config/namespaces/{namespace}/sites/{name}', 'get', 'siteGetResponse'],
    targets: ['/api/maurice/upgradable_sw_versions', 'get', 'upgrade_statusGetUpgradableSWVersionsResponse'],
    precheck: [
      '/api/maurice/namespaces/{namespace}/sites/{name}/pre_upgrade_check',
      'get',
      'upgrade_statusPreUpgradeCheckResponse',
    ],
    progress: [
      '/api/maurice/namespaces/{namespace}/sites/{name}/upgrade_status',
      'get',
      'upgrade_statusGetUpgradeStatusResponse',
    ],
  };
});

// plugins/aws/src/ce/attachment-gate.ts
async function assertAttachmentAvailable(action, plan, checkpoint, api) {
  const reference = action.resourceId ?? '';
  const id = checkpoint.resolvedValues[reference] ?? reference;
  if (!/^tgw-attach-[0-9a-f]{8,21}$/.test(id)) throw new Error('Attachment identity is unresolved');
  const connect = reference.startsWith('__TGW_CONNECT_ATTACHMENT_');
  const result = await api.exec('aws', [
    'ec2',
    connect ? 'describe-transit-gateway-connects' : 'describe-transit-gateway-vpc-attachments',
    '--transit-gateway-attachment-ids',
    id,
    '--region',
    plan.region,
    '--output',
    'json',
  ]);
  if (result.exitCode !== 0) throw new Error('Attachment observation unavailable');
  let raw;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    throw new Error('Malformed attachment observation');
  }
  if (!raw || raw.NextToken) throw new Error('Incomplete attachment observation');
  const entries = raw[connect ? 'TransitGatewayConnects' : 'TransitGatewayVpcAttachments'];
  if (!Array.isArray(entries) || entries.length !== 1)
    throw new Error('Attachment observation is missing or ambiguous');
  const item = entries[0];
  if (!item || item.TransitGatewayAttachmentId !== id || item.TransitGatewayId !== plan.intent.routing.transitGatewayId)
    throw new Error('Attachment scope does not match the deployment');
  if (connect) {
    const transport =
      plan.intent.routing.transportAttachmentId ?? checkpoint.resolvedValues.__TGW_TRANSPORT_ATTACHMENT__;
    if (!transport || item.TransportTransitGatewayAttachmentId !== transport || item.Options?.Protocol !== 'gre')
      throw new Error('Connect transport identity or protocol does not match');
  } else if (
    !(plan.intent.vpc.vpcId ?? checkpoint.resolvedValues.__VPC_ID__) ||
    item.VpcId !== (plan.intent.vpc.vpcId ?? checkpoint.resolvedValues.__VPC_ID__) ||
    item.VpcOwnerId !== plan.accountId
  )
    throw new Error('Transport VPC identity or owner does not match');
  if (id !== plan.intent.routing.transportAttachmentId) {
    if (!Array.isArray(item.Tags)) throw new Error('Attachment ownership evidence unavailable');
    const tags = new Map();
    for (const tag of item.Tags) {
      if (!tag || typeof tag.Key !== 'string' || typeof tag.Value !== 'string' || tags.has(tag.Key))
        throw new Error('Malformed attachment ownership evidence');
      tags.set(tag.Key, tag.Value);
    }
    if (
      tags.get('xcsh-managed-by') !== 'aws-ce' ||
      tags.get('xcsh-deployment-id') !== plan.deploymentName ||
      tags.get('xcsh-execution-engine') !== plan.engine
    )
      throw new Error('Attachment belongs to another deployment or engine');
  }
  if (item.State === 'available') return;
  if (['pending', 'modifying', 'initiating'].includes(item.State)) throw new Error('Attachment has not converged');
  throw new Error('Attachment is in an unsupported or terminal state');
}

// plugins/aws/src/ce/cloud-init.ts
function renderAwsCeCloudInit(input) {
  if (!/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(input.nodeName)) throw new Error('Cloud-init node name is invalid');
  let parsed;
  try {
    parsed = Bun.YAML.parse(input.material);
  } catch {
    throw new Error('Issued cloud-init material is malformed');
  }
  if (
    !input.material.startsWith('#cloud-config') ||
    !parsed ||
    !Array.isArray(parsed.write_files) ||
    parsed.write_files.some((file) => file.path === '/etc/vpm/config.yaml') ||
    !parsed.write_files.some((file) => file.path === '/etc/vpm/user_data')
  )
    throw new Error('Verified issued cloud-init material is required');
  if (['hostname', 'fqdn', 'preserve_hostname'].some((key) => Object.hasOwn(parsed, key)))
    throw new Error('Issued cloud-init contains an unresolved hostname policy');
  return `${input.material.trimEnd()}
hostname: ${input.nodeName}
fqdn: ${input.nodeName}
preserve_hostname: false
`;
}
function analyzeAwsCloudInit(body, sensitiveValues = []) {
  const redacted = sensitiveValues.reduce(
    (value, secret) => (secret ? value.replaceAll(secret, '[redacted]') : value),
    body,
  );
  const controls = Array.from(redacted).some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
  });
  return {
    valid: redacted.startsWith('#cloud-config') && !controls,
    stages: ['init-local', 'init-network', 'config', 'final'],
    hasWriteFiles: /^write_files:/m.test(redacted),
    hasRunCmd: /^runcmd:/m.test(redacted),
    sha256: new Bun.CryptoHasher('sha256').update(redacted).digest('hex'),
  };
}

// plugins/aws/src/ce/delete-recovery.ts
function hasDeleteRecovery(action) {
  return (
    ['resource-delete', 'route-table-disassociate', 'internet-gateway-detach'].includes(action.kind) &&
    action.command === 'aws' &&
    !!action.resourceId
  );
}
function instanceTerminated(state) {
  const reservations = Array.isArray(state.Reservations) ? state.Reservations : [];
  const instances = reservations.flatMap((row) =>
    row && typeof row === 'object' && Array.isArray(row.Instances) ? row.Instances : [],
  );
  return (
    instances.length === 1 &&
    instances[0] !== null &&
    typeof instances[0] === 'object' &&
    instances[0].State?.Name === 'terminated'
  );
}
function mutationConverged(action, state) {
  if (action.kind === 'resource-delete') return false;
  const args = action.args ?? [];
  if (action.kind === 'route-table-disassociate') {
    const associationId = args[args.indexOf('--association-id') + 1];
    const tables = Array.isArray(state.RouteTables) ? state.RouteTables : [];
    const associations = Array.isArray(tables[0]?.Associations) ? tables[0].Associations : [];
    return (
      /^rtbassoc-[0-9a-f]{8,21}$/.test(associationId ?? '') &&
      !associations.some((row) => row.RouteTableAssociationId === associationId)
    );
  }
  const vpcId = args[args.indexOf('--vpc-id') + 1];
  const gateways = Array.isArray(state.InternetGateways) ? state.InternetGateways : [];
  const attachments = Array.isArray(gateways[0]?.Attachments) ? gateways[0].Attachments : [];
  return /^vpc-[0-9a-f]{8,21}$/.test(vpcId ?? '') && !attachments.some((row) => row.VpcId === vpcId);
}
async function executeRecoverableDelete(api, plan, action, args, checkpoint, persist, ownershipPlanSha256s, signal) {
  if (!hasDeleteRecovery(action) || !action.resourceId) throw new Error('AWS delete recovery driver is unavailable');
  const requestSha256 = canonicalSha256({
    plan: plan.planSha256,
    action: action.id,
    resourceId: action.resourceId,
    args,
  });
  const pending = checkpoint.pendingDelete;
  if (
    pending &&
    (pending.actionId !== action.id ||
      pending.resourceId !== action.resourceId ||
      pending.requestSha256 !== requestSha256)
  )
    throw new Error('Pending AWS deletion differs from the immutable request');
  let submitted = false;
  if (!pending) {
    checkpoint.pendingDelete = { actionId: action.id, resourceId: action.resourceId, requestSha256 };
    try {
      await persist();
    } catch (error) {
      checkpoint.pendingDelete = undefined;
      throw error;
    }
    try {
      const result = await api.exec('aws', args, { signal });
      if (result.exitCode !== 0) {
        checkpoint.pendingDelete = undefined;
        await persist();
        return result;
      }
      submitted = true;
    } catch {
      signal?.throwIfAborted();
    }
  }
  const deadline = Date.now() + 15 * 60000;
  while (true) {
    signal?.throwIfAborted();
    const observations = await observeAwsResources(api, [action.resourceId], plan.region, {
      deploymentName: plan.deploymentName,
      planSha256s: [...new Set(ownershipPlanSha256s)].sort(),
    });
    const observation = observations[0];
    if (!observation) throw new Error('AWS deletion observation is unavailable');
    if (
      !observation.exists ||
      (action.kind === 'resource-delete' &&
        action.resourceId.startsWith('i-') &&
        instanceTerminated(observation.state)) ||
      mutationConverged(action, observation.state)
    )
      return { exitCode: 0, stdout: '{}', stderr: '' };
    if (!observation.owned) throw new Error('AWS deletion target ownership changed during reconciliation');
    if (!submitted || Date.now() >= deadline)
      throw new Error('AWS deletion has not converged; resume with the same plan');
    await new Promise((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(new Error('AWS deletion convergence cancelled'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, 1e4);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
}
async function collectAwsNativeCloudRetirement(api, plan, ownershipPlanSha256s) {
  const ids = plan.ownershipInventory
    .filter((row) => row.owned && row.action === 'delete')
    .map((row) => row.resourceId);
  if (!ids.length) throw new Error('Native cloud retirement inventory is empty');
  const observations = await observeAwsResources(api, ids, plan.region, {
    deploymentName: plan.deploymentName,
    planSha256s: ownershipPlanSha256s,
  });
  const remaining = observations.filter(
    (row) => row.exists && !(row.id.startsWith('i-') && instanceTerminated(row.state)),
  );
  return {
    status: remaining.length ? 'pending' : 'absent',
    expected: ids.length,
    retired: ids.length - remaining.length,
    observedAt: new Date().toISOString(),
  };
}
var init_delete_recovery = __esm(() => {
  init_canonical();
  init_discovery();
});

// plugins/aws/src/ce/eip-association.ts
async function associateAwsCeEip(api, plan, args, signal) {
  const allocation = args[args.indexOf('--allocation-id') + 1];
  const eni = args[args.indexOf('--network-interface-id') + 1];
  if (
    !/^eipalloc-[0-9a-f]{8,17}$/.test(allocation) ||
    !/^eni-[0-9a-f]{8,17}$/.test(eni) ||
    args[1] !== 'associate-address' ||
    args.includes('--allow-reassociation')
  )
    throw new Error('Explicit non-remapping CE association is required');
  const observe = async () => {
    const result = await api.exec(
      'aws',
      ['ec2', 'describe-addresses', '--allocation-ids', allocation, '--region', plan.region, '--output', 'json'],
      { signal },
    );
    if (result.exitCode) throw new Error('CE EIP association observation is unavailable');
    const data = JSON.parse(result.stdout);
    if (data.NextToken || !Array.isArray(data.Addresses) || data.Addresses.length !== 1)
      throw new Error('Incomplete CE EIP observation');
    const address = data.Addresses[0];
    const tags = Object.fromEntries((address.Tags ?? []).map((tag) => [tag.Key, tag.Value]));
    if (
      address.AllocationId !== allocation ||
      tags['xcsh-managed-by'] !== 'aws-ce' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      tags['xcsh-execution-engine'] !== plan.engine ||
      tags['xcsh-plan-sha256'] !== plan.planSha256
    )
      throw new Error('CE EIP ownership differs from the deployment');
    if (
      address.AssociationId &&
      (!/^eipassoc-[0-9a-f]{8,17}$/.test(address.AssociationId) || address.NetworkInterfaceId !== eni)
    )
      throw new Error('CE EIP is associated with another target');
    return address.AssociationId;
  };
  let association = await observe();
  if (!association) {
    try {
      await api.exec('aws', [...args, '--no-allow-reassociation'], { signal });
    } catch {
      signal?.throwIfAborted();
    }
    association = await observe();
    if (!association) throw new Error('CE EIP association has not converged; reconcile before retrying');
  }
  return { exitCode: 0, stdout: JSON.stringify({ AssociationId: association }), stderr: '' };
}

// plugins/aws/src/ce/native-routing-checkpoint.ts
function compileAwsNativeRoutingCheckpoint(plan, checkpoint, owner) {
  verifyAwsCePlan(plan);
  if (
    plan.engine !== 'native' ||
    plan.routing.profile !== 'tgw-connect' ||
    checkpoint.schemaVersion !== 2 ||
    checkpoint.engine !== 'native' ||
    checkpoint.planId !== plan.planId ||
    checkpoint.planSha256 !== plan.planSha256 ||
    owner.engine !== 'native' ||
    owner.provider !== 'aws' ||
    owner.deploymentId !== plan.deploymentName ||
    owner.account !== plan.accountId ||
    owner.region !== plan.region
  )
    throw new Error('Native routing checkpoint source or ownership differs');
  const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  if (!actions.length) throw new Error('Native routing checkpoint has no Connect topology');
  const resources = siteBindings(plan)
    .flatMap(({ site }) => {
      const connectors = actions
        .filter((action) => site.nodeIndexes.includes(action.node ?? 0))
        .map((action) => ({
          siteName: site.name,
          kind: 'external_connector',
          name: `${plan.deploymentName.slice(0, 24)}-gre-${actions.indexOf(action) + 1}`,
        }));
      if (!connectors.length) throw new Error('Native routing checkpoint site has no Connect peers');
      return [
        ...connectors,
        {
          siteName: site.name,
          kind: 'bgp_routing_policy',
          name: `${site.name.slice(0, 43)}-tgw-export-policy`,
        },
        { siteName: site.name, kind: 'bgp', name: `${site.name.slice(0, 55)}-tgw-bgp` },
      ];
    })
    .map((resource) => {
      const uid = checkpoint.resolvedValues[`__XC_ROUTING_${resource.name}__`];
      if (typeof uid !== 'string' || !uid.trim()) throw new Error('Native routing checkpoint UID is missing');
      return { ...resource, uid };
    });
  if (new Set(resources.map((resource) => resource.uid)).size !== resources.length)
    throw new Error('Native routing checkpoint UIDs are duplicated');
  return {
    schemaVersion: 2,
    engine: 'native',
    planId: plan.planId,
    planSha256: plan.planSha256,
    ownerSha256: canonicalSha256(owner),
    resources,
  };
}
async function persistAwsNativeRoutingCheckpoint(plan, checkpoint, storage) {
  await storage.verify();
  const result = compileAwsNativeRoutingCheckpoint(plan, checkpoint, storage.owner);
  await storage.write('native-routing-checkpoint.json', result);
  return result;
}
var init_native_routing_checkpoint = __esm(() => {
  init_artifacts();
  init_canonical();
});

// plugins/aws/src/ce/network-health.ts
import { isIP as isIP7 } from 'node:net';

function object7(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed network evidence');
  return value;
}
async function read(api, args, region) {
  const result = await api.exec('aws', [...args, '--region', region, '--output', 'json']);
  if (result.exitCode !== 0) throw new Error('Network observation unavailable');
  const raw = object7(JSON.parse(result.stdout));
  if (['NextToken', 'NextMarker'].some((key) => Object.hasOwn(raw, key)))
    throw new Error('Incomplete network evidence');
  return raw;
}
async function collectPlannedVpcRoutes(plan, checkpoint, api) {
  const values = checkpoint?.resolvedValues ?? {};
  const resolve = (value) => (value?.startsWith('__') ? values[value] : value);
  const arg = (args, flag) => {
    const index = args?.indexOf(flag) ?? -1;
    return index < 0 ? undefined : resolve(args?.[index + 1]);
  };
  const actions = plan.actions.filter(
    (action) => action.command === 'aws' && ['route-create', 'route-replace'].includes(action.kind),
  );
  const targetFlags = {
    '--network-interface-id': 'NetworkInterfaceId',
    '--transit-gateway-id': 'TransitGatewayId',
    '--gateway-id': 'GatewayId',
    '--nat-gateway-id': 'NatGatewayId',
  };
  const expected = actions.map((action) => {
    const flags = Object.entries(targetFlags).filter(([flag]) => action.args?.includes(flag));
    const tableId = arg(action.args, '--route-table-id');
    const destination = arg(action.args, '--destination-cidr-block');
    if (
      flags.length !== 1 ||
      !/^rtb-[0-9a-f]{8,21}$/.test(tableId ?? '') ||
      !destination ||
      !arg(action.args, flags[0][0])
    )
      throw new Error('Planned VPC route identity is incomplete');
    return {
      tableId,
      destination,
      field: flags[0][1],
      target: arg(action.args, flags[0][0]),
    };
  });
  const observations = [];
  for (const tableId of [...new Set(expected.map((route) => route.tableId))]) {
    const response = await read(api, ['ec2', 'describe-route-tables', '--route-table-ids', tableId], plan.region);
    if (!Array.isArray(response.RouteTables) || response.RouteTables.length !== 1)
      throw new Error('Missing VPC route table evidence');
    const table = object7(response.RouteTables[0]);
    const vpcId = plan.intent.vpc.vpcId ?? values.__VPC_ID__;
    if (table.RouteTableId !== tableId || !vpcId || table.VpcId !== vpcId || !Array.isArray(table.Routes))
      throw new Error('VPC route table scope or response is incomplete');
    for (const route of expected.filter((route) => route.tableId === tableId)) {
      const matches = table.Routes.map(object7).filter((row) => row.DestinationCidrBlock === route.destination);
      if (matches.length > 1) throw new Error('Ambiguous VPC route evidence');
      observations.push({
        tableId,
        destination: route.destination,
        targetField: route.field,
        expectedTarget: route.target,
        observedTarget: matches[0]?.[route.field] ?? null,
        state: matches[0]?.State ?? 'missing',
        status: matches[0]?.[route.field] === route.target && matches[0]?.State === 'active' ? 'healthy' : 'degraded',
      });
    }
    for (const association of plan.actions.filter(
      (action) => action.kind === 'route-table-associate' && arg(action.args, '--route-table-id') === tableId,
    )) {
      if (!Array.isArray(table.Associations)) throw new Error('Missing subnet route association evidence');
      const subnet = arg(association.args, '--subnet-id');
      const matches = table.Associations.map(object7).filter((row) => row.SubnetId === subnet);
      if (!subnet || matches.length > 1) throw new Error('Ambiguous subnet route association evidence');
      const state = matches.length ? object7(matches[0].AssociationState).State : 'missing';
      observations.push({ tableId, subnetId: subnet, state, status: state === 'associated' ? 'healthy' : 'degraded' });
    }
  }
  return {
    source: 'aws:describe-route-tables',
    observedAt: new Date().toISOString(),
    observations,
    status: !expected.length
      ? 'not-requested'
      : observations.every((row) => row.status === 'healthy')
        ? 'healthy'
        : 'degraded',
    traffic: 'unknown',
  };
}
function owned(value, plan) {
  if (!Array.isArray(value)) return false;
  const tags = new Map();
  for (const item of value) {
    const tag = object7(item);
    if (typeof tag.Key !== 'string' || typeof tag.Value !== 'string' || tags.has(tag.Key)) return false;
    tags.set(tag.Key, tag.Value);
  }
  return (
    tags.get('xcsh-managed-by') === 'aws-ce' &&
    tags.get('xcsh-deployment-id') === plan.deploymentName &&
    tags.get('xcsh-execution-engine') === plan.engine
  );
}
async function collectAwsNetworkHealth(kind, plan, checkpoint, api, signal) {
  const binding = {
    deploymentId: plan.deploymentName,
    siteName: plan.siteName,
    engine: plan.engine,
    accountId: plan.accountId,
    region: plan.region,
    observedAt: new Date().toISOString(),
    source: 'aws-cli-live',
  };
  try {
    signal?.throwIfAborted();
    const identity = await read(api, ['sts', 'get-caller-identity'], plan.region);
    if (identity.Account !== plan.accountId) throw new Error('Network observation account differs');
    const values = checkpoint?.resolvedValues ?? {};
    if (kind === 'bgp') {
      if (!Number.isInteger(plan.routing.customerAsn) || !Number.isInteger(plan.routing.transitGatewayAsn))
        throw new Error('Missing expected ASNs');
      const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
      const ids = actions.map((action) => values[action.capture?.placeholder ?? '']);
      if (
        !ids.length ||
        ids.some((id) => !/^tgw-connect-peer-[0-9a-f]{8,21}$/.test(id ?? '')) ||
        new Set(ids).size !== ids.length
      )
        throw new Error('Missing peer identities');
      const raw = await read(
        api,
        ['ec2', 'describe-transit-gateway-connect-peers', '--transit-gateway-connect-peer-ids', ...ids],
        plan.region,
      );
      if (!Array.isArray(raw.TransitGatewayConnectPeers) || raw.TransitGatewayConnectPeers.length !== ids.length)
        throw new Error('Missing peer evidence');
      const seen = new Set();
      const sessions = [];
      const transports = [];
      let available = true;
      for (const value of raw.TransitGatewayConnectPeers) {
        const peer = object7(value);
        const id = String(peer.TransitGatewayConnectPeerId);
        const action = actions[ids.indexOf(id)];
        const attachmentArgument = action?.args?.includes('--transit-gateway-attachment-id')
          ? action.args[action.args.indexOf('--transit-gateway-attachment-id') + 1]
          : undefined;
        const expectedAttachment = attachmentArgument?.startsWith('__')
          ? values[attachmentArgument]
          : (attachmentArgument ?? values.__TGW_CONNECT_ATTACHMENT__);
        if (
          !ids.includes(id) ||
          seen.has(id) ||
          !owned(peer.Tags, plan) ||
          peer.TransitGatewayAttachmentId !== expectedAttachment
        )
          throw new Error('Foreign peer evidence');
        seen.add(id);
        const config = object7(peer.ConnectPeerConfiguration);
        const transportIndex = action.args?.indexOf('--peer-address') ?? -1;
        const transportArgument = transportIndex >= 0 ? action.args?.[transportIndex + 1] : undefined;
        const transportAddress = transportArgument?.startsWith('__') ? values[transportArgument] : transportArgument;
        const expectedGatewayAddress = action.args?.includes('--transit-gateway-address')
          ? action.args[action.args.indexOf('--transit-gateway-address') + 1]
          : undefined;
        if (
          config.PeerAddress !== (transportAddress ?? values[`__NODE_${action.node}_SLI_IP__`]) ||
          (expectedGatewayAddress !== undefined && config.TransitGatewayAddress !== expectedGatewayAddress) ||
          config.Protocol !== 'gre' ||
          !Array.isArray(config.BgpConfigurations) ||
          config.BgpConfigurations.length !== 2
        )
          throw new Error('Peer topology differs');
        if (
          isIP7(String(config.TransitGatewayAddress)) !== 4 ||
          !Array.isArray(config.InsideCidrBlocks) ||
          config.InsideCidrBlocks.length !== 1 ||
          typeof config.InsideCidrBlocks[0] !== 'string'
        )
          throw new Error('Missing GRE endpoint facts');
        const cidrIndex = action.args?.indexOf('--inside-cidr-blocks') ?? -1;
        const plannedCidr = cidrIndex >= 0 ? action.args?.[cidrIndex + 1] : undefined;
        const [insideAddress, insidePrefix] = String(config.InsideCidrBlocks[0]).split('/');
        const ipv4 = (address) => address.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
        if (
          config.InsideCidrBlocks[0] !== plannedCidr ||
          isIP7(insideAddress) !== 4 ||
          insidePrefix !== '29' ||
          ipv4(insideAddress) % 8 !== 0
        )
          throw new Error('GRE inside CIDR differs from plan');
        const insideNetwork = ipv4(insideAddress);
        let ceEndpoint;
        transports.push({
          peerId: id,
          awsGreAddress: config.TransitGatewayAddress,
          ceGreAddress: config.PeerAddress,
          insideCidr: config.InsideCidrBlocks[0],
        });
        available &&= peer.State === 'available';
        const addresses = new Set();
        for (const item of config.BgpConfigurations) {
          const session = object7(item);
          const endpoint = String(session.TransitGatewayAddress);
          if (
            isIP7(endpoint) !== 4 ||
            isIP7(String(session.PeerAddress)) !== 4 ||
            addresses.has(endpoint) ||
            session.TransitGatewayAsn !== plan.routing.transitGatewayAsn ||
            session.PeerAsn !== plan.routing.customerAsn ||
            !['up', 'down'].includes(String(session.BgpStatus))
          )
            throw new Error('Invalid BGP session evidence');
          const local = String(session.PeerAddress);
          if (
            [endpoint, local].some((address) => ipv4(address) <= insideNetwork || ipv4(address) >= insideNetwork + 7) ||
            endpoint === local ||
            (ceEndpoint !== undefined && ceEndpoint !== local)
          )
            throw new Error('BGP endpoint is outside its planned tunnel');
          ceEndpoint = local;
          addresses.add(endpoint);
          sessions.push({
            peerId: id,
            awsEndpoint: endpoint,
            ceEndpoint: session.PeerAddress,
            status: session.BgpStatus,
          });
        }
      }
      const established = sessions.filter((session) => session.status === 'up').length;
      return {
        ...binding,
        status: available && established === sessions.length ? 'healthy' : 'degraded',
        expectedPeers: ids.length,
        expectedSessions: ids.length * 2,
        establishedSessions: established,
        sessions,
        transports,
        packetTtlEvidence: 'unknown',
        routes: 'unknown',
        traffic: 'unknown',
      };
    }
    if (kind === 'routes') {
      const vpcRoutes = await collectPlannedVpcRoutes(plan, checkpoint, api);
      const expected = (actionKind) =>
        plan.actions
          .filter((action) => action.kind === actionKind)
          .map((action) => {
            const arg = (flag) => {
              const index = action.args?.indexOf(flag) ?? -1;
              const value = index >= 0 ? action.args?.[index + 1] : undefined;
              return value?.startsWith('__') ? values[value] : value;
            };
            return {
              tableId: arg('--transit-gateway-route-table-id'),
              attachmentId: arg('--transit-gateway-attachment-id'),
              destination: arg('--destination-cidr-block'),
            };
          });
      const associations = expected('tgw-associate');
      const propagations = expected('tgw-propagate');
      const routes = expected('tgw-route-create');
      const pairs = [...associations, ...propagations, ...routes];
      if (
        !pairs.length ||
        pairs.some(
          ({ tableId, attachmentId }) =>
            !/^tgw-rtb-[0-9a-f]{8,21}$/.test(tableId ?? '') || !/^tgw-attach-[0-9a-f]{8,21}$/.test(attachmentId ?? ''),
        ) ||
        routes.some(
          ({ destination }) => !destination || (isIP7(destination.split('/')[0]) === 0 && destination !== '0.0.0.0/0'),
        )
      )
        throw new Error('Missing planned TGW route identities');
      const tableIds = [...new Set(pairs.map(({ tableId }) => tableId))].sort();
      const observedAssociations = [];
      const observedPropagations = [];
      for (const tableId of tableIds) {
        const associationRows = await read(
          api,
          ['ec2', 'get-transit-gateway-route-table-associations', '--transit-gateway-route-table-id', tableId],
          plan.region,
        );
        if (!Array.isArray(associationRows.Associations)) throw new Error('Missing TGW association evidence');
        for (const item of associationRows.Associations) {
          const row = object7(item);
          if (
            typeof row.TransitGatewayAttachmentId !== 'string' ||
            typeof row.State !== 'string' ||
            !['associating', 'associated', 'disassociating', 'disassociated'].includes(row.State)
          )
            throw new Error('Invalid TGW association evidence');
          observedAssociations.push({
            tableId,
            attachmentId: row.TransitGatewayAttachmentId,
            state: row.State,
          });
        }
        const propagationRows = await read(
          api,
          ['ec2', 'get-transit-gateway-route-table-propagations', '--transit-gateway-route-table-id', tableId],
          plan.region,
        );
        if (!Array.isArray(propagationRows.TransitGatewayRouteTablePropagations))
          throw new Error('Missing TGW propagation evidence');
        for (const item of propagationRows.TransitGatewayRouteTablePropagations) {
          const row = object7(item);
          if (
            typeof row.TransitGatewayAttachmentId !== 'string' ||
            typeof row.State !== 'string' ||
            !['enabling', 'enabled', 'disabling', 'disabled'].includes(row.State)
          )
            throw new Error('Invalid TGW propagation evidence');
          observedPropagations.push({
            tableId,
            attachmentId: row.TransitGatewayAttachmentId,
            state: row.State,
          });
        }
      }
      const observedRoutes = [];
      for (const route of routes) {
        const raw = await read(
          api,
          [
            'ec2',
            'search-transit-gateway-routes',
            '--transit-gateway-route-table-id',
            route.tableId,
            '--filters',
            `Name=route-search.exact-match,Values=${route.destination}`,
          ],
          plan.region,
        );
        if (
          raw.AdditionalRoutesAvailable === true ||
          (raw.AdditionalRoutesAvailable !== undefined && typeof raw.AdditionalRoutesAvailable !== 'boolean') ||
          !Array.isArray(raw.Routes) ||
          raw.Routes.length !== 1
        )
          throw new Error('Incomplete TGW route evidence');
        const row = object7(raw.Routes[0]);
        if (!Array.isArray(row.TransitGatewayAttachments) || row.TransitGatewayAttachments.length !== 1)
          throw new Error('Ambiguous TGW route attachment evidence');
        const attachment = object7(row.TransitGatewayAttachments[0]);
        if (
          row.DestinationCidrBlock !== route.destination ||
          typeof row.State !== 'string' ||
          typeof row.Type !== 'string' ||
          attachment.TransitGatewayAttachmentId !== route.attachmentId
        )
          throw new Error('TGW route differs from plan');
        observedRoutes.push({
          tableId: route.tableId,
          destination: route.destination,
          attachmentId: route.attachmentId,
          state: row.State,
          type: row.Type,
        });
      }
      const pair = (rows, tableId, attachmentId) =>
        rows.filter((row) => row.tableId === tableId && row.attachmentId === attachmentId);
      const healthy =
        associations.every(
          ({ tableId, attachmentId }) =>
            pair(observedAssociations, tableId, attachmentId).length === 1 &&
            pair(observedAssociations, tableId, attachmentId)[0].state === 'associated',
        ) &&
        propagations.every(
          ({ tableId, attachmentId }) =>
            pair(observedPropagations, tableId, attachmentId).length === 1 &&
            pair(observedPropagations, tableId, attachmentId)[0].state === 'enabled',
        ) &&
        observedRoutes.every((route) => route.state === 'active' && route.type === 'static') &&
        ['healthy', 'not-requested'].includes(vpcRoutes.status);
      return {
        ...binding,
        status: healthy ? 'healthy' : 'degraded',
        expectedAssociations: associations.length,
        expectedPropagations: propagations.length,
        expectedRoutes: routes.length,
        associations: observedAssociations.filter((row) =>
          associations.some(
            ({ tableId, attachmentId }) => tableId === row.tableId && attachmentId === row.attachmentId,
          ),
        ),
        propagations: observedPropagations.filter((row) =>
          propagations.some(
            ({ tableId, attachmentId }) => tableId === row.tableId && attachmentId === row.attachmentId,
          ),
        ),
        routes: observedRoutes,
        vpcRoutes,
        traffic: 'unknown',
      };
    }
    const arn = values.__NLB_TARGET_GROUP_ARN__;
    if (
      typeof arn !== 'string' ||
      !arn.startsWith(`arn:${plan.intent.partition}:elasticloadbalancing:${plan.region}:${plan.accountId}:targetgroup/`)
    )
      throw new Error('Missing scoped target group');
    const rawTags = await read(api, ['elbv2', 'describe-tags', '--resource-arns', arn], plan.region);
    if (!Array.isArray(rawTags.TagDescriptions) || rawTags.TagDescriptions.length !== 1)
      throw new Error('Missing target group ownership');
    const description = object7(rawTags.TagDescriptions[0]);
    if (description.ResourceArn !== arn || !owned(description.Tags, plan)) throw new Error('Foreign target group');
    const expected =
      plan.intent.ingress?.mode === 'nlb'
        ? (plan.intent.ingress.listener.privateAddresses ??
          Array.from({ length: plan.topology.nodeCount }, (_, index) => values[`__NODE_${index + 1}_SLI_IP__`]))
        : Array.from({ length: plan.topology.nodeCount }, (_, index) => values[`__NODE_${index + 1}_SLI_IP__`]);
    if (expected.some((address) => isIP7(address ?? '') !== 4) || new Set(expected).size !== expected.length)
      throw new Error('Missing target identities');
    const raw = await read(api, ['elbv2', 'describe-target-health', '--target-group-arn', arn], plan.region);
    if (!Array.isArray(raw.TargetHealthDescriptions) || raw.TargetHealthDescriptions.length !== expected.length)
      throw new Error('Incomplete target membership');
    const seen = new Set();
    const targets = raw.TargetHealthDescriptions.map((value) => {
      const row = object7(value);
      const target = object7(row.Target);
      const health = object7(row.TargetHealth);
      if (
        typeof target.Id !== 'string' ||
        !expected.includes(target.Id) ||
        seen.has(target.Id) ||
        target.Port !== (plan.intent.ingress?.mode === 'nlb' ? plan.intent.ingress.port : 443) ||
        !['healthy', 'initial', 'unhealthy', 'unused', 'draining', 'unavailable', 'unhealthy.draining'].includes(
          String(health.State),
        )
      )
        throw new Error('Invalid target evidence');
      seen.add(target.Id);
      return { address: target.Id, port: target.Port, state: health.State };
    });
    return {
      ...binding,
      status: targets.every((target) => target.state === 'healthy') ? 'healthy' : 'degraded',
      targetGroupArn: arn,
      targets,
      traffic: 'unknown',
    };
  } catch {
    signal?.throwIfAborted();
    return { ...binding, status: 'unknown', reason: 'network-evidence-unavailable-or-invalid' };
  }
}
var init_network_health = () => {};

// plugins/aws/src/ce/routing-apply.ts
function validateAwsRoutingRebind(plan, rebind) {
  const selected = siteBindings(plan).find(({ site }) => site.name === rebind.siteName);
  const cp = rebind.checkpoint;
  if (
    !selected ||
    !rebind.siteUid ||
    cp.schemaVersion !== 2 ||
    cp.engine !== plan.engine ||
    cp.planSha256 !== plan.planSha256 ||
    cp.planId !== plan.planId ||
    !cp.resolvedValues ||
    typeof cp.resolvedValues !== 'object' ||
    Array.isArray(cp.resolvedValues)
  )
    throw new Error('Replacement routing checkpoint differs from deployment');
  const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  const names = actions
    .filter((action) => selected.site.nodeIndexes.includes(action.node ?? 0))
    .map((action) => `${plan.deploymentName.slice(0, 24)}-gre-${actions.indexOf(action) + 1}`);
  if (!names.length) throw new Error('Replacement site has no Connect routing inventory');
  names.push(`${rebind.siteName.slice(0, 55)}-tgw-bgp`);
  names.push(`${rebind.siteName.slice(0, 43)}-tgw-export-policy`);
  const uids = names.map((name) => cp.resolvedValues[`__XC_ROUTING_${name}__`]);
  if (uids.some((uid) => typeof uid !== 'string' || !uid.trim()) || new Set(uids).size !== uids.length)
    throw new Error('Replacement routing UIDs are missing or duplicated');
}
async function configureAwsRouting(runtime, plan, checkpoint, api, persist, signal, rebind) {
  if (rebind) validateAwsRoutingRebind(plan, rebind);
  const facts = await collectAwsNetworkHealth('bgp', plan, checkpoint, api, signal);
  if (facts.status === 'unknown' || !Array.isArray(facts.sessions) || !Array.isArray(facts.transports))
    throw new Error('AWS GRE endpoint evidence has not converged');
  const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  for (const { site, binding } of siteBindings(plan)) {
    if (rebind && site.name !== rebind.siteName) continue;
    const peers = actions.filter((action) => site.nodeIndexes.includes(action.node ?? 0));
    const expected = peers.map((action) => {
      const argument = action.args?.[action.args.indexOf('--peer-address') + 1];
      const role = argument?.includes('_SLO_IP__') ? 'slo' : 'sli';
      const node = `${plan.deploymentName}-${action.node}`;
      const mac = checkpoint.resolvedValues[`__ENI_${action.node}_${role === 'slo' ? 0 : 1}_MAC__`];
      if (!mac) throw new Error('AWS GRE transport MAC is unavailable');
      return { node, role, mac };
    });
    const unique = expected.filter(
      (item, index) => expected.findIndex((other) => other.node === item.node && other.mac === item.mac) === index,
    );
    const observed = await runtime.observeAwsInterfaces(binding, unique, signal);
    if (observed.status !== 'observed') throw new Error('XC GRE interface evidence has not converged');
    const interfaces = peers.map((action, index) => {
      const peerId = checkpoint.resolvedValues[action.capture?.placeholder ?? ''];
      const transport = facts.transports.find((item) => item.peerId === peerId);
      const sessions = facts.sessions.filter((item) => item.peerId === peerId);
      const iface = observed.interfaces.find(
        (item) =>
          item.node === expected[index].node &&
          item.mac === expected[index].mac.toLowerCase() &&
          item.role === expected[index].role,
      );
      if (!transport || sessions.length !== 2 || sessions[0].ceEndpoint !== sessions[1].ceEndpoint || !iface)
        throw new Error('GRE endpoint binding is incomplete');
      return {
        name: `${plan.deploymentName.slice(0, 24)}-gre-${actions.indexOf(action) + 1}`,
        node: iface.node,
        interfaceName: iface.interfaceName,
        interfaceMtu: iface.mtu,
        awsGreAddress: String(transport.awsGreAddress),
        ceInsideAddress: String(sessions[0].ceEndpoint),
        awsBgpAddresses: sessions.map((item) => String(item.awsEndpoint)).sort(),
      };
    });
    await runtime.ensureAwsRouting(
      binding,
      plan.routing.customerAsn ?? 0,
      plan.routing.transitGatewayAsn ?? 0,
      interfaces,
      plan.routing.destinationCidrs,
      async (resource) => {
        checkpoint.resolvedValues[`__XC_ROUTING_${String(resource.name)}__`] = String(resource.uid);
        await persist();
      },
      signal,
      rebind
        ? {
            contract: rebind.contract,
            siteUid: rebind.siteUid,
            resources: [
              ...interfaces.map((item) => ({ kind: 'external_connector', name: item.name })),
              {
                kind: 'bgp_routing_policy',
                name: `${binding.siteName.slice(0, 43)}-tgw-export-policy`,
              },
              { kind: 'bgp', name: `${binding.siteName.slice(0, 55)}-tgw-bgp` },
            ].map((item) => ({ ...item, uid: rebind.checkpoint.resolvedValues[`__XC_ROUTING_${item.name}__`] ?? '' })),
          }
        : undefined,
    );
  }
}
var init_routing_apply = __esm(() => {
  init_network_health();
});

// plugins/aws/src/ce/native-site-replacement.ts
import { mkdtemp, rm as rm2, writeFile as writeFile2 } from 'node:fs/promises';
import { join as join3 } from 'node:path';

function createNativeAwsSiteReplacementDriver(source, raw, storage, routing) {
  verifyAwsCePlan(source);
  if (source.engine !== 'native') throw new Error('Replacement requires a native source plan');
  const base = structuredClone(source);
  const routingSource = routing ? structuredClone(routing.checkpoint) : undefined;
  if (routing && routing.runtime.engine !== 'native')
    throw new Error('Connect replacement requires automatic routing recovery');
  const token = (plan, node) => canonicalSha256({ replacement: plan.planSha256, node });
  const nodeIndex = (node) => {
    const index = Number(node.slice(base.deploymentName.length + 1));
    if (
      node !== `${base.deploymentName}-${index}` ||
      !Number.isInteger(index) ||
      index < 1 ||
      index > base.intent.topology.nodeCount
    )
      throw new Error('Replacement node is outside the source plan');
    return index;
  };
  const validate = async (plan) => {
    const { planId, planSha256, ...draft } = plan;
    const selected = siteBindings(base).find(({ binding }) => binding.siteName === plan.binding.siteName);
    if (
      plan.schemaVersion !== 2 ||
      plan.kind !== 'aws-ce-site-replacement' ||
      plan.engine !== 'native' ||
      plan.sourcePlanSha256 !== base.planSha256 ||
      canonicalSha256(draft) !== planSha256 ||
      planId !== `aws-ce-replace-${planSha256.slice(0, 24)}` ||
      !selected ||
      canonicalSha256(selected.binding) !== canonicalSha256(plan.binding) ||
      canonicalSha256(storage.owner) !== canonicalSha256(plan.binding.owner)
    )
      throw new Error('Native replacement ownership or plan integrity differs');
    if (base.routing?.profile === 'tgw-connect') {
      if (!routing || !routingSource) {
        if (plan.preparation.evidenceKind !== 'preboot-interface-configuration-required')
          throw new Error('Replacement routing runtime is unavailable');
      } else {
        validateAwsRoutingRebind(base, {
          siteName: plan.binding.siteName,
          siteUid: String(plan.preparation.uid),
          contract: routing.contract,
          checkpoint: routingSource,
        });
        const name = `${plan.planId}-routing-source.json`;
        const expected = { replacementPlanSha256: plan.planSha256, checkpoint: routingSource };
        try {
          if (canonicalSha256(await storage.read(name)) !== canonicalSha256(expected))
            throw new Error('Replacement routing source changed');
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          await storage.write(name, expected);
        }
      }
    }
    for (const node of plan.binding.nodes) launchArgs(plan, node);
    await storage.verify();
  };
  const request = async (api, args) => {
    const result = await api.exec('aws', [...args, '--region', base.region, '--output', 'json']);
    if (result.exitCode) throw new Error(`AWS replacement ${args[1]} failed; reconcile before retrying`);
    const response = object8(JSON.parse(result.stdout));
    if (response.NextToken || response.nextToken) throw new Error('Partial AWS replacement observation');
    return response;
  };
  const identity = async (api) => {
    const found = await request(api, ['sts', 'get-caller-identity']);
    if (found.Account !== base.accountId || !String(found.Arn).startsWith(`arn:${base.partition}:`))
      throw new Error('AWS replacement account or partition differs');
  };
  const resource = async (api, id, hash) => {
    const [found] = await observeAwsResources(api, [id], base.region, {
      deploymentName: base.deploymentName,
      planSha256s: [hash],
    });
    if (!found.exists || !found.owned || found.tags['xcsh-execution-engine'] !== 'native')
      throw new Error('AWS replacement resource ownership is unavailable or differs');
    if (found.state.NextToken || found.state.nextToken) throw new Error('Partial AWS replacement observation');
    return found;
  };
  const instance = async (api, plan, node, id, fresh) => {
    const found = await resource(api, id, fresh ? plan.planSha256 : base.planSha256);
    const rows = instanceRows(found.state);
    if (rows.length !== 1 || rows[0].InstanceId !== id) throw new Error('Ambiguous replacement instance observation');
    const row = rows[0];
    const index = nodeIndex(node);
    if (
      found.tags['xcsh-node-index'] !== String(index) ||
      found.tags['ves-io-site-name'] !== plan.binding.siteName ||
      row.ImageId !== base.intent.image.amiId ||
      row.InstanceType !== base.intent.instance.type ||
      object8(row.Placement).AvailabilityZone !== base.intent.interfaces[0].subnets[index - 1].availabilityZone ||
      (fresh && row.ClientToken !== token(plan, node))
    )
      throw new Error('Replacement instance identity differs');
    const state = String(object8(row.State).Name);
    if (!['pending', 'running', 'stopping', 'stopped', 'shutting-down', 'terminated'].includes(state))
      throw new Error('Replacement instance state is unknown');
    if (fresh && ['shutting-down', 'terminated'].includes(state))
      throw new Error('Replacement instance has been terminated');
    if (!['shutting-down', 'terminated'].includes(state)) {
      const enis = list(row.NetworkInterfaces);
      if (
        enis.length !== base.intent.interfaces.length ||
        base.intent.interfaces.some(
          (iface) =>
            !enis.some(
              (eni) =>
                eni.NetworkInterfaceId === plan.interfaceIds[`${node}/${iface.role}`] &&
                object8(eni.Attachment).DeviceIndex === iface.index,
            ),
        )
      )
        throw new Error('Replacement instance ENI binding differs');
    }
    return row;
  };
  const discover = async (api, plan, node) => {
    const found = await request(api, [
      'ec2',
      'describe-instances',
      '--filters',
      `Name=client-token,Values=${token(plan, node)}`,
    ]);
    const rows = instanceRows(found);
    if (rows.length > 1) throw new Error('Replacement client token matches multiple instances');
    if (!rows.length) return;
    const id = String(rows[0].InstanceId);
    if (!/^i-[a-f0-9]{8,17}$/.test(id) || rows[0].ClientToken !== token(plan, node))
      throw new Error('Replacement client token identity differs');
    await instance(api, plan, node, id, true);
    return id;
  };
  const inspect = async (plan, signal, expected = {}) => {
    await validate(plan);
    const api = scopedAwsApi(raw, base.intent.awsProfile, signal);
    await identity(api);
    const current = {};
    const old = {};
    const enis = {};
    for (const node of plan.binding.nodes) {
      const discovered = await discover(api, plan, node);
      if (expected[node] && expected[node] !== discovered) throw new Error('Replacement checkpoint instance differs');
      if (discovered) current[node] = discovered;
      old[node] = await instance(api, plan, node, String(object8(plan.preparation.instances)[node]), false);
      for (const iface of base.intent.interfaces) {
        const key = `${node}/${iface.role}`;
        const found = await resource(api, plan.interfaceIds[key], base.planSha256);
        const rows = list(found.state.NetworkInterfaces);
        if (rows.length !== 1 || rows[0].NetworkInterfaceId !== plan.interfaceIds[key])
          throw new Error('Ambiguous retained ENI observation');
        const eni = rows[0];
        const evidence = list(plan.preparation.interfaces).find(
          (item) => item.node === node && item.role === iface.role,
        );
        if (
          eni.OwnerId !== base.accountId ||
          eni.MacAddress !== evidence?.mac ||
          eni.AvailabilityZone !== iface.subnets[nodeIndex(node) - 1].availabilityZone ||
          found.tags['xcsh-node-index'] !== String(nodeIndex(node)) ||
          found.tags['xcsh-interface-index'] !== String(iface.index)
        )
          throw new Error('Retained ENI identity differs');
        if (eni.Attachment) {
          const attachment = object8(eni.Attachment);
          if (
            ![old[node].InstanceId, current[node]].filter(Boolean).includes(String(attachment.InstanceId)) ||
            attachment.DeviceIndex !== iface.index ||
            attachment.DeleteOnTermination !== false
          )
            throw new Error('Retained ENI attachment differs');
        }
        enis[key] = eni;
      }
      if (new Set(base.intent.interfaces.map((iface) => enis[`${node}/${iface.role}`].VpcId)).size !== 1)
        throw new Error('Retained ENIs belong to different VPCs');
      const allocation = plan.elasticIpAllocationIds[node];
      if (allocation) {
        const found = await resource(api, allocation, base.planSha256);
        const rows = list(found.state.Addresses);
        if (
          rows.length !== 1 ||
          rows[0].AllocationId !== allocation ||
          found.tags['xcsh-node-index'] !== String(nodeIndex(node)) ||
          (rows[0].AssociationId && rows[0].NetworkInterfaceId !== plan.interfaceIds[`${node}/slo`])
        )
          throw new Error('Retained EIP identity or association differs');
      }
    }
    return { api, current, old, enis };
  };
  const launchArgs = (plan, node) => {
    const index = nodeIndex(node);
    const actions = base.actions.filter((action) => action.kind === 'instance-run' && action.node === index);
    if (actions.length !== 1 || actions[0].command !== 'aws' || !actions[0].args)
      throw new Error('Exact source launch action is required');
    const substitutions = { __PLAN_SHA256__: plan.planSha256 };
    for (const iface of base.intent.interfaces)
      substitutions[`__ENI_${index}_${iface.index}__`] = plan.interfaceIds[`${node}/${iface.role}`];
    const args = actions[0].args.map((arg) => arg.replace(/__[A-Z0-9_]+__/g, (key) => substitutions[key] ?? key));
    if (
      args[0] !== 'ec2' ||
      args[1] !== 'run-instances' ||
      args.includes('--client-token') ||
      args.some(
        (arg) =>
          Array.from(arg).some((character) => character.charCodeAt(0) < 32) ||
          /__[A-Z0-9_]+__/.test(arg.replace('__BOOTSTRAP_FILE__', '')),
      )
    )
      throw new Error('Unresolved or invalid native replacement launch action');
    if (args[args.indexOf('--user-data') + 1] !== 'file://__BOOTSTRAP_FILE__')
      throw new Error('Private bootstrap file is required');
    return [...args, '--client-token', token(plan, node)];
  };
  return {
    quiescenceAdmissionVersion: 1,
    engine: 'native',
    async restoreRouting(plan, siteUid, signal) {
      await validate(plan);
      if (base.routing?.profile !== 'tgw-connect') return;
      if (!routing || !routingSource) {
        if (plan.preparation.evidenceKind === 'preboot-interface-configuration-required') return;
        throw new Error('Replacement routing runtime is unavailable');
      }
      const checkpoint = structuredClone(routingSource);
      const scoped = scopedAwsApi(raw, base.intent.awsProfile, signal);
      await configureAwsRouting(
        routing.runtime,
        base,
        checkpoint,
        scoped,
        () => storage.write(`${plan.planId}-routing-restored.json`, checkpoint),
        signal,
        { siteName: plan.binding.siteName, siteUid, contract: routing.contract, checkpoint: routingSource },
      );
      return (await collectAwsNetworkHealth('bgp', base, checkpoint, scoped, signal)).status === 'healthy';
    },
    async assertOwnership(plan, _phase, instances, signal) {
      await inspect(plan, signal, instances);
    },
    async quiesce(plan, signal, admission) {
      for (const node of plan.binding.nodes) {
        const { api, old, enis } = await inspect(plan, signal);
        const states = Object.values(old).map((row) => object8(row.State).Name);
        const complete =
          states.every((state) => state === 'terminated') &&
          Object.values(enis).every((eni) => !eni.Attachment && eni.Status === 'available');
        await admission?.(
          complete
            ? 'complete'
            : states.some((state) => ['shutting-down', 'terminated'].includes(String(state)))
              ? 'partial'
              : 'intact',
        );
        const id = String(old[node].InstanceId);
        const state = object8(old[node].State).Name;
        if (state !== 'terminated' && state !== 'shutting-down') {
          try {
            await request(api, ['ec2', 'terminate-instances', '--instance-ids', id]);
          } catch {
            signal?.throwIfAborted();
          }
          const observed = await instance(api, plan, node, id, false);
          if (!['terminated', 'shutting-down'].includes(String(object8(observed.State).Name)))
            throw new Error('Original VM termination has not converged');
        }
        if (state !== 'terminated') {
          const result = await api.exec('aws', [
            'ec2',
            'wait',
            'instance-terminated',
            '--instance-ids',
            id,
            '--region',
            base.region,
          ]);
          if (result.exitCode) throw new Error('Original VM termination is pending');
        }
      }
      const final = await inspect(plan, signal);
      if (
        Object.values(final.old).some((row) => object8(row.State).Name !== 'terminated') ||
        Object.values(final.enis).some((eni) => eni.Attachment || eni.Status !== 'available')
      )
        throw new Error('Original VMs and retained ENIs have not quiesced');
    },
    async launch(plan, bootstrap, signal) {
      await validate(plan);
      const launched = {};
      for (const node of plan.binding.nodes) {
        const args = launchArgs(plan, node);
        if (
          typeof bootstrap[node] !== 'string' ||
          !bootstrap[node].startsWith(`#cloud-config
`)
        )
          throw new Error('Verified replacement bootstrap is required');
        const requestSha256 = canonicalSha256({ args, bootstrap: bootstrap[node] });
        const name = `${plan.planId}-${nodeIndex(node)}-launch.json`;
        let record;
        try {
          record = object8(await storage.read(name));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        if (
          record &&
          (record.schemaVersion !== 1 ||
            record.planSha256 !== plan.planSha256 ||
            record.requestSha256 !== requestSha256 ||
            record.clientToken !== token(plan, node))
        )
          throw new Error('Durable replacement launch request differs');
        let observed = await inspect(plan, signal);
        if (Object.values(observed.old).some((row) => object8(row.State).Name !== 'terminated'))
          throw new Error('Original VMs must terminate before replacement launch');
        let id = observed.current[node];
        if (record?.instanceId && record.instanceId !== id)
          throw new Error('Durable replacement launch identity is unavailable or differs');
        if (!id) {
          if (record) throw new Error('Prior replacement launch outcome is unknown; observation is required');
          if (
            base.intent.interfaces.some(
              (iface) =>
                observed.enis[`${node}/${iface.role}`].Attachment ||
                observed.enis[`${node}/${iface.role}`].Status !== 'available',
            )
          )
            throw new Error('Retained ENIs are not available for launch');
          record = {
            schemaVersion: 1,
            planSha256: plan.planSha256,
            requestSha256,
            clientToken: token(plan, node),
            observedAt: new Date().toISOString(),
          };
          await storage.write(name, record);
          const directory = await mkdtemp(join3(storage.directory, 'replacement-bootstrap-'));
          try {
            const path = join3(directory, 'cloud-init');
            await writeFile2(path, bootstrap[node], { mode: 384, flag: 'wx' });
            try {
              const result = await observed.api.exec(
                'aws',
                args.map((arg) => arg.replace('__BOOTSTRAP_FILE__', path)),
              );
              if (!result.exitCode) {
                const rows = list(object8(JSON.parse(result.stdout)).Instances);
                if (rows.length === 1 && /^i-[a-f0-9]{8,17}$/.test(String(rows[0].InstanceId))) {
                  record.instanceId = rows[0].InstanceId;
                  await storage.write(name, record);
                }
              }
            } catch {
              signal?.throwIfAborted();
            }
          } finally {
            await rm2(directory, { recursive: true, force: true });
          }
          id = await discover(observed.api, plan, node);
          if (!id) throw new Error('Replacement launch outcome is unknown; reconcile the client token');
          if (record.instanceId && record.instanceId !== id)
            throw new Error('Replacement launch response differs from observation');
        }
        await storage.write(name, {
          ...record,
          schemaVersion: 1,
          planSha256: plan.planSha256,
          requestSha256,
          clientToken: token(plan, node),
          instanceId: id,
        });
        for (const iface of base.intent.interfaces) {
          observed = await inspect(plan, signal, { [node]: id });
          const key = `${node}/${iface.role}`;
          if (observed.enis[key].SourceDestCheck !== false) {
            const result = await observed.api.exec('aws', [
              'ec2',
              'modify-network-interface-attribute',
              '--network-interface-id',
              plan.interfaceIds[key],
              '--source-dest-check',
              'Value=false',
              '--region',
              base.region,
            ]);
            if (result.exitCode) throw new Error('Replacement source/destination check update failed');
          }
        }
        if (plan.elasticIpAllocationIds[node]) {
          observed = await inspect(plan, signal, { [node]: id });
          await associateAwsCeEip(
            observed.api,
            base,
            [
              'ec2',
              'associate-address',
              '--allocation-id',
              plan.elasticIpAllocationIds[node],
              '--network-interface-id',
              plan.interfaceIds[`${node}/slo`],
              '--region',
              base.region,
              '--output',
              'json',
            ],
            signal,
          );
        }
        const final = await inspect(plan, signal, { [node]: id });
        if (base.intent.interfaces.some((iface) => final.enis[`${node}/${iface.role}`].SourceDestCheck !== false))
          throw new Error('Replacement source/destination checks have not converged');
        launched[node] = id;
      }
      return launched;
    },
  };
}
var object8 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Malformed AWS replacement observation');
    return value;
  },
  list = (value) => {
    if (!Array.isArray(value)) throw new Error('Incomplete AWS replacement observation');
    return value.map(object8);
  },
  instanceRows = (value) => list(value.Reservations).flatMap((row) => list(row.Instances));
var init_native_site_replacement = __esm(() => {
  init_artifacts();
  init_canonical();
  init_discovery();
  init_network_health();
  init_routing_apply();
});

// plugins/aws/src/ce/platform-ingress.ts
async function optional(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}
async function originAddress(plan, api, signal) {
  if (plan.intent.ingress?.mode !== 'nlb') throw new Error('AWS origin discovery requires NLB ingress');
  const source = plan.intent.ingress.probe.sourceInstanceId;
  const result = await api.exec(
    'aws',
    ['ec2', 'describe-instances', '--instance-ids', source, '--region', plan.region, '--output', 'json'],
    { signal },
  );
  if (result.exitCode !== 0) throw detectAwsError(result.stderr, result.exitCode);
  const response = JSON.parse(result.stdout);
  const reservations = Array.isArray(response.Reservations) ? response.Reservations : [];
  const instances = reservations.flatMap((reservation) => {
    if (!reservation || typeof reservation !== 'object' || Array.isArray(reservation)) return [];
    const rows = reservation.Instances;
    return Array.isArray(rows) ? rows : [];
  });
  const instance = instances[0];
  const address = instance?.PrivateIpAddress;
  const state = instance?.State;
  if (
    instances.length !== 1 ||
    instance?.InstanceId !== source ||
    state?.Name !== 'running' ||
    typeof address !== 'string' ||
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address) ||
    address.split('.').some((octet) => Number(octet) > 255)
  )
    throw new Error('Fresh AWS origin address evidence is unavailable');
  return address;
}
async function ensureAwsPlatformIngress(plan, runtime, storage, contract, resolved, api, signal) {
  if (plan.intent.ingress?.mode !== 'nlb') return;
  const ingress = plan.intent.ingress;
  await storage.verify();
  const sli = plan.interfaces.find((item) => item.role === 'sli');
  if (!sli) throw new Error('AWS NLB ingress requires an SLI interface');
  const selections = siteBindings(plan).map(({ site, binding }, siteIndex) => {
    if (site.nodeIndexes.length !== 1) throw new Error('AWS NLB ingress requires independent one-node sites');
    const nodeIndex = site.nodeIndexes[0];
    const mac = resolved[`__ENI_${nodeIndex}_${sli.index}_MAC__`];
    if (!mac) throw new Error('Observed SLI MAC identity is unavailable for platform ingress');
    return {
      binding,
      node: `${plan.deploymentName}-${nodeIndex}`,
      mac,
      insideAddress: ingress.listener.privateAddresses?.[siteIndex],
    };
  });
  const lifecycle = runtime.ingress(contract, storage);
  const saved = await optional(storage, 'aws-platform-ingress.json');
  let marker;
  if (saved !== undefined) {
    const candidate = saved;
    if (
      ![1, 2, 3, 4, 5, 6, 7, 8].includes(candidate.schemaVersion) ||
      candidate.engine !== plan.engine ||
      candidate.planSha256 !== plan.planSha256 ||
      candidate.contractFingerprint !== contract.fingerprint ||
      !/^[a-f0-9]{24}$/.test(candidate.ingressPlanId)
    )
      throw new Error('Platform ingress checkpoint differs from the owning AWS plan');
    if (candidate.schemaVersion < 8) {
      await lifecycle.retire(candidate.ingressPlanId, signal);
      const listener = ingress.listener;
      const corrected = await lifecycle.planAws(
        { ...listener, port: ingress.port, originAddress: await originAddress(plan, api, signal) },
        selections,
        signal,
      );
      marker = {
        schemaVersion: 8,
        engine: plan.engine,
        planSha256: plan.planSha256,
        ingressPlanId: corrected.id,
        contractFingerprint: contract.fingerprint,
      };
      await storage.write('aws-platform-ingress.json', marker);
    } else marker = candidate;
  } else {
    const listener = ingress.listener;
    const ingressPlan = await lifecycle.planAws(
      { ...listener, port: ingress.port, originAddress: await originAddress(plan, api, signal) },
      selections,
      signal,
    );
    marker = {
      schemaVersion: 8,
      engine: plan.engine,
      planSha256: plan.planSha256,
      ingressPlanId: ingressPlan.id,
      contractFingerprint: contract.fingerprint,
    };
    await storage.write('aws-platform-ingress.json', marker);
  }
  const receipt = await lifecycle.apply(marker.ingressPlanId, signal);
  return {
    ingressPlanId: marker.ingressPlanId,
    contractFingerprint: marker.contractFingerprint,
    uid: receipt.uid,
    listener: receipt.listener,
    routes: receipt.routes,
    traffic: receipt.traffic,
    observedAt: receipt.observedAt,
  };
}
var init_platform_ingress = __esm(() => {
  init_exec();
});

// plugins/aws/src/ce/security-group-defaults.ts
async function resetAwsSecurityGroupEgress(action, plan, checkpoint, api) {
  const id = checkpoint.resolvedValues[action.resourceId ?? ''];
  if (!/^sg-[0-9a-f]{8,17}$/.test(id ?? '')) throw new Error('Security group identity is unresolved');
  const observe = async () => {
    const result = await api.exec('aws', [
      'ec2',
      'describe-security-groups',
      '--group-ids',
      id,
      '--region',
      plan.region,
      '--output',
      'json',
    ]);
    if (result.exitCode) throw new Error('Security group ownership is unavailable');
    const data = JSON.parse(result.stdout);
    if (data.NextToken || !Array.isArray(data.SecurityGroups) || data.SecurityGroups.length !== 1)
      throw new Error('Security group observation is incomplete');
    const group = data.SecurityGroups[0];
    const tags = Object.fromEntries((group.Tags ?? []).map((tag) => [tag.Key, tag.Value]));
    if (
      group.GroupId !== id ||
      group.VpcId !== (plan.intent.vpc.vpcId ?? checkpoint.resolvedValues.__VPC_ID__) ||
      tags['xcsh-managed-by'] !== 'aws-ce' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      tags['xcsh-plan-sha256'] !== plan.planSha256 ||
      tags['xcsh-execution-engine'] !== plan.engine ||
      !Array.isArray(group.IpPermissionsEgress)
    )
      throw new Error('Security group ownership or scope changed');
    return group.IpPermissionsEgress;
  };
  const rules = await observe();
  if (!rules.length) return;
  for (const rule of rules) {
    const ipv4 = rule.IpRanges;
    const ipv6 = rule.Ipv6Ranges;
    if (
      rule.IpProtocol !== '-1' ||
      !Array.isArray(ipv4) ||
      !Array.isArray(ipv6) ||
      ipv4.some((range) => range.CidrIp !== '0.0.0.0/0') ||
      ipv6.some((range) => range.CidrIpv6 !== '::/0') ||
      !Array.isArray(rule.UserIdGroupPairs) ||
      rule.UserIdGroupPairs.length ||
      !Array.isArray(rule.PrefixListIds) ||
      rule.PrefixListIds.length
    )
      throw new Error('Security group contains unexpected egress rules; replan required');
  }
  await api.exec('aws', [
    'ec2',
    'revoke-security-group-egress',
    '--group-id',
    id,
    '--ip-permissions',
    JSON.stringify(rules),
    '--region',
    plan.region,
    '--output',
    'json',
  ]);
  if ((await observe()).length) throw new Error('Security group default egress removal has not converged');
}

// plugins/aws/src/ce/site-replacement.ts
function compileAwsSiteReplacement(base, siteName, preparation, resources) {
  verifyAwsCePlan(base);
  const { interfaceIds, elasticIpAllocationIds, bootstrapTokenNames } = resources;
  const selected = siteBindings(base).find(({ site }) => site.name === siteName);
  if (!selected) throw new Error('Replacement site is outside the deployment');
  const observed = Date.parse(String(preparation.observedAt));
  if (!Number.isFinite(observed) || Date.now() - observed > 300000 || observed > Date.now() + 5000)
    throw new Error('Fresh replacement evidence is required');
  const { binding } = selected;
  if (
    !['preboot-interface-configuration-required', 'owned-site-replacement'].includes(
      String(preparation.evidenceKind),
    ) ||
    preparation.siteName !== siteName ||
    canonicalSha256(preparation.owner) !== canonicalSha256(binding.owner)
  )
    throw new Error('Replacement evidence ownership differs');
  if (
    typeof preparation.uid !== 'string' ||
    !preparation.uid ||
    typeof preparation.resourceVersion !== 'string' ||
    !preparation.resourceVersion ||
    !/^sha256:[a-f0-9]{64}$/.test(String(preparation.contractFingerprint)) ||
    preparation.source !== `/api/config/namespaces/system/securemesh_site_v2s/${siteName}` ||
    preparation.deviceSource !== `/api/register/namespaces/system/registrations_by_site/${siteName}`
  )
    throw new Error('Replacement evidence provenance is incomplete');
  const instances = object9(preparation.instances);
  if (
    Object.keys(instances).length !== binding.nodes.length ||
    new Set(Object.values(instances)).size !== binding.nodes.length ||
    binding.nodes.some((node) => !/^i-[0-9a-f]{8,17}$/.test(String(instances[node])))
  )
    throw new Error('Replacement instance inventory is incomplete');
  const interfaces = preparation.interfaces;
  if (!Array.isArray(interfaces) || !interfaces.length) throw new Error('Replacement interfaces are missing');
  const keys = interfaces.map((value) => {
    const item = object9(value);
    if (!binding.nodes.includes(String(item.node)) || !['slo', 'sli'].includes(String(item.role)))
      throw new Error('Replacement interface scope differs');
    return `${item.node}/${item.role}`;
  });
  const requiredKeys = binding.nodes.flatMap((node) => base.intent.interfaces.map((item) => `${node}/${item.role}`));
  if (canonicalSha256([...keys].sort()) !== canonicalSha256(requiredKeys.sort()))
    throw new Error('Replacement layout differs from plan');
  const macs = new Set();
  const devices = new Set();
  for (const value of interfaces) {
    const item = object9(value);
    const desired = base.intent.interfaces.find((entry) => entry.role === item.role);
    if (
      !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(String(item.mac)) ||
      macs.has(String(item.mac)) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(String(item.device)) ||
      devices.has(`${item.node}/${item.device}`) ||
      item.mtu !== (desired?.mtu ?? AWS_CE_DEFAULT_INTERFACE_MTU)
    )
      throw new Error('Replacement MAC, device or MTU differs from plan');
    macs.add(String(item.mac));
    devices.add(`${item.node}/${item.device}`);
  }
  if (
    new Set(keys).size !== keys.length ||
    keys.length !== Object.keys(interfaceIds).length ||
    keys.some((key) => !/^eni-[0-9a-f]{8,17}$/.test(interfaceIds[key] ?? '')) ||
    new Set(Object.values(interfaceIds)).size !== keys.length
  )
    throw new Error('Replacement ENI inventory is incomplete or duplicated');
  if (
    Object.keys(bootstrapTokenNames).length !== binding.nodes.length ||
    binding.nodes.some((node) => !/^[a-z][a-z0-9-]{0,62}$/.test(bootstrapTokenNames[node] ?? ''))
  )
    throw new Error('Observed bootstrap token inventory is incomplete');
  if (
    base.intent.egress.mode === 'elastic-ip' &&
    (Object.keys(elasticIpAllocationIds).length !== binding.nodes.length ||
      binding.nodes.some((node) => !/^eipalloc-[0-9a-f]{8,17}$/.test(elasticIpAllocationIds[node] ?? '')) ||
      new Set(Object.values(elasticIpAllocationIds)).size !== binding.nodes.length)
  )
    throw new Error('Replacement EIP inventory is incomplete or duplicated');
  const versions = structuredClone(resources.versions);
  if (
    versions?.schemaVersion !== 1 ||
    canonicalSha256(versions.identity.binding) !== canonicalSha256(binding) ||
    versions.identity.siteUid !== preparation.uid ||
    versions.identity.siteContractFingerprint !== preparation.contractFingerprint ||
    !versions.identity.physicalSiteUid ||
    !/^sha256:[a-f0-9]{64}$/.test(versions.identity.contractFingerprint)
  )
    throw new Error('Replacement version identity differs from the selected site');
  const request = structuredClone(object9(preparation.request));
  request.spec = { ...object9(request.spec), software_settings: initialSoftwareSettings(versions.versions) };
  const draft = {
    schemaVersion: 2,
    kind: 'aws-ce-site-replacement',
    engine: base.engine,
    sourcePlanSha256: base.planSha256,
    binding,
    preparation: { ...structuredClone(preparation), request },
    versions,
    interfaceIds: { ...interfaceIds },
    elasticIpAllocationIds: { ...elasticIpAllocationIds },
    oldTokenNames: { ...bootstrapTokenNames },
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-replace-${planSha256.slice(0, 24)}`, planSha256 };
}
async function runAwsSiteReplacement(plan, authorizedPlanSha256, driver, runtime, storage, contract, signal) {
  plan = structuredClone(plan);
  const { planId, planSha256, ...draft } = plan;
  if (
    plan.schemaVersion !== 2 ||
    plan.kind !== 'aws-ce-site-replacement' ||
    !safeHexEqual(canonicalSha256(draft), planSha256) ||
    planId !== `aws-ce-replace-${planSha256.slice(0, 24)}`
  )
    throw new Error('Replacement plan integrity differs or schema is obsolete; prepare a new v2 plan');
  if (!safeHexEqual(planSha256, authorizedPlanSha256)) throw new Error('Exact replacement authorization is required');
  if (driver.engine !== plan.engine || runtime.engine !== plan.engine || storage.owner.engine !== plan.engine)
    throw new Error('Only the owning engine may replace this site');
  if (driver.quiescenceAdmissionVersion !== 1)
    throw new Error('Replacement driver requires shutdown admission support');
  if (
    plan.versions?.schemaVersion !== 1 ||
    canonicalSha256(plan.versions.identity.binding) !== canonicalSha256(plan.binding) ||
    plan.versions.identity.siteUid !== plan.preparation.uid ||
    plan.versions.identity.siteContractFingerprint !== plan.preparation.contractFingerprint ||
    plan.versions.identity.contractFingerprint !== contract.fingerprint ||
    canonicalSha256(object9(object9(plan.preparation.request).spec).software_settings) !==
      canonicalSha256(initialSoftwareSettings(plan.versions.versions))
  )
    throw new Error('Replacement version snapshot differs from plan or contract');
  if (typeof runtime.ownedSiteConfiguration !== 'function' || typeof runtime.observeUpgrade !== 'function')
    throw new Error('AWS site replacement requires an updated platform runtime with owned configuration projection');
  if (canonicalSha256(storage.owner) !== canonicalSha256(plan.binding.owner))
    throw new Error('Replacement storage ownership differs');
  await storage.verify();
  const path = `${planId}.json`;
  let checkpoint;
  try {
    checkpoint = await storage.read(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    checkpoint = { schemaVersion: 2, planSha256, phase: 'quiesce', bootstrap: {}, bootstrapSha256: {}, instances: {} };
  }
  if (checkpoint.schemaVersion !== 2 || checkpoint.planSha256 !== planSha256 || !phases.includes(checkpoint.phase))
    throw new Error('Replacement checkpoint differs from plan');
  if (
    checkpoint.quiesceConfigurationSha256 !== undefined &&
    !/^[a-f0-9]{64}$/.test(checkpoint.quiesceConfigurationSha256)
  )
    throw new Error('Replacement configuration checkpoint is malformed');
  const admissionSha256 = canonicalSha256(plan.versions);
  if (checkpoint.versionAdmissionSha256 !== undefined && checkpoint.versionAdmissionSha256 !== admissionSha256)
    throw new Error('Replacement version admission differs from plan');
  if (checkpoint.phase !== 'quiesce' && checkpoint.versionAdmissionSha256 !== admissionSha256)
    throw new Error('Replacement version admission is missing');
  if (
    checkpoint.physicalSiteUid !== undefined &&
    (typeof checkpoint.physicalSiteUid !== 'string' ||
      !checkpoint.physicalSiteUid ||
      checkpoint.physicalSiteUid === plan.versions.identity.physicalSiteUid)
  )
    throw new Error('Replacement physical site checkpoint differs');
  if (checkpoint.versionAdmissionSha256 && !checkpoint.quiesceConfigurationSha256)
    throw new Error('Replacement configuration admission is missing');
  object9(checkpoint.bootstrap);
  object9(checkpoint.bootstrapSha256);
  object9(checkpoint.instances);
  const nodes = plan.binding.nodes;
  if (
    Object.entries(checkpoint.bootstrap).some(
      ([node, material]) =>
        !nodes.includes(node) ||
        typeof material !== 'string' ||
        !safeHexEqual(canonicalSha256(material), checkpoint.bootstrapSha256[node] ?? ''),
    )
  )
    throw new Error('Replacement bootstrap checkpoint integrity differs');
  if (
    phases.indexOf(checkpoint.phase) >= phases.indexOf('bootstrap') &&
    (!checkpoint.siteUid || checkpoint.siteUid === plan.preparation.uid)
  )
    throw new Error('Replacement site checkpoint identity is missing');
  if (phases.indexOf(checkpoint.phase) >= phases.indexOf('launch') && nodes.some((node) => !checkpoint.bootstrap[node]))
    throw new Error('Replacement bootstrap checkpoint is incomplete');
  if (
    phases.indexOf(checkpoint.phase) >= phases.indexOf('registration') &&
    (Object.keys(checkpoint.instances).length !== nodes.length ||
      nodes.some(
        (node) =>
          !/^i-[0-9a-f]{8,17}$/.test(checkpoint.instances[node] ?? '') ||
          checkpoint.instances[node] === object9(plan.preparation.instances)[node],
      ) ||
      new Set(Object.values(checkpoint.instances)).size !== nodes.length)
  )
    throw new Error('Replacement instance checkpoint identity is invalid');
  const save = () => storage.write(path, checkpoint);
  await save();
  if (checkpoint.phase === 'complete' && !checkpoint.physicalSiteUid)
    throw new Error('Replacement physical site checkpoint is missing');
  const binding = plan.binding;
  for (let index = phases.indexOf(checkpoint.phase); index < phases.length; index++) {
    const phase = phases[index];
    signal?.throwIfAborted();
    await storage.verify();
    await driver.assertOwnership(plan, phase, checkpoint.instances, signal);
    if (['quiesce', 'remove-tokens', 'bootstrap', 'launch', 'registration', 'complete'].includes(phase)) {
      const currentSite = await runtime.observeOwnedSite(binding, signal);
      const expectedUid = ['quiesce', 'remove-tokens'].includes(phase) ? plan.preparation.uid : checkpoint.siteUid;
      if (!expectedUid || object9(currentSite.system_metadata).uid !== expectedUid)
        throw new Error('Site UID changed at a replacement boundary');
      if (phase === 'quiesce' || (phase === 'remove-tokens' && checkpoint.quiesceConfigurationSha256)) {
        const configurationSha256 = canonicalSha256(runtime.ownedSiteConfiguration(binding, currentSite));
        if (checkpoint.quiesceConfigurationSha256) {
          if (!safeHexEqual(configurationSha256, checkpoint.quiesceConfigurationSha256))
            throw new Error('Site configuration changed during replacement');
        } else {
          if (currentSite.resource_version !== plan.preparation.resourceVersion)
            throw new Error('Site configuration changed before replacement');
          checkpoint.quiesceConfigurationSha256 = configurationSha256;
          await save();
        }
      }
    }
    if (phase === 'quiesce') {
      let admitted = false;
      await driver.quiesce(plan, signal, async (state) => {
        signal?.throwIfAborted();
        await storage.verify();
        const current = await runtime.observeOwnedSite(binding, signal);
        if (
          object9(current.system_metadata).uid !== plan.preparation.uid ||
          canonicalSha256(runtime.ownedSiteConfiguration(binding, current)) !== checkpoint.quiesceConfigurationSha256
        )
          throw new Error('Site identity or configuration changed before shutdown admission');
        if (state === 'intact') {
          await verifyCeReplacementVersions(plan.versions, runtime, contract, signal);
          checkpoint.versionAdmissionSha256 = admissionSha256;
          await save();
        } else if (!['partial', 'complete'].includes(state) || checkpoint.versionAdmissionSha256 !== admissionSha256) {
          throw new Error('Partial shutdown requires recorded version admission');
        }
        admitted = true;
      });
      if (!admitted) throw new Error('Replacement driver did not perform shutdown admission');
    }
    if (phase === 'remove-tokens') {
      for (const node of binding.nodes)
        await runtime.deleteBootstrapToken(binding, node, plan.oldTokenNames[node], signal);
    }
    if (phase === 'remove-site') {
      let existing;
      try {
        existing = await runtime.observeOwnedSite(binding, signal);
      } catch (error) {
        if (error.category !== 'not-found') throw error;
      }
      if (existing) {
        if (object9(existing.system_metadata).uid !== plan.preparation.uid)
          throw new Error('Original site UID changed before deletion');
        if (
          checkpoint.quiesceConfigurationSha256 &&
          !safeHexEqual(
            canonicalSha256(runtime.ownedSiteConfiguration(binding, existing)),
            checkpoint.quiesceConfigurationSha256,
          )
        )
          throw new Error('Site configuration changed before deletion');
        await runtime.deleteSite(binding, signal);
      }
    }
    if (phase === 'create-site') {
      await runtime.ensureAwsPreparedSite(
        { ...binding, initialVersions: structuredClone(plan.versions.versions) },
        plan.preparation,
        async (record) => {
          if (typeof record.uid !== 'string' || !record.uid || record.uid === plan.preparation.uid)
            throw new Error('Replacement site UID is invalid');
          if (checkpoint.siteUid && checkpoint.siteUid !== record.uid)
            throw new Error('Replacement site UID changed during recovery');
          checkpoint.siteUid = record.uid;
          await save();
        },
        signal,
      );
    }
    if (phase === 'bootstrap') {
      for (const [index, node] of binding.nodes.entries()) {
        if (checkpoint.bootstrap[node]) continue;
        const token = `${binding.siteName.slice(0, 36)}-${index + 1}-r-${planSha256.slice(0, 12)}`;
        const material = await runtime.bootstrap(
          binding,
          node,
          token,
          (secret) => storage.write(`${token}.json`, secret),
          signal,
        );
        checkpoint.bootstrap[node] = renderAwsCeCloudInit({ nodeName: node, material });
        checkpoint.bootstrapSha256[node] = canonicalSha256(checkpoint.bootstrap[node]);
        await save();
      }
    }
    if (phase === 'launch') {
      if (binding.nodes.some((node) => typeof checkpoint.bootstrap[node] !== 'string'))
        throw new Error('Replacement bootstrap is incomplete');
      checkpoint.instances = await driver.launch(plan, checkpoint.bootstrap, signal);
      if (
        Object.keys(checkpoint.instances).length !== binding.nodes.length ||
        binding.nodes.some(
          (node) =>
            !/^i-[0-9a-f]{8,17}$/.test(checkpoint.instances[node] ?? '') ||
            checkpoint.instances[node] === object9(plan.preparation.instances)[node],
        ) ||
        new Set(Object.values(checkpoint.instances)).size !== binding.nodes.length
      )
        throw new Error('Replacement launch identities are incomplete or unchanged');
      await driver.assertOwnership(plan, phase, checkpoint.instances, signal);
    }
    if (phase === 'registration' || phase === 'complete') {
      const expected = plan.preparation.interfaces;
      const registration = await runtime.approveRegistrations(
        binding,
        checkpoint.instances,
        (record) => storage.write(`${planId}-registration.json`, record),
        signal,
      );
      const configuration = await runtime.observeAwsRegisteredConfiguration(
        binding,
        checkpoint.instances,
        expected,
        signal,
      );
      if (registration.status !== 'healthy' || configuration.status !== 'configured')
        return { status: 'pending-registration', registration, configuration, routing: 'unknown', traffic: 'unknown' };
      await runtime.ensureAwsInterfaceMtu(
        binding,
        checkpoint.instances,
        expected,
        (record) => storage.write(`${planId}-mtu.json`, { ...record, planSha256 }),
        signal,
      );
      if ((await runtime.observeRegistrations(binding, checkpoint.instances, signal)).status !== 'healthy')
        return { status: 'pending-registration', routing: 'unknown', traffic: 'unknown' };
      if (!checkpoint.siteUid) throw new Error('Replacement logical identity is missing');
      const observation = await runtime.observeUpgrade(binding, contract, undefined, signal);
      if (observation.status !== 'observed')
        return { status: 'pending-versions', versions: 'unknown', routing: 'unknown', traffic: 'unknown' };
      if (
        observation.physicalSiteUid === plan.versions.identity.physicalSiteUid ||
        (checkpoint.physicalSiteUid && checkpoint.physicalSiteUid !== observation.physicalSiteUid)
      )
        throw new Error('Replacement physical identity or effective versions differ');
      const effective = stableCeSiteVersions(
        {
          binding,
          siteUid: checkpoint.siteUid,
          physicalSiteUid: observation.physicalSiteUid,
          contractFingerprint: contract.fingerprint,
          siteContractFingerprint: plan.versions.identity.siteContractFingerprint,
        },
        observation,
      );
      if (!effective)
        return { status: 'pending-versions', versions: 'unknown', routing: 'unknown', traffic: 'unknown' };
      if (canonicalSha256(effective) !== canonicalSha256(plan.versions.versions))
        throw new Error('Replacement physical identity or effective versions differ');
      checkpoint.physicalSiteUid = observation.physicalSiteUid;
      await save();
      if ((await driver.restoreRouting?.(plan, checkpoint.siteUid, signal)) === false)
        return {
          status: 'pending-routing',
          versions: structuredClone(effective),
          routing: 'unknown',
          traffic: 'unknown',
        };
      await driver.finalize?.(plan, checkpoint.instances, signal);
      checkpoint.phase = 'complete';
      await save();
      return {
        status: 'registered-with-configured-interfaces',
        instances: checkpoint.instances,
        siteUid: checkpoint.siteUid,
        physicalSiteUid: checkpoint.physicalSiteUid,
        versions: structuredClone(effective),
        routing: 'unknown',
        traffic: 'unknown',
      };
    }
    checkpoint.phase = phases[index + 1];
    await save();
  }
  throw new Error('Invalid replacement phase');
}
var phases,
  object9 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed replacement evidence');
    return value;
  };
var init_site_replacement = __esm(() => {
  init_replacement_versions();
  init_upgrade_transition();
  init_artifacts();
  init_canonical();
  init_types2();
  phases = [
    'quiesce',
    'remove-tokens',
    'remove-site',
    'create-site',
    'bootstrap',
    'launch',
    'registration',
    'complete',
  ];
});

// plugins/aws/src/ce/traffic-probe.ts
async function run(api, plan, args) {
  const result = await api.exec('aws', [...args, '--region', plan.region, '--output', 'json']);
  if (result.exitCode !== 0) throw detectAwsError(result.stderr, result.exitCode);
  return object10(JSON.parse(result.stdout));
}
async function optional2(storage, name) {
  try {
    return object10(await storage.read(name));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}
async function collectAwsTrafficProbe(plan, checkpoint, storage, rawApi, signal) {
  if (plan.intent.ingress?.mode !== 'nlb') throw new Error('AWS traffic probe requires explicit NLB ingress');
  await storage.verify();
  const api = scopedAwsApi(rawApi, plan.intent.awsProfile, signal);
  const probe = plan.intent.ingress.probe;
  if (
    !plan.intent.brownfield.resourceIds.includes(probe.sourceInstanceId) ||
    !plan.ownershipInventory.some(
      (row) => row.resourceId === probe.sourceInstanceId && !row.owned && row.action === 'modify-approved',
    )
  )
    throw new Error('Traffic probe source is outside the reviewed AWS inventory');
  if ((await run(api, plan, ['sts', 'get-caller-identity'])).Account !== plan.accountId)
    throw new Error('Traffic probe account differs');
  const instance = await run(api, plan, ['ec2', 'describe-instances', '--instance-ids', probe.sourceInstanceId]);
  const instances = Array.isArray(instance.Reservations)
    ? instance.Reservations.flatMap((value) => {
        const reservation = object10(value);
        return Array.isArray(reservation.Instances) ? reservation.Instances.map(object10) : [];
      })
    : [];
  if (
    instances.length !== 1 ||
    instances[0].InstanceId !== probe.sourceInstanceId ||
    object10(instances[0].State).Name !== 'running'
  )
    throw new Error('Traffic probe source instance is unavailable');
  const managed = await run(api, plan, [
    'ssm',
    'describe-instance-information',
    '--filters',
    `Key=InstanceIds,Values=${probe.sourceInstanceId}`,
  ]);
  const managedRows = Array.isArray(managed.InstanceInformationList)
    ? managed.InstanceInformationList.map(object10)
    : [];
  if (
    managedRows.length !== 1 ||
    managedRows[0].InstanceId !== probe.sourceInstanceId ||
    managedRows[0].PingStatus !== 'Online' ||
    managedRows[0].PlatformType !== 'Linux'
  )
    throw new Error('Traffic probe source is not an online Linux SSM managed instance');
  const arn = checkpoint.resolvedValues.__NLB_ARN__;
  if (!arn?.startsWith(`arn:${plan.partition}:elasticloadbalancing:${plan.region}:${plan.accountId}:loadbalancer/net/`))
    throw new Error('Traffic probe NLB identity is unavailable');
  const loadBalancers = await run(api, plan, ['elbv2', 'describe-load-balancers', '--load-balancer-arns', arn]);
  const rows = Array.isArray(loadBalancers.LoadBalancers) ? loadBalancers.LoadBalancers.map(object10) : [];
  const dns = rows[0]?.DNSName;
  if (
    rows.length !== 1 ||
    rows[0].LoadBalancerArn !== arn ||
    rows[0].Scheme !== 'internal' ||
    typeof dns !== 'string' ||
    !/^[A-Za-z0-9.-]{1,253}$/.test(dns)
  )
    throw new Error('Traffic probe NLB endpoint differs from the reviewed deployment');
  const file = 'aws-traffic-probe.json';
  let state = await optional2(storage, file);
  if (state) {
    const attempts = state.attempts;
    if (
      state.schemaVersion !== 1 ||
      state.engine !== plan.engine ||
      state.planSha256 !== plan.planSha256 ||
      state.sourceInstanceId !== probe.sourceInstanceId ||
      !['ready', 'submitted', 'complete'].includes(String(state.phase)) ||
      (state.phase !== 'ready' && (typeof state.commandId !== 'string' || !COMMAND_ID.test(state.commandId))) ||
      (attempts !== undefined &&
        (!Array.isArray(attempts) ||
          attempts.some(
            (attempt) =>
              !attempt ||
              typeof attempt !== 'object' ||
              !COMMAND_ID.test(String(attempt.commandId)) ||
              typeof attempt.observedAt !== 'string' ||
              !Number.isFinite(Date.parse(String(attempt.observedAt))),
          )))
    )
      throw new Error('Traffic probe checkpoint differs from the owning plan');
    if (state.phase === 'complete') {
      const evidence = object10(state.evidence);
      if (
        evidence.status !== 'healthy' ||
        evidence.source !== 'aws:ssm:get-command-invocation' ||
        evidence.sourceInstanceId !== probe.sourceInstanceId ||
        evidence.commandId !== state.commandId ||
        evidence.httpStatus !== probe.expectedStatus ||
        evidence.bodySha256 !== probe.expectedBodySha256 ||
        evidence.expectedStatus !== probe.expectedStatus ||
        evidence.expectedBodySha256 !== probe.expectedBodySha256 ||
        typeof evidence.observedAt !== 'string' ||
        !Number.isFinite(Date.parse(evidence.observedAt))
      )
        throw new Error('Persisted traffic evidence differs from the owning plan');
      return evidence;
    }
  } else {
    state = {
      schemaVersion: 1,
      engine: plan.engine,
      planSha256: plan.planSha256,
      sourceInstanceId: probe.sourceInstanceId,
      phase: 'ready',
    };
    await storage.write(file, state);
  }
  let commandId = state.commandId;
  if (state.phase === 'ready') {
    const body = `${probe.expectedBodySha256}`;
    const command =
      `body=$(mktemp); trap 'rm -f "$body"' EXIT; ` +
      `code=$(curl --silent --show-error --max-time 15 --output "$body" --write-out '%{http_code}' ` +
      `--header 'Host: ${plan.intent.ingress.listener.domain}' ` +
      `'http://${dns}:${plan.intent.ingress.port}${probe.path}'); ` +
      `digest=$(sha256sum "$body" | awk '{print $1}'); printf '%s %s
' "$code" "$digest"; ` +
      `[ "$code" = "${probe.expectedStatus}" ] && [ "$digest" = "${body}" ]`;
    const submitted = await run(api, plan, [
      'ssm',
      'send-command',
      '--instance-ids',
      probe.sourceInstanceId,
      '--document-name',
      'AWS-RunShellScript',
      '--document-version',
      '1',
      '--timeout-seconds',
      '30',
      '--comment',
      `xcsh-ce-${plan.planId}`,
      '--parameters',
      JSON.stringify({ commands: [command], executionTimeout: ['30'] }),
    ]);
    commandId = object10(submitted.Command).CommandId;
    if (typeof commandId !== 'string' || !COMMAND_ID.test(commandId))
      throw new Error('Traffic probe command identity is unavailable');
    state = { ...state, phase: 'submitted', commandId };
    await storage.write(file, state);
  }
  if (typeof commandId !== 'string') throw new Error('Traffic probe command identity is unavailable');
  const deadline = Date.now() + 45000;
  while (true) {
    signal?.throwIfAborted();
    let invocation;
    try {
      invocation = await run(api, plan, [
        'ssm',
        'get-command-invocation',
        '--command-id',
        commandId,
        '--instance-id',
        probe.sourceInstanceId,
      ]);
    } catch (error) {
      if (!(error instanceof AwsNotFoundError) || Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }
    if (['Pending', 'InProgress', 'Delayed'].includes(String(invocation.Status))) {
      if (Date.now() >= deadline) throw new Error('Traffic probe has not converged; resume the saved checkpoint');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }
    const output = invocation.StandardOutputContent;
    const errorOutput = invocation.StandardErrorContent;
    if (
      invocation.CommandId !== commandId ||
      invocation.InstanceId !== probe.sourceInstanceId ||
      invocation.DocumentName !== 'AWS-RunShellScript' ||
      invocation.DocumentVersion !== '1' ||
      typeof output !== 'string' ||
      typeof errorOutput !== 'string' ||
      typeof invocation.Status !== 'string' ||
      typeof invocation.ResponseCode !== 'number'
    )
      throw new Error('Traffic probe response is malformed');
    const match = /^(\d{3}) ([a-f0-9]{64})\n?$/.exec(output);
    const evidence = {
      status:
        invocation.Status === 'Success' && invocation.ResponseCode === 0 && errorOutput === '' && match
          ? 'healthy'
          : 'degraded',
      source: 'aws:ssm:get-command-invocation',
      sourceInstanceId: probe.sourceInstanceId,
      commandId,
      httpStatus: match ? Number(match[1]) : undefined,
      bodySha256: match?.[2],
      expectedStatus: probe.expectedStatus,
      expectedBodySha256: probe.expectedBodySha256,
      observedAt: new Date().toISOString(),
    };
    if (
      evidence.status !== 'healthy' ||
      evidence.httpStatus !== probe.expectedStatus ||
      evidence.bodySha256 !== probe.expectedBodySha256
    ) {
      const attempts = Array.isArray(state.attempts) ? state.attempts.map(object10) : [];
      if (!attempts.some((attempt) => attempt.commandId === commandId))
        attempts.push({
          commandId,
          status: invocation.Status,
          responseCode: invocation.ResponseCode,
          httpStatus: evidence.httpStatus,
          bodySha256: evidence.bodySha256,
          stderrPresent: errorOutput.length > 0,
          observedAt: evidence.observedAt,
        });
      state = { ...state, phase: 'ready', commandId: undefined, attempts: attempts.slice(-40) };
      await storage.write(file, state);
      throw new Error('Traffic probe has not converged; retry the saved checkpoint');
    }
    await storage.write(file, { ...state, phase: 'complete', evidence });
    return evidence;
  }
}
var COMMAND_ID,
  object10 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed AWS traffic evidence');
    return value;
  };
var init_traffic_probe = __esm(() => {
  init_exec();
  COMMAND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
});

// plugins/aws/src/ce/apply.ts
import { chmod, mkdir as mkdir2, mkdtemp as mkdtemp2, rm as rm3, writeFile as writeFile3 } from 'node:fs/promises';
import { join as join4 } from 'node:path';

function observedInstanceTypeNames(observation) {
  return [
    ...new Set(observation.regions.flatMap((region) => region.instanceTypes.map((instance) => instance.name))),
  ].sort();
}
function assertAwsObservationFresh(
  plan,
  current,
  expected = plan.observationFingerprint,
  relevantResourceIds = [
    ...plan.intent.brownfield.resourceIds,
    ...plan.ownershipInventory
      .filter((item) => item.owned && !item.resourceId.startsWith('aws://'))
      .map((item) => item.resourceId),
  ],
) {
  const actual = fingerprintObservation(current, relevantResourceIds);
  if (!matchesObservationFingerprint(expected, current, relevantResourceIds))
    throw new Error(`Stale AWS CE plan: observations changed (expected ${expected}, current ${actual})`);
}
function assertAwsResumeObservationFresh(plan, planned, current, expected, relevantResourceIds, completedActionCount) {
  if (plan.intent.operation === 'teardown' && completedActionCount > 0) {
    assertAwsObservationFresh(plan, current, fingerprintObservation(planned, []), []);
    return;
  }
  assertAwsObservationFresh(plan, current, expected, relevantResourceIds);
}
function assertAwsApplyAllowed(plan, request) {
  if (plan.schemaVersion !== AWS_CE_SCHEMA_VERSION) throw new Error('AWS CE plan schema is unsupported');
  if (plan.engine !== (request.executionEngine ?? 'native'))
    throw new Error('Terraform-owned deployments require the Terraform lifecycle adapter');
  if (request.planId !== plan.planId) throw new Error('The requested AWS CE plan ID does not match the persisted plan');
  if (!safeHexEqual(request.planSha256, plan.planSha256))
    throw new Error('The requested AWS CE plan hash does not match');
  assertAwsWholeSitePowerSupported(plan.intent);
  if (!request.hasUI && !request.authorized && request.env.XCSH_CE_HEADLESS_MUTATIONS !== '1')
    throw new Error('Headless AWS CE mutations require XCSH_CE_HEADLESS_MUTATIONS=1');
  if (
    plan.intent.operation === 'teardown' &&
    !request.hasUI &&
    !request.destructionAuthorized &&
    request.env.XCSH_CE_ALLOW_DESTROY !== '1'
  )
    throw new Error('Headless AWS CE teardown requires XCSH_CE_ALLOW_DESTROY=1');
}
function replaceArgs(args, planSha256, values) {
  return args.map((arg) => {
    let result = arg.replaceAll('__PLAN_SHA256__', planSha256);
    for (const [placeholder, value] of Object.entries(values)) result = result.replaceAll(placeholder, value);
    if (/__[A-Z0-9_]+__/.test(result)) throw new Error(`AWS action has an unresolved runtime placeholder: ${result}`);
    if (Array.from(result).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
      throw new Error('AWS action argv contains a control character');
    return result;
  });
}
function executableAwsActionArgs(action, args) {
  return action.kind === 'nlb-cross-zone-enable' && args[0] === 'modify-load-balancer-attributes'
    ? ['elbv2', ...args]
    : args;
}
function valueAtPath(raw, path) {
  let value = raw;
  for (const segment of path.split('.')) {
    if (Array.isArray(value) && /^\d+$/.test(segment)) value = value[Number(segment)];
    else if (value && typeof value === 'object') value = value[segment];
    else return;
  }
  return typeof value === 'string' && value ? value : undefined;
}
async function assertAwsActionOwnership(plan, action, api, resolved = {}) {
  if (!action.mutates) return;
  const rollbackTargets = new Set();
  if (action.kind === 'brownfield-restore') {
    const source = plan.rollback.resources.find((resource) => resource.id === action.resourceId);
    if (!source) throw new Error('AWS brownfield restoration is not backed by the immutable rollback snapshot');
    const collect = (value) => {
      if (typeof value === 'string') {
        for (const match of value.matchAll(
          /arn:(?:aws|aws-us-gov|aws-cn):elasticloadbalancing:[^,\s]+|(?:i|eni|sg|vpc|subnet|rtb|igw|tgw|tgw-rtb|tgw-attach|tgw-connect-peer|eipalloc|eipassoc)-[0-9a-f]{8,21}/g,
        ))
          rollbackTargets.add(match[0]);
      } else if (Array.isArray(value)) {
        for (const item of value) collect(item);
      } else if (value && typeof value === 'object') {
        for (const item of Object.values(value)) collect(item);
      }
    };
    rollbackTargets.add(source.id);
    collect(source.before);
  }
  const ids = new Set();
  if (action.resourceId && !action.resourceId.startsWith('aws://') && !action.resourceId.includes('__'))
    ids.add(action.resourceId);
  const targetFlags = new Set([
    '--instance-id',
    '--instance-ids',
    '--network-interface-id',
    '--network-interface-ids',
    '--network-interfaces',
    '--allocation-id',
    '--association-id',
    '--group-id',
    '--group-ids',
    '--vpc-id',
    '--internet-gateway-id',
    '--gateway-id',
    '--subnet-id',
    '--subnet-ids',
    '--route-table-id',
    '--transit-gateway-id',
    '--transit-gateway-route-table-id',
    '--transit-gateway-attachment-id',
    '--transit-gateway-connect-peer-id',
    '--target-group-arn',
    '--load-balancer-arn',
    '--listener-arn',
  ]);
  const args = action.args ?? [];
  for (let index = 0; index < args.length; index++) {
    if (!targetFlags.has(args[index])) continue;
    for (let position = index + 1; position < args.length && !args[position].startsWith('--'); position++) {
      let value = args[position];
      for (const [placeholder, replacement] of Object.entries(resolved))
        value = value.replaceAll(placeholder, replacement);
      if (/__[A-Z0-9_]+__/.test(value)) throw new Error('AWS ownership target is unresolved');
      for (const match of value.matchAll(
        /arn:(?:aws|aws-us-gov|aws-cn):elasticloadbalancing:[^,\s]+|(?:i|eni|sg|vpc|subnet|rtb|igw|tgw|tgw-rtb|tgw-attach|tgw-connect-peer|eipalloc|eipassoc)-[0-9a-f]{8,21}/g,
      ))
        ids.add(match[0]);
    }
  }
  const known = new Set(Object.values(resolved));
  for (const id of ids)
    if (!known.has(id) && !rollbackTargets.has(id) && !plan.ownershipInventory.some((item) => item.resourceId === id))
      throw new Error('AWS mutation target is outside the deployment inventory');
  if (!ids.size) return;
  const observed = await observeAwsResources(api, [...ids], plan.region, {
    deploymentName: plan.deploymentName,
    planSha256s: [
      plan.planSha256,
      ...plan.rollback.resources
        .map((resource) => String(resource.before.tags?.['xcsh-plan-sha256'] ?? ''))
        .filter((digest) => /^[a-f0-9]{64}$/.test(digest)),
    ],
  });
  for (const resource of observed) {
    if (!resource.exists) throw new Error('AWS mutation target no longer exists');
    const brownfield =
      rollbackTargets.has(resource.id) ||
      plan.ownershipInventory.some(
        (item) => item.resourceId === resource.id && item.action === 'modify-approved' && !item.owned,
      );
    if (
      !brownfield &&
      (resource.tags['xcsh-managed-by'] !== 'aws-ce' ||
        resource.tags['xcsh-deployment-id'] !== plan.deploymentName ||
        resource.tags['xcsh-execution-engine'] !== plan.engine)
    )
      throw new Error('Live AWS resource belongs to another owner or engine');
  }
}
function flagValue(args, flag) {
  const indexes = args.flatMap((value, index) => (value === flag ? [index] : []));
  if (indexes.length !== 1) return;
  const value = args[indexes[0] + 1];
  return value && !value.startsWith('--') ? value : undefined;
}
async function isAwsBrownfieldRestoreConverged(plan, action, api) {
  if (action.kind !== 'brownfield-restore' || action.args?.[0] !== 'ec2') return false;
  const operation = action.args[1];
  if (
    ![
      'associate-transit-gateway-route-table',
      'disassociate-transit-gateway-route-table',
      'enable-transit-gateway-route-table-propagation',
      'disable-transit-gateway-route-table-propagation',
    ].includes(operation)
  )
    return false;
  const routeTableId = flagValue(action.args, '--transit-gateway-route-table-id');
  const attachmentId = flagValue(action.args, '--transit-gateway-attachment-id');
  const source = plan.rollback.resources.find((resource) => resource.id === routeTableId);
  if (!routeTableId || !source || action.resourceId !== routeTableId || !attachmentId)
    throw new Error('AWS TGW restoration is not bound to the immutable rollback snapshot');
  const key = operation.includes('propagation') ? 'Propagations' : 'Associations';
  const before = Array.isArray(source.before[key]) ? source.before[key] : [];
  const expected = before.filter((item) => item.TransitGatewayAttachmentId === attachmentId);
  if (expected.length > 1) throw new Error('AWS TGW rollback relationship is ambiguous');
  const desired = operation.startsWith('associate-') || operation.startsWith('enable-');
  if (desired !== (expected.length === 1)) throw new Error('AWS TGW restoration differs from the rollback snapshot');
  const [observed] = await observeAwsResources(api, [routeTableId], plan.region, {
    deploymentName: plan.deploymentName,
    planSha256s: [plan.planSha256],
  });
  if (!observed?.exists) throw new Error('AWS TGW restoration target no longer exists');
  const current = Array.isArray(observed.state[key])
    ? observed.state[key].filter((item) => item.TransitGatewayAttachmentId === attachmentId)
    : [];
  if (current.length > 1) throw new Error('AWS TGW live relationship is ambiguous');
  const state = String(current[0]?.State ?? '').toLowerCase();
  return desired
    ? current.length === 1 && ['associated', 'enabled'].includes(state)
    : current.length === 0 || ['disassociated', 'disabled'].includes(state);
}
async function assertGate(action, runtime, plan, checkpoint, persist, storage, ingressContract, api, fetcher, signal) {
  let replacementMutation = false;
  if (action.kind === 'security-group-egress-reset') {
    await resetAwsSecurityGroupEgress(action, plan, checkpoint, api);
    return;
  }
  if (action.kind === 'tgw-attachment-gate') {
    await assertAttachmentAvailable(action, plan, checkpoint, api);
    return;
  }
  for (const { site, binding } of siteBindings(plan).filter(
    ({ site }) => !action.node || site.nodeIndexes.includes(action.node),
  )) {
    if (action.kind === 'registration-gate' || action.kind === 'registration-approve') {
      let instances = Object.fromEntries(
        binding.nodes.map((node, index) => [
          node,
          checkpoint.resolvedValues[`__INSTANCE_${site.nodeIndexes[index]}__`],
        ]),
      );
      const replacementArtifact = `${action.id}-initial-mtu-replacement.json`;
      let replacement;
      if (action.kind === 'registration-gate') {
        try {
          const saved = await storage.read(replacementArtifact);
          if (saved.sourcePlanSha256 !== plan.planSha256 || !saved.plan)
            throw new Error('Initial MTU replacement binding differs');
          replacement = saved.plan;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      const driveReplacement = async (child) => {
        replacementMutation = true;
        checkpoint.childPlanSha256s = [...new Set([...(checkpoint.childPlanSha256s ?? []), child.planSha256])].sort();
        await persist();
        let upgrade;
        try {
          upgrade = await VerifiedUpgradeContract.release(fetcher, signal);
        } catch (error) {
          if (error instanceof Error && error.message.includes('contract download failed'))
            throw new Error('Replacement contract download has not converged');
          throw error;
        }
        const driver = createNativeAwsSiteReplacementDriver(plan, api, storage);
        const result = await runAwsSiteReplacement(child, child.planSha256, driver, runtime, storage, upgrade, signal);
        const childCheckpoint = await storage.read(`${child.planId}.json`);
        for (const [nodeOffset, node] of binding.nodes.entries()) {
          const instance = childCheckpoint.instances?.[node];
          if (typeof instance === 'string' && /^i-[0-9a-f]{8,17}$/.test(instance))
            checkpoint.resolvedValues[`__INSTANCE_${site.nodeIndexes[nodeOffset]}__`] = instance;
        }
        const scoped = scopedAwsApi(api, plan.intent.awsProfile, signal);
        for (const node of site.nodeIndexes) {
          const allocation = checkpoint.resolvedValues[`__EIP_${node}__`];
          if (!allocation) continue;
          const response = await scoped.exec('aws', [
            'ec2',
            'describe-addresses',
            '--allocation-ids',
            allocation,
            '--region',
            plan.region,
            '--output',
            'json',
          ]);
          if (response.exitCode) throw new Error('Replacement EIP observation failed');
          const addresses = JSON.parse(response.stdout).Addresses;
          const association = addresses?.length === 1 ? addresses[0].AssociationId : undefined;
          if (!association || !/^eipassoc-[0-9a-f]{8,17}$/.test(association))
            throw new Error('Replacement EIP association identity is unavailable');
          checkpoint.resolvedValues[`__EIP_ASSOC_${node}__`] = association;
        }
        instances = Object.fromEntries(
          binding.nodes.map((node, index) => [
            node,
            checkpoint.resolvedValues[`__INSTANCE_${site.nodeIndexes[index]}__`],
          ]),
        );
        await persist({
          evidenceKind: 'automatic-preboot-mtu-replacement',
          childPlanId: child.planId,
          childPlanSha256: child.planSha256,
          status: result.status,
          registrationStatus: 'registration' in result && result.registration ? result.registration.status : undefined,
          configurationStatus:
            'configuration' in result && result.configuration ? result.configuration.status : undefined,
          versions: 'versions' in result ? result.versions : undefined,
          observedAt: new Date().toISOString(),
        });
        return result.status === 'registered-with-configured-interfaces';
      };
      if (replacement) {
        const complete = await driveReplacement(replacement);
        if (!complete) return { mutated: true, pending: true };
      }
      const evidence =
        action.kind === 'registration-approve'
          ? await runtime.approveRegistrations(
              binding,
              instances,
              async (record) => {
                checkpoint.resolvedValues[`__REGISTRATION_${String(record.node)}__`] = String(record.registration);
                checkpoint.resolvedValues[`__REGISTRATION_STATE_${String(record.node)}__`] = String(record.state);
                await persist();
              },
              signal,
            )
          : await runtime.observeRegistrations(binding, instances, signal);
      if (['authorization', 'expired', 'malformed', 'ownership-or-response-invalid'].includes(String(evidence.reason)))
        throw new Error(`F5 registration evidence is unavailable: ${String(evidence.reason)}`);
      if (action.kind === 'registration-approve') {
        if (
          !Array.isArray(evidence.nodes) ||
          evidence.nodes.some(
            (node) =>
              !node ||
              typeof node !== 'object' ||
              !['APPROVED', 'ADMITTED', 'ONLINE', 'UPGRADING', 'MAINTENANCE'].includes(String(node.state)),
          )
        )
          throw new Error('Observed F5 registration approval has not converged');
      } else if (evidence.status !== 'healthy') throw new Error('Observed F5 registration has not converged');
      if (action.kind === 'registration-gate') {
        const configuration = await runtime.observeAwsRegisteredConfiguration(
          binding,
          instances,
          site.nodeIndexes.flatMap((node) =>
            plan.interfaces.map((item) => ({
              node: `${plan.deploymentName}-${node}`,
              role: item.role,
              mac: checkpoint.resolvedValues[`__ENI_${node}_${item.index}_MAC__`],
            })),
          ),
          signal,
        );
        if (configuration.status !== 'configured')
          throw new Error('Observed F5 interface configuration has not converged');
        const expected = site.nodeIndexes.flatMap((node) =>
          plan.interfaces.map((item) => ({
            node: `${plan.deploymentName}-${node}`,
            role: item.role,
            mac: checkpoint.resolvedValues[`__ENI_${node}_${item.index}_MAC__`],
            mtu: item.mtu ?? AWS_CE_DEFAULT_INTERFACE_MTU,
          })),
        );
        let preparation;
        try {
          await runtime.ensureAwsInterfaceMtu(
            binding,
            instances,
            expected,
            async (record) => {
              preparation = record;
              await persist(record);
            },
            signal,
          );
        } catch (error) {
          if (
            plan.engine !== 'native' ||
            !(error instanceof Error) ||
            !error.message.includes('coupled VM/site replacement') ||
            !preparation
          )
            throw error;
          let upgrade;
          let versions;
          try {
            upgrade = await VerifiedUpgradeContract.release(fetcher, signal);
            versions = await captureCeReplacementVersions(
              binding,
              String(preparation.uid),
              String(preparation.contractFingerprint),
              runtime,
              upgrade,
              signal,
            );
          } catch (error) {
            if (
              error instanceof Error &&
              (error.message.includes('contract download failed') ||
                error.message.includes('version evidence is unavailable') ||
                error.message.includes('versions are not stable'))
            )
              throw new Error('Replacement contract or version evidence has not converged');
            throw error;
          }
          replacement = compileAwsSiteReplacement(plan, binding.siteName, preparation, {
            versions,
            interfaceIds: Object.fromEntries(
              site.nodeIndexes.flatMap((node) =>
                plan.interfaces.map((item) => [
                  `${plan.deploymentName}-${node}/${item.role}`,
                  checkpoint.resolvedValues[`__ENI_${node}_${item.index}__`],
                ]),
              ),
            ),
            elasticIpAllocationIds: Object.fromEntries(
              site.nodeIndexes.map((node) => [
                `${plan.deploymentName}-${node}`,
                checkpoint.resolvedValues[`__EIP_${node}__`],
              ]),
            ),
            bootstrapTokenNames: Object.fromEntries(
              site.nodeIndexes.map((node) => [
                `${plan.deploymentName}-${node}`,
                checkpoint.resolvedValues[`__F5_TOKEN_${node}__`],
              ]),
            ),
          });
          await storage.write(replacementArtifact, { sourcePlanSha256: plan.planSha256, plan: replacement });
          const complete = await driveReplacement(replacement);
          if (!complete) return { mutated: true, pending: true };
        }
        if ((await runtime.observeRegistrations(binding, instances, signal)).status !== 'healthy')
          throw new Error('Observed F5 registration after interface update has not converged');
      }
    }
    if (action.kind === 'health-gate') {
      const evidence = await runtime.observeHealth(binding, signal);
      if (
        [
          'authorization',
          'expired',
          'malformed',
          'ownership-or-response-invalid',
          'provider-health-contract-unavailable',
        ].includes(String(evidence.reason))
      )
        throw new Error(`F5 health evidence is unavailable: ${String(evidence.reason)}`);
      if (evidence.status !== 'healthy') throw new Error('Observed F5 site health has not converged');
    }
  }
  if (action.kind === 'f5-routing-configure')
    await configureAwsRouting(runtime, plan, checkpoint, api, persist, signal);
  if (action.kind === 'f5-ingress-configure') {
    if (!ingressContract) throw new Error('Verified ingress contract is unavailable');
    const evidence = await ensureAwsPlatformIngress(
      plan,
      runtime,
      storage,
      ingressContract,
      checkpoint.resolvedValues,
      api,
      signal,
    );
    if (evidence?.listener !== 'configured') throw new Error('Observed F5 ingress listener has not converged');
    await persist(evidence);
  }
  if (action.kind === 'bgp-gate' || action.kind === 'nlb-gate') {
    const evidence = await collectAwsNetworkHealth(
      action.kind === 'bgp-gate' ? 'bgp' : 'nlb',
      plan,
      checkpoint,
      api,
      signal,
    );
    if (evidence.status !== 'healthy') throw new Error('Observed AWS network health has not converged');
  }
  if (action.kind === 'tgw-route-gate') {
    const evidence = await collectAwsNetworkHealth('routes', plan, checkpoint, api, signal);
    await persist(evidence);
    if (evidence.status === 'unknown') throw new Error('AWS TGW route evidence is unavailable');
    if (evidence.status !== 'healthy') throw new Error('Observed AWS TGW routes have not converged');
  }
  if (action.kind === 'traffic-gate') {
    if (plan.intent.ingress?.mode !== 'nlb')
      throw new Error('Collected traffic-gate evidence is unavailable for this profile');
    if (!ingressContract) throw new Error('Verified ingress contract is unavailable');
    const ingress = await ensureAwsPlatformIngress(
      plan,
      runtime,
      storage,
      ingressContract,
      checkpoint.resolvedValues,
      api,
      signal,
    );
    if (ingress?.listener !== 'configured') throw new Error('Observed F5 ingress listener has not converged');
    const evidence = await collectAwsTrafficProbe(plan, checkpoint, storage, api, signal);
    await persist(evidence);
    if (evidence.status !== 'healthy') throw new Error('Observed end-to-end AWS traffic has not converged');
  }
  return replacementMutation ? { mutated: true, pending: false } : undefined;
}
async function executeAwsCeApply(input, ctx, api, platform, fetcher = fetch, signal) {
  if (
    Object.hasOwn(input, 'f5Capabilities') ||
    Object.hasOwn(input, 'f5Evidence') ||
    Object.hasOwn(input, 'bootstrapRefs')
  )
    throw new Error('Caller-supplied capability or health assertions are unsupported');
  const { plan, observation } = await loadAwsPlan(ctx.sessionManager, input.planId, input.planSha256);
  const existing = await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
  const authorized =
    existing?.authorization?.planSha256 === plan.planSha256 && existing.authorization.mutations === true;
  assertAwsApplyAllowed(plan, {
    planId: input.planId,
    planSha256: input.planSha256,
    hasUI: ctx.hasUI,
    env: process.env,
    authorized,
    destructionAuthorized: authorized && existing?.authorization?.destruction,
  });
  api = scopedAwsApi(api, plan.intent.awsProfile, signal);
  if (
    plan.intent.operation === 'deploy' &&
    plan.interfaces.some((item) => !['slo', 'sli'].includes(item.role) || item.addressing.mode !== 'dhcp')
  )
    throw new Error('The requested interface configuration needs an explicit supported F5 wire mapping');
  const f5Capabilities = await platform.capabilities(plan.intent.platformContext);
  const runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
  if (siteBindings(plan).some(({ site }) => site.nodeIndexes.length === 3)) runtime.requireAwsHaContract();
  if (plan.routing.profile === 'tgw-connect') runtime.requireAwsRoutingContract();
  const storage = await platform.storage({
    deploymentId: plan.deploymentName,
    engine: plan.engine,
    provider: 'aws',
    account: plan.accountId,
    region: plan.region,
  });
  const ingressContract =
    plan.intent.ingress?.mode === 'nlb' ? await VerifiedIngressContract.release(fetcher, signal) : undefined;
  if (existing && existing.engine !== plan.engine)
    throw new Error('Checkpoint execution engine differs from deployment');
  const completedRoutingAction = plan.actions.find((action) => action.kind === 'f5-routing-configure');
  if (
    plan.intent.operation === 'deploy' &&
    existing &&
    completedRoutingAction &&
    existing.completedActionIds.includes(completedRoutingAction.id)
  )
    await configureAwsRouting(
      runtime,
      plan,
      existing,
      api,
      () => saveAwsCheckpoint(ctx.sessionManager, existing),
      signal,
    );
  const brownfieldIds = [
    ...new Set([
      ...plan.intent.brownfield.resourceIds,
      ...plan.intent.brownfield.routeTableIds,
      ...plan.intent.brownfield.transitGatewayRouteTableIds,
    ]),
  ].sort();
  const resourceIdPattern =
    /^(?:arn:(?:aws|aws-us-gov|aws-cn):[a-z0-9-]+:[a-z0-9-]*:\d{12}:[A-Za-z0-9_+=,.@:/-]+|(?:i|vpc|subnet|rtb|igw|tgw|tgw-attach|tgw-connect-peer|tgw-rtb|eni|sg|eipalloc|eipassoc|nat|vpce)-[0-9a-f]{8,21})$/;
  const observedOwnedIds = () =>
    [
      ...new Set([
        ...observation.resources.filter((resource) => resource.owned).map((resource) => resource.id),
        ...Object.values(existing?.resolvedValues ?? {}).filter((value) => resourceIdPattern.test(value)),
      ]),
    ].sort();
  const ownershipPlanSha256s = [
    ...new Set([
      ...observation.ownershipPlanSha256s,
      ...(existing?.childPlanSha256s ?? []),
      ...observation.resources
        .filter((resource) => resource.owned)
        .map((resource) => resource.tags['xcsh-plan-sha256'])
        .filter((digest) => /^[a-f0-9]{64}$/.test(digest ?? '')),
      plan.planSha256,
    ]),
  ].sort();
  const current = await discoverAwsCompute(
    {
      awsProfile: plan.intent.awsProfile,
      vpcMode: plan.intent.vpc.mode,
      accountId: plan.accountId,
      partition: plan.partition,
      deploymentName: plan.deploymentName,
      requiredEnis: plan.interfaces.length,
      nodeCount: plan.topology.nodeCount,
      instanceTypes: observedInstanceTypeNames(observation),
      brownfieldResourceIds: brownfieldIds,
      observedOwnedResourceIds: observedOwnedIds(),
      ownedPlanSha256s: ownershipPlanSha256s,
      resourceRegion: plan.region,
      egressMode: plan.egress.mode,
      routingProfile: plan.routing.profile,
      f5Capabilities,
    },
    api,
    fetcher,
  );
  const childReplacementActive =
    Boolean(existing?.childPlanSha256s?.length) &&
    plan.actions.some((action) => action.id === existing?.failedActionId && action.kind === 'registration-gate');
  assertAwsResumeObservationFresh(
    plan,
    observation,
    current,
    childReplacementActive
      ? plan.observationFingerprint
      : (existing?.observationFingerprint ?? plan.observationFingerprint),
    childReplacementActive ? brownfieldIds : [...brownfieldIds, ...observedOwnedIds()],
    existing?.completedActionIds.length ?? 0,
  );
  if (existing?.ownedStateFingerprint && !childReplacementActive) {
    if (
      !matchesOwnedResourceFingerprint(
        existing.ownedStateFingerprint,
        current.resources.filter((resource) => observedOwnedIds().includes(resource.id)),
      )
    )
      throw new Error('Stale AWS CE plan: owned resource tags, targets, attachments, peers, or state changed');
  }
  const expectedPrefix = plan.actions.slice(0, existing?.completedActionIds.length ?? 0).map((action) => action.id);
  if (existing && JSON.stringify(existing.completedActionIds) !== JSON.stringify(expectedPrefix))
    throw new Error('AWS CE checkpoint is not an ordered prefix of the immutable plan');
  if (ctx.hasUI) {
    if (
      !authorized &&
      !(await ctx.ui.confirm(
        'Apply immutable AWS CE plan',
        `${plan.planId}
${plan.planSha256}`,
      ))
    )
      throw new Error('AWS CE apply was not approved');
    if (
      plan.intent.operation === 'teardown' &&
      !(authorized && existing?.authorization?.destruction) &&
      !(await ctx.ui.confirm(
        'Tear down AWS Customer Edge',
        'Restore approved brownfield state and delete only owned resources?',
      ))
    )
      throw new Error('AWS CE teardown was not approved');
  }
  const completed = new Set(existing?.completedActionIds ?? []);
  const checkpoint = {
    schemaVersion: AWS_CE_SCHEMA_VERSION,
    engine: plan.engine,
    authorization: { planSha256: plan.planSha256, mutations: true, destruction: plan.intent.operation === 'teardown' },
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: [...completed],
    childPlanSha256s: existing?.childPlanSha256s ? [...existing.childPlanSha256s] : undefined,
    observationFingerprint: existing?.observationFingerprint,
    resolvedValues: { ...(existing?.resolvedValues ?? {}) },
    state: 'running',
    pendingCreate: existing?.pendingCreate,
    pendingDelete: existing?.pendingDelete,
  };
  for (const action of plan.actions) {
    if (completed.has(action.id)) continue;
    let launchDirectory;
    let gateMutation = false;
    const previousObservationFingerprint = checkpoint.observationFingerprint;
    const previousOwnedStateFingerprint = checkpoint.ownedStateFingerprint;
    const previousCaptures = new Map(
      [...(action.capture ? [action.capture] : []), ...(action.captures ?? [])].map((capture) => [
        capture.placeholder,
        checkpoint.resolvedValues[capture.placeholder],
      ]),
    );
    try {
      if (!(hasDeleteRecovery(action) && checkpoint.pendingDelete?.actionId === action.id))
        await assertAwsActionOwnership(plan, action, api, checkpoint.resolvedValues);
      const convergenceDeadline = Date.now() + 15 * 60000;
      while (true) {
        try {
          const gate = await assertGate(
            action,
            runtime,
            plan,
            checkpoint,
            async (evidence) => {
              if (evidence)
                await storage.write(`${action.id}-evidence.json`, {
                  ...evidence,
                  planId: plan.planId,
                  planSha256: plan.planSha256,
                });
              return saveAwsCheckpoint(ctx.sessionManager, checkpoint);
            },
            storage,
            ingressContract,
            api,
            fetcher,
            signal,
          );
          gateMutation = gate?.mutated === true;
          if (gate?.pending) break;
          if (action.kind === 'f5-routing-configure')
            await persistAwsNativeRoutingCheckpoint(plan, checkpoint, storage);
          break;
        } catch (error) {
          if (
            signal?.aborted ||
            !(error instanceof Error) ||
            !error.message.includes('has not converged') ||
            Date.now() >= convergenceDeadline
          )
            throw error;
          await new Promise((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(new Error('AWS CE convergence cancelled'));
            };
            const timer = setTimeout(() => {
              signal?.removeEventListener('abort', abort);
              resolve();
            }, 1e4);
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort();
          });
        }
      }
      if (action.command && action.args) {
        if (action.requiresBootstrap && action.node) {
          const selected = siteBindings(plan).find(({ site }) => site.nodeIndexes.includes(action.node ?? 0));
          if (!selected) throw new Error('Bootstrap node has no site binding');
          const { site, binding } = selected;
          const hostname = `${plan.deploymentName}-${action.node}`;
          if (plan.interfaces.some((item) => !['slo', 'sli'].includes(item.role) || item.addressing.mode !== 'dhcp'))
            throw new Error('This interface configuration requires an explicit supported F5 wire mapping');
          const siteCheckpoint = async (record) => {
            checkpoint.resolvedValues[`__F5_SITE_${site.nodeIndexes[0]}_UID__`] = String(record.uid);
            await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
          };
          if (site.nodeIndexes.length === 3) {
            const position = site.nodeIndexes.indexOf(action.node);
            const previous = site.nodeIndexes[position - 1];
            if (previous !== undefined) {
              const launchedAt = checkpoint.resolvedValues[`__HA_LAUNCHED_AT_${previous}__`];
              if (!launchedAt || Number.isNaN(Date.parse(launchedAt)))
                throw new Error('Prior HA node launch boundary is unavailable');
              await waitUntil(Date.parse(launchedAt) + 180000, signal);
            }
            await runtime.ensureSite(
              binding,
              {
                schemaVersion: 2,
                provider: 'aws',
                haMode: 'three-node',
                nodes: site.nodeIndexes.map((node) => ({
                  hostname: `${plan.deploymentName}-${node}`,
                  interfaces: plan.interfaces.map((item) => ({
                    name: item.role,
                    mtu: item.mtu ?? AWS_CE_DEFAULT_INTERFACE_MTU,
                    ethernet_interface: {
                      device: item.guestDevice,
                      mac: checkpoint.resolvedValues[`__ENI_${node}_${item.index}_MAC__`],
                    },
                    network_option:
                      item.role === 'slo' ? { site_local_network: {} } : { site_local_inside_network: {} },
                    dhcp_client: {},
                  })),
                })),
                settings: {},
              },
              siteCheckpoint,
              signal,
            );
          } else await runtime.reserveSite(binding, siteCheckpoint, signal);
          const root = storage.directory;
          await mkdir2(root, { recursive: true, mode: 448 });
          await chmod(root, 448);
          launchDirectory = await mkdtemp2(join4(root, 'node-'));
          await chmod(launchDirectory, 448);
          const path = join4(launchDirectory, 'cloud-init.yaml');
          const tokenName = `${plan.deploymentName.slice(0, 40)}-${action.node}-${plan.planSha256.slice(0, 12)}`;
          const material = await runtime.bootstrap(
            binding,
            hostname,
            tokenName,
            async (secret) => {
              await storage.write(`${tokenName}.json`, secret);
              checkpoint.resolvedValues[`__F5_TOKEN_${action.node}__`] = tokenName;
              await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
            },
            signal,
          );
          await writeFile3(path, renderAwsCeCloudInit({ nodeName: hostname, material }), { mode: 384 });
          checkpoint.resolvedValues.__BOOTSTRAP_FILE__ = path;
        }
        const args = executableAwsActionArgs(
          action,
          replaceArgs(action.args, plan.planSha256, checkpoint.resolvedValues),
        );
        const result =
          action.kind === 'elastic-ip-associate'
            ? await associateAwsCeEip(api, plan, args, signal)
            : hasCreateRecovery(action)
              ? await executeRecoverableCreate(
                  api,
                  plan,
                  action,
                  args,
                  checkpoint,
                  () => saveAwsCheckpoint(ctx.sessionManager, checkpoint),
                  signal,
                )
              : hasDeleteRecovery(action)
                ? await executeRecoverableDelete(
                    api,
                    plan,
                    action,
                    args,
                    checkpoint,
                    () => saveAwsCheckpoint(ctx.sessionManager, checkpoint),
                    ownershipPlanSha256s,
                    signal,
                  )
                : action.kind === 'brownfield-restore' &&
                    (await isAwsBrownfieldRestoreConverged(plan, { ...action, args }, api))
                  ? { exitCode: 0, stdout: '{}', stderr: '' }
                  : await api.exec(action.command, args);
        if (launchDirectory) {
          delete checkpoint.resolvedValues.__BOOTSTRAP_FILE__;
          await rm3(launchDirectory, { recursive: true, force: true });
          launchDirectory = undefined;
        }
        if (result.exitCode !== 0) throw new Error(`AWS action ${action.id} failed with exit code ${result.exitCode}`);
        if (action.capture || action.captures) {
          let raw;
          try {
            raw = JSON.parse(result.stdout);
          } catch {
            throw new Error(`AWS action ${action.id} returned invalid capture JSON`);
          }
          for (const capture of [...(action.capture ? [action.capture] : []), ...(action.captures ?? [])]) {
            const value = valueAtPath(raw, capture.path);
            if (!value) throw new Error(`AWS action ${action.id} did not return ${capture.path}`);
            checkpoint.resolvedValues[capture.placeholder] = value;
          }
          if (
            action.kind === 'instance-run' &&
            action.node &&
            siteBindings(plan).some(
              ({ site }) => site.nodeIndexes.length === 3 && site.nodeIndexes.includes(action.node ?? 0),
            )
          )
            checkpoint.resolvedValues[`__HA_LAUNCHED_AT_${action.node}__`] ??= new Date().toISOString();
        }
      }
      if (action.mutates || gateMutation) {
        const ids = [
          ...new Set([
            ...brownfieldIds,
            ...observation.resources.filter((resource) => resource.owned).map((resource) => resource.id),
            ...Object.values(checkpoint.resolvedValues).filter((value) => resourceIdPattern.test(value)),
          ]),
        ].sort();
        if (ids.length) {
          const resources = await observeAwsResources(api, ids, plan.region, {
            deploymentName: plan.deploymentName,
            planSha256s: ownershipPlanSha256s,
          });
          const ownedIds = ids.filter((id) => !brownfieldIds.includes(id));
          checkpoint.ownedStateFingerprint = fingerprintOwnedResources(
            resources.filter((resource) => ownedIds.includes(resource.id)),
          );
          checkpoint.observationFingerprint = fingerprintObservation({ ...current, resources }, ids);
        }
      }
      if (gateMutation) {
        const saved = await storage.read(`${action.id}-initial-mtu-replacement.json`);
        const child = saved.plan;
        const childCheckpoint = child ? await storage.read(`${child.planId}.json`) : undefined;
        if (childCheckpoint?.phase !== 'complete')
          throw new Error('Automatic preboot MTU replacement has not converged');
      }
      completed.add(action.id);
      checkpoint.completedActionIds = [...completed];
      checkpoint.failedActionId = undefined;
      const pendingCreate = checkpoint.pendingCreate;
      const pendingDelete = checkpoint.pendingDelete;
      checkpoint.pendingCreate = undefined;
      checkpoint.pendingDelete = undefined;
      try {
        await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
      } catch (error) {
        checkpoint.pendingCreate = pendingCreate;
        checkpoint.pendingDelete = pendingDelete;
        completed.delete(action.id);
        checkpoint.completedActionIds = [...completed];
        throw error;
      }
    } catch (error) {
      if (!gateMutation) {
        checkpoint.observationFingerprint = previousObservationFingerprint;
        checkpoint.ownedStateFingerprint = previousOwnedStateFingerprint;
      }
      if (checkpoint.pendingCreate?.actionId === action.id) {
        for (const [placeholder, value] of previousCaptures) {
          if (value === undefined) delete checkpoint.resolvedValues[placeholder];
          else checkpoint.resolvedValues[placeholder] = value;
        }
      }
      if (launchDirectory) await rm3(launchDirectory, { recursive: true, force: true });
      delete checkpoint.resolvedValues.__BOOTSTRAP_FILE__;
      checkpoint.state = 'partial';
      checkpoint.failedActionId = action.id;
      await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}. Resume with the same plan ID and SHA-256; ${completed.size}/${plan.actions.length} actions are checkpointed.`,
      );
    }
  }
  checkpoint.state = 'complete';
  await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
  return { plan, checkpoint };
}
var waitUntil = async (notBefore, signal) => {
  const remaining = notBefore - Date.now();
  if (remaining <= 0) return;
  await new Promise((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('AWS CE HA admission cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }, remaining);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
};
var init_apply = __esm(() => {
  init_ingress_contract();
  init_replacement_versions();
  init_upgrade_contract();
  init_artifacts();
  init_canonical();
  init_create_recovery();
  init_delete_recovery();
  init_discovery();
  init_native_routing_checkpoint();
  init_native_site_replacement();
  init_network_health();
  init_platform_ingress();
  init_routing_apply();
  init_site_replacement();
  init_traffic_probe();
  init_types2();
});

// plugins/terraform/src/literal.ts
var terraformLiteral = (value) => value.replaceAll('${', () => '$${').replaceAll('%{', () => '%%{');

// plugins/aws/src/ce/terraform-foundation.ts
import { createHash as createHash4 } from 'node:crypto';
import { readFile as readFile3 } from 'node:fs/promises';

function renderAwsTerraformFoundation(plan, bootstrapByNode = {}) {
  verifyAwsCePlan(plan);
  assertAwsWholeSitePowerSupported(plan.intent);
  if (plan.engine !== 'terraform' || plan.intent.operation !== 'deploy')
    throw new Error('Terraform foundation requires a Terraform deployment plan');
  const intent = plan.intent;
  if (intent.vpc.mode !== 'greenfield' || intent.egress.mode !== 'elastic-ip')
    throw new Error('Terraform foundation currently requires greenfield VPC and Elastic IP egress');
  if (intent.interfaces.some((item) => item.addressing.mode !== 'dhcp'))
    throw new Error('Terraform foundation static addressing requires explicit translation');
  const keys = Object.keys(bootstrapByNode);
  if (keys.some((key) => !/^[1-3]$/.test(key) || Number(key) > intent.topology.nodeCount))
    throw new Error('Invalid Terraform node admission');
  const admitted = keys.map(Number);
  const hasHaSite = siteTopology(intent).some((site) => site.nodeIndexes.length === 3);
  const resource = {};
  const add = (type, name, value) => {
    resource[type] ??= {};
    resource[type][name] = value;
  };
  const tags = (node, index) => ({
    'xcsh-managed-by': 'aws-ce',
    'xcsh-execution-engine': 'terraform',
    'xcsh-deployment-id': intent.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
    'ves-io-site-name': node ? siteForNode(intent, node).name : intent.siteName,
    ...(node ? { 'xcsh-node-index': String(node) } : {}),
    ...(index !== undefined ? { 'xcsh-interface-index': String(index) } : {}),
  });
  add('aws_vpc', 'ce', {
    cidr_block: intent.vpc.cidr,
    enable_dns_support: true,
    enable_dns_hostnames: true,
    tags: tags(),
  });
  add('aws_internet_gateway', 'ce', { vpc_id: ref('aws_vpc.ce.id'), tags: tags() });
  const staticRoutes = staticAzRoutes(intent);
  for (const role of new Set(intent.interfaces.map((item) => item.role)))
    if (role !== 'sli' || !staticRoutes.length)
      add('aws_route_table', role, { vpc_id: ref('aws_vpc.ce.id'), tags: tags() });
  for (const az of staticRoutes)
    add('aws_route_table', `static_${az.node}`, { vpc_id: ref('aws_vpc.ce.id'), tags: tags(az.node) });
  add('aws_route', 'internet', {
    route_table_id: ref('aws_route_table.slo.id'),
    destination_cidr_block: '0.0.0.0/0',
    gateway_id: ref('aws_internet_gateway.ce.id'),
  });
  for (const [index, group] of intent.securityGroups.entries()) {
    const rules = (direction) => {
      const configured = group[direction].map((rule) => ({
        protocol: rule.protocol,
        from_port: rule.fromPort ?? 0,
        to_port: rule.toPort ?? 0,
        cidr_blocks: rule.cidrs,
        ipv6_cidr_blocks: [],
        prefix_list_ids: [],
        security_groups: [],
        self: rule.self ?? false,
        description: '',
      }));
      if (direction === 'ingress' && hasHaSite && !configured.some((rule) => rule.self))
        configured.push({
          protocol: '-1',
          from_port: 0,
          to_port: 0,
          cidr_blocks: [],
          ipv6_cidr_blocks: [],
          prefix_list_ids: [],
          security_groups: [],
          self: true,
          description: 'F5 CE HA intra-cluster communication',
        });
      return configured;
    };
    add('aws_security_group', `group_${index}`, {
      name: literal(`${intent.deploymentName}-${group.name}`),
      description: 'Customer Edge deployment security group',
      vpc_id: ref('aws_vpc.ce.id'),
      ingress: rules('ingress'),
      egress: rules('egress'),
      tags: tags(),
    });
  }
  const interfaceOutputs = {};
  const instanceOutputs = {};
  for (let node = 1; node <= intent.topology.nodeCount; node++) {
    for (const item of intent.interfaces) {
      const name = `node_${node}_nic_${item.index}`;
      const subnet = item.subnets[node - 1];
      if (!subnet?.cidr) throw new Error('Terraform foundation subnet CIDR is missing');
      add('aws_subnet', name, {
        vpc_id: ref('aws_vpc.ce.id'),
        availability_zone: subnet.availabilityZone,
        cidr_block: subnet.cidr,
        tags: tags(node, item.index),
      });
      add('aws_network_interface', name, {
        subnet_id: ref(`aws_subnet.${name}.id`),
        security_groups: interfaceSecurityGroups(intent, item.index).map((name) =>
          ref(`aws_security_group.group_${intent.securityGroups.findIndex((group) => group.name === name)}.id`),
        ),
        source_dest_check: false,
        ...(item.role === 'sli' && intent.ingress?.mode === 'nlb'
          ? { private_ips: [intent.ingress.listener.privateAddresses?.[node - 1]] }
          : {}),
        tags: tags(node, item.index),
      });
      add('aws_route_table_association', name, {
        subnet_id: ref(`aws_subnet.${name}.id`),
        route_table_id: ref(
          `aws_route_table.${item.role === 'sli' && staticRoutes.length ? `static_${node}` : item.role}.id`,
        ),
      });
      interfaceOutputs[`${node}:${item.index}`] = {
        id: ref(`aws_network_interface.${name}.id`),
        subnet_id: ref(`aws_subnet.${name}.id`),
        mac: ref(`aws_network_interface.${name}.mac_address`),
        private_ip: ref(`aws_network_interface.${name}.private_ip`),
        site_name: siteForNode(intent, node).name,
        node,
        index: item.index,
        role: item.role,
      };
    }
    add('aws_eip', `node_${node}`, { domain: 'vpc', tags: tags(node) });
    if (!admitted.includes(node)) continue;
    const bootstrap = bootstrapByNode[String(node)];
    if (
      !bootstrap.startsWith('#cloud-config') ||
      !bootstrap.includes('/etc/vpm/user_data') ||
      /__\w+__/.test(bootstrap)
    )
      throw new Error('Terraform node admission requires resolved platform cloud-init');
    add('aws_instance', `node_${node}`, {
      ami: intent.image.amiId,
      instance_type: intent.instance.type,
      user_data_base64: Buffer.from(bootstrap).toString('base64'),
      user_data_replace_on_change: true,
      ...(intent.instance.instanceProfileArn
        ? { iam_instance_profile: intent.instance.instanceProfileArn.split('/').at(-1) }
        : {}),
      network_interface: intent.interfaces.map((item) => ({
        device_index: item.index,
        network_interface_id: ref(`aws_network_interface.node_${node}_nic_${item.index}.id`),
        delete_on_termination: false,
      })),
      root_block_device: [
        { volume_size: intent.instance.diskGiB, volume_type: 'gp3', delete_on_termination: true, encrypted: true },
      ],
      tags: tags(node),
      volume_tags: tags(node),
      depends_on: ['aws_route.internet', `aws_route_table_association.node_${node}_nic_0`],
    });
    add('aws_eip_association', `node_${node}`, {
      allocation_id: ref(`aws_eip.node_${node}.id`),
      network_interface_id: ref(`aws_network_interface.node_${node}_nic_0.id`),
      depends_on: [`aws_instance.node_${node}`],
    });
    instanceOutputs[String(node)] = {
      id: ref(`aws_instance.node_${node}.id`),
      site_name: siteForNode(intent, node).name,
      hostname: `${intent.deploymentName}-${node}`,
    };
  }
  const ingress = awsCeNlbIngress(intent);
  if (ingress) {
    const check = nlbSettings(intent).healthCheck;
    const inside = intent.interfaces.find((item) => item.role === 'sli');
    if (!inside) throw new Error('NLB ingress requires an explicit SLI interface');
    add('aws_lb', 'ce', {
      name: literal(`${intent.deploymentName}-nlb`),
      internal: ingress.scheme === 'internal',
      load_balancer_type: 'network',
      ...(intent.ingress?.mode === 'nlb'
        ? {
            subnet_mapping: intent.ingress.loadBalancer.subnetIds.map((subnet_id, index) => ({
              subnet_id,
              private_ipv4_address:
                intent.ingress?.mode === 'nlb' ? intent.ingress.loadBalancer.privateAddresses[index] : '',
            })),
          }
        : {
            subnets: intent.interfaces[0].subnets.map((_subnet, index) => ref(`aws_subnet.node_${index + 1}_nic_0.id`)),
          }),
      enable_cross_zone_load_balancing: true,
      tags: tags(),
    });
    add('aws_lb_target_group', 'ce', {
      name: literal(`${intent.deploymentName}-ce`),
      port: ingress.port,
      protocol: 'TCP',
      target_type: 'ip',
      vpc_id: intent.ingress?.mode === 'nlb' ? intent.ingress.loadBalancer.vpcId : ref('aws_vpc.ce.id'),
      health_check: [
        {
          protocol: check.protocol,
          port: String(check.port),
          interval: check.intervalSeconds,
          timeout: check.timeoutSeconds,
          healthy_threshold: check.healthyThreshold,
          unhealthy_threshold: check.unhealthyThreshold,
          ...(check.path ? { path: check.path } : {}),
        },
      ],
      tags: tags(),
    });
    add('aws_lb_listener', 'ce', {
      load_balancer_arn: ref('aws_lb.ce.arn'),
      port: ingress.port,
      protocol: 'TCP',
      default_action: [{ type: 'forward', target_group_arn: ref('aws_lb_target_group.ce.arn') }],
      tags: tags(),
    });
    for (const node of admitted)
      add('aws_lb_target_group_attachment', `node_${node}`, {
        target_group_arn: ref('aws_lb_target_group.ce.arn'),
        target_id:
          intent.ingress?.mode === 'nlb'
            ? intent.ingress.listener.privateAddresses?.[node - 1]
            : ref(`aws_network_interface.node_${node}_nic_${inside.index}.private_ip`),
        port: ingress.port,
        ...(intent.ingress?.mode === 'nlb' ? { availability_zone: 'all' } : {}),
        depends_on: [`aws_instance.node_${node}`],
      });
  }
  return JSON.stringify({
    terraform: {
      required_version: `= ${AWS_CE_TERRAFORM_VERSION}`,
      required_providers: { aws: { source: 'hashicorp/aws', version: `= ${AWS_CE_TERRAFORM_PROVIDER_VERSION}` } },
    },
    provider: {
      aws: {
        region: intent.region,
        allowed_account_ids: [intent.accountId],
        ...(intent.awsProfile ? { profile: literal(intent.awsProfile) } : {}),
      },
    },
    resource,
    output: {
      ce_vpc_id: { value: ref('aws_vpc.ce.id') },
      ce_interfaces: { value: interfaceOutputs },
      ce_instances: { value: instanceOutputs },
      ...(ingress
        ? {
            ce_ingress: {
              value: {
                load_balancer_arn: ref('aws_lb.ce.arn'),
                dns_name: ref('aws_lb.ce.dns_name'),
                target_group_arn: ref('aws_lb_target_group.ce.arn'),
                listener_arn: ref('aws_lb_listener.ce.arn'),
                port: ingress.port,
                scheme: ingress.scheme,
              },
            },
          }
        : {}),
    },
  });
}
async function awsTerraformFoundationDeployment(plan, bootstrapByNode = {}) {
  const configuration = renderAwsTerraformFoundation(plan, bootstrapByNode);
  const providerLock = await readFile3(
    new URL('./assets/plugins/aws/terraform/provider-lock.hcl', import.meta.url),
    'utf8',
  );
  if (createHash4('sha256').update(providerLock).digest('hex') !== AWS_CE_PROVIDER_LOCK_SHA256)
    throw new Error('AWS provider lock changed');
  return {
    schemaVersion: 1,
    deploymentId: plan.intent.deploymentName,
    engine: 'terraform',
    scope: { cloud: 'aws', account: plan.intent.accountId, region: plan.intent.region },
    terraformVersion: AWS_CE_TERRAFORM_VERSION,
    configuration,
    providerLock,
    backendIdentity: `local:${plan.intent.deploymentName}`,
  };
}
var ref = (address) => `\${${address}}`,
  literal;
var init_terraform_foundation = __esm(() => {
  init_static_routing();
  init_artifacts();
  init_planner();
  literal = terraformLiteral;
});

// plugins/aws/src/ce/terraform-connect.ts
function renderAwsTerraformConnect(plan, observation, bootstrapByNode) {
  const config = JSON.parse(renderAwsTerraformFoundation(plan, bootstrapByNode));
  const intent = plan.intent;
  if (intent.routing.profile !== 'tgw-connect')
    throw new Error('Terraform Connect rendering requires the TGW Connect profile');
  if (Object.keys(bootstrapByNode).length !== intent.topology.nodeCount)
    throw new Error('Admit every selected node before creating Connect peers');
  if (intent.routing.transportAttachmentId || (intent.routes ?? []).length)
    throw new Error('Terraform brownfield transport and route restoration require explicit lifecycle translation');
  if (
    !intent.routing.transitGatewayId ||
    !/^tgw-[0-9a-f]{8,17}$/.test(intent.routing.transitGatewayId) ||
    (intent.routing.associations ?? []).length > 1
  )
    throw new Error('Terraform Connect requires one gateway and at most one association per attachment');
  if (
    !Number.isInteger(intent.routing.customerAsn) ||
    (intent.routing.customerAsn ?? 0) < 1 ||
    (intent.routing.customerAsn ?? 0) > 4294967295 ||
    intent.routing.customerAsn === intent.routing.transitGatewayAsn
  )
    throw new Error('Terraform Connect customer ASN is invalid');
  const cidrs = observedConnectCidrs(intent, observation);
  const peers =
    intent.routing.connectPeers ??
    (intent.routing.insideCidrs ?? []).map((insideCidr, index) => ({
      node: index + 1,
      insideCidr,
      transportInterfaceIndex: 0,
      transitGatewayAddress: undefined,
    }));
  if (!peers.length) throw new Error('Terraform Connect peer topology is missing');
  const resource = config.resource;
  const add = (type, name, value) => {
    resource[type] ??= {};
    resource[type][name] = value;
  };
  const tags = resource.aws_vpc.ce.tags;
  add('aws_ec2_transit_gateway_vpc_attachment', 'transport', {
    vpc_id: ref2('aws_vpc.ce.id'),
    transit_gateway_id: intent.routing.transitGatewayId,
    subnet_ids: [
      ...new Map(
        intent.interfaces[1].subnets.map((subnet, index) => [
          subnet.availabilityZone,
          ref2(`aws_subnet.node_${index + 1}_nic_1.id`),
        ]),
      ).values(),
    ],
    appliance_mode_support: 'enable',
    transit_gateway_default_route_table_association: false,
    transit_gateway_default_route_table_propagation: false,
    tags,
  });
  const tables = (attachment, name) => {
    for (const [index, table] of (intent.routing.associations ?? []).entries())
      add('aws_ec2_transit_gateway_route_table_association', `${name}_${index}`, {
        transit_gateway_attachment_id: attachment,
        transit_gateway_route_table_id: table,
      });
    for (const [index, table] of (intent.routing.propagations ?? []).entries())
      add('aws_ec2_transit_gateway_route_table_propagation', `${name}_${index}`, {
        transit_gateway_attachment_id: attachment,
        transit_gateway_route_table_id: table,
      });
  };
  tables(ref2('aws_ec2_transit_gateway_vpc_attachment.transport.id'), 'transport');
  for (const role of [...new Set(peers.map((peer) => peer.transportInterfaceIndex))]) {
    const interfaceRole = intent.interfaces.find((item) => item.index === role)?.role;
    if (interfaceRole !== 'slo' && interfaceRole !== 'sli')
      throw new Error('Terraform GRE transport requires an SLO or SLI interface');
    const routeTable = interfaceRole;
    for (const [index, cidr] of cidrs.entries())
      add('aws_route', `gre_${role}_${index}`, {
        route_table_id: ref2(`aws_route_table.${routeTable}.id`),
        destination_cidr_block: cidr,
        transit_gateway_id: intent.routing.transitGatewayId,
        depends_on: ['aws_ec2_transit_gateway_vpc_attachment.transport'],
      });
  }
  const counts = new Map();
  const groups = peers.map((peer) => {
    const index = counts.get(peer.transportInterfaceIndex) ?? 0;
    counts.set(peer.transportInterfaceIndex, index + 1);
    return `role_${peer.transportInterfaceIndex}_${Math.floor(index / 4) + 1}`;
  });
  for (const group of new Set(groups)) {
    add('aws_ec2_transit_gateway_connect', group, {
      protocol: 'gre',
      transit_gateway_id: intent.routing.transitGatewayId,
      transport_attachment_id: ref2('aws_ec2_transit_gateway_vpc_attachment.transport.id'),
      transit_gateway_default_route_table_association: false,
      transit_gateway_default_route_table_propagation: false,
      tags,
    });
    tables(ref2(`aws_ec2_transit_gateway_connect.${group}.id`), group);
  }
  const peerOutputs = {};
  for (const [index, peer] of peers.entries()) {
    const name = `peer_${index + 1}`;
    add('aws_ec2_transit_gateway_connect_peer', name, {
      transit_gateway_attachment_id: ref2(`aws_ec2_transit_gateway_connect.${groups[index]}.id`),
      peer_address: ref2(`aws_network_interface.node_${peer.node}_nic_${peer.transportInterfaceIndex}.private_ip`),
      bgp_asn: String(intent.routing.customerAsn),
      inside_cidr_blocks: [peer.insideCidr],
      ...(peer.transitGatewayAddress ? { transit_gateway_address: peer.transitGatewayAddress } : {}),
      tags: {
        ...tags,
        'ves-io-site-name': siteForNode(intent, peer.node).name,
        'xcsh-node-index': String(peer.node),
        'xcsh-connect-peer-index': String(index + 1),
      },
    });
    peerOutputs[String(index + 1)] = {
      id: ref2(`aws_ec2_transit_gateway_connect_peer.${name}.id`),
      attachment_id: ref2(`aws_ec2_transit_gateway_connect.${groups[index]}.id`),
      node: peer.node,
      transport_interface_index: peer.transportInterfaceIndex,
      transit_gateway_address: ref2(`aws_ec2_transit_gateway_connect_peer.${name}.transit_gateway_address`),
      bgp_peer_address: ref2(`aws_ec2_transit_gateway_connect_peer.${name}.bgp_peer_address`),
      bgp_transit_gateway_addresses: ref2(`aws_ec2_transit_gateway_connect_peer.${name}.bgp_transit_gateway_addresses`),
    };
  }
  config.output.ce_connect_peers = { value: peerOutputs };
  config.output.ce_transport_attachment = { value: ref2('aws_ec2_transit_gateway_vpc_attachment.transport.id') };
  return JSON.stringify(config);
}
var ref2 = (address) => `\${${address}}`;
var init_terraform_connect = __esm(() => {
  init_terraform_foundation();
  init_transport_routes();
});

// plugins/aws/src/ce/terraform-static.ts
function renderAwsTerraformStatic(plan, bootstrapByNode = {}) {
  const config = JSON.parse(renderAwsTerraformFoundation(plan, bootstrapByNode));
  const intent = plan.intent;
  const routes = staticAzRoutes(intent);
  if (
    intent.routing.profile !== 'tgw-static' ||
    !routes.length ||
    !intent.routing.transitGatewayId ||
    intent.routing.transportAttachmentId ||
    intent.routes.length ||
    intent.routing.associations.length > 1
  )
    throw new Error(
      'Terraform static TGW requires dedicated per-AZ route tables and one owned attachment; brownfield route replacement is unavailable',
    );
  const resource = config.resource;
  const add = (type, name, value) => {
    resource[type] ??= {};
    resource[type][name] = value;
  };
  const tags = resource.aws_vpc.ce.tags;
  add('aws_ec2_transit_gateway_vpc_attachment', 'transport', {
    vpc_id: ref3('aws_vpc.ce.id'),
    transit_gateway_id: intent.routing.transitGatewayId,
    subnet_ids: routes.map((route) => ref3(`aws_subnet.node_${route.node}_nic_1.id`)),
    appliance_mode_support: 'enable',
    transit_gateway_default_route_table_association: false,
    transit_gateway_default_route_table_propagation: false,
    tags,
  });
  for (const [index, table] of intent.routing.associations.entries())
    add('aws_ec2_transit_gateway_route_table_association', `static_${index}`, {
      transit_gateway_attachment_id: ref3('aws_ec2_transit_gateway_vpc_attachment.transport.id'),
      transit_gateway_route_table_id: table,
    });
  for (const [index, table] of intent.routing.propagations.entries())
    add('aws_ec2_transit_gateway_route_table_propagation', `static_${index}`, {
      transit_gateway_attachment_id: ref3('aws_ec2_transit_gateway_vpc_attachment.transport.id'),
      transit_gateway_route_table_id: table,
    });
  if (!intent.routing.transitGatewayRouteTableId || !intent.routing.destinationCidrs.length)
    throw new Error('Terraform static TGW requires an exact service route table and destinations');
  for (const [index, prefix] of intent.routing.destinationCidrs.entries())
    add('aws_ec2_transit_gateway_route', `static_${index}`, {
      destination_cidr_block: prefix,
      transit_gateway_attachment_id: ref3('aws_ec2_transit_gateway_vpc_attachment.transport.id'),
      transit_gateway_route_table_id: intent.routing.transitGatewayRouteTableId,
    });
  for (const route of routes) {
    for (const [index, prefix] of route.forwardCidrs.entries())
      add('aws_route', `static_forward_${route.node}_${index}`, {
        route_table_id: ref3(`aws_route_table.static_${route.node}.id`),
        destination_cidr_block: prefix,
        network_interface_id: ref3(`aws_network_interface.node_${route.node}_nic_1.id`),
        depends_on: ['aws_ec2_transit_gateway_vpc_attachment.transport'],
      });
    for (const [index, prefix] of route.returnCidrs.entries())
      add('aws_route', `static_return_${route.node}_${index}`, {
        route_table_id: ref3(`aws_route_table.static_${route.node}.id`),
        destination_cidr_block: prefix,
        transit_gateway_id: intent.routing.transitGatewayId,
        depends_on: ['aws_ec2_transit_gateway_vpc_attachment.transport'],
      });
  }
  config.output.ce_transport_attachment = { value: ref3('aws_ec2_transit_gateway_vpc_attachment.transport.id') };
  config.output.ce_static_route_tables = {
    value: Object.fromEntries(
      routes.map((route) => [String(route.node), ref3(`aws_route_table.static_${route.node}.id`)]),
    ),
  };
  return JSON.stringify(config);
}
function bindTerraformStaticRouting(plan, outputs) {
  const tables = outputs.ce_static_route_tables;
  if (
    !tables ||
    typeof tables !== 'object' ||
    Array.isArray(tables) ||
    !/^tgw-attach-[0-9a-f]{8,21}$/.test(String(outputs.ce_transport_attachment)) ||
    Object.keys(tables).length !== plan.topology.nodeCount ||
    !/^vpc-[0-9a-f]{8,21}$/.test(String(outputs.ce_vpc_id))
  )
    throw new Error('Terraform static routing output is incomplete');
  const values = {
    __TGW_TRANSPORT_ATTACHMENT__: String(outputs.ce_transport_attachment),
    __VPC_ID__: String(outputs.ce_vpc_id),
  };
  for (const route of staticAzRoutes(plan.intent)) {
    const table = tables[String(route.node)];
    if (typeof table !== 'string' || !/^rtb-[0-9a-f]{8,21}$/.test(table) || Object.values(values).includes(table))
      throw new Error('Terraform static routing table identity is missing or duplicated');
    values[`__STATIC_ROUTE_TABLE_${route.node}__`] = table;
  }
  return values;
}
var ref3 = (value) => `\${${value}}`;
var init_terraform_static = __esm(() => {
  init_static_routing();
  init_terraform_foundation();
});

// plugins/aws/src/ce/terraform-routing-renderer.ts
function renderAwsTerraformRouting(plan, observation, bootstrap) {
  return plan.intent.routing.profile === 'tgw-static'
    ? renderAwsTerraformStatic(plan, bootstrap)
    : renderAwsTerraformConnect(plan, observation, bootstrap);
}
var init_terraform_routing_renderer = __esm(() => {
  init_terraform_connect();
  init_terraform_static();
});

// plugins/aws/src/ce/terraform-connect-stage.ts
import { createHash as createHash5 } from 'node:crypto';

async function applyAwsTerraformConnectStage(plan, observation, session, storage, revalidate, env, signal) {
  await storage.verify();
  const admission = await storage.read('terraform-admission.json');
  if (
    admission.schemaVersion !== 1 ||
    admission.planSha256 !== plan.planSha256 ||
    !/^[0-9a-f]{64}$/.test(admission.configurationSha256) ||
    JSON.stringify(admission.admittedSites) !== JSON.stringify(siteBindings(plan).map(({ site }) => site.name))
  )
    throw new Error('Terraform Connect requires complete owned site admission');
  const configuration = renderAwsTerraformRouting(plan, observation, admission.bootstrapByNode);
  const desired = hash(configuration);
  const addresses = (value) =>
    new Map(
      Object.entries(JSON.parse(value).resource).flatMap(([type, resources]) =>
        Object.keys(resources).map((name) => [`${type}.${name}`, type]),
      ),
    );
  const foundation = addresses(renderAwsTerraformFoundation(plan, admission.bootstrapByNode));
  const expected = addresses(configuration);
  const connectFoundationAdds = new Set();
  for (const interfaceIndex of new Set(
    (plan.intent.routing.connectPeers ?? []).map((peer) => peer.transportInterfaceIndex),
  )) {
    const role = plan.intent.interfaces.find((item) => item.index === interfaceIndex)?.role;
    if (!role || role === 'slo') continue;
    connectFoundationAdds.add(`aws_route_table.${role}`);
    for (let node = 1; node <= plan.intent.topology.nodeCount; node++)
      connectFoundationAdds.add(`aws_route_table_association.node_${node}_nic_${interfaceIndex}`);
  }
  const isDesiredSubset = (current) => {
    const source = JSON.parse(current).resource;
    const target = JSON.parse(configuration).resource;
    return Object.entries(source).every(([type, resources]) =>
      Object.entries(resources).every(
        ([name, value]) =>
          target[type]?.[name] !== undefined && JSON.stringify(target[type][name]) === JSON.stringify(value),
      ),
    );
  };
  let previousPending;
  try {
    previousPending = await storage.read('terraform-connect-stage.json');
  } catch {}
  const pendingConfigurationSha256 =
    previousPending?.stage === 'pending' &&
    previousPending.planSha256 === plan.planSha256 &&
    typeof previousPending.configurationSha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(previousPending.configurationSha256)
      ? previousPending.configurationSha256
      : undefined;
  const apply = async (receipt) => {
    if (
      receipt.configurationSha256 !== desired ||
      receipt.changes.some(
        (change) =>
          expected.get(change.address) !== change.type ||
          change.actions.length !== 1 ||
          !['create', 'read', 'no-op'].includes(change.actions[0]) ||
          (change.actions[0] === 'create' &&
            foundation.has(change.address) &&
            !connectFoundationAdds.has(change.address)),
      )
    )
      throw new Error(
        'Terraform Connect would change, recreate an existing resource, or create an unexpected resource',
      );
    await storage.write('terraform-connect-plan.json', receipt);
    await storage.verify();
    await revalidate();
    await session.apply(receipt, env, signal);
  };
  let reconciled = false;
  try {
    const revisions = [admission.configurationSha256, desired, pendingConfigurationSha256].filter(
      (value, index, values) => typeof value === 'string' && values.indexOf(value) === index,
    );
    let revised = false;
    let stale;
    for (const revision of revisions) {
      try {
        await session.reviseConfiguration(revision, configuration);
        revised = true;
        break;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('revision is stale')) throw error;
        stale = error;
      }
    }
    if (!revised) {
      if (!session.readConfigurationSha256) throw stale;
      const currentSha256 = await session.readConfigurationSha256();
      const current = await session.readConfiguration(currentSha256);
      if (!isDesiredSubset(current))
        throw new Error('Pending Terraform Connect configuration is not owned by this plan');
      await session.reviseConfiguration(currentSha256, configuration);
    }
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Reconcile interrupted')) throw error;
    await apply(await session.plan(env, signal));
    reconciled = true;
  }
  await storage.write('terraform-connect-stage.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    configurationSha256: desired,
    stage: 'pending',
  });
  if (!reconciled) await apply(await session.plan(env, signal));
  await storage.write('terraform-connect-stage.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    configurationSha256: desired,
    stage: 'applied',
    observedAt: new Date().toISOString(),
  });
  return { configurationSha256: desired };
}
var hash = (value) => createHash5('sha256').update(value).digest('hex');
var init_terraform_connect_stage = __esm(() => {
  init_terraform_foundation();
  init_terraform_routing_renderer();
});

// plugins/aws/src/ce/terraform-identities.ts
import { isIP as isIP8 } from 'node:net';

async function discoverAwsTerraformInterfaces(plan, outputs, rawApi, signal) {
  if (plan.engine !== 'terraform') throw new Error('Terraform interface discovery requires Terraform ownership');
  const api = scopedAwsApi(rawApi, plan.intent.awsProfile, signal);
  const run = async (args) => {
    const result = await api.exec('aws', [...args, '--region', plan.region, '--output', 'json']);
    if (result.exitCode !== 0) throw new Error('Terraform interface discovery is unavailable');
    return object11(JSON.parse(result.stdout));
  };
  if ((await run(['sts', 'get-caller-identity'])).Account !== plan.accountId)
    throw new Error('Terraform interface discovery account differs');
  const candidates = object11(outputs.ce_interfaces);
  const expected = Array.from({ length: plan.intent.topology.nodeCount }, (_, index) => index + 1).flatMap((node) =>
    plan.intent.interfaces.map((item) => ({ node, item, key: `${node}:${item.index}` })),
  );
  if (Object.keys(candidates).length !== expected.length || !/^vpc-[0-9a-f]{8,17}$/.test(String(outputs.ce_vpc_id)))
    throw new Error('Terraform network output is incomplete');
  const ids = [];
  for (const { node, item, key } of expected) {
    const value = object11(candidates[key]);
    if (
      value.node !== node ||
      value.index !== item.index ||
      value.role !== item.role ||
      value.site_name !== siteForNode(plan.intent, node).name ||
      typeof value.subnet_id !== 'string' ||
      !/^subnet-[0-9a-f]{8,17}$/.test(value.subnet_id) ||
      typeof value.id !== 'string' ||
      !/^eni-[0-9a-f]{8,17}$/.test(value.id) ||
      ids.includes(value.id)
    )
      throw new Error('Terraform interface output identity is malformed');
    ids.push(value.id);
  }
  const observed = await run(['ec2', 'describe-network-interfaces', '--network-interface-ids', ...ids]);
  if (
    observed.NextToken ||
    !Array.isArray(observed.NetworkInterfaces) ||
    observed.NetworkInterfaces.length !== expected.length
  )
    throw new Error('AWS interface discovery response is incomplete');
  const bindings = {};
  const macs = new Set();
  for (const { node, item, key } of expected) {
    const candidate = object11(candidates[key]);
    const matches = observed.NetworkInterfaces.map(object11).filter((eni) => eni.NetworkInterfaceId === candidate.id);
    if (matches.length !== 1) throw new Error('AWS interface identity is ambiguous');
    const eni = matches[0];
    const instance = object11(object11(outputs.ce_instances)[String(node)]);
    if (eni.Status === 'in-use') {
      if (
        typeof instance.id !== 'string' ||
        !/^i-[0-9a-f]{8,17}$/.test(instance.id) ||
        instance.site_name !== siteForNode(plan.intent, node).name ||
        instance.hostname !== `${plan.deploymentName}-${node}` ||
        object11(eni.Attachment).InstanceId !== instance.id ||
        object11(eni.Attachment).DeviceIndex !== item.index
      )
        throw new Error('Terraform interface attachment identity differs');
    } else if (eni.Attachment || Object.keys(instance).length)
      throw new Error('Terraform interface attachment is incomplete');
    const tags = Array.isArray(eni.TagSet) ? eni.TagSet.map(object11) : [];
    const expectedTags = {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-execution-engine': 'terraform',
      'xcsh-deployment-id': plan.deploymentName,
      'xcsh-plan-sha256': plan.planSha256,
      'ves-io-site-name': siteForNode(plan.intent, node).name,
      'xcsh-node-index': String(node),
      'xcsh-interface-index': String(item.index),
    };
    const mac = typeof eni.MacAddress === 'string' ? eni.MacAddress.toLowerCase() : '';
    if (
      eni.OwnerId !== plan.accountId ||
      eni.VpcId !== outputs.ce_vpc_id ||
      eni.SubnetId !== candidate.subnet_id ||
      eni.AvailabilityZone !== item.subnets[node - 1].availabilityZone ||
      eni.SourceDestCheck !== false ||
      !['available', 'in-use'].includes(String(eni.Status)) ||
      !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) ||
      macs.has(mac) ||
      typeof candidate.mac !== 'string' ||
      mac !== candidate.mac.toLowerCase() ||
      typeof eni.PrivateIpAddress !== 'string' ||
      isIP8(eni.PrivateIpAddress) !== 4 ||
      eni.PrivateIpAddress !== candidate.private_ip ||
      Object.entries(expectedTags).some(
        ([key, value]) =>
          tags.filter((tag) => tag.Key === key && tag.Value === value).length !== 1 ||
          tags.filter((tag) => tag.Key === key).length !== 1,
      )
    )
      throw new Error('AWS interface resource binding differs from Terraform deployment');
    macs.add(mac);
    bindings[`__ENI_${node}_${item.index}__`] = String(eni.NetworkInterfaceId);
    bindings[`__ENI_${node}_${item.index}_MAC__`] = mac;
    bindings[`__NODE_${node}_${item.role.toUpperCase()}_IP__`] = eni.PrivateIpAddress;
  }
  return {
    source: 'aws:ec2:describe-network-interfaces',
    observedAt: new Date().toISOString(),
    accountId: plan.accountId,
    region: plan.region,
    bindings,
  };
}
var object11 = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
var init_terraform_identities = () => {};

// plugins/aws/src/ce/terraform-replacement-stages.ts
import { createHash as createHash6 } from 'node:crypto';

function awsTerraformReplacementStages(base, replacement, configuration, expectedConfigurationSha256) {
  verifyAwsCePlan(base);
  const { planId, planSha256, ...draft } = replacement;
  const selected = siteBindings(base).find(({ binding }) => binding.siteName === replacement.binding.siteName);
  if (
    base.engine !== 'terraform' ||
    replacement.engine !== 'terraform' ||
    replacement.kind !== 'aws-ce-site-replacement' ||
    replacement.schemaVersion !== 2 ||
    replacement.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(draft) !== planSha256 ||
    planId !== `aws-ce-replace-${planSha256.slice(0, 24)}` ||
    !selected ||
    canonicalSha256(selected.binding) !== canonicalSha256(replacement.binding)
  )
    throw new Error('Terraform replacement engine, identity or plan integrity differs');
  if (digest2(configuration) !== expectedConfigurationSha256)
    throw new Error('Current Terraform configuration hash differs');
  const original = object12(JSON.parse(configuration));
  const resources = object12(original.resource);
  const instances = object12(resources.aws_instance);
  const associations = object12(resources.aws_eip_association);
  const outputs = object12(object12(object12(original.output).ce_instances).value);
  const addresses = [];
  for (const node of selected.site.nodeIndexes) {
    const name = `node_${node}`;
    const instance = object12(instances[name]);
    const association = object12(associations[name]);
    const tags = object12(instance.tags);
    if (
      tags['xcsh-execution-engine'] !== 'terraform' ||
      tags['xcsh-managed-by'] !== 'aws-ce' ||
      tags['xcsh-deployment-id'] !== base.deploymentName ||
      tags['xcsh-plan-sha256'] !== base.planSha256 ||
      tags['xcsh-node-index'] !== String(node) ||
      tags['ves-io-site-name'] !== selected.site.name ||
      instance.count !== undefined ||
      instance.for_each !== undefined ||
      instance.ami !== base.intent.image.amiId ||
      instance.instance_type !== base.intent.instance.type ||
      instance.user_data_replace_on_change !== true ||
      typeof instance.user_data_base64 !== 'string'
    )
      throw new Error('Terraform replacement instance configuration differs');
    const expected = base.intent.interfaces.map((iface) => ({
      device_index: iface.index,
      network_interface_id: `\${aws_network_interface.node_${node}_nic_${iface.index}.id}`,
      delete_on_termination: false,
    }));
    if (
      canonicalSha256(instance.network_interface) !== canonicalSha256(expected) ||
      association.allocation_id !== `\${aws_eip.node_${node}.id}` ||
      association.network_interface_id !== `\${aws_network_interface.node_${node}_nic_0.id}` ||
      association.count !== undefined ||
      association.for_each !== undefined ||
      object12(outputs[String(node)]).id !== `\${aws_instance.node_${node}.id}`
    )
      throw new Error('Terraform replacement retained network or output binding differs');
    addresses.push(`aws_instance.${name}`, `aws_eip_association.${name}`);
  }
  const quiesced = structuredClone(original);
  const quiescedResources = object12(quiesced.resource);
  for (const node of selected.site.nodeIndexes) {
    delete object12(quiescedResources.aws_instance)[`node_${node}`];
    delete object12(quiescedResources.aws_eip_association)[`node_${node}`];
    delete object12(object12(object12(quiesced.output).ce_instances).value)[String(node)];
  }
  for (const type of ['aws_instance', 'aws_eip_association'])
    if (!Object.keys(object12(quiescedResources[type])).length) delete quiescedResources[type];
  const quiesceConfiguration = JSON.stringify(quiesced);
  const make = (phase, text, previous) => ({
    phase,
    replacementPlanSha256: planSha256,
    deploymentId: base.deploymentName,
    previousConfigurationSha256: previous,
    configurationSha256: digest2(text),
    configuration: text,
    addresses: [...addresses],
  });
  return {
    quiesce: make('quiesce', quiesceConfiguration, expectedConfigurationSha256),
    launch(bootstrapByHostname) {
      if (Object.keys(bootstrapByHostname).length !== selected.binding.nodes.length)
        throw new Error('Complete replacement bootstrap inventory is required');
      const resumed = structuredClone(original);
      for (const node of selected.site.nodeIndexes) {
        const material = bootstrapByHostname[`${base.deploymentName}-${node}`];
        if (
          typeof material !== 'string' ||
          !material.startsWith(`#cloud-config
`) ||
          !material.includes('/etc/vpm/user_data') ||
          /__\w+__/.test(material)
        )
          throw new Error('Resolved replacement cloud-init is required');
        object12(object12(object12(resumed.resource).aws_instance)[`node_${node}`]).user_data_base64 =
          Buffer.from(material).toString('base64');
      }
      return make('launch', JSON.stringify(resumed), digest2(quiesceConfiguration));
    },
  };
}
function inspectAwsTerraformReplacementStage(stage, receipt) {
  if (
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== stage.deploymentId ||
    receipt.configurationSha256 !== stage.configurationSha256 ||
    digest2(stage.configuration) !== stage.configurationSha256 ||
    !['quiesce', 'launch'].includes(stage.phase) ||
    !Array.isArray(receipt.changes)
  )
    throw new Error('Terraform replacement saved plan binding differs');
  const seen = new Set();
  for (const change of receipt.changes) {
    if (seen.has(change.address) || !Array.isArray(change.actions) || change.actions.length !== 1)
      throw new Error('Ambiguous or combined Terraform replacement actions');
    seen.add(change.address);
    const action = change.actions[0];
    if (action === 'no-op') continue;
    if (
      !stage.addresses.includes(change.address) ||
      change.type !== change.address.split('.')[0] ||
      action !== (stage.phase === 'quiesce' ? 'delete' : 'create') ||
      receipt.noChanges
    )
      throw new Error('Terraform replacement would mutate outside the selected stage');
  }
}
async function applyAwsTerraformReplacementStage(session, stage, persist, env, signal) {
  signal?.throwIfAborted();
  if (digest2(stage.configuration) !== stage.configurationSha256)
    throw new Error('Replacement configuration integrity differs');
  try {
    await session.reviseConfiguration(stage.previousConfigurationSha256, stage.configuration);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('revision is stale')) throw error;
    await session.reviseConfiguration(stage.configurationSha256, stage.configuration);
  }
  const receipt = await session.plan(env, signal);
  inspectAwsTerraformReplacementStage(stage, receipt);
  await persist(receipt);
  await session.apply(receipt, env, signal);
  return receipt;
}
var object12 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Malformed replacement configuration');
    return value;
  },
  digest2 = (value) => createHash6('sha256').update(value).digest('hex');
var init_terraform_replacement_stages = __esm(() => {
  init_artifacts();
  init_canonical();
});

// plugins/aws/src/ce/terraform-routing.ts
function bindTerraformConnectPeers(plan, outputs, interfaceBindings) {
  verifyAwsCePlan(plan);
  if (plan.engine !== 'terraform' || plan.routing.profile !== 'tgw-connect')
    throw new Error('Terraform Connect ownership and profile are required');
  const peers = object13(outputs.ce_connect_peers);
  const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  if (!actions.length || Object.keys(peers).length !== actions.length)
    throw new Error('Terraform Connect peer output is incomplete');
  if (
    typeof outputs.ce_vpc_id !== 'string' ||
    !/^vpc-[0-9a-f]{8,17}$/.test(outputs.ce_vpc_id) ||
    typeof outputs.ce_transport_attachment !== 'string' ||
    !/^tgw-attach-[0-9a-f]{8,17}$/.test(outputs.ce_transport_attachment)
  )
    throw new Error('Terraform transport output is incomplete');
  const values = {
    ...interfaceBindings,
    __VPC_ID__: outputs.ce_vpc_id,
    __TGW_TRANSPORT_ATTACHMENT__: outputs.ce_transport_attachment,
  };
  const ids = new Set();
  for (const [index, action] of actions.entries()) {
    const peer = object13(peers[String(index + 1)]);
    const attachmentIndex = action.args?.indexOf('--transit-gateway-attachment-id') ?? -1;
    const attachment = attachmentIndex >= 0 ? action.args?.[attachmentIndex + 1] : undefined;
    const addressIndex = action.args?.indexOf('--peer-address') ?? -1;
    const address = addressIndex >= 0 ? action.args?.[addressIndex + 1] : undefined;
    const role =
      address === `__NODE_${action.node}_SLO_IP__` ? 0 : address === `__NODE_${action.node}_SLI_IP__` ? 1 : undefined;
    if (
      !action.capture?.placeholder ||
      !attachment ||
      !/^__TGW_CONNECT_ATTACHMENT_[01]_\d+__$/.test(attachment) ||
      role === undefined ||
      peer.node !== action.node ||
      peer.transport_interface_index !== role ||
      typeof peer.id !== 'string' ||
      !/^tgw-connect-peer-[0-9a-f]{8,21}$/.test(peer.id) ||
      ids.has(peer.id) ||
      typeof peer.attachment_id !== 'string' ||
      !/^tgw-attach-[0-9a-f]{8,17}$/.test(peer.attachment_id) ||
      (values[attachment] !== undefined && values[attachment] !== peer.attachment_id)
    )
      throw new Error('Terraform Connect output differs from the planned peer topology');
    if (
      Object.entries(values).some(
        ([key, value]) =>
          key.startsWith('__TGW_CONNECT_ATTACHMENT_') && key !== attachment && value === peer.attachment_id,
      )
    )
      throw new Error('Terraform Connect attachment roles are ambiguous');
    ids.add(peer.id);
    values[action.capture.placeholder] = peer.id;
    values[attachment] = peer.attachment_id;
  }
  return values;
}
function bindTerraformIngress(plan, outputs) {
  if (plan.intent.ingress?.mode !== 'nlb') return {};
  const ingress = object13(outputs.ce_ingress);
  const prefix = `arn:${plan.intent.partition}:elasticloadbalancing:${plan.region}:${plan.accountId}`;
  if (
    typeof ingress.load_balancer_arn !== 'string' ||
    !ingress.load_balancer_arn.startsWith(`${prefix}:loadbalancer/net/`) ||
    typeof ingress.target_group_arn !== 'string' ||
    !ingress.target_group_arn.startsWith(`${prefix}:targetgroup/`) ||
    typeof ingress.listener_arn !== 'string' ||
    !ingress.listener_arn.startsWith(`${prefix}:listener/net/`) ||
    ingress.port !== plan.intent.ingress.port ||
    ingress.scheme !== plan.intent.ingress.scheme
  )
    throw new Error('Terraform NLB output differs from the ingress intent');
  return {
    __NLB_ARN__: ingress.load_balancer_arn,
    __NLB_TARGET_GROUP_ARN__: ingress.target_group_arn,
    __NLB_LISTENER_ARN__: ingress.listener_arn,
  };
}
async function configureAwsTerraformRouting(plan, session, runtime, storage, api, env, signal, rebind) {
  await storage.verify();
  if (rebind) validateAwsRoutingRebind(plan, rebind);
  const outputs = await session.readOutputs(
    [
      'ce_vpc_id',
      'ce_interfaces',
      'ce_instances',
      'ce_connect_peers',
      'ce_transport_attachment',
      ...(plan.intent.ingress?.mode === 'nlb' ? ['ce_ingress'] : []),
    ],
    env,
    signal,
  );
  const discovered = await discoverAwsTerraformInterfaces(plan, outputs, api, signal);
  const checkpoint = {
    schemaVersion: 2,
    engine: 'terraform',
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: [],
    state: 'running',
    resolvedValues: {
      ...Object.fromEntries(
        Object.entries(rebind?.checkpoint.resolvedValues ?? {}).filter(([key]) => key.startsWith('__XC_ROUTING_')),
      ),
      ...bindTerraformConnectPeers(plan, outputs, discovered.bindings),
      ...bindTerraformIngress(plan, outputs),
    },
  };
  const persist = () => storage.write('terraform-routing-checkpoint.json', checkpoint);
  await persist();
  const scoped = scopedAwsApi(api, plan.intent.awsProfile, signal);
  for (const action of plan.actions.filter((action) => action.kind === 'tgw-attachment-gate'))
    await assertAttachmentAvailable(action, plan, checkpoint, scoped);
  await configureAwsRouting(runtime, plan, checkpoint, scoped, persist, signal, rebind);
  return collectAwsNetworkHealth('bgp', plan, checkpoint, scoped, signal);
}
var object13 = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
var init_terraform_routing = __esm(() => {
  init_artifacts();
  init_network_health();
  init_routing_apply();
  init_terraform_identities();
});

// plugins/aws/src/ce/terraform-site-replacement.ts
import { createHash as createHash7 } from 'node:crypto';

async function createTerraformAwsSiteReplacementDriver(
  source,
  replacement,
  expectedConfigurationSha256,
  session,
  storage,
  raw,
  env,
  routing,
) {
  const base = structuredClone(source);
  const plan = structuredClone(replacement);
  const validate = async (candidate) => {
    if (
      base.engine !== 'terraform' ||
      plan.engine !== 'terraform' ||
      canonicalSha256(candidate) !== canonicalSha256(plan) ||
      canonicalSha256(storage.owner) !== canonicalSha256(plan.binding.owner)
    )
      throw new Error('Terraform replacement ownership differs');
    await storage.verify();
  };
  await validate(plan);
  let routingCheckpoint;
  if (base.routing?.profile === 'tgw-connect') {
    let currentRouting;
    try {
      currentRouting = await storage.read('terraform-routing-checkpoint.json');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (currentRouting === undefined) {
      routingCheckpoint = undefined;
    } else {
      if (!routing || routing.runtime.engine !== base.engine)
        throw new Error('Connect replacement requires automatic routing recovery');
      const name = `${plan.planId}-routing-source.json`;
      let saved;
      try {
        saved = object14(await storage.read(name));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        saved = {
          replacementPlanSha256: plan.planSha256,
          checkpoint: currentRouting,
        };
        const cp = object14(saved.checkpoint);
        if (
          cp.schemaVersion !== 2 ||
          cp.engine !== base.engine ||
          cp.planId !== base.planId ||
          cp.planSha256 !== base.planSha256
        )
          throw new Error('Replacement routing source differs from deployment');
        validateAwsRoutingRebind(base, {
          siteName: plan.binding.siteName,
          siteUid: String(plan.preparation.uid),
          contract: routing.contract,
          checkpoint: cp,
        });
        await storage.write(name, saved);
      }
      const cp = object14(saved.checkpoint);
      if (
        saved.replacementPlanSha256 !== plan.planSha256 ||
        cp.schemaVersion !== 2 ||
        cp.engine !== base.engine ||
        cp.planId !== base.planId ||
        cp.planSha256 !== base.planSha256
      )
        throw new Error('Replacement routing source differs from deployment');
      routingCheckpoint = structuredClone(cp);
      validateAwsRoutingRebind(base, {
        siteName: plan.binding.siteName,
        siteUid: String(plan.preparation.uid),
        contract: routing.contract,
        checkpoint: routingCheckpoint,
      });
    }
  }
  const snapshotName = `${plan.planId}-terraform-source.json`;
  let snapshot;
  try {
    snapshot = object14(await storage.read(snapshotName));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const configuration = await session.readConfiguration(expectedConfigurationSha256);
    awsTerraformReplacementStages(base, plan, configuration, expectedConfigurationSha256);
    let admissionSha256 = null;
    try {
      const admission = object14(await storage.read('terraform-admission.json'));
      const configured = object14(object14(object14(JSON.parse(configuration)).resource).aws_instance);
      const bootstrapByNode = Object.fromEntries(
        Object.entries(configured).map(([name, value]) => {
          const encoded = object14(value).user_data_base64;
          if (!/^node_[1-3]$/.test(name) || typeof encoded !== 'string')
            throw new Error('Terraform source bootstrap admission is incomplete');
          return [name.slice(5), Buffer.from(encoded, 'base64').toString('utf8')];
        }),
      );
      if (
        admission.schemaVersion !== 1 ||
        admission.planSha256 !== base.planSha256 ||
        typeof admission.configurationSha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(admission.configurationSha256) ||
        !Array.isArray(admission.admittedSites) ||
        !admission.admittedSites.includes(plan.binding.siteName) ||
        canonicalSha256(admission.admittedSites) !==
          canonicalSha256(
            siteBindings(base)
              .map(({ site }) => site.name)
              .slice(0, admission.admittedSites.length),
          ) ||
        canonicalSha256(admission.bootstrapByNode) !== canonicalSha256(bootstrapByNode)
      )
        throw new Error('Terraform source admission differs from deployment and bootstrap');
      admissionSha256 = canonicalSha256(admission);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    snapshot = {
      schemaVersion: 1,
      admissionSha256,
      routingSourceSha256: routingCheckpoint ? canonicalSha256(routingCheckpoint) : null,
      replacementPlanSha256: plan.planSha256,
      configurationSha256: expectedConfigurationSha256,
      configuration,
    };
    await storage.write(snapshotName, snapshot);
  }
  if (
    snapshot.schemaVersion !== 1 ||
    (routingCheckpoint && snapshot.routingSourceSha256 !== canonicalSha256(routingCheckpoint)) ||
    !Object.hasOwn(snapshot, 'admissionSha256') ||
    (snapshot.admissionSha256 !== null &&
      (typeof snapshot.admissionSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.admissionSha256))) ||
    snapshot.replacementPlanSha256 !== plan.planSha256 ||
    snapshot.configurationSha256 !== expectedConfigurationSha256 ||
    typeof snapshot.configuration !== 'string' ||
    hash2(snapshot.configuration) !== expectedConfigurationSha256
  )
    throw new Error('Terraform replacement source snapshot differs');
  const stages = awsTerraformReplacementStages(base, plan, snapshot.configuration, expectedConfigurationSha256);
  const nodeIndex = (node) => Number(node.slice(base.deploymentName.length + 1));
  const launchMarkerName = `${plan.planId}-terraform-launch.json`;
  const readLaunch = async () => {
    try {
      const marker = object14(await storage.read(launchMarkerName));
      if (
        marker.schemaVersion !== 1 ||
        marker.replacementPlanSha256 !== plan.planSha256 ||
        typeof marker.configurationSha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(marker.configurationSha256)
      )
        throw new Error('Terraform replacement launch marker differs');
      return marker;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return;
    }
  };
  const observe = async (candidate, allowNew, signal) => {
    await validate(candidate);
    const api = scopedAwsApi(raw, base.intent.awsProfile, signal);
    const identity = await api.exec('aws', ['sts', 'get-caller-identity', '--region', base.region, '--output', 'json']);
    if (identity.exitCode) throw new Error('Terraform replacement AWS identity unavailable');
    const caller = object14(JSON.parse(identity.stdout));
    if (caller.Account !== base.accountId || !String(caller.Arn).startsWith(`arn:${base.partition}:`))
      throw new Error('Terraform replacement AWS account or partition differs');
    const old = object14(plan.preparation.instances);
    const ids = [
      ...Object.values(old).map(String),
      ...Object.values(plan.interfaceIds),
      ...Object.values(plan.elasticIpAllocationIds),
    ];
    const observed = await observeAwsResources(api, ids, base.region, {
      deploymentName: base.deploymentName,
      planSha256s: [base.planSha256],
    });
    const checked = (id) => {
      const found = observed.find((row) => row.id === id);
      if (
        !found?.exists ||
        !found.owned ||
        found.tags['xcsh-execution-engine'] !== 'terraform' ||
        found.state.NextToken
      )
        throw new Error('Terraform replacement cloud resource ownership is unavailable or differs');
      return found;
    };
    const current = {};
    const associations = {};
    let terminated = true;
    let quiescenceStarted = false;
    let detached = true;
    for (const node of plan.binding.nodes) {
      const index = nodeIndex(node);
      const original = checked(String(old[node]));
      const oldRows = list2(original.state.Reservations).flatMap((row) => list2(row.Instances));
      if (
        oldRows.length !== 1 ||
        oldRows[0].InstanceId !== old[node] ||
        original.tags['xcsh-node-index'] !== String(index) ||
        original.tags['ves-io-site-name'] !== plan.binding.siteName ||
        oldRows[0].ImageId !== base.intent.image.amiId
      )
        throw new Error('Original Terraform instance identity differs');
      const state = object14(oldRows[0].State).Name;
      if (!['pending', 'running', 'stopping', 'stopped', 'shutting-down', 'terminated'].includes(String(state)))
        throw new Error('Original Terraform instance state is unknown');
      terminated &&= state === 'terminated';
      quiescenceStarted ||= state === 'terminated' || state === 'shutting-down';
      const vpcs = new Set();
      for (const iface of base.intent.interfaces) {
        const key = `${node}/${iface.role}`;
        const found = checked(plan.interfaceIds[key]);
        const rows = list2(found.state.NetworkInterfaces);
        const expected = list2(plan.preparation.interfaces).find((row) => row.node === node && row.role === iface.role);
        if (rows.length !== 1 || rows[0].NetworkInterfaceId !== plan.interfaceIds[key])
          throw new Error('Ambiguous retained Terraform ENI');
        const eni = rows[0];
        vpcs.add(String(eni.VpcId));
        if (
          eni.OwnerId !== base.accountId ||
          eni.MacAddress !== expected?.mac ||
          eni.AvailabilityZone !== iface.subnets[index - 1].availabilityZone ||
          found.tags['xcsh-node-index'] !== String(index) ||
          found.tags['xcsh-interface-index'] !== String(iface.index) ||
          found.tags['ves-io-site-name'] !== plan.binding.siteName
        )
          throw new Error('Retained Terraform ENI identity differs');
        if (eni.Attachment) {
          detached = false;
          const attachment = object14(eni.Attachment);
          const id = String(attachment.InstanceId);
          if (
            attachment.DeviceIndex !== iface.index ||
            attachment.DeleteOnTermination !== false ||
            !/^i-[a-f0-9]{8,17}$/.test(id)
          )
            throw new Error('Retained Terraform ENI attachment differs');
          if (id !== old[node]) {
            if (!allowNew || state !== 'terminated' || (current[node] && current[node] !== id))
              throw new Error('Unexpected replacement Terraform instance attachment');
            current[node] = id;
          }
        } else if (eni.Status !== 'available') throw new Error('Retained Terraform ENI state is unavailable');
      }
      if (vpcs.size !== 1) throw new Error('Retained Terraform ENI VPC differs');
      const eip = checked(plan.elasticIpAllocationIds[node]);
      const addresses = list2(eip.state.Addresses);
      if (
        addresses.length !== 1 ||
        addresses[0].AllocationId !== plan.elasticIpAllocationIds[node] ||
        eip.tags['xcsh-node-index'] !== String(index) ||
        (addresses[0].AssociationId && addresses[0].NetworkInterfaceId !== plan.interfaceIds[`${node}/slo`])
      )
        throw new Error('Retained Terraform EIP association differs');
      if (addresses[0].AssociationId) {
        if (!/^eipassoc-[a-f0-9]{8,17}$/.test(String(addresses[0].AssociationId)))
          throw new Error('Malformed retained EIP association');
        associations[node] = String(addresses[0].AssociationId);
      }
    }
    for (const [node, id] of Object.entries(current)) {
      const [found] = await observeAwsResources(api, [id], base.region, {
        deploymentName: base.deploymentName,
        planSha256s: [base.planSha256],
      });
      const rows = list2(found.state.Reservations).flatMap((row) => list2(row.Instances));
      if (
        !found.exists ||
        !found.owned ||
        found.tags['xcsh-execution-engine'] !== 'terraform' ||
        found.state.NextToken ||
        found.tags['xcsh-node-index'] !== String(nodeIndex(node)) ||
        found.tags['ves-io-site-name'] !== plan.binding.siteName ||
        rows.length !== 1 ||
        rows[0].InstanceId !== id ||
        rows[0].ImageId !== base.intent.image.amiId ||
        rows[0].InstanceType !== base.intent.instance.type ||
        !['pending', 'running', 'stopping', 'stopped'].includes(String(object14(rows[0].State).Name))
      )
        throw new Error('New Terraform instance ownership differs');
    }
    const missingAssociations = Object.keys(associations).length < Object.keys(plan.elasticIpAllocationIds).length;
    const quiescence =
      terminated && detached && !Object.keys(associations).length
        ? 'complete'
        : quiescenceStarted || missingAssociations
          ? 'partial'
          : 'intact';
    return { current, associations, terminated, detached, quiescence };
  };
  const outputs = async (signal) => {
    const values = await session.readOutputs(['ce_vpc_id', 'ce_interfaces', 'ce_instances'], env, signal);
    const evidence = await discoverAwsTerraformInterfaces(base, values, raw, signal);
    for (const node of plan.binding.nodes)
      for (const iface of base.intent.interfaces) {
        if (
          evidence.bindings[`__ENI_${nodeIndex(node)}_${iface.index}__`] !== plan.interfaceIds[`${node}/${iface.role}`]
        )
          throw new Error('Terraform state changed a retained ENI identity');
      }
    return object14(values.ce_instances);
  };
  const authorizeReceipt = async (receipt, phase, signal, admission) => {
    const identities = await session.readPlannedResourceIds(receipt, stages.quiesce.addresses, env, signal);
    const live = await observe(plan, phase === 'launch', signal);
    for (const change of receipt.changes.filter((change) => stages.quiesce.addresses.includes(change.address))) {
      const node = `${base.deploymentName}-${Number(change.address.split('node_')[1])}`;
      const expected =
        change.type === 'aws_instance'
          ? phase === 'quiesce'
            ? object14(plan.preparation.instances)[node]
            : live.current[node]
          : live.associations[node];
      if (change.actions[0] === 'create') {
        if (identities[change.address] !== null || expected)
          throw new Error(
            'Terraform replacement creation has an existing resource identity; reconcile state before retrying',
          );
      } else if (!expected || identities[change.address] !== expected) {
        throw new Error('Terraform saved plan targets a different cloud resource');
      }
    }
    await storage.write(`${plan.planId}-terraform-${phase}-plan.json`, { receipt, identities });
    if (phase === 'quiesce') await admission?.(live.quiescence);
  };
  return {
    quiescenceAdmissionVersion: 1,
    engine: 'terraform',
    async restoreRouting(candidate, siteUid, signal) {
      await validate(candidate);
      if (!routingCheckpoint) return;
      if (!routing) throw new Error('Replacement routing runtime is unavailable');
      const observed = await configureAwsTerraformRouting(base, session, routing.runtime, storage, raw, env, signal, {
        siteName: plan.binding.siteName,
        siteUid,
        contract: routing.contract,
        checkpoint: routingCheckpoint,
      });
      return observed.status === 'healthy';
    },
    async finalize(candidate, expected, signal) {
      await validate(candidate);
      const live = await observe(candidate, true, signal);
      if (plan.binding.nodes.some((node) => !expected[node] || live.current[node] !== expected[node]))
        throw new Error('Terraform replacement completion identity differs');
      const marker = await readLaunch();
      if (!marker) throw new Error('Terraform replacement launch marker is unavailable');
      const configuration = await session.readConfiguration(String(marker.configurationSha256));
      const bootstraps = (configuration) => {
        const instances = object14(object14(object14(JSON.parse(configuration)).resource).aws_instance);
        return Object.fromEntries(
          Object.entries(instances)
            .filter(([name]) => /^node_[1-3]$/.test(name))
            .map(([name, value]) => {
              const encoded = object14(value).user_data_base64;
              if (typeof encoded !== 'string') throw new Error('Terraform admission bootstrap snapshot is incomplete');
              return [name.slice(5), Buffer.from(encoded, 'base64').toString('utf8')];
            }),
        );
      };
      const oldBootstrap = bootstraps(String(snapshot.configuration));
      const nextBootstrap = bootstraps(configuration);
      const material = Object.fromEntries(
        plan.binding.nodes.map((node) => [node, nextBootstrap[String(nodeIndex(node))]]),
      );
      if (stages.launch(material).configurationSha256 !== marker.configurationSha256)
        throw new Error('Terraform replacement completion configuration differs');
      const refresh = await session.plan(env, signal);
      if (refresh.configurationSha256 !== marker.configurationSha256 || !refresh.noChanges)
        throw new Error('Replacement completion requires a final refresh-enabled no-change plan');
      await storage.write(`${plan.planId}-terraform-final-refresh.json`, refresh);
      let admission;
      try {
        admission = object14(await storage.read('terraform-admission.json'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (snapshot.admissionSha256 !== null) throw new Error('Terraform admission disappeared during replacement');
        return;
      }
      if (
        admission.schemaVersion !== 1 ||
        admission.planSha256 !== base.planSha256 ||
        !Array.isArray(admission.admittedSites) ||
        !admission.admittedSites.includes(plan.binding.siteName) ||
        canonicalSha256(admission.admittedSites) !==
          canonicalSha256(
            siteBindings(base)
              .map(({ site }) => site.name)
              .slice(0, admission.admittedSites.length),
          )
      )
        throw new Error('Terraform admission ownership or selected site differs');
      const isOriginal =
        snapshot.admissionSha256 !== null &&
        canonicalSha256(admission) === snapshot.admissionSha256 &&
        canonicalSha256(admission.bootstrapByNode) === canonicalSha256(oldBootstrap);
      const isCompleted =
        admission.configurationSha256 === marker.configurationSha256 &&
        canonicalSha256(admission.bootstrapByNode) === canonicalSha256(nextBootstrap);
      if (!isOriginal && !isCompleted) throw new Error('Terraform admission changed during replacement');
      if (!isCompleted)
        await storage.write('terraform-admission.json', {
          ...admission,
          configurationSha256: marker.configurationSha256,
          bootstrapByNode: nextBootstrap,
        });
    },
    async assertOwnership(candidate, phase, expected = {}, signal) {
      const marker = await readLaunch();
      const live = await observe(candidate, !!marker && ['launch', 'registration', 'complete'].includes(phase), signal);
      if (['registration', 'complete'].includes(phase) || Object.keys(expected).length) {
        const instances = await outputs(signal);
        for (const node of plan.binding.nodes)
          if (
            !expected[node] ||
            live.current[node] !== expected[node] ||
            object14(instances[String(nodeIndex(node))]).id !== expected[node]
          )
            throw new Error('Terraform output and replacement instance checkpoint differ');
      }
    },
    async quiesce(candidate, signal, admission) {
      await observe(candidate, false, signal);
      await applyAwsTerraformReplacementStage(
        session,
        stages.quiesce,
        (receipt) => authorizeReceipt(receipt, 'quiesce', signal, admission),
        env,
        signal,
      );
      const live = await observe(candidate, false, signal);
      if (!live.terminated || !live.detached) throw new Error('Terraform replacement quiescence has not converged');
      const instances = await outputs(signal);
      if (plan.binding.nodes.some((node) => Object.hasOwn(instances, String(nodeIndex(node)))))
        throw new Error('Terraform state still contains a quiesced node');
    },
    async launch(candidate, bootstrap, signal) {
      const stage = stages.launch(bootstrap);
      const previous = await readLaunch();
      if (previous && previous.configurationSha256 !== stage.configurationSha256)
        throw new Error('Terraform replacement bootstrap changed on resume');
      const live = await observe(candidate, !!previous, signal);
      if (!live.terminated) throw new Error('Original VMs must terminate before Terraform replacement launch');
      await storage.write(launchMarkerName, {
        schemaVersion: 1,
        replacementPlanSha256: plan.planSha256,
        configurationSha256: stage.configurationSha256,
      });
      await applyAwsTerraformReplacementStage(
        session,
        stage,
        (receipt) => authorizeReceipt(receipt, 'launch', signal),
        env,
        signal,
      );
      const after = await observe(candidate, true, signal);
      const instances = await outputs(signal);
      const result = {};
      for (const node of plan.binding.nodes) {
        const id = object14(instances[String(nodeIndex(node))]).id;
        if (
          typeof id !== 'string' ||
          !after.current[node] ||
          id !== after.current[node] ||
          id === object14(plan.preparation.instances)[node]
        )
          throw new Error('Terraform replacement instance state has not converged');
        result[node] = id;
      }
      const refresh = await session.plan(env, signal);
      if (refresh.configurationSha256 !== stage.configurationSha256 || !refresh.noChanges)
        throw new Error('Terraform replacement requires a refresh-enabled no-change plan');
      await storage.write(`${plan.planId}-terraform-refresh.json`, refresh);
      return result;
    },
  };
}
var object14 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Malformed Terraform replacement evidence');
    return value;
  },
  list2 = (value) => {
    if (!Array.isArray(value)) throw new Error('Incomplete Terraform replacement observation');
    return value.map(object14);
  },
  hash2 = (value) => createHash7('sha256').update(value).digest('hex');
var init_terraform_site_replacement = __esm(() => {
  init_canonical();
  init_discovery();
  init_routing_apply();
  init_terraform_identities();
  init_terraform_replacement_stages();
  init_terraform_routing();
});

// plugins/aws/src/ce/terraform-initial-replacement.ts
async function optional3(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return;
  }
}
async function runAwsTerraformInitialReplacement(
  base,
  terraform,
  runtime,
  storage,
  api,
  fetcher,
  signal,
  loadContract = () => VerifiedUpgradeContract.release(fetcher, signal),
) {
  if (base.engine !== 'terraform') throw new Error('Initial replacement requires Terraform ownership');
  let handled = false;
  for (const { site, binding } of siteBindings(base)) {
    const name = `terraform-initial-replacement-${site.name}.json`;
    let frozen = await optional3(storage, name);
    const preparation = await optional3(storage, `terraform-interface-mtu-${site.name}.json`);
    if (!frozen && (!preparation || object15(preparation).evidenceKind !== 'preboot-interface-configuration-required'))
      continue;
    if (runtime.engine !== 'terraform') throw new Error('Initial replacement runtime ownership differs');
    handled = true;
    const contract = await loadContract();
    const session = await terraform.open(binding.owner, await awsTerraformFoundationDeployment(base), 'current');
    if (!frozen) {
      let record = object15(preparation);
      if (record.planId !== base.planId || record.planSha256 !== base.planSha256)
        throw new Error('Initial replacement preparation differs from the owning plan');
      let versions;
      try {
        versions = await captureCeReplacementVersions(
          binding,
          String(record.uid),
          String(record.contractFingerprint),
          runtime,
          contract,
          signal,
        );
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes('version evidence is unavailable') ||
            error.message.includes('versions are not stable'))
        )
          return { handled: true, status: 'pending-replacement-versions' };
        throw error;
      }
      if (!session.readResourceIdentities || !session.readConfigurationSha256)
        throw new Error('Terraform replacement identity reader unavailable');
      const identities = await session.readResourceIdentities(process.env, signal);
      const find = (address, type, pattern) => {
        const rows = identities.filter((row) => row.address === address && row.type === type);
        if (rows.length !== 1 || !pattern.test(rows[0].id))
          throw new Error('Initial replacement resource identity differs');
        return rows[0].id;
      };
      const interfaceIds = {};
      const elasticIpAllocationIds = {};
      const bootstrapTokenNames = {};
      for (const node of site.nodeIndexes) {
        const hostname = `${base.deploymentName}-${node}`;
        for (const iface of base.intent.interfaces)
          interfaceIds[`${hostname}/${iface.role}`] = find(
            `aws_network_interface.node_${node}_nic_${iface.index}`,
            'aws_network_interface',
            /^eni-[a-f0-9]{8,17}$/,
          );
        if (base.egress.mode === 'elastic-ip')
          elasticIpAllocationIds[hostname] = find(`aws_eip.node_${node}`, 'aws_eip', /^eipalloc-[a-f0-9]{8,17}$/);
        const token = `${base.deploymentName.slice(0, 40)}-${node}-${base.planSha256.slice(0, 12)}`;
        const saved = object15(await storage.read(`${token}.json`));
        if (saved.tokenName !== token || saved.siteName !== site.name || saved.node !== hostname)
          throw new Error('Initial replacement bootstrap ownership differs');
        bootstrapTokenNames[hostname] = token;
      }
      const refreshed = await runtime.prepareAwsSiteReplacement(binding, record.instances, record.interfaces, signal);
      if (refreshed.uid !== record.uid) throw new Error('Initial replacement site identity changed');
      record = { ...refreshed, planId: base.planId, planSha256: base.planSha256 };
      const plan = compileAwsSiteReplacement(base, site.name, record, {
        versions,
        interfaceIds,
        elasticIpAllocationIds,
        bootstrapTokenNames,
      });
      frozen = {
        sourcePlanSha256: base.planSha256,
        configurationSha256: await session.readConfigurationSha256(),
        plan,
      };
      await storage.write(name, frozen);
    }
    const record = object15(frozen);
    if (
      record.sourcePlanSha256 !== base.planSha256 ||
      typeof record.configurationSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(record.configurationSha256)
    )
      throw new Error('Frozen initial replacement source differs');
    const plan = record.plan;
    if (plan?.sourcePlanSha256 !== base.planSha256 || plan.binding?.siteName !== site.name)
      throw new Error('Frozen initial replacement plan differs');
    const driver = await createTerraformAwsSiteReplacementDriver(
      base,
      plan,
      record.configurationSha256,
      session,
      storage,
      api,
      process.env,
    );
    const result = await runAwsSiteReplacement(plan, plan.planSha256, driver, runtime, storage, contract, signal);
    if (result.status !== 'registered-with-configured-interfaces') return { handled: true, ...result };
  }
  return { handled, status: handled ? 'registered' : 'not-required' };
}
var object15 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid initial replacement source');
  return value;
};
var init_terraform_initial_replacement = __esm(() => {
  init_replacement_versions();
  init_upgrade_contract();
  init_site_replacement();
  init_terraform_foundation();
  init_terraform_site_replacement();
});

// plugins/aws/src/ce/terraform-routing-references.ts
function routingAttachmentIds(plan, observation) {
  if (plan.intent.routing.profile !== 'tgw-connect') return [];
  const selected = tables(plan);
  const ids = observation.resources
    .filter((resource) => selected.has(resource.id))
    .flatMap((resource) =>
      ['Associations', 'Propagations'].flatMap((key) =>
        rows(resource.state[key]).map((row) => row.TransitGatewayAttachmentId),
      ),
    );
  if (ids.some((id) => typeof id !== 'string' || !/^tgw-attach-[0-9a-f]{8,17}$/.test(id)))
    throw new Error('Malformed routing attachment identity');
  return [...new Set(ids)];
}
function ownedRoutingAdditions(plan, before, after, evidence) {
  return after.map((resource) => {
    const baseline = before.find((item) => item.id === resource.id);
    if (!baseline || !tables(plan).has(resource.id)) return resource;
    const state = { ...resource.state };
    for (const [key, selected] of [
      ['Associations', plan.intent.routing.associations],
      ['Propagations', plan.intent.routing.propagations],
    ]) {
      const original = rows(baseline.state[key]);
      const current = rows(state[key]);
      const ids = current.map((row) => row.TransitGatewayAttachmentId);
      if (new Set(ids).size !== ids.length) throw new Error('Duplicate routing reference edge');
      state[key] = current.filter((row) => {
        if (
          !selected.includes(resource.id) ||
          original.some((old) => old.TransitGatewayAttachmentId === row.TransitGatewayAttachmentId)
        )
          return true;
        const matches = evidence.filter((item) => item.id === row.TransitGatewayAttachmentId);
        if (matches.length !== 1) return true;
        const attachment = matches[0];
        const records = rows(attachment.state.TransitGatewayAttachments);
        if (records.length !== 1) return true;
        const actual = records[0];
        const tags = attachment.tags;
        const expectedRow = {
          TransitGatewayAttachmentId: attachment.id,
          ResourceId: actual.ResourceId,
          ResourceType: actual.ResourceType,
        };
        const { State: _state, ...configuration } = row;
        return !(
          plan.engine === 'terraform' &&
          attachment.exists &&
          attachment.owned &&
          attachment.region === plan.region &&
          tags['xcsh-managed-by'] === 'aws-ce' &&
          tags['xcsh-execution-engine'] === 'terraform' &&
          tags['xcsh-deployment-id'] === plan.deploymentName &&
          tags['xcsh-plan-sha256'] === plan.planSha256 &&
          actual.TransitGatewayAttachmentId === attachment.id &&
          actual.TransitGatewayId === plan.intent.routing.transitGatewayId &&
          actual.ResourceOwnerId === plan.accountId &&
          actual.TransitGatewayOwnerId === plan.accountId &&
          typeof actual.ResourceId === 'string' &&
          ((actual.ResourceType === 'vpc' && /^vpc-[0-9a-f]{8,17}$/.test(actual.ResourceId)) ||
            (actual.ResourceType === 'connect' && /^tgw-attach-[0-9a-f]{8,17}$/.test(actual.ResourceId))) &&
          canonicalSha256(configuration) === canonicalSha256(expectedRow)
        );
      });
    }
    return { ...resource, state };
  });
}
var object16 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Malformed routing reference evidence');
    return value;
  },
  rows = (value) => {
    if (!Array.isArray(value)) throw new Error('Incomplete routing reference evidence');
    return value.map(object16);
  },
  tables = (plan) => new Set([...plan.intent.routing.associations, ...plan.intent.routing.propagations]);
var init_terraform_routing_references = __esm(() => {
  init_canonical();
});

// plugins/aws/src/ce/terraform-preflight.ts
async function revalidateAwsTerraformPlan(plan, baseline, platform, rawApi, fetcher = fetch, signal) {
  verifyAwsCePlan(plan);
  if (plan.engine !== 'terraform' || plan.intent.operation !== 'deploy' || plan.intent.vpc.mode !== 'greenfield')
    throw new Error('Terraform deployment preflight requires a greenfield owning plan');
  const api = scopedAwsApi(rawApi, plan.intent.awsProfile, signal);
  const result = await api.exec('aws', [
    'ec2',
    'describe-addresses',
    '--region',
    plan.region,
    '--output',
    'json',
    '--filters',
    `Name=tag:xcsh-deployment-id,Values=${plan.deploymentName}`,
  ]);
  if (result.exitCode !== 0) throw new Error('Terraform deployment EIP ownership is unavailable');
  const addresses = JSON.parse(result.stdout);
  if (!Array.isArray(addresses.Addresses) || addresses.NextToken) throw new Error('Incomplete Terraform EIP inventory');
  const ids = addresses.Addresses.map((address) => {
    const tags = Object.fromEntries((address.Tags ?? []).map((tag) => [tag.Key, tag.Value]));
    if (
      !/^eipalloc-[0-9a-f]{8,21}$/.test(address.AllocationId ?? '') ||
      tags['xcsh-managed-by'] !== 'aws-ce' ||
      tags['xcsh-execution-engine'] !== 'terraform' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      tags['xcsh-plan-sha256'] !== plan.planSha256
    )
      throw new Error('Terraform EIP belongs to a different plan or engine');
    return address.AllocationId;
  });
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate Terraform EIP identity');
  const f5Capabilities = await platform.capabilities(plan.intent.platformContext);
  const current = await discoverAwsCompute(
    {
      awsProfile: plan.intent.awsProfile,
      vpcMode: plan.intent.vpc.mode,
      accountId: plan.accountId,
      partition: plan.partition,
      deploymentName: plan.deploymentName,
      requiredEnis: plan.interfaces.length,
      nodeCount: plan.topology.nodeCount,
      instanceTypes: [plan.instance.type],
      brownfieldResourceIds: terraformRoutingReferences(plan),
      observedOwnedResourceIds: ids,
      ownedPlanSha256s: [plan.planSha256],
      resourceRegion: plan.region,
      egressMode: plan.egress.mode,
      routingProfile: plan.routing.profile,
      f5Capabilities,
    },
    api,
    fetcher,
  );
  const attachmentIds = routingAttachmentIds(plan, current);
  if (attachmentIds.length)
    current.resources.push(
      ...(await observeAwsResources(api, attachmentIds, plan.region, {
        deploymentName: plan.deploymentName,
        planSha256s: [plan.planSha256],
      })),
    );
  assertAwsTerraformPreflight(plan, baseline, current);
  return current;
}
function assertAwsTerraformPreflight(plan, baseline, current) {
  const region = current.regions.filter((item) => item.name === plan.region);
  if (
    current.identity.accountId !== plan.accountId ||
    current.identity.partition !== plan.partition ||
    current.identity.awsProfile !== plan.intent.awsProfile ||
    !current.agreement.active ||
    current.agreement.productId !== baseline.agreement.productId ||
    current.f5CapabilitiesSha256 !== plan.f5CapabilitiesSha256 ||
    canonicalSha256(current.research.sourceReceipts) !== canonicalSha256(baseline.research.sourceReceipts) ||
    region.length !== 1 ||
    !region[0].enabled ||
    !region[0].eligible ||
    canonicalSha256(region[0].ami) !== canonicalSha256(plan.image)
  )
    throw new Error('Terraform preflight identity, image, agreement, contract or capacity changed');
  const types = region[0].instanceTypes.filter((item) => item.name === plan.instance.type);
  if (
    types.length !== 1 ||
    !types[0].supported ||
    plan.topology.availabilityZones.some((zone) => !types[0].availabilityZones.includes(zone))
  )
    throw new Error('Terraform instance offering no longer supports the planned topology');
  const references = terraformRoutingReferences(plan);
  if (references.length) {
    const select = (observation) => observation.resources.filter((item) => references.includes(item.id));
    const before = select(baseline);
    const after = select(current);
    if (
      before.length !== references.length ||
      after.length !== references.length ||
      after.some((item) => !item.exists || item.region !== plan.region) ||
      canonicalSha256(resourceConfiguration(before)) !==
        canonicalSha256(resourceConfiguration(ownedRoutingAdditions(plan, before, after, current.resources)))
    )
      throw new Error('Terraform routing reference configuration changed');
  }
}
function terraformRoutingReferences(plan) {
  const routing = plan.intent.routing;
  return ['tgw-connect', 'tgw-static'].includes(routing?.profile)
    ? [
        ...new Set(
          [routing.transitGatewayId, ...routing.associations, ...routing.propagations].filter((id) => Boolean(id)),
        ),
      ]
    : [];
}
var init_terraform_preflight = __esm(() => {
  init_artifacts();
  init_canonical();
  init_discovery();
  init_terraform_routing_references();
});

// plugins/aws/src/ce/terraform-admission.ts
import { createHash as createHash8 } from 'node:crypto';

async function admitAwsTerraformSites(plan, session, runtime, storage, api, env, signal, haSerialDelayMs = 180000) {
  verifyAwsCePlan(plan);
  const initial = renderAwsTerraformFoundation(plan);
  if (plan.intent.interfaces.some((item) => !['slo', 'sli'].includes(item.role) || item.addressing.mode !== 'dhcp'))
    throw new Error('Terraform admission requires supported SLO/SLI DHCP mapping');
  let checkpoint;
  try {
    checkpoint = await storage.read('terraform-admission.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    checkpoint = {
      schemaVersion: 1,
      planSha256: plan.planSha256,
      configurationSha256: hash3(initial),
      bootstrapByNode: {},
      launchedAtByNode: {},
      admittedSites: [],
    };
  }
  checkpoint.launchedAtByNode ??= {};
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.planSha256 !== plan.planSha256 ||
    !Array.isArray(checkpoint.admittedSites) ||
    !checkpoint.bootstrapByNode ||
    typeof checkpoint.bootstrapByNode !== 'object' ||
    !checkpoint.launchedAtByNode ||
    typeof checkpoint.launchedAtByNode !== 'object' ||
    Object.entries(checkpoint.launchedAtByNode).some(
      ([node, observedAt]) => !/^[1-3]$/.test(node) || Number.isNaN(Date.parse(observedAt)),
    )
  )
    throw new Error('Terraform admission checkpoint differs from plan');
  const siteNames = siteBindings(plan).map(({ site }) => site.name);
  if (
    !/^[0-9a-f]{64}$/.test(checkpoint.configurationSha256) ||
    JSON.stringify(checkpoint.admittedSites) !== JSON.stringify(siteNames.slice(0, checkpoint.admittedSites.length))
  )
    throw new Error('Terraform admission checkpoint is not an ordered site prefix');
  const save = () => storage.write('terraform-admission.json', checkpoint);
  const readOutputs = async () => {
    try {
      return await session.readOutputs(['ce_vpc_id', 'ce_interfaces', 'ce_instances'], env, signal);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('applied or converged current configuration'))
        throw error;
      const receipt = await session.plan(env, signal);
      const desiredHash = hash3(renderAwsTerraformFoundation(plan, checkpoint.bootstrapByNode));
      if (
        ![checkpoint.configurationSha256, desiredHash].includes(receipt.configurationSha256) ||
        receipt.changes.some((change) => change.actions.some((action) => !['create', 'read', 'no-op'].includes(action)))
      )
        throw new Error('Interrupted Terraform admission requires lifecycle reconciliation');
      await storage.write('terraform-admission-plan.json', receipt);
      await session.apply(receipt, env, signal);
      checkpoint.configurationSha256 = receipt.configurationSha256;
      await save();
      return session.readOutputs(['ce_vpc_id', 'ce_interfaces', 'ce_instances'], env, signal);
    }
  };
  const observations = [];
  for (const { site, binding } of siteBindings(plan)) {
    signal?.throwIfAborted();
    await storage.verify();
    const outputs = await readOutputs();
    const discoveredBeforeLaunch = await discoverAwsTerraformInterfaces(plan, outputs, api, signal);
    if (!checkpoint.admittedSites.includes(site.name)) {
      if (site.nodeIndexes.length === 3)
        await runtime.ensureSite(
          binding,
          {
            schemaVersion: 2,
            provider: 'aws',
            haMode: 'three-node',
            nodes: site.nodeIndexes.map((node) => ({
              hostname: `${plan.deploymentName}-${node}`,
              interfaces: plan.intent.interfaces.map((item) => ({
                name: item.role,
                mtu: item.mtu ?? AWS_CE_DEFAULT_INTERFACE_MTU,
                ethernet_interface: {
                  device: item.guestDevice,
                  mac: discoveredBeforeLaunch.bindings[`__ENI_${node}_${item.index}_MAC__`],
                },
                network_option: item.role === 'slo' ? { site_local_network: {} } : { site_local_inside_network: {} },
                dhcp_client: {},
              })),
            })),
            settings: {},
          },
          (record) => storage.write(`terraform-site-${site.name}.json`, record),
          signal,
        );
      else
        await runtime.reserveSite(
          binding,
          (record) => storage.write(`terraform-site-${site.name}.json`, record),
          signal,
        );
      for (const [position, node] of site.nodeIndexes.entries()) {
        const previous = site.nodeIndexes[position - 1];
        if (previous !== undefined && site.nodeIndexes.length === 3) {
          const launchedAt = checkpoint.launchedAtByNode[String(previous)];
          if (!launchedAt) throw new Error('Prior HA node launch boundary is unavailable');
          await waitUntil2(Date.parse(launchedAt) + haSerialDelayMs, signal);
        }
        if (!checkpoint.bootstrapByNode[String(node)]) {
          const tokenName = `${plan.deploymentName.slice(0, 40)}-${node}-${plan.planSha256.slice(0, 12)}`;
          const material = await runtime.bootstrap(
            binding,
            `${plan.deploymentName}-${node}`,
            tokenName,
            (secret) => storage.write(`${tokenName}.json`, secret),
            signal,
          );
          checkpoint.bootstrapByNode[String(node)] = renderAwsCeCloudInit({
            nodeName: `${plan.deploymentName}-${node}`,
            material,
          });
          await save();
        }
        const configuration = renderAwsTerraformFoundation(plan, checkpoint.bootstrapByNode);
        const nextHash = hash3(configuration);
        if (checkpoint.configurationSha256 !== nextHash) {
          try {
            await session.reviseConfiguration(checkpoint.configurationSha256, configuration);
          } catch (error) {
            if (!(error instanceof Error) || !error.message.includes('revision is stale')) throw error;
            await session.reviseConfiguration(nextHash, configuration);
          }
          checkpoint.configurationSha256 = nextHash;
          await save();
        }
        const receipt = await session.plan(env, signal);
        if (
          receipt.changes.some((change) =>
            change.actions.some((action) => !['create', 'read', 'no-op'].includes(action)),
          )
        )
          throw new Error(
            'Terraform admission would alter or replace an existing resource; reconcile the reviewed lifecycle plan',
          );
        await storage.write('terraform-admission-plan.json', receipt);
        if (!receipt.noChanges) await session.apply(receipt, env, signal);
        checkpoint.launchedAtByNode[String(node)] ??= new Date().toISOString();
        await save();
      }
      checkpoint.admittedSites.push(site.name);
      await save();
    }
    const current = await readOutputs();
    const discovered = await discoverAwsTerraformInterfaces(plan, current, api, signal);
    const instances = current.ce_instances;
    const expected = Object.fromEntries(
      site.nodeIndexes.map((node) => [`${plan.deploymentName}-${node}`, instances[String(node)]?.id]),
    );
    if (Object.values(expected).some((id) => !/^i-[0-9a-f]{8,17}$/.test(id ?? '')))
      throw new Error('Terraform admitted instance identities are unavailable');
    const registrations = await runtime.approveRegistrations(
      binding,
      expected,
      (record) => storage.write(`terraform-registration-${site.name}.json`, record),
      signal,
    );
    const configuration = await runtime.observeAwsRegisteredConfiguration(
      binding,
      expected,
      site.nodeIndexes.flatMap((node) =>
        plan.intent.interfaces.map((item) => ({
          node: `${plan.deploymentName}-${node}`,
          role: item.role,
          mac: discovered.bindings[`__ENI_${node}_${item.index}_MAC__`],
        })),
      ),
      signal,
    );
    if (configuration.status === 'configured' && registrations.status === 'healthy') {
      await runtime.ensureAwsInterfaceMtu(
        binding,
        expected,
        site.nodeIndexes.flatMap((node) =>
          plan.intent.interfaces.map((item) => ({
            node: `${plan.deploymentName}-${node}`,
            role: item.role,
            mac: discovered.bindings[`__ENI_${node}_${item.index}_MAC__`],
            mtu: item.mtu ?? AWS_CE_DEFAULT_INTERFACE_MTU,
          })),
        ),
        (record) =>
          storage.write(`terraform-interface-mtu-${site.name}.json`, {
            ...record,
            planId: plan.planId,
            planSha256: plan.planSha256,
          }),
        signal,
      );
      Object.assign(registrations, await runtime.observeRegistrations(binding, expected, signal));
    }
    observations.push({ siteName: site.name, registrations, configuration });
    if (configuration.status !== 'configured')
      return { status: 'pending-interface-configuration', sites: observations, routing: 'unknown', traffic: 'unknown' };
    if (registrations.status !== 'healthy')
      return { status: 'pending-registration', sites: observations, routing: 'unknown', traffic: 'unknown' };
  }
  return {
    status: 'registered',
    sites: observations,
    routing: 'unknown',
    traffic: 'unknown',
  };
}
var hash3 = (value) => createHash8('sha256').update(value).digest('hex'),
  waitUntil2 = async (notBefore, signal) => {
    const remaining = notBefore - Date.now();
    if (remaining <= 0) return;
    await new Promise((resolve, reject) => {
      const aborted = () => {
        clearTimeout(timer);
        reject(signal?.reason ?? new Error('Terraform HA admission cancelled'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', aborted);
        resolve();
      }, remaining);
      signal?.addEventListener('abort', aborted, { once: true });
      if (signal?.aborted) aborted();
    });
  };
var init_terraform_admission = __esm(() => {
  init_artifacts();
  init_terraform_foundation();
  init_terraform_identities();
  init_types2();
});

// plugins/aws/src/ce/terraform-workflow.ts
async function runAwsTerraformAdmission(plan, terraform, runtime, storage, api, revalidate, env, signal) {
  verifyAwsCePlan(plan);
  const deployment = await awsTerraformFoundationDeployment(plan);
  const owner = {
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    provider: 'aws',
    account: plan.accountId,
    region: plan.region,
  };
  await storage.verify();
  let checkpoint;
  try {
    checkpoint = await storage.read('terraform-workflow.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    checkpoint = { schemaVersion: 1, engine: 'terraform', planSha256: plan.planSha256, stage: 'network-pending' };
    await storage.write('terraform-workflow.json', checkpoint);
  }
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.planSha256 !== plan.planSha256 ||
    !['network-pending', 'registration-pending', 'registered'].includes(checkpoint.stage)
  )
    throw new Error('Terraform workflow checkpoint differs from the owning plan');
  signal?.throwIfAborted();
  let session;
  if (checkpoint.stage === 'network-pending') {
    try {
      session = await terraform.open(owner, deployment, false);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      session = await terraform.open(owner, deployment, 'current');
    }
    await revalidate();
    const receipt = await session.plan(env, signal);
    if (
      receipt.changes.some((change) => change.actions.some((action) => !['create', 'read', 'no-op'].includes(action)))
    )
      throw new Error('Terraform foundation would mutate existing resources; lifecycle reconciliation required');
    await storage.write('terraform-foundation-plan.json', receipt);
    await storage.verify();
    await revalidate();
    await session.apply(receipt, env, signal);
    checkpoint.stage = 'registration-pending';
    await storage.write('terraform-workflow.json', checkpoint);
  } else session = await terraform.open(owner, deployment, 'current');
  await revalidate();
  const admission = await admitAwsTerraformSites(plan, session, runtime, storage, api, env, signal);
  checkpoint.stage = admission.status === 'registered' ? 'registered' : 'registration-pending';
  await storage.write('terraform-workflow.json', checkpoint);
  return { planId: plan.planId, planSha256: plan.planSha256, engine: 'terraform', ...admission };
}
var init_terraform_workflow = __esm(() => {
  init_artifacts();
  init_terraform_admission();
  init_terraform_foundation();
});

// plugins/aws/src/ce/terraform-apply.ts
async function executeAwsCeTerraformApply(
  input,
  ctx,
  api,
  platform,
  terraform,
  fetcher = fetch,
  signal,
  preflight = revalidateAwsTerraformPlan,
) {
  if (Object.keys(input).some((key) => !['planId', 'planSha256'].includes(key)))
    throw new Error('Terraform apply accepts only the persisted plan identity');
  const { plan, observation } = await loadAwsPlan(ctx.sessionManager, input.planId, input.planSha256);
  await awsTerraformFoundationDeployment(plan);
  const runtime = await platform.runtime('terraform', plan.intent.platformContext);
  if (typeof runtime.resourceMutation !== 'function')
    throw new Error('Terraform F5 resource-state service is required before deployment');
  if (
    plan.intent.topology.nodeCount === 3 &&
    (!plan.intent.topology.sites || plan.intent.topology.sites.some((site) => site.nodeIndexes.length === 3))
  )
    runtime.requireAwsHaContract();
  const storage = await platform.storage({
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    provider: 'aws',
    account: plan.accountId,
    region: plan.region,
  });
  await runtime.reconcileTerraformResources(
    {
      deploymentId: plan.deploymentName,
      engine: 'terraform',
      provider: 'aws',
      account: plan.accountId,
      region: plan.region,
    },
    signal,
  );
  let authorization;
  try {
    authorization = await storage.read('terraform-authorization.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const authorized = Boolean(
    authorization &&
      typeof authorization === 'object' &&
      authorization.schemaVersion === 1 &&
      authorization.engine === 'terraform' &&
      authorization.planSha256 === plan.planSha256 &&
      authorization.mutations === true,
  );
  if (authorization && authorization.f5StateOwner !== 'terraform')
    throw new Error('Legacy mixed-engine Terraform deployment is inspection-only; automatic F5 adoption is prohibited');
  if (authorization !== undefined && !authorized)
    throw new Error('Terraform authorization checkpoint differs from this plan or engine');
  if (!authorization) {
    for (const { binding } of siteBindings(plan)) {
      try {
        await runtime.observeOwnedSite(binding, signal);
        throw new Error('Existing F5 site cannot be adopted by a fresh Terraform deployment');
      } catch (error) {
        if (!(error instanceof CeApiError && error.category === 'not-found')) throw error;
      }
    }
  }
  assertAwsApplyAllowed(plan, {
    ...input,
    hasUI: ctx.hasUI,
    env: process.env,
    authorized,
    executionEngine: 'terraform',
  });
  let current = observation;
  const revalidate = async () => {
    current = await preflight(plan, observation, platform, api, fetcher, signal);
  };
  await revalidate();
  if (
    !authorized &&
    ctx.hasUI &&
    !(await ctx.ui.confirm(
      'Apply immutable AWS CE Terraform plan',
      `${plan.planId}
${plan.planSha256}`,
    ))
  )
    throw new Error('AWS CE Terraform apply was not approved');
  await storage.write('terraform-authorization.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    mutations: true,
    f5StateOwner: 'terraform',
  });
  if (plan.routing?.profile === 'tgw-connect') runtime.requireAwsRoutingContract();
  let connectStarted = false;
  try {
    const marker = await storage.read('terraform-connect-stage.json');
    if (
      marker.schemaVersion !== 1 ||
      marker.engine !== 'terraform' ||
      marker.planSha256 !== plan.planSha256 ||
      !['pending', 'applied'].includes(String(marker.stage)) ||
      !['tgw-connect', 'tgw-static'].includes(plan.routing?.profile)
    )
      throw new Error('Terraform Connect checkpoint differs from the plan');
    connectStarted = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let result = connectStarted
    ? {
        planId: plan.planId,
        planSha256: plan.planSha256,
        engine: 'terraform',
        status: 'routing-in-progress',
        routing: 'unknown',
        traffic: 'unknown',
      }
    : await (async () => {
        const pending = await runAwsTerraformInitialReplacement(
          plan,
          terraform,
          runtime,
          storage,
          api,
          fetcher,
          signal,
        );
        if (pending.handled && pending.status !== 'registered') return pending;
        try {
          return await runAwsTerraformAdmission(
            plan,
            terraform,
            runtime,
            storage,
            api,
            revalidate,
            process.env,
            signal,
          );
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes('coupled VM/site replacement')) throw error;
          const replacement = await runAwsTerraformInitialReplacement(
            plan,
            terraform,
            runtime,
            storage,
            api,
            fetcher,
            signal,
          );
          if (!replacement.handled) throw error;
          if (replacement.status === 'registered')
            await storage.write('terraform-workflow.json', {
              schemaVersion: 1,
              engine: 'terraform',
              planSha256: plan.planSha256,
              stage: 'registered',
            });
          return replacement;
        }
      })();
  if (
    ['tgw-connect', 'tgw-static'].includes(plan.routing?.profile) &&
    (connectStarted || result.status === 'registered')
  ) {
    const owner = {
      deploymentId: plan.deploymentName,
      engine: 'terraform',
      provider: 'aws',
      account: plan.accountId,
      region: plan.region,
    };
    const session = await terraform.open(owner, await awsTerraformFoundationDeployment(plan), 'current');
    await applyAwsTerraformConnectStage(plan, current, session, storage, revalidate, process.env, signal);
    try {
      let bgp;
      let routingCheckpoint;
      if (plan.routing.profile === 'tgw-connect') {
        bgp = await configureAwsTerraformRouting(plan, session, runtime, storage, api, process.env, signal);
        if (bgp.status !== 'healthy') throw new Error('Observed AWS BGP sessions have not converged');
        routingCheckpoint = await storage.read('terraform-routing-checkpoint.json');
      } else {
        const outputs = await session.readOutputs(
          ['ce_vpc_id', 'ce_interfaces', 'ce_instances', 'ce_transport_attachment', 'ce_static_route_tables'],
          process.env,
          signal,
        );
        const identities = await discoverAwsTerraformInterfaces(plan, outputs, api, signal);
        routingCheckpoint = {
          schemaVersion: 2,
          engine: 'terraform',
          planId: plan.planId,
          planSha256: plan.planSha256,
          completedActionIds: [],
          state: 'running',
          resolvedValues: { ...identities.bindings, ...bindTerraformStaticRouting(plan, outputs) },
        };
        await storage.write('terraform-routing-checkpoint.json', routingCheckpoint);
      }
      const routes = await collectAwsNetworkHealth(
        'routes',
        plan,
        routingCheckpoint,
        scopedAwsApi(api, plan.intent.awsProfile, signal),
        signal,
      );
      if (routes.status === 'unknown') throw new Error('AWS TGW route evidence is unavailable');
      if (routes.status !== 'healthy') throw new Error('Observed AWS TGW routes have not converged');
      const refresh = await session.plan(process.env, signal);
      if (!refresh.noChanges) throw new Error('Terraform changed after routing convergence');
      result = {
        ...result,
        status: 'pending-route-and-traffic-acceptance',
        bgp,
        routes,
        terraformNoChanges: true,
      };
    } catch (error) {
      if (signal?.aborted || !(error instanceof Error) || !error.message.includes('has not converged')) throw error;
      result = { ...result, status: 'pending-routing-convergence', reason: error.message };
    }
  }
  const routingReady = ['tgw-connect', 'tgw-static'].includes(plan.routing?.profile)
    ? result.status === 'pending-route-and-traffic-acceptance'
    : result.status === 'registered';
  if (plan.intent.ingress?.mode === 'nlb' && routingReady) {
    const owner = {
      deploymentId: plan.deploymentName,
      engine: 'terraform',
      provider: 'aws',
      account: plan.accountId,
      region: plan.region,
    };
    const session = await terraform.open(owner, await awsTerraformFoundationDeployment(plan), 'current');
    const outputs = await session.readOutputs(
      ['ce_vpc_id', 'ce_interfaces', 'ce_instances', 'ce_ingress'],
      process.env,
      signal,
    );
    const discovered = await discoverAwsTerraformInterfaces(plan, outputs, api, signal);
    const resolvedValues = { ...discovered.bindings, ...bindTerraformIngress(plan, outputs) };
    const ingress = await ensureAwsPlatformIngress(
      plan,
      runtime,
      storage,
      await VerifiedIngressContract.release(fetcher, signal),
      resolvedValues,
      scopedAwsApi(api, plan.intent.awsProfile, signal),
      signal,
    );
    const nlb = await collectAwsNetworkHealth(
      'nlb',
      plan,
      {
        schemaVersion: plan.schemaVersion,
        engine: 'terraform',
        planId: plan.planId,
        planSha256: plan.planSha256,
        completedActionIds: [],
        resolvedValues,
        state: 'running',
      },
      scopedAwsApi(api, plan.intent.awsProfile, signal),
      signal,
    );
    if (nlb.status !== 'healthy') {
      result = { ...result, status: 'pending-ingress-convergence', ingress, nlb, traffic: 'unknown' };
    } else {
      const traffic = await collectAwsTrafficProbe(plan, { resolvedValues }, storage, api, signal);
      const refresh = await session.plan(process.env, signal);
      if (!refresh.noChanges) throw new Error('Terraform changed after platform ingress convergence');
      result = {
        ...result,
        status: 'accepted',
        ingress,
        nlb,
        terraformNoChanges: true,
        traffic,
      };
    }
  }
  const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'aws-ce-terraform-checkpoint');
  if (!artifactId) throw new Error('Terraform outcome artifact persistence failed; deployment checkpoint is retained');
  return { ...result, status: String(result.status), artifactId };
}
function awsTerraformService(pi, signal) {
  const bus = pi.events;
  return new Promise((resolve, reject) => {
    const fail = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', fail);
      reject(new Error('Terraform CE service unavailable or cancelled'));
    };
    const timer = setTimeout(fail, 5000);
    signal?.addEventListener('abort', fail, { once: true });
    if (signal?.aborted || typeof bus?.emit !== 'function') return fail();
    try {
      bus.emit('xcsh:ce-terraform:v1:service', {
        version: 1,
        resolve: (service) => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', fail);
          resolve(service);
        },
      });
    } catch {
      fail();
    }
  });
}
var init_terraform_apply = __esm(() => {
  init_ingress_contract();
  init_runtime();
  init_apply();
  init_artifacts();
  init_network_health();
  init_platform_ingress();
  init_terraform_connect_stage();
  init_terraform_foundation();
  init_terraform_identities();
  init_terraform_initial_replacement();
  init_terraform_preflight();
  init_terraform_routing();
  init_terraform_static();
  init_terraform_workflow();
  init_traffic_probe();
});

// plugins/aws/src/tools/aws-ce-apply.ts
function createAwsCeApplyTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_apply',
    label: 'Apply AWS Customer Edge Plan',
    description:
      'Apply or resume only the exact persisted AWS CE plan ID and SHA-256 after revalidating identity, source digests, SSM/AMI, agreement, limits, routes, TGW/NLB state, platform capabilities, and ownership.',
    parameters: Type.Object({
      planId: Type.String(),
      planSha256: Type.String(),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        const selected = await loadAwsPlan(ctx.sessionManager, params.planId, params.planSha256);
        if (selected.plan.engine === 'terraform') {
          const result = await executeAwsCeTerraformApply(
            params,
            ctx,
            makeApi(ctx.cwd),
            await awsPlatformService(pi, signal),
            await awsTerraformService(pi, signal),
            fetch,
            signal,
          );
          return {
            content: [
              {
                type: 'text',
                text: `AWS CE Terraform ${selected.plan.deploymentName}: ${result.status}. Collected routing and ingress evidence is included; traffic acceptance remains separate.`,
              },
            ],
            details: { tool: 'aws_ce_apply', ...result },
          };
        }
        const { plan, checkpoint } = await executeAwsCeApply(
          params,
          ctx,
          makeApi(ctx.cwd),
          await awsPlatformService(pi, signal),
          fetch,
          signal,
        );
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE ${plan.deploymentName}: ${checkpoint.state}; ${checkpoint.completedActionIds.length}/${plan.actions.length} immutable actions checkpointed.`,
            },
          ],
          details: { tool: 'aws_ce_apply', planId: plan.planId, planSha256: plan.planSha256, checkpoint },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE apply failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_apply' },
        };
      }
    },
  };
}
var init_aws_ce_apply = __esm(() => {
  init_apply();
  init_artifacts();
  init_platform();
  init_terraform_apply();
  init_shared();
});

// plugins/aws/src/tools/aws-ce-inventory.ts
function createAwsCeInventoryTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_inventory',
    label: 'Inventory AWS Customer Edge',
    description:
      'Read-only paginated inventory of CE-tagged instances and authoritative ENI attachment/MAC identities in explicit AWS regions. Reports engine ownership separately from unknown F5 registration and health. No plan or deployment required.',
    parameters: Type.Object({
      accountId: Type.String(),
      awsProfile: Type.Optional(Type.String()),
      regions: Type.Array(Type.String(), { minItems: 1, maxItems: 40 }),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        const inventory = await collectAwsCeInventory(params, makeApi(ctx.cwd), signal);
        const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(inventory), 'aws-ce-inventory');
        if (!artifactId) throw new Error('Inventory artifact persistence failed');
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE inventory: ${inventory.counts.instances} instances and ${inventory.counts.interfaces} interfaces in ${inventory.scope.regions.length} requested region(s). F5 registration and health are unknown.`,
            },
          ],
          details: { tool: 'aws_ce_inventory', artifactId, inventory },
        };
      } catch {
        signal?.throwIfAborted();
        return {
          content: [{ type: 'text', text: 'AWS CE inventory is unavailable. No partial resource data was returned.' }],
          isError: true,
          details: { tool: 'aws_ce_inventory', outcome: 'unavailable' },
        };
      }
    },
  };
}
var init_aws_ce_inventory = __esm(() => {
  init_inventory();
  init_shared();
});

// plugins/aws/src/ce/terraform-absence.ts
async function collectAwsTerraformAbsence(source, input, raw, signal) {
  const plan = structuredClone(source),
    inventory = structuredClone(input);
  verifyAwsCePlan(plan);
  signal?.throwIfAborted();
  const { sha256, ...material } = inventory;
  if (
    inventory.schemaVersion !== 1 ||
    inventory.engine !== 'terraform' ||
    plan.engine !== 'terraform' ||
    inventory.accountId !== plan.intent.accountId ||
    inventory.region !== plan.intent.region ||
    inventory.deploymentId !== plan.intent.deploymentName ||
    inventory.sourcePlanSha256 !== plan.planSha256 ||
    !/^[a-f0-9]{64}$/.test(inventory.terraformPlanSha256) ||
    canonicalSha256(material) !== sha256 ||
    !Array.isArray(inventory.resources) ||
    !inventory.resources.length ||
    inventory.resources.length > 1000 ||
    !Array.isArray(inventory.tgwEdges) ||
    inventory.tgwEdges.length > 1000
  )
    throw new Error('Invalid AWS retirement inventory binding');
  const ids = new Set();
  for (const resource of inventory.resources) {
    if (!validId(resource.type, resource.id) || ids.has(resource.id))
      throw new Error('Invalid or duplicate retired resource identity');
    ids.add(resource.id);
  }
  const edges = new Set();
  for (const edge of inventory.tgwEdges) {
    const key = `${edge.kind}:${edge.tableId}:${edge.attachmentId}`;
    if (
      !['association', 'propagation'].includes(edge.kind) ||
      !validId('aws_ec2_transit_gateway_route_table', edge.tableId) ||
      !validId('aws_ec2_transit_gateway_attachment', edge.attachmentId) ||
      !ids.has(edge.attachmentId) ||
      edges.has(key)
    )
      throw new Error('Invalid retired TGW relationship');
    edges.add(key);
  }
  const base = {
    source: 'aws-cli-live',
    engine: 'terraform',
    accountId: inventory.accountId,
    region: inventory.region,
    deploymentId: inventory.deploymentId,
    sourcePlanSha256: plan.planSha256,
    inventorySha256: sha256,
    startedAt: new Date().toISOString(),
  };
  const api = scopedAwsApi(raw, plan.intent.awsProfile, signal),
    sources = [];
  const request = async (service, operation, args = {}) => {
    const response = await api.exec('aws', [
      service,
      operation,
      '--cli-input-json',
      JSON.stringify(args),
      '--no-paginate',
      '--region',
      inventory.region,
      '--output',
      'json',
    ]);
    signal?.throwIfAborted();
    if (response.exitCode !== 0) throw detectAwsError(response.stderr, response.exitCode);
    sources.push(operation);
    return object17(JSON.parse(response.stdout));
  };
  const pages = async (operation, collection, args) => {
    const output = [],
      tokens = new Set();
    let token;
    do {
      const response = await request('ec2', operation, { ...args, ...(token ? { NextToken: token } : {}) });
      if (response.NextMarker !== undefined || response.nextToken !== undefined || response.Marker !== undefined)
        throw new Error('Unsupported absence pagination');
      output.push(...rows2(response[collection]));
      if (output.length > 1e4) throw new Error('Absence collection exceeded bound');
      if (response.NextToken === undefined || response.NextToken === null) token = undefined;
      else {
        if (
          typeof response.NextToken !== 'string' ||
          !response.NextToken ||
          tokens.has(response.NextToken) ||
          tokens.size >= 1000
        )
          throw new Error('Incomplete absence pagination');
        token = response.NextToken;
        tokens.add(token);
      }
    } while (token);
    return output;
  };
  try {
    if ((await request('sts', 'get-caller-identity')).Account !== inventory.accountId)
      throw new Error('AWS absence account differs');
    const resources = structuredClone(inventory.resources);
    const tags = await pages('describe-tags', 'Tags', {
      Filters: [
        { Name: 'key', Values: ['xcsh-deployment-id'] },
        { Name: 'value', Values: [inventory.deploymentId] },
      ],
    });
    const taggedIds = new Set();
    for (const tag of tags) {
      if (
        tag.Key !== 'xcsh-deployment-id' ||
        tag.Value !== inventory.deploymentId ||
        typeof tag.ResourceId !== 'string' ||
        taggedIds.has(tag.ResourceId)
      )
        throw new Error('Substituted deployment tag evidence');
      taggedIds.add(tag.ResourceId);
      if (ids.has(tag.ResourceId)) continue;
      const type = tag.ResourceId.startsWith('tgw-attach-')
        ? 'aws_ec2_transit_gateway_attachment'
        : Object.keys(types).find((type) => validId(type, tag.ResourceId));
      if (!type || !validId(type, tag.ResourceId))
        throw new Error('Unsupported tagged resource requires absence evidence');
      resources.push({ type, id: tag.ResourceId });
      ids.add(tag.ResourceId);
    }
    const taggingTokens = new Set();
    let taggingToken;
    do {
      const response = await request('resourcegroupstaggingapi', 'get-resources', {
        TagFilters: [{ Key: 'xcsh-deployment-id', Values: [inventory.deploymentId] }],
        ...(taggingToken ? { PaginationToken: taggingToken } : {}),
      });
      const mappings = rows2(response.ResourceTagMappingList);
      for (const mapping of mappings) {
        if (typeof mapping.ResourceARN !== 'string' || !mapping.ResourceARN.includes(':elasticloadbalancing:'))
          continue;
        const mappingTags = rows2(mapping.Tags);
        const tag = (key) => mappingTags.filter((row) => row.Key === key);
        if (
          tag('xcsh-deployment-id').length !== 1 ||
          tag('xcsh-deployment-id')[0].Value !== inventory.deploymentId ||
          tag('xcsh-managed-by').length !== 1 ||
          tag('xcsh-managed-by')[0].Value !== 'aws-ce' ||
          tag('xcsh-execution-engine').length !== 1 ||
          tag('xcsh-execution-engine')[0].Value !== 'terraform' ||
          tag('xcsh-plan-sha256').length !== 1 ||
          tag('xcsh-plan-sha256')[0].Value !== plan.planSha256
        )
          throw new Error('Foreign or ambiguous tagged NLB resource');
        if (ids.has(mapping.ResourceARN)) continue;
        const type = Object.keys(elbTypes).find((candidate) => validId(candidate, mapping.ResourceARN));
        if (!type) throw new Error('Unsupported tagged NLB resource requires absence evidence');
        resources.push({ type, id: mapping.ResourceARN });
        ids.add(mapping.ResourceARN);
      }
      if (
        response.PaginationToken === undefined ||
        response.PaginationToken === null ||
        response.PaginationToken === ''
      )
        taggingToken = undefined;
      else {
        if (
          typeof response.PaginationToken !== 'string' ||
          taggingTokens.has(response.PaginationToken) ||
          taggingTokens.size >= 1000
        )
          throw new Error('Incomplete tagged NLB pagination');
        taggingToken = response.PaginationToken;
        taggingTokens.add(taggingToken);
      }
    } while (taggingToken);
    const remaining = [],
      retainedTerminal = [];
    for (const [type, [operation, collection, idKey, filter]] of Object.entries(types)) {
      const selected = resources.filter((row) => row.type === type).map((row) => row.id);
      if (!selected.length) continue;
      let found = await pages(operation, collection, { Filters: [{ Name: filter, Values: selected }] });
      if (type === 'aws_instance') found = found.flatMap((row) => rows2(row.Instances));
      const seen = new Set();
      for (const row of found) {
        const id = row[idKey];
        if (typeof id !== 'string' || !selected.includes(id) || seen.has(id))
          throw new Error('Substituted absence resource identity');
        seen.add(id);
        let terminal = false;
        if (type === 'aws_instance') {
          const state = object17(row.State).Name;
          if (typeof state !== 'string') throw new Error('Missing instance retirement state');
          terminal = state === 'terminated';
        } else if (type === 'aws_ebs_volume' || type.startsWith('aws_ec2_transit_gateway_')) {
          if (typeof row.State !== 'string') throw new Error('Missing cloud retirement state');
          terminal = row.State === 'deleted';
        }
        (terminal ? retainedTerminal : remaining).push(id);
      }
    }
    for (const [type, [operation, collection, argument]] of Object.entries(elbTypes)) {
      const selected = resources.filter((row) => row.type === type).map((row) => row.id);
      for (const id of selected) {
        try {
          const response = await request('elbv2', operation, { [argument]: [id] });
          const found = rows2(response[collection]);
          if (found.length !== 1) throw new Error('Substituted NLB absence resource identity');
          const key =
            type === 'aws_lb' ? 'LoadBalancerArn' : type === 'aws_lb_target_group' ? 'TargetGroupArn' : 'ListenerArn';
          if (found[0][key] !== id) throw new Error('Substituted NLB absence resource identity');
          remaining.push(id);
        } catch (error) {
          if (!(error instanceof AwsNotFoundError)) throw error;
        }
      }
    }
    for (const edge of inventory.tgwEdges) {
      const tables = await pages('describe-transit-gateway-route-tables', 'TransitGatewayRouteTables', {
        Filters: [{ Name: 'transit-gateway-route-table-id', Values: [edge.tableId] }],
      });
      if (tables.length > 1 || tables.some((row) => row.TransitGatewayRouteTableId !== edge.tableId))
        throw new Error('Substituted TGW table evidence');
      if (!tables.length) continue;
      const association = edge.kind === 'association';
      const found = await pages(
        association ? 'get-transit-gateway-route-table-associations' : 'get-transit-gateway-route-table-propagations',
        association ? 'Associations' : 'TransitGatewayRouteTablePropagations',
        {
          TransitGatewayRouteTableId: edge.tableId,
          Filters: [{ Name: 'transit-gateway-attachment-id', Values: [edge.attachmentId] }],
        },
      );
      if (
        found.length > 1 ||
        found.some((row) => row.TransitGatewayAttachmentId !== edge.attachmentId || typeof row.State !== 'string')
      )
        throw new Error('Substituted TGW retirement edge');
      if (found.some((row) => row.State !== (association ? 'disassociated' : 'disabled')))
        remaining.push(`${edge.kind}:${edge.tableId}:${edge.attachmentId}`);
    }
    return {
      ...base,
      status: remaining.length ? 'pending' : 'absent-or-retired',
      remaining,
      retainedTerminal,
      resourceCount: resources.length,
      sources,
      observedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      ...base,
      status: 'unknown',
      reason: error instanceof Error ? error.name : 'invalid-evidence',
      sources,
      observedAt: new Date().toISOString(),
    };
  }
}
var object17 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed absence evidence');
    return value;
  },
  rows2 = (value) => {
    if (!Array.isArray(value)) throw new Error('Missing absence collection');
    return value.map(object17);
  },
  types,
  elbTypes,
  validId = (type, id) =>
    typeof id === 'string' &&
    ((Object.hasOwn(types, type) && new RegExp(`^${types[type][4]}-[a-f0-9]{8,21}$`).test(id)) ||
      (Object.hasOwn(elbTypes, type) && elbTypes[type][3].test(id)));
var init_terraform_absence = __esm(() => {
  init_exec();
  init_artifacts();
  init_canonical();
  types = {
    aws_vpc: ['describe-vpcs', 'Vpcs', 'VpcId', 'vpc-id', 'vpc'],
    aws_subnet: ['describe-subnets', 'Subnets', 'SubnetId', 'subnet-id', 'subnet'],
    aws_instance: ['describe-instances', 'Reservations', 'InstanceId', 'instance-id', 'i'],
    aws_network_interface: [
      'describe-network-interfaces',
      'NetworkInterfaces',
      'NetworkInterfaceId',
      'network-interface-id',
      'eni',
    ],
    aws_security_group: ['describe-security-groups', 'SecurityGroups', 'GroupId', 'group-id', 'sg'],
    aws_route_table: ['describe-route-tables', 'RouteTables', 'RouteTableId', 'route-table-id', 'rtb'],
    aws_internet_gateway: [
      'describe-internet-gateways',
      'InternetGateways',
      'InternetGatewayId',
      'internet-gateway-id',
      'igw',
    ],
    aws_eip: ['describe-addresses', 'Addresses', 'AllocationId', 'allocation-id', 'eipalloc'],
    aws_ebs_volume: ['describe-volumes', 'Volumes', 'VolumeId', 'volume-id', 'vol'],
    aws_ec2_transit_gateway_vpc_attachment: [
      'describe-transit-gateway-vpc-attachments',
      'TransitGatewayVpcAttachments',
      'TransitGatewayAttachmentId',
      'transit-gateway-attachment-id',
      'tgw-attach',
    ],
    aws_ec2_transit_gateway_connect: [
      'describe-transit-gateway-connects',
      'TransitGatewayConnects',
      'TransitGatewayAttachmentId',
      'transit-gateway-attachment-id',
      'tgw-attach',
    ],
    aws_ec2_transit_gateway_connect_peer: [
      'describe-transit-gateway-connect-peers',
      'TransitGatewayConnectPeers',
      'TransitGatewayConnectPeerId',
      'transit-gateway-connect-peer-id',
      'tgw-connect-peer',
    ],
    aws_ec2_transit_gateway_attachment: [
      'describe-transit-gateway-attachments',
      'TransitGatewayAttachments',
      'TransitGatewayAttachmentId',
      'transit-gateway-attachment-id',
      'tgw-attach',
    ],
    aws_ec2_transit_gateway_route_table: [
      'describe-transit-gateway-route-tables',
      'TransitGatewayRouteTables',
      'TransitGatewayRouteTableId',
      'transit-gateway-route-table-id',
      'tgw-rtb',
    ],
  };
  elbTypes = {
    aws_lb: [
      'describe-load-balancers',
      'LoadBalancers',
      'LoadBalancerArns',
      /^arn:[^:]+:elasticloadbalancing:[^:]+:\d{12}:loadbalancer\/net\/[A-Za-z0-9-]+\/[a-f0-9]+$/,
    ],
    aws_lb_target_group: [
      'describe-target-groups',
      'TargetGroups',
      'TargetGroupArns',
      /^arn:[^:]+:elasticloadbalancing:[^:]+:\d{12}:targetgroup\/[A-Za-z0-9-]+\/[a-f0-9]+$/,
    ],
    aws_lb_listener: [
      'describe-listeners',
      'Listeners',
      'ListenerArns',
      /^arn:[^:]+:elasticloadbalancing:[^:]+:\d{12}:listener\/net\/[A-Za-z0-9-]+\/[a-f0-9]+\/[a-f0-9]+$/,
    ],
  };
});

// plugins/aws/src/ce/terraform-destroy-ownership.ts
function object18(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed AWS teardown identity');
  return value;
}
function rows3(value) {
  if (!Array.isArray(value)) throw new Error('Incomplete AWS teardown inventory');
  return value.map(object18);
}
async function verifyAwsTerraformDestroyOwnership(plan, receipt, session, rawApi, env, signal) {
  verifyAwsCePlan(plan);
  const intent = plan.intent;
  if (
    plan.engine !== 'terraform' ||
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.operation !== 'destroy' ||
    receipt.deploymentId !== intent.deploymentName ||
    receipt.backendIdentity !== `local:${intent.deploymentName}` ||
    (receipt.actionInvocations?.length ?? 0) > 0 ||
    !Array.isArray(receipt.changes) ||
    receipt.changes.some(
      (change) =>
        change.actions.join(',') !== 'delete' ||
        !new RegExp(`^${change.type}\\.[a-z][a-z0-9_]*$`).test(change.address) ||
        (!Object.hasOwn(tagged, change.type) &&
          !Object.hasOwn(elbTagged, change.type) &&
          !Object.hasOwn(relationships, change.type)),
    ) ||
    new Set(receipt.changes.map((change) => change.address)).size !== receipt.changes.length
  )
    throw new Error('Exact owning AWS Terraform destroy plan with supported resource types required');
  const api = scopedAwsApi(rawApi, intent.awsProfile, signal);
  const run = async (service, operation, args = []) => {
    const result = await api.exec('aws', [service, operation, ...args, '--region', intent.region, '--output', 'json']);
    signal?.throwIfAborted();
    if (result.exitCode !== 0) throw new Error('AWS teardown ownership observation unavailable');
    let value;
    try {
      value = object18(JSON.parse(result.stdout));
    } catch {
      throw new Error('Malformed AWS teardown response');
    }
    if (value.NextToken || value.NextMarker || value.nextToken) throw new Error('Partial AWS teardown inventory');
    return value;
  };
  if ((await run('sts', 'get-caller-identity')).Account !== intent.accountId)
    throw new Error('AWS teardown account differs from deployment');
  const fields = await session.readPlannedResourceFields(
    receipt,
    receipt.changes.length
      ? Object.fromEntries(
          receipt.changes.map((change) => [change.address, ['id', 'region', ...(relationships[change.type] ?? [])]]),
        )
      : { 'aws_vpc.ce': ['id'] },
    env,
    signal,
  );
  if (!receipt.changes.length) {
    if (fields['aws_vpc.ce'] !== null || Object.keys(fields).length !== 1)
      throw new Error('Empty Terraform destroy plan identity differs');
    delete fields['aws_vpc.ce'];
  }
  if (Object.keys(fields).length !== receipt.changes.length)
    throw new Error('Incomplete Terraform teardown projection');
  const states = receipt.changes.map((change) => {
    const value = object18(fields[change.address]);
    if (typeof value.id !== 'string' || !value.id || value.region !== intent.region)
      throw new Error('Terraform teardown resource identity or region differs');
    return { ...change, value };
  });
  const owned = (value, key = 'Tags') => {
    const tags = rows3(value[key]);
    const expected = {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-execution-engine': 'terraform',
      'xcsh-deployment-id': intent.deploymentName,
      'xcsh-plan-sha256': plan.planSha256,
    };
    if (
      Object.entries(expected).some(([key, expectedValue]) => {
        const matching = tags.filter((tag) => tag.Key === key);
        return matching.length !== 1 || matching[0].Value !== expectedValue;
      })
    )
      throw new Error('AWS teardown resource is foreign to this deployment, plan, or engine');
  };
  const live = new Map();
  for (const [type, [operation, flag, collection, idKey, prefix]] of Object.entries(tagged)) {
    const selected = states.filter((state) => state.type === type);
    if (!selected.length) continue;
    const ids = selected.map((state) => String(state.value.id));
    if (new Set(ids).size !== ids.length || ids.some((id) => !new RegExp(`^${prefix}-[a-f0-9]{8,21}$`).test(id)))
      throw new Error('Malformed or duplicate Terraform teardown resource IDs');
    const response = await run('ec2', operation, [flag, ...ids]);
    const observed =
      type === 'aws_instance'
        ? rows3(response.Reservations).flatMap((reservation) => rows3(reservation.Instances))
        : rows3(response[collection]);
    if (
      observed.length !== ids.length ||
      new Set(observed.map((item) => item[idKey])).size !== ids.length ||
      observed.some((item) => !ids.includes(String(item[idKey])))
    )
      throw new Error('AWS substituted or omitted teardown resource identities');
    for (const item of observed) {
      owned(item, type === 'aws_network_interface' ? 'TagSet' : 'Tags');
      const id = String(item[idKey]);
      if (live.has(id)) throw new Error('Duplicate teardown resource identity across types');
      live.set(id, { type, value: item });
    }
  }
  for (const [type, [operation, flag, collection, pattern]] of Object.entries(elbTagged)) {
    const selected = states.filter((state) => state.type === type);
    if (!selected.length) continue;
    const ids = selected.map((state) => String(state.value.id));
    if (new Set(ids).size !== ids.length || ids.some((id) => !pattern.test(id)))
      throw new Error('Malformed or duplicate Terraform NLB resource IDs');
    const response = await run('elbv2', operation, [flag, ...ids]);
    const observed = rows3(response[collection]);
    const idKey =
      type === 'aws_lb' ? 'LoadBalancerArn' : type === 'aws_lb_target_group' ? 'TargetGroupArn' : 'ListenerArn';
    if (
      observed.length !== ids.length ||
      new Set(observed.map((item) => item[idKey])).size !== ids.length ||
      observed.some((item) => !ids.includes(String(item[idKey])))
    )
      throw new Error('AWS substituted or omitted Terraform NLB identities');
    const descriptions = rows3((await run('elbv2', 'describe-tags', ['--resource-arns', ...ids])).TagDescriptions);
    if (descriptions.length !== ids.length) throw new Error('Terraform NLB ownership tags are incomplete');
    for (const item of observed) {
      const id = String(item[idKey]);
      const description = descriptions.filter((row) => row.ResourceArn === id);
      if (description.length !== 1) throw new Error('Terraform NLB ownership tags are ambiguous');
      owned(description[0]);
      if (live.has(id)) throw new Error('Duplicate teardown resource identity across types');
      live.set(id, { type, value: item });
    }
  }
  const parent = (id, types) => {
    const result = typeof id === 'string' ? live.get(id) : undefined;
    if (!result || !types.includes(result.type)) throw new Error('Teardown relationship has an unowned parent');
    return result.value;
  };
  const volumeIds = new Set();
  for (const { type, value } of live.values())
    if (type === 'aws_instance') {
      const nics = rows3(value.NetworkInterfaces);
      if (!nics.length) throw new Error('Instance teardown NIC inventory is unavailable');
      for (const nic of nics) parent(nic.NetworkInterfaceId, ['aws_network_interface']);
      const disks = rows3(value.BlockDeviceMappings);
      if (!disks.length) throw new Error('Instance teardown disk inventory is unavailable');
      for (const disk of disks) {
        const id = object18(disk.Ebs).VolumeId;
        if (typeof id !== 'string' || !/^vol-[a-f0-9]{8,21}$/.test(id))
          throw new Error('Instance teardown volume identity is unavailable');
        volumeIds.add(id);
      }
    }
  if (volumeIds.size) {
    const volumes = rows3((await run('ec2', 'describe-volumes', ['--volume-ids', ...volumeIds])).Volumes);
    if (
      volumes.length !== volumeIds.size ||
      new Set(volumes.map((volume) => volume.VolumeId)).size !== volumeIds.size ||
      volumes.some((volume) => !volumeIds.has(String(volume.VolumeId)))
    )
      throw new Error('Instance teardown volume inventory differs');
    for (const volume of volumes) owned(volume);
  }
  const tables = new Map();
  const tgwTable = async (id) => {
    if (typeof id !== 'string' || !/^tgw-rtb-[a-f0-9]{8,21}$/.test(id)) throw new Error('Invalid referenced TGW table');
    const cached = tables.get(id);
    if (cached) return cached;
    const gateways = rows3(
      (await run('ec2', 'describe-transit-gateways', ['--transit-gateway-ids', intent.routing.transitGatewayId ?? '']))
        .TransitGateways,
    );
    if (
      gateways.length !== 1 ||
      gateways[0].TransitGatewayId !== intent.routing.transitGatewayId ||
      gateways[0].OwnerId !== intent.accountId
    )
      throw new Error('Referenced transit gateway ownership differs');
    const tableRows = rows3(
      (await run('ec2', 'describe-transit-gateway-route-tables', ['--transit-gateway-route-table-ids', id]))
        .TransitGatewayRouteTables,
    );
    if (
      tableRows.length !== 1 ||
      tableRows[0].TransitGatewayRouteTableId !== id ||
      tableRows[0].TransitGatewayId !== intent.routing.transitGatewayId
    )
      throw new Error('Referenced transit gateway table identity differs');
    const result = {
      associations: rows3(
        (await run('ec2', 'get-transit-gateway-route-table-associations', ['--transit-gateway-route-table-id', id]))
          .Associations,
      ),
      propagations: rows3(
        (await run('ec2', 'get-transit-gateway-route-table-propagations', ['--transit-gateway-route-table-id', id]))
          .TransitGatewayRouteTablePropagations,
      ),
    };
    tables.set(id, result);
    return result;
  };
  for (const { type, value } of states) {
    if (type === 'aws_route') {
      const table = parent(value.route_table_id, ['aws_route_table']);
      if (
        typeof value.destination_cidr_block !== 'string' ||
        !value.destination_cidr_block ||
        value.destination_ipv6_cidr_block ||
        value.destination_prefix_list_id
      )
        throw new Error('Teardown route destination requires explicit translation');
      const matches = rows3(table.Routes).filter(
        (route) => route.DestinationCidrBlock === value.destination_cidr_block,
      );
      if (matches.length !== 1 || (value.gateway_id && value.transit_gateway_id))
        throw new Error('Teardown route is ambiguous');
      if (value.gateway_id) {
        parent(value.gateway_id, ['aws_internet_gateway']);
        if (matches[0].GatewayId !== value.gateway_id) throw new Error('Teardown route gateway differs');
      } else if (
        !value.transit_gateway_id ||
        value.transit_gateway_id !== intent.routing.transitGatewayId ||
        matches[0].TransitGatewayId !== value.transit_gateway_id
      )
        throw new Error('Teardown route target differs');
    } else if (type === 'aws_route_table_association') {
      const table = parent(value.route_table_id, ['aws_route_table']);
      parent(value.subnet_id, ['aws_subnet']);
      const matches = rows3(table.Associations).filter((edge) => edge.RouteTableAssociationId === value.id);
      if (
        value.gateway_id ||
        matches.length !== 1 ||
        matches[0].SubnetId !== value.subnet_id ||
        matches[0].RouteTableId !== value.route_table_id
      )
        throw new Error('Teardown subnet association differs');
    } else if (type === 'aws_eip_association') {
      const eip = parent(value.allocation_id, ['aws_eip']);
      parent(value.network_interface_id, ['aws_network_interface']);
      if (value.instance_id) parent(value.instance_id, ['aws_instance']);
      if (
        (value.instance_id && eip.InstanceId !== value.instance_id) ||
        eip.AssociationId !== value.id ||
        eip.NetworkInterfaceId !== value.network_interface_id
      )
        throw new Error('Teardown EIP association differs');
    } else if (type === 'aws_lb_target_group_attachment') {
      const group = parent(value.target_group_arn, ['aws_lb_target_group']);
      if (
        typeof value.target_id !== 'string' ||
        ![...live.values()].some(
          (row) => row.type === 'aws_network_interface' && row.value.PrivateIpAddress === value.target_id,
        ) ||
        !Number.isInteger(value.port) ||
        value.port !== (intent.ingress?.mode === 'nlb' ? intent.ingress.port : 443)
      )
        throw new Error('Teardown NLB target attachment differs');
      const health = rows3(
        (
          await run('elbv2', 'describe-target-health', [
            '--target-group-arn',
            String(group.TargetGroupArn),
            '--targets',
            `Id=${value.target_id},Port=${value.port}`,
          ])
        ).TargetHealthDescriptions,
      );
      if (
        health.length !== 1 ||
        object18(health[0].Target).Id !== value.target_id ||
        object18(health[0].Target).Port !== value.port
      )
        throw new Error('Teardown NLB target health identity differs');
    } else if (type.startsWith('aws_ec2_transit_gateway_route_table_')) {
      parent(value.transit_gateway_attachment_id, [
        'aws_ec2_transit_gateway_connect',
        'aws_ec2_transit_gateway_vpc_attachment',
      ]);
      const association = type.endsWith('_association');
      if (
        !(association ? intent.routing.associations : intent.routing.propagations)?.includes(
          String(value.transit_gateway_route_table_id),
        )
      )
        throw new Error('Teardown TGW table is outside approved references');
      const table = await tgwTable(value.transit_gateway_route_table_id);
      const matches = rows3(table[association ? 'associations' : 'propagations']).filter(
        (edge) => edge.TransitGatewayAttachmentId === value.transit_gateway_attachment_id,
      );
      if (matches.length !== 1) throw new Error('Teardown TGW relationship is absent or ambiguous');
    }
  }
  const loadBalancers = [...live.values()].filter((row) => row.type === 'aws_lb').map((row) => row.value);
  const targetGroups = [...live.values()].filter((row) => row.type === 'aws_lb_target_group').map((row) => row.value);
  const listeners = [...live.values()].filter((row) => row.type === 'aws_lb_listener').map((row) => row.value);
  if (loadBalancers.length || targetGroups.length || listeners.length) {
    const ingress = intent.ingress?.mode === 'nlb' ? intent.ingress : undefined;
    if (
      loadBalancers.length !== 1 ||
      targetGroups.length !== 1 ||
      listeners.length !== 1 ||
      loadBalancers[0].Type !== 'network' ||
      loadBalancers[0].Scheme !== (ingress ? 'internal' : 'internet-facing') ||
      parent(loadBalancers[0].VpcId, ['aws_vpc']).VpcId !== loadBalancers[0].VpcId ||
      targetGroups[0].VpcId !== loadBalancers[0].VpcId ||
      targetGroups[0].Protocol !== 'TCP' ||
      targetGroups[0].Port !== (ingress?.port ?? 443) ||
      listeners[0].LoadBalancerArn !== loadBalancers[0].LoadBalancerArn ||
      listeners[0].Protocol !== 'TCP' ||
      listeners[0].Port !== (ingress?.port ?? 443)
    )
      throw new Error('Terraform NLB topology differs from the ingress intent');
    const actions = rows3(listeners[0].DefaultActions);
    if (
      actions.length !== 1 ||
      actions[0].Type !== 'forward' ||
      actions[0].TargetGroupArn !== targetGroups[0].TargetGroupArn
    )
      throw new Error('Terraform NLB listener target differs');
  }
  const material = {
    schemaVersion: 1,
    engine: 'terraform',
    accountId: intent.accountId,
    region: intent.region,
    deploymentId: intent.deploymentName,
    sourcePlanSha256: plan.planSha256,
    terraformPlanSha256: receipt.planSha256,
    resources: [...live.entries()]
      .map(([id, row]) => ({ type: row.type, id }))
      .concat([...volumeIds].map((id) => ({ type: 'aws_ebs_volume', id }))),
    tgwEdges: states
      .filter((row) => row.type.startsWith('aws_ec2_transit_gateway_route_table_'))
      .map((row) => ({
        kind: row.type.endsWith('_association') ? 'association' : 'propagation',
        tableId: String(row.value.transit_gateway_route_table_id),
        attachmentId: String(row.value.transit_gateway_attachment_id),
      })),
  };
  return {
    inventory: { ...material, sha256: canonicalSha256(material) },
    source: 'aws-cli-live+terraform-saved-plan',
    observedAt: new Date().toISOString(),
    engine: 'terraform',
    accountId: intent.accountId,
    region: intent.region,
    planSha256: plan.planSha256,
    terraformPlanSha256: receipt.planSha256,
    configurationSha256: receipt.configurationSha256,
    resourceCount: states.length,
    attachedVolumeCount: volumeIds.size,
  };
}
var tagged, elbTagged, relationships;
var init_terraform_destroy_ownership = __esm(() => {
  init_artifacts();
  init_canonical();
  tagged = {
    aws_vpc: ['describe-vpcs', '--vpc-ids', 'Vpcs', 'VpcId', 'vpc'],
    aws_subnet: ['describe-subnets', '--subnet-ids', 'Subnets', 'SubnetId', 'subnet'],
    aws_instance: ['describe-instances', '--instance-ids', 'Instances', 'InstanceId', 'i'],
    aws_network_interface: [
      'describe-network-interfaces',
      '--network-interface-ids',
      'NetworkInterfaces',
      'NetworkInterfaceId',
      'eni',
    ],
    aws_security_group: ['describe-security-groups', '--group-ids', 'SecurityGroups', 'GroupId', 'sg'],
    aws_route_table: ['describe-route-tables', '--route-table-ids', 'RouteTables', 'RouteTableId', 'rtb'],
    aws_internet_gateway: [
      'describe-internet-gateways',
      '--internet-gateway-ids',
      'InternetGateways',
      'InternetGatewayId',
      'igw',
    ],
    aws_eip: ['describe-addresses', '--allocation-ids', 'Addresses', 'AllocationId', 'eipalloc'],
    aws_ec2_transit_gateway_vpc_attachment: [
      'describe-transit-gateway-vpc-attachments',
      '--transit-gateway-attachment-ids',
      'TransitGatewayVpcAttachments',
      'TransitGatewayAttachmentId',
      'tgw-attach',
    ],
    aws_ec2_transit_gateway_connect: [
      'describe-transit-gateway-connects',
      '--transit-gateway-attachment-ids',
      'TransitGatewayConnects',
      'TransitGatewayAttachmentId',
      'tgw-attach',
    ],
    aws_ec2_transit_gateway_connect_peer: [
      'describe-transit-gateway-connect-peers',
      '--transit-gateway-connect-peer-ids',
      'TransitGatewayConnectPeers',
      'TransitGatewayConnectPeerId',
      'tgw-connect-peer',
    ],
  };
  elbTagged = {
    aws_lb: [
      'describe-load-balancers',
      '--load-balancer-arns',
      'LoadBalancers',
      /^arn:[^:]+:elasticloadbalancing:[^:]+:\d{12}:loadbalancer\/net\/[A-Za-z0-9-]+\/[a-f0-9]+$/,
    ],
    aws_lb_target_group: [
      'describe-target-groups',
      '--target-group-arns',
      'TargetGroups',
      /^arn:[^:]+:elasticloadbalancing:[^:]+:\d{12}:targetgroup\/[A-Za-z0-9-]+\/[a-f0-9]+$/,
    ],
    aws_lb_listener: [
      'describe-listeners',
      '--listener-arns',
      'Listeners',
      /^arn:[^:]+:elasticloadbalancing:[^:]+:\d{12}:listener\/net\/[A-Za-z0-9-]+\/[a-f0-9]+\/[a-f0-9]+$/,
    ],
  };
  relationships = {
    aws_route: [
      'route_table_id',
      'destination_cidr_block',
      'destination_ipv6_cidr_block',
      'destination_prefix_list_id',
      'gateway_id',
      'transit_gateway_id',
    ],
    aws_route_table_association: ['route_table_id', 'subnet_id', 'gateway_id'],
    aws_eip_association: ['allocation_id', 'network_interface_id', 'instance_id'],
    aws_ec2_transit_gateway_route_table_association: [
      'transit_gateway_attachment_id',
      'transit_gateway_route_table_id',
    ],
    aws_ec2_transit_gateway_route_table_propagation: [
      'transit_gateway_attachment_id',
      'transit_gateway_route_table_id',
    ],
    aws_lb_target_group_attachment: ['target_group_arn', 'target_id', 'port'],
  };
});

// plugins/aws/src/ce/terraform-cloud-teardown.ts
import { createHash as createHash9 } from 'node:crypto';

async function optional4(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return;
  }
}
function retiredConfiguration(plan, configuration) {
  const config = JSON.parse(configuration);
  const provider = config?.provider?.aws;
  if (
    !provider ||
    provider.region !== plan.intent.region ||
    JSON.stringify(provider.allowed_account_ids) !== JSON.stringify([plan.intent.accountId]) ||
    (provider.profile ?? undefined) !== plan.intent.awsProfile ||
    !config.terraform
  )
    throw new Error('Terraform teardown configuration scope differs');
  return JSON.stringify({ terraform: config.terraform, provider: config.provider });
}
async function runAwsTerraformCloudTeardown(plan, session, storage, api, env, signal) {
  verifyAwsCePlan(plan);
  const owner = storage.owner;
  if (
    plan.engine !== 'terraform' ||
    owner.engine !== 'terraform' ||
    owner.provider !== 'aws' ||
    owner.deploymentId !== plan.intent.deploymentName ||
    owner.account !== plan.intent.accountId ||
    owner.region !== plan.intent.region
  )
    throw new Error('Terraform cloud teardown ownership differs');
  signal?.throwIfAborted();
  await storage.verify();
  let source = await optional4(storage, sourceFile);
  let checkpoint = await optional4(storage, checkpointFile);
  if (source === undefined) {
    if (checkpoint !== undefined) throw new Error('Terraform teardown source snapshot is missing');
    const receipt = await session.planDestroy(env, signal);
    const configuration = await session.readConfiguration(receipt.configurationSha256);
    const retired = retiredConfiguration(plan, configuration);
    source = {
      schemaVersion: 1,
      engine: 'terraform',
      sourcePlanSha256: plan.planSha256,
      configuration,
      configurationSha256: digest3(configuration),
      retiredConfiguration: retired,
      retiredConfigurationSha256: digest3(retired),
    };
    await storage.write(sourceFile, source);
  }
  if (
    !source ||
    source.schemaVersion !== 1 ||
    source.engine !== 'terraform' ||
    source.sourcePlanSha256 !== plan.planSha256 ||
    typeof source.configuration !== 'string' ||
    typeof source.retiredConfiguration !== 'string' ||
    digest3(source.configuration) !== source.configurationSha256 ||
    digest3(source.retiredConfiguration) !== source.retiredConfigurationSha256 ||
    retiredConfiguration(plan, source.configuration) !== source.retiredConfiguration
  )
    throw new Error('Terraform teardown source snapshot is forged or differs');
  if (checkpoint === undefined) {
    checkpoint = {
      schemaVersion: 1,
      engine: 'terraform',
      sourcePlanSha256: plan.planSha256,
      configurationSha256: source.configurationSha256,
      retiredConfigurationSha256: source.retiredConfigurationSha256,
      phase: 'destroy-pending',
    };
    await storage.write(checkpointFile, checkpoint);
  }
  if (
    !checkpoint ||
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.sourcePlanSha256 !== plan.planSha256 ||
    checkpoint.configurationSha256 !== source.configurationSha256 ||
    checkpoint.retiredConfigurationSha256 !== source.retiredConfigurationSha256 ||
    !['destroy-pending', 'retire-pending', 'verify-pending', 'retired'].includes(checkpoint.phase)
  )
    throw new Error('Terraform cloud teardown checkpoint differs');
  const save = () => storage.write(checkpointFile, checkpoint);
  if (checkpoint.phase === 'destroy-pending') {
    signal?.throwIfAborted();
    const receipt = await session.planDestroy(env, signal);
    if (receipt.configurationSha256 !== source.configurationSha256)
      throw new Error('Terraform teardown configuration changed before destruction');
    await storage.write('terraform-cloud-teardown-plan.json', receipt);
    await storage.verify();
    const ownership = await verifyAwsTerraformDestroyOwnership(plan, receipt, session, api, env, signal);
    const originalInventory = await optional4(storage, 'terraform-cloud-teardown-inventory.json');
    if (originalInventory === undefined) {
      await storage.write('terraform-cloud-teardown-inventory.json', ownership.inventory);
    } else {
      if (!originalInventory) throw new Error('Original cloud retirement inventory is invalid');
      const { sha256, ...material } = originalInventory;
      if (
        canonicalSha256(material) !== sha256 ||
        originalInventory.schemaVersion !== 1 ||
        originalInventory.engine !== 'terraform' ||
        originalInventory.sourcePlanSha256 !== plan.planSha256 ||
        originalInventory.deploymentId !== owner.deploymentId ||
        originalInventory.accountId !== owner.account ||
        originalInventory.region !== owner.region ||
        !Array.isArray(originalInventory.resources) ||
        !Array.isArray(originalInventory.tgwEdges) ||
        ownership.inventory.resources.some(
          (resource) =>
            !originalInventory.resources.some((row) => row.type === resource.type && row.id === resource.id),
        ) ||
        ownership.inventory.tgwEdges.some(
          (edge) => !originalInventory.tgwEdges.some((row) => canonicalSha256(row) === canonicalSha256(edge)),
        )
      )
        throw new Error('Original cloud retirement inventory differs');
    }
    await storage.write('terraform-cloud-teardown-ownership.json', ownership);
    await storage.verify();
    await session.apply(receipt, env, signal);
    checkpoint.phase = 'retire-pending';
    await save();
  }
  if (checkpoint.phase === 'retire-pending') {
    signal?.throwIfAborted();
    await storage.verify();
    try {
      await session.reviseConfiguration(source.configurationSha256, source.retiredConfiguration);
    } catch (error) {
      try {
        await session.readConfiguration(source.retiredConfigurationSha256);
      } catch {
        throw error;
      }
    }
    checkpoint.phase = 'verify-pending';
    await save();
  }
  signal?.throwIfAborted();
  await storage.verify();
  await session.readConfiguration(source.retiredConfigurationSha256);
  const final = await session.plan(env, signal);
  if (
    final.operation ||
    final.configurationSha256 !== source.retiredConfigurationSha256 ||
    !final.noChanges ||
    final.changes.length ||
    (final.actionInvocations?.length ?? 0) > 0
  )
    throw new Error('Retired Terraform configuration did not converge to an ordinary no-change plan');
  await session.apply(final, env, signal);
  await storage.write('terraform-cloud-teardown-final-refresh.json', final);
  checkpoint.phase = 'retired';
  await save();
  return {
    status: 'terraform-state-retired',
    engine: 'terraform',
    sourcePlanSha256: plan.planSha256,
    finalPlanSha256: final.planSha256,
    observedAt: new Date().toISOString(),
    cloudInventory: 'unknown',
    platform: 'unknown',
  };
}
var digest3 = (value) => createHash9('sha256').update(value).digest('hex'),
  sourceFile = 'terraform-cloud-teardown-source.json',
  checkpointFile = 'terraform-cloud-teardown.json';
var init_terraform_cloud_teardown = __esm(() => {
  init_artifacts();
  init_canonical();
  init_terraform_destroy_ownership();
});

// plugins/aws/src/ce/terraform-teardown.ts
function compileAwsTerraformTeardown(base, drain, retirement) {
  verifyAwsCePlan(base);
  const selected = siteBindings(base);
  if (
    base.engine !== 'terraform' ||
    drain?.schemaVersion !== 1 ||
    drain.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(drain.owner) !== canonicalSha256(selected[0].binding.owner) ||
    !Array.isArray(drain.sites) ||
    drain.sites.length !== selected.length ||
    !Array.isArray(retirement) ||
    retirement.length !== selected.length ||
    !Array.isArray(base.actions)
  )
    throw new Error('Terraform teardown source or topology differs');
  const peers = base.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  if (
    !['direct-eni', 'nlb-ingress', 'tgw-static', 'tgw-connect'].includes(base.routing?.profile) ||
    (base.routing.profile === 'tgw-connect' ? !peers.length : !!peers.length)
  )
    throw new Error('Terraform teardown routing source is incomplete');
  const exportPolicies = drain.sites.flatMap((row) => row.routing).filter((row) => row.kind === 'bgp_routing_policy');
  if (exportPolicies.length !== 0 && exportPolicies.length !== selected.length)
    throw new Error('Terraform teardown export-policy inventory is incomplete');
  const seen = new Set();
  const unique = (key) => {
    if (seen.has(key)) throw new Error('Duplicate teardown resource identity');
    seen.add(key);
  };
  for (const { site, binding } of selected) {
    const matches = drain.sites.filter((row) => row.binding?.siteName === site.name),
      retired = retirement.filter((row) => row.siteName === site.name);
    if (matches.length !== 1 || retired.length !== 1)
      throw new Error('Terraform teardown site inventory is incomplete');
    const planned = matches[0],
      target = retired[0];
    if (
      canonicalSha256(planned.binding) !== canonicalSha256(binding) ||
      !uid(planned.siteUid) ||
      target.siteUid !== planned.siteUid ||
      !uid(target.physicalSiteUid)
    )
      throw new Error('Terraform teardown site identity differs');
    unique(`uid:${target.siteUid}`);
    unique(`uid:${target.physicalSiteUid}`);
    const expected = peers
      .filter((action) => site.nodeIndexes.includes(action.node ?? 0))
      .map((action) => ({
        kind: 'external_connector',
        name: `${base.deploymentName.slice(0, 24)}-gre-${peers.indexOf(action) + 1}`,
      }));
    if (expected.length) {
      if (exportPolicies.length)
        expected.push({ kind: 'bgp_routing_policy', name: `${site.name.slice(0, 43)}-tgw-export-policy` });
      expected.push({ kind: 'bgp', name: `${site.name.slice(0, 55)}-tgw-bgp` });
    }
    if (
      !Array.isArray(planned.routing) ||
      planned.routing.length !== expected.length ||
      expected.some(
        (row) => planned.routing.filter((value) => value.name === row.name && value.kind === row.kind).length !== 1,
      )
    )
      throw new Error('Terraform teardown routing inventory is incomplete');
    for (const resource of planned.routing) {
      if (!uid(resource.uid)) throw new Error('Routing UID missing');
      unique(`uid:${resource.uid}`);
    }
    if (
      !Array.isArray(target.tokens) ||
      target.tokens.length > 128 ||
      binding.nodes.some((node) => !target.tokens.some((token) => token.node === node))
    )
      throw new Error('Bootstrap token inventory is incomplete');
    for (const token of target.tokens) {
      if (!binding.nodes.includes(token.node) || !name3(token.name)) throw new Error('Bootstrap token scope differs');
      unique(`token:${token.name}`);
    }
  }
  const draft = {
    schemaVersion: 1,
    kind: 'aws-ce-terraform-teardown',
    engine: 'terraform',
    sourcePlanSha256: base.planSha256,
    drain: structuredClone(drain),
    retirement: structuredClone(retirement),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
async function coordinateAwsTerraformTeardown(base, input, authorizedPlanSha256, storage, driver, signal) {
  base = structuredClone(base);
  const plan = structuredClone(input);
  const compiled = compileAwsTerraformTeardown(base, plan.drain, plan.retirement);
  const validate = async () => {
    signal?.throwIfAborted();
    await storage.verify();
    if (
      canonicalSha256(compiled) !== canonicalSha256(plan) ||
      authorizedPlanSha256 !== plan.planSha256 ||
      canonicalSha256(storage.owner) !== canonicalSha256(plan.drain.owner) ||
      driver.engine !== 'terraform' ||
      driver.siteContractFingerprint !== plan.drain.siteContractFingerprint ||
      driver.ingressContractFingerprint !== plan.drain.ingressContractFingerprint
    )
      throw new Error('Terraform teardown ownership, authorization or contract differs');
  };
  await validate();
  let saved;
  try {
    saved = await storage.read('aws-terraform-teardown-source.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (saved === undefined) await storage.write('aws-terraform-teardown-source.json', plan);
  else if (!saved || canonicalSha256(saved) !== canonicalSha256(plan))
    throw new Error('Persisted Terraform teardown source differs');
  const completed = [];
  const checkpoint = () =>
    storage.write('aws-terraform-teardown-progress.json', {
      schemaVersion: 1,
      planSha256: plan.planSha256,
      completed: [...completed],
      observedAt: new Date().toISOString(),
    });
  const drained = await driver.drain(signal);
  if (drained.status !== 'platform-drained') return { status: 'pending-platform-drain', cloudInventory: 'unknown' };
  completed.push('platform-drained');
  await checkpoint();
  await validate();
  const cloud = await driver.retireCloud(signal);
  if (
    cloud.status !== 'terraform-state-retired' ||
    cloud.sourcePlanSha256 !== base.planSha256 ||
    !/^[a-f0-9]{64}$/.test(cloud.finalPlanSha256)
  )
    throw new Error('Cloud retirement did not produce a bound no-change receipt');
  completed.push('terraform-state-retired');
  await checkpoint();
  for (const site of plan.retirement) {
    await validate();
    if (!['pending', 'deleted'].includes((await driver.observeSite(site, signal)).status))
      throw new Error('Site retirement identity evidence is unknown');
    for (const token of site.tokens) {
      await validate();
      await driver.revokeToken(site, token, signal);
      completed.push(`token:${token.name}`);
      await checkpoint();
    }
    await validate();
    await driver.deleteSite(site, signal);
    const observation = await driver.observeSite(site, signal);
    if (observation.status !== 'deleted')
      return {
        status: 'pending-site-retirement',
        siteName: site.siteName,
        cloudInventory: 'unknown',
      };
    completed.push(`site:${site.siteName}`);
    await checkpoint();
  }
  await validate();
  const finalCloud = await driver.retireCloud(signal);
  if (
    finalCloud.status !== 'terraform-state-retired' ||
    finalCloud.sourcePlanSha256 !== base.planSha256 ||
    !/^[a-f0-9]{64}$/.test(finalCloud.finalPlanSha256)
  )
    throw new Error('Final Terraform refresh did not converge');
  const receipt = {
    status: 'resources-retired-awaiting-inventory',
    owner: storage.owner,
    planSha256: plan.planSha256,
    sourcePlanSha256: base.planSha256,
    finalPlanSha256: finalCloud.finalPlanSha256,
    completed,
    cloudInventory: 'unknown',
    observedAt: new Date().toISOString(),
  };
  await storage.write('aws-terraform-teardown-receipt.json', receipt);
  return receipt;
}
async function verifyAwsTeardownCredentials(base, rawApi, signal) {
  signal?.throwIfAborted();
  verifyAwsCePlan(base);
  if (base.engine !== 'terraform') throw new Error('Terraform engine required for teardown');
  const api = scopedAwsApi(rawApi, base.intent.awsProfile, signal);
  const identity = await execAwsJson(api, ['sts', 'get-caller-identity', '--region', base.intent.region], signal);
  signal?.throwIfAborted();
  if (
    !identity ||
    typeof identity !== 'object' ||
    Array.isArray(identity) ||
    identity.Account !== base.intent.accountId
  )
    throw new Error('AWS teardown credential account is missing or differs');
}
async function runAwsTerraformTeardown(
  base,
  plan,
  authorizedPlanSha256,
  runtime,
  contract,
  session,
  storage,
  api,
  env,
  signal,
) {
  base = structuredClone(base);
  plan = structuredClone(plan);
  const bindings = siteBindings(base);
  const binding = (site) => {
    const found = bindings.find((row) => row.site.name === site.siteName);
    if (!found) throw new Error('Teardown site is outside deployment');
    return found.binding;
  };
  if (runtime.engine !== 'terraform') throw new Error('Terraform engine required for teardown');
  await verifyAwsTeardownCredentials(base, api, signal);
  const retired = await coordinateAwsTerraformTeardown(
    base,
    plan,
    authorizedPlanSha256,
    storage,
    {
      engine: 'terraform',
      siteContractFingerprint: runtime.contract.fingerprint,
      ingressContractFingerprint: contract.fingerprint,
      drain: (signal) => runtime.drainPlatform(plan.drain, contract, storage, signal),
      retireCloud: (signal) => runAwsTerraformCloudTeardown(base, session, storage, api, env, signal),
      observeSite: (site, signal) =>
        runtime.observeSiteDeletion(
          binding(site),
          { siteUid: site.siteUid, physicalSiteUid: site.physicalSiteUid },
          signal,
        ),
      revokeToken: (site, token, signal) => runtime.deleteBootstrapToken(binding(site), token.node, token.name, signal),
      deleteSite: (site, signal) => runtime.deleteSiteExact(binding(site), site.siteUid, signal),
    },
    signal,
  );
  if (retired.status !== 'resources-retired-awaiting-inventory') return retired;
  const inventory = await storage.read('terraform-cloud-teardown-inventory.json');
  const observation = await collectAwsTerraformAbsence(base, inventory, api, signal);
  await storage.write('aws-terraform-teardown-cloud-absence.json', observation);
  return {
    ...retired,
    status:
      observation.status === 'absent-or-retired'
        ? 'ce-retired-supporting-infrastructure-unverified'
        : 'pending-cloud-inventory',
    cloudInventory: observation.status,
  };
}
var name3 = (value) => typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value),
  uid = (value) => typeof value === 'string' && !!value.trim();
var init_terraform_teardown = __esm(() => {
  init_exec();
  init_artifacts();
  init_canonical();
  init_terraform_absence();
  init_terraform_cloud_teardown();
});

// plugins/aws/src/ce/terraform-teardown-plan.ts
import { readdir as readdir2 } from 'node:fs/promises';

async function optional5(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function collectAwsTeardownMaterial(input, runtime, contract, storage, signal) {
  const base = structuredClone(input);
  verifyAwsCePlan(base);
  signal?.throwIfAborted();
  const selected = siteBindings(base),
    bindings = selected.map((row) => row.binding),
    owner = bindings[0].owner;
  if (runtime.engine !== base.engine || canonicalSha256(storage.owner) !== canonicalSha256(owner))
    throw new Error('Teardown preparation requires the owning deployment engine');
  await storage.verify();
  const patterns = selected.flatMap(({ site, binding }) =>
    site.nodeIndexes.flatMap((globalIndex, localIndex) => [
      {
        prefix: `${base.deploymentName.slice(0, 40)}-${globalIndex}-`,
        siteName: binding.siteName,
        node: binding.nodes[localIndex],
      },
      {
        prefix: `${binding.siteName.slice(0, 36)}-${localIndex + 1}-r-`,
        siteName: binding.siteName,
        node: binding.nodes[localIndex],
      },
    ]),
  );
  const tokenMatches = (file) =>
    patterns.filter((row) => file.startsWith(row.prefix) && /^[a-f0-9]{12}\.json$/.test(file.slice(row.prefix.length)));
  const ingressFile = (file) => /^ingress-plan-[a-f0-9]{24}\.json$/.test(file);
  const files = async () => {
    await storage.verify();
    const entries = await readdir2(storage.directory, { withFileTypes: true });
    return entries
      .filter((entry) => ingressFile(entry.name) || tokenMatches(entry.name).length)
      .map((entry) => {
        if (!entry.isFile()) throw new Error('Teardown artifact is not a private regular file');
        return entry.name;
      })
      .sort();
  };
  const before = await files(),
    namespaces = new Set(['default']);
  for (const file of before.filter(ingressFile)) {
    const value = object19(await storage.read(file));
    const namespace = object19(object19(value.request).metadata).namespace;
    if (!safeName(namespace)) throw new Error('Stored listener namespace is invalid');
    namespaces.add(namespace);
    const originNamespace = object19(object19(object19(value.material).intent).originPool).namespace;
    if (!safeName(originNamespace)) throw new Error('Stored origin namespace is invalid');
    namespaces.add(originNamespace);
  }
  const observe = async () => {
    const receipt = await runtime.teardownInventory(bindings, [...namespaces].sort(), contract, signal);
    const observedAt = Date.parse(receipt.observedAt);
    if (
      receipt.status !== 'observed' ||
      canonicalSha256(receipt.owner) !== canonicalSha256(owner) ||
      receipt.siteContractFingerprint !== runtime.contract.fingerprint ||
      receipt.ingressContractFingerprint !== contract.fingerprint ||
      !Number.isFinite(observedAt) ||
      observedAt > Date.now() ||
      Date.now() - observedAt > 60000
    )
      throw new Error('Fresh platform teardown inventory is unavailable');
    return receipt;
  };
  const inventory = await observe(),
    ingress = runtime.ingress(contract, storage),
    originOperations = runtime.originTeardown(contract);
  const listeners = [];
  const listenerIds = new Set();
  const listenerLocators = new Set();
  for (const live of inventory.resources.filter((row) => row.kind === 'http_loadbalancers')) {
    if (!live.ingressPlanId) throw new Error('Live listener has no plan identity');
    const reference = await ingress.teardownReference(live.ingressPlanId);
    if (
      reference.phase !== 'created' ||
      reference.name !== live.name ||
      reference.namespace !== live.namespace ||
      reference.uid !== live.uid
    )
      throw new Error('Listener checkpoint differs from live resource');
    if (
      !inventory.resources.some(
        (row) =>
          row.kind === 'origin_pools' &&
          row.name === reference.originPool.name &&
          row.namespace === reference.originPool.namespace &&
          row.uid === reference.originPool.uid,
      )
    )
      throw new Error('Listener origin UID differs from live inventory');
    listeners.push({ id: reference.id, name: reference.name, namespace: reference.namespace });
    listenerIds.add(reference.id);
    listenerLocators.add(`${reference.namespace}/${reference.name}`);
  }
  for (const file of before.filter(ingressFile)) {
    const id = file.slice('ingress-plan-'.length, -'.json'.length);
    if (listenerIds.has(id)) continue;
    const reference = await ingress.teardownReference(id);
    const locator = `${reference.namespace}/${reference.name}`;
    if (reference.phase !== 'deleted')
      throw new Error('Checkpointed listener is unexpectedly absent from live inventory');
    if (listenerLocators.has(locator)) continue;
    listeners.push({ id: reference.id, name: reference.name, namespace: reference.namespace });
    listenerIds.add(reference.id);
    listenerLocators.add(locator);
  }
  const origins = [];
  for (const live of inventory.resources.filter((row) => row.kind === 'origin_pools'))
    origins.push(
      await originOperations.observe(owner, { name: live.name, namespace: live.namespace, uid: live.uid }, signal),
    );
  const routing = inventory.resources.filter(
    (row) => row.kind === 'bgps' || row.kind === 'bgp_routing_policys' || row.kind === 'external_connectors',
  );
  if (base.routing.profile === 'tgw-connect') {
    const saved = await optional5(storage, `${base.engine}-routing-checkpoint.json`);
    if (saved === undefined) {
      if (routing.length) throw new Error('Live routing exists without an owning checkpoint');
    } else {
      const checkpoint = object19(saved);
      let values;
      if (base.engine === 'terraform') {
        if (
          checkpoint.schemaVersion !== 2 ||
          checkpoint.engine !== 'terraform' ||
          checkpoint.planId !== base.planId ||
          checkpoint.planSha256 !== base.planSha256
        )
          throw new Error('Routing checkpoint source differs');
        values = object19(checkpoint.resolvedValues);
      } else {
        const native = checkpoint;
        const version = Number(checkpoint.schemaVersion);
        const legacy = version === 1;
        const checkpointedRouting = legacy ? routing.filter((row) => row.kind !== 'bgp_routing_policys') : routing;
        if (
          ![1, 2].includes(version) ||
          native.engine !== 'native' ||
          native.planId !== base.planId ||
          native.planSha256 !== base.planSha256 ||
          native.ownerSha256 !== canonicalSha256(owner) ||
          !Array.isArray(native.resources) ||
          native.resources.length !== checkpointedRouting.length
        )
          throw new Error('Routing checkpoint source differs');
        values = Object.fromEntries(native.resources.map((row) => [`__XC_ROUTING_${row.name}__`, row.uid]));
        if (legacy) {
          const policies = routing.filter((row) => row.kind === 'bgp_routing_policys');
          const expected = siteBindings(base).map(({ site }) => `${site.name.slice(0, 43)}-tgw-export-policy`);
          if (
            policies.length !== expected.length ||
            policies.some((row) => !expected.includes(row.name)) ||
            new Set(policies.map((row) => row.name)).size !== expected.length
          )
            throw new Error('Legacy routing policy inventory differs');
          for (const row of policies) values[`__XC_ROUTING_${row.name}__`] = row.uid;
        }
      }
      if (routing.some((row) => values[`__XC_ROUTING_${row.name}__`] !== row.uid))
        throw new Error('Routing checkpoint UID differs from live inventory');
    }
  }
  const tokenRows = new Map();
  for (const file of before) {
    const matches = tokenMatches(file);
    if (!matches.length) continue;
    if (matches.length !== 1) throw new Error('Ambiguous historical enrollment filename');
    const record = object19(await storage.read(file));
    const { tokenName, siteName, node } = record;
    if (
      !safeName(tokenName) ||
      file !== `${tokenName}.json` ||
      siteName !== matches[0].siteName ||
      node !== matches[0].node
    )
      throw new Error('Historical enrollment identity differs');
    tokenRows.set(tokenName, { siteName: matches[0].siteName, node: matches[0].node, name: tokenName });
  }
  for (const live of inventory.resources.filter((row) => row.kind === 'tokens')) {
    if (!live.node || !live.siteName) throw new Error('Live token correlation missing');
    const existing = tokenRows.get(live.name);
    if (existing && (existing.node !== live.node || existing.siteName !== live.siteName))
      throw new Error('Live and historical token identities conflict');
    tokenRows.set(live.name, { siteName: live.siteName, node: live.node, name: live.name });
  }
  const drain = {
    schemaVersion: 1,
    owner,
    sourcePlanSha256: base.planSha256,
    siteContractFingerprint: runtime.contract.fingerprint,
    ingressContractFingerprint: contract.fingerprint,
    listeners,
    origins,
    sites: bindings.map((binding) => {
      const site = inventory.sites.find((row) => row.siteName === binding.siteName);
      if (!site) throw new Error('Live site identity missing');
      return {
        binding,
        siteUid: site.siteUid,
        routing: routing
          .filter((row) => row.siteName === binding.siteName)
          .map((row) => ({
            kind:
              row.kind === 'bgps'
                ? 'bgp'
                : row.kind === 'bgp_routing_policys'
                  ? 'bgp_routing_policy'
                  : 'external_connector',
            name: row.name,
            uid: row.uid,
          })),
      };
    }),
  };
  const retirement = inventory.sites.map((site) => ({
    ...site,
    tokens: [...tokenRows.values()]
      .filter((row) => row.siteName === site.siteName)
      .map(({ node, name }) => ({ node, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
  const after = await observe();
  const identities = (value) => ({
    sites: [...value.sites].sort((a, b) => a.siteName.localeCompare(b.siteName)),
    resources: [...value.resources].sort((a, b) =>
      `${a.namespace}/${a.kind}/${a.name}`.localeCompare(`${b.namespace}/${b.kind}/${b.name}`),
    ),
  });
  if (
    canonicalSha256(identities(inventory)) !== canonicalSha256(identities(after)) ||
    canonicalSha256(before) !== canonicalSha256(await files())
  )
    throw new Error('Teardown source changed during preparation');
  signal?.throwIfAborted();
  await storage.verify();
  return { drain, retirement };
}
async function prepareAwsTerraformTeardown(input, runtime, contract, storage, signal) {
  if (input.engine !== 'terraform') throw new Error('Terraform teardown preparation requires Terraform ownership');
  const { drain, retirement } = await collectAwsTeardownMaterial(input, runtime, contract, storage, signal);
  const plan = compileAwsTerraformTeardown(input, drain, retirement);
  await storage.write(`${plan.planId}.json`, plan);
  return plan;
}
var object19 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Malformed teardown source record');
    return value;
  },
  safeName = (value) => typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
var init_terraform_teardown_plan = __esm(() => {
  init_artifacts();
  init_canonical();
  init_terraform_teardown();
});

// plugins/aws/src/ce/native-teardown.ts
import { join as join5 } from 'node:path';

function compileAwsNativeTeardown(base, cloud, drain, retirement) {
  verifyAwsCePlan(base);
  verifyAwsCePlan(cloud);
  const selected = siteBindings(base);
  if (
    base.engine !== 'native' ||
    base.intent.operation === 'teardown' ||
    cloud.engine !== 'native' ||
    cloud.intent.operation !== 'teardown' ||
    canonicalSha256(intentScope(base)) !== canonicalSha256(intentScope(cloud)) ||
    canonicalSha256(siteTopology(base.intent)) !== canonicalSha256(siteTopology(cloud.intent)) ||
    canonicalSha256(base.rollback.resources) !== canonicalSha256(cloud.rollback.resources) ||
    drain.schemaVersion !== 1 ||
    drain.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(drain.owner) !== canonicalSha256(selected[0].binding.owner) ||
    drain.sites.length !== selected.length ||
    retirement.length !== selected.length ||
    !cloud.actions.length ||
    cloud.actions.some(
      (action) =>
        action.phase !== 'teardown' ||
        (action.kind === 'brownfield-restore' &&
          !cloud.rollback.resources.some((resource) => resource.id === action.resourceId)),
    )
  )
    throw new Error('Native teardown source, cloud plan, topology, or restoration support differs');
  const cloudDeletes = cloud.ownershipInventory.filter((row) => row.owned && row.action === 'delete');
  if (
    !cloudDeletes.length ||
    cloud.actions.filter((action) => action.kind === 'resource-delete').length !== cloudDeletes.length
  )
    throw new Error('Native teardown cloud deletion inventory is incomplete');
  const peers = base.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  const routingAbsent = drain.sites.every((row) => row.routing.length === 0);
  const exportPolicies = drain.sites.flatMap((row) => row.routing).filter((row) => row.kind === 'bgp_routing_policy');
  if (exportPolicies.length !== 0 && exportPolicies.length !== selected.length)
    throw new Error('Native teardown export-policy inventory is incomplete');
  const seen = new Set();
  const unique = (value) => {
    if (seen.has(value)) throw new Error('Duplicate native teardown identity');
    seen.add(value);
  };
  for (const { site, binding } of selected) {
    const planned = drain.sites.filter((row) => row.binding.siteName === site.name);
    const retired = retirement.filter((row) => row.siteName === site.name);
    if (
      planned.length !== 1 ||
      retired.length !== 1 ||
      canonicalSha256(planned[0].binding) !== canonicalSha256(binding)
    )
      throw new Error('Native teardown site inventory is incomplete');
    if (!text2(planned[0].siteUid) || retired[0].siteUid !== planned[0].siteUid || !text2(retired[0].physicalSiteUid))
      throw new Error('Native teardown site identity differs');
    unique(`site:${retired[0].siteUid}`);
    unique(`physical:${retired[0].physicalSiteUid}`);
    const expected = routingAbsent
      ? []
      : peers
          .filter((action) => site.nodeIndexes.includes(action.node ?? 0))
          .map((action) => ({
            kind: 'external_connector',
            name: `${base.deploymentName.slice(0, 24)}-gre-${peers.indexOf(action) + 1}`,
          }));
    if (expected.length) {
      if (exportPolicies.length)
        expected.push({ kind: 'bgp_routing_policy', name: `${site.name.slice(0, 43)}-tgw-export-policy` });
      expected.push({ kind: 'bgp', name: `${site.name.slice(0, 55)}-tgw-bgp` });
    }
    if (
      planned[0].routing.length !== expected.length ||
      expected.some(
        (resource) =>
          planned[0].routing.filter((row) => row.kind === resource.kind && row.name === resource.name).length !== 1,
      )
    )
      throw new Error('Native teardown routing inventory is incomplete');
    for (const resource of planned[0].routing) {
      if (!text2(resource.uid)) throw new Error('Native teardown routing UID is missing');
      unique(`routing:${resource.uid}`);
    }
    if (
      retired[0].tokens.length > 128 ||
      binding.nodes.some((node) => !retired[0].tokens.some((token) => token.node === node))
    )
      throw new Error('Native teardown bootstrap token inventory is incomplete');
    for (const token of retired[0].tokens) {
      if (!binding.nodes.includes(token.node) || !name4(token.name))
        throw new Error('Native teardown bootstrap token scope differs');
      unique(`token:${token.name}`);
    }
  }
  const draft = {
    schemaVersion: 1,
    kind: 'aws-ce-native-teardown',
    engine: 'native',
    sourcePlanSha256: base.planSha256,
    cloudPlanId: cloud.planId,
    cloudPlanSha256: cloud.planSha256,
    drain: structuredClone(drain),
    retirement: structuredClone(retirement),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-native-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
async function prepareAwsNativeTeardown(base, cloud, runtime, contract, storage, signal) {
  if (base.engine !== 'native' || cloud.engine !== 'native')
    throw new Error('Native teardown preparation requires native ownership');
  const materialName = 'aws-native-teardown-material.json';
  const persisted =
    (await optional6(storage, materialName)) ?? (await optional6(storage, 'aws-native-teardown-source.json'));
  let material;
  if (persisted === undefined) {
    const collected = await collectAwsTeardownMaterial(base, runtime, contract, storage, signal);
    material = { sourcePlanSha256: base.planSha256, ...collected };
    await storage.write(materialName, material);
  } else {
    const candidate = persisted;
    if (candidate.sourcePlanSha256 !== base.planSha256 || !candidate.drain || !Array.isArray(candidate.retirement))
      throw new Error('Persisted native teardown material differs');
    material = {
      sourcePlanSha256: candidate.sourcePlanSha256,
      drain: candidate.drain,
      retirement: candidate.retirement,
    };
    if ((await optional6(storage, materialName)) === undefined) await storage.write(materialName, material);
  }
  const { drain, retirement } = material;
  const plan = compileAwsNativeTeardown(base, cloud, drain, retirement);
  await storage.write(`${plan.planId}.json`, plan);
  return plan;
}
async function optional6(storage, key) {
  try {
    return await storage.read(key);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function coordinateAwsNativeTeardown(base, cloud, input, authorizedPlanSha256, storage, driver, signal) {
  const plan = structuredClone(input);
  const expected = compileAwsNativeTeardown(base, cloud, plan.drain, plan.retirement);
  const validate = async () => {
    signal?.throwIfAborted();
    await storage.verify();
    if (
      canonicalSha256(plan) !== canonicalSha256(expected) ||
      authorizedPlanSha256 !== plan.planSha256 ||
      canonicalSha256(storage.owner) !== canonicalSha256(plan.drain.owner) ||
      driver.engine !== 'native' ||
      driver.siteContractFingerprint !== plan.drain.siteContractFingerprint ||
      driver.ingressContractFingerprint !== plan.drain.ingressContractFingerprint
    )
      throw new Error('Native teardown ownership, authorization, or contract differs');
  };
  await validate();
  const release = await acquireProcessLock(join5(storage.directory, '.aws-native-teardown-lock'));
  try {
    const sourceName = `${plan.planId}-source.json`;
    const saved = await optional6(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, plan);
    else if (canonicalSha256(saved) !== canonicalSha256(plan))
      throw new Error('Persisted native teardown source differs');
    const completed = [];
    const checkpoint = () =>
      storage.write(`${plan.planId}-progress.json`, {
        schemaVersion: 1,
        planSha256: plan.planSha256,
        completed: [...completed],
        observedAt: new Date().toISOString(),
      });
    const drained = await driver.drain(signal);
    if (drained.status !== 'platform-drained') return { status: 'pending-platform-drain', cloudInventory: 'unknown' };
    completed.push('platform-drained');
    await checkpoint();
    await validate();
    const cloudReceipt = await driver.retireCloud(plan, signal);
    if (
      cloudReceipt.status !== 'native-cloud-retired' ||
      cloudReceipt.cloudPlanId !== plan.cloudPlanId ||
      cloudReceipt.cloudPlanSha256 !== plan.cloudPlanSha256 ||
      cloudReceipt.absence !== 'absent'
    )
      throw new Error('Native cloud retirement did not produce exact absence evidence');
    completed.push('native-cloud-retired');
    await checkpoint();
    for (const site of plan.retirement) {
      await validate();
      if (!['pending', 'deleted'].includes((await driver.observeSite(site, signal)).status))
        throw new Error('Native site retirement identity evidence is unknown');
      for (const token of site.tokens) {
        await validate();
        await driver.revokeToken(site, token, signal);
        completed.push(`token:${token.name}`);
        await checkpoint();
      }
      await validate();
      await driver.deleteSite(site, signal);
      if ((await driver.observeSite(site, signal)).status !== 'deleted')
        return {
          status: 'pending-site-retirement',
          siteName: site.siteName,
          cloudInventory: 'absent',
        };
      completed.push(`site:${site.siteName}`);
      await checkpoint();
    }
    await validate();
    const finalCloud = await driver.retireCloud(plan, signal);
    if (
      finalCloud.status !== 'native-cloud-retired' ||
      finalCloud.cloudPlanId !== plan.cloudPlanId ||
      finalCloud.cloudPlanSha256 !== plan.cloudPlanSha256 ||
      finalCloud.absence !== 'absent'
    )
      throw new Error('Final native cloud absence did not converge');
    const receipt = {
      status: 'ce-retired-supporting-infrastructure-unverified',
      owner: storage.owner,
      planSha256: plan.planSha256,
      sourcePlanSha256: base.planSha256,
      cloudPlanSha256: plan.cloudPlanSha256,
      completed,
      cloudInventory: 'absent',
      observedAt: new Date().toISOString(),
    };
    await storage.write(`${plan.planId}-receipt.json`, receipt);
    await storage.write('aws-native-teardown-receipt.json', receipt);
    return receipt;
  } finally {
    await release();
  }
}
async function runAwsNativeTeardown(
  base,
  cloud,
  plan,
  authorizedPlanSha256,
  runtime,
  contract,
  storage,
  retireCloud,
  signal,
) {
  const bindings = siteBindings(base);
  const binding = (site) => {
    const selected = bindings.find((row) => row.site.name === site.siteName);
    if (!selected) throw new Error('Native teardown site is outside deployment');
    return selected.binding;
  };
  if (runtime.engine !== 'native') throw new Error('Native engine required for teardown');
  return coordinateAwsNativeTeardown(
    base,
    cloud,
    plan,
    authorizedPlanSha256,
    storage,
    {
      engine: 'native',
      siteContractFingerprint: runtime.contract.fingerprint,
      ingressContractFingerprint: contract.fingerprint,
      drain: (signal) => runtime.drainPlatform(plan.drain, contract, storage, signal),
      retireCloud,
      observeSite: (site, signal) =>
        runtime.observeSiteDeletion(
          binding(site),
          { siteUid: site.siteUid, physicalSiteUid: site.physicalSiteUid },
          signal,
        ),
      revokeToken: (site, token, signal) => runtime.deleteBootstrapToken(binding(site), token.node, token.name, signal),
      deleteSite: (site, signal) => runtime.deleteSiteExact(binding(site), site.siteUid, signal),
    },
    signal,
  );
}
var text2 = (value) => typeof value === 'string' && !!value.trim(),
  name4 = (value) => typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value),
  intentScope = (plan) => {
    const intent = structuredClone(plan.intent);
    intent.operation = 'teardown';
    delete intent.replacementNode;
    return intent;
  };
var init_native_teardown = __esm(() => {
  init_process_lock();
  init_artifacts();
  init_canonical();
  init_terraform_teardown_plan();
});

// plugins/aws/src/tools/aws-ce-teardown.ts
async function optional7(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function createAwsCeTeardownTool(pi, makeApi = makeExecApi, dependencies = defaults) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_teardown',
    label: 'Teardown AWS Customer Edge',
    description:
      'Prepare or apply an immutable native- or Terraform-owned AWS Customer Edge teardown. Preparation collects authoritative platform and stored identities; apply drains ingress/routing, executes the exact reviewed cloud plan, retires sites, verifies absence, and resumes without manual state edits.',
    parameters: Type.Object({
      operation: Type.Union([Type.Literal('prepare'), Type.Literal('apply')]),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
      teardownPlanId: Type.Optional(Type.String()),
      teardownPlanSha256: Type.Optional(Type.String()),
      cloudPlanId: Type.Optional(Type.String()),
      cloudPlanSha256: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        const allowed =
          params.operation === 'prepare'
            ? ['basePlanId', 'basePlanSha256', 'cloudPlanId', 'cloudPlanSha256', 'operation']
            : ['basePlanId', 'basePlanSha256', 'operation', 'teardownPlanId', 'teardownPlanSha256'];
        if (Object.keys(params).some((key) => !allowed.includes(key)))
          throw new Error(`AWS CE teardown ${params.operation} parameters differ`);
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        const platform = await dependencies.platform(pi, signal);
        const owner = {
          deploymentId: plan.deploymentName,
          engine: plan.engine,
          provider: 'aws',
          account: plan.accountId,
          region: plan.region,
        };
        const storage = await platform.storage(owner);
        const runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
        const contract = await dependencies.contract(signal);
        if (params.operation === 'prepare') {
          const cloud =
            plan.engine === 'native'
              ? !params.cloudPlanId || !params.cloudPlanSha256
                ? undefined
                : (await loadAwsPlan(ctx.sessionManager, params.cloudPlanId, params.cloudPlanSha256)).plan
              : undefined;
          if (plan.engine === 'native' && !cloud)
            throw new Error(
              'Native teardown preparation requires the exact reviewed cloud teardown plan ID and SHA-256',
            );
          if (plan.engine === 'terraform' && (params.cloudPlanId || params.cloudPlanSha256))
            throw new Error('Terraform teardown does not accept a separate native cloud plan');
          const teardown =
            plan.engine === 'terraform'
              ? await dependencies.prepare(plan, runtime, contract, storage, signal)
              : await dependencies.prepareNative(plan, cloud, runtime, contract, storage, signal);
          const artifactId = await ctx.sessionManager.saveArtifact(
            JSON.stringify({
              kind: teardown.kind,
              engine: teardown.engine,
              planId: teardown.planId,
              planSha256: teardown.planSha256,
              sourcePlanSha256: teardown.sourcePlanSha256,
              siteCount: teardown.retirement.length,
              listenerCount: teardown.drain.listeners.length,
              originCount: teardown.drain.origins.length,
              routingCount: teardown.drain.sites.reduce((total, site) => total + site.routing.length, 0),
              tokenLocatorCount: teardown.retirement.reduce((total, site) => total + site.tokens.length, 0),
            }),
            'aws-ce-teardown-plan',
          );
          if (!artifactId) throw new Error('AWS CE teardown plan artifact persistence failed');
          return {
            content: [
              {
                type: 'text',
                text: `Teardown plan ID: ${teardown.planId}
SHA-256: ${teardown.planSha256}
Sites: ${teardown.retirement.length}
Listeners/origins/routing objects: ${teardown.drain.listeners.length}/${teardown.drain.origins.length}/${teardown.drain.sites.reduce((total, site) => total + site.routing.length, 0)}
Artifact: artifact://${artifactId}`,
              },
            ],
            details: {
              tool: 'aws_ce_teardown',
              operation: 'prepare',
              artifactId,
              planId: teardown.planId,
              planSha256: teardown.planSha256,
            },
          };
        }
        if (!params.teardownPlanId || !params.teardownPlanSha256)
          throw new Error('Teardown apply requires the exact teardown plan ID and SHA-256');
        const teardown = await storage.read(`${params.teardownPlanId}.json`);
        if (
          teardown.planId !== params.teardownPlanId ||
          !safeHexEqual(teardown.planSha256, params.teardownPlanSha256) ||
          teardown.sourcePlanSha256 !== plan.planSha256
        )
          throw new Error('Persisted AWS CE teardown plan identity differs');
        const authorizationName = `${teardown.planId}-authorization.json`;
        const authorization = await optional7(storage, authorizationName);
        if (authorization !== undefined) {
          if (
            !authorization ||
            typeof authorization !== 'object' ||
            authorization.schemaVersion !== 1 ||
            authorization.engine !== plan.engine ||
            authorization.sourcePlanSha256 !== plan.planSha256 ||
            authorization.teardownPlanSha256 !== teardown.planSha256 ||
            authorization.mutations !== true
          )
            throw new Error('Persisted AWS CE teardown authorization differs');
        } else {
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Apply immutable AWS CE teardown plan',
              `${teardown.planId}
${teardown.planSha256}
${teardown.retirement.length} site(s)`,
            ))
          )
            throw new Error('AWS CE teardown was not approved');
          await storage.write(authorizationName, {
            schemaVersion: 1,
            engine: plan.engine,
            sourcePlanSha256: plan.planSha256,
            teardownPlanSha256: teardown.planSha256,
            mutations: true,
          });
        }
        const result =
          plan.engine === 'terraform'
            ? await dependencies.run(
                plan,
                teardown,
                params.teardownPlanSha256,
                runtime,
                contract,
                await (await dependencies.terraform(pi, signal)).open(
                  owner,
                  await awsTerraformFoundationDeployment(plan),
                  'current',
                ),
                storage,
                makeApi(ctx.cwd),
                process.env,
                signal,
              )
            : await dependencies.runNative(
                plan,
                (await loadAwsPlan(ctx.sessionManager, teardown.cloudPlanId, teardown.cloudPlanSha256)).plan,
                teardown,
                params.teardownPlanSha256,
                runtime,
                contract,
                storage,
                async (reference, signal) => {
                  const { plan: cloud, observation } = await loadAwsPlan(
                    ctx.sessionManager,
                    reference.cloudPlanId,
                    reference.cloudPlanSha256,
                  );
                  const existing = await loadAwsCheckpoint(ctx.sessionManager, cloud.planId, cloud.planSha256);
                  if (!existing)
                    await saveAwsCheckpoint(ctx.sessionManager, {
                      schemaVersion: 2,
                      engine: 'native',
                      authorization: { planSha256: cloud.planSha256, mutations: true, destruction: true },
                      planId: cloud.planId,
                      planSha256: cloud.planSha256,
                      completedActionIds: [],
                      resolvedValues: {},
                      state: 'running',
                    });
                  const applied = await dependencies.applyNative(
                    { planId: cloud.planId, planSha256: cloud.planSha256 },
                    ctx,
                    makeApi(ctx.cwd),
                    platform,
                    fetch,
                    signal,
                  );
                  if (applied.checkpoint.state !== 'complete') throw new Error('Native cloud teardown remains partial');
                  const ownerDigests = [
                    ...new Set([
                      ...observation.ownershipPlanSha256s,
                      ...observation.resources
                        .map((row) => row.tags['xcsh-plan-sha256'])
                        .filter((value) => /^[a-f0-9]{64}$/.test(value ?? '')),
                    ]),
                  ];
                  const absence = await collectAwsNativeCloudRetirement(
                    scopedAwsApi(makeApi(ctx.cwd), cloud.intent.awsProfile, signal),
                    cloud,
                    ownerDigests,
                  );
                  if (absence.status !== 'absent') throw new Error('Native cloud retirement has not converged');
                  return {
                    status: 'native-cloud-retired',
                    cloudPlanId: cloud.planId,
                    cloudPlanSha256: cloud.planSha256,
                    absence: 'absent',
                  };
                },
                signal,
              );
        const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'aws-ce-teardown-checkpoint');
        if (!artifactId) throw new Error('AWS CE teardown checkpoint artifact persistence failed');
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE teardown ${plan.deploymentName}: ${String(result.status)}; cloud inventory ${String(result.cloudInventory)}. Supporting infrastructure outside the CE plan requires separate ownership and absence evidence.`,
            },
          ],
          details: { tool: 'aws_ce_teardown', operation: 'apply', artifactId, ...result },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE teardown failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_teardown', operation: params.operation },
        };
      }
    },
  };
}
var defaults;
var init_aws_ce_teardown = __esm(() => {
  init_ingress_contract();
  init_apply();
  init_artifacts();
  init_canonical();
  init_delete_recovery();
  init_native_teardown();
  init_platform();
  init_terraform_apply();
  init_terraform_foundation();
  init_terraform_teardown();
  init_terraform_teardown_plan();
  init_shared();
  defaults = {
    platform: awsPlatformService,
    terraform: awsTerraformService,
    contract: (signal) => VerifiedIngressContract.release(fetch, signal),
    prepare: prepareAwsTerraformTeardown,
    run: runAwsTerraformTeardown,
    prepareNative: prepareAwsNativeTeardown,
    runNative: runAwsNativeTeardown,
    applyNative: executeAwsCeApply,
  };
});

// plugins/platform/src/ce/native-upgrade.ts
import { createHash as createHash10, timingSafeEqual as timingSafeEqual2 } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
async function optional8(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function runNativeCeUpgrade(input, authorizedPlanSha256, verify, runtime, contract, storage, signal) {
  const upgrade = structuredClone(input);
  if (upgrade.schemaVersion !== 1 || upgrade.engine !== 'native')
    throw new Error('Native upgrade schema is obsolete; prepare a new v1 plan');
  await verify(upgrade);
  if (!sameHash(upgrade.planSha256, authorizedPlanSha256))
    throw new Error('Exact native upgrade authorization is required');
  if (
    runtime.engine !== 'native' ||
    storage.owner.engine !== 'native' ||
    hash4(storage.owner) !== hash4(upgrade.expectation.binding.owner)
  )
    throw new Error('Only the owning native engine may upgrade this site');
  const release = await acquireProcessLock(`${storage.directory}/.upgrade-lock`);
  try {
    signal?.throwIfAborted();
    await storage.verify();
    const sourceName = `${upgrade.planId}.json`;
    const saved = await optional8(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, upgrade);
    else if (hash4(saved) !== hash4(upgrade)) throw new Error('Saved native upgrade source differs');
    const checkpointName = `${upgrade.planId}-checkpoint.json`;
    let checkpoint = await optional8(storage, checkpointName);
    if (checkpoint === undefined) {
      checkpoint = {
        schemaVersion: 1,
        engine: 'native',
        sourcePlanSha256: upgrade.sourcePlanSha256,
        upgradePlanSha256: upgrade.planSha256,
        phase: 'ready',
      };
      await storage.write(checkpointName, checkpoint);
    }
    if (
      checkpoint.schemaVersion !== 1 ||
      checkpoint.engine !== 'native' ||
      checkpoint.sourcePlanSha256 !== upgrade.sourcePlanSha256 ||
      checkpoint.upgradePlanSha256 !== upgrade.planSha256 ||
      !['ready', 'submitted', 'complete'].includes(checkpoint.phase)
    )
      throw new Error('Native upgrade checkpoint differs');
    let serial = await optional8(storage, 'native-ce-upgrade-serial.json');
    if (serial === undefined) serial = { schemaVersion: 1, engine: 'native', status: 'idle' };
    if (
      serial.schemaVersion !== 1 ||
      serial.engine !== 'native' ||
      !['active', 'idle'].includes(serial.status) ||
      (serial.status === 'idle' && (serial.activePlanId !== undefined || serial.activePlanSha256 !== undefined)) ||
      (serial.lastPlanId === undefined) !== (serial.lastPlanSha256 === undefined) ||
      (serial.lastPlanSha256 !== undefined && !/^[a-f0-9]{64}$/.test(serial.lastPlanSha256)) ||
      (serial.status === 'active' &&
        (serial.activePlanId !== upgrade.planId || serial.activePlanSha256 !== upgrade.planSha256))
    )
      throw new Error('Another native site upgrade is active or the serial ledger differs');
    if (serial.status === 'idle' && checkpoint.phase !== 'complete') {
      serial = {
        schemaVersion: 1,
        engine: 'native',
        status: 'active',
        activePlanId: upgrade.planId,
        activePlanSha256: upgrade.planSha256,
        lastPlanId: serial.lastPlanId,
        lastPlanSha256: serial.lastPlanSha256,
      };
      await storage.write('native-ce-upgrade-serial.json', serial);
    }
    const observe = () =>
      runtime.observeUpgrade(
        upgrade.expectation.binding,
        contract,
        upgrade.expectation.target.kind === 'software' ? upgrade.expectation.target.version : undefined,
        signal,
      );
    let transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
    if (checkpoint.phase === 'complete') {
      if (transition !== 'versions-complete') throw new Error('Completed native upgrade version evidence regressed');
      const receipt = await storage.read(`${upgrade.planId}-receipt.json`);
      if (
        receipt.status !== 'upgrade-complete' ||
        receipt.engine !== 'native' ||
        receipt.planId !== upgrade.planId ||
        receipt.planSha256 !== upgrade.planSha256 ||
        receipt.siteName !== upgrade.expectation.binding.siteName ||
        hash4(receipt.target) !== hash4(upgrade.expectation.target) ||
        receipt.nodeHealth !== 'unknown' ||
        receipt.routing !== 'unknown' ||
        receipt.traffic !== 'unknown'
      )
        throw new Error('Completed native upgrade receipt differs');
      return receipt;
    }
    if (transition === 'failed') throw new Error('Native upgrade failed');
    if (transition === 'unknown') {
      if (checkpoint.phase === 'submitted')
        return {
          status: 'upgrade-convergence-unknown',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      throw new Error('Native upgrade evidence is unknown');
    }
    if (checkpoint.phase === 'ready' && transition === 'versions-complete') {
      serial = {
        schemaVersion: 1,
        engine: 'native',
        status: 'idle',
        lastPlanId: upgrade.planId,
        lastPlanSha256: upgrade.planSha256,
      };
      await storage.write('native-ce-upgrade-serial.json', serial);
      return { status: 'target-already-complete', planId: upgrade.planId, planSha256: upgrade.planSha256 };
    }
    if (checkpoint.phase === 'ready' && transition !== 'ready')
      throw new Error('Upgrade began outside the authorized native action');
    if (checkpoint.phase === 'ready') {
      let crossedBoundary = false;
      try {
        await runtime.submitUpgrade(
          upgrade.expectation.binding,
          contract,
          upgrade.expectation.target,
          upgrade.expectation.siteUid,
          async () => {
            checkpoint = {
              schemaVersion: 1,
              engine: 'native',
              sourcePlanSha256: upgrade.sourcePlanSha256,
              upgradePlanSha256: upgrade.planSha256,
              phase: 'submitted',
            };
            await storage.write(checkpointName, checkpoint);
            crossedBoundary = true;
          },
          signal,
        );
      } catch (error) {
        if (!crossedBoundary) throw error;
        return {
          status: 'upgrade-submission-unconfirmed',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      }
      transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
    }
    if (transition !== 'versions-complete') {
      if (transition === 'unknown' && checkpoint.phase === 'submitted')
        return {
          status: 'upgrade-convergence-unknown',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      if (!['ready', 'converging'].includes(transition)) throw new Error('Native upgrade convergence is unknown');
      return {
        status:
          checkpoint.phase === 'submitted' && transition === 'ready'
            ? 'upgrade-submission-unconfirmed'
            : 'upgrade-converging',
        planId: upgrade.planId,
        planSha256: upgrade.planSha256,
      };
    }
    checkpoint = { ...checkpoint, phase: 'complete' };
    await storage.write(checkpointName, checkpoint);
    serial = {
      schemaVersion: 1,
      engine: 'native',
      status: 'idle',
      lastPlanId: upgrade.planId,
      lastPlanSha256: upgrade.planSha256,
    };
    await storage.write('native-ce-upgrade-serial.json', serial);
    const receipt = {
      status: 'upgrade-complete',
      engine: 'native',
      planId: upgrade.planId,
      planSha256: upgrade.planSha256,
      siteName: upgrade.expectation.binding.siteName,
      target: upgrade.expectation.target,
      observedAt: new Date().toISOString(),
      nodeHealth: 'unknown',
      routing: 'unknown',
      traffic: 'unknown',
    };
    await storage.write(`${upgrade.planId}-receipt.json`, receipt);
    return receipt;
  } finally {
    await release();
  }
}
var hash4 = (value) => createHash10('sha256').update(canonical(value)).digest('hex'),
  sameHash = (left, right) =>
    /^[a-f0-9]{64}$/.test(left) &&
    /^[a-f0-9]{64}$/.test(right) &&
    timingSafeEqual2(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
var init_native_upgrade = __esm(() => {
  init_process_lock();
  init_upgrade_transition();
});

// plugins/aws/src/ce/native-upgrade.ts
function build(base, expectation, contract) {
  verifyAwsCePlan(base);
  initialSoftwareSettings(expectation.before);
  const selected = siteBindings(base).find(({ site }) => site.name === expectation.binding.siteName);
  if (
    base.engine !== 'native' ||
    !selected ||
    canonicalSha256(selected.binding) !== canonicalSha256(expectation.binding) ||
    expectation.contractFingerprint !== contract.fingerprint ||
    typeof expectation.siteUid !== 'string' ||
    !expectation.siteUid.trim() ||
    typeof expectation.physicalSiteUid !== 'string' ||
    !expectation.physicalSiteUid.trim() ||
    !/^sha256:[a-f0-9]{64}$/.test(expectation.siteContractFingerprint) ||
    Object.keys(expectation.target).sort().join(',') !== 'kind,version' ||
    expectation.before[expectation.target.kind] === expectation.target.version
  )
    throw new Error('Native upgrade identities, scope or effective versions are incomplete');
  contract.build({ siteName: selected.site.name, ...expectation.target });
  const draft = {
    schemaVersion: 1,
    engine: 'native',
    kind: 'aws-ce-native-upgrade',
    sourcePlanSha256: base.planSha256,
    expectation,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-native-upgrade-${planSha256.slice(0, 24)}`, planSha256 };
}
async function prepareAwsNativeUpgrade(base, siteName, target, runtime, contract, signal) {
  verifyAwsCePlan(base);
  const selected = siteBindings(base).find(({ site }) => site.name === siteName);
  if (base.engine !== 'native' || !selected) throw new Error('Select a site owned by this native deployment');
  contract.build({ siteName, ...target });
  const observation = await runtime.observeUpgrade(
    selected.binding,
    contract,
    target.kind === 'software' ? target.version : undefined,
    signal,
  );
  if (observation.status !== 'observed') throw new Error('Fresh native upgrade version evidence is unavailable');
  const expectation = {
    binding: selected.binding,
    siteUid: observation.siteUid,
    physicalSiteUid: observation.physicalSiteUid,
    contractFingerprint: observation.contractFingerprint,
    siteContractFingerprint: observation.siteContractFingerprint,
    before: { software: observation.software.installed, os: observation.os.installed },
    target: structuredClone(target),
  };
  if (assessCeUpgradeTransition(expectation, observation) !== 'ready')
    throw new Error('Native site version readiness has not converged');
  return build(base, expectation, contract);
}
function verifyAwsNativeUpgrade(base, upgrade, contract) {
  if (upgrade.schemaVersion !== 1 || upgrade.engine !== 'native')
    throw new Error('AWS native upgrade schema is obsolete; prepare a new v1 plan');
  const expected = build(base, upgrade.expectation, contract);
  if (canonicalSha256(upgrade) !== canonicalSha256(expected)) throw new Error('Saved native upgrade plan changed');
}
function runAwsNativeUpgrade(base, upgrade, authorizedPlanSha256, runtime, contract, storage, signal) {
  return runNativeCeUpgrade(
    upgrade,
    authorizedPlanSha256,
    async (candidate) => verifyAwsNativeUpgrade(base, candidate, contract),
    runtime,
    contract,
    storage,
    signal,
  );
}
var init_native_upgrade2 = __esm(() => {
  init_native_upgrade();
  init_upgrade_transition();
  init_artifacts();
  init_canonical();
});

// plugins/terraform/src/ce-upgrade.ts
import { createHash as createHash11, timingSafeEqual as timingSafeEqual3 } from 'node:crypto';

function canonical2(value) {
  if (Array.isArray(value)) return `[${value.map(canonical2).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical2(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
async function optional9(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return;
  }
}
function validateActionReceipt(upgrade, receipt) {
  if (
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== upgrade.deployment.deploymentId ||
    receipt.backendIdentity !== upgrade.deployment.backendIdentity ||
    receipt.configurationSha256 !== digest4(upgrade.deployment.configuration) ||
    receipt.providerLockSha256 !== digest4(upgrade.deployment.providerLock) ||
    receipt.operation ||
    receipt.noChanges ||
    receipt.changes.length ||
    receipt.actionInvocations?.length !== 1 ||
    hash5(receipt.actionInvocations[0]) !== hash5(upgrade.action) ||
    !/^[a-f0-9]{64}$/.test(receipt.planSha256)
  )
    throw new Error('Terraform upgrade saved action plan differs');
}
async function runTerraformCeUpgrade(
  input,
  authorizedPlanSha256,
  verify,
  runtime,
  contract,
  terraform,
  storage,
  env,
  signal,
) {
  const upgrade = structuredClone(input);
  if (upgrade.schemaVersion !== 2 || upgrade.engine !== 'terraform')
    throw new Error('Terraform upgrade schema is obsolete; prepare a new v2 plan');
  await verify(upgrade);
  if (!sameHash2(upgrade.planSha256, authorizedPlanSha256))
    throw new Error('Exact Terraform upgrade authorization is required');
  if (
    runtime.engine !== 'terraform' ||
    storage.owner.engine !== 'terraform' ||
    hash5(storage.owner) !== hash5(upgrade.expectation.binding.owner)
  )
    throw new Error('Only the owning Terraform engine may upgrade this site');
  const release = await acquireProcessLock(`${storage.directory}/.upgrade-lock`);
  try {
    signal?.throwIfAborted();
    await storage.verify();
    const sourceName = `${upgrade.planId}.json`;
    const saved = await optional9(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, upgrade);
    else if (hash5(saved) !== hash5(upgrade)) throw new Error('Saved Terraform upgrade source differs');
    const checkpointName = `${upgrade.planId}-checkpoint.json`;
    let checkpoint = await optional9(storage, checkpointName);
    if (checkpoint === undefined) {
      checkpoint = {
        schemaVersion: 2,
        engine: 'terraform',
        sourcePlanSha256: upgrade.sourcePlanSha256,
        upgradePlanSha256: upgrade.planSha256,
        phase: 'ready',
      };
      await storage.write(checkpointName, checkpoint);
    }
    if (
      checkpoint.schemaVersion !== 2 ||
      checkpoint.engine !== 'terraform' ||
      checkpoint.sourcePlanSha256 !== upgrade.sourcePlanSha256 ||
      checkpoint.upgradePlanSha256 !== upgrade.planSha256 ||
      !['ready', 'submitted', 'complete'].includes(checkpoint.phase) ||
      (checkpoint.phase === 'ready' && checkpoint.actionPlanSha256 !== undefined) ||
      (checkpoint.phase !== 'ready' && !/^[a-f0-9]{64}$/.test(checkpoint.actionPlanSha256 ?? ''))
    )
      throw new Error('Terraform upgrade checkpoint differs');
    let serial = await optional9(storage, 'terraform-ce-upgrade-serial.json');
    if (serial === undefined) serial = { schemaVersion: 2, engine: 'terraform', status: 'idle' };
    if (
      serial.schemaVersion !== 2 ||
      serial.engine !== 'terraform' ||
      !['active', 'idle'].includes(serial.status) ||
      (serial.status === 'idle' && (serial.activePlanId !== undefined || serial.activePlanSha256 !== undefined)) ||
      (serial.lastPlanId === undefined) !== (serial.lastPlanSha256 === undefined) ||
      (serial.lastPlanSha256 !== undefined && !/^[a-f0-9]{64}$/.test(serial.lastPlanSha256)) ||
      (serial.status === 'active' &&
        (serial.activePlanId !== upgrade.planId || serial.activePlanSha256 !== upgrade.planSha256))
    )
      throw new Error('Another site upgrade is active or the serial ledger differs');
    if (serial.status === 'idle' && checkpoint.phase !== 'complete') {
      serial = {
        schemaVersion: 2,
        engine: 'terraform',
        status: 'active',
        activePlanId: upgrade.planId,
        activePlanSha256: upgrade.planSha256,
        lastPlanId: serial.lastPlanId,
        lastPlanSha256: serial.lastPlanSha256,
      };
      await storage.write('terraform-ce-upgrade-serial.json', serial);
    }
    const observe = () =>
      runtime.observeUpgrade(
        upgrade.expectation.binding,
        contract,
        upgrade.expectation.target.kind === 'software' ? upgrade.expectation.target.version : undefined,
        signal,
      );
    let transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
    if (checkpoint.phase === 'complete') {
      if (transition !== 'versions-complete') throw new Error('Completed Terraform upgrade version evidence regressed');
      const action = await storage.read(`${upgrade.planId}-action-plan.json`);
      validateActionReceipt(upgrade, action);
      if (action.planSha256 !== checkpoint.actionPlanSha256) throw new Error('Completed upgrade action plan differs');
      const receipt = await storage.read(`${upgrade.planId}-receipt.json`);
      if (
        receipt.status !== 'upgrade-complete' ||
        receipt.engine !== 'terraform' ||
        receipt.planId !== upgrade.planId ||
        receipt.planSha256 !== upgrade.planSha256 ||
        receipt.siteName !== upgrade.expectation.binding.siteName ||
        hash5(receipt.target) !== hash5(upgrade.expectation.target) ||
        receipt.actionPlanSha256 !== checkpoint.actionPlanSha256 ||
        receipt.nodeHealth !== 'unknown' ||
        receipt.routing !== 'unknown' ||
        receipt.traffic !== 'unknown'
      )
        throw new Error('Completed Terraform upgrade receipt differs');
      return receipt;
    }
    if (transition === 'failed') throw new Error('Terraform upgrade failed');
    if (checkpoint.phase === 'ready' && transition === 'unknown')
      throw new Error('Terraform upgrade evidence is unknown');
    if (checkpoint.phase === 'ready' && transition === 'versions-complete') {
      serial = {
        schemaVersion: 2,
        engine: 'terraform',
        status: 'idle',
        lastPlanId: upgrade.planId,
        lastPlanSha256: upgrade.planSha256,
      };
      await storage.write('terraform-ce-upgrade-serial.json', serial);
      return { status: 'target-already-complete', planId: upgrade.planId, planSha256: upgrade.planSha256 };
    }
    if (checkpoint.phase === 'ready' && transition !== 'ready')
      throw new Error('Upgrade began outside the authorized Terraform action');
    if (checkpoint.phase === 'ready') {
      let session;
      try {
        session = await terraform.open(storage.owner, upgrade.deployment, false);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        session = await terraform.open(storage.owner, upgrade.deployment, 'current');
      }
      const action = await session.planAction(upgrade.action, env, signal);
      validateActionReceipt(upgrade, action);
      await storage.write(`${upgrade.planId}-action-plan.json`, action);
      await storage.verify();
      transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
      if (transition !== 'ready') throw new Error('Terraform upgrade readiness changed before submission');
      checkpoint = { ...checkpoint, phase: 'submitted', actionPlanSha256: action.planSha256 };
      await storage.write(checkpointName, checkpoint);
      await session.apply(action, env, signal);
      transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
    } else {
      const action = await storage.read(`${upgrade.planId}-action-plan.json`);
      validateActionReceipt(upgrade, action);
      if (action.planSha256 !== checkpoint.actionPlanSha256) throw new Error('Submitted upgrade action plan differs');
    }
    if (transition !== 'versions-complete') {
      if (transition === 'unknown')
        return {
          status: 'upgrade-convergence-unknown',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      if (!['ready', 'converging'].includes(transition)) throw new Error('Terraform upgrade convergence is unknown');
      return { status: 'upgrade-converging', planId: upgrade.planId, planSha256: upgrade.planSha256 };
    }
    checkpoint = { ...checkpoint, phase: 'complete' };
    await storage.write(checkpointName, checkpoint);
    serial = {
      schemaVersion: 2,
      engine: 'terraform',
      status: 'idle',
      lastPlanId: upgrade.planId,
      lastPlanSha256: upgrade.planSha256,
    };
    await storage.write('terraform-ce-upgrade-serial.json', serial);
    const receipt = {
      status: 'upgrade-complete',
      engine: 'terraform',
      planId: upgrade.planId,
      planSha256: upgrade.planSha256,
      siteName: upgrade.expectation.binding.siteName,
      target: upgrade.expectation.target,
      actionPlanSha256: checkpoint.actionPlanSha256,
      observedAt: new Date().toISOString(),
      nodeHealth: 'unknown',
      routing: 'unknown',
      traffic: 'unknown',
    };
    await storage.write(`${upgrade.planId}-receipt.json`, receipt);
    return receipt;
  } finally {
    await release();
  }
}
var digest4 = (value) => createHash11('sha256').update(value).digest('hex'),
  hash5 = (value) => digest4(canonical2(value)),
  sameHash2 = (left, right) =>
    /^[a-f0-9]{64}$/.test(left) &&
    /^[a-f0-9]{64}$/.test(right) &&
    timingSafeEqual3(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
var init_ce_upgrade = __esm(() => {
  init_process_lock();
  init_upgrade_transition();
});

// plugins/aws/src/ce/terraform-upgrade.ts
async function build2(base, expectation, contract) {
  verifyAwsCePlan(base);
  initialSoftwareSettings(expectation.before);
  if (
    base.deploymentName !== base.intent.deploymentName ||
    base.accountId !== base.intent.accountId ||
    base.region !== base.intent.region ||
    typeof expectation.siteUid !== 'string' ||
    !expectation.siteUid.trim() ||
    typeof expectation.physicalSiteUid !== 'string' ||
    !expectation.physicalSiteUid.trim() ||
    !/^sha256:[a-f0-9]{64}$/.test(expectation.siteContractFingerprint) ||
    Object.keys(expectation.target).sort().join(',') !== 'kind,version' ||
    expectation.before[expectation.target.kind] === expectation.target.version
  )
    throw new Error('Terraform upgrade identities, scope or effective versions are incomplete');
  const selected = siteBindings(base).find(({ site }) => site.name === expectation.binding.siteName);
  if (
    base.engine !== 'terraform' ||
    !selected ||
    canonicalSha256(selected.binding) !== canonicalSha256(expectation.binding) ||
    expectation.contractFingerprint !== contract.fingerprint
  )
    throw new Error('Terraform upgrade scope, owning engine or contract differs');
  const { kind, version } = expectation.target;
  const request = contract.build({ siteName: selected.site.name, kind, version });
  const values = { name: selected.site.name, namespace: 'system', version, force: false };
  const suffix = kind === 'software' ? 'sw' : 'os';
  if (
    request.method !== 'POST' ||
    request.path !== `/api/config/namespaces/system/sites/${selected.site.name}/upgrade_${suffix}` ||
    canonicalSha256(request.body) !== canonicalSha256(values)
  )
    throw new Error('Terraform upgrade wire request differs from the verified action');
  const providerLock = await loadXcshProviderLock();
  const identity = { sourcePlanSha256: base.planSha256, expectation };
  const stage = `upgrade-${kind}-${canonicalSha256(identity).slice(0, 24)}`;
  const type = `xcsh_site_upgrade_${suffix}`;
  const deployment = {
    schemaVersion: 1,
    deploymentId: base.deploymentName,
    stage,
    engine: 'terraform',
    scope: { cloud: 'aws', account: base.accountId, region: base.region },
    terraformVersion: AWS_CE_TERRAFORM_VERSION,
    providerLock,
    backendIdentity: `local:${base.deploymentName}:stage:${stage}`,
    configuration: JSON.stringify({
      terraform: {
        required_version: `= ${AWS_CE_TERRAFORM_VERSION}`,
        required_providers: { xcsh: { source: 'f5-sales-demo/xcsh', version: `= ${XCSH_PROVIDER_VERSION}` } },
      },
      provider: { xcsh: {} },
      action: { [type]: { ce: { config: values } } },
    }),
  };
  const draft = {
    schemaVersion: 2,
    engine: 'terraform',
    kind: 'aws-ce-terraform-upgrade',
    ...identity,
    deployment,
    action: {
      address: `action.${type}.ce`,
      type,
      providerName: 'registry.terraform.io/f5-sales-demo/xcsh',
      configValuesSha256: canonicalSha256(values),
    },
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-upgrade-${planSha256.slice(0, 24)}`, planSha256 };
}
async function prepareAwsTerraformUpgrade(base, siteName, target, runtime, contract, signal) {
  verifyAwsCePlan(base);
  const selected = siteBindings(base).find(({ site }) => site.name === siteName);
  if (base.engine !== 'terraform' || !selected) throw new Error('Select a site owned by this Terraform deployment');
  contract.build({ siteName, ...target });
  const observation = await runtime.observeUpgrade(
    selected.binding,
    contract,
    target.kind === 'software' ? target.version : undefined,
    signal,
  );
  if (observation.status !== 'observed') throw new Error('Fresh upgrade version evidence is unavailable');
  const expectation = {
    binding: selected.binding,
    siteUid: observation.siteUid,
    physicalSiteUid: observation.physicalSiteUid,
    contractFingerprint: observation.contractFingerprint,
    siteContractFingerprint: observation.siteContractFingerprint,
    before: { software: observation.software.installed, os: observation.os.installed },
    target: structuredClone(target),
  };
  if (assessCeUpgradeTransition(expectation, observation) !== 'ready')
    throw new Error('Site version readiness has not converged');
  return build2(base, expectation, contract);
}
async function verifyAwsTerraformUpgrade(base, upgrade, contract) {
  if (upgrade.schemaVersion !== 2 || upgrade.engine !== 'terraform')
    throw new Error('AWS Terraform upgrade schema is obsolete; prepare a new v2 plan');
  const expected = await build2(base, upgrade.expectation, contract);
  if (canonicalSha256(upgrade) !== canonicalSha256(expected)) throw new Error('Saved Terraform upgrade plan changed');
}
async function runAwsTerraformUpgrade(
  base,
  upgrade,
  authorizedPlanSha256,
  runtime,
  contract,
  terraform,
  storage,
  env,
  signal,
) {
  return runTerraformCeUpgrade(
    upgrade,
    authorizedPlanSha256,
    (candidate) => verifyAwsTerraformUpgrade(base, candidate, contract),
    runtime,
    contract,
    terraform,
    storage,
    env,
    signal,
  );
}
var init_terraform_upgrade = __esm(() => {
  init_upgrade_transition();
  init_ce_upgrade();
  init_provider_lock();
  init_artifacts();
  init_canonical();
  init_terraform_foundation();
});

// plugins/aws/src/tools/aws-ce-upgrade.ts
async function optional10(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function createAwsCeUpgradeTool(pi, dependencies = defaults2) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_upgrade',
    label: 'Upgrade AWS Customer Edge',
    description:
      'Prepare or apply an immutable serial software/OS upgrade for a native- or Terraform-owned AWS Customer Edge site. Apply resumes from persisted platform evidence without replaying ambiguous actions. Node, routing and traffic health remain separate evidence.',
    parameters: Type.Object({
      operation: Type.Union([Type.Literal('prepare'), Type.Literal('apply')]),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
      siteName: Type.Optional(Type.String()),
      kind: Type.Optional(Type.Union([Type.Literal('software'), Type.Literal('os')])),
      version: Type.Optional(Type.String()),
      upgradePlanId: Type.Optional(Type.String()),
      upgradePlanSha256: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        const allowed =
          params.operation === 'prepare'
            ? ['basePlanId', 'basePlanSha256', 'kind', 'operation', 'siteName', 'version']
            : ['basePlanId', 'basePlanSha256', 'operation', 'upgradePlanId', 'upgradePlanSha256'];
        if (Object.keys(params).some((key) => !allowed.includes(key)))
          throw new Error(`AWS CE upgrade ${params.operation} parameters differ`);
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        const platform = await dependencies.platform(pi, signal);
        const owner = {
          deploymentId: plan.deploymentName,
          engine: plan.engine,
          provider: 'aws',
          account: plan.accountId,
          region: plan.region,
        };
        const storage = await platform.storage(owner);
        const runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
        const contract = await dependencies.contract(signal);
        if (params.operation === 'prepare') {
          if (!params.siteName || !params.kind || !params.version)
            throw new Error('Upgrade preparation requires siteName, kind and version');
          const upgrade =
            plan.engine === 'terraform'
              ? await prepareAwsTerraformUpgrade(
                  plan,
                  params.siteName,
                  { kind: params.kind, version: params.version },
                  runtime,
                  contract,
                  signal,
                )
              : await prepareAwsNativeUpgrade(
                  plan,
                  params.siteName,
                  { kind: params.kind, version: params.version },
                  runtime,
                  contract,
                  signal,
                );
          const existing = await optional10(storage, `${upgrade.planId}.json`);
          if (existing === undefined) await storage.write(`${upgrade.planId}.json`, upgrade);
          else if (canonicalSha256(existing) !== canonicalSha256(upgrade))
            throw new Error('Persisted AWS CE upgrade plan differs');
          const artifactId = await ctx.sessionManager.saveArtifact(
            JSON.stringify({
              kind: upgrade.kind,
              engine: upgrade.engine,
              planId: upgrade.planId,
              planSha256: upgrade.planSha256,
              sourcePlanSha256: upgrade.sourcePlanSha256,
              siteName: upgrade.expectation.binding.siteName,
              target: upgrade.expectation.target,
            }),
            'aws-ce-upgrade-plan',
          );
          if (!artifactId) throw new Error('AWS CE upgrade plan artifact persistence failed');
          return {
            content: [
              {
                type: 'text',
                text: `Upgrade plan ID: ${upgrade.planId}
SHA-256: ${upgrade.planSha256}
Site: ${upgrade.expectation.binding.siteName}
Target: ${upgrade.expectation.target.kind} ${upgrade.expectation.target.version}
Artifact: artifact://${artifactId}`,
              },
            ],
            details: {
              tool: 'aws_ce_upgrade',
              operation: 'prepare',
              artifactId,
              planId: upgrade.planId,
              planSha256: upgrade.planSha256,
            },
          };
        }
        if (!params.upgradePlanId || !params.upgradePlanSha256)
          throw new Error('Upgrade apply requires the exact upgrade plan ID and SHA-256');
        const upgrade = await storage.read(`${params.upgradePlanId}.json`);
        if (plan.engine === 'terraform') await verifyAwsTerraformUpgrade(plan, upgrade, contract);
        else verifyAwsNativeUpgrade(plan, upgrade, contract);
        if (upgrade.planId !== params.upgradePlanId || !safeHexEqual(upgrade.planSha256, params.upgradePlanSha256))
          throw new Error('Persisted AWS CE upgrade plan identity differs');
        const authorizationName = `${upgrade.planId}-authorization.json`;
        const authorization = await optional10(storage, authorizationName);
        if (authorization !== undefined) {
          if (
            !authorization ||
            typeof authorization !== 'object' ||
            authorization.schemaVersion !== 1 ||
            authorization.engine !== plan.engine ||
            authorization.sourcePlanSha256 !== plan.planSha256 ||
            authorization.upgradePlanSha256 !== upgrade.planSha256 ||
            authorization.mutations !== true
          )
            throw new Error('Persisted AWS CE upgrade authorization differs');
        } else {
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Apply immutable AWS CE upgrade plan',
              `${upgrade.planId}
${upgrade.planSha256}
${upgrade.expectation.binding.siteName}: ${upgrade.expectation.target.kind} ${upgrade.expectation.target.version}`,
            ))
          )
            throw new Error('AWS CE upgrade was not approved');
          await storage.write(authorizationName, {
            schemaVersion: 1,
            engine: plan.engine,
            sourcePlanSha256: plan.planSha256,
            upgradePlanSha256: upgrade.planSha256,
            mutations: true,
          });
        }
        const result =
          plan.engine === 'terraform'
            ? await runAwsTerraformUpgrade(
                plan,
                upgrade,
                params.upgradePlanSha256,
                runtime,
                contract,
                await dependencies.terraform(pi, signal),
                storage,
                process.env,
                signal,
              )
            : await runAwsNativeUpgrade(plan, upgrade, params.upgradePlanSha256, runtime, contract, storage, signal);
        const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'aws-ce-upgrade-checkpoint');
        if (!artifactId) throw new Error('AWS CE upgrade checkpoint artifact persistence failed');
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE upgrade ${upgrade.expectation.binding.siteName}: ${String(result.status)}. Node, routing and traffic health require separate collected evidence.`,
            },
          ],
          details: { tool: 'aws_ce_upgrade', operation: 'apply', artifactId, ...result },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE upgrade failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_upgrade', operation: params.operation },
        };
      }
    },
  };
}
var defaults2;
var init_aws_ce_upgrade = __esm(() => {
  init_upgrade_contract();
  init_artifacts();
  init_canonical();
  init_native_upgrade2();
  init_platform();
  init_terraform_apply();
  init_terraform_upgrade();
  defaults2 = {
    platform: awsPlatformService,
    terraform: awsTerraformService,
    contract: (signal) => VerifiedUpgradeContract.release(fetch, signal),
  };
});

// plugins/aws/src/ce/failover-health.ts
async function collectAwsFailoverBgpHealth(plan, checkpoint, nodeIndex, phase, api, signal) {
  verifyAwsCePlan(plan);
  const site = siteBindings(plan).find(({ site }) => site.nodeIndexes.includes(nodeIndex))?.site;
  if (
    !site ||
    !['outage', 'recovered'].includes(phase) ||
    checkpoint.schemaVersion !== plan.schemaVersion ||
    checkpoint.engine !== plan.engine ||
    checkpoint.planId !== plan.planId ||
    checkpoint.planSha256 !== plan.planSha256
  )
    throw new Error('Failover observation node, phase or checkpoint binding differs');
  const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  const selected = actions.filter((action) => action.node === nodeIndex);
  if (!selected.length) throw new Error('Failover node has no planned Connect peers');
  const health = await collectAwsNetworkHealth('bgp', plan, checkpoint, api, signal);
  const selectedPeerIds = selected.map((action) => checkpoint.resolvedValues[action.capture?.placeholder ?? '']);
  const expectedSessions = actions.length * 2;
  const expectedEstablishedSessions = expectedSessions - (phase === 'outage' ? selected.length * 2 : 0);
  const binding = {
    planId: plan.planId,
    planSha256: plan.planSha256,
    nodeIndex,
    nodeName: `${plan.deploymentName}-${nodeIndex}`,
    selectedSiteName: site.name,
    phase,
    expectedEstablishedSessions,
  };
  if (
    !['healthy', 'degraded'].includes(String(health.status)) ||
    health.expectedSessions !== expectedSessions ||
    !Array.isArray(health.sessions)
  )
    return { ...health, ...binding, acceptance: 'unknown' };
  const exact =
    health.establishedSessions === expectedEstablishedSessions &&
    health.sessions.length === expectedSessions &&
    health.sessions.every(
      (session) => session.status === (phase === 'outage' && selectedPeerIds.includes(session.peerId) ? 'down' : 'up'),
    );
  return { ...health, ...binding, acceptance: exact ? 'passed' : 'pending' };
}
var init_failover_health = __esm(() => {
  init_artifacts();
  init_network_health();
});

// plugins/aws/src/ce/native-failover.ts
async function observeAwsNativeFailoverInstance(base, failover, api, signal) {
  signal?.throwIfAborted();
  verifyAwsNativeFailover(base, failover);
  const identity = await api.exec('aws', ['sts', 'get-caller-identity', '--region', base.region, '--output', 'json'], {
    signal,
  });
  if (identity.exitCode !== 0 || JSON.parse(identity.stdout).Account !== base.accountId)
    throw new Error('Native failover account observation differs');
  const response = await api.exec(
    'aws',
    ['ec2', 'describe-instances', '--instance-ids', failover.instanceId, '--region', base.region, '--output', 'json'],
    { signal },
  );
  if (response.exitCode !== 0) throw new Error('Native failover instance observation unavailable');
  const raw = JSON.parse(response.stdout);
  const reservations = Array.isArray(raw.Reservations) ? raw.Reservations : [];
  const rows = reservations.flatMap((value) => {
    const reservation = value;
    return (Array.isArray(reservation.Instances) ? reservation.Instances : []).map((instance) => ({
      owner: reservation.OwnerId,
      instance,
    }));
  });
  if (raw.NextToken || rows.length !== 1 || rows[0].owner !== base.accountId)
    throw new Error('Native failover instance response is incomplete');
  const instance = rows[0].instance;
  const tags = new Map(
    (Array.isArray(instance.Tags) ? instance.Tags : []).map((value) => {
      const tag = value;
      return [String(tag.Key), String(tag.Value)];
    }),
  );
  if (
    instance.InstanceId !== failover.instanceId ||
    tags.size !== (Array.isArray(instance.Tags) ? instance.Tags.length : 0) ||
    tags.get('xcsh-managed-by') !== 'aws-ce' ||
    tags.get('xcsh-execution-engine') !== 'native' ||
    tags.get('xcsh-deployment-id') !== base.deploymentName ||
    tags.get('xcsh-plan-sha256') !== failover.instancePlanSha256 ||
    tags.get('xcsh-node-index') !== String(failover.nodeIndex)
  )
    throw new Error('Native failover instance ownership differs');
  const state = instance.State?.Name;
  if (state === 'running' || state === 'stopped') return state;
  return ['pending', 'stopping'].includes(String(state)) ? 'pending' : 'unknown';
}
function buildAwsNativeFailover(base, nodeIndex, instanceId, instancePlanSha256 = base.planSha256) {
  verifyAwsCePlan(base);
  const selected = siteBindings(base).find(({ site }) => site.nodeIndexes.includes(nodeIndex));
  if (
    base.engine !== 'native' ||
    base.routing.profile !== 'tgw-connect' ||
    !selected ||
    !Number.isInteger(nodeIndex) ||
    !/^i-[0-9a-f]{8,17}$/.test(instanceId) ||
    !/^[0-9a-f]{64}$/.test(instancePlanSha256)
  )
    throw new Error('AWS native failover source, node or instance differs');
  const draft = {
    schemaVersion: 2,
    engine: 'native',
    kind: 'aws-ce-native-failover',
    sourcePlanSha256: base.planSha256,
    nodeIndex,
    instanceId,
    instancePlanSha256,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-failover-${planSha256.slice(0, 24)}`, planSha256 };
}
function verifyAwsNativeFailover(base, failover) {
  if (
    failover.schemaVersion !== 2 ||
    failover.engine !== 'native' ||
    failover.kind !== 'aws-ce-native-failover' ||
    failover.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(
      buildAwsNativeFailover(base, failover.nodeIndex, failover.instanceId, failover.instancePlanSha256),
    ) !== canonicalSha256(failover)
  )
    throw new Error('Saved AWS native failover plan changed');
}
async function optional11(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function runAwsNativeFailover(
  base,
  failover,
  authorizedPlanSha256,
  storage,
  observeInstance,
  mutate,
  collect,
  signal,
  polling = {
    attempts: 30,
    intervalMs: 1e4,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  verifyAwsNativeFailover(base, failover);
  if (authorizedPlanSha256 !== failover.planSha256) throw new Error('Exact native failover authorization is required');
  if (
    canonicalSha256(storage.owner) !==
    canonicalSha256({
      deploymentId: base.deploymentName,
      engine: 'native',
      provider: 'aws',
      account: base.accountId,
      region: base.region,
    })
  )
    throw new Error('Only the owning native engine may execute failover');
  if (!Number.isInteger(polling.attempts) || polling.attempts < 1 || polling.intervalMs < 0)
    throw new Error('Failover convergence bounds are invalid');
  const release = await acquireProcessLock(`${storage.directory}/.failover-lock`);
  try {
    await storage.verify();
    const sourceName = `${failover.planId}.json`;
    const saved = await optional11(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, failover);
    else if (canonicalSha256(saved) !== canonicalSha256(failover)) throw new Error('Saved failover source differs');
    const checkpointName = `${failover.planId}-checkpoint.json`;
    let checkpoint = await optional11(storage, checkpointName);
    if (!checkpoint) {
      checkpoint = {
        schemaVersion: 1,
        engine: 'native',
        sourcePlanSha256: base.planSha256,
        failoverPlanSha256: failover.planSha256,
        phase: 'stop',
      };
      await storage.write(checkpointName, checkpoint);
    }
    if (
      checkpoint.schemaVersion !== 1 ||
      checkpoint.engine !== 'native' ||
      checkpoint.sourcePlanSha256 !== base.planSha256 ||
      checkpoint.failoverPlanSha256 !== failover.planSha256 ||
      !['stop', 'outage', 'start', 'recovered', 'complete'].includes(checkpoint.phase) ||
      (checkpoint.pending !== undefined &&
        (checkpoint.pending.phase !== checkpoint.phase ||
          checkpoint.pending.requestSha256 !==
            canonicalSha256({ phase: checkpoint.pending.phase, instanceId: failover.instanceId })))
    )
      throw new Error('Native failover checkpoint differs');
    let active = checkpoint;
    const convergeInstance = async (expected) => {
      for (let attempt = 0; attempt < polling.attempts; attempt++) {
        signal?.throwIfAborted();
        if ((await observeInstance(signal)) === expected) return;
        if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
      }
      throw new Error(`Native failover instance ${expected} convergence deadline exceeded`);
    };
    const change = async (phase, next) => {
      const expected = phase === 'stop' ? 'stopped' : 'running';
      if (!active.pending) {
        const before = await observeInstance(signal);
        if (before === expected)
          throw new Error(`Native failover instance was already ${expected} before authorization`);
        if (before !== (phase === 'stop' ? 'running' : 'stopped'))
          throw new Error('Native failover instance state is unavailable');
        active = {
          ...active,
          pending: { phase, requestSha256: canonicalSha256({ phase, instanceId: failover.instanceId }) },
        };
        await storage.write(checkpointName, active);
        await mutate(phase, signal);
      }
      await convergeInstance(expected);
      active = { ...active, phase: next, pending: undefined };
      await storage.write(checkpointName, active);
    };
    const convergeNetwork = async (phase, next) => {
      for (let attempt = 0; attempt < polling.attempts; attempt++) {
        signal?.throwIfAborted();
        const evidence = await collect(phase, signal);
        if (evidence.acceptance === 'passed') {
          await storage.write(`${failover.planId}-${phase}-evidence.json`, evidence);
          active = { ...active, phase: next };
          await storage.write(checkpointName, active);
          return;
        }
        if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
      }
      throw new Error(`Native failover ${phase} convergence deadline exceeded`);
    };
    if (active.phase === 'stop') await change('stop', 'outage');
    if (active.phase === 'outage') await convergeNetwork('outage', 'start');
    if (active.phase === 'start') await change('start', 'recovered');
    if (active.phase === 'recovered') await convergeNetwork('recovered', 'complete');
    const receipt = {
      status: 'failover-complete',
      engine: 'native',
      planId: failover.planId,
      planSha256: failover.planSha256,
      nodeIndex: failover.nodeIndex,
      observedAt: new Date().toISOString(),
      traffic: 'unknown',
      originControl: 'unknown',
    };
    await storage.write(`${failover.planId}-receipt.json`, receipt);
    return receipt;
  } finally {
    await release();
  }
}
var init_native_failover = __esm(() => {
  init_process_lock();
  init_artifacts();
  init_canonical();
});

// plugins/aws/src/ce/terraform-failover.ts
function awsTerraformFailoverStages(base, nodeIndex, instanceId, configuration, expectedConfigurationSha256) {
  verifyAwsCePlan(base);
  const selected = siteBindings(base).find(({ site }) => site.nodeIndexes.includes(nodeIndex));
  if (
    base.engine !== 'terraform' ||
    !selected ||
    !Number.isInteger(nodeIndex) ||
    !/^i-(?:[0-9a-f]{8}|[0-9a-f]{17})$/.test(instanceId) ||
    sha256Hex(configuration) !== expectedConfigurationSha256
  )
    throw new Error('Terraform failover engine, instance or configuration binding differs');
  const original = object20(JSON.parse(configuration));
  const provider = object20(object20(original.provider).aws);
  if (
    provider.region !== base.region ||
    canonicalSha256(provider.allowed_account_ids) !== canonicalSha256([base.accountId])
  )
    throw new Error('Terraform failover provider scope differs');
  const resources = object20(original.resource);
  if (resources.aws_ec2_instance_state !== undefined) throw new Error('An instance power control is already present');
  const instance = object20(object20(resources.aws_instance)[`node_${nodeIndex}`]);
  const tags = object20(instance.tags);
  if (
    tags['xcsh-execution-engine'] !== 'terraform' ||
    tags['xcsh-managed-by'] !== 'aws-ce' ||
    tags['xcsh-deployment-id'] !== base.deploymentName ||
    tags['xcsh-plan-sha256'] !== base.planSha256 ||
    tags['xcsh-node-index'] !== String(nodeIndex) ||
    tags['ves-io-site-name'] !== selected.site.name ||
    instance.count !== undefined ||
    instance.for_each !== undefined ||
    instance.ami !== base.intent.image.amiId ||
    instance.instance_type !== base.intent.instance.type ||
    typeof instance.user_data_base64 !== 'string'
  )
    throw new Error('Terraform failover instance ownership or identity differs');
  const retainedAddresses = Object.entries(resources).flatMap(([type, values]) =>
    Object.keys(object20(values)).map((name) => ({ address: `${type}.${name}`, type })),
  );
  const controlAddress = 'aws_ec2_instance_state.ce_failover';
  const power = (state) => {
    const result = structuredClone(original);
    object20(result.resource).aws_ec2_instance_state = {
      ce_failover: { instance_id: instanceId, state, force: false },
    };
    return JSON.stringify(result);
  };
  const stopped = power('stopped');
  const running = power('running');
  const stage = (phase, text, previous) => ({
    phase,
    deploymentId: base.deploymentName,
    sourcePlanSha256: base.planSha256,
    instanceId,
    instanceAddress: `aws_instance.node_${nodeIndex}`,
    controlAddress,
    previousConfigurationSha256: previous,
    configurationSha256: sha256Hex(text),
    configuration: text,
    retainedAddresses: structuredClone(retainedAddresses),
  });
  return {
    stop: stage('stop', stopped, expectedConfigurationSha256),
    start: stage('start', running, sha256Hex(stopped)),
    release: stage('release', configuration, sha256Hex(running)),
  };
}
function validateAwsTerraformFailoverPlan(stage, receipt) {
  const retained = new Map(stage.retainedAddresses.map((resource) => [resource.address, resource.type]));
  const allowed = { stop: ['create', 'no-op'], start: ['create', 'update', 'no-op'], release: ['delete', 'no-op'] }[
    stage.phase
  ];
  if (
    !allowed ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== stage.deploymentId ||
    receipt.configurationSha256 !== stage.configurationSha256 ||
    sha256Hex(stage.configuration) !== stage.configurationSha256 ||
    !Array.isArray(receipt.changes) ||
    new Set(receipt.changes.map((change) => change.address)).size !== receipt.changes.length ||
    stage.retainedAddresses.some(
      (resource) => !receipt.changes.some((change) => change.address === resource.address),
    ) ||
    (stage.phase !== 'release' && !receipt.changes.some((change) => change.address === stage.controlAddress)) ||
    receipt.changes.some(
      (change) =>
        change.actions.length !== 1 ||
        (change.address === stage.controlAddress
          ? change.type !== 'aws_ec2_instance_state' || !allowed.includes(change.actions[0])
          : retained.get(change.address) !== change.type || change.actions[0] !== 'no-op'),
    )
  )
    throw new Error('Terraform failover plan changes or omits retained deployment resources');
}
function buildAwsTerraformFailover(base, nodeIndex, instanceId, configuration, expectedConfigurationSha256) {
  const stages = awsTerraformFailoverStages(base, nodeIndex, instanceId, configuration, expectedConfigurationSha256);
  const draft = {
    schemaVersion: 1,
    engine: 'terraform',
    kind: 'aws-ce-terraform-failover',
    sourcePlanSha256: base.planSha256,
    nodeIndex,
    instanceId,
    stages,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-failover-${planSha256.slice(0, 24)}`, planSha256 };
}
function verifyAwsTerraformFailover(base, failover) {
  if (
    failover.schemaVersion !== 1 ||
    failover.engine !== 'terraform' ||
    failover.kind !== 'aws-ce-terraform-failover' ||
    failover.sourcePlanSha256 !== base.planSha256
  )
    throw new Error('AWS Terraform failover schema or source differs');
  const expected = buildAwsTerraformFailover(
    base,
    failover.nodeIndex,
    failover.instanceId,
    failover.stages.release.configuration,
    failover.stages.release.configurationSha256,
  );
  if (canonicalSha256(expected) !== canonicalSha256(failover))
    throw new Error('Saved AWS Terraform failover plan changed');
}
async function optional12(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function runAwsTerraformFailover(
  base,
  failover,
  authorizedPlanSha256,
  session,
  storage,
  collect,
  env,
  signal,
  polling = {
    attempts: 30,
    intervalMs: 1e4,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  verifyAwsTerraformFailover(base, failover);
  if (authorizedPlanSha256 !== failover.planSha256)
    throw new Error('Exact Terraform failover authorization is required');
  if (
    storage.owner.engine !== 'terraform' ||
    canonicalSha256(storage.owner) !==
      canonicalSha256({
        deploymentId: base.deploymentName,
        engine: 'terraform',
        provider: 'aws',
        account: base.accountId,
        region: base.region,
      })
  )
    throw new Error('Only the owning Terraform engine may execute failover');
  if (!Number.isInteger(polling.attempts) || polling.attempts < 1 || polling.intervalMs < 0)
    throw new Error('Failover convergence bounds are invalid');
  const release = await acquireProcessLock(`${storage.directory}/.failover-lock`);
  try {
    await storage.verify();
    const sourceName = `${failover.planId}.json`;
    const saved = await optional12(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, failover);
    else if (canonicalSha256(saved) !== canonicalSha256(failover)) throw new Error('Saved failover source differs');
    const checkpointName = `${failover.planId}-checkpoint.json`;
    let checkpoint = await optional12(storage, checkpointName);
    if (!checkpoint) {
      checkpoint = {
        schemaVersion: 1,
        engine: 'terraform',
        sourcePlanSha256: base.planSha256,
        failoverPlanSha256: failover.planSha256,
        phase: 'stop',
      };
      await storage.write(checkpointName, checkpoint);
    }
    const phases = ['stop', 'outage', 'start', 'recovered', 'release', 'complete'];
    if (
      checkpoint.schemaVersion !== 1 ||
      checkpoint.engine !== 'terraform' ||
      checkpoint.sourcePlanSha256 !== base.planSha256 ||
      checkpoint.failoverPlanSha256 !== failover.planSha256 ||
      !phases.includes(checkpoint.phase) ||
      (['outage', 'recovered', 'complete'].includes(checkpoint.phase) &&
        checkpoint.submittedPlanSha256 !== undefined) ||
      (['stop', 'start', 'release'].includes(checkpoint.phase) &&
        checkpoint.submittedPlanSha256 !== undefined &&
        !/^[a-f0-9]{64}$/.test(checkpoint.submittedPlanSha256))
    )
      throw new Error('Terraform failover checkpoint differs');
    const now = () => (polling.now ?? Date.now)();
    const timestamp = () => {
      const value = now();
      if (!Number.isFinite(value)) throw new Error('Failover clock is invalid');
      return new Date(value).toISOString();
    };
    for (const [phase, attempt] of Object.entries(checkpoint.attempts ?? {})) {
      if (
        !['stop', 'start'].includes(phase) ||
        !attempt ||
        attempt.instanceId !== failover.instanceId ||
        attempt.sourcePlanSha256 !== base.planSha256 ||
        !/^[a-f0-9]{64}$/.test(attempt.planSha256) ||
        !Number.isFinite(Date.parse(attempt.observedAt)) ||
        Date.parse(attempt.observedAt) > now()
      )
        throw new Error('Failover original attempt binding differs');
    }
    for (const [phase, timing] of Object.entries(checkpoint.timings ?? {})) {
      if (
        !['outage', 'recovered'].includes(phase) ||
        !timing ||
        timing.thresholdMs !== 45000 ||
        !['passed', 'failed', 'unknown'].includes(timing.status)
      )
        throw new Error('Failover timing checkpoint differs');
      const attempt = checkpoint.attempts?.[phase === 'outage' ? 'stop' : 'start'];
      if (timing.status === 'unknown') {
        if (timing.elapsedMs !== undefined || timing.originalAttemptAt !== undefined || timing.observedAt !== undefined)
          throw new Error('Unknown failover timing contains invented evidence');
      } else {
        const elapsed = Date.parse(timing.observedAt ?? '') - Date.parse(attempt?.observedAt ?? '');
        if (
          !attempt ||
          timing.originalAttemptAt !== attempt.observedAt ||
          !Number.isFinite(elapsed) ||
          elapsed < 0 ||
          timing.elapsedMs !== elapsed ||
          Date.parse(timing.observedAt ?? '') > now() ||
          timing.status !== (elapsed <= 45000 ? 'passed' : 'failed')
        )
          throw new Error('Failover timing does not match original attempt');
      }
    }
    let active = checkpoint;
    const mutate = async (name, next) => {
      const stage = failover.stages[name];
      let receipt;
      const resumingSubmitted = !!active.submittedPlanSha256;
      if (active.submittedPlanSha256) {
        receipt = await storage.read(`${failover.planId}-${name}-plan.json`);
        validateAwsTerraformFailoverPlan(stage, receipt);
        if (receipt.planSha256 !== active.submittedPlanSha256)
          throw new Error('Submitted Terraform failover plan differs');
      } else {
        await session.reviseConfiguration(stage.previousConfigurationSha256, stage.configuration);
        receipt = await session.plan(env, signal);
        validateAwsTerraformFailoverPlan(stage, receipt);
        await storage.write(`${failover.planId}-${name}-plan.json`, receipt);
        active = { ...active, phase: name, submittedPlanSha256: receipt.planSha256 };
        await storage.write(checkpointName, active);
      }
      if (name !== 'release') {
        const existing = active.attempts?.[name];
        if (existing && existing.planSha256 !== receipt.planSha256)
          throw new Error('Failover original attempt saved plan differs');
        if (!existing && !active.submittedPlanSha256) throw new Error('Failover submitted plan missing');
        if (!existing && !resumingSubmitted) {
          active = {
            ...active,
            attempts: {
              ...active.attempts,
              [name]: {
                observedAt: timestamp(),
                planSha256: receipt.planSha256,
                instanceId: failover.instanceId,
                sourcePlanSha256: base.planSha256,
              },
            },
          };
          await storage.write(checkpointName, active);
        }
      }
      await storage.verify();
      await session.apply(receipt, env, signal);
      active = { ...active, phase: next, submittedPlanSha256: undefined };
      await storage.write(checkpointName, active);
    };
    const converge = async (phase, next) => {
      for (let attempt = 0; attempt < polling.attempts; attempt++) {
        signal?.throwIfAborted();
        const evidence = await collect(phase, signal);
        if (evidence.acceptance === 'passed') {
          await storage.write(`${failover.planId}-${phase}-evidence.json`, evidence);
          const attempt = active.attempts?.[phase === 'outage' ? 'stop' : 'start'];
          const observedAt = timestamp();
          const elapsedMs = attempt ? Date.parse(observedAt) - Date.parse(attempt.observedAt) : undefined;
          const timing =
            elapsedMs !== undefined && elapsedMs >= 0
              ? {
                  status: elapsedMs <= 45000 ? 'passed' : 'failed',
                  thresholdMs: 45000,
                  originalAttemptAt: attempt?.observedAt,
                  observedAt,
                  elapsedMs,
                }
              : { status: 'unknown', thresholdMs: 45000 };
          active = {
            ...active,
            phase: next,
            submittedPlanSha256: undefined,
            timings: { ...active.timings, [phase]: timing },
          };
          await storage.write(checkpointName, active);
          return;
        }
        if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
      }
      throw new Error(`Terraform failover ${phase} convergence deadline exceeded`);
    };
    if (active.phase === 'stop') await mutate('stop', 'outage');
    if (active.phase === 'outage') await converge('outage', 'start');
    if (active.phase === 'start') await mutate('start', 'recovered');
    if (active.phase === 'recovered') await converge('recovered', 'release');
    if (active.phase === 'release') await mutate('release', 'complete');
    const final = await session.plan(env, signal);
    validateAwsTerraformFailoverPlan(failover.stages.release, final);
    if (!final.noChanges || final.changes.some((change) => change.actions[0] !== 'no-op'))
      throw new Error('Terraform failover did not finish with a refresh-enabled no-change plan');
    const withdrawalTiming = active.timings?.outage ?? { status: 'unknown', thresholdMs: 45000 };
    const restorationTiming = active.timings?.recovered ?? { status: 'unknown', thresholdMs: 45000 };
    const acceptance = [withdrawalTiming, restorationTiming].some((t) => t.status === 'failed')
      ? 'failed'
      : [withdrawalTiming, restorationTiming].every((t) => t.status === 'passed')
        ? 'passed'
        : 'unknown';
    const receipt = {
      status:
        acceptance === 'passed'
          ? 'failover-complete'
          : acceptance === 'failed'
            ? 'failover-acceptance-failed'
            : 'failover-acceptance-unknown',
      acceptance,
      withdrawalTiming,
      restorationTiming,
      engine: 'terraform',
      planId: failover.planId,
      planSha256: failover.planSha256,
      nodeIndex: failover.nodeIndex,
      finalPlanSha256: final.planSha256,
      observedAt: new Date().toISOString(),
      traffic: 'unknown',
      originControl: 'unknown',
    };
    await storage.write(`${failover.planId}-receipt.json`, receipt);
    return receipt;
  } finally {
    await release();
  }
}
var object20 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed failover configuration');
  return value;
};
var init_terraform_failover = __esm(() => {
  init_process_lock();
  init_artifacts();
  init_canonical();
});

// plugins/aws/src/tools/aws-ce-failover.ts
async function optional13(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function createAwsCeFailoverTool(pi, dependencies = defaults3) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_failover',
    label: 'Validate AWS Customer Edge Failover',
    description:
      'Prepare or execute an owning-engine planned CE outage. Apply proves the selected BGP withdrawal and restoration from live AWS evidence. Terraform releases its temporary power control and requires a final no-change plan; native execution reconciles ambiguous mutations without replay.',
    parameters: Type.Object({
      operation: Type.Union([Type.Literal('prepare'), Type.Literal('apply')]),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
      nodeIndex: Type.Optional(Type.Number()),
      failoverPlanId: Type.Optional(Type.String()),
      failoverPlanSha256: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        const allowed =
          params.operation === 'prepare'
            ? ['basePlanId', 'basePlanSha256', 'nodeIndex', 'operation']
            : ['basePlanId', 'basePlanSha256', 'failoverPlanId', 'failoverPlanSha256', 'operation'];
        if (Object.keys(params).some((key) => !allowed.includes(key)))
          throw new Error(`AWS CE failover ${params.operation} parameters differ`);
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        if (plan.routing.profile !== 'tgw-connect')
          throw new Error('This failover executor requires a TGW Connect deployment');
        const platform = await dependencies.platform(pi, signal);
        const owner = {
          deploymentId: plan.deploymentName,
          engine: plan.engine,
          provider: 'aws',
          account: plan.accountId,
          region: plan.region,
        };
        const storage = await platform.storage(owner);
        if (params.operation === 'prepare') {
          if (!Number.isInteger(params.nodeIndex)) throw new Error('Failover preparation requires an exact nodeIndex');
          let failover;
          if (plan.engine === 'terraform') {
            const terraform = await dependencies.terraform(pi, signal);
            const session = await terraform.open(owner, await awsTerraformFoundationDeployment(plan), 'current');
            const marker = object21(await storage.read('terraform-connect-stage.json'));
            if (
              marker.schemaVersion !== 1 ||
              marker.engine !== 'terraform' ||
              marker.planSha256 !== plan.planSha256 ||
              marker.stage !== 'applied' ||
              typeof marker.configurationSha256 !== 'string'
            )
              throw new Error('Terraform Connect deployment has not completed');
            const configuration = await session.readConfiguration(marker.configurationSha256);
            const outputs = await session.readOutputs(['ce_instances'], process.env, signal);
            const instances = object21(outputs.ce_instances);
            const identities = Object.entries(instances).map(([node, value]) => ({ node, value: object21(value) }));
            if (
              identities.length !== plan.intent.topology.nodeCount ||
              new Set(identities.map(({ value }) => value.id)).size !== identities.length ||
              identities.some(
                ({ node, value }) =>
                  !/^i-[0-9a-f]{8,17}$/.test(String(value.id)) ||
                  value.hostname !== `${plan.deploymentName}-${node}` ||
                  value.site_name !== siteForNode(plan.intent, Number(node)).name,
              )
            )
              throw new Error('Terraform instance output is incomplete');
            const selected = object21(instances[String(params.nodeIndex)]);
            if (typeof selected.id !== 'string') throw new Error('Selected Terraform instance identity is unavailable');
            failover = buildAwsTerraformFailover(
              plan,
              params.nodeIndex,
              selected.id,
              configuration,
              marker.configurationSha256,
            );
          } else {
            const checkpoint = await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
            const instanceId = checkpoint?.resolvedValues[`__INSTANCE_${params.nodeIndex}__`];
            if (checkpoint?.engine !== 'native' || checkpoint.state !== 'complete' || typeof instanceId !== 'string')
              throw new Error('Completed native deployment identity is unavailable');
            const registration = (plan.actions ?? []).find(
              (action) => action.kind === 'registration-gate' && action.node === params.nodeIndex,
            );
            const replacement = registration
              ? await optional13(storage, `${registration.id}-initial-mtu-replacement.json`)
              : undefined;
            let instancePlanSha256 = plan.planSha256;
            if (replacement !== undefined) {
              const envelope = object21(replacement);
              const child = object21(envelope.plan);
              const binding = object21(child.binding);
              const { planId, planSha256, ...draft } = child;
              const expectedSite = siteForNode(plan.intent, params.nodeIndex);
              if (
                envelope.sourcePlanSha256 !== plan.planSha256 ||
                typeof planSha256 !== 'string' ||
                planId !== `aws-ce-replace-${planSha256.slice(0, 24)}` ||
                canonicalSha256(draft) !== planSha256 ||
                binding.siteName !== expectedSite.name ||
                !Array.isArray(binding.nodes) ||
                !binding.nodes.includes(`${plan.deploymentName}-${params.nodeIndex}`) ||
                !checkpoint.childPlanSha256s?.includes(planSha256)
              )
                throw new Error('Native replacement instance plan identity differs');
              instancePlanSha256 = planSha256;
            }
            failover = buildAwsNativeFailover(plan, params.nodeIndex, instanceId, instancePlanSha256);
          }
          const existing = await optional13(storage, `${failover.planId}.json`);
          if (existing === undefined) await storage.write(`${failover.planId}.json`, failover);
          else if (canonicalSha256(existing) !== canonicalSha256(failover))
            throw new Error('Persisted AWS CE failover plan differs');
          const artifactId = await ctx.sessionManager.saveArtifact(
            JSON.stringify({
              kind: failover.kind,
              engine: failover.engine,
              planId: failover.planId,
              planSha256: failover.planSha256,
              sourcePlanSha256: failover.sourcePlanSha256,
              nodeIndex: failover.nodeIndex,
            }),
            'aws-ce-failover-plan',
          );
          if (!artifactId) throw new Error('AWS CE failover plan artifact persistence failed');
          return {
            content: [
              {
                type: 'text',
                text: `Failover plan ID: ${failover.planId}
SHA-256: ${failover.planSha256}
Node: ${failover.nodeIndex}
Artifact: artifact://${artifactId}`,
              },
            ],
            details: {
              tool: 'aws_ce_failover',
              operation: 'prepare',
              artifactId,
              planId: failover.planId,
              planSha256: failover.planSha256,
            },
          };
        }
        if (!params.failoverPlanId || !params.failoverPlanSha256)
          throw new Error('Failover apply requires the exact failover plan identity');
        const failover = await storage.read(`${params.failoverPlanId}.json`);
        if (plan.engine === 'terraform') verifyAwsTerraformFailover(plan, failover);
        else verifyAwsNativeFailover(plan, failover);
        if (failover.planId !== params.failoverPlanId || failover.planSha256 !== params.failoverPlanSha256)
          throw new Error('Persisted AWS CE failover plan identity differs');
        const authorizationName = `${failover.planId}-authorization.json`;
        const authorization = await optional13(storage, authorizationName);
        if (authorization === undefined) {
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Execute planned AWS CE failover',
              `${failover.planId}
${failover.planSha256}
Node ${failover.nodeIndex}`,
            ))
          )
            throw new Error('AWS CE failover was not approved');
          await storage.write(authorizationName, {
            schemaVersion: 1,
            engine: plan.engine,
            sourcePlanSha256: plan.planSha256,
            failoverPlanSha256: failover.planSha256,
            mutations: true,
          });
        } else if (
          canonicalSha256(authorization) !==
          canonicalSha256({
            schemaVersion: 1,
            engine: plan.engine,
            sourcePlanSha256: plan.planSha256,
            failoverPlanSha256: failover.planSha256,
            mutations: true,
          })
        )
          throw new Error('Persisted AWS CE failover authorization differs');
        const api = scopedAwsApi(dependencies.makeApi(ctx.cwd), plan.intent.awsProfile, signal);
        const routing =
          plan.engine === 'terraform'
            ? await storage.read('terraform-routing-checkpoint.json')
            : await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
        if (!routing) throw new Error('AWS CE routing checkpoint is unavailable');
        const collect = (phase, currentSignal) =>
          dependencies.collect(plan, routing, failover.nodeIndex, phase, api, currentSignal);
        const result =
          plan.engine === 'terraform'
            ? await dependencies.run(
                plan,
                failover,
                params.failoverPlanSha256,
                await (await dependencies.terraform(pi, signal)).open(
                  owner,
                  await awsTerraformFoundationDeployment(plan),
                  'current',
                ),
                storage,
                collect,
                process.env,
                signal,
              )
            : await dependencies.runNative(
                plan,
                failover,
                params.failoverPlanSha256,
                storage,
                (currentSignal) => dependencies.observeNative(plan, failover, api, currentSignal),
                async (phase, currentSignal) => {
                  const response = await api.exec(
                    'aws',
                    [
                      'ec2',
                      phase === 'stop' ? 'stop-instances' : 'start-instances',
                      '--instance-ids',
                      failover.instanceId,
                      '--region',
                      plan.region,
                      '--output',
                      'json',
                    ],
                    { signal: currentSignal },
                  );
                  if (response.exitCode !== 0) throw new Error(`Native failover ${phase} request failed`);
                },
                collect,
                signal,
              );
        const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'aws-ce-failover-receipt');
        if (!artifactId) throw new Error('AWS CE failover receipt persistence failed');
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE node ${failover.nodeIndex}: ${result.status}. BGP withdrawal and restoration converged; timing acceptance is reported separately when available. Traffic and origin-control evidence remain separate.`,
            },
          ],
          ...('acceptance' in result && result.acceptance !== 'passed' ? { isError: true } : {}),
          details: { tool: 'aws_ce_failover', operation: 'apply', artifactId, ...result },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE failover failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_failover', operation: params.operation },
        };
      }
    },
  };
}
var defaults3,
  object21 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed failover identity');
    return value;
  };
var init_aws_ce_failover = __esm(() => {
  init_artifacts();
  init_canonical();
  init_failover_health();
  init_native_failover();
  init_platform();
  init_terraform_apply();
  init_terraform_failover();
  init_terraform_foundation();
  init_shared();
  defaults3 = {
    platform: awsPlatformService,
    terraform: awsTerraformService,
    makeApi: makeExecApi,
    run: runAwsTerraformFailover,
    runNative: runAwsNativeFailover,
    collect: collectAwsFailoverBgpHealth,
    observeNative: observeAwsNativeFailoverInstance,
  };
});

// plugins/aws/src/ce/status.ts
async function collectAwsCeStatus(plan, checkpoint, api, runtime, signal) {
  const observedAt = new Date().toISOString();
  let aws;
  const expectedInstances = {};
  let identitiesVerified = false;
  const bindings = siteBindings(plan);
  const nodes = Array.from({ length: plan.topology.nodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`);
  try {
    const inventory = await collectAwsCeInventory(
      { accountId: plan.accountId, awsProfile: plan.intent.awsProfile, regions: [plan.region] },
      api,
      signal,
    );
    const deployed = inventory.nodes.filter((node) => node.deploymentId === plan.deploymentName);
    const conflicts = deployed.some(
      (node) =>
        node.ownership !== 'managed' ||
        node.engine !== plan.engine ||
        !bindings.some(({ site }) => site.name === node.siteName),
    );
    for (const [index, hostname] of nodes.entries()) {
      const id = checkpoint?.resolvedValues[`__INSTANCE_${index + 1}__`];
      if (
        id &&
        deployed.filter((node) => node.instanceId === id && node.siteName === siteForNode(plan.intent, index + 1).name)
          .length === 1
      )
        expectedInstances[hostname] = id;
    }
    identitiesVerified =
      !conflicts &&
      deployed.length === nodes.length &&
      Object.keys(expectedInstances).length === nodes.length &&
      new Set(Object.values(expectedInstances)).size === nodes.length;
    aws = {
      status: conflicts ? 'ownership-conflict' : identitiesVerified ? 'observed' : 'incomplete',
      source: inventory.source,
      observedAt: inventory.collectedAt,
      nodes: deployed,
      counts: {
        instances: deployed.length,
        interfaces: deployed.reduce((sum, node) => sum + node.interfaces.length, 0),
      },
    };
  } catch {
    signal?.throwIfAborted();
    aws = { status: 'unknown', reason: 'inventory-unavailable', observedAt };
  }
  const unknown = (reason) => ({ status: 'unknown', reason, observedAt });
  const sites = [];
  for (const { binding } of bindings) {
    let registration = unknown('platform-service-unavailable');
    let health = unknown('platform-service-unavailable');
    if (runtime) {
      try {
        health = await runtime.observeHealth(binding, signal);
      } catch {
        signal?.throwIfAborted();
        health = unknown('platform-observation-unavailable');
      }
      if (identitiesVerified) {
        try {
          registration = await runtime.observeRegistrations(
            binding,
            Object.fromEntries(binding.nodes.map((node) => [node, expectedInstances[node]])),
            signal,
          );
        } catch {
          signal?.throwIfAborted();
          registration = unknown('platform-observation-unavailable');
        }
      } else registration = unknown('cloud-instance-identities-unverified');
    }
    sites.push({ siteName: binding.siteName, nodes: binding.nodes, registration, health });
  }
  const aggregate = (field) => ({
    status: sites.every((site) => site[field].status === 'healthy')
      ? 'healthy'
      : sites.some((site) => site[field].status === 'unknown')
        ? 'unknown'
        : 'degraded',
    observedAt,
    source: 'per-site-observations',
  });
  const networkApi = scopedAwsApi(api, plan.intent.awsProfile, signal);
  const hasNlb = plan.routing?.profile === 'nlb-ingress' || plan.intent.ingress?.mode === 'nlb';
  const observations = [];
  if (plan.routing?.profile.startsWith('tgw-')) {
    observations.push(await collectAwsNetworkHealth('routes', plan, checkpoint, networkApi, signal));
    if (plan.routing.profile === 'tgw-connect')
      observations.push(await collectAwsNetworkHealth('bgp', plan, checkpoint, networkApi, signal));
  }
  if (hasNlb) observations.push(await collectAwsNetworkHealth('nlb', plan, checkpoint, networkApi, signal));
  const routing = observations.length
    ? {
        status: observations.every((row) => row.status === 'healthy')
          ? 'healthy'
          : observations.some((row) => row.status === 'unknown')
            ? 'unknown'
            : 'degraded',
        observedAt,
        source: 'aws-cli-live',
        observations,
      }
    : unknown('no-requested-network-observations');
  return {
    schemaVersion: 2,
    deploymentId: plan.deploymentName,
    siteName: plan.siteName,
    engine: plan.engine,
    scope: { accountId: plan.accountId, region: plan.region },
    observedAt,
    checkpoint: {
      state: checkpoint?.state ?? 'not-started',
      completedActions: checkpoint?.completedActionIds.length ?? 0,
    },
    aws,
    f5: { registration: aggregate('registration'), health: aggregate('health'), sites },
    routing,
    traffic: unknown('traffic-collector-pending'),
  };
}
var init_status = __esm(() => {
  init_inventory();
  init_network_health();
});

// plugins/aws/src/ce/terraform-status.ts
async function readAwsTerraformWorkflowStatus(plan, storage) {
  if (plan.engine !== 'terraform') throw new Error('Terraform status requires the owning engine');
  await storage.verify();
  let raw;
  try {
    raw = await storage.read('terraform-workflow.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { progress: { state: 'not-started', engine: 'terraform', source: 'terraform-workflow.json' } };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Malformed Terraform workflow');
  const record = raw;
  if (
    record.schemaVersion !== 1 ||
    record.engine !== 'terraform' ||
    record.planSha256 !== plan.planSha256 ||
    !['network-pending', 'registration-pending', 'registered'].includes(String(record.stage))
  )
    throw new Error('Terraform workflow identity differs from the owning plan');
  let routing;
  try {
    const value = await storage.read('terraform-routing-checkpoint.json');
    if (
      !value ||
      value.schemaVersion !== plan.schemaVersion ||
      value.engine !== 'terraform' ||
      value.planId !== plan.planId ||
      value.planSha256 !== plan.planSha256 ||
      !['running', 'partial', 'complete'].includes(value.state) ||
      !Array.isArray(value.completedActionIds) ||
      !value.completedActionIds.every((id) => typeof id === 'string') ||
      !value.resolvedValues ||
      typeof value.resolvedValues !== 'object' ||
      Array.isArray(value.resolvedValues) ||
      !Object.values(value.resolvedValues).every((value) => typeof value === 'string')
    )
      throw new Error('Terraform routing checkpoint identity differs');
    routing = value;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return {
    progress: {
      state: String(record.stage),
      engine: 'terraform',
      source: 'terraform-workflow.json',
      planSha256: plan.planSha256,
    },
    routing,
  };
}

// plugins/aws/src/tools/aws-ce-status.ts
function createAwsCeStatusTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_status',
    label: 'AWS Customer Edge Status',
    description:
      'Collect scoped AWS instance/interface identities and shared-platform registration/site health. Caller-supplied health is rejected; unavailable routing, traffic or platform evidence remains unknown.',
    parameters: Type.Object({
      planId: Type.Optional(Type.String()),
      planSha256: Type.Optional(Type.String()),
      site: Type.Optional(
        Type.Object({
          accountId: Type.String(),
          awsProfile: Type.String(),
          region: Type.String(),
          siteName: Type.String(),
          platformContext: Type.Optional(Type.String()),
        }),
      ),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        if (Object.hasOwn(params, 'f5Evidence')) throw new Error('Caller-supplied F5 health evidence is unsupported');
        if (params.site) {
          if (params.planId || params.planSha256 || !/^[a-z][a-z0-9-]{0,62}$/.test(params.site.siteName))
            throw new Error('Select a saved plan or an inventory site');
          const scope = params.site;
          const inventory = await collectAwsCeInventory(
            { accountId: scope.accountId, awsProfile: scope.awsProfile, regions: [scope.region] },
            makeApi(ctx.cwd),
            signal,
          );
          const nodes = inventory.nodes.filter((node) => node.siteName === scope.siteName);
          let platform = { status: 'unknown', reason: 'platform-service-unavailable' };
          try {
            platform = await (
              await (await awsPlatformService(pi, signal)).runtime('native', scope.platformContext)
            ).observeReadOnlySite(
              scope.siteName,
              nodes.map((node) => node.instanceId),
              signal,
            );
          } catch {
            signal?.throwIfAborted();
          }
          return {
            content: [
              {
                type: 'text',
                text: `AWS CE ${scope.siteName}: ${nodes.length} inventory-selected node(s); F5 evidence ${platform.status}. Ownership remains as observed; this selection is read-only.`,
              },
            ],
            details: {
              tool: 'aws_ce_status',
              status: {
                observedAt: inventory.collectedAt,
                scope,
                ownership: nodes.map((node) => ({
                  instanceId: node.instanceId,
                  ownership: node.ownership,
                  engine: node.engine,
                })),
                aws: { status: 'observed', nodes },
                f5: platform,
                canSatisfyMutationGate: false,
              },
            },
          };
        }
        if (!params.planId || !params.planSha256) throw new Error('An exact saved plan or inventory site is required');
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.planId, params.planSha256, 'inspect');
        if (Number(plan.schemaVersion) === 1)
          return {
            content: [
              {
                type: 'text',
                text: `Legacy AWS CE plan ${plan.planId} is integrity-valid and inspectable. Rediscover and replan with schema v2 before mutation.`,
              },
            ],
            details: {
              tool: 'aws_ce_status',
              status: {
                schemaVersion: 1,
                planId: plan.planId,
                engine: 'unrecorded',
                capability: 'inspection-only',
                canSatisfyMutationGate: false,
              },
            },
          };
        let checkpoint =
          plan.engine === 'native'
            ? await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256)
            : undefined;
        let workflowProgress;
        let runtime;
        try {
          const platform = await awsPlatformService(pi, signal);
          if (plan.engine === 'terraform') {
            try {
              const workflow = await readAwsTerraformWorkflowStatus(
                plan,
                await platform.storage({
                  deploymentId: plan.deploymentName,
                  engine: 'terraform',
                  provider: 'aws',
                  account: plan.accountId,
                  region: plan.region,
                }),
              );
              workflowProgress = workflow.progress;
              checkpoint = workflow.routing;
            } catch (error) {
              if (signal?.aborted) throw error;
              workflowProgress = { state: 'unknown', engine: 'terraform', reason: 'workflow-evidence-unavailable' };
            }
          }
          runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
        } catch {
          signal?.throwIfAborted();
          if (plan.engine === 'terraform' && !workflowProgress)
            workflowProgress = { state: 'unknown', engine: 'terraform', reason: 'platform-service-unavailable' };
        }
        const status = await collectAwsCeStatus(plan, checkpoint, makeApi(ctx.cwd), runtime, signal);
        if (workflowProgress) Object.assign(status.checkpoint, workflowProgress);
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE ${plan.deploymentName}: cloud evidence ${status.aws.status}; registration ${status.f5.registration.status}; site health ${status.f5.health.status}. Routing evidence ${status.routing.status}; traffic evidence remains unknown.`,
            },
          ],
          details: { tool: 'aws_ce_status', status },
        };
      } catch {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text',
              text: 'AWS CE status is unavailable. Use the exact persisted plan and tool-collected evidence.',
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_status' },
        };
      }
    },
  };
}
var init_aws_ce_status = __esm(() => {
  init_artifacts();
  init_inventory();
  init_platform();
  init_status();
  init_shared();
});

// plugins/aws/src/ce/diagnostic-invocation.ts
import { setTimeout as delay } from 'node:timers/promises';

async function verifyDiagnosticManagedNode(api, instanceId, region) {
  const result = await api.exec('aws', [
    'ssm',
    'describe-instance-information',
    '--filters',
    `Key=InstanceIds,Values=${instanceId}`,
    '--region',
    region,
    '--output',
    'json',
  ]);
  if (result.exitCode !== 0) throw new Error('SSM managed-node prerequisites are unavailable');
  const response = object22(JSON.parse(result.stdout));
  if (
    Object.hasOwn(response, 'NextToken') ||
    !Array.isArray(response.InstanceInformationList) ||
    response.InstanceInformationList.length !== 1
  )
    throw new Error('SSM managed-node observation is incomplete');
  const node = object22(response.InstanceInformationList[0]);
  const pingTime =
    typeof node.LastPingDateTime === 'number'
      ? node.LastPingDateTime * 1000
      : Date.parse(String(node.LastPingDateTime));
  if (
    node.InstanceId !== instanceId ||
    node.ResourceType !== 'EC2Instance' ||
    node.PlatformType !== 'Linux' ||
    node.PingStatus !== 'Online' ||
    typeof node.AgentVersion !== 'string' ||
    !/^\d+\.\d+\.\d+\.\d+$/.test(node.AgentVersion) ||
    !Number.isFinite(pingTime) ||
    Date.now() - pingTime > 5 * 60000 ||
    pingTime > Date.now() + 30000
  )
    throw new Error('SSM requires a freshly online supported Linux managed node');
}
async function verifyDiagnosticInstance(api, plan, instanceId, node) {
  if (!/^i-[0-9a-f]{8,17}$/.test(instanceId)) throw new Error('Invalid diagnostic instance identity');
  const result = await api.exec('aws', [
    'ec2',
    'describe-instances',
    '--instance-ids',
    instanceId,
    '--region',
    plan.region,
    '--output',
    'json',
  ]);
  if (result.exitCode !== 0) throw new Error('Diagnostic instance ownership is unavailable');
  const data = object22(JSON.parse(result.stdout));
  if (data.NextToken || !Array.isArray(data.Reservations) || data.Reservations.length !== 1)
    throw new Error('Diagnostic instance response is incomplete');
  const reservation = object22(data.Reservations[0]);
  const instances = reservation.Instances;
  if (reservation.OwnerId !== plan.accountId || !Array.isArray(instances) || instances.length !== 1)
    throw new Error('Diagnostic instance account is unverified');
  const instance = object22(instances[0]);
  const tags = Array.isArray(instance.Tags) ? instance.Tags.map(object22) : [];
  const expected = {
    'xcsh-managed-by': 'aws-ce',
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-execution-engine': plan.engine,
    'ves-io-site-name': siteForNode(plan.intent, node).name,
  };
  if (
    instance.InstanceId !== instanceId ||
    object22(instance.State).Name !== 'running' ||
    Object.entries(expected).some(
      ([key, value]) =>
        tags.filter((tag) => tag.Key === key).length !== 1 || tags.find((tag) => tag.Key === key)?.Value !== value,
    )
  )
    throw new Error('Diagnostic instance ownership or state differs from plan');
}
async function observeDiagnosticInvocation(
  api,
  commandId,
  instanceId,
  region,
  protocol,
  signal,
  pause = (ms) => delay(ms, undefined, { signal }),
) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(commandId))
    throw new Error('SSM submission returned no usable command identity; do not resubmit automatically');
  const base = { commandId, instanceId, region, protocol, source: 'ssm:get-command-invocation' };
  for (let attempt = 0; attempt < 30; attempt++) {
    signal?.throwIfAborted();
    const result = await api.exec('aws', [
      'ssm',
      'get-command-invocation',
      '--command-id',
      commandId,
      '--instance-id',
      instanceId,
      '--region',
      region,
      '--output',
      'json',
    ]);
    if (result.exitCode !== 0) {
      if (!result.stderr.includes('InvocationDoesNotExist'))
        return { ...base, status: 'unknown', reason: 'invocation-unavailable' };
    } else {
      let invocation;
      try {
        invocation = object22(JSON.parse(result.stdout));
      } catch {
        return { ...base, status: 'unknown', reason: 'invocation-response-malformed' };
      }
      if (
        invocation.CommandId !== commandId ||
        invocation.InstanceId !== instanceId ||
        invocation.DocumentName !== 'AWS-RunShellScript'
      )
        return { ...base, status: 'unknown', reason: 'invocation-identity-mismatch' };
      if (invocation.Status === 'Success')
        return {
          ...base,
          status: invocation.ResponseCode === 0 && protocol === 'tcp' ? 'healthy' : 'unknown',
          scope: protocol === 'tcp' ? 'tcp-connect-only' : 'udp-response-unverified',
          observedAt: new Date().toISOString(),
        };
      if (['Failed', 'Cancelled', 'TimedOut'].includes(String(invocation.Status)))
        return { ...base, status: 'degraded', state: invocation.Status, observedAt: new Date().toISOString() };
      if (!['Pending', 'InProgress', 'Delayed', 'Cancelling'].includes(String(invocation.Status)))
        return { ...base, status: 'unknown', reason: 'invocation-state-unrecognized' };
    }
    if (attempt < 29) await pause(2000);
  }
  return { ...base, status: 'unknown', reason: 'invocation-not-converged' };
}
var object22 = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
var init_diagnostic_invocation = () => {};

// plugins/aws/src/ce/flow-log-evidence.ts
function interpretFlowLogEvents(response, scope, logFormat) {
  if (!Array.isArray(response.events) || response.events.length > 100 || Object.hasOwn(response, 'nextToken'))
    throw new Error('Missing or partial Flow Log events');
  const fields =
    logFormat === undefined
      ? defaultFormat.split(' ')
      : logFormat
          .trim()
          .split(/\s+/)
          .map((field) => {
            const match = /^\$\{([a-z-]+)\}$/.exec(field);
            if (!match) throw new Error('Unsupported Flow Log format');
            return match[1];
          });
  if (
    new Set(fields).size !== fields.length ||
    ['account-id', 'interface-id', 'start', 'end', 'action', 'log-status'].some((field) => !fields.includes(field))
  )
    throw new Error('Flow Log format lacks resource or freshness identity');
  const interfaces = new Set(scope.interfaceIds);
  let accepted = 0,
    rejected = 0,
    unavailable = 0;
  for (const value of response.events) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Flow Log event');
    const event = value;
    if (
      typeof event.timestamp !== 'number' ||
      !Number.isFinite(event.timestamp) ||
      event.timestamp < scope.start ||
      event.timestamp > scope.end ||
      typeof event.message !== 'string'
    )
      throw new Error('Stale or malformed Flow Log event');
    const values = event.message.trim().split(/\s+/);
    if (values.length !== fields.length) throw new Error('Flow Log record format differs');
    const record = Object.fromEntries(fields.map((field, index) => [field, values[index]]));
    if (record['account-id'] !== scope.accountId || !interfaces.has(record['interface-id']))
      throw new Error('Flow Log record scope differs');
    if (['NODATA', 'SKIPDATA'].includes(record['log-status'])) {
      unavailable++;
      continue;
    }
    const start = Number(record.start) * 1000,
      end = Number(record.end) * 1000;
    if (
      record['log-status'] !== 'OK' ||
      !/^\d+$/.test(record.start) ||
      !/^\d+$/.test(record.end) ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < scope.start ||
      end > scope.end ||
      start > end ||
      !['ACCEPT', 'REJECT'].includes(record.action)
    )
      throw new Error('Invalid Flow Log sample');
    if (record.action === 'ACCEPT') accepted++;
    else rejected++;
  }
  return {
    status:
      unavailable || accepted + rejected === 0 ? 'unknown' : rejected ? 'rejections-observed' : 'accepts-observed',
    accepted,
    rejected,
    unavailable,
    canSatisfyTrafficGate: false,
    window: { start: new Date(scope.start).toISOString(), end: new Date(scope.end).toISOString() },
    maxEvents: 100,
  };
}
var defaultFormat =
  'version account-id interface-id srcaddr dstaddr srcport dstport protocol packets bytes start end action log-status';

// plugins/aws/src/ce/passive-evidence.ts
async function collectAwsPassiveEvidence(scope, executor, signal, lookbackMinutes = 15) {
  if (
    !/^\d{12}$/.test(scope.accountId) ||
    !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(scope.region) ||
    !Number.isInteger(lookbackMinutes) ||
    lookbackMinutes < 1 ||
    lookbackMinutes > 60 ||
    scope.instanceIds.length > 20 ||
    scope.interfaceIds.length > 160 ||
    scope.vpcIds.length > 20 ||
    scope.instanceIds.some((id) => !/^i-[0-9a-f]{8,21}$/.test(id)) ||
    scope.interfaceIds.some((id) => !/^eni-[0-9a-f]{8,21}$/.test(id)) ||
    scope.vpcIds.some((id) => !/^vpc-[0-9a-f]{8,21}$/.test(id))
  )
    throw new Error('Invalid passive evidence scope');
  const api = scopedAwsApi(executor, scope.awsProfile, signal);
  const read = async (args) => {
    const response = await api.exec('aws', [...args, '--region', scope.region, '--output', 'json']);
    if (response.exitCode !== 0) throw new Error('Passive evidence permission or transport failure');
    const data = JSON.parse(response.stdout);
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      ['NextToken', 'NextMarker', 'nextToken'].some((key) => Object.hasOwn(data, key))
    )
      throw new Error('Malformed or partial passive evidence');
    return data;
  };
  if ((await read(['sts', 'get-caller-identity'])).Account !== scope.accountId)
    throw new Error('Passive evidence account changed');
  const end = Date.now(),
    start = end - lookbackMinutes * 60000;
  const observations = [];
  const flowDestinations = new Map();
  const collect = async (category, resources, args, parse) => {
    const base = {
      category,
      resources,
      accountId: scope.accountId,
      region: scope.region,
      source: `aws:${args[0]}:${args[1]}`,
      observedAt: new Date().toISOString(),
      canSatisfyTrafficGate: false,
    };
    try {
      observations.push({ ...base, ...parse(await read(args)) });
    } catch {
      signal?.throwIfAborted();
      observations.push({ ...base, status: 'unknown', reason: 'permission-transport-pagination-or-shape' });
    }
  };
  for (const id of scope.instanceIds) {
    await collect(
      'ec2-status',
      [id],
      ['ec2', 'describe-instance-status', '--include-all-instances', '--instance-ids', id],
      (value) => {
        if (!Array.isArray(value.InstanceStatuses) || value.InstanceStatuses.length !== 1)
          throw new Error('Missing status');
        const row = value.InstanceStatuses[0];
        const system = row.SystemStatus?.Status,
          instance = row.InstanceStatus?.Status;
        if (
          row.InstanceId !== id ||
          !['ok', 'impaired', 'initializing', 'insufficient-data', 'not-applicable'].includes(String(system)) ||
          !['ok', 'impaired', 'initializing', 'insufficient-data', 'not-applicable'].includes(String(instance))
        )
          throw new Error('Malformed status');
        return {
          status:
            system === 'ok' && instance === 'ok'
              ? 'healthy'
              : [system, instance].includes('insufficient-data')
                ? 'unknown'
                : 'degraded',
          system,
          instance,
        };
      },
    );
    await collect(
      'cloudwatch',
      [id],
      [
        'cloudwatch',
        'get-metric-statistics',
        '--namespace',
        'AWS/EC2',
        '--metric-name',
        'StatusCheckFailed',
        '--dimensions',
        `Name=InstanceId,Value=${id}`,
        '--start-time',
        new Date(start).toISOString(),
        '--end-time',
        new Date(end).toISOString(),
        '--period',
        '300',
        '--statistics',
        'Maximum',
      ],
      (value) => {
        if (value.Label !== 'StatusCheckFailed' || !Array.isArray(value.Datapoints) || !value.Datapoints.length)
          throw new Error('Missing metric');
        const points = value.Datapoints.map((point) => {
          const row = point,
            timestamp = Date.parse(String(row.Timestamp));
          if (
            !Number.isFinite(timestamp) ||
            timestamp < start ||
            timestamp > end ||
            typeof row.Maximum !== 'number' ||
            !Number.isFinite(row.Maximum)
          )
            throw new Error('Stale or malformed metric');
          return row.Maximum;
        });
        return {
          status: Math.max(...points) > 0 ? 'fault-observed' : 'no-status-check-faults',
          samples: points.length,
          window: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
        };
      },
    );
    await collect(
      'cloudtrail',
      [id],
      [
        'cloudtrail',
        'lookup-events',
        '--lookup-attributes',
        `AttributeKey=ResourceName,AttributeValue=${id}`,
        '--start-time',
        new Date(start).toISOString(),
        '--end-time',
        new Date(end).toISOString(),
        '--max-results',
        '50',
        '--no-paginate',
      ],
      (value) => {
        if (!Array.isArray(value.Events) || value.Events.length > 50)
          throw new Error('Missing or oversized CloudTrail events');
        const allowed = new Set([
          'RunInstances',
          'StartInstances',
          'StopInstances',
          'TerminateInstances',
          'ModifyInstanceAttribute',
          'SendCommand',
        ]);
        const names = value.Events.map((event) => {
          if (!event || typeof event !== 'object' || Array.isArray(event))
            throw new Error('Malformed CloudTrail event');
          const row = event;
          const timestamp = Date.parse(String(row.EventTime));
          if (
            !Number.isFinite(timestamp) ||
            timestamp < start ||
            timestamp > end ||
            typeof row.EventName !== 'string' ||
            !Array.isArray(row.Resources) ||
            !row.Resources.some(
              (resource) =>
                resource && typeof resource === 'object' && !Array.isArray(resource) && resource.ResourceName === id,
            )
          )
            throw new Error('Stale or unbound CloudTrail event');
          return row.EventName;
        });
        return {
          status: 'observed-sample',
          eventCount: names.length,
          operations: [...new Set(names.filter((name) => allowed.has(name)))],
          window: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
          maxEvents: 50,
        };
      },
    );
  }
  for (const vpcId of [...new Set(scope.vpcIds)]) {
    for (const [category, operation, field] of [
      ['security-groups', 'describe-security-groups', 'SecurityGroups'],
      ['network-acls', 'describe-network-acls', 'NetworkAcls'],
      ['route-tables', 'describe-route-tables', 'RouteTables'],
    ]) {
      await collect(category, [vpcId], ['ec2', operation, '--filters', `Name=vpc-id,Values=${vpcId}`], (value) => {
        if (!Array.isArray(value[field]) || value[field].some((row) => row.VpcId !== vpcId))
          throw new Error('Malformed configuration');
        return { status: 'configuration-observed', count: value[field].length, traffic: 'unknown' };
      });
    }
    await collect(
      'flow-logs',
      [vpcId],
      ['ec2', 'describe-flow-logs', '--filter', `Name=resource-id,Values=${vpcId}`],
      (value) => {
        if (
          !Array.isArray(value.FlowLogs) ||
          value.FlowLogs.some(
            (row) => row.ResourceId !== vpcId || !['ACTIVE', 'PENDING', 'FAILED'].includes(String(row.FlowLogStatus)),
          )
        )
          throw new Error('Malformed flow log observation');
        const destinations = new Map();
        for (const row of value.FlowLogs) {
          if (row.FlowLogStatus !== 'ACTIVE' || row.LogDestinationType !== 'cloud-watch-logs') continue;
          if (
            typeof row.LogGroupName !== 'string' ||
            !/^[.\-_/#A-Za-z0-9]{1,512}$/.test(row.LogGroupName) ||
            (row.LogFormat !== undefined && typeof row.LogFormat !== 'string')
          )
            throw new Error('Malformed Flow Log destination');
          const destination = { vpcId, format: row.LogFormat };
          const previous = destinations.get(row.LogGroupName) ?? flowDestinations.get(row.LogGroupName);
          if (previous && (previous.vpcId !== vpcId || previous.format !== destination.format))
            throw new Error('Ambiguous Flow Log destination');
          destinations.set(row.LogGroupName, destination);
        }
        for (const [group, destination] of destinations) flowDestinations.set(group, destination);
        return {
          status: value.FlowLogs.length ? 'configuration-observed' : 'not-configured',
          count: value.FlowLogs.length,
          measuredTraffic: 'unknown',
        };
      },
    );
  }
  if (scope.interfaceIds.length && flowDestinations.size <= 20) {
    for (const [group, destination] of flowDestinations) {
      await collect(
        'flow-log-traffic',
        [destination.vpcId, ...scope.interfaceIds],
        [
          'logs',
          'filter-log-events',
          '--log-group-name',
          group,
          '--start-time',
          String(start),
          '--end-time',
          String(end),
          '--filter-pattern',
          [...new Set(scope.interfaceIds)].map((id) => `?"${id}"`).join(' '),
          '--limit',
          '100',
          '--no-paginate',
        ],
        (value) =>
          interpretFlowLogEvents(
            value,
            { accountId: scope.accountId, interfaceIds: scope.interfaceIds, start, end },
            destination.format,
          ),
      );
    }
  } else if (flowDestinations.size) {
    observations.push({
      category: 'flow-log-traffic',
      resources: scope.vpcIds,
      accountId: scope.accountId,
      region: scope.region,
      observedAt: new Date().toISOString(),
      source: 'aws:logs:filter-log-events',
      status: 'unknown',
      reason: 'missing-interface-scope-or-query-bound',
      canSatisfyTrafficGate: false,
    });
  }
  return {
    scope,
    observedAt: new Date().toISOString(),
    lookbackMinutes,
    observations,
    findings: observations
      .filter((row) =>
        ['unknown', 'degraded', 'fault-observed', 'not-configured', 'rejections-observed'].includes(String(row.status)),
      )
      .map((row) => ({
        category: row.category,
        resources: row.resources,
        status: row.status,
        nextStep:
          row.status === 'unknown'
            ? 'Verify scoped permissions, response completeness and freshness.'
            : row.category === 'ec2-status' || row.category === 'cloudwatch'
              ? 'Review instance boot, EC2 checks and the owned network path.'
              : 'Review the observed configuration against the saved plan.',
      })),
  };
}
var init_passive_evidence = () => {};

// plugins/aws/src/tools/aws-ce-diagnose.ts
async function collect(api, args, category) {
  const result = await api.exec('aws', args);
  const raw = `${result.stdout}
${result.stderr}`;
  return {
    category,
    ok: result.exitCode === 0,
    bytes: Buffer.byteLength(raw),
    digest: sha256Hex(raw),
    health: 'unknown',
  };
}
function createAwsCeDiagnoseTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_diagnose',
    label: 'Diagnose AWS Customer Edge',
    description:
      'Run passive AWS CE diagnostics or separately approved active SSM connectivity checks. Covers EC2 boot/status, ENIs/routes/security groups, NLB, TGW/Connect/BGP, and live platform observations while withholding console output, user data, and secrets.',
    parameters: Type.Object({
      planId: Type.Optional(Type.String()),
      planSha256: Type.Optional(Type.String()),
      site: Type.Optional(
        Type.Object({
          accountId: Type.String(),
          awsProfile: Type.String(),
          region: Type.String(),
          siteName: Type.String(),
          platformContext: Type.Optional(Type.String()),
        }),
      ),
      mode: Type.Union([Type.Literal('passive'), Type.Literal('active')]),
      activeTarget: Type.Optional(
        Type.Object({
          destinationIp: Type.String(),
          destinationPort: Type.Number(),
          protocol: Type.Union([Type.Literal('tcp'), Type.Literal('udp')]),
        }),
      ),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        if (params.site) {
          if (params.mode !== 'passive' || params.activeTarget)
            throw new Error('Inventory-selected sites support passive diagnostics only');
          const observed = await createAwsCeStatusTool(pi, makeApi).execute(_id, params, signal, _update, ctx);
          const value = observed.details.status;
          const nodes = value?.aws?.nodes ?? [];
          const passive = await collectAwsPassiveEvidence(
            {
              accountId: params.site.accountId,
              awsProfile: params.site.awsProfile,
              region: params.site.region,
              instanceIds: nodes.map((node) => node.instanceId),
              interfaceIds: nodes.flatMap((node) => node.interfaces.map((item) => item.id)),
              vpcIds: [...new Set(nodes.flatMap((node) => node.interfaces.map((item) => item.vpcId)))],
            },
            makeApi(ctx.cwd),
            signal,
          );
          return { ...observed, details: { tool: 'aws_ce_diagnose', status: observed.details.status, passive } };
        }
        if (!params.planId || !params.planSha256) throw new Error('A saved plan or inventory site is required');
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.planId, params.planSha256);
        if (params.mode === 'active') {
          if (
            !params.activeTarget ||
            !['tcp', 'udp'].includes(params.activeTarget.protocol) ||
            !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(params.activeTarget.destinationIp) ||
            params.activeTarget.destinationIp.split('.').some((part) => Number(part) > 255) ||
            !Number.isInteger(params.activeTarget.destinationPort) ||
            params.activeTarget.destinationPort < 1 ||
            params.activeTarget.destinationPort > 65535
          )
            throw new Error('Active diagnostics require a valid IPv4 destination and port');
          if (!ctx.hasUI && process.env.XCSH_CE_HEADLESS_MUTATIONS !== '1')
            throw new Error('Active headless diagnostics require XCSH_CE_HEADLESS_MUTATIONS=1');
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Run active AWS CE diagnostics',
              'Run a bounded SSM connectivity check on owned CE nodes?',
            ))
          )
            throw new Error('Active diagnostics were not approved');
        }
        const api = scopedAwsApi(makeApi(ctx.cwd), plan.intent.awsProfile, signal);
        const identity = await api.exec('aws', [
          'sts',
          'get-caller-identity',
          '--output',
          'json',
          '--region',
          plan.region,
        ]);
        if (identity.exitCode !== 0 || JSON.parse(identity.stdout).Account !== plan.accountId)
          throw new Error('Diagnostic account differs from plan');
        if (params.mode === 'active' && plan.engine !== 'native')
          throw new Error('Only the owning native engine may run guest commands');
        const checkpoint = await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
        const ownedInstances = Array.from({ length: plan.topology.nodeCount }, (_, index) => ({
          node: index + 1,
          instanceId: checkpoint?.resolvedValues[`__INSTANCE_${index + 1}__`],
        })).filter((item) => typeof item.instanceId === 'string');
        if (new Set(ownedInstances.map((item) => item.instanceId)).size !== ownedInstances.length)
          throw new Error('Ambiguous diagnostic instance identities');
        if (params.mode === 'active' && ownedInstances.length !== plan.topology.nodeCount)
          throw new Error('Active diagnostics require all checkpointed instance identities');
        const commands = [
          {
            category: 'network-interfaces',
            args: [
              'ec2',
              'describe-network-interfaces',
              '--filters',
              `Name=tag:xcsh-deployment-id,Values=${plan.deploymentName}`,
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          },
          {
            category: 'route-tables',
            args: [
              'ec2',
              'describe-route-tables',
              '--filters',
              `Name=tag:xcsh-deployment-id,Values=${plan.deploymentName}`,
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          },
        ];
        if (ownedInstances.length)
          commands.unshift({
            category: 'instance-status',
            args: [
              'ec2',
              'describe-instance-status',
              '--include-all-instances',
              '--instance-ids',
              ...ownedInstances.map((item) => item.instanceId),
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          });
        for (const { instanceId, node } of ownedInstances) {
          await verifyDiagnosticInstance(api, plan, instanceId, node);
          commands.push({
            category: `${instanceId}-console`,
            args: [
              'ec2',
              'get-console-output',
              '--instance-id',
              instanceId,
              '--latest',
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          });
          if (params.mode === 'active' && params.activeTarget) {
            const command =
              params.activeTarget.protocol === 'tcp'
                ? `timeout 10 bash -c '</dev/tcp/${params.activeTarget.destinationIp}/${params.activeTarget.destinationPort}'`
                : `timeout 10 nc -zvu ${params.activeTarget.destinationIp} ${params.activeTarget.destinationPort}`;
            commands.push({
              category: `${instanceId}-active`,
              args: [
                'ssm',
                'send-command',
                '--instance-ids',
                instanceId,
                '--document-name',
                'AWS-RunShellScript',
                '--parameters',
                JSON.stringify({ commands: [command], executionTimeout: ['20'] }),
                '--timeout-seconds',
                '30',
                '--region',
                plan.region,
                '--output',
                'json',
              ],
            });
          }
        }
        if (plan.routing.profile === 'nlb-ingress')
          commands.push({
            category: 'nlb',
            args: [
              'elbv2',
              'describe-load-balancers',
              '--names',
              `${plan.deploymentName}-nlb`,
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          });
        if (plan.routing.profile.startsWith('tgw-'))
          commands.push({
            category: 'tgw',
            args: [
              'ec2',
              'describe-transit-gateway-attachments',
              '--filters',
              `Name=tag:xcsh-deployment-id,Values=${plan.deploymentName}`,
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          });
        const results = [];
        for (const command of commands) {
          if (command.args[0] === 'ssm') {
            const instanceId = command.args[command.args.indexOf('--instance-ids') + 1];
            const node = ownedInstances.find((item) => item.instanceId === instanceId)?.node;
            if (!node || !params.activeTarget) throw new Error('Missing diagnostic execution binding');
            await verifyDiagnosticInstance(api, plan, instanceId, node);
            await verifyDiagnosticManagedNode(api, instanceId, plan.region);
            const submitted = await api.exec('aws', command.args);
            if (submitted.exitCode !== 0)
              throw new Error('SSM submission result is ambiguous; reconcile before retrying');
            const commandId = JSON.parse(submitted.stdout)?.Command?.CommandId;
            results.push(
              await observeDiagnosticInvocation(
                api,
                commandId,
                instanceId,
                plan.region,
                params.activeTarget.protocol,
                signal,
              ),
            );
          } else results.push(await collect(api, command.args, command.category));
        }
        const status = await createAwsCeStatusTool(pi, makeApi).execute(
          _id,
          { planId: params.planId, planSha256: params.planSha256 },
          signal,
          _update,
          ctx,
        );
        const bound = status.details.status;
        const boundNodes = bound?.aws?.nodes ?? [];
        const passive = await collectAwsPassiveEvidence(
          {
            accountId: plan.accountId,
            awsProfile: plan.intent.awsProfile ?? 'default',
            region: plan.region,
            instanceIds: boundNodes.map((node) => node.instanceId),
            interfaceIds: boundNodes.flatMap((node) => node.interfaces.map((item) => item.id)),
            vpcIds: [...new Set(boundNodes.flatMap((node) => node.interfaces.map((item) => item.vpcId)))],
          },
          makeApi(ctx.cwd),
          signal,
        );
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE diagnostics collected ${results.length} redacted evidence digest(s); cloud and routing health are reported separately from command collection. Raw console output, SSM output, and user data were withheld.`,
            },
          ],
          details: {
            tool: 'aws_ce_diagnose',
            mode: params.mode,
            results,
            passive,
            status: status.details.status ?? { status: 'unknown' },
          },
        };
      } catch {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text',
              text: 'AWS CE diagnostics unavailable; verify the saved plan, scoped credentials and resource ownership. Do not blindly repeat an interrupted active command.',
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_diagnose' },
        };
      }
    },
  };
}
var init_aws_ce_diagnose = __esm(() => {
  init_artifacts();
  init_canonical();
  init_diagnostic_invocation();
  init_passive_evidence();
  init_aws_ce_status();
  init_shared();
});

// plugins/aws/src/ce/console-evidence.ts
function summarizeAwsConsoleOutput(result, instanceId, observedAt = new Date().toISOString()) {
  const base = { instanceId, source: 'aws:ec2:get-console-output', observedAt, scope: 'console-signals-only' };
  const unknown = { ...base, ok: false, cloudInitFinished: null, errorsDetected: null, warningsDetected: null };
  if (result.exitCode !== 0) return { ...unknown, reason: 'console-unavailable' };
  let raw;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    return { ...unknown, reason: 'malformed-console-response' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ...unknown, reason: 'malformed-console-response' };
  const value = raw;
  const timestamp =
    typeof value.Timestamp === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.Timestamp)
      ? Date.parse(value.Timestamp)
      : Number.NaN;
  const now = Date.parse(observedAt);
  if (
    value.InstanceId !== instanceId ||
    typeof value.Output !== 'string' ||
    !value.Output.trim() ||
    !Number.isFinite(timestamp) ||
    !Number.isFinite(now) ||
    timestamp > now + 5000
  )
    return { ...unknown, reason: 'console-identity-time-or-output-unavailable' };
  const lines = value.Output.split(/\r?\n/);
  return {
    ...base,
    ok: true,
    timestamp: value.Timestamp,
    ageSeconds: Math.max(0, (now - timestamp) / 1000),
    bytes: Buffer.byteLength(value.Output),
    digest: sha256Hex(value.Output),
    cloudInitFinished: lines.some((line) => /cloud-init\b.*\bfinished at\b/i.test(line)),
    warningsDetected: lines.some((line) => /\bWARNING\b|\[WARN\]/i.test(line)),
    errorsDetected: lines.some(
      (line) =>
        /failed to run module\b|running module\b.*\bfailed\b|failed to start\b.*\bcloud-init\b/i.test(line) ||
        (/\bERROR\b|\bCRITICAL\b/.test(line) && /cloud-init\b|\b(?:cc_\w+|util|stages|schema)\.py\b/i.test(line)),
    ),
  };
}
var init_console_evidence = __esm(() => {
  init_canonical();
});

// plugins/aws/src/tools/aws-cloud-init-analyze.ts
function createAwsCloudInitAnalyzeTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_cloud_init_analyze',
    label: 'Analyze AWS cloud-init',
    description:
      'Validate CE or general Linux cloud-init and summarize redacted EC2 console evidence without returning user data, bootstrap tokens, or raw boot logs.',
    parameters: Type.Object({
      source: Type.Optional(Type.String()),
      sourceArtifactId: Type.Optional(Type.String()),
      instanceId: Type.Optional(Type.String()),
      region: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      try {
        let source = params.source;
        if (params.sourceArtifactId) {
          if (!/^\d+$/.test(params.sourceArtifactId)) throw new Error('Invalid source artifact ID');
          const path = await ctx.sessionManager.getArtifactPath(params.sourceArtifactId);
          if (!path) throw new Error('Source artifact was not found in this session');
          source = await Bun.file(path).text();
        }
        const analysis = source ? analyzeAwsCloudInit(source) : undefined;
        let bootEvidence;
        if (params.instanceId || params.region) {
          const instanceId = params.instanceId ?? '';
          const region = params.region ?? '';
          if (!/^i-[0-9a-f]{8,17}$/.test(instanceId) || !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region))
            throw new Error('instanceId and region are required together');
          const result = await makeApi(ctx.cwd).exec('aws', [
            'ec2',
            'get-console-output',
            '--instance-id',
            instanceId,
            '--latest',
            '--region',
            region,
            '--output',
            'json',
          ]);
          bootEvidence = summarizeAwsConsoleOutput(result, instanceId);
        }
        if (!analysis && !bootEvidence)
          throw new Error('Provide cloud-init source, a session artifact ID, or complete EC2 coordinates');
        return {
          content: [
            {
              type: 'text',
              text: `cloud-init analysis: ${analysis ? (analysis.valid ? 'valid' : 'invalid') : 'source not inspected'}; stages: init-local \u2192 init-network \u2192 config \u2192 final; boot evidence: ${bootEvidence ? (bootEvidence.ok ? 'collected' : 'unavailable') : 'not requested'}. Raw user data and logs were withheld.`,
            },
          ],
          details: { tool: 'aws_cloud_init_analyze', analysis, bootEvidence },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `cloud-init analysis failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_cloud_init_analyze' },
        };
      }
    },
  };
}
var init_aws_cloud_init_analyze = __esm(() => {
  init_console_evidence();
  init_shared();
});

// plugins/aws/src/presentation.ts
function presentTool(tool, p) {
  return p.withPresentation(tool, {
    command: 'aws',
    scopeKeys: ['profile', 'region', 'instanceIds', 'filters'],
    collections: ['instances', 'buckets', 'objects'],
    labels: Object.fromEntries([
      ['account', 'Account'],
      ['arn', 'ARN'],
      ['userId', 'User ID'],
      ['instanceId', 'Instance ID'],
      ['name', 'Name'],
      ['state', 'State'],
      ['instanceType', 'Instance type'],
      ['region', 'Region'],
      ['publicIpAddress', 'Public IP'],
      ['privateIpAddress', 'Private IP'],
    ]),
    scopeNote: 'Account and region coverage are limited to the selected CLI context.',
  });
}

// plugins/aws/src/index.ts
init_shared();
function sanitizeHintField(value, maxLen = 200) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen);
}
function isAwsCePrompt(prompt) {
  const normalized = prompt.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const awsContext = /\baws\b|\bamazon\b|\bec2\b|\btgw\b|\btransit gateway\b/.test(normalized);
  const ceContext =
    /\bcustomer edge\b|\bf5 ce\b|\bxc ce\b|\bsecure mesh\b|\bce site\b|\bce node\b|\bce image\b/.test(normalized) ||
    /\bf5\b.*\b(distributed cloud|xc|edge|appliance|marketplace|bgp)\b/.test(normalized) ||
    /\bdistributed cloud\b.*\b(node|edge|appliance|aws|marketplace)\b/.test(normalized);
  return awsContext && ceContext;
}
var AWS_CE_RESEARCH_GATE = [
  'AWS CUSTOMER EDGE ROUTE: Use the aws:aws-ce workflow for this request.',
  'For inventory-only requests, use aws_ce_inventory with explicit account, profile and regions. Inventory does not require image selection, Marketplace acceptance, a deployment plan or mutations. Cloud site tags do not establish F5 registration or health.',
  'Before recommendations or aws_ce_plan, use web_search to retrieve the dedicated f5xc-ce-automation-policy/v2 contract, the current official F5 Secure Mesh Site v2 AWS guide, and current AWS Marketplace, EC2, AMI policy, quota, NLB, and Transit Gateway documentation.',
  'Then call aws_sts_whoami, f5xc_ce_v2_capabilities, and aws_compute_discover in that order. Live discovery must enumerate all regions and pin the exact regional SSM AMI and version.',
  'Require the validated shared-contract identity/digest, provider-source receipts, current Marketplace agreement, platform capability evidence, and discovery artifact. Never use generic aws_exec for CE research, plan before discovery, automate initial legal acceptance, mutate during research, or fall back to a legacy AWS site type.',
  'Treat TGW Connect as release-blocked unless both current F5 documentation and f5xc_ce_v2_capabilities advertise an explicit supported SMSv2 GRE/BGP schema.',
].join(`
`);
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
function awsInstallArgv(platform = process.platform) {
  if (platform === 'darwin') return ['brew', 'install', 'awscli'];
  if (platform === 'win32') return ['winget', 'install', '--exact', '--id', 'Amazon.AWSCLI'];
  return ['sudo', 'apt-get', 'install', '--yes', 'awscli'];
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
        return errorResult(renderError(err), {
          tool: tool.name,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}
var factory = async (pi) => {
  const presentTool2 = (tool) => presentTool(tool, pi.presentation);
  pi.setLabel('AWS');
  const integration = pi.integrations.register({
    id: 'aws',
    name: 'AWS',
    plugin: 'aws',
    kind: 'network',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: [],
      profileFields: ['accounts'],
      steps: [
        {
          kind: 'install',
          argv: awsInstallArgv(),
          timeoutMs: 300000,
        },
        { kind: 'login', argv: ['aws', 'sso', 'login'], timeoutMs: 300000 },
      ],
      verification: [
        {
          argv: ['aws', 'sts', 'get-caller-identity', '--output', 'json'],
          timeoutMs: 30000,
        },
      ],
    },
    async probe() {
      const checker = process.platform === 'win32' ? 'where' : 'which';
      if (Bun.spawnSync([checker, 'aws']).exitCode !== 0) return { state: 'setup_required', reason: 'cli_missing' };
      const result = Bun.spawnSync(['aws', 'sts', 'get-caller-identity', '--output', 'json']);
      if (result.exitCode !== 0) {
        const rawError = new TextDecoder().decode(result.stderr);
        const error = rawError.toLowerCase();
        if (/rate limit|rate exceeded|too many requests|throttl|429/.test(error))
          return {
            state: 'rate_limited',
            reason: 'rate_limited',
            retryAfterMs: retryAfterMsFromHeaders(rawError),
          };
        if (error.includes('expired') || error.includes('sso token'))
          return { state: 'setup_required', reason: 'expired' };
        if (error.includes('denied') || error.includes('unauthorized'))
          return { state: 'unavailable', reason: 'permission_denied' };
        if (error.includes('connect') || error.includes('network')) return { state: 'unavailable', reason: 'network' };
        return { state: 'setup_required', reason: 'not_authenticated' };
      }
      try {
        const value = JSON.parse(new TextDecoder().decode(result.stdout));
        value.profile = process.env.AWS_PROFILE;
        value.region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
        if (!value.Account || !value.Arn) return { state: 'error', reason: 'invalid_response' };
        return { state: 'ready', value };
      } catch {
        return { state: 'error', reason: 'invalid_response' };
      }
    },
    profile(value) {
      const principalType = value.Arn?.includes(':user/')
        ? 'user'
        : value.Arn?.includes(':role/') || value.Arn?.includes(':assumed-role/')
          ? 'role'
          : 'unknown';
      return {
        facts: {
          accounts: [
            {
              provider: 'aws',
              identifier: value.Arn,
              principalType,
              accountId: value.Account,
            },
          ],
        },
        observations: [],
      };
    },
  });
  let awsAvailable = false;
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    awsAvailable = Bun.spawnSync([checker, 'aws']).exitCode === 0;
  } catch {}
  if (awsAvailable && typeof pi.registerTool === 'function') {
    await Promise.resolve().then(() => init_aws_sts_whoami2());
    await Promise.resolve().then(() => init_aws_s3_ls2());
    await Promise.resolve().then(() => init_aws_ec2_describe_instances2());
    await Promise.resolve().then(() => init_aws_exec2());
    await Promise.resolve().then(() => init_aws_help2());
    await Promise.resolve().then(() => init_aws_compute_discover());
    await Promise.resolve().then(() => init_aws_ce_plan());
    await Promise.resolve().then(() => init_aws_ce_apply());
    await Promise.resolve().then(() => init_aws_ce_inventory());
    await Promise.resolve().then(() => init_aws_ce_teardown());
    await Promise.resolve().then(() => init_aws_ce_upgrade());
    await Promise.resolve().then(() => init_aws_ce_failover());
    await Promise.resolve().then(() => init_aws_ce_status());
    await Promise.resolve().then(() => init_aws_ce_diagnose());
    await Promise.resolve().then(() => init_aws_cloud_init_analyze());
    pi.registerTool(presentTool2(withErrorType(createAwsStsWhoamiTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createAwsS3LsTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createAwsEc2DescribeInstancesTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createAwsExecTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createAwsHelpTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createAwsComputeDiscoverTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createAwsCePlanTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createAwsCeApplyTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createAwsCeInventoryTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createAwsCeTeardownTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createAwsCeUpgradeTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createAwsCeFailoverTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createAwsCeStatusTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createAwsCeDiagnoseTool(pi))));
    pi.registerTool(presentTool2(withErrorType(createAwsCloudInitAnalyzeTool(pi))));
  }
  if (awsAvailable && typeof pi.on === 'function') {
    pi.on('before_agent_start', async (event, _ctx) => {
      try {
        const snapshot = await integration.get();
        if (snapshot.state !== 'ready' || !snapshot.value) return;
        const identity = snapshot.value;
        const region = identity.region || '';
        const profile = identity.profile || '';
        const lines = [
          identity.Account ? `Account: ${sanitizeHintField(identity.Account)}` : '',
          identity.Arn ? `Identity: ${sanitizeHintField(identity.Arn)}` : '',
          profile ? `Profile: ${sanitizeHintField(profile)}` : '',
          region ? `Region: ${sanitizeHintField(region)}` : '',
        ]
          .filter(Boolean)
          .join(`
`);
        const content = [isAwsCePrompt(String(event.prompt ?? '')) ? AWS_CE_RESEARCH_GATE : '', lines]
          .filter(Boolean)
          .join(`
`);
        if (!content) return;
        return {
          message: { customType: 'aws_hint', content, display: false },
        };
      } catch {
        return;
      }
    });
  }
  if (typeof pi.on === 'function') {
    pi.on('session_start', async (_event, _ctx) => {
      if (!awsAvailable) {
        pi.logger.debug('AWS: aws CLI not found');
      }
    });
  }
};
var src_default = factory;

export {
  AWS_CE_RESEARCH_GATE,
  awsInstallArgv,
  isAwsCePrompt,
  retryAfterMsFromHeaders,
  src_default as default,
  withErrorType,
};
