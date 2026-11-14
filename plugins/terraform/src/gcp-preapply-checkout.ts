import { join } from 'node:path';
import { checkoutGcpBootstrap, storeGcpBootstrap } from '../../gcloud/src/ce/bootstrap-checkout';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../platform/src/ce/process-lock';
import {
  type OriginalGcpPreapplyBootstrapEvidence,
  readOriginalGcpPreapplyBootstrapJwt,
} from './gcp-preapply-bootstrap';

type Store = Pick<CeDeploymentStore, 'owner' | 'directory' | 'verify' | 'read' | 'write'>;

/** Trusted server-only checkout. Consume through shared private storage before
 * returning user-data; a claimed/uncertain attempt cannot replay after restart.
 * Original insertion and guest/network acceptance remain separate gates.
 */
export async function checkoutOriginalGcpPreapplyBootstrap(
  evidence: OriginalGcpPreapplyBootstrapEvidence,
  store: Store,
): Promise<string> {
  const jwt = await readOriginalGcpPreapplyBootstrapJwt(evidence);
  const bootstrap = evidence.bootstrap;
  const expected = Object.freeze({ ...bootstrap.owner });
  const directory = store.directory;
  const verify = async () => {
    await store.verify();
    if (
      store.directory !== directory ||
      (['provider', 'engine', 'account', 'region', 'deploymentId'] as const).some(
        (key) => store.owner[key] !== expected[key],
      )
    )
      throw new Error('Original bootstrap storage scope differs');
  };
  await verify();
  const release = await acquireProcessLock(join(directory, '.gcp-original-bootstrap-lock'));
  try {
    await verify();
    const name = `gcp-preapply-bootstrap-${bootstrap.nodeName}.json`;
    let prior: unknown;
    try {
      prior = await store.read(name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (prior !== undefined) throw new Error('Original preapply bootstrap already claimed; reconcile without replay');
    const record = {
      schemaVersion: 2,
      kind: 'original-gcp-preapply-bootstrap-checkout',
      owner: expected,
      siteName: bootstrap.siteName,
      nodeName: bootstrap.nodeName,
      tokenName: bootstrap.tokenName,
      expiresAt: bootstrap.expiresAt,
      planSha256: evidence.planSha256,
      readerResultSha256: evidence.readerResultSha256,
      siteCreationSha256: evidence.siteCreationSha256,
      tokenCreationSha256: evidence.tokenCreationSha256,
      jwtSha256: bootstrap.jwtSha256,
    };
    // A partial issuance or uncertain flush remains claimed, never a fresh retry.
    await store.write(name, { ...record, state: 'claiming' });
    const scoped = {
      read: (name: string) => store.read(name),
      write: async (name: string, value: unknown) => {
        await verify();
        await store.write(name, value);
        await verify();
      },
      exclusive: async <T>(fn: () => Promise<T>) => {
        await verify();
        return fn();
      },
    };
    const owner = {
      project: expected.account,
      deploymentName: bootstrap.deploymentName,
      siteName: bootstrap.siteName,
      nodeName: bootstrap.nodeName,
      engine: expected.engine,
    };
    await storeGcpBootstrap(scoped, owner, { ...owner, jwt, expiresAt: bootstrap.expiresAt });
    // Recheck original sources after persistence, before single-use consumption.
    if ((await readOriginalGcpPreapplyBootstrapJwt(evidence)) !== jwt)
      throw new Error('Original bootstrap material changed');
    const material = await checkoutGcpBootstrap(scoped, owner);
    await store.write(name, { ...record, state: 'consumed' });
    await verify();
    return material;
  } finally {
    await release();
  }
}
