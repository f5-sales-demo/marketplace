export type CeProvider = 'aws' | 'azure';

export interface PromptScenario {
  id: string;
  provider?: CeProvider;
  workflow?: 'deployment' | 'inventory';
  prompt: string;
  requiredTools: string[];
  forbiddenTools: string[];
}

interface PromptScenarioFile {
  version: number;
  scenarios: PromptScenario[];
}
export interface TraceEvaluation {
  pass: boolean;
  tools: string[];
  errors: string[];
}
interface TraceEvent {
  type?: string;
  toolName?: string;
  result?: { isError?: boolean; content?: Array<{ type?: string; text?: string }> };
}

const CONTRACT = 'f5xc-ce-automation/v1';

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
  const provider = scenario.provider ?? 'azure';
  const discoveryTool = provider === 'aws' ? 'aws_compute_discover' : 'azure_compute_discover';
  const identityTools = provider === 'aws' ? ['aws_sts_whoami', 'f5xc_ce_v2_capabilities'] : ['az_account_show'];
  const planTool = provider === 'aws' ? 'aws_ce_plan' : 'azure_ce_plan';
  const genericTool = provider === 'aws' ? 'aws_exec' : 'az_exec';
  const events = parseTrace(jsonl);
  const starts = events.filter((event) => event.type === 'tool_execution_start' && event.toolName);
  const tools = starts.map((event) => String(event.toolName));
  const errors: string[] = [];
  for (const required of scenario.requiredTools)
    if (!tools.includes(required)) errors.push(`missing required tool: ${required}`);
  for (const forbidden of scenario.forbiddenTools)
    if (tools.includes(forbidden)) errors.push(`forbidden tool invoked: ${forbidden}`);
  if (tools.includes(genericTool)) errors.push(`generic ${genericTool} is forbidden for Customer Edge research`);

  const inventoryWorkflow = scenario.workflow === 'inventory' || scenario.requiredTools.includes('azure_ce_inventory');
  if (inventoryWorkflow) {
    const accountIndex = tools.indexOf('az_account_show');
    const inventoryIndex = tools.indexOf('azure_ce_inventory');
    if (accountIndex >= 0 && inventoryIndex >= 0 && accountIndex >= inventoryIndex)
      errors.push('az_account_show must complete before azure_ce_inventory');
    for (const forbidden of ['web_search', discoveryTool, planTool, 'azure_ce_apply'])
      if (tools.includes(forbidden)) errors.push(`inventory invoked forbidden tool: ${forbidden}`);
    const result = events.find(
      (event) => event.type === 'tool_execution_end' && event.toolName === 'azure_ce_inventory',
    );
    if (!result) errors.push('missing azure_ce_inventory result');
    else {
      if (result.result?.isError) errors.push('azure_ce_inventory returned an error');
      const text = (result.result?.content ?? []).map((item) => item.text ?? '').join('\n');
      if (!text.includes('Digest: ')) errors.push('inventory result lacks a canonical digest');
      if (!text.includes('Inventory artifact: artifact://')) errors.push('inventory result lacks a session artifact');
    }
    for (const tool of tools)
      if (/_(?:apply|delete|create|update|teardown)$/.test(tool) || tool === 'f5xc_ce_v2_site')
        errors.push(`mutation-capable tool invoked during inventory: ${tool}`);
    return { pass: errors.length === 0, tools, errors };
  }

  const discoveryIndex = tools.indexOf(discoveryTool);
  let previous = -1;
  for (const prerequisite of ['web_search', ...identityTools]) {
    const index = tools.indexOf(prerequisite);
    if (index < 0) continue;
    if (index <= previous) errors.push(`${prerequisite} is out of required research order`);
    if (discoveryIndex >= 0 && index >= discoveryIndex)
      errors.push(`${prerequisite} must complete before ${discoveryTool}`);
    previous = index;
  }
  const planIndex = tools.indexOf(planTool);
  if (planIndex >= 0 && (discoveryIndex < 0 || planIndex < discoveryIndex))
    errors.push(`${planTool} was invoked before live discovery`);
  for (const tool of tools.slice(0, discoveryIndex < 0 ? tools.length : discoveryIndex + 1))
    if (/_(?:apply|delete|create|update|teardown)$/.test(tool) || tool === 'f5xc_ce_v2_site')
      errors.push(`mutation-capable tool invoked during research: ${tool}`);

  const result = events.find((event) => event.type === 'tool_execution_end' && event.toolName === discoveryTool);
  if (!result) errors.push(`missing ${discoveryTool} result`);
  else {
    if (result.result?.isError) errors.push(`${discoveryTool} returned an error`);
    const text = (result.result?.content ?? []).map((item) => item.text ?? '').join('\n');
    if (!text.includes('Shared contract: f5xc-ce-automation/v1'))
      errors.push(`discovery result lacks ${CONTRACT} receipt`);
    if (!text.includes('Discovery artifact: artifact://')) errors.push('discovery result lacks a session artifact');
    if (provider === 'aws' && !text.includes('Pinned AMI: ami-'))
      errors.push('discovery result lacks a pinned regional AMI');
    if (provider === 'azure' && !text.includes('Pinned image: f5-networks:'))
      errors.push('discovery result lacks an observed F5 image');
  }
  return { pass: errors.length === 0, tools, errors };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const [scenarioPath, scenarioId, tracePath] = args;
  if (!scenarioPath || !scenarioId || !tracePath) {
    console.error('usage: bun benchmarks/verify-ce-prompt-trace.ts <scenarios.json> <scenario-id> <trace.jsonl>');
    process.exit(2);
  }
  const data = (await Bun.file(scenarioPath).json()) as PromptScenarioFile;
  const scenario = data.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error(`Unknown prompt scenario: ${scenarioId}`);
  const evaluation = evaluateTrace(scenario, await Bun.file(tracePath).text());
  console.log(JSON.stringify({ scenario: scenario.id, ...evaluation }, null, 2));
  if (!evaluation.pass) process.exit(1);
}

if (import.meta.main) await main();
