import { describe, expect, it } from 'bun:test';
import { analyzeCloudInit, renderCeCloudInit } from '../../src/ce/cloud-init';

describe('cloud-init safety', () => {
  it('renders a CE bootstrap without exposing the token in diagnostics', () => {
    const secret = 'fixture-secret-value';
    const material = `#cloud-config\nwrite_files:\n  - path: /etc/vpm/user_data\n    permissions: "0600"\n    content: |\n      token: ${secret}\n`;
    const token = JSON.stringify({
      version: 2,
      provider: 'azure',
      siteName: 'ce-demo',
      nodeName: 'ce-demo-1',
      configurationUid: 'test-config-uid',
      cloudInit: material,
    });
    const rendered = renderCeCloudInit({ siteName: 'ce-demo', nodeName: 'ce-demo-1', token });
    expect(rendered).toBe(material);
    const analysis = analyzeCloudInit(rendered, [secret]);
    expect(JSON.stringify(analysis)).not.toContain(secret);
    expect(analysis.valid).toBe(true);
  });
  it('rejects unbound, wrong-node, unresolved and certified-config overwrite material', () => {
    const envelope = {
      version: 2,
      provider: 'azure',
      siteName: 'ce-demo',
      nodeName: 'ce-demo-1',
      configurationUid: 'test-config-uid',
      cloudInit: '#cloud-config\n',
    };
    for (const token of [
      'unbound',
      JSON.stringify({ ...envelope, nodeName: 'other' }),
      JSON.stringify({ ...envelope, cloudInit: '#cloud-config\n{{ .Token }}' }),
      JSON.stringify({ ...envelope, cloudInit: '#cloud-config\n/etc/vpm/config.yaml' }),
    ])
      expect(() => renderCeCloudInit({ siteName: 'ce-demo', nodeName: 'ce-demo-1', token })).toThrow();
  });

  it('explains general Linux cloud-init stages and rejects control characters', () => {
    const analysis = analyzeCloudInit('#cloud-config\npackages:\n  - jq\n');
    expect(analysis.stages).toEqual(['init-local', 'init-network', 'config', 'final']);
    expect(analyzeCloudInit('#cloud-config\nfoo: bad\u0000value').valid).toBe(false);
  });
});
