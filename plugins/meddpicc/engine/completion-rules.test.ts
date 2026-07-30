import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { computeCompletion } from './completion';
import { evaluate, SECTION_RULES, statusOf } from './completion-rules';
import { QUALIFICATION_ELEMENTS, SECTION_ORDER } from './sections';

const example = JSON.parse(fs.readFileSync(path.join(import.meta.dir, '..', 'schema', 'example-deal.json'), 'utf8'));

/**
 * Today's rules, frozen, as the oracle this refactor is measured against.
 *
 * The point of the predicate language is that the SAME rule can be read by the engine and compiled
 * into a formula — which is only worth anything if the engine's answers do not move on the way. So
 * this is a verbatim copy of `completion.ts` as it stood before, and every case below asks both
 * implementations the same question.
 *
 * It is deliberately duplicated rather than imported: an oracle that shares code with the thing it
 * checks agrees with it by construction.
 */
type Deal = Record<string, unknown>;
const nonEmptyString = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;
const hasNonEmptyResponse = (responses: unknown): boolean => Array.isArray(responses) && responses.some(nonEmptyString);

function legacyQualStatus(el: Record<string, unknown> | undefined): string {
  if (!el) return 'not_started';
  const score = typeof el.score === 'number' ? el.score : 0;
  const responses = hasNonEmptyResponse(el.responses);
  const evidence = nonEmptyString(el.evidence);
  if (score >= 3 && responses && evidence) return 'complete';
  if (score === 0 && !responses && !evidence) return 'not_started';
  return 'partial';
}

function legacyCompletion(deal: unknown): Record<string, string> {
  const d = (deal ?? {}) as Deal;
  const qualification = (d.qualification ?? {}) as Record<string, Record<string, unknown>>;
  const status: Record<string, string> = {};
  for (const el of QUALIFICATION_ELEMENTS) status[el] = legacyQualStatus(qualification[el]);

  const tw = d.threeWhys as { us?: Record<string, unknown> } | undefined;
  if (!tw?.us) {
    status.threeWhys = 'not_started';
  } else {
    const us = tw.us;
    const all = nonEmptyString(us.whyAnything) && nonEmptyString(us.whyUs) && nonEmptyString(us.whyNow);
    const any = nonEmptyString(us.whyAnything) || nonEmptyString(us.whyUs) || nonEmptyString(us.whyNow);
    status.threeWhys = all ? 'complete' : any ? 'partial' : 'not_started';
  }

  const list = d.stakeholders;
  if (!Array.isArray(list) || list.length === 0) {
    status.stakeholders = 'not_started';
  } else {
    const complete = list.every(
      (s) =>
        nonEmptyString((s as Record<string, unknown>).name) &&
        nonEmptyString((s as Record<string, unknown>).title) &&
        nonEmptyString((s as Record<string, unknown>).roleInDeal),
    );
    status.stakeholders = complete ? 'complete' : 'partial';
  }

  const ss = d.salesStrategy as Record<string, unknown> | undefined;
  if (!ss) {
    status.salesStrategy = 'not_started';
  } else {
    const dvp = nonEmptyString(ss.differentiatedValueProposition);
    const win = nonEmptyString(ss.winStrategy);
    status.salesStrategy = dvp && win ? 'complete' : dvp || win ? 'partial' : 'not_started';
  }

  const cp = d.closePlan as { milestones?: unknown; criticalActions?: unknown } | undefined;
  if (!cp) {
    status.closePlan = 'not_started';
  } else {
    const m = Array.isArray(cp.milestones) && cp.milestones.length > 0;
    const a = Array.isArray(cp.criticalActions) && cp.criticalActions.length > 0;
    status.closePlan = m && a ? 'complete' : m || a ? 'partial' : 'not_started';
  }

  const team = d.team as { internal?: unknown; partner?: unknown } | undefined;
  if (!team) {
    status.team = 'not_started';
  } else {
    const internal = Array.isArray(team.internal) && team.internal.length > 0;
    const partner = Array.isArray(team.partner) && team.partner.length > 0;
    status.team = internal ? 'complete' : partner ? 'partial' : 'not_started';
  }

  return status;
}

/** Both implementations, asked the same question about one deal. */
const agree = (deal: unknown, what: string) => {
  const legacy = legacyCompletion(deal);
  const now = computeCompletion(deal).completionStatus as Record<string, string>;
  for (const section of SECTION_ORDER) {
    expect(now[section], `${what}: ${section}`).toBe(legacy[section]);
  }
};

/** A deal carrying one element, so the element rule can be swept on its own. */
const withElement = (element: string, value: unknown) => ({ qualification: { [element]: value } });

describe('the completion rules answer exactly what the old implementation answered', () => {
  test('every combination an element rule can see', () => {
    // Exhaustive rather than random: the element rule reads three fields with small input spaces, so
    // all 96 combinations fit in a test and there is nothing left for a seed to miss. The absent and
    // whitespace cases are the ones that matter — `score` missing reads as 0, and a cell holding a
    // space is empty to every rule that consults it.
    const scores = [undefined, 0, 1, 2, 3, 4];
    const responses = [undefined, [], [''], ['   '], ['x'], ['', 'x']];
    const evidences = [undefined, '', '   ', 'x'];
    let checked = 0;
    for (const score of scores) {
      for (const response of responses) {
        for (const evidence of evidences) {
          agree(
            withElement('metrics', { score, responses: response, evidence }),
            `metrics ${JSON.stringify({ score, response, evidence })}`,
          );
          checked++;
        }
      }
    }
    expect(checked).toBe(scores.length * responses.length * evidences.length);
  });

  test('an element that is absent, null, or not an object at all', () => {
    for (const value of [undefined, null, 'nonsense', 42, []]) {
      agree(withElement('champion', value), `champion ${JSON.stringify(value)}`);
    }
    agree({}, 'an empty deal');
    agree({ qualification: null }, 'a null qualification');
    agree(null, 'no deal at all');
  });

  test('every combination the three whys can see', () => {
    agree({ threeWhys: undefined }, 'no threeWhys');
    agree({ threeWhys: {} }, 'threeWhys with no us');
    for (const whyAnything of ['', 'x']) {
      for (const whyUs of ['', 'x']) {
        for (const whyNow of ['', 'x']) {
          agree({ threeWhys: { us: { whyAnything, whyUs, whyNow } } }, `whys ${whyAnything}${whyUs}${whyNow}`);
        }
      }
    }
  });

  test('every shape the stakeholder list can take', () => {
    const full = { name: 'A', title: 'B', roleInDeal: 'C' };
    for (const list of [
      undefined,
      [],
      'not a list',
      [full],
      [full, full],
      [{ ...full, title: '' }],
      [full, { ...full, roleInDeal: '  ' }],
      [{}],
    ]) {
      agree({ stakeholders: list }, `stakeholders ${JSON.stringify(list)}`);
    }
  });

  test('every combination the sales strategy can see', () => {
    agree({ salesStrategy: undefined }, 'no salesStrategy');
    for (const differentiatedValueProposition of ['', 'x']) {
      for (const winStrategy of ['', 'x']) {
        agree(
          { salesStrategy: { differentiatedValueProposition, winStrategy } },
          `strategy ${differentiatedValueProposition}${winStrategy}`,
        );
      }
    }
  });

  test('every combination the close plan can see', () => {
    agree({ closePlan: undefined }, 'no closePlan');
    for (const milestones of [undefined, [], [{}]]) {
      for (const criticalActions of [undefined, [], [{}]]) {
        agree({ closePlan: { milestones, criticalActions } }, `closePlan ${!!milestones}${!!criticalActions}`);
      }
    }
  });

  test('every combination the team can see', () => {
    agree({ team: undefined }, 'no team');
    for (const internal of [undefined, [], [{}]]) {
      for (const partner of [undefined, [], [{}]]) {
        agree({ team: { internal, partner } }, `team ${!!internal}${!!partner}`);
      }
    }
  });

  test('the shipped example and a stripped copy of it', () => {
    agree(example, 'the example deal');
    const stripped = JSON.parse(JSON.stringify(example));
    for (const element of QUALIFICATION_ELEMENTS) {
      delete stripped.qualification[element].score;
      stripped.qualification[element].evidence = '';
    }
    agree(stripped, 'the example with every score and evidence removed');
  });
});

describe('the predicates themselves', () => {
  test('a rule exists for every section, and each has both halves', () => {
    // A section with no rule would silently read as not_started — the same answer a genuinely
    // untouched section gives, so nothing would look wrong.
    expect(Object.keys(SECTION_RULES).sort()).toEqual([...SECTION_ORDER].sort());
    for (const section of SECTION_ORDER) {
      expect(SECTION_RULES[section].complete, section).toBeDefined();
      expect(SECTION_RULES[section].started, section).toBeDefined();
    }
  });

  test('nonEmpty treats whitespace as empty', () => {
    expect(evaluate({ kind: 'nonEmpty', path: 'a' }, { a: 'x' })).toBe(true);
    expect(evaluate({ kind: 'nonEmpty', path: 'a' }, { a: '   ' })).toBe(false);
    expect(evaluate({ kind: 'nonEmpty', path: 'a' }, {})).toBe(false);
    // A number is not text, and the fields this asks about are text. Reading 0 as "filled in" would
    // make a score of 0 satisfy a rule about evidence.
    expect(evaluate({ kind: 'nonEmpty', path: 'a' }, { a: 0 })).toBe(false);
  });

  test('atLeast reads a missing number as zero', () => {
    expect(evaluate({ kind: 'atLeast', path: 'a', value: 3 }, { a: 3 })).toBe(true);
    expect(evaluate({ kind: 'atLeast', path: 'a', value: 3 }, { a: 2 })).toBe(false);
    expect(evaluate({ kind: 'atLeast', path: 'a', value: 1 }, {})).toBe(false);
    expect(evaluate({ kind: 'atLeast', path: 'a', value: 0 }, {})).toBe(true);
    expect(evaluate({ kind: 'atLeast', path: 'a', value: 1 }, { a: 'three' })).toBe(false);
  });

  test('anyNonEmpty asks about the entries, not the array', () => {
    expect(evaluate({ kind: 'anyNonEmpty', list: 'a' }, { a: ['', 'x'] })).toBe(true);
    expect(evaluate({ kind: 'anyNonEmpty', list: 'a' }, { a: ['', '  '] })).toBe(false);
    expect(evaluate({ kind: 'anyNonEmpty', list: 'a' }, { a: [] })).toBe(false);
    expect(evaluate({ kind: 'anyNonEmpty', list: 'a' }, {})).toBe(false);
  });

  test('countAtLeast counts entries, and everyEntryHas checks their fields', () => {
    const two = { a: [{ n: 'x' }, { n: '' }] };
    expect(evaluate({ kind: 'countAtLeast', list: 'a', value: 2 }, two)).toBe(true);
    expect(evaluate({ kind: 'countAtLeast', list: 'a', value: 3 }, two)).toBe(false);
    expect(evaluate({ kind: 'countAtLeast', list: 'a', value: 1 }, { a: 'not a list' })).toBe(false);
    expect(evaluate({ kind: 'everyEntryHas', list: 'a', fields: ['n'] }, two)).toBe(false);
    expect(evaluate({ kind: 'everyEntryHas', list: 'a', fields: ['n'] }, { a: [{ n: 'x' }] })).toBe(true);
    // Vacuously true on an empty list, which is why every rule that uses it also asks for a count.
    expect(evaluate({ kind: 'everyEntryHas', list: 'a', fields: ['n'] }, { a: [] })).toBe(true);
  });

  test('all and any over nothing are true and false', () => {
    expect(evaluate({ kind: 'all', of: [] }, {})).toBe(true);
    expect(evaluate({ kind: 'any', of: [] }, {})).toBe(false);
  });

  test('a section with no rule fails loudly rather than reading as untouched', () => {
    // not_started is a real answer for a real section, so a missing rule returning it would look
    // exactly like a deal nobody had started — the one wrong answer that raises no question.
    expect(() => statusOf('nonesuch', {})).toThrow(/nonesuch/);
  });

  test('a predicate kind that does not exist fails loudly', () => {
    // The rules are TypeScript, so this is unreachable by mistake — but an evaluator that returned
    // false for an unknown kind would turn a typo into a section that is never complete.
    expect(() => evaluate({ kind: 'sometimes' } as never, {})).toThrow(/sometimes/);
  });
});
