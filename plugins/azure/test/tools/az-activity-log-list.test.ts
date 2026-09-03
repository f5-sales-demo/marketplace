import { describe, expect, it } from 'bun:test';
import type { AzExecApi } from '../../src/az/exec';
import {
  ACTIVITY_LOG_PROJECTION,
  buildActivityLogArgs,
  createAzActivityLogListTool,
  validateActivityLogParams,
} from '../../src/tools/az-activity-log-list';

const SUBSCRIPTION_ID = [8, 4, 4, 4, 12].map((length) => 'a'.repeat(length)).join('-');
const OTHER_SUBSCRIPTION_ID = [8, 4, 4, 4, 12].map((length) => 'f'.repeat(length)).join('-');
const RESOURCE_ID = `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/rg-edge/providers/Microsoft.Compute/virtualMachines/ce-1`;
const NOW = new Date('2026-03-08T07:30:00.000Z');

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Number: (opts?: Record<string, unknown>) => ({ type: 'number', ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
    Union: (schemas: unknown[]) => ({ union: schemas }),
    Literal: (value: string) => ({ const: value }),
  },
};

type RawResult = { stdout: string; stderr: string; exitCode: number };

function mockApi(result: RawResult = { stdout: '[]', stderr: '', exitCode: 0 }) {
  const calls: Array<{ command: string; args: string[] }> = [];
  const api: AzExecApi = {
    async exec(command, args) {
      calls.push({ command, args });
      return result;
    },
  };
  return { api, calls };
}

function rawEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'event-1',
    correlationId: 'correlation-1',
    eventTimestamp: '2026-03-07T10:00:00Z',
    resourceId: RESOURCE_ID,
    resourceGroupName: 'rg-edge',
    resourceType: 'Microsoft.Compute/virtualMachines',
    operationValue: 'Microsoft.Compute/virtualMachines/write',
    operationDisplay: 'Create or Update Virtual Machine',
    statusValue: 'Succeeded',
    caller: 'Operator@Example.com',
    claimUpn: 'Operator@Example.com',
    ...overrides,
  };
}

function makeTool(api: AzExecApi, now = () => NOW) {
  return createAzActivityLogListTool({ typebox: mockTypebox }, () => api, now);
}

async function execute(api: AzExecApi, params: Record<string, unknown>, now = () => NOW) {
  return makeTool(api, now).execute('id', params, undefined, undefined, { cwd: '/tmp' });
}

describe('az_activity_log_list metadata, validation, and argv', () => {
  it('exposes only typed bounded inputs', () => {
    const { api } = mockApi();
    const tool = makeTool(api);
    expect(tool.name).toBe('az_activity_log_list');
    expect(Object.keys(tool.parameters).sort()).toEqual([
      'caller',
      'lookback_days',
      'max_events',
      'operation_family',
      'resource_group',
      'resource_id',
      'status',
      'subscription',
    ]);
  });

  it('uses a relative offset, one extra event, and an allowlisted projection for resource groups', () => {
    expect(
      buildActivityLogArgs({
        subscription: SUBSCRIPTION_ID,
        resource_group: 'rg-edge',
        caller: 'Operator@Example.com',
        status: 'failed',
        operation_family: 'delete',
        max_events: 25,
        lookback_days: 89,
      }),
    ).toEqual([
      'monitor',
      'activity-log',
      'list',
      '--subscription',
      SUBSCRIPTION_ID,
      '--resource-group',
      'rg-edge',
      '--offset',
      '89d',
      '--caller',
      'Operator@Example.com',
      '--status',
      'Failed',
      '--max-events',
      '26',
      '--query',
      ACTIVITY_LOG_PROJECTION,
      '--output',
      'json',
    ]);
    expect(ACTIVITY_LOG_PROJECTION).not.toMatch(/address|authorization|header|requestBody|responseBody|token/i);
  });

  it('builds an exact-resource query and omits all-status/all-family filters', () => {
    const args = buildActivityLogArgs({
      subscription: 'Subscription Name',
      resource_id: RESOURCE_ID,
      status: 'all',
      operation_family: 'all',
      max_events: 1000,
    });
    expect(args).toContain('--resource-id');
    expect(args).toContain(RESOURCE_ID);
    expect(args).not.toContain('--status');
    expect(args).toContain('1001');
  });

  it('accepts both scope forms and the safe retention boundary', () => {
    expect(validateActivityLogParams({ subscription: SUBSCRIPTION_ID, resource_group: 'rg-edge' })).toBeUndefined();
    expect(
      validateActivityLogParams({ subscription: SUBSCRIPTION_ID, resource_id: RESOURCE_ID, lookback_days: 89 }),
    ).toBeUndefined();
  });

  it.each([
    [{ subscription: '', resource_group: 'rg' }, 'subscription'],
    [{ subscription: 'bad/name', resource_group: 'rg' }, 'subscription'],
    [{ subscription: SUBSCRIPTION_ID }, 'exactly one'],
    [{ subscription: SUBSCRIPTION_ID, resource_group: 'rg', resource_id: RESOURCE_ID }, 'exactly one'],
    [{ subscription: SUBSCRIPTION_ID, resource_group: 'bad/name' }, 'resource group'],
    [{ subscription: SUBSCRIPTION_ID, resource_id: 'relative/resource' }, 'resource ID'],
    [
      {
        subscription: OTHER_SUBSCRIPTION_ID,
        resource_id: RESOURCE_ID,
      },
      'requested subscription',
    ],
    [{ subscription: SUBSCRIPTION_ID, resource_group: 'rg', caller: 'bad\u0000caller' }, 'caller'],
    [{ subscription: SUBSCRIPTION_ID, resource_group: 'rg', status: 'pending' }, 'status'],
    [{ subscription: SUBSCRIPTION_ID, resource_group: 'rg', operation_family: 'execute' }, 'operation_family'],
    [{ subscription: SUBSCRIPTION_ID, resource_group: 'rg', lookback_days: 0 }, 'lookback_days'],
    [{ subscription: SUBSCRIPTION_ID, resource_group: 'rg', lookback_days: -1 }, 'lookback_days'],
    [{ subscription: SUBSCRIPTION_ID, resource_group: 'rg', lookback_days: 1.5 }, 'lookback_days'],
    [{ subscription: SUBSCRIPTION_ID, resource_group: 'rg', lookback_days: 90 }, 'lookback_days'],
    [{ subscription: SUBSCRIPTION_ID, resource_group: 'rg', lookback_days: Number.NaN }, 'lookback_days'],
    [{ subscription: SUBSCRIPTION_ID, resource_group: 'rg', lookback_days: Number.POSITIVE_INFINITY }, 'lookback_days'],
    [{ subscription: SUBSCRIPTION_ID, resource_group: 'rg', max_events: 0 }, 'max_events'],
    [{ subscription: SUBSCRIPTION_ID, resource_group: 'rg', max_events: 1001 }, 'max_events'],
  ])('rejects invalid input before execution: %j', async (params, message) => {
    const { api, calls } = mockApi();
    const result = await execute(api, params);
    expect(result.isError).toBe(true);
    expect(result.details.outcome).toBe('invalid_input');
    expect(result.content[0].text).toContain(message);
    expect(calls).toHaveLength(0);
  });
});

describe('az_activity_log_list coverage and normalization', () => {
  it('reports exact UTC coverage across a local DST boundary without calendar arithmetic', async () => {
    const { api } = mockApi();
    const result = await execute(api, {
      subscription: SUBSCRIPTION_ID,
      resource_group: 'rg-edge',
      lookback_days: 1,
    });
    expect(result.details.coverage).toEqual({
      startTime: '2026-03-07T07:30:00.000Z',
      endTime: '2026-03-08T07:30:00.000Z',
      lookbackDays: 1,
      complete: true,
      truncated: false,
    });
  });

  it('filters operation families, caller case-insensitively, sorts chronologically, and preserves display casing', async () => {
    const events = [
      rawEvent({ eventId: 'later', eventTimestamp: '2026-03-07T12:00:00Z' }),
      rawEvent({ eventId: 'delete', operationValue: 'Microsoft.Compute/virtualMachines/delete' }),
      rawEvent({ eventId: 'other', caller: 'someone@example.com', claimUpn: 'someone@example.com' }),
      rawEvent({ eventId: 'earlier', eventTimestamp: '2026-03-06T12:00:00Z' }),
    ];
    const { api } = mockApi({ stdout: JSON.stringify(events), stderr: '', exitCode: 0 });
    const result = await execute(api, {
      subscription: SUBSCRIPTION_ID,
      resource_id: RESOURCE_ID,
      caller: 'operator@example.COM',
      operation_family: 'write',
    });
    expect(result.details.events.map((event: { eventId: string }) => event.eventId)).toEqual(['earlier', 'later']);
    expect(result.details.events[0]).toMatchObject({
      callerDisplay: 'Operator@Example.com',
      callerComparison: 'operator@example.com',
      callerKind: 'user',
      operationFamily: 'write',
    });
  });

  it('deduplicates exact event IDs but preserves same-correlation retries and separate writes', async () => {
    const events = [
      rawEvent({ eventId: 'same' }),
      rawEvent({ eventId: 'same' }),
      rawEvent({ eventId: 'retry', eventTimestamp: '2026-03-07T10:01:00Z' }),
      rawEvent({ eventId: 'independent', correlationId: 'correlation-2', eventTimestamp: '2026-03-07T10:02:00Z' }),
    ];
    const { api } = mockApi({ stdout: JSON.stringify(events), stderr: '', exitCode: 0 });
    const result = await execute(api, { subscription: SUBSCRIPTION_ID, resource_id: RESOURCE_ID });
    expect(result.details.events.map((event: { eventId: string }) => event.eventId)).toEqual([
      'same',
      'retry',
      'independent',
    ]);
    expect(result.details.events[0].retryGroupId).toBe('correlation-1');
    expect(result.details.events[1].retryGroupId).toBe('correlation-1');
  });

  it('distinguishes users, service principals, managed identities, and unknown callers', async () => {
    const events = [
      rawEvent({ eventId: 'user' }),
      rawEvent({ eventId: 'sp', caller: '11111111-1111-4111-8111-111111111111', claimUpn: '', claimAppId: 'app' }),
      rawEvent({
        eventId: 'mi',
        caller: '22222222-2222-4222-8222-222222222222',
        claimUpn: '',
        claimManagedIdentity: 'present',
      }),
      rawEvent({ eventId: 'unknown', caller: '33333333-3333-4333-8333-333333333333', claimUpn: '' }),
    ];
    const { api } = mockApi({ stdout: JSON.stringify(events), stderr: '', exitCode: 0 });
    const result = await execute(api, { subscription: SUBSCRIPTION_ID, resource_id: RESOURCE_ID });
    expect(
      Object.fromEntries(
        result.details.events.map((event: { eventId: string; callerKind: string }) => [
          event.eventId,
          event.callerKind,
        ]),
      ),
    ).toEqual({
      user: 'user',
      sp: 'service_principal',
      mi: 'managed_identity',
      unknown: 'unknown',
    });
  });

  it('keeps resource-group evidence distinct from exact child-resource evidence', async () => {
    const groupId = `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/rg-edge`;
    const { api } = mockApi({
      stdout: JSON.stringify([
        rawEvent({
          eventId: 'group',
          resourceId: groupId,
          resourceType: 'Microsoft.Resources/subscriptions/resourceGroups',
        }),
        rawEvent({ eventId: 'child' }),
      ]),
      stderr: '',
      exitCode: 0,
    });
    const result = await execute(api, { subscription: SUBSCRIPTION_ID, resource_group: 'rg-edge' });
    expect(result.details.events.find((event: { eventId: string }) => event.eventId === 'group').scopeType).toBe(
      'resource_group',
    );
    expect(result.details.events.find((event: { eventId: string }) => event.eventId === 'child').scopeType).toBe(
      'exact_resource',
    );
  });
});

describe('az_activity_log_list evidence, bounds, and privacy', () => {
  it('classifies explicit create/update and leaves generic first write unknown; only a later exact write becomes modification', async () => {
    const events = [
      rawEvent({
        eventId: 'explicit-create',
        operationValue: 'Microsoft.Compute/virtualMachines/write',
        operationDisplay: 'Create Widget',
        eventTimestamp: '2026-03-05T10:00:00Z',
      }),
      rawEvent({
        eventId: 'explicit-update',
        operationValue: 'Microsoft.Compute/virtualMachines/write',
        operationDisplay: 'Update Widget',
        eventTimestamp: '2026-03-05T11:00:00Z',
      }),
      rawEvent({ eventId: 'first-generic', eventTimestamp: '2026-03-05T12:00:00Z', resourceId: `${RESOURCE_ID}-2` }),
      rawEvent({ eventId: 'later-generic', eventTimestamp: '2026-03-05T13:00:00Z', resourceId: `${RESOURCE_ID}-2` }),
    ];
    const { api } = mockApi({ stdout: JSON.stringify(events), stderr: '', exitCode: 0 });
    const result = await execute(api, { subscription: SUBSCRIPTION_ID, resource_group: 'rg-edge' });
    const evidence = Object.fromEntries(
      result.details.events.map((event: { eventId: string; evidenceType: string; reasonCode: string }) => [
        event.eventId,
        [event.evidenceType, event.reasonCode],
      ]),
    );
    expect(evidence).toEqual({
      'explicit-create': ['created', 'explicit_create_operation'],
      'explicit-update': ['modified', 'explicit_update_operation'],
      'first-generic': ['unknown', 'ambiguous_create_or_update'],
      'later-generic': ['modified', 'prior_exact_resource_write_in_complete_coverage'],
    });
  });

  it('requests one extra event, limits output, and never exposes continuation or raw sensitive fields', async () => {
    const events = [
      rawEvent({
        eventId: 'one',
        claims: { secret: 'claim' },
        authorization: { action: 'secret' },
        properties: { requestBody: 'secret', publicIp: '192.0.2.1' },
        continuationToken: 'opaque-secret',
      }),
      rawEvent({ eventId: 'two', eventTimestamp: '2026-03-07T11:00:00Z' }),
    ];
    const { api, calls } = mockApi({ stdout: JSON.stringify(events), stderr: '', exitCode: 0 });
    const result = await execute(api, { subscription: SUBSCRIPTION_ID, resource_id: RESOURCE_ID, max_events: 1 });
    expect(calls[0].args).toContain('2');
    expect(result.details.events).toHaveLength(1);
    expect(result.details.coverage).toMatchObject({ complete: false, truncated: true });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('claim');
    expect(serialized).not.toContain('opaque-secret');
    expect(serialized).not.toContain('192.0.2.1');
    expect(serialized).not.toContain('requestBody');
  });

  it.each([
    ['2025-01-01T00:00:00Z', 'creation_predates_coverage'],
    ['2026-03-07T12:00:00Z', 'no_matching_event_in_complete_coverage'],
    [undefined, 'creation_age_unavailable'],
  ])('returns scope-level unknown evidence for empty results (%s)', async (creationTime, reasonCode) => {
    const event = creationTime
      ? [rawEvent({ eventId: 'filtered', resourceMetadataCreationTime: creationTime, caller: 'other' })]
      : [];
    const { api } = mockApi({ stdout: JSON.stringify(event), stderr: '', exitCode: 0 });
    const result = await execute(api, {
      subscription: SUBSCRIPTION_ID,
      resource_id: RESOURCE_ID,
      caller: 'missing@example.com',
    });
    expect(result.details.scopeEvidence).toMatchObject({ evidenceType: 'unknown', confidence: 'none', reasonCode });
  });

  it('does not mark an exactly-full response as truncated without the extra event', async () => {
    const { api } = mockApi({ stdout: JSON.stringify([rawEvent()]), stderr: '', exitCode: 0 });
    const result = await execute(api, { subscription: SUBSCRIPTION_ID, resource_id: RESOURCE_ID, max_events: 1 });
    expect(result.details.coverage).toMatchObject({ complete: true, truncated: false });
    expect(result.details.events).toHaveLength(1);
  });

  it('converts process exceptions and unexpected JSON envelopes into typed failures', async () => {
    const throwingApi: AzExecApi = {
      async exec() {
        throw new Error('process failed with sensitive details');
      },
    };
    const thrown = await execute(throwingApi, { subscription: SUBSCRIPTION_ID, resource_id: RESOURCE_ID });
    expect(thrown.details).toMatchObject({ outcome: 'execution_failure', errorType: 'exec_error' });
    expect(JSON.stringify(thrown)).not.toContain('sensitive details');

    const malformed = mockApi({ stdout: JSON.stringify({ unexpected: [] }), stderr: '', exitCode: 0 });
    expect(
      (await execute(malformed.api, { subscription: SUBSCRIPTION_ID, resource_id: RESOURCE_ID })).details.outcome,
    ).toBe('execution_failure');
  });

  it('returns typed authentication, execution, and malformed-response failures without events', async () => {
    for (const [raw, outcome] of [
      [{ stdout: '', stderr: 'Please run az login', exitCode: 1 }, 'authentication_failure'],
      [
        { stdout: '', stderr: 'The start time cannot be more than 90 days in the past', exitCode: 1 },
        'execution_failure',
      ],
      [{ stdout: '{', stderr: '', exitCode: 0 }, 'execution_failure'],
    ] as const) {
      const { api } = mockApi(raw);
      const result = await execute(api, { subscription: SUBSCRIPTION_ID, resource_id: RESOURCE_ID });
      expect(result.isError).toBe(true);
      expect(result.details.outcome).toBe(outcome);
      expect(result.details.events).toBeUndefined();
    }
  });
});
