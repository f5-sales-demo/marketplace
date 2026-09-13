import { describe, expect, it } from 'bun:test';
import { analyzeAwsCloudInit, renderAwsCeCloudInit } from '../../src/ce/cloud-init';

describe('AWS CE cloud-init safety', () => {
  it('preserves issued material and adds the explicit node hostname', () => {
    const token = 'fixture-secret-value';
    const body = renderAwsCeCloudInit({
      nodeName: 'ce-demo-1',
      material: `#cloud-config\nwrite_files:\n  - path: /etc/vpm/user_data\n    content: |\n      token: ${token}\n`,
    });
    expect(body).toContain(token);
    expect(body).toContain('hostname: ce-demo-1');
    expect(body).not.toContain('/var/lib/f5xc/bootstrap.json');
    const result = analyzeAwsCloudInit(body, [token]);
    expect(result.valid).toBe(true);
    expect(JSON.stringify(result)).not.toContain(token);
  });
});
