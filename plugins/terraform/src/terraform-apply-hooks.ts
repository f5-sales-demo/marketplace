import { createHash } from 'node:crypto';
import type { PlanReceipt } from './runner';

type Json = Record<string, unknown>;
type Action = 'create' | 'update' | 'delete' | 'read';
type Phase = 'apply_start' | 'apply_progress' | 'apply_complete' | 'apply_errored';
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

function decodeLine(raw: Uint8Array): Json {
  const source = new TextDecoder('utf8', { fatal: true }).decode(raw);
  const value = object(JSON.parse(source));
  // JSON.parse discards duplicate keys. Check even escaped/nested identities
  // before using its projection; never select the last ambiguous identity.
  const scopes: Array<Set<string> | null> = [];
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '{' || char === '[') {
      if (scopes.length >= 64) throw new Error('Terraform UI nesting exceeded');
      scopes.push(char === '{' ? new Set() : null);
    } else if (char === '}' || char === ']') scopes.pop();
    else if (char === '"') {
      const start = i++;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\') i++;
        i++;
      }
      let next = i + 1;
      while (/\s/.test(source[next] ?? '') && next < source.length) next++;
      if (source[next] === ':') {
        const key: string = JSON.parse(source.slice(start, i + 1));
        const keys = scopes.at(-1);
        if (!keys || keys.has(key)) throw new Error('Duplicate Terraform UI identity');
        keys.add(key);
      }
    }
  }
  return value;
}

/** Pinned Terraform 1.16.6 / JSON UI 1.3 core hooks, in serialized apply order.
 * Callers retain original stream bytes before parsing. These hooks establish
 * neither a provider RPC nor a cloud request, resource incarnation or ownership.
 * No consumer may promote this pure parser's output to execution authority.
 */
export class TerraformApplyHookParser {
  readonly #planSha256: string;
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

  constructor(plan: PlanReceipt) {
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
      event = decodeLine(raw);
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
      if (type !== 'version' || event.terraform !== '1.16.6' || event.ui !== '1.3')
        throw new Error('Pinned Terraform and JSON UI versions required');
      this.#version = true;
      return;
    }
    if (ordinaryMessages.has(type)) {
      if (type === 'diagnostic' && object(event.diagnostic).severity === 'error') this.#successful = false;
      return;
    }
    if (!['apply_start', 'apply_progress', 'apply_complete', 'apply_errored'].includes(type))
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
    const expectedResource = `${reviewed.type}.${resource.resource_name}${suffix}`;
    const module = text(resource.module);
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
    const action = text(hook.action) as Action;
    if (type === 'apply_start') {
      if (this.#active || reviewed.actions[reviewed.next] !== action)
        throw new Error('Concurrent, replayed or unreviewed Terraform apply start');
      this.#active = { reviewed, identity, action, elapsed: 0 };
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
      if (type === 'apply_errored') this.#successful = false;
      reviewed.next++;
      this.#completed++;
      this.#active = undefined;
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
