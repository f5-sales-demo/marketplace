import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { authenticateGoogleAdc } from '../src/google-adc-authentication';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const credential = {
  type: 'authorized_user',
  client_id: 'synthetic-client',
  client_secret: 'synthetic-secret',
  refresh_token: 'synthetic-refresh',
  quota_project_id: 'example-project',
};
const info = {
  email: 'principal@example.com',
  verified_email: true,
  audience: credential.client_id,
  issued_to: credential.client_id,
  expires_in: 3599,
  scope: 'https://www.googleapis.com/auth/cloud-platform',
};
const request = () => ({
  credentialBytes: Buffer.from(JSON.stringify(credential)),
  project: 'example-project',
  accountSha256: hash(info.email),
  audienceSha256: hash(credential.client_id),
  assertOriginal: async () => {},
});
test('HTTP authentication status is retained without copying a token-bearing response or URL', async () => {
  const failure = (async (_url: string | URL | Request, _options?: RequestInit) =>
    Response.json({ error: 'synthetic-access must remain private' }, { status: 429 })) as typeof fetch;
  const error = await authenticateGoogleAdc(request(), undefined, failure).catch((value) => value);
  expect(error.status).toBe(429);
  expect(error.message).toBe('Google ADC authentication HTTP request failed');
  expect(error.message).not.toContain('synthetic-access');
});
test('HTTP failure and independent original-input failure both remain attributed', async () => {
  const failure = (async (_url: string | URL | Request, _options?: RequestInit) =>
    Response.json({}, { status: 401 })) as typeof fetch;
  let checks = 0;
  const error = await authenticateGoogleAdc(
    {
      ...request(),
      assertOriginal: async () => {
        if (++checks > 1) throw new Error('private original input changed');
      },
    },
    undefined,
    failure,
  ).catch((value) => value);
  expect(error).toBeInstanceOf(AggregateError);
  expect(error.errors[0].status).toBe(401);
  expect(error.errors[1].message).toBe('Original Google ADC authentication inputs changed');
});
function network(
  tokenInfo = info,
  refresh: Record<string, unknown> = { access_token: 'synthetic-access', token_type: 'Bearer', expires_in: 3599 },
) {
  const calls: Array<{ url: string; options?: RequestInit }> = [];
  const fetcher = (async (url: string | URL | Request, options?: RequestInit) => {
    calls.push({ url: String(url), options });
    return Response.json(
      calls.length === 1
        ? refresh
        : calls.length === 2
          ? tokenInfo
          : { projectId: 'example-project', lifecycleState: 'ACTIVE' },
    );
  }) as typeof fetch;
  return { calls, fetcher };
}
test('real authentication mapping binds refresh, documented token inspection and project access without returning tokens', async () => {
  const n = network();
  let guards = 0;
  const receipt = await authenticateGoogleAdc(
    {
      ...request(),
      assertOriginal: async () => {
        guards++;
      },
    },
    undefined,
    n.fetcher,
  );
  expect(n.calls.map((c) => new URL(c.url).pathname)).toEqual([
    '/token',
    '/oauth2/v2/tokeninfo',
    '/v1/projects/example-project',
  ]);
  expect(n.calls[1].options?.method).toBe('POST');
  expect(new URL(n.calls[1].url).searchParams.get('access_token')).toBe('synthetic-access');
  expect(n.calls.every((c) => c.options?.redirect === 'error')).toBe(true);
  expect(receipt.accountSha256).toBe(hash(info.email));
  expect(receipt.audienceSha256).toBe(hash(credential.client_id));
  expect(receipt.expiresNoEarlierThan - Date.now()).toBeGreaterThan(360_000);
  expect(guards).toBeGreaterThanOrEqual(6);
  expect(JSON.stringify(receipt)).not.toContain('synthetic-access');
  expect(JSON.stringify(receipt)).not.toContain('synthetic-refresh');
});
test('wrong principal, unverified email, missing scope and foreign audience refuse before project reads', async () => {
  for (const change of [
    { email: 'foreign@example.com' },
    { verified_email: false },
    { scope: '' },
    { audience: 'foreign-client' },
    { issued_to: 'foreign-client' },
    { expires_in: 360 },
  ]) {
    const n = network({ ...info, ...change });
    await expect(authenticateGoogleAdc(request(), undefined, n.fetcher)).rejects.toThrow(
      'principal, scope, audience or lifetime',
    );
    expect(n.calls).toHaveLength(2);
  }
});
test('invalid refresh responses cannot obtain token inspection or a credential fallback', async () => {
  for (const change of [{ access_token: '' }, { token_type: 'foreign' }, { expires_in: 0 }, { expires_in: 7200 }]) {
    const n = network(info, { access_token: 'synthetic-access', token_type: 'Bearer', expires_in: 3599, ...change });
    await expect(authenticateGoogleAdc(request(), undefined, n.fetcher)).rejects.toThrow('refresh response');
    expect(n.calls).toHaveLength(1);
  }
});
test('foreign credential mappings and endpoint injection are refused before network activity', async () => {
  for (const change of [
    { type: 'service_account' },
    { token_uri: 'https://foreign.invalid/token' },
    { universe_domain: 'foreign.invalid' },
    { quota_project_id: 'foreign-project' },
    { client_secret: 'line\nsecret' },
  ]) {
    const n = network();
    await expect(
      authenticateGoogleAdc(
        { ...request(), credentialBytes: Buffer.from(JSON.stringify({ ...credential, ...change })) },
        undefined,
        n.fetcher,
      ),
    ).rejects.toThrow('credential mapping');
    expect(n.calls).toHaveLength(0);
  }
});
test('original input failure stops subsequent requests and retains sanitized HTTP failures', async () => {
  const n = network();
  let checks = 0;
  await expect(
    authenticateGoogleAdc(
      {
        ...request(),
        assertOriginal: async () => {
          if (++checks > 1) throw new Error('private input changed');
        },
      },
      undefined,
      n.fetcher,
    ),
  ).rejects.toThrow('Original Google ADC authentication inputs changed');
  expect(n.calls).toHaveLength(1);
  const failure: typeof fetch = Object.assign(
    async (_url: string | URL | Request, _options?: RequestInit): Promise<Response> => {
      throw new Error('unsafe URL containing synthetic-access');
    },
    { preconnect: fetch.preconnect },
  );
  const error = await authenticateGoogleAdc(request(), undefined, failure).catch((value) => value);
  expect(error.message).toBe('Google ADC authentication transport failed');
  expect(error.message).not.toContain('synthetic-access');
});
