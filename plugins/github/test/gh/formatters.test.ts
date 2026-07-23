import { describe, expect, it } from 'bun:test';
import { formatAuthor, formatLabels, formatShortSha, pushLine } from '../../src/gh/formatters';

describe('formatShortSha', () => {
  it('truncates a 40-char sha to the first 12 characters', () => {
    expect(formatShortSha('0123456789abcdef0123456789abcdef01234567')).toBe('0123456789ab');
  });

  it('returns undefined for an empty or missing value', () => {
    expect(formatShortSha(undefined)).toBeUndefined();
    expect(formatShortSha('')).toBeUndefined();
  });
});

describe('formatLabels', () => {
  it('joins non-empty label names with a comma separator', () => {
    expect(formatLabels([{ name: 'bug' }, { name: 'p1' }])).toBe('bug, p1');
  });

  it('returns undefined when there are no usable label names', () => {
    expect(formatLabels(undefined)).toBeUndefined();
    expect(formatLabels([])).toBeUndefined();
    expect(formatLabels([{ name: undefined }])).toBeUndefined();
  });
});

describe('formatAuthor', () => {
  it('prefers the login (prefixed with @), then the name', () => {
    expect(formatAuthor({ login: 'octocat', name: 'The Octocat' })).toBe('@octocat');
    expect(formatAuthor({ name: 'The Octocat' })).toBe('The Octocat');
  });

  it('returns undefined for null or empty authors', () => {
    expect(formatAuthor(null)).toBeUndefined();
    expect(formatAuthor(undefined)).toBeUndefined();
    expect(formatAuthor({})).toBeUndefined();
  });
});

describe('pushLine', () => {
  it('appends a "label: value" line for defined non-empty values', () => {
    const lines: string[] = [];
    pushLine(lines, 'Status', 'completed');
    pushLine(lines, 'Count', 3);
    pushLine(lines, 'Flag', false);
    expect(lines).toEqual(['Status: completed', 'Count: 3', 'Flag: false']);
  });

  it('skips undefined and empty-string values', () => {
    const lines: string[] = [];
    pushLine(lines, 'A', undefined);
    pushLine(lines, 'B', '');
    expect(lines).toEqual([]);
  });
});
