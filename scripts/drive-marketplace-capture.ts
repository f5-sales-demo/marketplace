import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertPrivateCaptureRoot, matrixControls, validateCaptureIdentity } from './marketplace-qualification';

export function inspectCapture(frame: any, expected: any, visibleWidth: (line: string) => number) {
  const failures: string[] = [];
  const text = Bun.stripANSI(frame.lines.join('\n'));
  if (!frame.lines.length) failures.push('empty-frame');
  if (frame.lines.some((line: string) => visibleWidth(line) > frame.width)) failures.push('overflow');
  if (frame.resultIsError !== Boolean(expected.expectedError)) failures.push('unexpected-outcome');
  for (const literal of [
    ...(expected.contains ?? []),
    ...(frame.expanded ? (expected.expandedContains ?? []) : (expected.collapsedContains ?? [])),
  ])
    if (!text.includes(literal)) failures.push('missing-literal:' + literal);
  for (const literal of expected.absent ?? [])
    if (text.includes(literal)) failures.push('unexpected-literal:' + literal);
  if (/SYNTHETIC_SECRET_SENTINEL/.test(text)) failures.push('unsafe-evidence');
  return { id: frame.id, case: frame.case, passed: failures.length === 0, failures };
}

if (import.meta.main) {
  const root = resolve(process.argv[2] ?? '');
  const checksPath = process.argv[3];
  if (!process.argv[2] || !checksPath)
    throw new Error('Usage: bun drive-marketplace-capture.ts <private-root> <checks.json>');
  assertPrivateCaptureRoot(root);
  if (existsSync(join(root, 'inspection.jsonl')) || existsSync(join(root, 'inspection-summary.json')))
    throw new Error('Preserve prior inspection; use a fresh capture root');
  const provenance = JSON.parse(readFileSync(join(root, 'ready.json'), 'utf8'));
  const { visibleWidth } = await import('./agent-validation-runtime/node_modules/@f5-sales-demo/pi-tui/src/index.ts');
  const cases = JSON.parse(readFileSync(join(root, 'cases.json'), 'utf8'));
  const checks = JSON.parse(readFileSync(checksPath, 'utf8'));
  const findings: any[] = [];
  for (const item of cases) {
    if (!checks[item.id]) throw new Error('Every captured case requires explicit inspection expectations');
    for (const control of matrixControls(item.id)) {
      writeFileSync(join(root, 'control.tmp'), JSON.stringify(control), { mode: 0o600 });
      renameSync(join(root, 'control.tmp'), join(root, 'control.json'));
      const deadline = Date.now() + 30000;
      while (true) {
        if (existsSync(join(root, 'error.json'))) throw new Error('Capture failed; inspect private error.json');
        const ack = existsSync(join(root, 'ack.json')) ? JSON.parse(readFileSync(join(root, 'ack.json'), 'utf8')) : {};
        if (ack.id === control.id) break;
        if (Date.now() > deadline) throw new Error('Missing capture acknowledgement: ' + control.id);
        await Bun.sleep(40);
      }
      const frame = JSON.parse(readFileSync(join(root, 'frames', control.id + '.json'), 'utf8'));
      validateCaptureIdentity(frame, control, provenance);
      const finding = inspectCapture(frame, checks[item.id], visibleWidth);
      appendFileSync(join(root, 'inspection.jsonl'), JSON.stringify(finding) + '\n', { mode: 0o600 });
      findings.push(finding);
    }
    console.log(
      `Inspected ${item.id}: ${findings.length} frames, ${findings.filter((f) => !f.passed).length} failures`,
    );
  }
  writeFileSync(
    join(root, 'inspection-summary.json'),
    JSON.stringify({
      frames: findings.length,
      failures: findings.filter((f) => !f.passed),
      evidenceTier: 'individual-native-buffer-checks',
    }),
    { mode: 0o600 },
  );
  writeFileSync(join(root, 'control.tmp'), JSON.stringify({ action: 'finish' }), { mode: 0o600 });
  renameSync(join(root, 'control.tmp'), join(root, 'control.json'));
  if (findings.some((f) => !f.passed)) process.exitCode = 1;
}
