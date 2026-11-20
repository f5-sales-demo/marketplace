import { linuxMonotonicMs } from './linux-clock';
import { assertOriginalGuestJson } from './original-guest-control';

type Message = Record<string, unknown>;
type Role = 'observer' | 'ce';
export interface OriginalGuestControlPeer {
  send(message: Message, deadline: number): Promise<void>;
  receive(deadline: number): Promise<Message>;
  /** The installed peer binds original descriptors, pinned source and process identity. */
  assertOriginal(): Promise<void>;
  /** Retire only owned IPC. Never signal an actor or claim its group is absent. */
  retire(): Promise<void>;
}
export interface OriginalGuestParentAdmission {
  readonly peer: OriginalGuestControlPeer;
  readonly binding: Message;
  readonly requestSha256: string;
  readonly operationDeadlineMs: number;
  readonly closureDeadlineMs: number;
  readonly startupDeadlineMs: number;
  readonly guards: {
    inputs(): Promise<void>;
    original(binding: Message): Promise<void>;
    trust(binding: Message, role: Role): Promise<void>;
  };
  /** Offline clock seam only; installed parents share Linux CLOCK_MONOTONIC. */
  readonly monotonic?: () => number;
}
const bindingKeys = [
  'project',
  'region',
  'site_name',
  'node_name',
  'zone',
  'instance_id',
  'observer_name',
  'observer_id',
  'observer_address',
  'address',
  'original_interfaces',
  'token_node',
  'token_site',
  'token_expires',
  'token_sha256',
  'ownership_sha256',
  'observer_key',
  'ce_key',
  'observer_hosts',
  'ce_hosts',
  'observer_algorithm',
  'ce_algorithm',
];
const captures = new Set([
  'health',
  'diagnosis',
  'vpm',
  'clock',
  'interfaces',
  'routes',
  'vpm-unit',
  'vpm-journal',
  'cloud-init',
  'failed-units',
  'boot-warnings',
  'cri-list',
  'docker-list',
]);
const inspections = new Set(['cri-inspect', 'cri-logs', 'docker-inspect', 'docker-logs']);
const discoveries = new Set([
  'root',
  'status',
  'execcli',
  'journal',
  'cri-inspect',
  'cri-logs',
  'docker-inspect',
  'docker-logs',
]);
const requiredGuards = ['inputs', 'original', 'trust:observer', 'trust:ce'];
const object = (value: unknown): value is Message => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2 ** 31 - 1;
const keys = (value: Message, expected: string[]) =>
  Object.keys(value).sort().join(',') === [...expected].sort().join(',');
function frozen(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(frozen));
  if (object(value))
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, frozen(item)])));
  return value;
}
function canonical(value: unknown): string {
  const sorted = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(sorted)
      : object(item)
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, sorted(item[key])]),
          )
        : item;
  return JSON.stringify(sorted(value));
}
function validateCommand(value: Message): Message {
  assertOriginalGuestJson(value);
  const operation = value.operation;
  if (operation === 'close' && keys(value, ['operation'])) return { operation };
  if (
    operation === 'discover' &&
    keys(value, ['operation', 'scope']) &&
    typeof value.scope === 'string' &&
    discoveries.has(value.scope)
  )
    return { operation, scope: value.scope };
  if (operation === 'capture' && typeof value.kind === 'string') {
    if (captures.has(value.kind) && keys(value, ['operation', 'kind'])) return { operation, kind: value.kind };
    if (
      inspections.has(value.kind) &&
      keys(value, ['operation', 'kind', 'containerId']) &&
      typeof value.containerId === 'string' &&
      /^[a-f0-9]{12,64}$/.test(value.containerId)
    )
      return { operation, kind: value.kind, containerId: value.containerId };
  }
  throw new Error('Supported original guest command required');
}

export class OriginalGuestCaptureFailure extends Error {
  readonly result: Message;
  constructor(result: Message, causes: unknown[]) {
    super('Original guest capture remains incomplete', {
      cause: new AggregateError(causes, 'Original guest guard causes'),
    });
    this.result = frozen(structuredClone(result)) as Message;
  }
}

/** Source-owned parent dispatcher. No receipt or tool argument can substitute its original guard callbacks. */
export class OriginalGuestControlParent {
  private readonly binding: Message;
  private readonly peer: OriginalGuestControlPeer;
  private readonly guards: OriginalGuestParentAdmission['guards'];
  private readonly clock: () => number;
  private readonly requestSha256: string;
  private readonly operation: number;
  private readonly closure: number;
  private readonly startup: number;
  private state:
    | 'new'
    | 'preparing'
    | 'ready'
    | 'busy'
    | 'closing'
    | 'closed'
    | 'unresolved'
    | 'capture-failed'
    | 'failed' = 'new';
  private anchor?: string;
  private commandId = 0;
  private guardId = 0;
  private readonly pending = new Set<Promise<unknown>>();
  private readonly guardDenials: unknown[] = [];
  constructor(admission: OriginalGuestParentAdmission) {
    assertOriginalGuestJson(admission.binding);
    const binding = admission.binding;
    if (
      !object(binding) ||
      !keys(binding, bindingKeys) ||
      bindingKeys
        .filter((key) => !['original_interfaces', 'token_expires'].includes(key))
        .some(
          (key) =>
            typeof binding[key] !== 'string' ||
            !binding[key] ||
            Array.from(binding[key] as string).some(
              (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
            ),
        ) ||
      typeof binding.token_expires !== 'number' ||
      !Number.isFinite(binding.token_expires) ||
      binding.token_expires <= 0 ||
      !Array.isArray(binding.original_interfaces) ||
      binding.original_interfaces.length !== 2 ||
      binding.original_interfaces.some((value) => typeof value !== 'string') ||
      !/^[1-9][0-9]{0,19}$/.test(String(binding.instance_id)) ||
      !/^[1-9][0-9]{0,19}$/.test(String(binding.observer_id)) ||
      binding.instance_id === binding.observer_id ||
      !/^[a-f0-9]{64}$/.test(admission.requestSha256) ||
      ![admission.operationDeadlineMs, admission.closureDeadlineMs, admission.startupDeadlineMs].every(
        Number.isSafeInteger,
      ) ||
      admission.operationDeadlineMs <= 0 ||
      admission.startupDeadlineMs > admission.operationDeadlineMs ||
      admission.closureDeadlineMs < admission.operationDeadlineMs ||
      admission.closureDeadlineMs > admission.operationDeadlineMs + 300000
    )
      throw new Error('Original complete guest binding and fixed deadlines required');
    this.binding = frozen(structuredClone(binding)) as Message;
    this.peer = Object.freeze({
      send: admission.peer.send.bind(admission.peer),
      receive: admission.peer.receive.bind(admission.peer),
      assertOriginal: admission.peer.assertOriginal.bind(admission.peer),
      retire: admission.peer.retire.bind(admission.peer),
    });
    this.guards = Object.freeze({
      inputs: admission.guards.inputs.bind(admission.guards),
      original: admission.guards.original.bind(admission.guards),
      trust: admission.guards.trust.bind(admission.guards),
    });
    this.clock = admission.monotonic ?? linuxMonotonicMs;
    this.requestSha256 = admission.requestSha256;
    this.operation = admission.operationDeadlineMs;
    this.closure = admission.closureDeadlineMs;
    this.startup = admission.startupDeadlineMs;
  }
  private within(deadline: number): void {
    if (this.state === 'failed') throw new Error('Original guest parent retired');
    if (this.clock() >= deadline) throw new Error('Original guest parent deadline exhausted');
  }
  private async check(deadline: number): Promise<void> {
    this.within(deadline);
    await this.peer.assertOriginal();
    this.within(deadline);
    await this.guards.inputs();
    this.within(deadline);
    await this.peer.assertOriginal();
    this.within(deadline);
  }
  private async send(message: Message, deadline: number): Promise<void> {
    await this.check(deadline);
    await this.peer.send(message, deadline);
    await this.check(deadline);
  }
  private async receive(deadline: number): Promise<Message> {
    await this.check(deadline);
    const value = await this.peer.receive(deadline);
    await this.check(deadline);
    assertOriginalGuestJson(value);
    if (!object(value)) throw new Error('Original guest control message required');
    return value;
  }
  private async run<T>(operation: () => Promise<T>, deadline: number): Promise<T> {
    this.within(deadline);
    const work = Promise.resolve().then(operation);
    this.pending.add(work);
    void work.then(
      () => this.pending.delete(work),
      () => this.pending.delete(work),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => {
          this.state = 'failed';
          reject(new Error('Original guest parent deadline exhausted'));
        },
        Math.max(0, deadline - this.clock()),
      );
    });
    try {
      const value = await Promise.race([work, timeout]);
      this.within(deadline);
      return value;
    } catch (error) {
      if (error instanceof OriginalGuestCaptureFailure && (this.state === 'busy' || this.state === 'closing')) {
        this.state = this.state === 'closing' ? 'unresolved' : 'capture-failed';
        throw error;
      }
      this.state = 'failed';
      try {
        await this.peer.retire();
      } catch (closure) {
        throw new AggregateError([error, closure], 'Original guest control failure and IPC retirement unresolved');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  private async guard(value: Message, deadline: number, covered: Set<string>): Promise<void> {
    const role = value.role;
    const expected = [
      'type',
      'id',
      'guard',
      'anchor',
      'instanceId',
      'observerId',
      ...(value.guard === 'trust' ? ['role'] : []),
    ];
    if (
      !keys(value, expected) ||
      !integer(value.id) ||
      value.id !== this.guardId + 1 ||
      value.anchor !== this.anchor ||
      value.instanceId !== this.binding.instance_id ||
      value.observerId !== this.binding.observer_id ||
      !['inputs', 'original', 'trust'].includes(String(value.guard)) ||
      (value.guard === 'trust' && role !== 'observer' && role !== 'ce')
    )
      throw new Error('Original guest parent guard attribution differs');
    if (this.state === 'closing' && value.guard !== 'inputs')
      throw new Error('Original guest parent is closing; cloud guards remain retired');
    await this.check(deadline);
    if (this.guardDenials.length && value.guard !== 'inputs')
      throw new Error('Original guest capture guards retired after denial', {
        cause: new AggregateError([...this.guardDenials], 'Original ownership or trust failures'),
      });
    let approved = true;
    try {
      if (value.guard === 'original') await this.guards.original(this.binding);
      else if (value.guard === 'trust') await this.guards.trust(this.binding, role as Role);
    } catch (error) {
      approved = false;
      this.guardDenials.push(error);
    }
    await this.check(deadline);
    this.guardId++;
    if (approved) covered.add(value.guard === 'trust' ? `trust:${role}` : String(value.guard));
    await this.send(
      { type: 'guard-result', id: this.guardId, guard: value.guard, anchor: this.anchor, approved },
      deadline,
    );
  }
  private async next(deadline: number, covered: Set<string>): Promise<Message> {
    for (;;) {
      const value = await this.receive(deadline);
      if (value.type !== 'guard') return value;
      await this.guard(value, deadline, covered);
    }
  }
  async initialize(): Promise<void> {
    if (this.state !== 'new') throw new Error('Original guest parent lifecycle already started');
    this.state = 'preparing';
    const began = this.clock();
    if (this.startup - began > 15000) throw new Error('Original guest parent startup exceeds fixed bound');
    const readyDeadline = Math.min(this.operation, began + 60000);
    await this.run(async () => {
      const bound = await this.receive(this.startup);
      if (
        !keys(bound, ['type', 'requestSha256', 'anchor', 'binding']) ||
        bound.type !== 'worker-bound' ||
        bound.requestSha256 !== this.requestSha256 ||
        typeof bound.anchor !== 'string' ||
        !/^[a-f0-9]{64}$/.test(bound.anchor) ||
        canonical(bound.binding) !== canonical(this.binding)
      )
        throw new Error('Original guest worker binding differs');
      this.anchor = bound.anchor;
      await this.send(
        { type: 'binding-approved', requestSha256: this.requestSha256, anchor: this.anchor, approved: true },
        this.startup,
      );
    }, this.startup);
    await this.run(async () => {
      const covered = new Set<string>();
      const ready = await this.next(readyDeadline, covered);
      if (
        !keys(ready, ['type', 'anchor', 'requestSha256']) ||
        ready.type !== 'worker-ready' ||
        ready.anchor !== this.anchor ||
        ready.requestSha256 !== this.requestSha256
      )
        throw new Error('Original guest worker readiness differs');
      if (requiredGuards.some((value) => !covered.has(value)))
        throw new Error('All independent original guest guards required before readiness');
    }, readyDeadline);
    this.state = 'ready';
  }
  async command(input: Message): Promise<Message> {
    if (this.state !== 'ready' && !(this.state === 'capture-failed' && input.operation === 'close'))
      throw new Error('Original guest parent command lifecycle differs');
    const command = validateCommand(input);
    const closing = command.operation === 'close';
    const deadline = Math.min(closing ? this.closure : this.operation, this.clock() + 60000);
    this.within(deadline);
    this.state = closing ? 'closing' : 'busy';
    const id = ++this.commandId;
    const value = await this.run(async () => {
      await this.send({ type: 'command', id, ...command }, deadline);
      const covered = new Set<string>();
      const result = await this.next(deadline, covered);
      if (result.type === 'command-failure') {
        if (
          !keys(result, ['type', 'id', 'operation', 'anchor', 'guestAcceptanceComplete', 'evidence', 'errorType']) ||
          !integer(result.id) ||
          result.id !== id ||
          result.operation !== command.operation ||
          result.anchor !== this.anchor ||
          result.guestAcceptanceComplete !== false ||
          typeof result.errorType !== 'string' ||
          !/^[A-Za-z_][A-Za-z_0-9]{0,79}$/.test(result.errorType) ||
          !Array.isArray(result.evidence) ||
          result.evidence.some((value) => !object(value))
        )
          throw new Error('Original guest command failure attribution differs');
        throw new OriginalGuestCaptureFailure(result, [...this.guardDenials]);
      }
      if (
        !keys(result, [
          'type',
          'id',
          'operation',
          'anchor',
          'guestAcceptanceComplete',
          'evidence',
          ...(closing ? ['closed'] : []),
        ]) ||
        result.type !== 'command-result' ||
        !integer(result.id) ||
        result.id !== id ||
        result.operation !== command.operation ||
        result.anchor !== this.anchor ||
        result.guestAcceptanceComplete !== false ||
        !Array.isArray(result.evidence) ||
        result.evidence.some((value) => !object(value)) ||
        (closing && typeof result.closed !== 'boolean')
      )
        throw new Error('Original guest command result attribution differs');
      if (!closing && requiredGuards.some((value) => !covered.has(value)))
        throw new Error('All independent original guest guards required for capture');
      return frozen(structuredClone(result)) as Message;
    }, deadline);
    this.state = closing ? (value.closed ? 'closed' : 'unresolved') : 'ready';
    return value;
  }
  pendingOperations(): number {
    return this.pending.size;
  }
  async settlePending(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }
}
