import { HttpCeV2Driver } from './ce/driver';
import type { PlatformToolApi } from './types';

interface PlatformExtensionApi extends PlatformToolApi {
  setLabel(label: string): void;
  registerTool(tool: unknown): void;
  integrations: { register<_T>(definition: unknown): unknown };
  settings?: { get(key: string): unknown };
}

type ExtensionFactory = (pi: PlatformExtensionApi) => void | Promise<void>;

function activeContextEnvironment(pi: PlatformExtensionApi): Record<string, string | undefined> {
  const environment = { ...process.env };
  const configured = pi.settings?.get('bash.environment');
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) return environment;
  for (const [name, value] of Object.entries(configured as Record<string, unknown>)) {
    if (/^XCSH_[A-Z0-9_]+$/.test(name) && typeof value === 'string' && process.env[name] === undefined)
      environment[name] = value;
  }
  return environment;
}

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('F5 Distributed Cloud Platform');
  const makeDriver = () => new HttpCeV2Driver(activeContextEnvironment(pi));
  pi.integrations.register({
    id: 'platform',
    name: 'F5 Distributed Cloud Platform',
    plugin: 'platform',
    kind: 'local',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: ['XCSH_API_URL', 'XCSH_API_TOKEN', 'XCSH_TENANT'],
      profileFields: [],
      steps: [],
      verification: [],
      guidedAction: { kind: 'context_wizard' },
    },
    async probe() {
      const environment = activeContextEnvironment(pi);
      const url = environment.XCSH_API_URL;
      const token = environment.XCSH_API_TOKEN;
      const tenant = environment.XCSH_TENANT;
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
  pi.registerTool(createF5xcCeV2CapabilitiesTool(pi, makeDriver));
  pi.registerTool(createF5xcCeV2SiteTool(pi, makeDriver));
  pi.registerTool(createF5xcCeV2BootstrapTool(pi, makeDriver));
  pi.registerTool(createF5xcCeV2StatusTool(pi));
};

export default factory;
