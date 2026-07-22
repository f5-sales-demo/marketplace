#!/usr/bin/env bun
import * as fs from 'node:fs';
import * as path from 'node:path';
import { computeCompletion } from './completion';
import { checkMappings } from './mappings';
import { computeScore } from './score';
import { validateDeal } from './validate';

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
const CELL_PATH = path.join(PLUGIN_ROOT, 'skills', 'deal-qualification', 'references', 'cell-mapping.json');
const SFDC_PATH = path.join(PLUGIN_ROOT, 'skills', 'deal-qualification', 'references', 'sfdc-field-mapping.json');

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

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === 'validate' || command === 'next' || command === 'score') {
    const dealPath = rest[0];
    if (!dealPath) {
      process.stderr.write(`Usage: cli.ts ${command} <deal.json>\n`);
      return 1;
    }
    const deal = await readJson(dealPath);
    if (command === 'score') {
      print(computeScore(deal));
      return 0;
    }
    if (command === 'next') {
      print(computeCompletion(deal));
      return 0;
    }
    const schema = await readJson(SCHEMA_PATH);
    const result = validateDeal(deal, schema);
    print(result);
    return result.valid ? 0 : 1;
  }

  if (command === 'check-mappings') {
    const schema = await readJson(flag(rest, '--schema') ?? SCHEMA_PATH);
    const cell = await readJson(flag(rest, '--cell') ?? CELL_PATH);
    const sfdc = await readJson(flag(rest, '--sfdc') ?? SFDC_PATH);
    const result = checkMappings(schema, cell, sfdc);
    print(result);
    return result.ok ? 0 : 1;
  }

  process.stderr.write(`Unknown command: ${command ?? '(none)'}\nCommands: validate, next, score, check-mappings\n`);
  return 1;
}

process.exit(await main());
