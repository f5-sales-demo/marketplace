import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

type Environment = Record<string, string | undefined>;

export function credentialAuthMethods(env: Environment = process.env) {
  const principal = !!env.AZURE_CLIENT_ID && !!env.AZURE_TENANT_ID;
  return [
    { key: 'managed_identity', label: 'managed identity', available: env.AZURE_USE_MANAGED_IDENTITY === 'true' },
    {
      key: 'workload_federation',
      label: 'workload federation',
      available: principal && !!env.AZURE_FEDERATED_TOKEN_FILE,
    },
    {
      key: 'certificate',
      label: 'service principal certificate',
      available: principal && !!env.AZURE_CLIENT_CERTIFICATE_PATH,
    },
    { key: 'service_principal', label: 'service principal secret', available: principal && !!env.AZURE_CLIENT_SECRET },
  ];
}

/** Private subprocess boundary: credential arguments and CLI diagnostics never enter the tool transcript. */
export async function loginWithCredential(
  key: string,
  env: Environment = process.env,
  run: (args: string[]) => Promise<number> = async (args) => {
    const child = Bun.spawn(['az', ...args], { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);
    try {
      return await child.exited;
    } finally {
      clearTimeout(timer);
    }
  },
): Promise<boolean> {
  try {
    if (!credentialAuthMethods(env).some((method) => method.key === key && method.available)) return false;
    const args = ['login', '--output', 'none', '--only-show-errors'];
    if (key === 'managed_identity') {
      args.push('--identity');
      if (env.AZURE_CLIENT_ID) args.push('--client-id', env.AZURE_CLIENT_ID);
    } else {
      args.push('--service-principal', '--username', env.AZURE_CLIENT_ID ?? '', '--tenant', env.AZURE_TENANT_ID ?? '');
      if (key === 'certificate') args.push('--certificate', env.AZURE_CLIENT_CERTIFICATE_PATH ?? '');
      else if (key === 'workload_federation') {
        const fd = openSync(env.AZURE_FEDERATED_TOKEN_FILE ?? '', 'r');
        let token: string;
        try {
          const stat = fstatSync(fd);
          if (!stat.isFile() || stat.size < 1 || stat.size > 65_536) return false;
          const buffer = Buffer.alloc(65_537);
          const bytes = readSync(fd, buffer, 0, buffer.length, 0);
          if (bytes > 65_536 || bytes !== stat.size) return false;
          token = buffer.subarray(0, bytes).toString('utf8').trim();
        } finally {
          closeSync(fd);
        }
        if (!token || token.length > 65_536 || /\s/.test(token)) return false;
        args.push(`--federated-token=${token}`);
      } else args.push(`--password=${env.AZURE_CLIENT_SECRET}`);
    }
    return (await run(args)) === 0;
  } catch {
    return false;
  }
}
