import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { inspectCapture } from './drive-marketplace-capture';
import { assertPrivateCaptureRoot, matrixControls, validateCaptureIdentity } from './marketplace-qualification';

interface NativeBuffer {
  lines: string[];
  viewport?: { capacity: number; offset?: number; totalLines?: number; rows?: string[] };
  terminalRows?: number;
  terminalColumns?: number;
  scroll?: number;
}

/** Compare emitted viewport pages to their complete native buffer, retaining final-page overlap. */
export function inspectViewportPages(full: NativeBuffer, pages: NativeBuffer[]) {
  const failures: string[] = [];
  const capacity = full.viewport?.capacity;
  if (
    typeof capacity !== 'number' ||
    !Number.isSafeInteger(capacity) ||
    capacity < 1 ||
    !Array.isArray(full.lines) ||
    !full.lines.length
  )
    return ['invalid-full-buffer'];
  if (pages.length !== Math.ceil(full.lines.length / capacity)) failures.push('page-count');
  const reconstructed: string[] = [];
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    const requested = index * capacity;
    const offset = Math.min(requested, Math.max(0, full.lines.length - capacity));
    if (
      page.scroll !== requested ||
      page.viewport?.offset !== offset ||
      page.viewport?.totalLines !== full.lines.length ||
      page.viewport?.capacity !== capacity ||
      page.terminalRows !== full.terminalRows ||
      page.terminalColumns !== full.terminalColumns
    )
      failures.push(`page-identity:${index}`);
    if (!Array.isArray(page.lines)) {
      failures.push(`page-rows:${index}`);
      continue;
    }
    if (
      JSON.stringify(page.lines) !== JSON.stringify(full.lines.slice(offset, offset + capacity)) ||
      JSON.stringify(page.viewport?.rows) !== JSON.stringify(page.lines)
    )
      failures.push(`page-rows:${index}`);
    if (offset > reconstructed.length) failures.push(`page-gap:${index}`);
    const overlap = Math.max(0, reconstructed.length - offset);
    if (JSON.stringify(reconstructed.slice(offset, offset + overlap)) !== JSON.stringify(page.lines.slice(0, overlap)))
      failures.push(`page-overlap:${index}`);
    reconstructed.push(...page.lines.slice(overlap));
  }
  if (JSON.stringify(reconstructed) !== JSON.stringify(full.lines)) failures.push('reconstruction');
  return failures;
}

if (import.meta.main) {
  const [rootArg, name, checksArg] = process.argv.slice(2);
  if (!rootArg || !name || !checksArg || !/^[\w.-]+$/.test(name))
    throw new Error('Usage: bun inspect-marketplace-viewport.ts <private-root> <new-name> <checks.json>');
  const root = resolve(rootArg);
  assertPrivateCaptureRoot(root);
  const output = join(root, `${name}.jsonl`);
  const summary = join(root, `${name}-summary.json`);
  if (existsSync(output) || existsSync(summary)) throw new Error('Preserve prior inspection; choose a new name');
  const provenance = JSON.parse(readFileSync(join(root, 'ready.json'), 'utf8'));
  const cases = JSON.parse(readFileSync(join(root, 'cases.json'), 'utf8'));
  if (!Array.isArray(cases) || !cases.length) throw new Error('Capture cases are required');
  const checks = JSON.parse(readFileSync(resolve(checksArg), 'utf8'));
  const { visibleWidth } = await import('./agent-validation-runtime/node_modules/@f5-sales-demo/pi-tui/src/index.ts');
  const findings: (ReturnType<typeof inspectCapture> & {
    totalLines: number;
    capacity: number;
    pageOffsets: (number | undefined)[];
  })[] = [];
  let pageCount = 0;
  for (const item of cases) {
    if (!checks[item.id]) throw new Error('Every case requires explicit expectations');
    for (const control of matrixControls(item.id)) {
      const full: NativeBuffer = JSON.parse(readFileSync(join(root, 'frames', `${control.id}.json`), 'utf8'));
      validateCaptureIdentity(full, control, provenance);
      const finding = inspectCapture(full, checks[item.id], visibleWidth);
      const pages: NativeBuffer[] = [];
      const capacity = full.viewport?.capacity;
      if (typeof capacity !== 'number' || !Number.isSafeInteger(capacity) || capacity < 1)
        throw new Error('Invalid viewport capacity');
      for (let scroll = 0; scroll < full.lines.length; scroll += capacity) {
        const pageControl = { ...control, id: `${control.id}-page-${scroll}`, scroll };
        const page = JSON.parse(readFileSync(join(root, 'frames', `${pageControl.id}.json`), 'utf8'));
        validateCaptureIdentity(page, pageControl, provenance);
        pages.push(page);
      }
      finding.failures.push(...inspectViewportPages(full, pages));
      finding.passed = finding.failures.length === 0;
      pageCount += pages.length;
      const result = {
        ...finding,
        totalLines: full.lines.length,
        capacity,
        pageOffsets: pages.map((p) => p.viewport?.offset),
      };
      appendFileSync(output, `${JSON.stringify(result)}\n`, { mode: 0o600 });
      findings.push(result);
    }
  }
  const result = { provenance, frames: findings.length, pages: pageCount, failures: findings.filter((f) => !f.passed) };
  writeFileSync(summary, JSON.stringify(result), { mode: 0o600 });
  console.log(JSON.stringify({ frames: result.frames, pages: pageCount, failures: result.failures.length }));
  if (result.failures.length) process.exitCode = 1;
}
