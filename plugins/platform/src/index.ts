import type { PlatformToolApi } from './types';

interface PlatformExtensionApi extends PlatformToolApi {
  setLabel(label: string): void;
  registerTool(tool: unknown): void;
  integrations: { register<T>(definition: unknown): unknown };
}

type ExtensionFactory = (pi: PlatformExtensionApi) => void | Promise<void>;

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('F5 Distributed Cloud Platform');
  pi.integrations.register({
    id: 'platform',
    name: 'F5 Distributed Cloud Platform',
    plugin: 'platform',
    kind: 'local',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: ['F5XC_API_URL', 'F5XC_API_TOKEN', 'F5XC_TENANT'],
      profileFields: [],
      steps: [],
      verification: [],
    },
    async probe() {
      const url = process.env.F5XC_API_URL;
      const token = process.env.F5XC_API_TOKEN;
      const tenant = process.env.F5XC_TENANT;
      if (!url || !token || !tenant) return { state: 'setup_required', reason: 'not_authenticated' };
      try {
        new URL(url);
        return { state: 'ready', value: { tenantConfigured: true } };
      } catch {
        return { state: 'error', reason: 'invalid_response' };
      }
    },
  });
  if (typeof pi.registerTool !== 'function') return;
  const { createF5xcCeV2SiteTool } = await import('./tools/f5xc-ce-v2-site');
  const { createF5xcCeV2BootstrapTool } = await import('./tools/f5xc-ce-v2-bootstrap');
  const { createF5xcCeV2StatusTool } = await import('./tools/f5xc-ce-v2-status');
  const { createF5xcCeV2CapabilitiesTool } = await import('./tools/f5xc-ce-v2-capabilities');
  pi.registerTool(createF5xcCeV2CapabilitiesTool(pi));
  pi.registerTool(createF5xcCeV2SiteTool(pi));
  pi.registerTool(createF5xcCeV2BootstrapTool(pi));
  pi.registerTool(createF5xcCeV2StatusTool(pi));
};

export default factory;
