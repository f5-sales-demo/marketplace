interface PromptScenario {
  id: string;
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
  const starts = events.filter((event) => event.type === 'tool_execution_start' && event.toolName);
  const tools = starts.map((event) => String(event.toolName));
  const errors: string[] = [];

  for (const required of scenario.requiredTools) {
    if (!tools.includes(required)) errors.push(`missing required tool: ${required}`);
  }
  for (const forbidden of scenario.forbiddenTools) {
    if (tools.includes(forbidden)) errors.push(`forbidden tool invoked: ${forbidden}`);
  }

  const discoverIndex = tools.indexOf('azure_compute_discover');
  for (const prerequisite of ['web_search', 'az_account_show']) {
    const index = tools.indexOf(prerequisite);
    if (discoverIndex >= 0 && index >= discoverIndex)
      errors.push(`${prerequisite} must complete before azure_compute_discover is invoked`);
  }
  const planIndex = tools.indexOf('azure_ce_plan');
  if (planIndex >= 0 && (discoverIndex < 0 || planIndex < discoverIndex))
    errors.push('azure_ce_plan was invoked before live discovery');

  const discoveryResult = events.find(
    (event) => event.type === 'tool_execution_end' && event.toolName === 'azure_compute_discover',
  );
  if (!discoveryResult) {
    errors.push('missing azure_compute_discover result');
  } else {
    if (discoveryResult.result?.isError) errors.push('azure_compute_discover returned an error');
    const evidence = (discoveryResult.result?.content ?? []).map((item) => item.text ?? '').join('\n');
    if (!evidence.includes('Research: live Azure CLI catalog and subscription observations'))
      errors.push('discovery result lacks the live-research receipt');
    if (!evidence.includes('Official sources: retrieved live from F5 and Microsoft'))
      errors.push('discovery result lacks live official-source evidence');
    if (!evidence.includes('Pinned image: f5-networks:')) errors.push('discovery result lacks an observed F5 image');
    if (!evidence.includes('Compatible VM sizes: Standard_'))
      errors.push('discovery result lacks compatible VM-size evidence');
    if (!evidence.includes('Discovery artifact: artifact://')) errors.push('discovery result lacks a session artifact');
  }

  return { pass: errors.length === 0, tools, errors };
}

async function main(): Promise<void> {
  const scenarioPath = process.argv[2];
  const scenarioId = process.argv[3];
  const tracePath = process.argv[4];
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
