import { describe, expect, it } from 'bun:test';
import { evaluateTrace, type PromptScenario } from '../src/prompt-trace';

function event(type: string, toolName: string, result?: Record<string, unknown>): string {
  return JSON.stringify({ type, toolName, ...(result ? { result } : {}) });
}

describe('installed KVM prompt trace policy', () => {
  it('requires capability and preflight before plan and apply', () => {
    const scenario: PromptScenario = {
      id: 'kvm-deploy',
      provider: 'kvm',
      prompt: 'Deploy KVM SMSv2',
      requiredTools: ['f5xc_ce_v2_capabilities', 'kvm_smsv2_preflight', 'kvm_smsv2_plan', 'kvm_smsv2_apply'],
      forbiddenTools: ['az_exec', 'aws_exec'],
    };
    const trace = [
      event('tool_execution_start', 'f5xc_ce_v2_capabilities'),
      event('tool_execution_start', 'kvm_smsv2_preflight'),
      event('tool_execution_end', 'kvm_smsv2_preflight', {
        content: [{ type: 'text', text: 'KVM prerequisite available; host confirmed.' }],
      }),
      event('tool_execution_start', 'kvm_smsv2_plan'),
      event('tool_execution_start', 'kvm_smsv2_apply'),
      event('tool_execution_start', 'kvm_smsv2_status'),
    ].join('\n');
    expect(evaluateTrace(scenario, trace)).toMatchObject({ pass: true, errors: [] });
  });

  it('accepts an unavailable-prerequisite stop only when no mutation follows', () => {
    const scenario: PromptScenario = {
      id: 'kvm-blocked',
      provider: 'kvm',
      workflow: 'blocked',
      prompt: 'Deploy despite unavailable prerequisite',
      requiredTools: ['f5xc_ce_v2_capabilities', 'kvm_smsv2_preflight'],
      forbiddenTools: ['kvm_smsv2_plan', 'kvm_smsv2_apply'],
    };
    const trace = [
      event('tool_execution_start', 'f5xc_ce_v2_capabilities'),
      event('tool_execution_start', 'kvm_smsv2_preflight'),
      event('tool_execution_end', 'kvm_smsv2_preflight', {
        isError: true,
        content: [{ type: 'text', text: 'maurice_config_cardinality_exactly_one is unavailable' }],
      }),
    ].join('\n');
    expect(evaluateTrace(scenario, trace)).toMatchObject({ pass: true, errors: [] });

    const unsafe = `${trace}\n${event('tool_execution_start', 'kvm_smsv2_apply')}`;
    expect(evaluateTrace(scenario, unsafe).pass).toBe(false);
  });
});
