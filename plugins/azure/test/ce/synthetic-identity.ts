/** Deterministic synthetic UUIDs for isolated CE identity fixtures. */
export function syntheticAzureUuid(prefix: string, suffix: number): string {
  return [prefix, String(suffix).padStart(12, '0')].join('-');
}
