import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateWorkbook } from './generate';
import type { WorkbookSpec } from './workbook-spec';
import { readZip, writeZip } from './zip';

const here = import.meta.dir;
const schema = JSON.parse(fs.readFileSync(path.join(here, '..', 'schema', 'meddpicc-schema.json'), 'utf8'));
const spec = JSON.parse(fs.readFileSync(path.join(here, 'workbook-spec.json'), 'utf8')) as WorkbookSpec;
const deal = JSON.parse(fs.readFileSync(path.join(here, '..', 'schema', 'example-deal.json'), 'utf8'));

/** A tiny zip built by the writer itself, used to exercise the reader. */
function roundTrip(files: Array<{ name: string; text: string }>): Map<string, Uint8Array> {
  const entries = readZip(writeZip(files.map((f) => ({ name: f.name, data: new TextEncoder().encode(f.text) }))));
  return new Map([...entries].map(([k, v]) => [k, v.data]));
}

const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe('zip round trip', () => {
  test('reads back every entry it wrote', () => {
    const out = roundTrip([
      { name: 'a.txt', text: 'hello' },
      { name: 'nested/dir/b.xml', text: '<x/>' },
    ]);
    expect([...out.keys()].sort()).toEqual(['a.txt', 'nested/dir/b.xml']);
    expect(dec(out.get('a.txt') as Uint8Array)).toBe('hello');
    expect(dec(out.get('nested/dir/b.xml') as Uint8Array)).toBe('<x/>');
  });

  test('survives content that compresses badly and content that compresses well', () => {
    const random = Array.from({ length: 4000 }, (_, i) => String.fromCharCode(32 + ((i * 7919) % 94))).join('');
    const repetitive = 'A'.repeat(20_000);
    const out = roundTrip([
      { name: 'r.bin', text: random },
      { name: 'z.bin', text: repetitive },
    ]);
    expect(dec(out.get('r.bin') as Uint8Array)).toBe(random);
    expect(dec(out.get('z.bin') as Uint8Array)).toBe(repetitive);
  });

  test('preserves UTF-8 beyond ASCII', () => {
    const text = 'Visa — “control” · £1,421,060 · naïve';
    const out = roundTrip([{ name: 'u.txt', text }]);
    expect(dec(out.get('u.txt') as Uint8Array)).toBe(text);
  });

  test('an empty entry survives', () => {
    const out = roundTrip([{ name: 'empty.txt', text: '' }]);
    expect(out.has('empty.txt')).toBe(true);
    expect(dec(out.get('empty.txt') as Uint8Array)).toBe('');
  });
});

describe('reading a real xlsx', () => {
  // A workbook we generate, rather than one we ship. The archive is a genuine multi-part,
  // deflated xlsx — which is all these tests need — and the alternative was carrying F5's own
  // Deal Review Sheet in the repository purely as a test fixture.
  const workbook = () => generateWorkbook(schema, spec, deal);

  test('opens a generated workbook and finds every part Excel requires', () => {
    const entries = readZip(workbook());
    for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
      expect(entries.has(part)).toBe(true);
    }
    expect(dec(entries.get('xl/workbook.xml')?.data as Uint8Array)).toContain('Scorecard');
  });

  test('rewriting one part leaves every other part byte-identical', () => {
    // Untouched entries are copied as their ORIGINAL compressed bytes, never re-deflated, so
    // rewriting one part of an archive cannot perturb the others even by a byte. The round-trip
    // reader's own test helpers stand on this when they simulate an edit in Excel.
    const original = workbook();
    const before = readZip(original);
    const rebuilt = readZip(
      writeZip(
        [...before].map(([name, e]) =>
          name === 'xl/worksheets/sheet1.xml'
            ? { name, data: new TextEncoder().encode('<worksheet/>') }
            : { name, raw: e },
        ),
      ),
    );
    expect([...rebuilt.keys()]).toEqual([...before.keys()]);
    for (const [name, e] of before) {
      if (name === 'xl/worksheets/sheet1.xml') continue;
      // The COMPRESSED bytes, not the decompressed ones. Comparing decompressed content
      // passes even when the writer re-deflates, so it proves nothing about the copy
      // guarantee — a mutation that re-deflated every entry slipped straight through an
      // earlier version of this assertion.
      expect(Buffer.from(rebuilt.get(name)?.compressed as Uint8Array).equals(Buffer.from(e.compressed))).toBe(true);
      expect(rebuilt.get(name)?.crc32).toBe(e.crc32);
      expect(rebuilt.get(name)?.method).toBe(e.method);
      // …and the content still decodes to the same thing, so a "preserved" entry is not
      // merely identical garbage.
      expect(Buffer.from(rebuilt.get(name)?.data as Uint8Array).equals(Buffer.from(e.data))).toBe(true);
    }
    expect(dec(rebuilt.get('xl/worksheets/sheet1.xml')?.data as Uint8Array)).toBe('<worksheet/>');
  });

  test('the rebuilt archive is still structurally sound', () => {
    // Structural sanity the reader alone cannot prove: local headers, the central directory
    // and the EOCD all have to agree or Excel refuses the file.
    const original = workbook();
    const rebuilt = writeZip([...readZip(original)].map(([name, e]) => ({ name, raw: e })));
    const again = readZip(rebuilt);
    expect(again.size).toBe(readZip(original).size);
    expect(dec(again.get('xl/workbook.xml')?.data as Uint8Array)).toContain('Scorecard');
  });
});
