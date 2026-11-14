import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { SessionManagerLike } from './artifacts';
import {
  type AzureOperationalRetirementSession,
  readAuthenticatedAzureOperationalRetirementInventory,
} from './network-operational-retirement-session';
import type { AzureNetworkParentFile } from './terraform-network-parent-inventory';
import type { AzureCePlan } from './types';

/** Owning typed enrollment only, not a root allowlist, deletion request or operational gate.
 * Match every native observer file to an actual original-source-authenticated session result.
 * A live key must be retired by its owning workflow before parent/native cleanup can enroll it.
 */
export async function collectAzureOperationalParentDispositions(
  original: AzureCePlan,
  store: CeDeploymentStore,
  publicSession: SessionManagerLike,
  snapshot: AzureNetworkParentFile[],
  session: AzureOperationalRetirementSession,
  signal?: AbortSignal,
) {
  const observed = await readAuthenticatedAzureOperationalRetirementInventory(
    session,
    original,
    store,
    publicSession,
    signal,
  );
  if (observed.signingMaterialPresent) throw Error('Azure operational parent: signing material still present');
  const byPath = new Map(snapshot.map((file) => [file.path, file]));
  if (byPath.size !== snapshot.length) throw Error('Azure operational parent: duplicate native file');
  const paths = new Set<string>();
  const decisions = observed.artifacts.map((artifact) => {
    const file = byPath.get(artifact.path);
    if (
      !file ||
      paths.has(artifact.path) ||
      artifact.action !== 'preserve' ||
      file.identity !== artifact.identity ||
      file.sha256 !== artifact.sha256 ||
      file.packetSha256 !== artifact.packetSha256
    )
      throw Error('Azure operational parent: original authenticated artifact differs from native snapshot');
    paths.add(artifact.path);
    return {
      ...file,
      action: 'preserve' as const,
      schema: artifact.schema,
      semanticProvenanceSha256: artifact.semanticProvenanceSha256,
    };
  });
  const required = snapshot.filter((file) =>
    ['azure-network-observer-', 'azure-network-issuer-', 'azure-network-observation-'].some((prefix) =>
      file.path.startsWith(prefix),
    ),
  );
  if (required.some((file) => !paths.has(file.path)))
    throw Error('Azure operational parent: unclassified observer artifact');
  return decisions;
}
