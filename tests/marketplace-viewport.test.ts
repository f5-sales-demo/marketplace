import { describe, expect, test } from 'bun:test';
import { inspectViewportPages } from '../scripts/inspect-marketplace-viewport';

function fixture(length: number, capacity: number) {
  const full = {
    lines: Array.from({ length }, (_, i) => `row ${i}`),
    viewport: { capacity },
    terminalRows: capacity + 2,
    terminalColumns: 160,
  };
  const pages = Array.from({ length: Math.ceil(length / capacity) }, (_, index) => {
    const scroll = index * capacity;
    const offset = Math.min(scroll, Math.max(0, length - capacity));
    const lines = full.lines.slice(offset, offset + capacity);
    return { ...full, scroll, lines, viewport: { capacity, offset, totalLines: length, rows: [...lines] } };
  });
  return { full, pages };
}

describe('native viewport reconstruction', () => {
  test('accepts short, exact and overlapping final pages', () => {
    for (const length of [1, 3, 4, 5, 8, 10]) {
      const { full, pages } = fixture(length, 4);
      expect(inspectViewportPages(full, pages)).toEqual([]);
    }
  });
  test('rejects missing or duplicated pages', () => {
    const { full, pages } = fixture(10, 4);
    expect(inspectViewportPages(full, pages.slice(0, 2))).toContain('page-count');
    expect(inspectViewportPages(full, [pages[0], pages[0], pages[2]])).toContain('page-identity:1');
  });
  test('rejects a lost row and altered overlap', () => {
    const { full, pages } = fixture(10, 4);
    pages[2].lines[0] = 'changed overlap';
    expect(inspectViewportPages(full, pages)).toContain('page-overlap:2');
    pages[1].lines.pop();
    expect(inspectViewportPages(full, pages)).toContain('page-rows:1');
    pages[2].lines.pop();
    expect(inspectViewportPages(full, pages)).toContain('reconstruction');
  });
  test('rejects stale viewport dimensions and inconsistent visible rows', () => {
    const { full, pages } = fixture(5, 4);
    pages[0].terminalRows++;
    pages[1].viewport.rows.pop();
    expect(inspectViewportPages(full, pages)).toContain('page-identity:0');
    expect(inspectViewportPages(full, pages)).toContain('page-rows:1');
  });
  test('rejects invalid full buffers', () => {
    expect(inspectViewportPages({ lines: [], viewport: { capacity: 4 } }, [])).toEqual(['invalid-full-buffer']);
    expect(inspectViewportPages({ lines: ['row'], viewport: { capacity: 0 } }, [])).toEqual(['invalid-full-buffer']);
  });
});
