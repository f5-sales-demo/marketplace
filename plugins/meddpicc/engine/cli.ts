#!/usr/bin/env bun
import * as fs from 'node:fs';
import * as path from 'node:path';
import { computeCompletion } from './completion';
import { generateWorkbook, planWorkbook } from './generate';
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
        'Usage: cli.ts generate <deal.json> [--out <file.xlsx>] [--plan] [--spec <workbook-spec.json>]\n',
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

    // `--plan` reports where every input landed without writing a file — that map is what
    // the round-trip reader consumes, so being able to inspect it is worth a flag.
    if (rest.includes('--plan')) {
      const plan = planWorkbook(schema, spec, deal);
      print({
        sheets: plan.sheets.map((s) => ({ name: s.name, rows: s.rows.length })),
        namedCells: plan.namedCells,
        inputCells: plan.inputCells,
      });
      return 0;
    }

    const outPath = flag(rest, '--out');
    if (!outPath) {
      process.stderr.write('generate needs --out <file.xlsx> (or --plan to inspect the layout)\n');
      return 1;
    }
    await Bun.write(outPath, generateWorkbook(schema, spec, deal));
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
