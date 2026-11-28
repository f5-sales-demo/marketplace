/** Internal bootstrap material handling. Never serialize the result into tool output. */
type Json = Record<string, unknown>;
type Api = (path: string, init?: RequestInit) => Promise<unknown>;
const siteNamePattern = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed bootstrap response');
  return value as Json;
}

export function bindAwsCloudInit(response: unknown, jwt: string): string {
  const material = object(response).cloud_init_config;
  if (typeof material !== 'string' || material.length > 1024 * 1024 || !material.startsWith('#cloud-config'))
    throw new Error('Unsupported cloud-init material');
  // Token substitution must not alter YAML structure or interpolate another field.
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt)) throw new Error('Malformed site-bound JWT');
  const bound = material.replaceAll('{{ .Token }}', jwt).replaceAll('{{ .token }}', jwt);
  if (/\{\{|\}\}/.test(bound)) throw new Error('Unresolved cloud-init placeholder');
  let parsed: Json;
  try {
    parsed = object(Bun.YAML.parse(bound));
  } catch {
    // YAML diagnostics may contain the issued JWT.
    throw new Error('Malformed cloud-init material');
  }
  if (!Array.isArray(parsed.write_files)) throw new Error('Cloud-init has no issued user data');
  const files = parsed.write_files.map(object);
  if (files.some((file) => file.path === '/etc/vpm/config.yaml'))
    throw new Error('Cloud-init overwrites certified image configuration');
  const userData = files.filter((file) => file.path === '/etc/vpm/user_data');
  if (userData.length !== 1 || typeof userData[0].content !== 'string')
    throw new Error('Cloud-init user data identity is invalid');
  const tokens = userData[0].content.split(/\r?\n/).filter((line) => line.startsWith('token:'));
  if (tokens.length !== 1 || tokens[0].slice('token:'.length).trim() !== jwt)
    throw new Error('Cloud-init does not contain the issued site-bound JWT');
  return bound;
}

/** Invoke only after the immutable release's AWS bootstrap mapping is validated. */
export async function issueAwsBootstrap(siteName: string, tokenName: string, api: Api): Promise<string> {
  if (!siteNamePattern.test(siteName) || !siteNamePattern.test(tokenName))
    throw new Error('Invalid bootstrap identity');
  const token = object(
    await api('/api/register/namespaces/system/tokens', {
      method: 'POST',
      body: JSON.stringify({
        metadata: { name: tokenName, namespace: 'system' },
        spec: { type: 1, site_name: siteName },
      }),
    }),
  );
  const spec = object(token.spec);
  if (
    spec.site_name !== siteName ||
    ![1, 'JWT'].includes(spec.type as string | number) ||
    typeof spec.content !== 'string'
  )
    throw new Error('Issued token is not bound to the requested site');
  const query = new URLSearchParams({ provider: 'aws', site_name: siteName, enable_management_network: 'false' });
  const cloudInit = await api(`/api/register/namespaces/system/get-cloud-init-config?${query}`, { method: 'GET' });
  return bindAwsCloudInit(cloudInit, spec.content);
}
