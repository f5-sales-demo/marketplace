import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from './deployment-store';
import { type CeOwner, type CeResourceMutation, CeRuntime } from './runtime';
import { type AzureRouteServerEbgpMultihopCapability, VerifiedCeContract } from './verified-contract';

export const CE_SERVICE_CHANNEL = 'xcsh:ce-platform:v2:service';
export const CE_TERRAFORM_RESOURCE_CHANNEL = 'xcsh:ce-terraform:v1:resource-mutation';
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
  publication: 'published-release';
  tenantOrigin: string;
  platformContext?: string;
  liveAcceptance: 'not-established';
}
export interface CePlatformService {
  providerEnvironment?(contextName?: string): Promise<Record<string, string>>;
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
  env: Record<string, string | undefined> | (() => Record<string, string | undefined>) = process.env,
  loadPublishedContract: PublishedCeContractLoader = () => VerifiedCeContract.published(),
  resourceMutation?: (contextName: string | undefined, tenantOrigin: string) => CeResourceMutation,
): CePlatformService {
  const environment = () => (typeof env === 'function' ? env() : env);
  let loaded: Promise<VerifiedCeContract> | undefined;
  const contract = () => {
    if (!loaded) loaded = loadPublishedContract();
    return loaded;
  };
  return {
    async providerEnvironment(contextName) {
      const credentials = await context(environment(), contextName);
      return { XCSH_API_URL: credentials.url, XCSH_API_TOKEN: credentials.credential };
    },
    storage(owner) {
      const env = environment();
      return CeDeploymentStore.open(
        env.XCSH_CE_DEPLOYMENTS_DIR ??
          join(env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'), 'xcsh', 'ce-deployments'),
        owner,
      );
    },
    async capabilities(contextName) {
      const credentials = await context(environment(), contextName);
      const artifact = await contract();
      const origin = new URL(credentials.url).origin;
      if (!origin.startsWith('https://')) throw new Error('F5 context must use HTTPS');
      const aws = artifact.provider('aws');
      const capabilities = aws.capabilities as Record<string, unknown>;
      const azureRouteServerEbgpMultihop = artifact.azureRouteServerEbgpMultihop();
      return {
        contractIdentity: 'f5xc-smsv2-api/v1@12.0.9',
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
      const credentials = await context(environment(), contextName);
      const artifact = await contract();
      return new CeRuntime(
        artifact,
        engine,
        credentials.url,
        credentials.credential,
        fetch,
        engine === 'terraform' ? resourceMutation?.(contextName, new URL(credentials.url).origin) : undefined,
      );
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

export function requestCePlatformService(
  bus: Pick<CeEventBus, 'emit'> | undefined,
  signal?: AbortSignal,
): Promise<CePlatformService> {
  if (!bus || typeof bus.emit !== 'function')
    return Promise.reject(new Error('Platform CE v2 service is required and not loaded'));
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('CE operation cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      reject(new Error('Platform CE v2 service is required and not loaded'));
    }, 5000);
    signal?.addEventListener('abort', abort, { once: true });
    bus.emit(CE_SERVICE_CHANNEL, {
      version: 2,
      resolve: (service: CePlatformService) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        resolve(service);
      },
    });
  });
}

export function requestTerraformResourceMutation(
  bus: Pick<CeEventBus, 'emit'>,
  contextName?: string,
  tenantOrigin?: string,
): CeResourceMutation {
  return (owner, path, init, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const timeout = AbortSignal.timeout(15 * 60000);
      const operationSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const abort = () => {
        clearTimeout(timer);
        reject(operationSignal.reason ?? new Error('Terraform resource mutation cancelled'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        reject(new Error('Terraform resource mutation outcome is unknown'));
      }, 15 * 60000);
      signal?.addEventListener('abort', abort, { once: true });
      const finish = (result: Record<string, unknown> | Error) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (result instanceof Error) reject(result);
        else resolve(result);
      };
      bus.emit(CE_TERRAFORM_RESOURCE_CHANNEL, {
        owner,
        path,
        init,
        contextName,
        tenantOrigin,
        signal: operationSignal,
        resolve: finish,
        reject: finish,
      });
    });
}
