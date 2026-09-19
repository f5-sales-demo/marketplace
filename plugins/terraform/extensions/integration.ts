interface ExtensionApi {
  integrations: { register<T>(definition: unknown): unknown };
}

export function terraformInstallArgv(platform = process.platform): string[] {
  if (platform === 'darwin') return ['brew', 'install', 'terraform'];
  if (platform === 'win32') return ['winget', 'install', '--exact', '--id', 'Hashicorp.Terraform'];
  return ['sudo', 'apt-get', 'install', '--yes', 'terraform'];
}

export default function terraformIntegration(pi: ExtensionApi) {
  pi.integrations.register({
    id: 'terraform',
    name: 'Terraform',
    plugin: 'terraform',
    kind: 'local',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: [],
      profileFields: [],
      steps: [
        {
          kind: 'install',
          argv: terraformInstallArgv(),
          timeoutMs: 300_000,
        },
      ],
      verification: [{ argv: ['terraform', 'version'], timeoutMs: 30_000 }],
    },
    async probe() {
      return Bun.spawnSync(['terraform', 'version']).exitCode === 0
        ? { state: 'ready' }
        : { state: 'setup_required', reason: 'cli_missing' };
    },
  });
}
