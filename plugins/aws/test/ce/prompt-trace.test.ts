import { describe, expect, it } from 'bun:test';
import { evaluateTrace } from '../../../../benchmarks/verify-ce-prompt-trace';

const scenario = {
  id: 'aws-ce',
  provider: 'aws' as const,
  prompt: 'research AWS CE',
  requiredTools: ['web_search', 'aws_sts_whoami', 'f5xc_ce_v2_capabilities', 'aws_compute_discover'],
  forbiddenTools: ['aws_exec', 'aws_ce_plan', 'aws_ce_apply'],
};
const start = (toolName: string) => JSON.stringify({ type: 'tool_execution_start', toolName });
const end = JSON.stringify({
  type: 'tool_execution_end',
  toolName: 'aws_compute_discover',
  result: {
    content: [
      {
        type: 'text',
        text: 'Shared contract: f5xc-ce-automation/v1 (abc)\nPinned AMI: ami-0123456789abcdef0\nDiscovery artifact: artifact://42',
      },
    ],
  },
});

describe('shared CE prompt trace evaluator', () => {
  it('accepts AWS web research, identity, capability, then provider discovery', () => {
    const trace = [...scenario.requiredTools.map(start), end].join('\n');
    expect(evaluateTrace(scenario, trace)).toEqual({ pass: true, tools: scenario.requiredTools, errors: [] });
  });
  it('rejects generic execution, premature planning, and missing shared receipts', () => {
    const trace = [
      start('aws_ce_plan'),
      start('aws_exec'),
      start('aws_compute_discover'),
      JSON.stringify({
        type: 'tool_execution_end',
        toolName: 'aws_compute_discover',
        result: { content: [{ type: 'text', text: 'no receipt' }] },
      }),
    ].join('\n');
    const result = evaluateTrace(scenario, trace);
    expect(result.pass).toBe(false);
    expect(result.errors.join('\n')).toMatch(/aws_exec|before live discovery|contract/);
  });
});
