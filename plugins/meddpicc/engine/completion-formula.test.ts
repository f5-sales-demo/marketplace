import { describe, expect, test } from 'bun:test';
import { cellResolver, compilePredicate, compileStatus } from './completion-formula';
import type { Predicate } from './completion-rules';
import { SECTION_RULES } from './completion-rules';
import type { InputCell } from './generate';
import { statusLabel } from './sections';

/** Input cells the way the plan reports them, for a sheet laid out the way the shipped one is. */
const SHEET = 'Deal Review';
const inputs = (entries: Array<[string, string]>): InputCell[] =>
  entries.map(([jsonPath, address]) => ({ jsonPath, sheet: SHEET, address, valueType: 'string' }));

/** A resolver for formulas living on the same sheet as their cells, which is the shipped workbook. */
const resolverFor = (cells: InputCell[]) => cellResolver(cells, SHEET);

/**
 * Two stakeholder rows with every column the rule names.
 *
 * All eight, not a convenient three: the rule counts a row as an entry when any of its declared fields
 * is filled in, and asking the sheet for a column it does not have is a generation error by design. A
 * short fixture would have been testing a workbook that cannot exist.
 */
const stakeholderCells = inputs(
  [0, 1].flatMap((row) => [
    [`stakeholders[${row}].name`, `B${56 + row}`] as [string, string],
    [`stakeholders[${row}].title`, `D${56 + row}`] as [string, string],
    [`stakeholders[${row}].roleInDeal`, `G${56 + row}`] as [string, string],
    [`stakeholders[${row}].mustSayYes`, `I${56 + row}`] as [string, string],
    [`stakeholders[${row}].canSayNo`, `J${56 + row}`] as [string, string],
    [`stakeholders[${row}].whatTheyNeedToBelieve`, `K${56 + row}`] as [string, string],
    [`stakeholders[${row}].sentiment`, `O${56 + row}`] as [string, string],
    [`stakeholders[${row}].relationshipOwner`, `P${56 + row}`] as [string, string],
  ]),
);

describe('cellResolver — what a deal path is on the sheet', () => {
  test('a scalar path is the one cell that holds it', () => {
    const resolve = resolverFor(inputs([['threeWhys.us.whyNow', 'B51']]));
    expect(resolve.cell('threeWhys.us.whyNow')).toBe('$B$51');
  });

  test('an array of text is the range of its cells', () => {
    const resolve = resolverFor(
      inputs([
        ['qualification.metrics.responses[0]', 'I30'],
        ['qualification.metrics.responses[1]', 'I31'],
      ]),
    );
    expect(resolve.range('qualification.metrics.responses')).toBe('$I$30:$I$31');
  });

  test("a list's columns come back in layout order, and each field has its own range", () => {
    // Every column, because a row is an entry when ANY of them is filled in — the engine counts an
    // entry with no name, and the schema permits one. Read from the addresses rather than from the
    // spec, so moving a column moves this with it.
    const resolve = resolverFor(stakeholderCells);
    expect(resolve.allRanges('stakeholders')).toEqual([
      '$B$56:$B$57',
      '$D$56:$D$57',
      '$G$56:$G$57',
      '$I$56:$I$57',
      '$J$56:$J$57',
      '$K$56:$K$57',
      '$O$56:$O$57',
      '$P$56:$P$57',
    ]);
    expect(resolve.fieldRange('stakeholders', 'title')).toBe('$D$56:$D$57');
  });

  test('a cell on another sheet is named with its sheet', () => {
    // The workbook is one laid-out sheet today, so a bare address is right — and a spec with two sheets
    // passes `check-spec`, at which point a bare `$D$20` on the Completion sheet means whatever happens
    // to be at D20 THERE. Excel evaluates that without complaint. So the sheet is part of the reference
    // whenever it differs, exactly as a `{{ref:…}}` formula already qualifies one.
    const cells = [
      { jsonPath: 'qualification.metrics.score', sheet: 'Qualification', address: 'D20', valueType: 'score' as const },
      { jsonPath: 'threeWhys.us.whyNow', sheet: 'Completion', address: 'B51', valueType: 'text' as const },
    ];
    const onCompletion = cellResolver(cells, 'Completion');
    expect(onCompletion.cell('qualification.metrics.score')).toBe('Qualification!$D$20');
    // ...and a cell on the formula's own sheet stays bare, which keeps every existing formula unchanged.
    expect(onCompletion.cell('threeWhys.us.whyNow')).toBe('$B$51');
  });

  test('a sheet name needing quotes gets them, and an apostrophe in one is doubled', () => {
    const cells = [
      { jsonPath: 'a', sheet: "Bob's Deal Review", address: 'D20', valueType: 'string' as const },
      { jsonPath: 'b', sheet: 'Plain', address: 'D21', valueType: 'string' as const },
    ];
    const resolve = cellResolver(cells, 'Elsewhere');
    expect(resolve.cell('a')).toBe("'Bob''s Deal Review'!$D$20");
    expect(resolve.cell('b')).toBe('Plain!$D$21');
  });

  test('a path the sheet does not show refuses to resolve', () => {
    // A rule naming a field with no cell would otherwise compile to a formula referring to nothing,
    // which Excel shows as a status of #NAME? in the middle of a review.
    const resolve = resolverFor(inputs([['threeWhys.us.whyNow', 'B51']]));
    expect(() => resolve.cell('threeWhys.us.whyUs')).toThrow(/whyUs/);
    expect(() => resolve.range('qualification.metrics.responses')).toThrow(/responses/);
    expect(() => resolve.allRanges('stakeholders')).toThrow(/stakeholders/);
    expect(() => resolve.fieldRange('stakeholders', 'title')).toThrow(/title/);
  });

  test('every address is absolute, so a filled row cannot drag the rule sideways', () => {
    const resolve = resolverFor(stakeholderCells);
    for (const ref of [resolve.cell('stakeholders[0].name'), ...resolve.allRanges('stakeholders')]) {
      expect(ref.startsWith('$'), ref).toBe(true);
    }
  });
});

describe('compileStatus — the same rule, as a formula', () => {
  const elementCells = inputs([
    ['qualification.metrics.score', 'D20'],
    ['qualification.metrics.evidence', 'H20'],
    ['qualification.metrics.responses[0]', 'I30'],
    ['qualification.metrics.responses[1]', 'I31'],
  ]);

  test('an element asks about its score, its answers and its evidence', () => {
    const formula = compileStatus(SECTION_RULES.metrics, resolverFor(elementCells));
    // The three things the engine's rule reads, and the bar it reads them against.
    expect(formula).toContain('$D$20');
    expect(formula).toContain('$H$20');
    expect(formula).toContain('$I$30:$I$31');
    expect(formula).toContain('>=3');
    // Trimmed, because the engine trims: a cell holding a space is empty to it.
    expect(formula).toContain('TRIM');
  });

  test('it returns the words the sheet shows, not the words the JSON holds', () => {
    // The completion column is coloured by matching those words, and the scorecard COUNTIFs them. A
    // formula answering "complete" where the cell used to read "Complete" is a colour that never
    // appears and a count that stays at zero.
    const formula = compileStatus(SECTION_RULES.metrics, resolverFor(elementCells));
    expect(formula).toContain(`"${statusLabel('complete')}"`);
    expect(formula).toContain(`"${statusLabel('partial')}"`);
    expect(formula).toContain(`"${statusLabel('not_started')}"`);
    expect(formula).not.toContain('"complete"');
    expect(formula).not.toContain('"not_started"');
  });

  test('complete is asked first, so a complete section never reads as partial', () => {
    const formula = compileStatus(SECTION_RULES.metrics, resolverFor(elementCells));
    expect(formula.indexOf(`"${statusLabel('complete')}"`)).toBeLessThan(
      formula.indexOf(`"${statusLabel('partial')}"`),
    );
  });

  test('a row counts as an entry when ANY of its fields is filled in, not just the first', () => {
    // The engine counts entries in the array. A stakeholder with a role and no name is an entry to it,
    // and the schema permits one — so counting only the leftmost column made the sheet say not_started
    // where the engine said complete. Every column of the list has to be consulted.
    const formula = compileStatus(SECTION_RULES.stakeholders, resolverFor(stakeholderCells));
    for (const range of ['$B$56:$B$57', '$D$56:$D$57', '$G$56:$G$57']) {
      expect(formula, range).toContain(range);
    }
    // Summed across the columns and then tested, so a row with two fields filled counts once.
    expect(formula).toContain('>0))>=1');
  });

  test('the whitespace Excel keeps is removed before the comparison', () => {
    // Excel's TRIM takes ordinary spaces only. JavaScript's trim() also takes tabs, newlines and
    // non-breaking spaces — so a value pasted from a web page reads as filled to Excel and empty to the
    // engine, and the sheet would call an element complete on evidence the engine cannot see.
    const formula = compileStatus(SECTION_RULES.metrics, resolverFor(elementCells));
    // CLEAN takes every control character — tab, newline, carriage return — and the non-breaking space
    // is the one it leaves behind, so that one is substituted first.
    expect(formula).toContain('CLEAN(');
    expect(formula).toContain('CHAR(160)');
  });

  test('the count consults the fields the rule names, not every column the sheet has', () => {
    // Today the two coincide, so nothing else here can tell them apart. They are the same by
    // construction, not by luck: a column the rule does not name is a column the engine does not read,
    // and counting it would put the two readers back into disagreement.
    const withExtra = [
      ...stakeholderCells,
      ...inputs([
        ['stakeholders[0].somethingTheRuleIgnores', 'Z56'],
        ['stakeholders[1].somethingTheRuleIgnores', 'Z57'],
      ]),
    ];
    const formula = compileStatus(SECTION_RULES.stakeholders, resolverFor(withExtra));
    expect(formula).toContain('$B$56:$B$57');
    expect(formula).not.toContain('$Z$56');
  });

  test('a score cell is read the way the reader reads it', () => {
    // Two ways to get this wrong. A bare `$D$20>=3` is TRUE for a cell holding "four", because Excel
    // sorts text above every number. And `N("3")` is 0, while the round-trip reader accepts a textual
    // "3" and applies it as 3 — so a pasted score would show 3 on the sheet, leave the status partial,
    // and then change meaning on read-back. VALUE reads it as the reader does, and IFERROR keeps a blank
    // or a word at nought, as the engine does.
    const formula = compileStatus(SECTION_RULES.metrics, resolverFor(elementCells));
    expect(formula).toContain('IFERROR(VALUE($D$20),0)>=3');
    expect(formula).not.toContain('N($D$20)');
  });

  test('a field is only required of a row somebody has started', () => {
    // Without the started factor the pre-allocated blank rows count as entries missing a title, and the
    // section can never be complete — a list with room to grow would read as permanently unfinished.
    const formula = compileStatus(SECTION_RULES.stakeholders, resolverFor(stakeholderCells));
    // Each field's term is "rows that are started AND lack this field" = 0.
    expect(formula).toContain(')>0)*(TRIM(CLEAN(SUBSTITUTE($D$56:$D$57,CHAR(160)," ")))=""))=0');
  });

  test('a list section counts entries and checks their fields', () => {
    const formula = compileStatus(SECTION_RULES.stakeholders, resolverFor(stakeholderCells));
    // At least one entry...
    expect(formula).toContain('$B$56:$B$57');
    // ...and no started row missing a title or a role.
    expect(formula).toContain('$D$56:$D$57');
    expect(formula).toContain('$G$56:$G$57');
    expect(formula).toContain('SUMPRODUCT');
  });

  test('every shipped rule compiles against the shipped layout', () => {
    // The point of the small vocabulary: if a rule cannot be expressed over cells, that is a fact
    // worth learning here rather than from a #VALUE! in front of a customer.
    const resolve = resolverFor([
      ...elementCells,
      ...stakeholderCells,
      ...inputs([
        ['threeWhys.us.whyAnything', 'B49'],
        ['threeWhys.us.whyUs', 'B50'],
        ['threeWhys.us.whyNow', 'B51'],
        ['salesStrategy.differentiatedValueProposition', 'B68'],
        ['salesStrategy.winStrategy', 'J68'],
        // Every field each rule names, since a rule asking for a column the sheet lacks fails by design.
        ['closePlan.milestones[0].description', 'B74'],
        ['closePlan.milestones[0].targetDate', 'F74'],
        ['closePlan.milestones[0].status', 'H74'],
        ['closePlan.criticalActions[0].action', 'J74'],
        ['closePlan.criticalActions[0].owner', 'M74'],
        ['closePlan.criticalActions[0].dueDate', 'O74'],
        ['closePlan.criticalActions[0].status', 'Q74'],
        ['team.internal[0].name', 'B86'],
        ['team.internal[0].role', 'D86'],
        ['team.internal[0].dateRequiredFrom', 'F86'],
        ['team.internal[0].assignedToDeal', 'H86'],
        ['team.partner[0].name', 'J86'],
        ['team.partner[0].role', 'L86'],
        ['team.partner[0].dateRequiredFrom', 'N86'],
        ['team.partner[0].assignedToDeal', 'P86'],
      ]),
    ]);
    for (const section of ['metrics', 'threeWhys', 'stakeholders', 'salesStrategy', 'closePlan', 'team']) {
      const formula = compileStatus(SECTION_RULES[section], resolve);
      expect(formula.length, section).toBeGreaterThan(0);
      expect(formula, section).not.toContain('undefined');
    }
  });

  test('all is AND and any is OR, which is the difference between complete and started', () => {
    // Swapped, a section would read complete as soon as any one of its conditions held — and the
    // formula would still look perfectly reasonable. Everything else in this suite matches on the
    // cells a formula names, so nothing else here would notice.
    const resolve = resolverFor(elementCells);
    const two: Predicate[] = [
      { kind: 'nonEmpty', path: 'qualification.metrics.evidence' },
      { kind: 'atLeast', path: 'qualification.metrics.score', value: 3 },
    ];
    expect(compilePredicate({ kind: 'all', of: two }, resolve).startsWith('AND(')).toBe(true);
    expect(compilePredicate({ kind: 'any', of: two }, resolve).startsWith('OR(')).toBe(true);
    // Excel has no AND() of nothing, and the identities are the right way round.
    expect(compilePredicate({ kind: 'all', of: [] }, resolve)).toBe('TRUE');
    expect(compilePredicate({ kind: 'any', of: [] }, resolve)).toBe('FALSE');
  });

  test('a predicate the compiler does not know fails loudly', () => {
    expect(() =>
      compileStatus(
        { complete: { kind: 'whenever' } as never, started: { kind: 'any', of: [] } },
        resolverFor(elementCells),
      ),
    ).toThrow(/whenever/);
  });
});
