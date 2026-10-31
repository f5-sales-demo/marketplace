import { expect, test } from 'bun:test';
import { bindAwsCloudInit, issueAwsBootstrap } from '../../src/ce/bootstrap';

// Construct a synthetic JWT; no tenant credential is stored in this fixture.
const jwt = [{ alg: 'RS256' }, { site: 'demo' }, 'synthetic-signature']
  .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
  .join('.');
const template =
  '#cloud-config\nwrite_files:\n  - path: /etc/vpm/user_data\n    permissions: "0644"\n    content: |\n      token: {{ .Token }}\n';

test('issues a site-bound JWT and uses the verified server cloud-init mapping', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const material = await issueAwsBootstrap('demo', 'demo-node1', async (path, init) => {
    calls.push({ path, init });
    return init?.method === 'POST'
      ? { spec: { type: 1, site_name: 'demo', content: jwt } }
      : { cloud_init_config: template };
  });
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({
    metadata: { name: 'demo-node1', namespace: 'system' },
    spec: { type: 1, site_name: 'demo' },
  });
  expect(calls[1].path).toBe(
    '/api/register/namespaces/system/get-cloud-init-config?provider=aws&site_name=demo&enable_management_network=false',
  );
  expect(material).toBe(template.replace('{{ .Token }}', jwt));
});

test('rejects a token for another site before requesting cloud-init', async () => {
  let calls = 0;
  await expect(
    issueAwsBootstrap('demo', 'demo-node1', async () => {
      calls++;
      return { spec: { type: 1, site_name: 'other', content: jwt } };
    }),
  ).rejects.toThrow('bound');
  expect(calls).toBe(1);
});

test('rejects image configuration overwrite, unbound material and unresolved placeholders', () => {
  for (const material of [
    template.replace('/etc/vpm/user_data', '/etc/vpm/config.yaml'),
    template.replace('{{ .Token }}', '{{ .Unknown }}'),
    template.replace('{{ .Token }}', 'other'),
    `${template}  - path: /etc/vpm/user_data\n    content: other\n`,
    '#cloud-config\nwrite_files: [invalid',
  ])
    expect(() => bindAwsCloudInit({ cloud_init_config: material }, jwt)).toThrow();
});

test('never leaks malformed material or JWT in diagnostics', () => {
  try {
    bindAwsCloudInit({ cloud_init_config: `#cloud-config\nwrite_files: [${jwt}` }, jwt);
  } catch (error) {
    expect(String(error)).not.toContain(jwt);
  }
  expect(() => bindAwsCloudInit({ cloud_init_config: template }, 'token\ninjected: true')).toThrow('JWT');
});
