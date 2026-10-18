import { expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { createGcpCeTools } from '../../src/tools/gcp-ce';
import { intent } from './fixtures';

it('typed status refuses wrong persisted context before cloud or platform observations', async () => {
  const i = intent();
  let reads = 0;
  const platform = {
    storage: async () => ({ read: async () => ({ intent: i, platformContext: 'lab' }) }),
    gcpObservations: async () => {
      reads++;
      throw new Error('must not read');
    },
  } as unknown as CePlatformService;
  const tools = createGcpCeTools(
    { typebox: { Type } },
    () => ({
      exec: async () => {
        reads++;
        throw new Error('must not run');
      },
    }),
    undefined,
    async () => platform,
  );
  const tool = tools.find((tool) => tool.name === 'gcp_ce_status');
  if (!tool) throw new Error('missing status');
  const result = await tool.execute(
    'id',
    { project: i.project, region: i.region, deploymentName: i.deploymentName, platformContext: 'another-context' },
    undefined,
    null,
    { cwd: '/tmp' },
  );
  expect(result.isError).toBe(true);
  expect(result.details.mutationAttempted).toBe(false);
  expect(reads).toBe(0);
});

it('typed status reports explicit unavailability when shared observation service is absent', async () => {
  const tools = createGcpCeTools(
    { typebox: { Type } },
    () => ({
      exec: async () => {
        throw new Error('must not run');
      },
    }),
    undefined,
    async () => ({}) as CePlatformService,
  );
  const tool = tools.find((tool) => tool.name === 'gcp_ce_diagnose');
  if (!tool) throw new Error('missing diagnose');
  const result = await tool.execute(
    'id',
    { project: 'test-project', region: 'northamerica-northeast1', deploymentName: 'ce-test', platformContext: 'lab' },
    undefined,
    null,
    { cwd: '/tmp' },
  );
  expect(result.isError).toBe(true);
  expect(result.details.availability).toBe('unavailable');
});
