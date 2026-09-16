export interface PromptScenario {
  id: string;
  provider?: 'kvm';
  workflow?: 'blocked';
  prompt: string;
  requiredTools: string[];
  forbiddenTools: string[];
}

interface TraceEvent {
  type?: string;
  toolName?: string;
  result?: { isError?: boolean; content?: Array<{ type?: string; text?: string }> };
}

export interface TraceEvaluation {
  pass: boolean;
  tools: string[];
  errors: string[];
}

export function parseTrace(jsonl: string): TraceEvent[] {
  return jsonl
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => {
      try {
        return JSON.parse(line) as TraceEvent;
      } catch {
        return {};
      }
    });
}

export function evaluateTrace(scenario: PromptScenario, jsonl: string): TraceEvaluation {
  const events = parseTrace(jsonl);
  const tools = events
    .filter((event) => event.type === 'tool_execution_start' && event.toolName)
    .map((event) => String(event.toolName));
  const errors: string[] = [];
  for (const required of scenario.requiredTools)
    if (!tools.includes(required)) errors.push(`missing required tool: ${required}`);
  for (const forbidden of scenario.forbiddenTools)
    if (tools.includes(forbidden)) errors.push(`forbidden tool invoked: ${forbidden}`);
  for (const genericTool of ['aws_exec', 'az_exec'])
    if (tools.includes(genericTool)) errors.push(`${genericTool} is forbidden for KVM SMSv2`);

  const capabilityIndex = tools.indexOf('f5xc_ce_v2_capabilities');
  const preflightIndex = tools.indexOf('kvm_smsv2_preflight');
  if (capabilityIndex >= 0 && preflightIndex >= 0 && capabilityIndex >= preflightIndex)
    errors.push('f5xc_ce_v2_capabilities must complete before kvm_smsv2_preflight');
  for (const tool of ['kvm_smsv2_plan', 'kvm_smsv2_apply', 'kvm_smsv2_status', 'kvm_smsv2_drift']) {
    const index = tools.indexOf(tool);
    if (index >= 0 && (preflightIndex < 0 || index <= preflightIndex))
      errors.push(`${tool} was invoked before kvm_smsv2_preflight`);
  }
  const planIndex = tools.indexOf('kvm_smsv2_plan');
  const applyIndex = tools.indexOf('kvm_smsv2_apply');
  if (applyIndex >= 0 && (planIndex < 0 || applyIndex <= planIndex))
    errors.push('kvm_smsv2_apply was invoked before kvm_smsv2_plan');

  const preflightResult = events.find(
    (event) => event.type === 'tool_execution_end' && event.toolName === 'kvm_smsv2_preflight',
  );
  if (!preflightResult) errors.push('missing kvm_smsv2_preflight result');
  if (scenario.workflow === 'blocked') {
    if (!preflightResult?.result?.isError) errors.push('blocked workflow did not reject at KVM preflight');
    const text = (preflightResult?.result?.content ?? []).map((item) => item.text ?? '').join('\n');
    if (!text.includes('maurice_config_cardinality_exactly_one'))
      errors.push('blocked workflow lacks the authoritative KVM prerequisite ID');
    for (const tool of tools.slice(preflightIndex + 1))
      if (tool === 'kvm_smsv2_apply' || tool === 'f5xc_ce_v2_site')
        errors.push(`mutation-capable tool invoked after rejected KVM preflight: ${tool}`);
  } else if (preflightResult?.result?.isError) {
    errors.push('kvm_smsv2_preflight returned an error');
  }
  return { pass: errors.length === 0, tools, errors };
}
