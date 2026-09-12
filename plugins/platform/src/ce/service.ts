import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from './deployment-store';
import { type CeOwner, CeRuntime } from './runtime';
import { type AzureRouteServerEbgpMultihopCapability, VerifiedCeContract } from './verified-contract';

export const CE_SERVICE_CHANNEL = 'xcsh:ce-platform:v2:service';
export interface CeEventBus {
  emit(channel: string, data: unknown): void;
  on(channel: string, handler: (data: unknown) => void): () => void;
}
export interface CeCapabilityEvidence {
  contractIdentity: string;
  smsv2ContractVersion: 'v2';
  supportedProviders: Array<'aws' | 'azure'>;
  bootstrapDrivers: Array<'api'>;
  providerNetworkingProfiles: Partial<Record<'aws' | 'azure', string[]>>;
  awsSmsv2TgwConnect: { supported: boolean; schemaVersion: string | null };
  azureRouteServerEbgpMultihop: AzureRouteServerEbgpMultihopCapability;
  source: 'verified-api-contract';
  contractFingerprint: string;
  contractCommit: string;
  publication: 'local-candidate';
  tenantOrigin: string;
  platformContext?: string;
  liveAcceptance: 'not-established';
}
export interface CePlatformService {
  storage(owner: CeOwner): Promise<CeDeploymentStore>;
  capabilities(contextName?: string): Promise<CeCapabilityEvidence>;
  runtime(engine: 'native' | 'terraform', contextName?: string): Promise<CeRuntime>;
}
export type PublishedCeContractLoader = () => Promise<VerifiedCeContract>;
async function context(
  env: Record<string, string | undefined>,
  contextName?: string,
): Promise<{ url: string; credential: string }> {
  if (contextName) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(contextName)) throw new Error('Invalid F5 context name');
    const directory = join(env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'xcsh', 'contexts');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(await readFile(join(directory, `${contextName}.json`), 'utf8'));
    } catch {
      throw new Error('F5 context is unavailable');
    }
    if (typeof parsed.apiUrl !== 'string' || typeof parsed.apiToken !== 'string' || !parsed.apiToken)
      throw new Error('F5 context has no supported API credential');
    return { url: parsed.apiUrl, credential: parsed.apiToken };
  }
  const url = env.XCSH_API_URL;
  const credential = env.XCSH_API_TOKEN;
  if (!url || !credential) throw new Error('Select an F5 context or provide its scoped API environment');
  return { url, credential };
}
export function createCePlatformService(
  env: Record<string, string | undefined> = process.env,
  loadPublishedContract: PublishedCeContractLoader = () => VerifiedCeContract.published(),
): CePlatformService {
  let loaded: Promise<VerifiedCeContract> | undefined;
  const contract = () => {
    if (!loaded) loaded = loadPublishedContract();
    return loaded;
  };
  return {
    storage(owner) {
      return CeDeploymentStore.open(
        env.XCSH_CE_DEPLOYMENTS_DIR ??
          join(env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'), 'xcsh', 'ce-deployments'),
        owner,
      );
    },
    async capabilities(contextName) {
      const credentials = await context(env, contextName);
      const artifact = await contract();
      const origin = new URL(credentials.url).origin;
      if (!origin.startsWith('https://')) throw new Error('F5 context must use HTTPS');
      const aws = artifact.provider('aws');
      const capabilities = aws.capabilities as Record<string, unknown>;
      const azureRouteServerEbgpMultihop = artifact.azureRouteServerEbgpMultihop();
      return {
        contractIdentity: 'f5xc-smsv2-api/v1@7.0.0',
        smsv2ContractVersion: 'v2',
        supportedProviders: ['aws', 'azure'],
        bootstrapDrivers: ['api'],
        providerNetworkingProfiles: {
          aws: ['direct-eni', 'nlb-ingress', 'tgw-static', 'tgw-connect'],
          azure: ['direct-nic', 'load-balancer-ingress', 'route-server-bgp'],
        },
        awsSmsv2TgwConnect: {
          supported: capabilities.tgw_connect === 'available',
          schemaVersion: 'f5xc-smsv2-aws-tgw-telemetry/v2',
        },
        azureRouteServerEbgpMultihop,
        source: 'verified-api-contract',
        contractFingerprint: artifact.fingerprint,
        contractCommit: artifact.commit,
        publication: artifact.publication,
        tenantOrigin: origin,
        ...(contextName ? { platformContext: contextName } : {}),
        liveAcceptance: 'not-established',
      };
    },
    async runtime(engine, contextName) {
      const credentials = await context(env, contextName);
      const artifact = await contract();
      return new CeRuntime(artifact, engine, credentials.url, credentials.credential);
    },
  };
}
export function registerCePlatformService(bus: CeEventBus, service: CePlatformService): () => void {
  return bus.on(CE_SERVICE_CHANNEL, (data) => {
    if (!data || typeof data !== 'object') return;
    const request = data as { version?: unknown; resolve?: unknown };
    if (request.version === 2 && typeof request.resolve === 'function') request.resolve(service);
  });
}
