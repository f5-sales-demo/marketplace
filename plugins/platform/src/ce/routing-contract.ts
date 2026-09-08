import { CE_API_RELEASE, loadPublishedCeApi, type PublishedApiFetcher } from './verified-api-release';
import { projectReplaceSnapshot } from './wire-replace';
import { createWireValidator } from './wire-schema';

type Json = Record<string, unknown>;
export type RoutingKind = 'bgp' | 'external_connector';
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed routing contract');
  return value as Json;
}

/** Schema authority for routing replacement; runtime convergence requires separate observations. */
export class VerifiedRoutingContract {
  readonly identity = 'f5xc-ce-routing-replace-api/v1';
  readonly fingerprint = CE_API_RELEASE.fingerprint;
  readonly commit = CE_API_RELEASE.commit;
  readonly #schemas: Json;
  private constructor(schemas: Json) {
    this.#schemas = schemas;
  }
  static async release(fetcher: PublishedApiFetcher = fetch, signal?: AbortSignal): Promise<VerifiedRoutingContract> {
    const api = await loadPublishedCeApi(fetcher, signal);
    for (const kind of ['bgp', 'external_connector']) {
      const path = object(object(api.paths)[`/api/config/namespaces/{metadata.namespace}/${kind}s/{metadata.name}`]);
      const schema = object(object(object(object(object(path.put).requestBody).content)['application/json']).schema);
      if (schema.$ref !== `#/components/schemas/${kind}ReplaceRequest`)
        throw new Error('Unsupported routing replacement request path');
    }
    return new VerifiedRoutingContract(object(object(api.components).schemas));
  }
  build(kind: RoutingKind, snapshot: Json, desiredSpec: Json, siteUid: string): Json {
    if (!siteUid.trim() || typeof snapshot.resource_version !== 'string' || !snapshot.resource_version)
      throw new Error('Routing replacement requires site UID and resource version');
    const metadata = projectReplaceSnapshot(snapshot.metadata, this.#schemas, 'schemaObjectReplaceMetaType');
    metadata.labels = { ...object(metadata.labels), 'xcsh-ce-site-uid': siteUid };
    const request = { metadata, spec: structuredClone(desiredSpec), resource_version: snapshot.resource_version };
    createWireValidator(this.#schemas, `${kind}ReplaceRequest`)(request);
    return request;
  }
}
