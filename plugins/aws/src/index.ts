import type { PluginInterface } from './aws/types';
import { detectErrorType, errorResult, renderError } from './tools/shared';
import type { runSetupWizard } from './wizard';

interface AwsExtensionApi extends PluginInterface {
  exec(command: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }>;
  setLabel(label: string): void;
  registerCommand?(
    name: string,
    command: {
      description: string;
      handler(args: string, ctx: Parameters<typeof runSetupWizard>[1]): Promise<void>;
    },
  ): void;
  registerTool?(tool: unknown): void;
  registerServiceStatus?(status: unknown): void;
  on?(event: string, handler: unknown): void;
  logger: { debug(message: string): void };
}

type ExtensionFactory = (pi: AwsExtensionApi) => void | Promise<void>;

function sanitizeHintField(value: unknown, maxLen = 200): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen);
}

export function isAwsCePrompt(prompt: string): boolean {
  const normalized = prompt.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const awsContext = /\baws\b|\bamazon\b|\bec2\b|\btgw\b|\btransit gateway\b/.test(normalized);
  const ceContext =
    /\bcustomer edge\b|\bf5 ce\b|\bxc ce\b|\bsecure mesh\b|\bce site\b|\bce node\b|\bce image\b/.test(normalized) ||
    /\bf5\b.*\b(distributed cloud|xc|edge|appliance|marketplace|bgp)\b/.test(normalized) ||
    /\bdistributed cloud\b.*\b(node|edge|appliance|aws|marketplace)\b/.test(normalized);
  return awsContext && ceContext;
}

export const AWS_CE_RESEARCH_GATE = [
  'AWS CUSTOMER EDGE ROUTE: Use the aws:aws-ce workflow for this request.',
  'Before recommendations or aws_ce_plan, use web_search to retrieve the dedicated f5xc-ce-automation/v1 contract, the current official F5 Secure Mesh Site v2 AWS guide, and current AWS Marketplace, EC2, AMI policy, quota, NLB, and Transit Gateway documentation.',
  'Then call aws_sts_whoami, f5xc_ce_v2_capabilities, and aws_compute_discover in that order. Live discovery must enumerate all regions and pin the exact regional SSM AMI and version.',
  'Require the validated shared-contract identity/digest, provider-source receipts, current Marketplace agreement, platform capability evidence, and discovery artifact. Never use generic aws_exec for CE research, plan before discovery, automate initial legal acceptance, mutate during research, or fall back to a legacy AWS site type.',
  'Treat TGW Connect as release-blocked unless both current F5 documentation and f5xc_ce_v2_capabilities advertise an explicit supported SMSv2 GRE/BGP schema.',
].join('\n');

/**
 * Wrap a factory tool so any error that still propagates out of its execute()
 * is converted into a structured error result carrying details.errorType.
 *
 * The per-tool handlers already catch AWS errors and return a friendly
 * errorResult (a normal result); those never reach this wrapper. A genuine
 * cancellation (AbortError / ToolAbortError) is re-thrown so the agent loop
 * can distinguish user cancellation from a real tool failure.
 */
export function withErrorType<T extends { name: string; execute: (...args: never[]) => Promise<unknown> }>(tool: T): T {
  const originalExecute = tool.execute.bind(tool) as (...args: unknown[]) => Promise<unknown>;
  return {
    ...tool,
    execute: (async (...args: unknown[]) => {
      try {
        return await originalExecute(...args);
      } catch (err) {
        const name = (err as { name?: string } | null | undefined)?.name;
        if (name === 'AbortError' || name === 'ToolAbortError') throw err;
        return errorResult(renderError(err), { tool: tool.name, errorType: detectErrorType(err) });
      }
    }) as T['execute'],
  };
}

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('AWS');

  // Always register setup command (even without aws CLI)
  if (typeof pi.registerCommand === 'function') {
    pi.registerCommand('aws:setup', {
      description: 'Install and configure AWS CLI',
      async handler(_args, ctx) {
        const { runSetupWizard } = await import('./wizard');
        await runSetupWizard(pi, ctx);
      },
    });
  }

  // Check if aws CLI is available
  let awsAvailable = false;
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    awsAvailable = Bun.spawnSync([checker, 'aws']).exitCode === 0;
  } catch {
    // aws not available
  }

  // Only register tools when aws CLI is present
  if (awsAvailable && typeof pi.registerTool === 'function') {
    const { createAwsStsWhoamiTool } = await import('./tools/aws-sts-whoami');
    const { createAwsS3LsTool } = await import('./tools/aws-s3-ls');
    const { createAwsEc2DescribeInstancesTool } = await import('./tools/aws-ec2-describe-instances');
    const { createAwsExecTool } = await import('./tools/aws-exec');
    const { createAwsHelpTool } = await import('./tools/aws-help');
    const { createAwsComputeDiscoverTool } = await import('./tools/aws-compute-discover');
    const { createAwsCePlanTool } = await import('./tools/aws-ce-plan');
    const { createAwsCeApplyTool } = await import('./tools/aws-ce-apply');
    const { createAwsCeStatusTool } = await import('./tools/aws-ce-status');
    const { createAwsCeDiagnoseTool } = await import('./tools/aws-ce-diagnose');
    const { createAwsCloudInitAnalyzeTool } = await import('./tools/aws-cloud-init-analyze');

    pi.registerTool(withErrorType(createAwsStsWhoamiTool(pi)));
    pi.registerTool(withErrorType(createAwsS3LsTool(pi)));
    pi.registerTool(withErrorType(createAwsEc2DescribeInstancesTool(pi)));
    pi.registerTool(withErrorType(createAwsExecTool(pi)));
    pi.registerTool(withErrorType(createAwsHelpTool(pi)));
    pi.registerTool(withErrorType(createAwsComputeDiscoverTool(pi)));
    pi.registerTool(withErrorType(createAwsCePlanTool(pi)));
    pi.registerTool(withErrorType(createAwsCeApplyTool(pi)));
    pi.registerTool(withErrorType(createAwsCeStatusTool(pi)));
    pi.registerTool(withErrorType(createAwsCeDiagnoseTool(pi)));
    pi.registerTool(withErrorType(createAwsCloudInitAnalyzeTool(pi)));
  }

  // Always register service status (shows unavailable when CLI missing)
  if (typeof pi.registerServiceStatus === 'function') {
    pi.registerServiceStatus({
      name: 'AWS',
      async check() {
        try {
          const whichChecker = process.platform === 'win32' ? 'where' : 'which';
          const whichResult = Bun.spawnSync([whichChecker, 'aws']);
          if (whichResult.exitCode !== 0) {
            return { state: 'unavailable', hint: 'run: /aws:setup' };
          }
          const result = Bun.spawnSync(['aws', 'sts', 'get-caller-identity', '--output', 'json']);
          if (result.exitCode === 0) return { state: 'connected' };
          const stderr = new TextDecoder().decode(result.stderr).toLowerCase();
          if (stderr.includes('sso token') || stderr.includes('expired'))
            return {
              state: 'unauthenticated',
              hint: 'SSO expired, run: /aws:setup',
            };
          if (stderr.includes('could not find profile') || stderr.includes('profile'))
            return {
              state: 'unauthenticated',
              hint: 'profile not found, run: /aws:setup',
            };
          if (stderr.includes('could not connect') || stderr.includes('network'))
            return { state: 'unavailable', hint: 'network error' };
          return { state: 'unauthenticated', hint: 'run: /aws:setup' };
        } catch {
          return { state: 'unavailable', hint: 'aws CLI check failed' };
        }
      },
      fix: {
        prompt: 'AWS SSO session expired',
        command: ['aws', 'sso', 'login'],
      },
    });
  }

  // Context injection: provide AWS identity to agents
  if (awsAvailable && typeof pi.on === 'function') {
    pi.on('before_agent_start', async (event: { prompt?: string }, ctx: { cwd: string }) => {
      const ceRequest = isAwsCePrompt(String(event?.prompt ?? ''));
      try {
        const cwd = ctx?.cwd || process.cwd();
        const result = Bun.spawnSync(['aws', 'sts', 'get-caller-identity', '--output', 'json'], { cwd });
        if (result.exitCode !== 0) return;
        const identity = JSON.parse(new TextDecoder().decode(result.stdout));
        const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || '';
        const profile = process.env.AWS_PROFILE || '';
        const lines = [
          identity.Account ? `Account: ${sanitizeHintField(identity.Account)}` : '',
          identity.Arn ? `Identity: ${sanitizeHintField(identity.Arn)}` : '',
          profile ? `Profile: ${sanitizeHintField(profile)}` : '',
          region ? `Region: ${sanitizeHintField(region)}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        const content = [...(ceRequest ? [AWS_CE_RESEARCH_GATE] : []), ...(lines ? [lines] : [])].join('\n');
        if (!content) return;
        return {
          message: { customType: ceRequest ? 'aws_ce_research_gate' : 'aws_hint', content, display: false },
        };
      } catch {
        if (!ceRequest) return;
        return {
          message: { customType: 'aws_ce_research_gate', content: AWS_CE_RESEARCH_GATE, display: false },
        };
      }
    });
  }

  // Session start: notify if CLI missing
  if (typeof pi.on === 'function') {
    pi.on('session_start', async (_event: unknown, _ctx: { cwd: string }) => {
      if (!awsAvailable) {
        pi.logger.debug('AWS: aws CLI not found');
      }
    });
  }
};

export default factory;
