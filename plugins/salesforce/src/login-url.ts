export interface LoginUrlHost {
  environment(): string | undefined;
  executable(): string | undefined;
  exec(
    command: string,
    args: string[],
    options: { timeout: number; signal?: AbortSignal },
  ): Promise<{ code: number; stdout: string }>;
}

const guidance =
  'Set SF_ORG_INSTANCE_URL or org-instance-url to an HTTPS Salesforce login or My Domain URL without credentials, paths, query parameters, or fragments.';
export function normalizeLoginUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(guidance);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(guidance);
  const domain = url.hostname.toLowerCase();
  if (domain.endsWith('.lightning.force.com'))
    url.hostname = `${domain.slice(0, -'.lightning.force.com'.length)}.my.salesforce.com`;
  if (
    !['login.salesforce.com', 'test.salesforce.com'].includes(url.hostname) &&
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.sandbox)?\.my\.salesforce\.com$/.test(url.hostname)
  )
    throw new Error(guidance);
  return url.origin;
}

async function resolveLoginUrl(host: LoginUrlHost, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const environment = host.environment();
  if (environment !== undefined) return normalizeLoginUrl(environment);
  const executable = host.executable();
  if (!executable) return 'https://login.salesforce.com';
  let result: { code: number; stdout: string };
  try {
    result = await host.exec(executable, ['config', 'get', 'org-instance-url', '--json'], { timeout: 15000, signal });
  } catch {
    signal?.throwIfAborted();
    throw new Error('Unable to read Salesforce login configuration. Set SF_ORG_INSTANCE_URL and review setup again.');
  }
  signal?.throwIfAborted();
  let value: unknown;
  try {
    if (result.code !== 0 || result.stdout.length > 65536) throw new Error();
    const data = JSON.parse(result.stdout);
    if (data.status !== 0 || !Array.isArray(data.result)) throw new Error();
    const entries = data.result.filter((item: { name?: unknown }) => item?.name === 'org-instance-url');
    if (
      entries.length !== 1 ||
      entries[0].success !== true ||
      (entries[0].value !== undefined && typeof entries[0].value !== 'string')
    )
      throw new Error();
    value = entries[0].value;
  } catch {
    throw new Error('Unable to read Salesforce login configuration. Set SF_ORG_INSTANCE_URL and review setup again.');
  }
  return value === undefined ? 'https://login.salesforce.com' : normalizeLoginUrl(value as string);
}

export async function prepareLoginUrl(host: LoginUrlHost, signal?: AbortSignal) {
  const url = await resolveLoginUrl(host, signal);
  return Object.freeze({
    url,
    validate: async (currentSignal?: AbortSignal) => {
      if ((await resolveLoginUrl(host, currentSignal)) !== url)
        throw new Error('Salesforce login URL changed; review setup again');
    },
  });
}
