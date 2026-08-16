import { describe, expect, it } from 'bun:test';
import { evaluateTrace } from '../../benchmarks/verify-ce-prompt-trace';

const scenario = {
  id: 'test',
  prompt: 'research CE',
  requiredTools: ['web_search', 'az_account_show', 'azure_compute_discover'],
  forbiddenTools: ['az_exec', 'azure_ce_apply'],
};

function event(value: unknown): string {
  return JSON.stringify(value);
}

const successfulDiscovery = {
  type: 'tool_execution_end',
  toolName: 'azure_compute_discover',
  result: {
    isError: false,
    content: [
      {
        type: 'text',
        text: 'Research: live Azure CLI catalog and subscription observations (canadacentral)\nOfficial sources: retrieved live from F5 and Microsoft\nPinned image: f5-networks:f5xc_customer_edge:f5xc-ce-crt:1.2.3\nCompatible VM sizes: Standard_D8s_v5 (8 vCPU, 32 GB, 8 NICs, zones 1/2/3)\nDiscovery artifact: artifact://azure-ce-discovery-abc',
      },
    ],
  },
};

describe('CE synthesized prompt trace evaluation', () => {
  it('accepts a captured official research, auth, and live discovery sequence', () => {
    const trace = [
      event({ type: 'tool_execution_start', toolName: 'web_search' }),
      event({ type: 'tool_execution_start', toolName: 'az_account_show' }),
      event({ type: 'tool_execution_start', toolName: 'azure_compute_discover' }),
      event(successfulDiscovery),
    ].join('\n');
    expect(evaluateTrace(scenario, trace)).toEqual({
      pass: true,
      tools: ['web_search', 'az_account_show', 'azure_compute_discover'],
      errors: [],
    });
  });

  it('rejects a trace that guesses a plan before research', () => {
    const trace = [
      event({ type: 'tool_execution_start', toolName: 'azure_ce_plan' }),
      event({ type: 'tool_execution_start', toolName: 'azure_compute_discover' }),
      event(successfulDiscovery),
    ].join('\n');
    const result = evaluateTrace(scenario, trace);
    expect(result.pass).toBe(false);
    expect(result.errors).toContain('missing required tool: web_search');
    expect(result.errors).toContain('azure_ce_plan was invoked before live discovery');
  });

  it('rejects failed discovery or a missing live-research receipt', () => {
    const trace = [
      event({ type: 'tool_execution_start', toolName: 'web_search' }),
      event({ type: 'tool_execution_start', toolName: 'az_account_show' }),
      event({ type: 'tool_execution_start', toolName: 'azure_compute_discover' }),
      event({ type: 'tool_execution_end', toolName: 'azure_compute_discover', result: { isError: true } }),
    ].join('\n');
    const result = evaluateTrace(scenario, trace);
    expect(result.pass).toBe(false);
    expect(result.errors).toContain('azure_compute_discover returned an error');
    expect(result.errors).toContain('discovery result lacks the live-research receipt');
  });
});
