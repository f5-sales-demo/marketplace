import type { CeEventBus } from '../../platform/src/ce/service';
import { createCeTerraformService, registerCeTerraformService, requestPlatform } from './service';

export default function factory(pi: { events: CeEventBus; setLabel(label: string): void }): void {
  pi.setLabel('Terraform CE lifecycle execution');
  registerCeTerraformService(
    pi.events,
    createCeTerraformService(() => requestPlatform(pi.events)),
  );
}
