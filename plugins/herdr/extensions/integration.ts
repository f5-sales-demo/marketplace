interface ExtensionApi {
  integrations: { register<T>(definition: unknown): unknown };
}

export default function herdrIntegration(pi: ExtensionApi) {
  pi.integrations.register({
    id: 'herdr',
    name: 'Herdr',
    plugin: 'herdr',
    kind: 'local',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: ['HERDR_ENV'],
      profileFields: [],
      steps: [],
      verification: [{ argv: ['herdr', '--version'], timeoutMs: 30_000 }],
    },
    async probe() {
      if (process.env.HERDR_ENV !== '1') return { state: 'setup_required', reason: 'dependency_missing' };
      return Bun.spawnSync(['herdr', '--version']).exitCode === 0
        ? { state: 'ready' }
        : { state: 'setup_required', reason: 'cli_missing' };
    },
  });
}
