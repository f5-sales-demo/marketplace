import { CE_API_RELEASE, loadPublishedCeApi, type PublishedApiFetcher } from './verified-api-release';
import { buildInsideHttpListener, type InsideHttpListener, projectInsideHttpListener } from './wire-ingress';
import { buildSiteLocalHttpOrigin, projectSiteLocalHttpOrigin, type SiteLocalHttpOrigin } from './wire-origin';
import { createWireValidator } from './wire-schema';

type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed ingress contract');
  return value as Json;
}

/** HTTP schema authority is independent of SMSv2 bootstrap capability and live ingress acceptance. */
export class VerifiedIngressContract {
  readonly identity = 'f5xc-ce-http-ingress-api/v1';
  readonly publication = 'immutable-release';
  readonly releaseTag = CE_API_RELEASE.tag;
  readonly commit = CE_API_RELEASE.commit;
  readonly fingerprint = CE_API_RELEASE.fingerprint;
  readonly #validate: (spec: unknown) => void;
  readonly #validateOrigin: (spec: unknown) => void;
  readonly #schemas: Json;
  private constructor(schemas: Json) {
    this.#schemas = schemas;
    this.#validate = createWireValidator(schemas, 'viewshttp_loadbalancerCreateSpecType');
    this.#validateOrigin = createWireValidator(schemas, 'viewsorigin_poolCreateSpecType');
  }
  static async release(fetcher: PublishedApiFetcher = fetch, signal?: AbortSignal): Promise<VerifiedIngressContract> {
    const api = await loadPublishedCeApi(fetcher, signal);
    const path = object(object(api.paths)['/api/config/namespaces/{metadata.namespace}/http_loadbalancers']);
    const schema = object(object(object(object(object(path.post).requestBody).content)['application/json']).schema);
    if (schema.$ref !== '#/components/schemas/http_loadbalancerCreateRequest')
      throw new Error('Unsupported ingress request path');
    const origin = object(object(api.paths)['/api/config/namespaces/{metadata.namespace}/origin_pools']);
    const originSchema = object(
      object(object(object(object(origin.post).requestBody).content)['application/json']).schema,
    );
    if (originSchema.$ref !== '#/components/schemas/origin_poolCreateRequest')
      throw new Error('Unsupported origin request path');
    return new VerifiedIngressContract(object(object(api.components).schemas));
  }
  build(input: InsideHttpListener) {
    return buildInsideHttpListener(input, this.#validate);
  }
  buildOrigin(input: SiteLocalHttpOrigin) {
    return buildSiteLocalHttpOrigin(input, this.#validateOrigin);
  }
  projectObserved(spec: unknown): Json {
    return projectInsideHttpListener(spec, this.#schemas, this.#validate);
  }
  projectOriginObserved(spec: unknown): Json {
    return projectSiteLocalHttpOrigin(spec, this.#schemas, this.#validateOrigin);
  }
}
