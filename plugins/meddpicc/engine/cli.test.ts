import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const engineDir = import.meta.dir;
const example = path.join(engineDir, '..', 'schema', 'example-deal.json');

/**
 * A scratch directory per run. Every `read --apply` test writes a deal, so each needs its own
 * copy — and none of them may touch a real deal file, which is edited by a person.
 */
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'meddpicc-cli-'));
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

/** A private copy of the example deal, and a workbook generated from it. */
async function fixture(name: string): Promise<{ deal: string; workbook: string }> {
  const deal = path.join(scratch, `${name}.json`);
  const workbook = path.join(scratch, `${name}.xlsx`);
  fs.copyFileSync(example, deal);
  const { code } = await run(['generate', deal, '--out', workbook]);
  expect(code).toBe(0);
  return { deal, workbook };
}

/** A copy of the example deal with every field put back to its retired name. */
function legacyDeal(name: string): string {
  const deal = JSON.parse(fs.readFileSync(example, 'utf8'));
  deal.metadata.revenue.pAndIplusAcvx = deal.metadata.revenue.subscription;
  delete deal.metadata.revenue.subscription;
  deal.threeWhys.f5 = deal.threeWhys.us;
  delete deal.threeWhys.us;
  deal.threeWhys.f5.whyF5 = deal.threeWhys.f5.whyUs;
  delete deal.threeWhys.f5.whyUs;
  for (const s of deal.stakeholders) {
    s.viewOfF5 = s.sentiment;
    delete s.sentiment;
    s.f5Owner = s.relationshipOwner;
    delete s.relationshipOwner;
  }
  deal.team.f5 = deal.team.internal;
  delete deal.team.internal;
  const at = path.join(scratch, `${name}.json`);
  fs.writeFileSync(at, `${JSON.stringify(deal, null, 2)}\n`);
  return at;
}

async function run(args: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(['bun', path.join(engineDir, 'cli.ts'), ...args], { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  return { code, out };
}

describe('cli', () => {
  test('score', async () => {
    const { code, out } = await run(['score', example]);
    expect(code).toBe(0);
    const r = JSON.parse(out);
    expect(r.sum).toBe(21);
    expect(r.overallScore).toBe(65.6);
    expect(r.overallRating).toBe('Yellow');
  });
  test('next', async () => {
    const { out } = await run(['next', example]);
    expect(JSON.parse(out).nextIncompleteSection).toBe('decisionProcess');
  });
  test('validate', async () => {
    const { code, out } = await run(['validate', example]);
    expect(code).toBe(0);
    expect(JSON.parse(out).valid).toBe(true);
  });
  test('check-sfdc', async () => {
    const { code, out } = await run(['check-sfdc']);
    expect(code).toBe(0);
    const r = JSON.parse(out);
    expect(r.ok).toBe(true);
    expect(r.checked).toBeGreaterThan(0);
  });
  test('fill is gone, and asking for it fails rather than doing something else', async () => {
    expect((await run(['fill', example])).code).toBe(1);
  });
  test('unknown command exits non-zero', async () => {
    const { code } = await run(['bogus', example]);
    expect(code).toBe(1);
  });
  test('hint (overview) lists 8 elements', async () => {
    const { code, out } = await run(['hint']);
    expect(code).toBe(0);
    expect(JSON.parse(out).elements.length).toBe(8);
  });
  test('hint <element> returns questions + rubric', async () => {
    const { code, out } = await run(['hint', 'metrics']);
    expect(code).toBe(0);
    const h = JSON.parse(out);
    expect(h.questions.length).toBe(2);
    expect(Object.keys(h.scoreDefinition)).toEqual(['0', '1', '2', '3', '4']);
  });
  test('hint bogus exits non-zero', async () => {
    const { code } = await run(['hint', 'bogus']);
    expect(code).toBe(1);
  });
  test('next embeds the current-section hint', async () => {
    const { out } = await run(['next', example]);
    const r = JSON.parse(out);
    expect(r.nextIncompleteSection).toBe('decisionProcess');
    expect(r.hint?.element).toBe('decisionProcess');
    expect(r.hint?.questions.length).toBeGreaterThan(0);
  });
});

describe('cli read', () => {
  /** Retype one cell in a workbook on disk, the way a person would in Excel. */
  async function retype(workbook: string, address: string, cellXml: string): Promise<void> {
    const { readZip, writeZip } = await import('./zip');
    const entries = readZip(new Uint8Array(await Bun.file(workbook).arrayBuffer()));
    const part = [...entries.keys()].find((name) => {
      if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) return false;
      return new RegExp(`<c r="${address}"`).test(
        new TextDecoder().decode(entries.get(name)?.data ?? new Uint8Array()),
      );
    });
    if (!part) throw new Error(`no sheet holds ${address}`);
    const xml = new TextDecoder().decode(entries.get(part)?.data as Uint8Array);
    // Lazy attributes: greedy, the run eats the `/` of a self-closing cell and the replacement
    // swallows everything up to the next `</c>`. See the same pattern in read-workbook.test.ts.
    const updated = xml.replace(new RegExp(`<c r="${address}"(?: [^>]*?)?(?:/>|>.*?</c>)`), cellXml);
    await Bun.write(
      workbook,
      writeZip(
        [...entries.values()].map((e) =>
          e.name === part ? { name: e.name, data: new TextEncoder().encode(updated) } : { name: e.name, raw: e },
        ),
      ),
    );
  }

  /** Where the generator put a jsonPath, asked of the plan rather than guessed. */
  async function addressOf(deal: string, jsonPath: string): Promise<string> {
    const { code, out } = await run(['generate', deal, '--plan']);
    expect(code).toBe(0);
    const found = (JSON.parse(out).inputCells as Array<{ jsonPath: string; address: string }>).find(
      (c) => c.jsonPath === jsonPath,
    );
    if (!found) throw new Error(`no input cell for ${jsonPath}`);
    return found.address;
  }

  test('an untouched workbook proposes nothing and exits 0', async () => {
    const { deal, workbook } = await fixture('untouched');
    const { code, out } = await run(['read', workbook, '--deal', deal]);
    expect(code).toBe(0);
    const report = JSON.parse(out);
    expect(report.proposals).toEqual([]);
    expect(report.rejections).toEqual([]);
    expect(report.applied).toBe(false);
  });

  test('read without --deal exits 1', async () => {
    const { workbook } = await fixture('nodeal');
    expect((await run(['read', workbook])).code).toBe(1);
  });

  test('an edit is proposed, and without --apply the deal on disk is untouched', async () => {
    const { deal, workbook } = await fixture('propose');
    const before = fs.readFileSync(deal, 'utf8');
    const address = await addressOf(deal, 'metadata.accountName');
    await retype(workbook, address, `<c r="${address}" t="inlineStr"><is><t>Globex</t></is></c>`);

    const { code, out } = await run(['read', workbook, '--deal', deal]);
    expect(code).toBe(0);
    const report = JSON.parse(out);
    expect(report.proposals).toHaveLength(1);
    expect(report.applied).toBe(false);
    expect(fs.readFileSync(deal, 'utf8')).toBe(before);
  });

  test('--apply writes the change, and the result still validates', async () => {
    const { deal, workbook } = await fixture('apply');
    const address = await addressOf(deal, 'metadata.accountName');
    await retype(workbook, address, `<c r="${address}" t="inlineStr"><is><t>Globex</t></is></c>`);

    const { code, out } = await run(['read', workbook, '--deal', deal, '--apply']);
    expect(code).toBe(0);
    expect(JSON.parse(out).applied).toBe(true);
    expect(JSON.parse(fs.readFileSync(deal, 'utf8')).metadata.accountName).toBe('Globex');
    expect((await run(['validate', deal])).code).toBe(0);
  });

  test('a rejected cell fails the run and writes nothing, even with --apply', async () => {
    const { deal, workbook } = await fixture('reject');
    const before = fs.readFileSync(deal, 'utf8');
    const address = await addressOf(deal, 'qualification.champion.score');
    await retype(workbook, address, `<c r="${address}"><v>7</v></c>`);

    const { code, out } = await run(['read', workbook, '--deal', deal, '--apply']);
    expect(code).toBe(1);
    const report = JSON.parse(out);
    expect(report.rejections).toHaveLength(1);
    expect(report.applied).toBe(false);
    expect(fs.readFileSync(deal, 'utf8')).toBe(before);
  });

  test('read refuses a spec that does not check out, as generate does', async () => {
    // Reading leans on the spec: a column claiming both a formula and a jsonPath would have the
    // reader take a computed value as somebody's answer.
    const { deal, workbook } = await fixture('badspec');
    const spec = JSON.parse(fs.readFileSync(path.join(engineDir, 'workbook-spec.json'), 'utf8'));
    const table = spec.sheets
      .flatMap((s: { blocks: Array<{ kind: string; table?: unknown }> }) => s.blocks)
      .filter((b: { kind: string }) => b.kind === 'table')
      .map((b: { table: unknown }) => b.table)
      .find(Boolean) as { columns: Array<Record<string, unknown>> };
    if (!table) throw new Error('no table block in the spec to spoil');
    table.columns[0] = { ...table.columns[0], role: 'computed', formula: '1', jsonPath: 'name' };
    const badSpec = path.join(scratch, 'bad-spec.json');
    fs.writeFileSync(badSpec, JSON.stringify(spec));

    const { code, out } = await run(['read', workbook, '--deal', deal, '--spec', badSpec]);
    expect(code).toBe(1);
    expect(JSON.parse(out).ok).toBe(false);
  });

  test('applying twice is a no-op the second time', async () => {
    const { deal, workbook } = await fixture('idempotent');
    const address = await addressOf(deal, 'metadata.accountName');
    await retype(workbook, address, `<c r="${address}" t="inlineStr"><is><t>Globex</t></is></c>`);

    expect(JSON.parse((await run(['read', workbook, '--deal', deal, '--apply'])).out).applied).toBe(true);
    const second = JSON.parse((await run(['read', workbook, '--deal', deal, '--apply'])).out);
    expect(second.proposals).toEqual([]);
    expect(second.applied).toBe(false);
  });
});

describe('cli migrate', () => {
  test('a deal using retired field names is refused by validate, generate and read', async () => {
    // The schema tolerates them silently, so refusing is the only thing standing between an old
    // file and a workbook full of blanks where its answers used to be.
    const deal = legacyDeal('refused');
    const workbook = path.join(scratch, 'refused.xlsx');
    expect((await run(['validate', deal])).code).toBe(1);
    expect((await run(['generate', deal, '--out', workbook])).code).toBe(1);
    expect(fs.existsSync(workbook)).toBe(false);

    // `read` needs a workbook to be handed, so build one from a current deal and read it against
    // the legacy one: the refusal must come before any cell is compared.
    const current = await fixture('refused-current');
    expect((await run(['read', current.workbook, '--deal', deal])).code).toBe(1);
  });

  test('next and score refuse a legacy deal too, not just validate', async () => {
    // `next` drives the qualification workflow. Reading a legacy deal it finds no `threeWhys.us`
    // and no `team.internal`, so it would report two completed sections as not_started and send
    // the user back through them with no hint that anything was wrong.
    const deal = legacyDeal('refused-next');
    expect((await run(['next', deal])).code).toBe(1);
    expect((await run(['score', deal])).code).toBe(1);
  });

  test('a conflicting deal is refused and never half-applied', async () => {
    const deal = legacyDeal('conflict');
    const parsed = JSON.parse(fs.readFileSync(deal, 'utf8'));
    parsed.threeWhys.us = { whyNow: 'partly filled in by hand' };
    fs.writeFileSync(deal, `${JSON.stringify(parsed, null, 2)}\n`);
    const before = fs.readFileSync(deal, 'utf8');

    const { code, out } = await run(['migrate', deal, '--apply']);
    expect(code).toBe(1);
    const report = JSON.parse(out);
    expect(report.conflicts.length).toBeGreaterThan(0);
    expect(report.applied).toBe(false);
    expect(fs.readFileSync(deal, 'utf8')).toBe(before);
  });

  test('migrate lists what it would change and writes nothing', async () => {
    const deal = legacyDeal('dry');
    const before = fs.readFileSync(deal, 'utf8');
    const { code, out } = await run(['migrate', deal]);
    expect(code).toBe(0);
    const report = JSON.parse(out);
    expect(report.applied).toBe(false);
    expect(report.changes.length).toBeGreaterThan(0);
    expect(report.changes).toContain('team.f5 → team.internal');
    expect(fs.readFileSync(deal, 'utf8')).toBe(before);
  });

  test('--apply moves every value, and the result then validates and generates', async () => {
    const deal = legacyDeal('applied');
    const original = JSON.parse(fs.readFileSync(deal, 'utf8'));
    expect((await run(['migrate', deal, '--apply'])).code).toBe(0);

    const after = JSON.parse(fs.readFileSync(deal, 'utf8'));
    // Values, not just key names: a rename that lost the value would still look renamed.
    expect(after.threeWhys.us.whyUs).toBe(original.threeWhys.f5.whyF5);
    expect(after.stakeholders[0].sentiment).toBe(original.stakeholders[0].viewOfF5);
    expect(after.stakeholders[0].relationshipOwner).toBe(original.stakeholders[0].f5Owner);
    expect(after.team.internal).toEqual(original.team.f5);
    expect(after.metadata.revenue.subscription).toBe(original.metadata.revenue.pAndIplusAcvx);

    expect((await run(['validate', deal])).code).toBe(0);
    expect((await run(['generate', deal, '--out', path.join(scratch, 'applied.xlsx')])).code).toBe(0);
  });

  test('migrating an already-current deal reports nothing and writes nothing', async () => {
    const { deal } = await fixture('current');
    const before = fs.readFileSync(deal, 'utf8');
    const { code, out } = await run(['migrate', deal, '--apply']);
    expect(code).toBe(0);
    const report = JSON.parse(out);
    expect(report.changes).toEqual([]);
    expect(report.applied).toBe(false);
    expect(fs.readFileSync(deal, 'utf8')).toBe(before);
  });

  test('migrate without a deal exits 1', async () => {
    expect((await run(['migrate'])).code).toBe(1);
  });
});
