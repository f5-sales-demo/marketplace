import { createHash } from 'node:crypto';
import { decodeEvidenceObject } from './evidence-json';
import { type InstalledGcpVersionBinding, resolveInstalledGcpVersionProfile } from './installed-version-profile';
import type { PlanReceipt } from './runner';

type Json = Record<string, unknown>;
type Action = 'create' | 'update' | 'delete' | 'read';
type Phase =
  | 'apply_start'
  | 'apply_progress'
  | 'apply_complete'
  | 'apply_errored'
  | 'provision_start'
  | 'provision_progress'
  | 'provision_complete'
  | 'provision_errored';
interface Provisioner {
  type: string;
  when: 'create' | 'destroy';
}
interface ReviewedAction {
  address: string;
  type: string;
  actions: Action[];
  next: number;
}
interface ActiveAction {
  reviewed: ReviewedAction;
  identity: string;
  action: Action;
  elapsed: number;
  provisioners: readonly Provisioner[];
  provisionerNext: number;
  provisioning: boolean;
}
export interface TerraformApplyHookCandidate {
  readonly address: string;
  readonly resourceType: string;
  readonly action: Action;
  readonly phase: Phase;
  readonly actionIndex: number;
  readonly elapsedSeconds: number | null;
  readonly idKey: string | null;
  readonly idValue: string | null;
  readonly provisioner?: string;
  readonly provisionerIndex?: number;
  readonly outputSha256?: string | null;
  readonly rawLineSha256: string;
  readonly planSha256: string;
  readonly applyRpcQualified: false;
  readonly originalInsertQualified: false;
}
const maxLineBytes = 1024 * 1024;
const maxStreamBytes = 64 * 1024 * 1024;
const identifier = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
const ordinaryMessages = new Set([
  'log',
  'diagnostic',
  'planned_change',
  'change_summary',
  'outputs',
  'refresh_start',
  'refresh_complete',
]);
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Terraform UI object');
  return value as Json;
};
const text = (value: unknown): string => {
  if (typeof value !== 'string' || value.length > maxLineBytes) throw new Error('Malformed Terraform UI identity');
  for (const char of value) if (char.charCodeAt(0) < 32) throw new Error('Malformed Terraform UI identity');
  return value;
};

/** Bind root JSON provisioner declarations to the original reviewed bytes.
 * HCL and module configuration expansion require separate supported mappings.
 */
function reviewedProvisioners(plan: PlanReceipt, configuration: string): ReadonlyMap<string, readonly Provisioner[]> {
  if (
    Buffer.byteLength(configuration) > maxStreamBytes ||
    createHash('sha256').update(configuration).digest('hex') !== plan.configurationSha256
  )
    throw new Error('Original reviewed Terraform configuration bytes required');
  const config = decodeEvidenceObject(Buffer.from(configuration));
  const result = new Map<string, readonly Provisioner[]>();
  if (config.module !== undefined) throw new Error('Module provisioner configuration mapping is unavailable');
  for (const [type, resources] of Object.entries(object(config.resource ?? {}))) {
    if (!identifier.test(type)) throw new Error('Reviewed resource declaration required');
    for (const [name, value] of Object.entries(object(resources))) {
      if (!identifier.test(name)) throw new Error('Reviewed resource name required');
      const entries = object(value).provisioner ?? [];
      if (!Array.isArray(entries)) throw new Error('Ordered reviewed provisioner declarations required');
      const provisioners = entries.map((entry) => {
        const declaration = object(entry),
          keys = Object.keys(declaration);
        if (keys.length !== 1 || !['local-exec', 'remote-exec', 'file'].includes(keys[0]))
          throw new Error('Supported unambiguous reviewed provisioner required');
        const block = object(declaration[keys[0]]),
          when = block.when ?? 'create';
        if (!['create', 'destroy'].includes(String(when)) || typeof when !== 'string')
          throw new Error('Reviewed provisioner phase required');
        return Object.freeze({ type: keys[0], when: when as 'create' | 'destroy' });
      });
      result.set(`${type}.${name}`, Object.freeze(provisioners));
    }
  }
  return result;
}

/** Authenticated Terraform profiles / JSON UI 1.3 core hooks, in serialized apply order.
 * Callers retain original stream bytes before parsing. These hooks establish
 * neither a provider RPC nor a cloud request, resource incarnation or ownership.
 * No consumer may promote this pure parser's output to execution authority.
 */
export class TerraformApplyHookParser {
  readonly #planSha256: string;
  readonly #terraformVersion: string;
  readonly #provisioners: ReadonlyMap<string, readonly Provisioner[]> | undefined;
  readonly #reviewed = new Map<string, ReviewedAction>();
  readonly #line = Buffer.allocUnsafe(maxLineBytes);
  #lineBytes = 0;
  #streamBytes = 0;
  #version = false;
  #closed = false;
  #failed = false;
  #successful = true;
  #active: ActiveAction | undefined;
  #completed = 0;
  #expected = 0;

  constructor(plan: PlanReceipt, binding?: InstalledGcpVersionBinding, configuration?: string) {
    const profile = binding ? resolveInstalledGcpVersionProfile(binding) : undefined;
    if (profile && profile.providerLockSha256 !== plan.providerLockSha256)
      throw new Error('Reviewed Terraform plan differs from authenticated provider lock');
    this.#terraformVersion = profile?.terraformVersion ?? '1.16.6';
    this.#provisioners = configuration === undefined ? undefined : reviewedProvisioners(plan, configuration);
    if (plan.schemaVersion !== 1 || plan.engine !== 'terraform' || !/^[a-f0-9]{64}$/.test(plan.planSha256))
      throw new Error('Reviewed Terraform plan binding required');
    this.#planSha256 = plan.planSha256;
    const addresses = new Set<string>();
    for (const change of plan.changes) {
      const address = text(change.address);
      if (!address || address.length > 4096 || !identifier.test(change.type) || addresses.has(address))
        throw new Error('Unique reviewed Terraform resource required');
      addresses.add(address);
      const actions = change.actions.join(',');
      if (!['no-op', 'read', 'create', 'update', 'delete', 'delete,create', 'create,delete'].includes(actions))
        throw new Error('Unsupported reviewed Terraform actions');
      if (actions === 'no-op') continue;
      if (plan.noChanges) throw new Error('Reviewed Terraform plan has inconsistent changes');
      this.#reviewed.set(address, { address, type: change.type, actions: [...change.actions] as Action[], next: 0 });
      this.#expected += change.actions.length;
    }
    if (plan.actionInvocations?.length) throw new Error('Terraform action RPC hooks are not qualified');
  }

  #assertOpen() {
    if (this.#failed) throw new Error('Original Terraform UI stream failed');
    if (this.#closed) throw new Error('Original Terraform UI stream closed');
  }

  push(chunk: Uint8Array): readonly TerraformApplyHookCandidate[] {
    this.#assertOpen();
    try {
      this.#streamBytes += chunk.byteLength;
      if (this.#streamBytes > maxStreamBytes) throw new Error('Terraform UI stream size exceeded');
      const candidates: TerraformApplyHookCandidate[] = [];
      let offset = 0;
      while (offset < chunk.byteLength) {
        const newline = chunk.indexOf(10, offset);
        const end = newline === -1 ? chunk.byteLength : newline;
        const length = end - offset;
        if (this.#lineBytes + length > maxLineBytes) throw new Error('Terraform UI line size exceeded');
        this.#line.set(chunk.subarray(offset, end), this.#lineBytes);
        this.#lineBytes += length;
        if (newline === -1) break;
        const raw = this.#line.subarray(0, this.#lineBytes);
        const candidate = this.#parse(raw);
        if (candidate) candidates.push(candidate);
        this.#lineBytes = 0;
        offset = newline + 1;
      }
      return candidates;
    } catch (error) {
      this.#failed = true;
      throw error;
    }
  }

  #parse(raw: Uint8Array): TerraformApplyHookCandidate | undefined {
    let event: Json;
    try {
      event = decodeEvidenceObject(raw);
    } catch {
      throw new Error('Malformed original Terraform JSON UI line');
    }
    const timestamp = text(event['@timestamp']);
    if (
      event['@module'] !== 'terraform.ui' ||
      !['info', 'warn', 'error'].includes(String(event['@level'])) ||
      typeof event['@message'] !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ||
      !Number.isFinite(Date.parse(timestamp))
    )
      throw new Error('Original Terraform UI producer envelope required');
    if (event['@level'] === 'error') this.#successful = false;
    const type = text(event.type);
    if (!this.#version) {
      if (type !== 'version' || event.terraform !== this.#terraformVersion || event.ui !== '1.3')
        throw new Error('Pinned Terraform and JSON UI versions required');
      this.#version = true;
      return;
    }
    if (ordinaryMessages.has(type)) {
      if (type === 'diagnostic' && object(event.diagnostic).severity === 'error') this.#successful = false;
      return;
    }
    if (
      ![
        'apply_start',
        'apply_progress',
        'apply_complete',
        'apply_errored',
        'provision_start',
        'provision_progress',
        'provision_complete',
        'provision_errored',
      ].includes(type)
    )
      throw new Error('Unsupported original Terraform UI event');
    const hook = object(event.hook),
      resource = object(hook.resource);
    const address = text(resource.addr),
      reviewed = this.#reviewed.get(address);
    if (!reviewed || resource.resource_type !== reviewed.type || !identifier.test(text(resource.resource_name)))
      throw new Error('Original hook differs from reviewed Terraform resource');
    const key = resource.resource_key;
    if (key !== null && typeof key !== 'string' && !(typeof key === 'number' && Number.isSafeInteger(key) && key >= 0))
      throw new Error('Malformed original Terraform instance key');
    if (typeof key === 'string') text(key);
    const suffix = key === null ? '' : `[${JSON.stringify(key)}]`;
    const baseResource = `${reviewed.type}.${resource.resource_name}${suffix}`;
    const module = text(resource.module);
    const modulePrefix = module ? `${module}.` : '';
    const mode = address === `${modulePrefix}data.${baseResource}` ? 'data.' : '';
    const expectedResource = `${mode}${baseResource}`;
    if (
      resource.resource !== expectedResource ||
      address !== `${module ? `${module}.` : ''}${expectedResource}` ||
      resource.implied_provider !== reviewed.type.split('_')[0]
    )
      throw new Error('Original Terraform resource identity changed');
    const identity = JSON.stringify([
      address,
      module,
      expectedResource,
      resource.implied_provider,
      reviewed.type,
      resource.resource_name,
      key,
    ]);
    if (type.startsWith('provision_')) return this.#provision(type as Phase, hook, reviewed, identity, raw);
    const action = text(hook.action) as Action;
    if (type === 'apply_start') {
      if (this.#active || reviewed.actions[reviewed.next] !== action)
        throw new Error('Concurrent, replayed or unreviewed Terraform apply start');
      const provisioners = (this.#provisioners?.get(`${reviewed.type}.${resource.resource_name}`) ?? []).filter(
        (p) => (action === 'create' && p.when === 'create') || (action === 'delete' && p.when === 'destroy'),
      );
      if (module && provisioners.length) throw new Error('Module provisioner configuration mapping is unavailable');
      this.#active = { reviewed, identity, action, elapsed: 0, provisioners, provisionerNext: 0, provisioning: false };
    } else if (
      !this.#active ||
      this.#active.reviewed !== reviewed ||
      this.#active.identity !== identity ||
      this.#active.action !== action
    )
      throw new Error('Unpaired or changed original Terraform apply hook');
    const active = this.#active;
    if (!active) throw new Error('Original Terraform action is unavailable');
    const elapsed = type === 'apply_start' ? null : hook.elapsed_seconds;
    if (type !== 'apply_start') {
      if (typeof elapsed !== 'number' || !Number.isFinite(elapsed) || elapsed < active.elapsed)
        throw new Error('Original Terraform elapsed time changed');
      active.elapsed = elapsed;
    }
    const idKey = hook.id_key === undefined ? null : text(hook.id_key);
    const idValue = hook.id_value === undefined ? null : text(hook.id_value);
    if ((idKey === null) !== (idValue === null)) throw new Error('Incomplete original Terraform hook identity');
    const candidate: TerraformApplyHookCandidate = Object.freeze({
      address,
      resourceType: reviewed.type,
      action,
      phase: type as Phase,
      actionIndex: reviewed.next,
      elapsedSeconds: elapsed as number | null,
      idKey,
      idValue,
      rawLineSha256: createHash('sha256').update(raw).update('\n').digest('hex'),
      planSha256: this.#planSha256,
      applyRpcQualified: false,
      originalInsertQualified: false,
    });
    if (type === 'apply_complete' || type === 'apply_errored') {
      if (active.provisioning || (type === 'apply_complete' && active.provisionerNext !== active.provisioners.length))
        throw new Error('Original Terraform provisioner steps truncated or missing');
      if (type === 'apply_errored') this.#successful = false;
      reviewed.next++;
      this.#completed++;
      this.#active = undefined;
    }
    return candidate;
  }

  #provision(
    phase: Phase,
    hook: Json,
    reviewed: ReviewedAction,
    identity: string,
    raw: Uint8Array,
  ): TerraformApplyHookCandidate {
    const active = this.#active;
    if (!this.#provisioners || !active || active.reviewed !== reviewed || active.identity !== identity)
      throw new Error('Original provisioner requires reviewed configuration and active resource');
    const keys = Object.keys(hook).sort().join(',');
    if (keys !== (phase === 'provision_progress' ? 'output,provisioner,resource' : 'provisioner,resource'))
      throw new Error('Original provisioner hook fields differ');
    const provisioner = text(hook.provisioner),
      declared = active.provisioners[active.provisionerNext];
    if (!declared || declared.type !== provisioner) throw new Error('Unreviewed, replayed or out-of-order provisioner');
    if (phase === 'provision_start') {
      if (active.provisioning) throw new Error('Concurrent original provisioner');
      active.provisioning = true;
    } else if (!active.provisioning) throw new Error('Unpaired original provisioner hook');
    let outputSha256: string | null = null;
    if (phase === 'provision_progress') {
      if (typeof hook.output !== 'string' || Buffer.byteLength(hook.output) > maxLineBytes)
        throw new Error('Original provisioner output must be bounded text');
      outputSha256 = createHash('sha256').update(hook.output).digest('hex');
    }
    const candidate: TerraformApplyHookCandidate = Object.freeze({
      address: reviewed.address,
      resourceType: reviewed.type,
      action: active.action,
      phase,
      actionIndex: reviewed.next,
      elapsedSeconds: null,
      idKey: null,
      idValue: null,
      provisioner,
      provisionerIndex: active.provisionerNext,
      outputSha256,
      rawLineSha256: createHash('sha256').update(raw).update('\n').digest('hex'),
      planSha256: this.#planSha256,
      applyRpcQualified: false,
      originalInsertQualified: false,
    });
    if (phase === 'provision_complete' || phase === 'provision_errored') {
      if (phase === 'provision_errored') this.#successful = false;
      active.provisioning = false;
      active.provisionerNext++;
    }
    return candidate;
  }

  finish() {
    this.#assertOpen();
    if (!this.#version || this.#lineBytes || this.#active || this.#completed !== this.#expected) {
      this.#failed = true;
      throw new Error('Original Terraform UI stream is truncated or incomplete');
    }
    this.#closed = true;
    return Object.freeze({
      streamComplete: true as const,
      applySuccessful: this.#successful,
      expectedActions: this.#expected,
      completedActions: this.#completed,
      applyRpcQualified: false as const,
      originalInsertQualified: false as const,
    });
  }
}
