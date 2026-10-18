import { createHash } from 'node:crypto';
export const GCP_CE_POLICY_URL =
  'https://f5-sales-demo.github.io/multi-cloud-networking/_llms-txt/en/customer-edge/automation-contract.txt';
export interface GcpPolicyReceipt {
  identity: 'f5xc-ce-automation-policy/v2';
  url: string;
  observedAt: string;
  normalizedSha256: string;
}
export function parseGcpCePolicy(text: string, observedAt = new Date().toISOString()): GcpPolicyReceipt {
  if (!/^contract_id:\s*f5xc-ce-automation-policy\s*$/m.test(text) || !/^contract_version:\s*v2\s*$/m.test(text))
    throw new Error('Unknown CE policy identity/version');
  for (const phrase of ['exact reviewed saved plan', 'registration', 'ownership', 'restoration', 'Marketplace'])
    if (!text.includes(phrase)) throw new Error('Incomplete CE automation policy');
  const normalized = `${text.replace(/\r\n?/g, '\n').trim()}\n`;
  return {
    identity: 'f5xc-ce-automation-policy/v2',
    url: GCP_CE_POLICY_URL,
    observedAt,
    normalizedSha256: `sha256:${createHash('sha256').update(normalized).digest('hex')}`,
  };
}
export async function readGcpCePolicy(fetcher: typeof fetch = fetch): Promise<GcpPolicyReceipt> {
  const response = await fetcher(GCP_CE_POLICY_URL);
  if (!response.ok) throw new Error('CE policy retrieval failed');
  return parseGcpCePolicy(await response.text());
}
