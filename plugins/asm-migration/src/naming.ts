import { createHash } from 'node:crypto';

export const OBJECT_NAME_LIMIT = 63;

export function dnsLabel(value: string, limit = OBJECT_NAME_LIMIT): string {
  let normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!normalized) normalized = 'policy';
  if (/^[0-9]/.test(normalized)) normalized = `p-${normalized}`;
  if (normalized.length <= limit) return normalized;
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 10);
  return `${normalized.slice(0, limit - digest.length - 1).replace(/-+$/g, '')}-${digest}`;
}

export function uniqueRuleNames(values: string[]): string[] {
  const seen = new Map<string, number>();
  return values.map((value) => {
    const base = dnsLabel(value);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : dnsLabel(`${base}-${count + 1}`);
  });
}
