import { expect, test } from 'bun:test';
import { currentSalesforceRows, guardCampaignTool, observeHint } from './observe-salesforce-campaign';

test('read-only admission rejects exec, setup, delegation and unscoped reads', () => {
  for (const toolName of ['bash', 'sf_exec', 'task', 'subagent', 'write'])
    expect(guardCampaignTool({ toolName, input: {} }, ['/safe/guidance.md'])).toBeDefined();
  expect(guardCampaignTool({ toolName: 'read', input: { path: '/credentials' } }, ['/safe/guidance.md'])).toBeDefined();
  expect(
    guardCampaignTool({ toolName: 'read', input: { path: '/safe/guidance.md' } }, ['/safe/guidance.md']),
  ).toBeUndefined();
  expect(guardCampaignTool({ toolName: 'sf_query', input: { query: 'DELETE FROM Account' } }, [])).toBeDefined();
  expect(
    guardCampaignTool(
      { toolName: 'sf_query', input: { query: 'SELECT COUNT(Id) total FROM Opportunity WHERE Id = null' } },
      [],
    ),
  ).toBeUndefined();
});

test('hint observer preserves exact callback result and records runtime UI evidence', async () => {
  const receipt: any[] = [];
  const result = { message: { customType: 'salesforce_hint', content: 'Pipeline: CAD 0 (0 deals)', display: false } };
  const handler = observeHint(
    async () => result,
    (value) => receipt.push(value),
  );
  expect(await handler({ type: 'before_agent_start' }, { hasUI: true })).toBe(result);
  expect(receipt[0]).toMatchObject({ event: 'salesforce_hint_dispatch', hasUI: true, returned: true, display: false });
  expect(receipt[0].content).toBe(result.message.content);
});

test('empty and failed callbacks cannot manufacture successful hint evidence', async () => {
  const receipts: any[] = [];
  expect(
    await observeHint(
      async () => undefined,
      (r) => receipts.push(r),
    )({}, { hasUI: true }),
  ).toBeUndefined();
  expect(receipts[0].returned).toBe(false);
  await expect(
    observeHint(
      async () => {
        throw new Error('failed');
      },
      (r) => receipts.push(r),
    )({}, {}),
  ).rejects.toThrow('failed');
  expect(receipts).toHaveLength(1);
});

test('inventory excludes retirement history and rejects duplicate current IDs', () => {
  const row = '| salesforce.lifecycle.status.live | BLOCKED | source |';
  const retired = '| salesforce.lifecycle.event.tool_execution_end.live | TODO | historical |';
  expect(currentSalesforceRows(`${row}\n## Retired surfaces\n${retired}`)).toEqual([
    { id: 'salesforce.lifecycle.status.live', status: 'BLOCKED' },
  ]);
  expect(() => currentSalesforceRows(`${row}\n${row}`)).toThrow('Duplicate');
});
