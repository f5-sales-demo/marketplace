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
    const updated = xml.replace(new RegExp(`<c r="${address}"(?: [^>]*)?(?:/>|>.*?</c>)`), cellXml);
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
