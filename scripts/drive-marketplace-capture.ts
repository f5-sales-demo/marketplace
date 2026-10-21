import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertPrivateCaptureRoot, matrixControls, validateCaptureIdentity } from './marketplace-qualification';

/** Reconstruct framed fields, table cells and contiguous prose with the same terminal style. */
function wrappedValues(lines: string[]) {
  const values: string[] = [];
  let cells: string[][] = [];
  let field: string[] = [];
  let jsonField = false;
  let prose: string[] = [];
  let proseStyle = '';
  let proseRows: number[] = [];
  const proseRuns: { rows: number[]; values: string[] }[] = [];
  const flushProse = () => {
    if (prose.length) {
      const variants = [prose.join(''), prose.join(' ')];
      values.push(...variants);
      proseRuns.push({ rows: proseRows, values: variants });
    }
    prose = [];
    proseRows = [];
    proseStyle = '';
  };
  const flushField = () => {
    if (field.length) values.push(field.join(''), field.join(' '));
    field = [];
    jsonField = false;
  };
  const finishJsonField = () => {
    for (const candidate of [field.join(''), field.join(' ')]) {
      try {
        const value = JSON.parse(candidate.replace(/,$/, ''));
        if (typeof value === 'string') values.push(value);
        flushField();
        return;
      } catch {
        // A wrapped JSON value remains within its own labelled field and frame.
      }
    }
  };
  const flushCells = () => {
    for (const cell of cells) if (cell?.length) values.push(cell.join(''), cell.join(' '));
    cells = [];
  };
  for (const [row, raw] of lines.entries()) {
    const line = Bun.stripANSI(raw);
    // Table rules delimit data rows, including ASCII rules nested in the tool frame.
    if (/[┌├└+][─-]/.test(line)) {
      flushProse();
      flushCells();
      flushField();
      continue;
    }
    const parts = line.split(/[│|]/);
    if (parts.length >= 6) {
      flushProse();
      flushField();
      for (let i = 2; i < parts.length - 2; i++) {
        cells[i] ??= [];
        cells[i].push(parts[i].trim());
      }
      continue;
    }
    flushCells();
    // The shared fields renderer uses bold labels. A new label closes the previous field.
    const boldStart = raw.indexOf('\x1b[1m');
    const boldEnd = raw.indexOf('\x1b[22m:', boldStart + 4);
    const label = boldStart >= 0 && boldEnd > boldStart && !raw.slice(boldStart + 4, boldEnd).includes('\x1b');
    const body = line
      .replace(/^\s*[│|]\s*/, '')
      .replace(/[│|]\s*$/, '')
      .replace(/^[│|]\s*/, '')
      .trim();
    const jsonLabel = parts.length === 3 ? /^"(?:\\.|[^"\\])+":\s*(.*)$/.exec(body) : null;
    // Prose continuations must remain in one outer frame and retain their SGR prefix.
    // Blank rows, fields, JSON, rules and style changes delimit unrelated output.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Match terminal SGR sequences in native capture rows.
    const prefix = raw.split(/[│|]/)[1]?.match(/^(?:\s|\x1b\[[\d;]*m)*/)?.[0] ?? '';
    const style = prefix.replace(/\s/g, '');
    if (
      parts.length === 3 &&
      body &&
      style &&
      !raw.includes('\x1b[1m') &&
      !jsonField &&
      !jsonLabel &&
      !/^[{[\]}"',]/.test(body)
    ) {
      if (style !== proseStyle) flushProse();
      proseStyle = style;
      prose.push(body);
      proseRows.push(row);
    } else flushProse();
    if (jsonLabel) {
      flushField();
      if (!jsonLabel[1] || jsonLabel[1].startsWith('"')) {
        field = [jsonLabel[1]];
        jsonField = true;
        finishJsonField();
      }
    } else if (jsonField && parts.length === 3 && body) {
      field.push(body);
      finishJsonField();
    } else if (label) {
      flushField();
      field = [body.slice(body.indexOf(':') + 1).trim()];
    } else if (field.length && parts.length === 4 && body) field.push(body);
    else flushField();
  }
  flushProse();
  flushCells();
  flushField();
  return { values, proseRuns };
}

export function inspectCapture(frame: any, expected: any, visibleWidth: (line: string) => number) {
  const failures: string[] = [];
  const text = Bun.stripANSI(frame.lines.join('\n'));
  const { values, proseRuns } = wrappedValues(frame.lines);
  const proseRows = new Set(proseRuns.flatMap((run) => run.rows));
  const outsideProse = Bun.stripANSI(
    frame.lines.filter((_line: string, row: number) => !proseRows.has(row)).join('\n'),
  );
  if (!frame.lines.length) failures.push('empty-frame');
  if (frame.lines.some((line: string) => visibleWidth(line) > frame.width)) failures.push('overflow');
  if (frame.resultIsError !== Boolean(expected.expectedError)) failures.push('unexpected-outcome');
  for (const literal of [
    ...(expected.contains ?? []),
    ...(frame.expanded ? (expected.expandedContains ?? []) : (expected.collapsedContains ?? [])),
  ])
    if (!text.includes(literal) && !values.some((value) => value.includes(literal)))
      failures.push('missing-literal:' + literal);
  for (const literal of expected.absent ?? [])
    if (text.includes(literal) || values.some((value) => value.includes(literal)))
      failures.push('unexpected-literal:' + literal);
  const occurrences = {
    ...expected.occurrences,
    ...(frame.expanded ? expected.expandedOccurrences : expected.collapsedOccurrences),
  };
  for (const [literal, count] of Object.entries(occurrences)) {
    if (!literal || !Number.isInteger(count) || (count as number) < 0) throw new Error('Invalid occurrence check');
    const actual =
      outsideProse.split(literal).length -
      1 +
      proseRuns.reduce(
        (total, run) => total + Math.max(...run.values.map((value) => value.split(literal).length - 1)),
        0,
      );
    if (actual !== count) failures.push('unexpected-occurrences:' + literal);
  }
  if ([text, ...values].some((value) => /SYNTHETIC_SECRET_SENTINEL/.test(value))) failures.push('unsafe-evidence');
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
