import { createHash } from 'node:crypto';

export interface GoogleAdcAuthenticationRequest {
  readonly credentialBytes: Uint8Array;
  readonly project: string;
  readonly accountSha256: string;
  readonly audienceSha256: string;
  /** The actual owning factory retains its original monitor and budget. */
  readonly assertOriginal: () => Promise<void>;
}
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const inspectionEndpoint = 'https://www.googleapis.com/oauth2/v2/tokeninfo';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const validHash = (value: string) => /^[a-f0-9]{64}$/.test(value);
const maximum = 65536;
type Json = Record<string, unknown>;
export class GoogleAdcAuthenticationHttpError extends Error {
  constructor(readonly status: number) {
    super('Google ADC authentication HTTP request failed');
  }
}
function decode(raw: Uint8Array): Json {
  const value: unknown = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(raw));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Google ADC authentication response is malformed');
  return value as Json;
}

/** Authenticate an original authorized-user snapshot. This produces evidence, never an execution grant. */
async function authenticateGoogleAdcSession(
  input: GoogleAdcAuthenticationRequest,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const credentialBytes = Buffer.from(input.credentialBytes);
  const { project, accountSha256, audienceSha256, assertOriginal } = input;
  if (
    !credentialBytes.length ||
    credentialBytes.length > maximum ||
    !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) ||
    !validHash(accountSha256) ||
    !validHash(audienceSha256) ||
    typeof assertOriginal !== 'function'
  )
    throw new Error('Qualified Google ADC credential mapping required');
  let credential: Json;
  try {
    credential = decode(credentialBytes);
  } catch {
    throw new Error('Qualified Google ADC credential mapping required');
  }
  if (
    credential.type !== 'authorized_user' ||
    ['client_id', 'client_secret', 'refresh_token'].some(
      (key) =>
        typeof credential[key] !== 'string' ||
        !credential[key] ||
        [...(credential[key] as string)].some(
          (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
        ),
    ) ||
    hash(credential.client_id as string) !== audienceSha256 ||
    (credential.quota_project_id !== undefined && credential.quota_project_id !== project) ||
    (credential.token_uri !== undefined && credential.token_uri !== tokenEndpoint) ||
    (credential.universe_domain !== undefined && credential.universe_domain !== 'googleapis.com') ||
    (credential.account !== undefined &&
      credential.account !== '' &&
      (typeof credential.account !== 'string' || hash(credential.account) !== accountSha256))
  )
    throw new Error('Qualified Google ADC credential mapping required');
  const guard = async () => {
    signal?.throwIfAborted();
    try {
      await assertOriginal();
    } catch {
      throw new Error('Original Google ADC authentication inputs changed');
    }
  };
  const read = async (url: string, options: RequestInit) => {
    await guard();
    let value: Json | undefined;
    let failure: unknown;
    try {
      const bounded = signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
      const response = await fetcher(url, { ...options, redirect: 'error', signal: bounded });
      if (!response.ok) throw new GoogleAdcAuthenticationHttpError(response.status);
      if (!response.body) throw new Error('Google ADC authentication response is malformed');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          bounded.throwIfAborted();
          const { value: chunk, done } = await reader.read();
          if (done) break;
          size += chunk.length;
          if (size > maximum) throw new Error('Google ADC authentication response exceeds bound');
          chunks.push(chunk);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      value = decode(Buffer.concat(chunks));
    } catch (error) {
      // Transport errors may include the token-inspection URL. Never expose them.
      failure =
        error instanceof GoogleAdcAuthenticationHttpError
          ? error
          : new Error('Google ADC authentication transport failed');
    }
    try {
      await guard();
    } catch (originalFailure) {
      if (failure)
        throw new AggregateError(
          [failure, originalFailure],
          'Original Google ADC request and input verification failed',
        );
      throw originalFailure;
    }
    if (failure) throw failure;
    if (!value) throw new Error('Google ADC authentication response is malformed');
    return value;
  };
  const began = Date.now();
  const refresh = await read(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: credential.client_id as string,
      client_secret: credential.client_secret as string,
      refresh_token: credential.refresh_token as string,
    }).toString(),
  });
  if (
    typeof refresh.access_token !== 'string' ||
    !refresh.access_token ||
    /\s/.test(refresh.access_token) ||
    refresh.token_type !== 'Bearer' ||
    !Number.isSafeInteger(refresh.expires_in) ||
    (refresh.expires_in as number) <= 360 ||
    (refresh.expires_in as number) > 3600
  )
    throw new Error('Qualified Google ADC refresh response required');
  const inspectionBegan = Date.now();
  const info = await read(
    `${inspectionEndpoint}?${new URLSearchParams({ access_token: refresh.access_token }).toString()}`,
    {
      method: 'POST',
      headers: { Accept: 'application/json' },
    },
  );
  if (
    typeof info.email !== 'string' ||
    hash(info.email) !== accountSha256 ||
    info.verified_email !== true ||
    typeof info.audience !== 'string' ||
    hash(info.audience) !== audienceSha256 ||
    info.issued_to !== info.audience ||
    typeof info.scope !== 'string' ||
    !info.scope.split(' ').includes('https://www.googleapis.com/auth/cloud-platform') ||
    !Number.isSafeInteger(info.expires_in) ||
    (info.expires_in as number) <= 360 ||
    (info.expires_in as number) > 3600
  )
    throw new Error('Google ADC principal, scope, audience or lifetime differs');
  const projectData = await read(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(project)}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${refresh.access_token}` },
    },
  );
  if (projectData.projectId !== project || projectData.lifecycleState !== 'ACTIVE')
    throw new Error('Google ADC selected project identity or access differs');
  const verifiedAt = Date.now();
  const expiresNoEarlierThan = Math.min(
    began + (refresh.expires_in as number) * 1000,
    inspectionBegan + (info.expires_in as number) * 1000,
  );
  if (expiresNoEarlierThan - verifiedAt <= 360000 || verifiedAt - began >= 300000)
    throw new Error('Google ADC principal, scope, audience or lifetime differs');
  const receipt = {
    schemaVersion: 1,
    kind: 'authenticated-google-adc-snapshot',
    project,
    snapshotSha256: hash(credentialBytes),
    accountSha256,
    audienceSha256,
    verifiedAt,
    expiresNoEarlierThan,
    executionAuthorized: false,
  };
  return {
    receipt: Object.freeze({ ...receipt, authenticationReceiptSha256: hash(JSON.stringify(receipt)) }),
    accessToken: refresh.access_token,
  };
}

/** Authenticate without returning a bearer token to the caller or a receipt. */
export async function authenticateGoogleAdc(
  input: GoogleAdcAuthenticationRequest,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  return (await authenticateGoogleAdcSession(input, signal, fetcher)).receipt;
}

export interface GoogleComputeRead {
  readonly raw: Uint8Array;
  readonly status: number;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly complete: boolean;
  readonly truncated: boolean;
}
export class GoogleComputeReadError extends AggregateError {
  constructor(
    readonly capture: GoogleComputeRead,
    failures: unknown[],
  ) {
    super(failures, 'Original Google Compute read incomplete');
  }
}
const computeMaximum = 4 * 1024 * 1024;
const resourceName = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const offset = /^(?:0|[1-9][0-9]{0,19})$/;
const serialOffset = (value: string) =>
  typeof value === 'string' && offset.test(value) && BigInt(value) <= 9223372036854775807n;

/** Fixed read-only Compute capability backed by the same original ADC bytes.
 * Reader refresh is independent of Terraform-provider refresh qualification.
 * Raw cloud responses are private evidence; no token is returned or serialized.
 */
export async function openGoogleAdcComputeReader(
  input: GoogleAdcAuthenticationRequest,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const original = Object.freeze({ ...input, credentialBytes: Buffer.from(input.credentialBytes) });
  let session = await authenticateGoogleAdcSession(original, signal, fetcher);
  let refreshing: Promise<typeof session> | undefined;
  const guard = async () => {
    signal?.throwIfAborted();
    try {
      await original.assertOriginal();
    } catch {
      throw new Error('Original Google Compute reader inputs changed');
    }
  };
  const read = async (zone: string, name: string, start?: string): Promise<GoogleComputeRead> => {
    if (!resourceName.test(zone) || !resourceName.test(name) || (start !== undefined && !serialOffset(start)))
      throw new Error('Fixed named Google Compute read required');
    await guard();
    if (Date.now() >= session.receipt.expiresNoEarlierThan - 60_000) {
      refreshing ??= authenticateGoogleAdcSession(original, signal, fetcher);
      try {
        session = await refreshing;
      } finally {
        refreshing = undefined;
      }
    }
    await guard();
    const base = `https://compute.googleapis.com/compute/v1/projects/${original.project}/zones/${zone}/instances/${name}`;
    const url = start === undefined ? base : `${base}/serialPort?port=1&start=${start}`;
    const began = Date.now();
    const chunks: Uint8Array[] = [];
    const failures: unknown[] = [];
    let size = 0;
    let status = 0;
    let complete = false;
    let truncated = false;
    try {
      const bounded = signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000);
      const response = await fetcher(url, {
        method: 'GET',
        redirect: 'error',
        signal: bounded,
        headers: { Accept: 'application/json', Authorization: `Bearer ${session.accessToken}` },
      });
      status = response.status;
      if (!response.body) throw new Error('Missing cloud body');
      const stream = response.body.getReader();
      try {
        for (;;) {
          bounded.throwIfAborted();
          const { value, done } = await stream.read();
          if (done) break;
          const available = Math.max(0, computeMaximum - size);
          chunks.push(value.subarray(0, available));
          size += value.length;
          if (size > computeMaximum) {
            truncated = true;
            throw new Error('Cloud read exceeds bound');
          }
        }
        complete = true;
      } finally {
        await stream.cancel().catch(() => undefined);
        stream.releaseLock();
      }
    } catch {
      failures.push(new Error('Google Compute read transport failed'));
    }
    try {
      await guard();
    } catch (error) {
      complete = false;
      failures.push(error);
    }
    const finishedAt = Date.now();
    if (finishedAt < began || finishedAt - began > 60_000) {
      complete = false;
      failures.push(new Error('Bounded original Compute response required'));
    }
    const result: GoogleComputeRead = {
      raw: Buffer.concat(chunks),
      status,
      startedAt: began,
      finishedAt,
      complete,
      truncated,
    };
    if (failures.length) throw new GoogleComputeReadError(result, failures);
    return result;
  };
  return Object.freeze({
    authentication: session.receipt,
    instance: (zone: string, name: string) => read(zone, name),
    serial: (zone: string, name: string, start: string) => read(zone, name, start),
  });
}
