import { fileURLToPath } from 'node:url';

interface ExtensionApi {
  integrations: { register<T>(definition: unknown): unknown };
}

export default function firecrawlIntegration(pi: ExtensionApi) {
  pi.integrations.register({
    id: 'firecrawl',
    name: 'Firecrawl',
    plugin: 'firecrawl',
    kind: 'local',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: [],
      profileFields: [],
      steps: [],
      verification: [
        {
          argv: ['python3', fileURLToPath(new URL('../scripts/firecrawl_status.py', import.meta.url)), '--check'],
          timeoutMs: 15_000,
        },
      ],
    },
    async probe() {
      let url: URL;
      try {
        url = new URL(process.env.FIRECRAWL_API_URL ?? 'http://127.0.0.1:3002/');
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
          throw new Error('Invalid endpoint');
        url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
      } catch {
        return { state: 'setup_required', reason: 'invalid_configuration' };
      }
      try {
        const response = await fetch(url.toString(), {
          signal: AbortSignal.timeout(5_000),
          redirect: 'error',
        });
        if (!response.ok) return { state: 'setup_required', reason: 'invalid_response' };
        try {
          const body = await response.json();
          return body?.message === 'Firecrawl API' && body?.documentation_url === 'https://docs.firecrawl.dev'
            ? { state: 'ready' }
            : { state: 'setup_required', reason: 'invalid_response' };
        } catch {
          return { state: 'setup_required', reason: 'invalid_response' };
        }
      } catch {
        return { state: 'setup_required', reason: 'network' };
      }
    },
  });
}
