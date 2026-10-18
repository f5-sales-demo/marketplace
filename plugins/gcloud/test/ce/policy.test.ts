import { expect, it } from 'bun:test';
import { parseGcpCePolicy, readGcpCePolicy } from '../../src/ce/policy';

const policy =
  'contract_id: f5xc-ce-automation-policy\ncontract_version: v2\nexact reviewed saved plan registration ownership restoration Marketplace';
it('normalizes line endings while binding policy identity and digest', () => {
  expect(parseGcpCePolicy(policy).normalizedSha256).toBe(
    parseGcpCePolicy(policy.replaceAll('\n', '\r\n')).normalizedSha256,
  );
  expect(parseGcpCePolicy(policy).identity).toBe('f5xc-ce-automation-policy/v2');
});
it('rejects stale identity and failed retrieval', async () => {
  expect(() => parseGcpCePolicy(policy.replace('v2', 'v1'))).toThrow('identity');
  await expect(readGcpCePolicy((async () => new Response('', { status: 503 })) as typeof fetch)).rejects.toThrow(
    'retrieval',
  );
});
