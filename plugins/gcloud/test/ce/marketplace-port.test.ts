import { expect, it } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Type } from '@sinclair/typebox';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { createGcpMarketplacePort, enableGcpMarketplaceApi } from '../../src/ce/marketplace-port';
import { createGcpCeTools } from '../../src/tools/gcp-ce';
import { intent } from './fixtures';

function fixture() {
  const i = intent();
  const service = 'f5-ce.endpoints.f5-7626-networks-public.cloud.goog';
  const agreement = `commerceoffercatalog.googleapis.com/services/${service}/standardOffers/default/agreements/eula`;
  const document = `${agreement}/documents/v1`;
  const calls: { url: string; body?: Record<string, unknown> }[] = [];
  let repeated = false,
    foreign = false,
    disabled = false,
    methodUnavailable = false;
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
    } else if (methodUnavailable) {
      status = 404;
      value = { error: { message: 'Method not found.' } };
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
    unavailable: () => {
      methodUnavailable = true;
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
it('a missing consent API method remains separate from an unaccepted Cloud terms prerequisite', async () => {
  const f = fixture();
  f.unavailable();
  await expect(f.port.binding()).rejects.toThrow('method_unavailable');
  expect(f.calls.filter((call) => call.url.includes('consents:grant'))).toHaveLength(0);
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

it('typed qualification gives the terms acceptance link and recovery steps without exposing raw provider errors', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'gcp-cloud-terms-')));
  try {
    const i = intent();
    const calls: string[][] = [];
    const api = {
      exec: async (_command: string, args: string[]) => {
        calls.push(args);
        return { stdout: '', stderr: 'UREQ_TOS_NOT_ACCEPTED private-token-fixture', exitCode: 1 };
      },
    };
    const platform = { storage: async () => ({ directory }) } as unknown as CePlatformService;
    const tool = createGcpCeTools(
      { typebox: { Type } },
      () => api,
      undefined,
      async () => platform,
    ).find((tool) => tool.name === 'gcp_marketplace_agreement');
    if (!tool) throw new Error('Missing agreement tool');
    const result = await tool.execute(
      'terms',
      { project: i.project, region: i.region, intent: i, enableMarketplaceApi: true },
      undefined,
      null,
      { cwd: directory },
    );
    expect(result.isError).toBe(true);
    expect(result.details.reason).toBe('cloud_terms_not_accepted');
    expect(result.details.providerCode).toBe('UREQ_TOS_NOT_ACCEPTED');
    expect(result.details.acceptanceUrl).toBe('https://console.developers.google.com/terms/cloud');
    expect(result.details.marketplaceConsent).toBe('not-established');
    expect(result.details.mutationAttempted).toBe(false);
    expect(result.details.nextSteps).toHaveLength(3);
    expect(JSON.stringify(result)).not.toContain('private-token-fixture');
    expect(calls).toEqual([
      ['services', 'enable', 'cloudcommerceconsumerprocurement.googleapis.com', '--project=test-project', '--quiet'],
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
