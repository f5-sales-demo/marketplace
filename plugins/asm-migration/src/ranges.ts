export function regexForRange(minimum: number, maximum: number): string {
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum < 0 || maximum < minimum) {
    throw new Error('range must satisfy 0 <= minimum <= maximum');
  }
  const patterns: string[] = [];
  let start = minimum;
  for (const stop of splitRanges(minimum, maximum)) {
    patterns.push(rangePattern(start, stop));
    start = stop + 1;
  }
  return `(?:${patterns.join('|')})`;
}

export function regexesOutsideRange(minimum: number, maximum: number): string[] {
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum < 0 || maximum < minimum) {
    throw new Error('range must satisfy 0 <= minimum <= maximum');
  }
  const patterns = ['.*[^0-9].*', '0[0-9]+'];
  const minimumText = String(minimum);
  const maximumText = String(maximum);
  if (minimum > 0) {
    if (minimumText.length > 1) {
      patterns.push('0');
      patterns.push(minimumText.length === 2 ? '[1-9]' : `[1-9][0-9]{0,${minimumText.length - 2}}`);
    }
    patterns.push(...fixedWidthBelow(minimumText));
  }
  patterns.push(...fixedWidthAbove(maximumText));
  patterns.push(`[1-9][0-9]{${maximumText.length},}`);
  return chunkAlternatives([...new Set(patterns)]);
}

function digitSpan(low: number, high: number): string {
  return low === high ? String(low) : `[${low}-${high}]`;
}

function digitTail(length: number): string {
  if (length === 0) return '';
  return length === 1 ? '[0-9]' : `[0-9]{${length}}`;
}

function fixedWidthBelow(bound: string): string[] {
  const patterns: string[] = [];
  for (let index = 0; index < bound.length; index += 1) {
    const high = Number(bound[index]) - 1;
    const low = index === 0 && bound.length > 1 ? 1 : 0;
    if (high < low) continue;
    patterns.push(`${bound.slice(0, index)}${digitSpan(low, high)}${digitTail(bound.length - index - 1)}`);
  }
  return patterns;
}

function fixedWidthAbove(bound: string): string[] {
  const patterns: string[] = [];
  for (let index = 0; index < bound.length; index += 1) {
    const low = Number(bound[index]) + 1;
    if (low > 9) continue;
    patterns.push(`${bound.slice(0, index)}${digitSpan(low, 9)}${digitTail(bound.length - index - 1)}`);
  }
  return patterns;
}

function chunkAlternatives(patterns: string[]): string[] {
  const expressions: string[] = [];
  let current: string[] = [];
  for (const pattern of patterns) {
    const candidate = `^(?:${[...current, pattern].join('|')})$`;
    if (candidate.length > 256 && current.length) {
      expressions.push(`^(?:${current.join('|')})$`);
      current = [pattern];
    } else current.push(pattern);
  }
  if (current.length) expressions.push(`^(?:${current.join('|')})$`);
  if (expressions.length > 16 || expressions.some((expression) => expression.length > 256)) {
    throw new Error('range complement exceeds XC regex limits');
  }
  return expressions;
}

function splitRanges(minimum: number, maximum: number): number[] {
  const stops = new Set<number>([maximum]);
  let nines = 1;
  let prefix = String(minimum).slice(0, -nines);
  let stop = Number(`${prefix}${'9'.repeat(nines)}`);
  while (minimum <= stop && stop < maximum) {
    stops.add(stop);
    nines += 1;
    prefix = String(minimum).slice(0, -nines);
    stop = Number(`${prefix}${'9'.repeat(nines)}`);
  }
  let zeros = 1;
  stop = maximum - (maximum % 10 ** zeros) - 1;
  while (minimum < stop && stop < maximum) {
    stops.add(stop);
    zeros += 1;
    stop = maximum - (maximum % 10 ** zeros) - 1;
  }
  return [...stops].sort((a, b) => a - b);
}

function rangePattern(start: number, stop: number): string {
  if (String(start).length !== String(stop).length) throw new Error('internal range split crossed a digit boundary');
  let pattern = '';
  let anyDigits = 0;
  for (let index = 0; index < String(start).length; index += 1) {
    const low = String(start)[index] ?? '';
    const high = String(stop)[index] ?? '';
    if (low === high) pattern += low;
    else if (low !== '0' || high !== '9') pattern += `[${low}-${high}]`;
    else anyDigits += 1;
  }
  if (anyDigits) pattern += anyDigits === 1 ? '\\d' : `\\d{${anyDigits}}`;
  return pattern;
}
