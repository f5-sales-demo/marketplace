import { expect, test } from 'bun:test';
import { executedTools, scoreTrace } from '../scripts/score-uat-traces';

test('scores executed tools rather than names in prompts, prose, schemas, or results', () => {
  const misleading = [
    { type: 'message_start', message: { content: 'asm_migration_convert' } },
    { type: 'tool_execution_end', toolName: 'asm_migration_convert', result: 'asm_migration_validate' },
    { type: 'before_provider_request', tools: [{ name: 'asm_migration_convert' }] },
  ];
  expect(executedTools(misleading)).toEqual([]);
  expect(scoreTrace({ expectedTool: 'asm_migration_convert', trace: misleading }).toolOk).toBe(false);
  const trace = [
    ...misleading,
    { type: 'tool_execution_start', toolName: 'find' },
    { type: 'agent_event', event: { type: 'tool_execution_start', toolName: 'asm_migration_convert' } },
    { type: 'tool_execution_start', toolName: 'asm_migration_validate' },
  ];
  expect(scoreTrace({ expectedTools: ['asm_migration_convert', 'asm_migration_validate'], trace }).toolOk).toBe(true);
  expect(scoreTrace({ expectedTool: 'sf_query', trace }).toolOk).toBe(false);
  expect(scoreTrace({ forbiddenTools: ['bash'], trace }).toolOk).toBe(true);
  expect(scoreTrace({ forbiddenTools: ['find'], trace }).toolOk).toBe(false);
  expect(scoreTrace({ trace: undefined }).toolOk).toBe(false);
  expect(
    scoreTrace({ trace: [{ type: 'message_start', content: 'synthetic-token' }] }, 'synthetic-token').secretOk,
  ).toBe(false);
});
