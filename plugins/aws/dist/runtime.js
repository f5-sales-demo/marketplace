// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import {
  buildAwsArgs,
  detectErrorType,
  errorResult,
  helpArgs,
  identityArgs,
  instanceArgs,
  jsonArgs,
  renderError,
  s3Args,
} from './runtime-30f0rzjf.js';

// plugins/aws/src/presentation/ce.ts
var record = (value) => (value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {});
var fields = (values, title) => ({
  kind: 'fields',
  title,
  values,
  previewFields: 'all',
});
var count = (value) => (Array.isArray(value) ? value.length : 'Unknown');
function ceSummary(name, details) {
  const checkpoint = record(details.checkpoint);
  if (name === 'aws_ce_apply' && Object.keys(checkpoint).length)
    return [
      fields(
        {
          'Plan ID': details.planId,
          'Plan SHA-256': details.planSha256,
          State: checkpoint.state,
          'Completed actions': count(checkpoint.completedActionIds),
        },
        'Checkpoint',
      ),
    ];
  const plan = record(details.plan);
  if (name === 'aws_ce_plan' && Object.keys(plan).length)
    return [
      fields(
        {
          'Plan ID': plan.planId,
          'Plan SHA-256': plan.planSha256,
          Region: plan.region,
          Nodes: record(plan.topology).nodeCount,
          'AMI ID': record(plan.image).id,
          'Ordered actions': count(plan.actions),
        },
        'Immutable plan',
      ),
    ];
  const observation = record(details.observation);
  if (name === 'aws_compute_discover' && Object.keys(observation).length)
    return [
      fields(
        {
          ...record(observation.identity),
          'Agreement active': record(observation.agreement).active,
          'Observed regions': count(observation.regions),
          'Artifact ID': details.artifactId,
        },
        'Compute discovery',
      ),
    ];
  const status = record(details.status);
  if (name === 'aws_ce_status' && Object.keys(status).length)
    return [
      fields(
        {
          State: record(status.checkpoint).state,
          'Instance records': record(record(status.aws).instances).count,
          'ENI records': record(record(status.aws).enis).count,
          ...record(status.f5),
        },
        'Customer Edge status',
      ),
    ];
  if (name === 'aws_ce_diagnose' && Array.isArray(details.results))
    return [
      fields(
        {
          Mode: details.mode,
          'Evidence digests': details.results.length,
          'Require review': details.results.filter((value) => {
            const r = record(value);
            return r.ok === false || r.errorsDetected === true;
          }).length,
          'Raw output': 'Withheld by the domain tool',
        },
        'Diagnostics',
      ),
    ];
  const analysis = record(details.analysis);
  const boot = record(details.bootEvidence);
  if (name === 'aws_cloud_init_analyze' && (Object.keys(analysis).length || Object.keys(boot).length))
    return [
      ...(Object.keys(analysis).length ? [fields(analysis, 'cloud-init analysis')] : []),
      ...(Object.keys(boot).length ? [fields(boot, 'Boot evidence')] : []),
    ];
  return;
}

// plugins/aws/src/presentation/command.ts
function toolArgv(name, args) {
  const strings = (value) => Array.isArray(value) && value.every((v) => typeof v === 'string');
  if (name === 'aws_sts_whoami')
    return ['aws', ...jsonArgs(identityArgs(typeof args.profile === 'string' ? args.profile : undefined))];
  if (name === 'aws_ec2_describe_instances')
    return [
      'aws',
      ...jsonArgs(
        instanceArgs({
          region: typeof args.region === 'string' ? args.region : undefined,
          instanceIds: strings(args.instanceIds) ? args.instanceIds : undefined,
          filters: strings(args.filters) ? args.filters : undefined,
        }),
      ),
    ];
  if (name === 'aws_s3_ls') {
    const target = typeof args.target === 'string' ? args.target : undefined;
    return ['aws', ...(target ? s3Args(target) : jsonArgs(s3Args()))];
  }
  if (name === 'aws_help')
    return ['aws', ...helpArgs(typeof args.command_path === 'string' ? args.command_path : undefined)];
  if (name === 'aws_exec' && strings(args.args) && args.args.length) return ['aws', ...buildAwsArgs(args.args)];
  return;
}

// plugins/aws/src/presentation.ts
var record2 = (value) => (value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {});
var texts = (result) => result.content.filter((b) => b.type === 'text').map((b) => b.text ?? '');
var literal = (text, title) => ({ kind: 'code', title, text });
var fields2 = (values, title) => ({
  kind: 'fields',
  title,
  values,
  previewFields: 'all',
});
var rows = (value) =>
  Array.isArray(value) && value.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v));
var columns = {
  instances: [
    { key: 'instanceId', label: 'Instance ID' },
    { key: 'name', label: 'Name' },
    { key: 'state', label: 'State' },
    { key: 'type', label: 'Instance type' },
    { key: 'az', label: 'Availability zone' },
    { key: 'privateIp', label: 'Private IP' },
    { key: 'publicIp', label: 'Public IP' },
  ],
  buckets: [
    { key: 'name', label: 'Bucket' },
    { key: 'creationDate', label: 'Creation date' },
  ],
  objects: [
    { key: 'key', label: 'Object key' },
    { key: 'size', label: 'Size (bytes)', align: 'right' },
    { key: 'lastModified', label: 'Last modified' },
  ],
};
function presentTool(tool, p) {
  const scope = (args) =>
    fields2(
      {
        Profile: typeof args.profile === 'string' && !/^ *$/.test(args.profile) ? args.profile : 'Existing CLI context',
        Region: args.region ?? 'Existing CLI context',
        ...(args.target !== undefined ? { Target: args.target } : {}),
        ...(args.instanceIds !== undefined ? { 'Instance IDs': args.instanceIds } : {}),
        ...(args.filters !== undefined ? { Filters: args.filters } : {}),
        Coverage: 'Account and region coverage are limited to the selected CLI context.',
      },
      'Scope',
    );
  return p.withPresentation(tool, {
    call: (input, options) => {
      const args = record2(input);
      const argv = toolArgv(tool.name, args);
      const safeArgs = Object.fromEntries(
        Object.entries(args).filter(([key]) => !['source', 'bootstrapRef', 'bootstrapRefs'].includes(key)),
      );
      return { sections: options.expanded ? p.data(safeArgs) : [...(argv ? [p.command(argv)] : []), scope(safeArgs)] };
    },
    result: (result, options, input) => {
      const args = record2(input);
      const details = record2(result.details);
      const argv = toolArgv(tool.name, args);
      const prefix = [...(argv ? [p.command(argv)] : []), scope(args)];
      if (result.isError)
        return {
          summary: 'AWS operation failed',
          sections: [...prefix, ...texts(result).map((t) => literal(t, 'Complete corrective guidance'))],
        };
      if (tool.name === 'aws_sts_whoami' && Object.keys(record2(details.identity)).length) {
        const { identity, ...metadata } = details;
        return {
          expandedEvidence: 'provided',
          sections: [
            ...prefix,
            fields2(record2(identity), 'Caller identity'),
            ...(options.expanded ? p.data(metadata, 'Metadata') : []),
          ],
        };
      }
      const collection =
        tool.name === 'aws_ec2_describe_instances'
          ? 'instances'
          : tool.name === 'aws_s3_ls'
            ? args.target
              ? 'objects'
              : 'buckets'
            : undefined;
      if (collection && rows(details[collection])) {
        const data = details[collection];
        const declared = columns[collection];
        const known = new Set(declared.map((c) => c.key));
        const extra = [...new Set(data.flatMap((row) => Object.keys(row)))].filter((key) => !known.has(key));
        const section = {
          ...p.table(data, [...declared, ...extra.map((key) => ({ key, label: key }))], collection),
          previewRows: 12,
        };
        const { [collection]: _data, ...metadata } = details;
        return {
          expandedEvidence: 'provided',
          sections: [
            ...prefix,
            fields2({ 'Returned rows': data.length }, 'Results'),
            section,
            ...(options.expanded ? p.data(metadata, 'Metadata') : []),
          ],
        };
      }
      if (
        tool.name === 'aws_help' &&
        /^(?:USAGE|DESCRIPTION|OPTIONS|AWS)/m.test(
          texts(result).join(`
`),
        )
      ) {
        return {
          expandedEvidence: 'provided',
          sections: [...prefix, ...texts(result).map((t) => literal(t, 'Complete AWS CLI help'))],
        };
      }
      if (tool.name === 'aws_exec' && typeof details.fullOutput === 'string') {
        try {
          const decoded = JSON.parse(details.fullOutput);
          return {
            expandedEvidence: 'provided',
            sections: [...prefix, ...p.data(decoded, 'CLI result')],
            warnings: details.modelPreviewTruncated
              ? ['Model preview was truncated; this view includes the complete CLI result.']
              : [],
          };
        } catch {}
        return { sections: [...prefix, literal(details.fullOutput, 'Complete CLI output')] };
      }
      const ce = ceSummary(tool.name, details);
      if (ce)
        return {
          expandedEvidence: 'provided',
          sections: [
            ...prefix,
            ...(options.expanded ? p.data(details, 'Domain evidence') : ce),
            ...texts(result).map((t) => literal(t, 'AWS Customer Edge summary')),
          ],
        };
      return { sections: [...prefix, ...texts(result).map((t) => literal(t, 'CLI evidence'))] };
    },
  });
}

// plugins/aws/src/index.ts
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
    const { createAwsStsWhoamiTool } = await import('./runtime-1wjxzz78.js');
    const { createAwsS3LsTool } = await import('./runtime-fcs0sdvn.js');
    const { createAwsEc2DescribeInstancesTool } = await import('./runtime-4wnzm49b.js');
    const { createAwsExecTool } = await import('./runtime-fhnm51pm.js');
    const { createAwsHelpTool } = await import('./runtime-0109hfw5.js');
    const { createAwsComputeDiscoverTool } = await import('./runtime-2rnc5mh2.js');
    const { createAwsCePlanTool } = await import('./runtime-3e5p3pqx.js');
    const { createAwsCeApplyTool } = await import('./runtime-rpkb0ts5.js');
    const { createAwsCeInventoryTool } = await import('./runtime-gm4wbzpx.js');
    const { createAwsCeTeardownTool } = await import('./runtime-w3eb2kz3.js');
    const { createAwsCeUpgradeTool } = await import('./runtime-d6fw90rm.js');
    const { createAwsCeFailoverTool } = await import('./runtime-5ccdszk8.js');
    const { createAwsCePowerTool } = await import('./runtime-9vqkmk0q.js');
    const { createAwsCeStatusTool } = await import('./runtime-8bd68pn8.js');
    const { createAwsCeDiagnoseTool } = await import('./runtime-31fqqw2y.js');
    const { createAwsCloudInitAnalyzeTool } = await import('./runtime-7p1kj6ye.js');
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
    pi.registerTool(presentTool2(withErrorType(createAwsCePowerTool(pi))));
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
