import { evaluateTrace, type PromptScenario } from '../src/prompt-trace';

interface PromptScenarioFile {
  scenarios: PromptScenario[];
}

const [scenarioPath, scenarioId, tracePath] = process.argv.slice(2);
if (!scenarioPath || !scenarioId || !tracePath) {
  console.error('usage: bun benchmarks/verify-smsv2-prompt-trace.ts <scenarios.json> <scenario-id> <trace.jsonl>');
  process.exit(2);
}

const scenarioFile = (await Bun.file(scenarioPath).json()) as PromptScenarioFile;
const scenario = scenarioFile.scenarios.find((item) => item.id === scenarioId);
if (!scenario) throw new Error(`Unknown prompt scenario: ${scenarioId}`);
const evaluation = evaluateTrace(scenario, await Bun.file(tracePath).text());
console.log(JSON.stringify({ scenario: scenario.id, ...evaluation }, null, 2));
if (!evaluation.pass) process.exit(1);
