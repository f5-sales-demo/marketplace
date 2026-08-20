import type { PlatformToolApi } from './types';

interface PlatformExtensionApi extends PlatformToolApi {
  setLabel(label: string): void;
  registerTool(tool: unknown): void;
}

type ExtensionFactory = (pi: PlatformExtensionApi) => void | Promise<void>;

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('F5 Distributed Cloud Platform');
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
