#!/usr/bin/env bun
import * as fs from 'node:fs';
import * as path from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import { computeCompletion } from './completion';
import { generateWorkbook, planWorkbook } from './generate';

/**
 * What built the workbook, recorded in the file.
 *
 * Read from the PLUGIN's package.json, which `test_versions_match` compares against `plugin.json`
 * and `marketplace.json` — so the number here is the one the release actually publishes. The
 * engine's own package.json was the obvious choice and the wrong one: that file was not covered by
 * the gate, so it could drift and the workbook would record a version nobody shipped.
 */
const ENGINE_VERSION: string = (pkg as { version: string }).version;

import { computeElementHint, computeHintOverview } from './hint';
import { migrateDeal } from './legacy';
import { checkSfdcMapping } from './mappings';
import { readWorkbook } from './read-workbook';
import { computeScore } from './score';
import { QUALIFICATION_ELEMENTS } from './sections';
import { validateDeal } from './validate';
import { checkWorkbookSpec, type WorkbookSpec } from './workbook-spec';

/**
 * Resolve the plugin root by walking up from this file until we find the
 * schema. Robust to where the engine directory sits relative to the plugin
 * root, rather than assuming a fixed `../` depth.
 */
function findPluginRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'schema', 'meddpicc-schema.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: original assumption (source layout) so error messages stay sensible.
  return path.join(start, '..');
}

const PLUGIN_ROOT = findPluginRoot(import.meta.dir);
const SCHEMA_PATH = path.join(PLUGIN_ROOT, 'schema', 'meddpicc-schema.json');
const SFDC_PATH = path.join(PLUGIN_ROOT, 'skills', 'deal-qualification', 'references', 'sfdc-field-mapping.json');
const WORKBOOK_SPEC_PATH = path.join(PLUGIN_ROOT, 'engine', 'workbook-spec.json');

async function readJson(p: string): Promise<unknown> {
  return JSON.parse(await Bun.file(p).text());
}

function print(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/**
 * Refuse a deal that still uses the retired field names.
 *
 * The schema constrains no additional properties, so an old file validates cleanly while its
 * values sit unreachable — the workbook would show blanks and scoring would ignore them. Better to
 * stop and say which fields, exactly as the workbook stamp refuses a workbook from another deal.
 */
function refuseLegacyDeal(deal: unknown, dealPath: string): number | null {
  const { changes, resolved, conflicts } = migrateDeal(deal);
  if (changes.length === 0 && resolved.length === 0 && conflicts.length === 0) return null;
  process.stderr.write(
    `${dealPath} uses field names this plugin has retired. Their values would be ignored rather than read.\n` +
      (conflicts.length > 0
        ? 'Some fields are set under BOTH names; resolve those by hand first, then migrate.\n'
        : `Run: cli.ts migrate ${dealPath} --apply\n`),
  );
  print({ ok: false, legacyFields: changes, resolved, conflicts });
  return 1;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === 'validate' || command === 'next' || command === 'score') {
    const dealPath = rest[0];
    if (!dealPath) {
      process.stderr.write(`Usage: cli.ts ${command} <deal.json>\n`);
      return 1;
    }
    const deal = await readJson(dealPath);
    // Before `score` and `next`, not just `validate`: `computeCompletion` reads `threeWhys.us` and
    // `team.internal`, so on an unmigrated deal `next` would call two finished sections
    // not_started and walk the user back through them without a word.
    const legacyBlock = refuseLegacyDeal(deal, dealPath);
    if (legacyBlock !== null) return legacyBlock;
    if (command === 'score') {
      print(computeScore(deal));
      return 0;
    }
    if (command === 'next') {
      const result = computeCompletion(deal);
      const next = result.nextIncompleteSection;
      const hint =
        next && QUALIFICATION_ELEMENTS.includes(next) ? computeElementHint(await readJson(SCHEMA_PATH), next) : null;
      print({ ...result, hint });
      return 0;
    }
    const schema = await readJson(SCHEMA_PATH);
    const result = validateDeal(deal, schema);
    print(result);
    return result.valid ? 0 : 1;
  }

  if (command === 'hint') {
    const schema = await readJson(SCHEMA_PATH);
    const element = rest[0];
    if (!element) {
      print(computeHintOverview(schema));
      return 0;
    }
    try {
      print(computeElementHint(schema, element));
      return 0;
    } catch (e) {
      process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
      return 1;
    }
  }

  if (command === 'check-sfdc') {
    const schema = await readJson(flag(rest, '--schema') ?? SCHEMA_PATH);
    const sfdc = await readJson(flag(rest, '--sfdc') ?? SFDC_PATH);
    const result = checkSfdcMapping(schema, sfdc);
    print(result);
    return result.ok ? 0 : 1;
  }

  if (command === 'generate') {
    const dealPath = rest[0];
    if (!dealPath) {
      process.stderr.write(
        'Usage: cli.ts generate <deal.json> [--out <file.xlsx>] [--plan] [--prose-heights] [--spec <workbook-spec.json>]\n',
      );
      return 1;
    }
    const schema = await readJson(SCHEMA_PATH);
    const spec = (await readJson(flag(rest, '--spec') ?? WORKBOOK_SPEC_PATH)) as WorkbookSpec;
    const deal = await readJson(dealPath);

    // Refuse before writing rather than producing a plausible-looking workbook from bad
    // input. A mistyped jsonPath becomes an empty cell and a wrong type becomes a blank
    // one, and either reads as "that field is not filled in yet" instead of "the spec is
    // broken". Both checks are cheap and deterministic, so there is no reason to skip them.
    const legacy = refuseLegacyDeal(deal, dealPath);
    if (legacy !== null) return legacy;

    const specCheck = checkWorkbookSpec(schema, spec);
    if (!specCheck.ok) {
      process.stderr.write('Refusing to generate: the workbook spec does not check out.\n');
      print(specCheck);
      return 1;
    }
    const dealCheck = validateDeal(deal, schema);
    if (!dealCheck.valid) {
      process.stderr.write(`Refusing to generate: ${dealPath} does not validate against the schema.\n`);
      print(dealCheck);
      return 1;
    }

    // Every prose cell, the width its height was computed against, and the height that row ended up
    // with. Only Excel can say whether a computed height is enough — it autofits a wrapped cell but
    // not a merged one, and nearly every prose cell here is merged — so the acceptance test copies
    // each string into a scratch cell of the same width, autofits it, and compares.
    if (rest.includes('--prose-heights')) {
      const plan = planWorkbook(schema, spec, deal);
      const heightOf = new Map<string, number>();
      for (const sheet of plan.sheets) {
        for (const row of sheet.rows) heightOf.set(`${sheet.name}!${row.row}`, row.height ?? 0);
      }
      const withNewlines = plan.proseCells.filter((c) => c.text.includes('\n'));
      for (const cell of plan.proseCells) {
        // A tab-separated line, text last, so a shell can read it field by field. A text containing a
        // newline would break that, and measuring a mangled copy of it would be worse than not
        // measuring it — so those are reported on stderr and left out.
        if (cell.text.includes('\n')) continue;
        const height = heightOf.get(`${cell.sheet}!${cell.row}`) ?? 0;
        process.stdout.write(`${cell.address}\t${cell.width}\t${height}\t${cell.text}\n`);
      }
      if (withNewlines.length > 0) {
        process.stderr.write(
          `${withNewlines.length} prose cell(s) contain a newline and were not reported: ` +
            `${withNewlines.map((c) => c.address).join(', ')}\n`,
        );
      }
      return 0;
    }

    // `--plan` reports where every input landed without writing a file — that map is what
    // the round-trip reader consumes, so being able to inspect it is worth a flag.
    if (rest.includes('--plan')) {
      const plan = planWorkbook(schema, spec, deal);
      print({
        sheets: plan.sheets.map((s) => ({ name: s.name, rows: s.rows.length })),
        namedCells: plan.namedCells,
        // Where each table landed. Nothing on one laid-out sheet has a fixed address, so anything
        // that needs to name a cell of a table — the Excel acceptance test above all — reads it from
        // here rather than counting rows and hoping the count still holds.
        tables: plan.tables,
        inputCells: plan.inputCells,
      });
      return 0;
    }

    const outPath = flag(rest, '--out');
    if (!outPath) {
      process.stderr.write('generate needs --out <file.xlsx> (or --plan to inspect the layout)\n');
      return 1;
    }
    await Bun.write(outPath, generateWorkbook(schema, spec, deal, ENGINE_VERSION));
    const plan = planWorkbook(schema, spec, deal);
    print({ out: outPath, sheets: plan.sheets.length, inputCells: plan.inputCells.length });
    return 0;
  }

  if (command === 'read') {
    const workbookPath = rest[0];
    const dealPath = flag(rest, '--deal');
    if (!workbookPath || !dealPath) {
      process.stderr.write('Usage: cli.ts read <workbook.xlsx> --deal <deal.json> [--apply]\n');
      return 1;
    }
    const schema = await readJson(SCHEMA_PATH);
    const spec = (await readJson(flag(rest, '--spec') ?? WORKBOOK_SPEC_PATH)) as WorkbookSpec;
    const deal = await readJson(dealPath);
    const legacy = refuseLegacyDeal(deal, dealPath);
    if (legacy !== null) return legacy;

    // `generate` refuses a spec that does not check out; so must this. Reading leans on the spec
    // being well-formed — a column claiming both a formula and a jsonPath would have the reader
    // take a computed value as somebody's answer, which is the one thing it must never do.
    const specCheck = checkWorkbookSpec(schema, spec);
    if (!specCheck.ok) {
      process.stderr.write('Refusing to read: the workbook spec does not check out.\n');
      print(specCheck);
      return 1;
    }

    const bytes = new Uint8Array(await Bun.file(workbookPath).arrayBuffer());
    const report = readWorkbook(schema, spec, deal, bytes);

    // The deal JSON is the source of truth, so the default is to say what the workbook
    // proposes and change nothing. `--apply` is the only path that writes, and it writes only
    // a deal that validates — a partly-applied file would be worse than no file.
    const apply = rest.includes('--apply') && report.ok && report.proposals.length > 0;
    if (apply) await Bun.write(dealPath, `${JSON.stringify(report.deal, null, 2)}\n`);

    print({
      workbook: workbookPath,
      deal: dealPath,
      cellsRead: report.cellsRead,
      unchanged: report.unchanged,
      proposals: report.proposals,
      rejections: report.rejections,
      // Not refusals: things worth knowing, such as the schema having moved since the workbook was
      // generated. Omitted when there is nothing to say, so quiet output stays quiet.
      ...(report.notes.length > 0 ? { notes: report.notes } : {}),
      valid: report.valid,
      errors: report.errors,
      applied: apply,
    });
    if (rest.includes('--apply') && !report.ok) {
      process.stderr.write('Refusing to apply: fix the cells listed above, or edit the JSON directly.\n');
    }
    return report.ok ? 0 : 1;
  }

  if (command === 'migrate') {
    const dealPath = rest[0];
    if (!dealPath) {
      process.stderr.write('Usage: cli.ts migrate <deal.json> [--apply]\n');
      return 1;
    }
    const deal = await readJson(dealPath);
    const { deal: migrated, changes, resolved, conflicts } = migrateDeal(deal);

    // Same posture as `read`: say what would change and write nothing unless asked — and write
    // nothing at all while a field is set under both names, since applying the rest would leave a
    // half-migrated file whose remaining conflict is easy to miss.
    const apply = rest.includes('--apply') && changes.length + resolved.length > 0 && conflicts.length === 0;
    if (apply) await Bun.write(dealPath, `${JSON.stringify(migrated, null, 2)}\n`);

    const schema = await readJson(SCHEMA_PATH);
    const check = validateDeal(migrated, schema);
    print({ deal: dealPath, changes, resolved, conflicts, applied: apply, valid: check.valid, errors: check.errors });
    if (conflicts.length > 0) {
      process.stderr.write('Refusing to migrate: resolve the fields listed above, then run this again.\n');
      return 1;
    }
    return check.valid ? 0 : 1;
  }

  if (command === 'check-spec') {
    const schema = await readJson(flag(rest, '--schema') ?? SCHEMA_PATH);
    const spec = (await readJson(flag(rest, '--spec') ?? WORKBOOK_SPEC_PATH)) as WorkbookSpec;
    const result = checkWorkbookSpec(schema, spec);
    print(result);
    return result.ok ? 0 : 1;
  }

  process.stderr.write(
    `Unknown command: ${command ?? '(none)'}\nCommands: validate, next, score, hint, generate, read, migrate, check-sfdc, check-spec\n`,
  );
  return 1;
}

process.exit(await main());
