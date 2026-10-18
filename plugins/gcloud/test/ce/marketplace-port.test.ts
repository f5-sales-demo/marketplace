import { expect, it } from 'bun:test';
import { createGcpMarketplacePort, enableGcpMarketplaceApi } from '../../src/ce/marketplace-port';
import { intent } from './fixtures';

function fixture() {
  const i = intent();
  const service = 'f5-ce.endpoints.f5-7626-networks-public.cloud.goog';
  const agreement = `commerceoffercatalog.googleapis.com/services/${service}/standardOffers/default/agreements/eula`;
  const document = `${agreement}/documents/v1`;
  const calls: { url: string; body?: Record<string, unknown> }[] = [];
  let repeated = false,
    foreign = false,
    disabled = false;
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input),
      body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    let value: unknown = {};
    let status = 200;
    if (url.includes('cloudresourcemanager')) value = { projectId: i.project, projectNumber: '123' };
    else if (url.includes('/images/')) value = { ...i.image, id: foreign ? '999' : i.image.id };
    else if (url.includes('/licenses/'))
      value = {
        id: '789',
        selfLink: i.image.licenses[0],
        description: `License for Cloud Marketplace virtual machine image solution with billing service ${service}: default`,
      };
    else if (disabled) {
      status = 403;
      value = { error: { message: 'private-auth-fixture', details: [{ reason: 'SERVICE_DISABLED' }] } };
    } else if (url.includes('consents:check')) value = {};
    else if (url.includes('consents:grant')) value = {};
    else if (url.includes('/consents'))
      value = {
        consents: [{ agreement, agreementDocument: document }],
        ...(repeated ? { nextPageToken: 'repeat' } : {}),
      };
    else throw new Error('Unexpected endpoint');
    return new Response(JSON.stringify(value), { status });
  };
  const api = { exec: async () => ({ stdout: 'private-access-fixture', stderr: '', exitCode: 0 }) };
  const port = createGcpMarketplacePort(api, i, undefined, fetcher as typeof fetch);
  return {
    i,
    port,
    calls,
    repeat: () => {
      repeated = true;
    },
    foreign: () => {
      foreign = true;
    },
    disable: () => {
      disabled = true;
    },
  };
}
it('discovers exact image/license/service and consent document, then scopes check and dry-run grant', async () => {
  const f = fixture();
  const b = await f.port.binding();
  expect(b.projectNumber).toBe('123');
  expect(b.imageId).toBe(f.i.image.id);
  await f.port.check(b);
  await f.port.validateGrant(b);
  const grant = f.calls.find((c) => c.url.endsWith('consents:grant'));
  expect(grant?.url).toContain('/projects/123/');
  expect(grant?.body).toEqual({ consent: { agreementDocument: b.agreementDocument }, validateOnly: true });
  await expect(f.port.grant({ ...b, projectNumber: '999' })).rejects.toThrow('escaped');
});
it('repeated pagination and changed image identities fail before any consent grant', async () => {
  const f = fixture();
  f.repeat();
  await expect(f.port.binding()).rejects.toThrow('source_unavailable');
  expect(f.calls.filter((c) => c.url.includes('consents:grant'))).toHaveLength(0);
  const changed = fixture();
  changed.foreign();
  await expect(changed.port.binding()).rejects.toThrow('image changed');
  expect(changed.calls.filter((c) => c.url.includes('/consents'))).toHaveLength(0);
});
it('disabled API errors expose a fixed prerequisite category without raw credentials or error text', async () => {
  const f = fixture();
  f.disable();
  let message = '';
  try {
    await f.port.binding();
  } catch (e) {
    message = (e as Error).message;
  }
  expect(message).toContain('api_disabled');
  expect(message).not.toContain('private-auth-fixture');
  expect(message).not.toContain('private-access-fixture');
});
it('explicit API enablement stays scoped and reports Google cloud terms prerequisites', async () => {
  const calls: string[][] = [];
  const api = {
    exec: async (_command: string, args: string[]) => {
      calls.push(args);
      return { stdout: '', stderr: 'UREQ_TOS_NOT_ACCEPTED private-token-fixture', exitCode: 1 };
    },
  };
  await expect(enableGcpMarketplaceApi(api, 'test-project')).rejects.toThrow('cloud_terms_not_accepted');
  expect(calls).toEqual([
    ['services', 'enable', 'cloudcommerceconsumerprocurement.googleapis.com', '--project=test-project', '--quiet'],
  ]);
});
