import { describe, expect, it } from 'bun:test';
import { analyzeAwsCloudInit, renderAwsCeCloudInit } from '../../src/ce/cloud-init';

describe('AWS CE cloud-init safety', () => {
  it('encodes bootstrap material and redacts diagnostics', () => {
    const token = 'fixture-secret-value';
    const body = renderAwsCeCloudInit({ siteName: 'ce-demo', nodeName: 'ce-demo-1', token });
    expect(body).not.toContain(token);
    const result = analyzeAwsCloudInit(body, [token]);
    expect(result.valid).toBe(true);
    expect(JSON.stringify(result)).not.toContain(token);
  });
});
