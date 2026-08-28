import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, parse, relative, resolve, sep } from 'node:path';
import { contractIdentity, validateConfigPack } from './contract';
import type { ConfigPack, Resource } from './types';
import { MigrationError } from './types';

export type DeploymentAction = 'plan' | 'apply' | 'verify' | 'cleanup';
export interface DeployRequest {
  action: DeploymentAction;
  artifactDirectory?: string;
  receiptPath: string;
  planDigest?: string;
  confirmation?: string;
  cwd: string;
  signal?: AbortSignal;
}
interface Environment {
  apiUrl: URL;
  token: string;
  username: string;
  namespace: string;
}
type Operation = 'create' | 'update' | 'noop';
interface PlannedResource {
  kind: Resource['kind'];
  name: string;
  namespace: string;
  collection: string;
  operation: Operation;
  desired: Resource;
  before?: Resource;
}
interface Outcome {
  kind: string;
  name: string;
  operation: string;
  status: string;
  guidance?: string;
}
export interface DeploymentReceipt {
  schema_version: 'asm-migration.deployment-receipt/v1';
  plan_digest: string;
  artifact_hashes: Record<string, string>;
  contract: ReturnType<typeof contractIdentity>;
  namespace: string;
  resources: PlannedResource[];
  outcomes: Outcome[];
  rollback: { status: 'not_required' | 'complete' | 'remediation_required'; outcomes: Outcome[] };
}

const MANAGED_OUTPUT_FILES = ['config-pack.json', 'warnings.json', 'report.json', 'manifest.json'] as const;
const ORDER: Resource['kind'][] = ['ip_prefix_set', 'app_firewall', 'service_policy_rule', 'service_policy'];
const COLLECTIONS: Record<Resource['kind'], string> = {
  ip_prefix_set: 'ip_prefix_sets',
  app_firewall: 'app_firewalls',
  service_policy_rule: 'service_policy_rules',
  service_policy: 'service_policys',
};
const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);

function abort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
}
function hash(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stable(child)]),
    );
  return value;
}
function canonical(value: unknown): string {
  return JSON.stringify(stable(value));
}
function receiptBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(stable(value), null, 2)}\n`);
}
function env(): Environment {
  const rawUrl = process.env.XCSH_API_URL;
  const token = process.env.XCSH_API_TOKEN;
  const username = process.env.XCSH_USERNAME;
  const namespace = process.env.XCSH_NAMESPACE;
  if (!rawUrl || !token || !username || !namespace)
    throw new MigrationError(
      'authentication',
      'XCSH_API_URL, XCSH_API_TOKEN, XCSH_USERNAME, and XCSH_NAMESPACE are required',
    );
  let apiUrl: URL;
  try {
    apiUrl = new URL(rawUrl);
  } catch {
    throw new MigrationError('authentication', 'XCSH_API_URL is invalid');
  }
  if (apiUrl.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(apiUrl.hostname))
    throw new MigrationError('authentication', 'XCSH_API_URL must use HTTPS except for a loopback test server');
  apiUrl.pathname = apiUrl.pathname.replace(/\/$/, '');
  return { apiUrl, token, username, namespace };
}
function resourcePath(environment: Environment, collection: string, name?: string): URL {
  const base = environment.apiUrl;
  const suffix = `/api/config/namespaces/${encodeURIComponent(environment.namespace)}/${collection}${name ? `/${encodeURIComponent(name)}` : ''}`;
  const url = new URL(`${base.pathname.replace(/\/$/, '')}${suffix}`, base.origin);
  if (url.origin !== base.origin) throw new MigrationError('deployment', 'refusing an API origin change');
  return url;
}
function safeResource(raw: unknown, fallback: Resource): Resource {
  if (!raw || typeof raw !== 'object') throw new MigrationError('transport', 'XC returned an invalid resource');
  const value = raw as Record<string, unknown>;
  const metadata = value.metadata as Record<string, unknown> | undefined;
  const spec = value.spec;
  if (!metadata || !spec || typeof spec !== 'object')
    throw new MigrationError('transport', 'XC returned an invalid resource');
  return {
    kind: fallback.kind,
    metadata: {
      name: String(metadata.name ?? fallback.metadata.name),
      namespace: String(metadata.namespace ?? fallback.metadata.namespace),
      ...(typeof metadata.description === 'string' ? { description: metadata.description } : {}),
      ...(metadata.labels && typeof metadata.labels === 'object'
        ? { labels: metadata.labels as Record<string, string> }
        : {}),
      ...(typeof metadata.disable === 'boolean' ? { disable: metadata.disable } : {}),
    },
    spec: spec as Record<string, unknown>,
  };
}
function creator(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const meta = (raw as Record<string, unknown>).system_metadata;
  return meta && typeof meta === 'object'
    ? String((meta as Record<string, unknown>).creator_id ?? '') || undefined
    : undefined;
}
function subset(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) && expected.length === actual.length && expected.every((item, i) => subset(item, actual[i]))
    );
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') return false;
    return Object.entries(expected as Record<string, unknown>).every(([key, value]) =>
      subset(value, (actual as Record<string, unknown>)[key]),
    );
  }
  return Object.is(expected, actual);
}
function receiptFile(path: string, cwd: string): string {
  const target = resolve(cwd, path);
  const root = parse(target).root;
  let cursor = root;
  for (const part of target.slice(root.length).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink())
      throw new MigrationError('receipt', 'receipt path must not contain symlinked components');
  }
  const parent = dirname(target);
  if (!existsSync(parent) || !lstatSync(parent).isDirectory())
    throw new MigrationError('receipt', 'receipt parent must exist and be a directory');
  if (existsSync(target) && !lstatSync(target).isFile())
    throw new MigrationError('receipt', 'receipt path must be a regular file');
  return target;
}
function writeReceipt(path: string, receipt: DeploymentReceipt): void {
  const temporary = `${path}.${randomBytes(12).toString('hex')}.tmp`;
  try {
    writeFileSync(temporary, receiptBytes(receipt), { mode: 0o600, flag: 'wx' });
    const file = openSync(temporary, 'r');
    try {
      fsyncSync(file);
    } finally {
      closeSync(file);
    }
    renameSync(temporary, path);
    const directory = openSync(dirname(path), 'r');
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  } catch (error) {
    try {
      rmSync(temporary);
    } catch {
      /* best effort */
    }
    throw error;
  }
}
function readReceipt(path: string): DeploymentReceipt {
  const receipt = JSON.parse(readFileSync(path, 'utf8')) as DeploymentReceipt;
  if (receipt.schema_version !== 'asm-migration.deployment-receipt/v1')
    throw new MigrationError('receipt', 'unsupported receipt schema');
  const digest = planDigest(receipt.artifact_hashes, receipt.contract, receipt.namespace, receipt.resources);
  if (digest !== receipt.plan_digest) throw new MigrationError('receipt', 'receipt plan digest is invalid');
  return receipt;
}
function planDigest(
  hashes: Record<string, string>,
  contract: ReturnType<typeof contractIdentity>,
  namespace: string,
  resources: PlannedResource[],
): string {
  return hash(canonical({ artifact_hashes: hashes, contract, namespace, resources }));
}
async function request(
  environment: Environment,
  method: string,
  url: URL,
  body?: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const attempts = method === 'GET' ? 3 : 1;
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    abort(signal);
    try {
      const response = await fetch(url, {
        method,
        redirect: 'manual',
        signal,
        headers: { Authorization: `APIToken ${environment.token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: canonical(body) }),
      });
      if (response.url && new URL(response.url).origin !== environment.apiUrl.origin)
        throw new MigrationError('transport', 'XC response changed API origin');
      if (response.status >= 300 && response.status < 400)
        throw new MigrationError('transport', 'XC redirects are not allowed');
      if (method === 'GET' && TRANSIENT.has(response.status) && attempt + 1 < attempts) continue;
      return response;
    } catch (error) {
      last = error;
      if (error instanceof MigrationError || attempt + 1 >= attempts) break;
    }
  }
  throw new MigrationError(
    'transport',
    `XC request failed${last instanceof DOMException && last.name === 'AbortError' ? ': aborted' : ''}`,
  );
}
async function get(
  environment: Environment,
  planned: PlannedResource,
  signal?: AbortSignal,
): Promise<{ raw: unknown; resource: Resource } | undefined> {
  const response = await request(
    environment,
    'GET',
    resourcePath(environment, planned.collection, planned.name),
    undefined,
    signal,
  );
  if (response.status === 404) return undefined;
  if (!response.ok)
    throw new MigrationError(
      response.status === 401 || response.status === 403 ? 'authentication' : 'transport',
      `XC read failed with HTTP ${response.status}`,
    );
  const raw = await response.json();
  return { raw, resource: safeResource(raw, planned.desired) };
}
async function mutate(
  environment: Environment,
  method: 'POST' | 'PUT' | 'DELETE',
  planned: PlannedResource,
  body: unknown,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await request(
      environment,
      method,
      resourcePath(environment, planned.collection, method === 'POST' ? undefined : planned.name),
      body,
      signal,
    );
  } catch {
    const observed = await get(environment, planned, signal);
    if (method === 'DELETE' ? !observed : Boolean(observed && subset(planned.desired, observed.resource))) return;
    throw new MigrationError('transport', 'mutation outcome is uncertain and reconciliation did not confirm success');
  }
  if (!response.ok)
    throw new MigrationError(
      response.status === 401 || response.status === 403 ? 'authentication' : 'deployment',
      `XC mutation failed with HTTP ${response.status}`,
    );
}
function basePlanned(resource: Resource): PlannedResource {
  return {
    kind: resource.kind,
    name: resource.metadata.name,
    namespace: resource.metadata.namespace,
    collection: COLLECTIONS[resource.kind],
    operation: 'create',
    desired: resource,
  };
}
async function classify(environment: Environment, resource: Resource, signal?: AbortSignal): Promise<PlannedResource> {
  const planned = basePlanned(resource);
  const live = await get(environment, planned, signal);
  if (!live) return planned;
  if (creator(live.raw) !== environment.username)
    throw new MigrationError('ownership', `resource ${resource.kind}/${resource.metadata.name} is not creator-owned`);
  planned.before = live.resource;
  planned.operation = subset(resource, live.resource) ? 'noop' : 'update';
  return planned;
}
function loadArtifacts(
  directory: string,
  receiptPath: string,
  environment: Environment,
): { pack: ConfigPack; hashes: Record<string, string> } {
  const root = resolve(directory);
  const rel = relative(root, receiptPath);
  if (rel === '' || (!rel.startsWith('..') && !rel.startsWith(`..${sep}`)))
    throw new MigrationError('receipt', 'receipt must reside outside the conversion artifact directory');
  const hashes: Record<string, string> = {};
  const parsed: Record<string, unknown> = {};
  for (const name of MANAGED_OUTPUT_FILES) {
    const path = resolve(root, name);
    if (!existsSync(path) || lstatSync(path).isSymbolicLink())
      throw new MigrationError('artifact', `required artifact is missing or unsafe: ${name}`);
    const bytes = readFileSync(path);
    hashes[name] = hash(bytes);
    parsed[name] = JSON.parse(bytes.toString('utf8'));
  }
  const pack = parsed['config-pack.json'] as ConfigPack;
  const report = parsed['report.json'] as Record<string, unknown>;
  const warnings = parsed['warnings.json'];
  const manifest = parsed['manifest.json'] as Record<string, unknown>;
  const validation = validateConfigPack(pack);
  if (!validation.valid || validation.validated_resource_count !== validation.resource_count)
    throw new MigrationError('contract', 'config pack does not satisfy the pinned contract');
  if (report.complete !== true || !Array.isArray(warnings) || warnings.length !== 0)
    throw new MigrationError('artifact', 'deployment requires complete output with empty warnings');
  if (
    canonical(report.contract) !== canonical(contractIdentity()) ||
    canonical(manifest.contract) !== canonical(contractIdentity())
  )
    throw new MigrationError('contract', 'artifact contract does not match the pinned contract');
  const manifestInputs = manifest.inputs;
  if (!manifestInputs || typeof manifestInputs !== 'object')
    throw new MigrationError('artifact', 'manifest input hashes are missing');
  if (pack.resources.some((resource) => resource.metadata.namespace !== environment.namespace))
    throw new MigrationError('namespace', 'artifact namespace must equal XCSH_NAMESPACE');
  return { pack, hashes };
}
async function makePlan(request: DeployRequest, environment: Environment, path: string): Promise<DeploymentReceipt> {
  if (!request.artifactDirectory) throw new MigrationError('validation', 'artifactDirectory is required for plan');
  const artifacts = loadArtifacts(resolve(request.cwd, request.artifactDirectory), path, environment);
  const sorted = [...artifacts.pack.resources].sort(
    (a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.metadata.name.localeCompare(b.metadata.name),
  );
  const resources: PlannedResource[] = [];
  for (const resource of sorted) resources.push(await classify(environment, resource, request.signal));
  const contract = contractIdentity();
  const digest = planDigest(artifacts.hashes, contract, environment.namespace, resources);
  return {
    schema_version: 'asm-migration.deployment-receipt/v1',
    plan_digest: digest,
    artifact_hashes: artifacts.hashes,
    contract,
    namespace: environment.namespace,
    resources,
    outcomes: [],
    rollback: { status: 'not_required', outcomes: [] },
  };
}
async function rollback(
  environment: Environment,
  completed: PlannedResource[],
  receipt: DeploymentReceipt,
  signal?: AbortSignal,
): Promise<void> {
  const failures: Outcome[] = [];
  for (const planned of [...completed].reverse()) {
    try {
      const live = await get(environment, planned, signal);
      if (!live && planned.operation === 'create') {
        receipt.rollback.outcomes.push({
          kind: planned.kind,
          name: planned.name,
          operation: planned.operation,
          status: 'already_absent',
        });
        continue;
      }
      if (!live || creator(live.raw) !== environment.username || !subset(planned.desired, live.resource))
        throw new MigrationError('ownership', `rollback drift for ${planned.kind}/${planned.name}`);
      if (planned.operation === 'create') await mutate(environment, 'DELETE', planned, undefined, signal);
      else if (planned.operation === 'update' && planned.before)
        await mutate(environment, 'PUT', { ...planned, desired: planned.before }, planned.before, signal);
      receipt.rollback.outcomes.push({
        kind: planned.kind,
        name: planned.name,
        operation: planned.operation,
        status: 'restored',
      });
    } catch {
      const outcome = {
        kind: planned.kind,
        name: planned.name,
        operation: planned.operation,
        status: 'failed',
        guidance: `inspect and restore ${planned.kind}/${planned.name} manually`,
      };
      failures.push(outcome);
      receipt.rollback.outcomes.push(outcome);
    }
  }
  receipt.rollback.status = failures.length ? 'remediation_required' : 'complete';
}
export async function deploy(request: DeployRequest): Promise<{
  action: DeploymentAction;
  planDigest: string;
  outcomes: Outcome[];
  rollback: DeploymentReceipt['rollback'];
}> {
  abort(request.signal);
  const environment = env();
  const path = receiptFile(request.receiptPath, request.cwd);
  if (request.action === 'plan') {
    if (existsSync(path)) throw new MigrationError('receipt', 'plan requires a new receipt path');
    const receipt = await makePlan(request, environment, path);
    writeReceipt(path, receipt);
    return {
      action: 'plan',
      planDigest: receipt.plan_digest,
      outcomes: receipt.resources.map((r) => ({
        kind: r.kind,
        name: r.name,
        operation: r.operation,
        status: 'planned',
      })),
      rollback: receipt.rollback,
    };
  }
  if (!existsSync(path)) throw new MigrationError('receipt', 'receipt does not exist');
  const receipt = readReceipt(path);
  if (receipt.namespace !== environment.namespace)
    throw new MigrationError('namespace', 'receipt namespace must equal XCSH_NAMESPACE');
  if (request.action === 'apply') {
    if (!request.planDigest || request.planDigest !== receipt.plan_digest)
      throw new MigrationError('confirmation', 'planDigest must exactly match the receipt');
    if (request.confirmation !== `APPLY ${receipt.plan_digest}`)
      throw new MigrationError('confirmation', 'exact APPLY confirmation is required');
    const reclassified: PlannedResource[] = [];
    for (const item of receipt.resources) reclassified.push(await classify(environment, item.desired, request.signal));
    if (planDigest(receipt.artifact_hashes, receipt.contract, receipt.namespace, reclassified) !== receipt.plan_digest)
      throw new MigrationError('stale_plan', 'live state changed after planning; create a new plan');
    const completed: PlannedResource[] = [];
    try {
      for (const item of receipt.resources) {
        if (item.operation === 'create') await mutate(environment, 'POST', item, item.desired, request.signal);
        else if (item.operation === 'update') await mutate(environment, 'PUT', item, item.desired, request.signal);
        receipt.outcomes.push({
          kind: item.kind,
          name: item.name,
          operation: item.operation,
          status: item.operation === 'noop' ? 'unchanged' : 'applied',
        });
        if (item.operation !== 'noop') completed.push(item);
        writeReceipt(path, receipt);
      }
    } catch (error) {
      await rollback(environment, completed, receipt, request.signal);
      writeReceipt(path, receipt);
      throw error;
    }
  } else if (request.action === 'verify') {
    receipt.outcomes = [];
    for (const item of receipt.resources) {
      const live = await get(environment, item, request.signal);
      const ok = Boolean(live && creator(live.raw) === environment.username && subset(item.desired, live.resource));
      receipt.outcomes.push({
        kind: item.kind,
        name: item.name,
        operation: 'verify',
        status: ok ? 'verified' : 'drift',
      });
    }
    writeReceipt(path, receipt);
    if (receipt.outcomes.some((item) => item.status === 'drift'))
      throw new MigrationError('verification', 'live resources differ from the deployment plan');
  } else {
    if (request.confirmation !== `CLEANUP ${receipt.plan_digest}`)
      throw new MigrationError('confirmation', 'exact CLEANUP confirmation is required');
    receipt.outcomes = [];
    for (const item of [...receipt.resources].reverse()) {
      const live = await get(environment, item, request.signal);
      if (item.operation === 'create') {
        if (!live) {
          receipt.outcomes.push({ kind: item.kind, name: item.name, operation: 'cleanup', status: 'already_absent' });
          continue;
        }
        if (creator(live.raw) !== environment.username || !subset(item.desired, live.resource))
          throw new MigrationError('ownership', `cleanup drift for ${item.kind}/${item.name}`);
        await mutate(environment, 'DELETE', item, undefined, request.signal);
        receipt.outcomes.push({ kind: item.kind, name: item.name, operation: 'cleanup', status: 'deleted' });
      } else if (item.operation === 'update' && item.before) {
        if (!live || creator(live.raw) !== environment.username)
          throw new MigrationError('ownership', `cleanup drift for ${item.kind}/${item.name}`);
        if (subset(item.before, live.resource)) {
          receipt.outcomes.push({ kind: item.kind, name: item.name, operation: 'cleanup', status: 'already_restored' });
          continue;
        }
        if (!subset(item.desired, live.resource))
          throw new MigrationError('ownership', `cleanup drift for ${item.kind}/${item.name}`);
        await mutate(environment, 'PUT', { ...item, desired: item.before }, item.before, request.signal);
        receipt.outcomes.push({ kind: item.kind, name: item.name, operation: 'cleanup', status: 'restored' });
      } else receipt.outcomes.push({ kind: item.kind, name: item.name, operation: 'cleanup', status: 'unchanged' });
      writeReceipt(path, receipt);
    }
  }
  return {
    action: request.action,
    planDigest: receipt.plan_digest,
    outcomes: receipt.outcomes,
    rollback: receipt.rollback,
  };
}
