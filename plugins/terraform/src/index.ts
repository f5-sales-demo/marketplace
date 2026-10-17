import type { CeOwner } from '../../platform/src/ce/runtime';
import { CE_TERRAFORM_RESOURCE_CHANNEL, type CeEventBus } from '../../platform/src/ce/service';
import { executeF5TerraformResource } from './f5-resources';
import { createCeTerraformService, registerCeTerraformService, requestPlatform } from './service';

export default function factory(pi: { events: CeEventBus; setLabel(label: string): void }): void {
  pi.setLabel('Terraform CE lifecycle execution');
  const service = createCeTerraformService(() => requestPlatform(pi.events));
  registerCeTerraformService(pi.events, service);
  pi.events.on(CE_TERRAFORM_RESOURCE_CHANNEL, (value) => {
    if (!value || typeof value !== 'object') return;
    const request = value as {
      owner: CeOwner;
      path: string;
      init: RequestInit;
      contextName?: string;
      tenantOrigin?: string;
      signal?: AbortSignal;
      resolve: (value: Record<string, unknown>) => void;
      reject: (error: Error) => void;
    };
    if (typeof request.resolve !== 'function' || typeof request.reject !== 'function') return;
    void requestPlatform(pi.events)
      .then((platform) =>
        executeF5TerraformResource(
          platform,
          service,
          request.owner,
          request.path,
          request.init,
          request.contextName,
          request.signal,
          request.tenantOrigin,
        ),
      )
      .then(request.resolve, (error) =>
        request.reject(error instanceof Error ? error : new Error('F5 Terraform operation failed')),
      );
  });
}
