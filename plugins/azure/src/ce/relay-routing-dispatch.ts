import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { observeAzureRelayRoutingWorkflow } from './relay-observation';
import { ensureAzureRelayRoutingWorkflow } from './relay-workflow';
import type { AzureCePlan } from './types';

/** Select a configuration contract only after saved-plan integrity and engine ownership pass. */
export function requireAzureCeRoutingContract(
  plan: AzureCePlan,
  runtime: Pick<CeRuntime, 'engine' | 'requireRoutingContract' | 'requireAzureRelayRoutingContract'>,
): void {
  verifyAzureCePlan(plan);
  if (runtime.engine !== plan.engine) throw Error('Azure routing execution engine differs from the owning plan');
  if (plan.routing.mode !== 'route-server') return;
  if (plan.relayProfile) runtime.requireAzureRelayRoutingContract();
  else runtime.requireRoutingContract('azure');
}

type Runtime = Parameters<typeof ensureAzureRelayRoutingWorkflow>[2] &
  Parameters<typeof observeAzureRelayRoutingWorkflow>[2];
type Storage = Parameters<typeof ensureAzureRelayRoutingWorkflow>[3] & Pick<CeDeploymentStore, 'write'>;
interface Drivers {
  configure: typeof ensureAzureRelayRoutingWorkflow;
  observe: typeof observeAzureRelayRoutingWorkflow;
}
const defaults: Drivers = { configure: ensureAzureRelayRoutingWorkflow, observe: observeAzureRelayRoutingWorkflow };

/** Execute selected relay configuration and collect current evidence; operational acceptance remains independent. */
export async function configureAzureSelectedRelayRouting(
  plan: AzureCePlan,
  expected: ExpectedCeInterface[],
  runtime: Runtime,
  storage: Storage,
  api: AzExecApi,
  signal?: AbortSignal,
  drivers: Drivers = defaults,
) {
  signal?.throwIfAborted();
  verifyAzureCePlan(plan);
  if (!plan.relayProfile || plan.routing.mode !== 'route-server') throw Error('Azure relay routing is not selected');
  if (runtime.engine !== plan.engine) throw Error('Azure relay routing execution engine differs');
  runtime.requireAzureRelayRoutingContract();
  await storage.verify();
  // Replacement journals are distinct from retained creation evidence; never overwrite its provenance.
  if (plan.relayProfile.schemaVersion === 2) {
    const original = storage;
    const name = (file: string) => `${plan.planId}-replacement-${file}`;
    storage = {
      owner: original.owner,
      verify: () => original.verify(),
      read: (file) => original.read(name(file)),
      write: (file, value) => original.write(name(file), value),
    };
  }
  const configuration = await drivers.configure(plan, expected, runtime, storage, api, signal);
  await storage.write('relay-routing-configuration.json', configuration);
  signal?.throwIfAborted();
  const observation = await drivers.observe(plan, expected, runtime, storage, api, signal);
  await storage.write('relay-routing-observation.json', observation);
  await storage.verify();
  signal?.throwIfAborted();
  return {
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: plan.engine,
    status: observation.routing,
    configuration,
    observation,
    routing: observation.routing,
    traffic: observation.traffic,
    ceSampleFreshnessQualified: observation.ceSampleFreshnessQualified,
  };
}
