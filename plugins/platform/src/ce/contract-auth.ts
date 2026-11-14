import { execFileSync } from 'node:child_process';

export function existingContractCredential(env: Record<string, string | undefined> = process.env): string | undefined {
  const configured = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (configured) return configured;
  try {
    return (
      execFileSync('gh', ['auth', 'token'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

export function contractHeaders(url: string, token?: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  const target = new URL(url);
  if (
    token &&
    target.origin === 'https://api.github.com' &&
    target.pathname.startsWith('/repos/f5-sales-demo/api-specs-enriched/')
  )
    headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function authenticatedContractHeaders(url: string): Record<string, string> {
  const target = new URL(url);
  const scoped =
    target.origin === 'https://api.github.com' &&
    target.pathname.startsWith('/repos/f5-sales-demo/api-specs-enriched/');
  return contractHeaders(url, scoped ? existingContractCredential() : undefined);
}
