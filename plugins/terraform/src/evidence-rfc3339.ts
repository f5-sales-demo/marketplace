/** Validate provider evidence timestamps without Date.parse's coercible dates.
 * Preserve the original RFC3339 bytes, UTC offset and subsecond precision.
 */
export function isEvidenceRfc3339(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64) return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return false;
  const year = Number(parts[1]),
    month = Number(parts[2]),
    day = Number(parts[3]);
  if (
    Number(parts[4]) > 23 ||
    Number(parts[5]) > 59 ||
    Number(parts[6]) > 59 ||
    (parts[7] !== undefined && (Number(parts[7]) > 23 || Number(parts[8]) > 59))
  )
    return false;
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  return (
    calendar.getUTCFullYear() === year &&
    calendar.getUTCMonth() === month - 1 &&
    calendar.getUTCDate() === day &&
    Number.isFinite(Date.parse(value))
  );
}
