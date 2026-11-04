import { join } from 'node:path';

interface ExtensionApi {
  integrations: { register(definition: unknown): unknown };
}

export function terraformInstallArgv(platform = process.platform): string[] {
  if (platform === 'darwin') return ['brew', 'install', 'terraform'];
  if (platform === 'win32') return ['winget', 'install', '--exact', '--id', 'Hashicorp.Terraform'];
  return ['python3', join(import.meta.dir, '../scripts/install_terraform.py')];
}

export function terraformRuntimeInstallArgv(platform = process.platform): string[] {
  if (platform !== 'linux') throw new Error('Qualified observer runtime requires Linux AMD64');
  return ['python3', '-I', '-B', join(import.meta.dir, '../scripts/install_runtime.py')];
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
        ...(process.platform === 'linux'
          ? [{ kind: 'install', argv: terraformRuntimeInstallArgv(), timeoutMs: 300_000 }]
          : []),
      ],
      verification: [
        { argv: ['terraform', 'version'], timeoutMs: 30_000 },
        ...(process.platform === 'linux'
          ? [{ argv: [...terraformRuntimeInstallArgv(), '--check'], timeoutMs: 30_000 }]
          : []),
      ],
    },
    async probe() {
      try {
        if (Bun.spawnSync(['terraform', 'version']).exitCode !== 0)
          return { state: 'setup_required', reason: 'cli_missing' };
        if (process.platform === 'linux') {
          try {
            if (Bun.spawnSync([...terraformRuntimeInstallArgv(), '--check']).exitCode !== 0)
              return { state: 'setup_required', reason: 'observer_runtime_missing_or_unverified' };
          } catch (error) {
            if ((error as { code?: string } | null)?.code === 'ENOENT')
              return { state: 'setup_required', reason: 'observer_runtime_missing_or_unverified' };
            throw error;
          }
        }
        return { state: 'ready' };
      } catch (error) {
        if ((error as { code?: string } | null)?.code === 'ENOENT')
          return { state: 'setup_required', reason: 'cli_missing' };
        throw error;
      }
    },
  });
}
