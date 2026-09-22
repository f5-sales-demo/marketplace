import { describe, expect, it } from 'bun:test';
import regionalEdgeAdvisories from '../../extensions/regional-edge-advisories';

type Advisory = { code: string; message: string; severity?: 'info' | 'warning' };
type Matcher = (event: {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}) => Advisory | readonly Advisory[] | undefined;

function runtime() {
  let matcher: Matcher | undefined;
  let capabilities: readonly string[] = [];
  let nextToolCall = 0;
  const warnings: string[] = [];
  const handlers = new Map<string, (event?: Record<string, unknown>) => unknown>();
  regionalEdgeAdvisories({
    integrations: { register() {} },
    advisories: {
      register(registration: { capabilities: readonly string[]; match: Matcher }) {
        capabilities = registration.capabilities;
        matcher = registration.match;
        return () => {};
      },
      unregister() {
        return false;
      },
    },
    logger: {
      warn(message: string) {
        warnings.push(message);
      },
    },
    on(event: string, handler: (event?: Record<string, unknown>) => unknown) {
      handlers.set(event, handler);
    },
  } as unknown as Parameters<typeof regionalEdgeAdvisories>[0]);
  return {
    capabilities,
    warnings,
    call(toolName: string, input: Record<string, unknown> = {}, toolCallId?: string) {
      nextToolCall += 1;
      return matcher?.({ toolCallId: toolCallId ?? `call-${nextToolCall}`, toolName, input });
    },
    event(name: string, event: Record<string, unknown> = {}) {
      return handlers.get(name)?.(event);
    },
  };
}

const locationSkill = { path: 'skill://cloudstatus/location/SKILL.md' };
const mapCollector = {
  command:
    'python3 skill://cloudstatus:network-intelligence/scripts/network_lookup.py locations --format map-v1 "$CLOUDSTATUS_QUERY"',
};
const factualCollector = {
  command: 'python3 skill://cloudstatus:network-intelligence/scripts/network_lookup.py location "$CLOUDSTATUS_QUERY"',
};
const mapLocations = [
  {
    id: 'edge-example',
    label: 'Example Regional Edge',
    latitude: 45,
    longitude: -75,
    precision: 'metro',
    sources: [],
  },
];

function collectorResult(toolCallId = 'map-collector', map = true) {
  return {
    toolCallId,
    toolName: 'bash',
    input: map ? mapCollector : factualCollector,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          map
            ? {
                schema: 'cloudstatus.locations/v1',
                observed_at: '2026-09-22T12:00:00Z',
                query: 'Example',
                status: 'complete',
                map_locations: mapLocations,
                unresolved_locations: [],
                evidence: [],
                sources: [],
                inferences: [],
                errors: [],
              }
            : {
                operation: 'location',
                observed_at: '2026-09-22T12:00:00Z',
                query: 'Example',
                status: 'complete',
                facts: {},
                sources: [],
                inferences: [],
                errors: [],
              },
        ),
      },
    ],
    isError: false,
  };
}

function codes(value: ReturnType<ReturnType<typeof runtime>['call']>): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map((item) => item.code);
}

describe('Cloudstatus Regional Edge advisories', () => {
  it('registers only exact Regional Edge workflow capabilities', () => {
    expect(runtime().capabilities).toEqual(['read', 'task', 'web_search', 'bash', 'render_map']);
  });

  it('correlates successful registry evidence without changing the requested render', () => {
    const guard = runtime();
    expect(guard.call('read', locationSkill)).toBeUndefined();
    expect(guard.call('bash', mapCollector, 'map-collector')).toBeUndefined();
    expect(guard.event('tool_result', collectorResult())).toBeUndefined();
    const renderInput = { locations: mapLocations };
    expect(codes(guard.call('render_map', renderInput, 'render-call'))).toEqual(['cloudstatus.map_integrity']);
    expect(renderInput.locations).toEqual(mapLocations);
  });

  it('allows task and search deviations with structured advisories', () => {
    const guard = runtime();
    for (const [toolName, input] of [
      ['task', { prompt: 'research F5 Regional Edge addresses' }],
      ['web_search', { query: 'F5 Regional Edge locations' }],
    ] as const) {
      const value = guard.call(toolName, input);
      expect(codes(value)).toContain('cloudstatus.registry_source_recommended');
      expect(value).not.toHaveProperty('block');
    }
  });

  it('never advises unrelated Bash, GitHub, task, or search calls', () => {
    const guard = runtime();
    guard.call('read', locationSkill);
    for (const [toolName, input] of [
      ['bash', { command: 'git status --short' }],
      ['gh_exec', { args: ['pr', 'merge', '1'] }],
      ['task', { prompt: 'review this TypeScript function' }],
      ['web_search', { query: 'Bun TypeScript documentation' }],
    ] as const) {
      expect(guard.call(toolName, input)).toBeUndefined();
    }
  });

  it('reports collector and render deviations without cancelling them', () => {
    const guard = runtime();
    expect(codes(guard.call('bash', factualCollector, 'factual-collector'))).toContain(
      'cloudstatus.skill_read_recommended',
    );
    expect(guard.event('tool_result', collectorResult('factual-collector', false))).toBeUndefined();
    expect(codes(guard.call('render_map', { locations: [] }))).toEqual(
      expect.arrayContaining(['cloudstatus.map_collector_recommended', 'cloudstatus.map_integrity']),
    );
    expect(codes(guard.call('bash', factualCollector))).toContain('cloudstatus.single_collection_recommended');
  });

  it('advises on uncorrelated or altered map evidence without rewriting it', () => {
    const guard = runtime();
    guard.call('read', locationSkill);
    guard.call('bash', mapCollector, 'map-collector');
    expect(codes(guard.call('render_map', { locations: [] }))).toContain('cloudstatus.map_collector_recommended');
    guard.event('tool_result', collectorResult());
    const altered = { locations: [{ ...mapLocations[0], latitude: 46 }] };
    expect(codes(guard.call('render_map', altered))).toEqual(
      expect.arrayContaining(['cloudstatus.registry_evidence_recommended', 'cloudstatus.single_render_recommended']),
    );
    expect(altered.locations[0].latitude).toBe(46);
  });

  it('resets request correlation at turn completion, intent transition, and session switch', () => {
    for (const reset of [
      (guard: ReturnType<typeof runtime>) => guard.event('turn_end'),
      (guard: ReturnType<typeof runtime>) => guard.event('input', { text: 'Now review a pull request' }),
      (guard: ReturnType<typeof runtime>) => guard.event('session_switch'),
    ]) {
      const guard = runtime();
      guard.call('read', locationSkill);
      guard.call('bash', factualCollector, 'factual-collector');
      expect(codes(guard.call('bash', factualCollector))).toContain('cloudstatus.single_collection_recommended');
      reset(guard);
      const firstAfterReset = guard.call('bash', factualCollector);
      expect(codes(firstAfterReset)).not.toContain('cloudstatus.single_collection_recommended');
    }
  });

  it('logs malformed collector and map results without replacing tool results', () => {
    const guard = runtime();
    guard.call('read', locationSkill);
    guard.call('bash', mapCollector, 'map-collector');
    expect(
      guard.event('tool_result', {
        ...collectorResult(),
        content: [{ type: 'text', text: 'not json' }],
      }),
    ).toBeUndefined();
    guard.call('render_map', { locations: [] }, 'render-call');
    expect(
      guard.event('tool_result', {
        toolCallId: 'render-call',
        toolName: 'render_map',
        isError: false,
        content: [{ type: 'text', text: 'fallback' }],
      }),
    ).toBeUndefined();
    expect(guard.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('malformed JSON'),
        expect.stringContaining('exactly one PNG image'),
      ]),
    );
  });
});
