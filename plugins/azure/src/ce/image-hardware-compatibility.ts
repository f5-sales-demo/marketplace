export type AzureCpuArchitecture = 'x64' | 'arm64' | 'unknown';
export type AzureHyperVGeneration = 'V1' | 'V2' | 'unknown';
type Image = { architecture?: AzureCpuArchitecture; hyperVGeneration?: AzureHyperVGeneration };
type Sku = { architecture?: AzureCpuArchitecture; hyperVGenerations?: Array<'V1' | 'V2'> };
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const architecture = (value: unknown): AzureCpuArchitecture => {
  if (typeof value !== 'string') return 'unknown';
  const result = value.trim().toLowerCase();
  return result === 'x64' || result === 'arm64' ? result : 'unknown';
};
/** Exact Marketplace image identity precedes configuration capability interpretation.
 * These properties never qualify operational link state, readiness, or heartbeat freshness. */
export function readAzureImageHardware(
  raw: unknown,
  expected: { subscriptionId: string; region: string; urn: string },
): Required<Image> {
  const row = object(raw),
    [publisher, offer, sku, version, extra] = expected.urn.split(':');
  const id = `/subscriptions/${expected.subscriptionId}/providers/Microsoft.Compute/locations/${expected.region}/publishers/${publisher}/artifacttypes/VMImage/offers/${offer}/skus/${sku}/versions/${version}`;
  if (
    extra !== undefined ||
    !publisher ||
    !offer ||
    !sku ||
    !version ||
    typeof row.id !== 'string' ||
    row.id.toLowerCase() !== id.toLowerCase() ||
    row.name !== version ||
    typeof row.location !== 'string' ||
    row.location.toLowerCase() !== expected.region.toLowerCase()
  )
    return { architecture: 'unknown', hyperVGeneration: 'unknown' };
  return {
    architecture: architecture(row.architecture),
    hyperVGeneration: row.hyperVGeneration === 'V1' || row.hyperVGeneration === 'V2' ? row.hyperVGeneration : 'unknown',
  };
}
export function readAzureSkuHardware(raw: unknown): Sku {
  const rows = Array.isArray(object(raw).capabilities) ? (object(raw).capabilities as unknown[]).map(object) : [];
  const capability = (name: string) => {
    const matching = rows.filter(
      (row) => typeof row.name === 'string' && row.name.toLowerCase() === name.toLowerCase(),
    );
    return matching.length === 1 ? matching[0].value : undefined;
  };
  const generations = capability('HyperVGenerations');
  const values = typeof generations === 'string' ? generations.split(',').map((value) => value.trim()) : [];
  const valid =
    values.length > 0 &&
    values.length <= 2 &&
    new Set(values).size === values.length &&
    values.every((value) => value === 'V1' || value === 'V2');
  return {
    architecture: architecture(capability('CpuArchitectureType')),
    hyperVGenerations: valid ? (values.sort() as Array<'V1' | 'V2'>) : undefined,
  };
}
export function classifyAzureImageHardwareCompatibility(
  image: Image,
  sku: Sku,
): 'compatible' | 'incompatible' | 'unknown' {
  if (
    !['x64', 'arm64'].includes(image.architecture ?? '') ||
    !['x64', 'arm64'].includes(sku.architecture ?? '') ||
    !['V1', 'V2'].includes(image.hyperVGeneration ?? '') ||
    !Array.isArray(sku.hyperVGenerations) ||
    !sku.hyperVGenerations.length ||
    new Set(sku.hyperVGenerations).size !== sku.hyperVGenerations.length ||
    sku.hyperVGenerations.some((value) => value !== 'V1' && value !== 'V2')
  )
    return 'unknown';
  return image.architecture === sku.architecture &&
    sku.hyperVGenerations.includes(image.hyperVGeneration as 'V1' | 'V2')
    ? 'compatible'
    : 'incompatible';
}
