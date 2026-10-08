import { readFileSync } from 'node:fs';

type TraceRow = {
  expectedTool?: string | null;
  expectedTools?: string[];
  forbiddenTools?: string[];
  trace: unknown;
};

// Only execution-start events prove that xcsh invoked a tool. Tool names in
// prompts, assistant prose, schemas, or tool results are not execution evidence.
export function executedTools(trace: unknown): string[] {
  if (Array.isArray(trace)) return trace.flatMap(executedTools);
  if (!trace || typeof trace !== 'object') return [];
  const event = trace as Record<string, unknown>;
  if (event.type === 'tool_execution_start' && typeof event.toolName === 'string') return [event.toolName];
  if (event.type === 'agent_event') return executedTools(event.event);
  return [];
}

export function scoreTrace(row: TraceRow, secret?: string) {
  const calls = executedTools(row.trace);
  const expected = row.expectedTools ?? (row.expectedTool ? [row.expectedTool] : []);
  const toolOk =
    row.trace !== undefined &&
    expected.every((name) => calls.includes(name)) &&
    (row.forbiddenTools ?? []).every((name) => !calls.includes(name));
  const secretOk = !secret || !JSON.stringify(row).includes(secret);
  return { toolOk, secretOk, calls };
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) throw new Error('usage: score-uat-traces.ts <jsonl>');
  const secret = process.env.XCSH_API_TOKEN;
  let total = 0,
    passed = 0;
  for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const result = scoreTrace(JSON.parse(line) as TraceRow, secret);
    total += 1;
    if (result.toolOk && result.secretOk) passed += 1;
    else console.error(JSON.stringify({ index: total, ...result }));
  }
  console.log(JSON.stringify({ total, passed, failed: total - passed }));
  if (passed !== total) process.exit(1);
}
