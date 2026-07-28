import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * MEDDPICC is an industry-standard framework and this repository is public, so the plugin must not
 * carry one company's names in the places a user reads or edits. This is the guard that keeps it
 * that way: it is much easier to reintroduce `viewOfF5` in a schema tweak than to notice it later.
 *
 * The repository's own address is the one legitimate exception. `f5-sales-demo` is where this code
 * lives, so a `$id` or documentation URL containing it is a fact about the project, not branding
 * inside the model.
 */
const pluginRoot = path.join(import.meta.dir, '..');

/**
 * A plain case-insensitive substring, deliberately, and NOT `\bf5\b`.
 *
 * A word boundary looks more careful and is wrong here: the names this guard exists to catch are
 * camelCase, and `\bf5\b` matches none of them — `viewOfF5` has no boundary before the `F`,
 * `f5Owner` none after the `5`. The first version of this test used it and would have passed a
 * schema still full of `viewOfF5`; only the self-check below caught that.
 *
 * Over-broad is the right trade for these files. A false positive costs one line in the exemption
 * below and fails loudly; a false negative is the entire bug being prevented.
 */
const VENDOR = /f5/i;
const ALLOWED_URL = /f5-sales-demo/g;

/** Files whose *content* a user of this plugin reads, edits, or is instructed by. */
const FILES = [
  'schema/meddpicc-schema.json',
  'schema/example-deal.json',
  'engine/workbook-spec.json',
  'README.md',
  ...fs
    .readdirSync(path.join(pluginRoot, 'skills'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => {
      const dir = path.join('skills', e.name);
      const out = [path.join(dir, 'SKILL.md')];
      const refs = path.join(pluginRoot, dir, 'references');
      if (fs.existsSync(refs)) {
        out.push(...fs.readdirSync(refs).map((f) => path.join(dir, 'references', f)));
      }
      return out;
    }),
  ...fs.readdirSync(path.join(pluginRoot, 'commands')).map((f) => path.join('commands', f)),
];

/**
 * Every line of `content` naming the vendor, with the repository's own URL discounted.
 *
 * Split out from the file reading so it can be tested against known text. Left inline, a scanner
 * that silently matched nothing would make the whole sweep pass vacuously, and the only signal
 * would be a suspiciously clean run.
 */
function vendorLinesIn(content: string, label: string): string[] {
  return content
    .split('\n')
    .map((line, i) => ({ line: line.replace(ALLOWED_URL, ''), number: i + 1 }))
    .filter(({ line }) => VENDOR.test(line))
    .map(({ line, number }) => `${label}:${number}: ${line.trim().slice(0, 120)}`);
}

function vendorLines(relativePath: string): string[] {
  const full = path.join(pluginRoot, relativePath);
  if (!fs.existsSync(full)) return [];
  return vendorLinesIn(fs.readFileSync(full, 'utf8'), relativePath);
}

describe('the plugin names no vendor', () => {
  test('the file list actually resolves — an empty sweep would pass vacuously', () => {
    expect(FILES.length).toBeGreaterThan(10);
    for (const f of FILES) expect(fs.existsSync(path.join(pluginRoot, f))).toBe(true);
  });

  test('the scanner reports a violation when there is one to report', () => {
    // The sweep below is only meaningful if this works. A scanner that returned nothing would make
    // it pass on a schema still full of the old names.
    const found = vendorLinesIn('{\n  "viewOfF5": "Positive",\n  "sentiment": "Positive"\n}\n', 'sample.json');
    expect(found).toEqual(['sample.json:2: "viewOfF5": "Positive",']);
  });

  test('a line whose only mention is the repository URL is not reported', () => {
    const line = '  "$id": "https://github.com/f5-sales-demo/marketplace/schema.json",';
    expect(vendorLinesIn(line, 'schema.json')).toEqual([]);
  });

  test('the URL exemption stays narrow — it discounts the address, not the name', () => {
    // Widening this to swallow every mention is the obvious way to silence a false positive, and
    // it would switch the whole guard off without failing anything else.
    const line = '  See https://github.com/f5-sales-demo/marketplace for the F5 owner field.';
    expect(vendorLinesIn(line, 'README.md')).toHaveLength(1);
  });

  test('no schema field, label, or instruction names the vendor', () => {
    const found = FILES.flatMap(vendorLines);
    expect(found).toEqual([]);
  });

  test('the guard is looking for something — it catches every form of the name', () => {
    // Without this a sweep that silently matched nothing would look identical to a clean one, and
    // the camelCase cases are exactly the ones an earlier `\bf5\b` version let through.
    for (const line of [
      '  "viewOfF5": "Positive",',
      '  "f5Owner": "Jane Smith",',
      '  "whyF5": "...",',
      '  "label": "Why F5?"',
      '  "jsonPath": "team.f5"',
      '  Tie guidance to the F5 Distributed Cloud sales context',
    ]) {
      expect(VENDOR.test(line)).toBe(true);
    }
    for (const line of ['  "sentiment": "Positive",', '  "relationshipOwner": "Jane Smith",']) {
      expect(VENDOR.test(line)).toBe(false);
    }
  });

  test('the repository URL is allowed, since that is where this code lives', () => {
    const url = 'https://github.com/f5-sales-demo/marketplace/plugins/meddpicc';
    expect(VENDOR.test(url.replace(ALLOWED_URL, ''))).toBe(false);
  });
});
