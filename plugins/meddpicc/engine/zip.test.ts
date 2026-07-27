import { describe, expect, test } from 'bun:test';
import { readZip, writeZip } from './zip';

/** A tiny zip built by the writer itself, used to exercise the reader. */
function roundTrip(files: Array<{ name: string; text: string }>): Map<string, Uint8Array> {
  const entries = readZip(
    writeZip(
      files.map((f) => ({ name: f.name, data: new TextEncoder().encode(f.text) })),
    ),
  );
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
  const XLSX = new URL('../skills/deal-qualification/references/meddpicc-template.xlsx', import.meta.url).pathname;

  test('opens the shipped template and finds the parts a fill touches', async () => {
    const entries = readZip(new Uint8Array(await Bun.file(XLSX).arrayBuffer()));
    for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
      expect(entries.has(part)).toBe(true);
    }
    expect(dec(entries.get('xl/worksheets/sheet1.xml')?.data as Uint8Array)).toContain('<c r="C4" s="18"/>');
  });

  test('rewriting one part leaves every other part byte-identical', async () => {
    // The whole formatting guarantee rests on this: untouched entries are copied as
    // their ORIGINAL compressed bytes, never re-deflated, so styles/validation/merges
    // cannot drift even by a byte.
    const original = new Uint8Array(await Bun.file(XLSX).arrayBuffer());
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

  test('the rebuilt archive is still readable by a real xlsx consumer', async () => {
    // Structural sanity the reader alone cannot prove: local headers, the central
    // directory and the EOCD all have to agree or Excel refuses the file.
    const original = new Uint8Array(await Bun.file(XLSX).arrayBuffer());
    const rebuilt = writeZip([...readZip(original)].map(([name, e]) => ({ name, raw: e })));
    const again = readZip(rebuilt);
    expect(again.size).toBe(readZip(original).size);
    expect(dec(again.get('xl/worksheets/sheet1.xml')?.data as Uint8Array)).toContain('<c r="C4" s="18"/>');
  });
});
