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
