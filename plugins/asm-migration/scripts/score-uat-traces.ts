import { readFileSync } from 'node:fs';
const file = process.argv[2];
if (!file) throw new Error('usage: score-uat-traces.ts <jsonl>');
const secret = process.env.XCSH_API_TOKEN;
let total = 0,
  passed = 0;
for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
  const row = JSON.parse(line) as { expectedTool?: string | null; trace?: unknown; output?: unknown };
  const text = JSON.stringify(row);
  const calls = [...text.matchAll(/asm_migration_(?:validate|convert|deploy)/g)].map((match) => match[0]);
  const unique = [...new Set(calls)];
  const toolOk = row.expectedTool ? unique.length === 1 && unique[0] === row.expectedTool : unique.length === 0;
  const secretOk = !secret || !text.includes(secret);
  total += 1;
  if (toolOk && secretOk) passed += 1;
  else console.error(JSON.stringify({ index: total, toolOk, secretOk, calls: unique }));
}
console.log(JSON.stringify({ total, passed, failed: total - passed }));
if (passed !== total) process.exit(1);
