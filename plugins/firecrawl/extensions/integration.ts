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
      verification: [{ argv: ['curl', '--fail', '--silent', 'http://127.0.0.1:3002/'], timeoutMs: 30_000 }],
    },
    async probe() {
      const url = process.env.FIRECRAWL_API_URL ?? 'http://127.0.0.1:3002/';
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
        return response.ok ? { state: 'ready' } : { state: 'setup_required', reason: 'invalid_response' };
      } catch {
        return { state: 'setup_required', reason: 'network' };
      }
    },
  });
}
