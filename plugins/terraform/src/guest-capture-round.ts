import { linuxMonotonicMs } from './linux-clock';

type Message = Readonly<Record<string, unknown>>;
export interface OriginalGuestRoundIdentity {
  readonly instanceId: string;
  readonly observerId: string;
  readonly tokenSha256: string;
  readonly ownershipSha256: string;
}
/** Compiled orchestration seam only. The installed factory owns all methods;
 * an arbitrary port or report cannot grant execution or guest acceptance. */
export interface OriginalGuestRoundPort {
  assertOriginal(): Promise<void>;
  command(request: Message): Promise<Message>;
  persist(event: Message): Promise<void>;
}
const sha256 = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = (value: unknown): value is Message => !!value && typeof value === 'object' && !Array.isArray(value);
const scopeCommands = {
  root: ['health', 'diagnosis', 'status', 'execcli'],
  status: ['vpm'],
  execcli: ['date', 'ip-address', 'ip-route', 'journalctl'],
} as const;
const linuxCaptures = {
  'vpm-unit': 'systemctl-status-vpm',
  'cloud-init': 'cloud-init-status',
  'failed-units': 'systemctl-failed',
} as const;

/** Drives existing single-command workers; every command retains its own 60s
 * bound and the round spends the original operation/final deadline. There is
 * no retry, shell fallback, exclusion, health inference or bootstrap claim. */
export async function runOriginalGuestCaptureRound(
  supplied: OriginalGuestRoundPort,
  original: OriginalGuestRoundIdentity,
  deadline: number,
  monotonic: () => number = linuxMonotonicMs,
) {
  const identity = Object.freeze({ ...original });
  if (
    !/^[1-9][0-9]{0,19}$/.test(identity.instanceId) ||
    !/^[1-9][0-9]{0,19}$/.test(identity.observerId) ||
    identity.instanceId === identity.observerId ||
    !sha256(identity.tokenSha256) ||
    !sha256(identity.ownershipSha256) ||
    !Number.isSafeInteger(deadline)
  )
    throw new Error('Original guest round identity and deadline required');
  const port = Object.freeze({
    assertOriginal: supplied.assertOriginal.bind(supplied),
    command: supplied.command.bind(supplied),
    persist: supplied.persist.bind(supplied),
  });
  const started = monotonic();
  const captures: Message[] = [],
    unavailable: string[] = [];
  let anchor: string | undefined,
    sequence = 0,
    refreshed = started;
  const commands = new Map<string, Set<string>>();
  const report = (status: 'captured' | 'incomplete') =>
    Object.freeze({
      schemaVersion: 1,
      kind: 'original-gcp-guest-round',
      status,
      original: identity,
      startedMonotonicMs: started,
      finishedMonotonicMs: monotonic(),
      deadlineMs: deadline,
      captures: Object.freeze([...captures]),
      unavailableCommands: Object.freeze([...unavailable]),
      bootstrapCoverageVerified: false as const,
      guestAcceptanceComplete: false as const,
    });
  const persist = (phase: string, details: Message = {}) =>
    port.persist(
      Object.freeze({
        schemaVersion: 1,
        kind: 'original-gcp-guest-round-event',
        phase,
        original: identity,
        startedMonotonicMs: started,
        observedMonotonicMs: monotonic(),
        deadlineMs: deadline,
        guestAcceptanceComplete: false,
        ...details,
      }),
    );
  const within = () => {
    const now = monotonic();
    if (!Number.isSafeInteger(now) || now < started || now >= deadline)
      throw new Error('Original guest round deadline exhausted or clock changed');
  };
  const execute = async (request: Message): Promise<Message> => {
    within();
    await port.assertOriginal();
    within();
    const command = Object.freeze({ ...request });
    const step = ++sequence;
    await persist('command-started', { step, request: command });
    within();
    const result = await port.command(command);
    within();
    await port.assertOriginal();
    within();
    const kind = command.operation === 'discover' ? `completion-${command.scope}` : command.kind;
    const evidence = Array.isArray(result.evidence) && result.evidence.length === 1 ? result.evidence[0] : undefined;
    if (
      result.type !== 'command-result' ||
      result.operation !== command.operation ||
      result.guestAcceptanceComplete !== false ||
      !sha256(result.anchor) ||
      (anchor !== undefined && result.anchor !== anchor) ||
      !Number.isSafeInteger(result.id) ||
      Number(result.id) <= 0 ||
      !object(evidence) ||
      evidence.schemaVersion !== 1 ||
      evidence.kind !== kind ||
      evidence.truncated !== false ||
      evidence.guestAcceptanceComplete !== false ||
      !sha256(evidence.sha256) ||
      !sha256(evidence.commandSha256) ||
      typeof evidence.path !== 'string' ||
      !evidence.path.startsWith('/') ||
      Object.entries(identity).some(([name, value]) => evidence[name] !== value) ||
      !Number.isSafeInteger(evidence.startedMonotonicMs) ||
      !Number.isSafeInteger(evidence.finishedMonotonicMs) ||
      Number(evidence.startedMonotonicMs) < started ||
      Number(evidence.finishedMonotonicMs) > monotonic() ||
      Number(evidence.finishedMonotonicMs) < Number(evidence.startedMonotonicMs) ||
      Number(evidence.finishedMonotonicMs) - Number(evidence.startedMonotonicMs) > 60000
    )
      throw new Error('Original guest round evidence identity, framing or timing differs');
    anchor = result.anchor;
    const retained = Object.freeze(structuredClone(evidence));
    captures.push(retained);
    await persist('command-captured', { step, request: command, evidence: retained });
    within();
    return retained;
  };
  const requireSupported = (scope: string, required: readonly string[]) => {
    if (required.some((name) => !commands.get(scope)?.has(name)))
      throw new Error(`Required supported guest commands unavailable in ${scope}`);
  };
  const discover = async (scope: string) => {
    const evidence = await execute({ operation: 'discover', scope });
    const available = evidence.availableCommands;
    if (
      !Array.isArray(available) ||
      available.some((value) => typeof value !== 'string') ||
      new Set(available).size !== available.length
    )
      throw new Error('Original scoped command selections unavailable');
    commands.set(scope, new Set(available));
    return evidence;
  };
  const coreDiscovery = async () => {
    for (const [scope, required] of Object.entries(scopeCommands)) {
      await discover(scope);
      requireSupported(scope, required);
    }
    refreshed = monotonic();
  };
  const capture = (kind: string, containerId?: string) =>
    execute({
      operation: 'capture',
      kind,
      ...(containerId ? { containerId } : {}),
    });
  const fullLog = async (kind: string, help: Message, containerId?: string) => {
    const evidence = await capture(kind, containerId);
    if (evidence.logSelection !== 'all-retained' || evidence.helpSha256 !== help.sha256)
      throw new Error('Original complete log selection or help attribution differs');
  };
  const listing = async (runtime: string) => {
    const evidence = await capture(`${runtime}-list`),
      ids = evidence.containerIds;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.some((id) => typeof id !== 'string' || !/^[a-f0-9]{12,64}$/.test(id)) ||
      new Set(ids).size !== ids.length ||
      ids.some((id, i) => ids.some((other, j) => i !== j && (id.startsWith(other) || other.startsWith(id))))
    )
      throw new Error('Original nonempty unambiguous container listing required');
    return Object.freeze([...ids] as string[]);
  };
  try {
    await persist('round-started');
    await coreDiscovery();
    for (const kind of ['health', 'diagnosis', 'vpm', 'clock', 'interfaces', 'routes']) await capture(kind);
    for (const [kind, executable] of Object.entries(linuxCaptures)) {
      if (commands.get('execcli')?.has(executable)) await capture(kind);
      else unavailable.push(kind);
    }
    await discover('journal');
    requireSupported('journal', ['--help', '-u', '-o', '--no-pager', '--utc']);
    const journalHelp = await capture('journal-help');
    await fullLog('vpm-journal-full', journalHelp);
    if (['-b', '-p'].every((flag) => commands.get('journal')?.has(flag)))
      await fullLog('boot-warnings-full', journalHelp);
    else unavailable.push('boot-warnings-full');
    const runtimes = ['cri', 'docker'].filter((runtime) => {
      const prefix = runtime === 'cri' ? 'crictl' : 'docker';
      return ['ps-a', 'inspect', 'logs'].some((name) => commands.get('execcli')?.has(`${prefix}-${name}`));
    });
    if (!runtimes.length) throw new Error('Required supported guest runtime listing unavailable');
    for (const runtime of runtimes) {
      const prefix = runtime === 'cri' ? 'crictl' : 'docker';
      const runtimeDiscovery = async () => {
        requireSupported(
          'execcli',
          ['ps-a', 'inspect', 'logs'].map((name) => `${prefix}-${name}`),
        );
        await discover(`${runtime}-logs`);
        requireSupported(`${runtime}-logs`, ['--help', '--tail']);
        return capture(`${runtime}-logs-help`);
      };
      if (monotonic() - refreshed >= 240000) await coreDiscovery();
      let help = await runtimeDiscovery();
      const ids = await listing(runtime);
      for (const id of ids) {
        if (monotonic() - refreshed >= 240000) {
          await coreDiscovery();
          help = await runtimeDiscovery();
          const current = await listing(runtime);
          if (current.length !== ids.length || current.some((value) => !ids.includes(value)))
            throw new Error('Original runtime listing changed during round');
        }
        await capture(`${runtime}-inspect`, id);
        await fullLog(`${runtime}-logs-full`, help, id);
      }
    }
    within();
    await port.assertOriginal();
    within();
    await persist('round-captured', { report: report('captured') });
    return report('captured');
  } catch (error) {
    try {
      await persist('round-refused', {
        errorType: error instanceof Error ? error.name : typeof error,
        report: report('incomplete'),
      });
    } catch (retention) {
      throw new AggregateError([error, retention], 'Original guest round failure retention incomplete');
    }
    throw error;
  }
}
