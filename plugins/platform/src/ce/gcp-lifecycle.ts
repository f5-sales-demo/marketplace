import type { GcpBootstrapStore } from '../../../gcloud/src/ce/bootstrap-checkout';
import type { GcpBootstrapIssueDriver } from '../../../gcloud/src/ce/bootstrap-issue';
import type { GcpCeContractBoundary } from '../../../gcloud/src/ce/contract';
import { fingerprint } from '../../../gcloud/src/ce/discovery';
import type { GcpCeIntent } from '../../../gcloud/src/ce/types';
import { validateIntent } from '../../../gcloud/src/ce/validation';

type Json = Record<string, unknown>;
export interface GcpLifecyclePort {
  read(path: string, signal?: AbortSignal): Promise<Json | null>;
  mutate(path: string, method: 'POST' | 'DELETE', body?: Json, signal?: AbortSignal): Promise<Json>;
}
/** Internal single-node driver; callers must hold the deployment lock and exact plan authorization. */
export class GcpPlatformLifecycle {
  readonly #site: string;
  readonly #node: string;
  readonly #spec: Json;
  readonly #binding: string;
  constructor(
    readonly store: GcpBootstrapStore,
    readonly intent: GcpCeIntent,
    readonly contract: GcpCeContractBoundary,
    readonly port: GcpLifecyclePort,
  ) {
    this.intent = structuredClone(intent);
    this.contract = structuredClone(contract);
    validateIntent(intent);
    const profile = contract.singleNodeLifecycle as
      | { site_create?: { spec?: Json }; node_count?: number; interface_count?: number }
      | undefined;
    if (
      !profile?.site_create?.spec ||
      profile.node_count !== 1 ||
      profile.interface_count !== 2 ||
      intent.engine !== 'native' ||
      intent.sites.length !== 1 ||
      intent.sites[0].nodes.length !== 1 ||
      intent.sites[0].nodes[0].interfaces.length !== 2 ||
      intent.sites[0].nodes[0].interfaces[1].role !== 'sli'
    )
      throw new Error('Qualified native one-node two-interface lifecycle required');
    this.#site = intent.sites[0].name;
    this.#node = intent.sites[0].nodes[0].name;
    this.#spec = structuredClone(profile.site_create.spec);
    this.#binding = fingerprint({ intent, contract: contract.release.contractDigest });
  }
  #unchanged() {
    if (fingerprint({ intent: this.intent, contract: this.contract.release.contractDigest }) !== this.#binding)
      throw new Error('GCP lifecycle intent changed after admission');
  }
  #path() {
    return `/api/config/namespaces/system/securemesh_site_v2s/${this.#site}`;
  }
  #labels() {
    return { 'xcsh-deployment': this.intent.deploymentName, 'xcsh-engine': 'native' };
  }
  #owned(value: Json) {
    const metadata = value.metadata as
      | { name?: string; namespace?: string; labels?: Record<string, string> }
      | undefined;
    const uid = (value.system_metadata as { uid?: string } | undefined)?.uid;
    if (
      metadata?.name !== this.#site ||
      metadata.namespace !== 'system' ||
      metadata.labels?.['xcsh-deployment'] !== this.intent.deploymentName ||
      metadata.labels['xcsh-engine'] !== 'native' ||
      typeof uid !== 'string' ||
      !uid
    )
      throw new Error('GCP site identity/ownership differs');
    return uid;
  }
  async #checkpoint(): Promise<
    { binding: string; state: 'submitting' | 'created' | 'deleting' | 'absent'; uid?: string } | undefined
  > {
    let saved: { binding: string; state: 'submitting' | 'created' | 'deleting' | 'absent'; uid?: string } | undefined;
    try {
      saved = (await this.store.read(`gcp-site-${this.#site}.json`)) as {
        binding: string;
        state: 'submitting' | 'created' | 'deleting' | 'absent';
        uid?: string;
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (
      saved &&
      (saved.binding !== this.#binding || !['submitting', 'created', 'deleting', 'absent'].includes(saved.state))
    )
      throw new Error('GCP site checkpoint differs');
    return saved;
  }
  async ensureSite(signal?: AbortSignal) {
    this.#unchanged();
    signal?.throwIfAborted();
    const checkpoint = await this.#checkpoint();
    if (checkpoint?.state === 'deleting' || checkpoint?.state === 'absent')
      throw new Error('Deleted site requires a new deployment identity');
    let observed = await this.port.read(this.#path(), signal);
    if (observed && !checkpoint) throw new Error('Preexisting GCP site collision');
    if (!observed) {
      if (checkpoint) throw new Error('Ambiguous site creation requires reconciliation');
      await this.store.write(`gcp-site-${this.#site}.json`, { binding: this.#binding, state: 'submitting' });
      await this.port.mutate(
        '/api/config/namespaces/system/securemesh_site_v2s',
        'POST',
        { metadata: { name: this.#site, namespace: 'system', labels: this.#labels() }, spec: this.#spec },
        signal,
      );
      observed = await this.port.read(this.#path(), signal);
    }
    if (!observed) throw new Error('Site creation still converging');
    const uid = this.#owned(observed);
    if (checkpoint?.uid && checkpoint.uid !== uid) throw new Error('GCP site replaced during creation');
    await this.store.write(`gcp-site-${this.#site}.json`, { binding: this.#binding, state: 'created', uid });
    return { siteName: this.#site, uid, created: true };
  }
  async deleteSite(signal?: AbortSignal) {
    this.#unchanged();
    signal?.throwIfAborted();
    const checkpoint = await this.#checkpoint();
    if (!checkpoint?.uid) throw new Error('Exact owned GCP site deletion checkpoint required');
    const observed = await this.port.read(this.#path(), signal);
    if (observed) {
      if (this.#owned(observed) !== checkpoint.uid) throw new Error('GCP site was replaced before deletion');
      if (checkpoint.state !== 'deleting') {
        await this.store.write(`gcp-site-${this.#site}.json`, { ...checkpoint, state: 'deleting' });
        await this.port.mutate(this.#path(), 'DELETE', undefined, signal);
      }
      if (await this.port.read(this.#path(), signal)) return { siteName: this.#site, absent: false };
    }
    await this.store.write(`gcp-site-${this.#site}.json`, { ...checkpoint, state: 'absent' });
    return { siteName: this.#site, absent: true };
  }
  bootstrapDriver(): GcpBootstrapIssueDriver {
    return {
      assertSiteOwnership: async (owner, signal) => {
        this.#unchanged();
        if (
          owner.project !== this.intent.project ||
          owner.deploymentName !== this.intent.deploymentName ||
          owner.engine !== 'native' ||
          owner.siteName !== this.#site ||
          owner.nodeName !== this.#node
        )
          throw new Error('Bootstrap node binding differs');
        const checkpoint = await this.#checkpoint(),
          observed = await this.port.read(this.#path(), signal);
        if (!checkpoint?.uid || checkpoint.state !== 'created' || !observed || this.#owned(observed) !== checkpoint.uid)
          throw new Error('Exact created GCP site required for bootstrap');
      },
      readToken: (name, signal) => {
        if (!/^[a-z][a-z0-9-]{0,62}$/.test(name)) throw new Error('Invalid bound token name');
        return this.port.read(`/api/register/namespaces/system/tokens/${name}`, signal);
      },
      createToken: (name, owner, signal) =>
        this.port.mutate(
          '/api/register/namespaces/system/tokens',
          'POST',
          {
            metadata: { name, namespace: 'system', labels: { ...this.#labels(), 'xcsh-node': owner.nodeName } },
            spec: { type: 1, site_name: this.#site },
          },
          signal,
        ),
    };
  }
  async revokeToken(tokenName: string, signal?: AbortSignal) {
    this.#unchanged();
    signal?.throwIfAborted();
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(tokenName)) throw new Error('Invalid bound token name');
    const path = `/api/register/namespaces/system/tokens/${tokenName}`;
    const name = `gcp-token-revoke-${tokenName}.json`;
    let saved: { binding: string; state: 'deleting' | 'absent' } | undefined;
    try {
      saved = (await this.store.read(name)) as typeof saved;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (saved && saved.binding !== this.#binding) throw new Error('Token revocation checkpoint differs');
    const value = await this.port.read(path, signal);
    if (value) {
      const metadata = value.metadata as
        | { name?: string; namespace?: string; labels?: Record<string, string> }
        | undefined;
      const spec = value.spec as { site_name?: string } | undefined;
      if (
        metadata?.name !== tokenName ||
        metadata.namespace !== 'system' ||
        metadata.labels?.['xcsh-deployment'] !== this.intent.deploymentName ||
        metadata.labels['xcsh-engine'] !== 'native' ||
        metadata.labels['xcsh-node'] !== this.#node ||
        spec?.site_name !== this.#site
      )
        throw new Error('Registration token revocation ownership differs');
      if (!saved) {
        await this.store.write(name, { binding: this.#binding, state: 'deleting' });
        await this.port.mutate(path, 'DELETE', undefined, signal);
      }
      if (await this.port.read(path, signal)) return { tokenName, absent: false };
    }
    await this.store.write(name, { binding: this.#binding, state: 'absent' });
    return { tokenName, absent: true };
  }
}
