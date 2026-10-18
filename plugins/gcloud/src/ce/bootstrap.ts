/** Validate provider-issued material before any VM mutation. Never return secrets in tool output. */
export function validateGcpBootstrapMaterial(response: unknown): never {
  if (!response || typeof response !== 'object' || Array.isArray(response))
    throw new Error('Malformed GCP bootstrap response');
  const template = (response as Record<string, unknown>).cloud_init_config;
  if (typeof template !== 'string' || !template.trim() || template.length > 1024 * 1024)
    throw new Error('Malformed GCP bootstrap material');
  if (/^\s*\{\{\s*\.token\s*\}\}\s*$/i.test(template))
    throw new Error('GCP bootstrap returned only a token placeholder; image bootstrap is unavailable');
  throw new Error('GCP bootstrap material requires qualified image-specific binding');
}
