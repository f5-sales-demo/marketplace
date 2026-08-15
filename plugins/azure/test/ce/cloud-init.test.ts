import { describe, expect, it } from 'bun:test';
import { analyzeCloudInit, renderCeCloudInit } from '../../src/ce/cloud-init';

describe('cloud-init safety', () => {
  it('renders a CE bootstrap without exposing the token in diagnostics', () => {
    const token = 'fixture-secret-value';
    const rendered = renderCeCloudInit({ siteName: 'ce-demo', nodeName: 'ce-demo-1', token });
    const encoded = rendered.match(/content: (\S+)/)?.[1] ?? '';
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toContain(token);
    expect(rendered).not.toContain(token);
    const analysis = analyzeCloudInit(rendered, [token]);
    expect(JSON.stringify(analysis)).not.toContain(token);
    expect(analysis.valid).toBe(true);
  });

  it('explains general Linux cloud-init stages and rejects control characters', () => {
    const analysis = analyzeCloudInit('#cloud-config\npackages:\n  - jq\n');
    expect(analysis.stages).toEqual(['init-local', 'init-network', 'config', 'final']);
    expect(analyzeCloudInit('#cloud-config\nfoo: bad\u0000value').valid).toBe(false);
  });
});
