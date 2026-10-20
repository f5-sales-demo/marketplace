import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { inspectCapture } from './drive-marketplace-capture';
import { assertPrivateCaptureRoot, matrixControls, validateCaptureIdentity } from './marketplace-qualification';

// Append a named independent inspection without replacing any capture or earlier finding.
if (import.meta.main) {
  const root = resolve(process.argv[2] ?? '');
  const name = process.argv[3];
  if (!process.argv[2] || !name || !/^[\w-]+$/.test(name))
    throw new Error('Usage: bun reinspect-marketplace-capture.ts <private-root> <new-inspection-name> [checks.json]');
  assertPrivateCaptureRoot(root);
  const output = join(root, name + '-inspection.jsonl');
  const summaryPath = join(root, name + '-summary.json');
  if (existsSync(output) || existsSync(summaryPath)) throw new Error('Preserve prior inspections; choose a new name');
  const provenance = JSON.parse(readFileSync(join(root, 'ready.json'), 'utf8'));
  const cases = JSON.parse(readFileSync(join(root, 'cases.json'), 'utf8'));
  const checkBytes = readFileSync(process.argv[4] ?? join(root, 'checks.json'));
  const checks = JSON.parse(checkBytes.toString('utf8'));
  const { visibleWidth } = await import('./agent-validation-runtime/node_modules/@f5-sales-demo/pi-tui/src/index.ts');
  const findings = [];
  for (const item of cases) {
    if (!checks[item.id]) throw new Error('Missing explicit expectations: ' + item.id);
    for (const control of matrixControls(item.id)) {
      const frame = JSON.parse(readFileSync(join(root, 'frames', control.id + '.json'), 'utf8'));
      validateCaptureIdentity(frame, control, provenance);
      const finding = inspectCapture(frame, checks[item.id], visibleWidth);
      appendFileSync(output, JSON.stringify(finding) + '\n', { mode: 0o600 });
      findings.push(finding);
    }
  }
  const summary = {
    frames: findings.length,
    checksSha256: createHash('sha256').update(checkBytes).digest('hex'),
    failures: findings.filter((finding) => !finding.passed),
    evidenceTier: 'individual-native-buffer-checks-with-bounded-wrapped-fields-and-table-cells',
  };
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ frames: summary.frames, failures: summary.failures.length }));
  if (summary.failures.length) process.exitCode = 1;
}
