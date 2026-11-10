import { type InitialSiteVersions, initialSoftwareSettings } from './initial-versions';
import { CE_API_RELEASE, loadPublishedCeApi, type PublishedApiFetcher } from './verified-api-release';
import { createWireValidator } from './wire-schema';
import { buildSiteUpgradeRequest, type SiteUpgradeIntent } from './wire-upgrade';

type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed upgrade contract');
  return value as Json;
}
const routes = {
  software: ['/api/config/namespaces/{namespace}/sites/{name}/upgrade_sw', 'post', 'siteUpgradeSWRequest'],
  os: ['/api/config/namespaces/{namespace}/sites/{name}/upgrade_os', 'post', 'siteUpgradeOSRequest'],
  site: ['/api/config/namespaces/{namespace}/sites/{name}', 'get', 'siteGetResponse'],
  targets: ['/api/maurice/upgradable_sw_versions', 'get', 'upgrade_statusGetUpgradableSWVersionsResponse'],
  precheck: [
    '/api/maurice/namespaces/{namespace}/sites/{name}/pre_upgrade_check',
    'get',
    'upgrade_statusPreUpgradeCheckResponse',
  ],
  progress: [
    '/api/maurice/namespaces/{namespace}/sites/{name}/upgrade_status',
    'get',
    'upgrade_statusGetUpgradeStatusResponse',
  ],
} as const;

/** Published action schemas do not establish eligibility, completion or cross-cloud acceptance. */
export class VerifiedUpgradeContract {
  readonly identity = 'f5xc-ce-upgrade-api/v1';
  readonly publication = 'immutable-release';
  readonly releaseTag = CE_API_RELEASE.tag;
  readonly commit = CE_API_RELEASE.commit;
  readonly fingerprint = CE_API_RELEASE.fingerprint;
  readonly #software: (body: unknown) => void;
  readonly #os: (body: unknown) => void;
  private constructor(schemas: Json) {
    this.#software = createWireValidator(schemas, 'siteUpgradeSWRequest');
    this.#os = createWireValidator(schemas, 'siteUpgradeOSRequest');
  }
  static async release(fetcher: PublishedApiFetcher = fetch, signal?: AbortSignal): Promise<VerifiedUpgradeContract> {
    const api = await loadPublishedCeApi(fetcher, signal);
    const paths = object(api.paths);
    for (const [path, method, schemaName] of Object.values(routes)) {
      const operation = object(object(paths[path])[method]);
      const container = method === 'post' ? object(operation.requestBody) : object(object(operation.responses)['200']);
      const schema = object(object(object(container.content)['application/json']).schema);
      if (schema.$ref !== `#/components/schemas/${schemaName}`) throw new Error('Upgrade API path or schema differs');
    }
    return new VerifiedUpgradeContract(object(object(api.components).schemas));
  }
  observationPaths(siteName: string, current: InitialSiteVersions, targetSoftware: string) {
    initialSoftwareSettings(current);
    this.build({ siteName, kind: 'software', version: targetSoftware });
    return {
      site: `/api/config/namespaces/system/sites/${siteName}`,
      targets: `/api/maurice/upgradable_sw_versions?${new URLSearchParams({ current_os_version: current.os, current_sw_version: current.software })}`,
      precheck: `/api/maurice/namespaces/system/sites/${siteName}/pre_upgrade_check?${new URLSearchParams({ sw_version: targetSoftware })}`,
      progress: `/api/maurice/namespaces/system/sites/${siteName}/upgrade_status`,
    };
  }
  build(input: SiteUpgradeIntent) {
    return buildSiteUpgradeRequest(input, input.kind === 'software' ? this.#software : this.#os);
  }
}
