export { collectOriginalGcpTerraformBootstrap, readOriginalGcpTerraformBootstrapJwt } from './gcp-bootstrap-evidence';

import type { CeEventBus } from '../../platform/src/ce/service';
import { assertInstalledRuntime, createInstalledRuntimeResolver } from './installed-runtime';
import { createCeTerraformService, registerCeTerraformService, requestPlatform } from './service';

export default function factory(pi: { events: CeEventBus; setLabel(label: string): void }): void {
  pi.setLabel('Terraform CE lifecycle execution');
  const service = createCeTerraformService(() => requestPlatform(pi.events), {
    resolveRuntime: createInstalledRuntimeResolver(),
  });
  registerCeTerraformService(pi.events, {
    ...service,
    assertNewRuntime: async (provider: string) => {
      if (provider === 'gcp') await assertInstalledRuntime();
    },
  });
}
