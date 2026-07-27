/**
 * Read text out of the template workbook.
 *
 * Only enough of the xlsx format to answer one question: "does this cell already contain
 * words?" That is what separates a label the template owns from a slot meant for deal data,
 * and it is what `check-mappings` uses to refuse a mapping aimed at the wrong cell.
 *
 * Labels live in `xl/sharedStrings.xml` and are referenced by index (`t="s"`), so both
 * parts are needed. Inline strings (`t="inlineStr"`) are read too, since that is the form
 * `fill.ts` writes and a filled workbook should read back correctly.
 */
import { readZip } from './zip';

const SHEET_PART = 'xl/worksheets/sheet1.xml';
const SHARED_STRINGS_PART = 'xl/sharedStrings.xml';

/** All `<si>` entries, flattened — a shared string may be split across `<r>` runs. */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.match(/<si>.*?<\/si>/gs) ?? []) {
    const text = [...si.matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((m) => unescapeXml(m[1])).join('');
    out.push(text);
  }
  return out;
}

const XML_UNESCAPES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function unescapeXml(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_UNESCAPES[m]);
}

/**
 * Build a cell-text lookup over a template's bytes.
 *
 * Returns null for a cell that is absent, empty, or holds a number — none of which is a
 * label. A numeric placeholder like the `0` in `N6` is a legitimate fill target, so it must
 * NOT read as text.
 */
export function readTemplateText(templateBytes: Uint8Array): (address: string) => string | null {
  const entries = readZip(templateBytes);
  const sheet = entries.get(SHEET_PART);
  if (!sheet) throw new Error(`Template is missing ${SHEET_PART}`);
  const sheetXml = new TextDecoder().decode(sheet.data);

  const sharedEntry = entries.get(SHARED_STRINGS_PART);
  const shared = sharedEntry ? parseSharedStrings(new TextDecoder().decode(sharedEntry.data)) : [];

  return (address: string): string | null => {
    const m = sheetXml.match(new RegExp(`<c r="${address}"([^>]*?)(?:/>|>(.*?)</c>)`, 's'));
    if (!m || m[2] === undefined) return null;
    const attrs = m[1];
    const body = m[2];

    if (/\bt="s"/.test(attrs)) {
      const idx = Number(body.match(/<v>(\d+)<\/v>/)?.[1]);
      return Number.isInteger(idx) ? (shared[idx] ?? null) : null;
    }
    if (/\bt="inlineStr"/.test(attrs)) {
      const parts = [...body.matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((x) => unescapeXml(x[1]));
      return parts.length > 0 ? parts.join('') : null;
    }
    // Anything else is a number, a formula result, or empty — not a label.
    return null;
  };
}
