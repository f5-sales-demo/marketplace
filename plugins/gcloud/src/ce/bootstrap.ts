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

export const GCP_BOOTSTRAP_GUIDE =
  'https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/how-to/site-management/deploy-sms-gcp-clickops';

export interface GcpBootstrapBinding {
  deploymentName: string;
  siteName: string;
  nodeName: string;
  jwt: string;
  expiresAt: string;
}

/** Candidate guide-backed formatter; boot/registration acceptance is still required. */
export function formatGcpUserData(binding: GcpBootstrapBinding, now = Date.now()): string {
  for (const name of [binding.deploymentName, binding.siteName, binding.nodeName]) {
    if (!/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) throw new Error('Invalid GCP bootstrap binding');
  }
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(binding.jwt))
    throw new Error('Invalid site-bound JWT syntax');
  const expiry = Date.parse(binding.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now || expiry - now > 24 * 60 * 60 * 1000)
    throw new Error('Bootstrap expiry must be within 24 hours');
  // The documented GCP user-data contract writes only the issued token. Use
  // owner-only guest permissions and preserve the certified image configuration.
  return [
    '#cloud-config',
    'write_files:',
    '  - path: /etc/vpm/user_data',
    '    permissions: "0600"',
    '    owner: root',
    '    content: |',
    `      token: ${binding.jwt}`,
    '',
  ].join('\n');
}
