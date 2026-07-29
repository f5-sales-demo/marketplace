import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateWorkbook, planWorkbook } from './engine/generate';
import { readWorkbook } from './engine/read-workbook';
import { readZip, writeZip } from './engine/zip';

const here = process.cwd();
const schema = JSON.parse(fs.readFileSync(path.join(here, 'schema', 'meddpicc-schema.json'), 'utf8'));
const spec = JSON.parse(fs.readFileSync(path.join(here, 'engine', 'workbook-spec.json'), 'utf8'));
const deal = JSON.parse(fs.readFileSync(path.join(here, 'schema', 'example-deal.json'), 'utf8'));

const plan = planWorkbook(schema, spec, deal);
const elements = plan.tables.find((t) => t.id === 'elements')!;
const col = (n: number) => {
  let s = '';
  while (n > 0) {
    s = String.fromCharCode(64 + ((n - 1) % 26) + 1) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};
const elemCol = col(elements.columns.element);
const scoreCol = col(elements.columns.score);
const first = elements.firstDataRow;
const last = elements.firstDataRow + elements.rows - 1;

let bytes = generateWorkbook(schema, spec, deal);
const entries = readZip(bytes);
let xml = new TextDecoder().decode(entries.get('xl/worksheets/sheet1.xml')!.data);

// Swap the FIRST and LAST element rows the way a person tidying the sheet would: element name and
// score both move.
const cellOf = (ref: string) => new RegExp(`<c r="${ref}"(?: [^>]*?)?(?:/>|>.*?</c>)`).exec(xml)?.[0] ?? '';
const a = { name: cellOf(`${elemCol}${first}`), score: cellOf(`${scoreCol}${first}`) };
const b = { name: cellOf(`${elemCol}${last}`), score: cellOf(`${scoreCol}${last}`) };
const retarget = (cell: string, from: string, to: string) => cell.replace(`r="${from}"`, `r="${to}"`);
xml = xml.replace(a.name, retarget(b.name, `${elemCol}${last}`, `${elemCol}${first}`));
xml = xml.replace(a.score, retarget(b.score, `${scoreCol}${last}`, `${scoreCol}${first}`));
xml = xml.replace(b.name, retarget(a.name, `${elemCol}${first}`, `${elemCol}${last}`));
xml = xml.replace(b.score, retarget(a.score, `${scoreCol}${first}`, `${scoreCol}${last}`));

bytes = writeZip(
  [...entries.values()].map((e) =>
    e.name === 'xl/worksheets/sheet1.xml'
      ? { name: e.name, data: new TextEncoder().encode(xml) }
      : { name: e.name, raw: e },
  ),
);

const report = readWorkbook(schema, spec, deal, bytes);
console.log('rejections:', report.rejections.length, JSON.stringify(report.rejections.slice(0, 3)));
console.log('proposals:', JSON.stringify(report.proposals.map((p) => ({ p: p.jsonPath, from: p.from, to: p.to }))));
console.log('ok:', report.ok);
