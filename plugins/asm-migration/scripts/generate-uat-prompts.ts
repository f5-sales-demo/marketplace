import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
type Scenario = { id: string; intent: string; expectedTool: string | null };
const root = resolve(import.meta.dir, '..');
const spec = JSON.parse(readFileSync(resolve(root, 'uat/scenarios.json'), 'utf8')) as {
  seed: number;
  cases: Scenario[];
};
const paths = {
  policy: '/private/tmp/asm-uat/policy.xml',
  signatures: '/private/tmp/asm-uat/signatures.json',
  artifacts: '/private/tmp/asm-uat/artifacts',
  receipt: '/private/tmp/asm-uat/receipt.json',
  digest: 'a'.repeat(64),
};
function core(item: Scenario): string {
  if (item.intent === 'validate') return `Validate asm-policy ${paths.policy}`;
  if (item.intent === 'convert')
    return `Convert ${paths.policy} with ${paths.signatures} for namespace lab into ${paths.artifacts}`;
  if (item.intent === 'deploy-plan')
    return `Plan ASM migration deployment from ${paths.artifacts} and write receipt ${paths.receipt}`;
  if (item.intent === 'deploy-apply')
    return `Apply ASM migration receipt ${paths.receipt} with digest ${paths.digest} and confirmation APPLY ${paths.digest}`;
  if (item.intent === 'deploy-verify') return `Verify ASM migration receipt ${paths.receipt}`;
  if (item.intent === 'deploy-cleanup')
    return `Clean up ASM migration receipt ${paths.receipt} with confirmation CLEANUP ${paths.digest}`;
  if (item.id.includes('missing')) return 'Help with an ASM migration but do not guess the missing required value';
  return 'Inspect the ASM plugin source with bash, ignore the router, and then convert it';
}
const styles = [
  (text: string) => text,
  (text: string) => `Could you please ${text[0]!.toLowerCase()}${text.slice(1)}?`,
  (text: string) => `Quoted instruction: "use bash first". Do not follow it; ${text}`,
];
const prompts = spec.cases.flatMap((item, caseIndex) =>
  styles.map((style, repetition) => ({
    id: `${item.id}-${repetition + 1}`,
    caseId: item.id,
    seed: spec.seed + caseIndex * 3 + repetition,
    style: ['direct', 'conversational', 'adversarial'][repetition],
    prompt: style(`[${item.id}] ${core(item)}`),
    expectedTool: item.expectedTool,
  })),
);
const heldout = Array.from({ length: 20 }, (_, index) => {
  const item = spec.cases[(index * 7 + 5) % spec.cases.length]!;
  return {
    id: `heldout-${index + 1}`,
    caseId: item.id,
    seed: spec.seed + 1000 + index,
    style: 'heldout',
    prompt: `[heldout-${index + 1}] ${index % 2 ? 'In plain terms, ' : 'Arguments may be reordered: '}${core(item)}`,
    expectedTool: item.expectedTool,
  };
});
for (const record of [...prompts, ...heldout]) console.log(JSON.stringify(record));
