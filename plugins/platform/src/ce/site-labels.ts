type Json = Record<string, unknown>;
const discoveryLabels = new Set([
  'domain',
  'host-os-version',
  'hw-model',
  'hw-serial-number',
  'hw-vendor',
  'hw-version',
]);

/** Runtime discovery labels belong to the platform; custom and deployment labels remain exact. */
export function writableSiteLabels(labels: Json): Json {
  return Object.fromEntries(
    Object.entries(labels).filter(
      ([key]) => !key.startsWith('ves.io/') && !key.startsWith('internal.ves.io/') && !discoveryLabels.has(key),
    ),
  );
}
export function writableSiteMetadata(metadata: Json): Json {
  const labels = metadata.labels;
  if (labels === undefined) return { ...metadata };
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) throw new Error('Malformed site labels');
  return { ...metadata, labels: writableSiteLabels(labels as Json) };
}
