import {
  type CeEventBus,
  createCePlatformService,
  registerCePlatformService,
  requestTerraformResourceMutation,
} from './ce/service';
import { presentTool as enrichTool } from './presentation';
import type { PlatformToolApi, PlatformToolContext } from './types';

interface PlatformExtensionApi extends PlatformToolApi {
  presentation: import('@f5-sales-demo/xcsh/presentation').PresentationAPI;
  setLabel(label: string): void;
  registerTool(tool: unknown): void;
  events?: CeEventBus;
  integrations: { register<_T>(definition: unknown): unknown };
  settings?: { get(key: string): unknown };
  on?: (event: 'session_start' | 'context', handler: (event: unknown, context: PlatformToolContext) => void) => void;
}

type ExtensionFactory = (pi: PlatformExtensionApi) => void | Promise<void>;

function activeContextEnvironment(
  pi: PlatformExtensionApi,
  settings?: PlatformToolContext['settings'],
): Record<string, string | undefined> {
  const environment = { ...process.env };
  const configured = (settings ?? pi.settings)?.get('bash.environment');
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) return environment;
  for (const [name, value] of Object.entries(configured as Record<string, unknown>)) {
    if (/^XCSH_[A-Z0-9_]+$/.test(name) && typeof value === 'string' && process.env[name] === undefined)
      environment[name] = value;
  }
  return environment;
}

const factory: ExtensionFactory = async (pi) => {
  const presentTool = <T extends { name: string; label?: string }>(tool: T) => enrichTool(tool, pi.presentation);
  pi.setLabel('F5 Distributed Cloud Platform');
  let sessionSettings: PlatformToolContext['settings'];
  const observeSession = (_event: unknown, context: PlatformToolContext) => {
    sessionSettings = context.settings;
  };
  pi.on?.('session_start', observeSession);
  pi.on?.('context', observeSession);
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
      const environment = activeContextEnvironment(pi, sessionSettings);
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
  const service = createCePlatformService(
    () => activeContextEnvironment(pi, sessionSettings),
    undefined,
    (contextName, tenantOrigin) => {
      if (!pi.events) throw new Error('Terraform platform service is unavailable');
      return requestTerraformResourceMutation(pi.events, contextName, tenantOrigin);
    },
  );
  if (pi.events) registerCePlatformService(pi.events, service);
  const makeService = (context?: PlatformToolContext) => {
    if (context?.settings) sessionSettings = context.settings;
    return service;
  };
  if (typeof pi.registerTool !== 'function') return;
  const { createF5xcCeV2SiteTool } = await import('./tools/f5xc-ce-v2-site');
  const { createF5xcCeV2BootstrapTool } = await import('./tools/f5xc-ce-v2-bootstrap');
  const { createF5xcCeV2StatusTool } = await import('./tools/f5xc-ce-v2-status');
  const { createF5xcCeV2CapabilitiesTool } = await import('./tools/f5xc-ce-v2-capabilities');
  pi.registerTool(presentTool(createF5xcCeV2CapabilitiesTool(pi, makeService)));
  pi.registerTool(presentTool(createF5xcCeV2SiteTool(pi, makeService)));
  pi.registerTool(presentTool(createF5xcCeV2BootstrapTool(pi, makeService)));
  pi.registerTool(presentTool(createF5xcCeV2StatusTool(pi, makeService)));
};

export default factory;
