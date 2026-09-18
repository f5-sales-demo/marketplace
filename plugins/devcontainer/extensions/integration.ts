interface ExtensionApi {
  integrations: { register<T>(definition: unknown): unknown };
}

export default function devcontainerIntegration(pi: ExtensionApi) {
  pi.integrations.register({
    id: 'devcontainer',
    name: 'Development container',
    plugin: 'devcontainer',
    kind: 'local',
    async probe() {
      const active =
        process.env.REMOTE_CONTAINERS === 'true' ||
        process.env.CODESPACES === 'true' ||
        Bun.file('/.dockerenv').size > 0;
      return active ? { state: 'ready' } : { state: 'unavailable', reason: 'dependency_missing' };
    },
  });
}
