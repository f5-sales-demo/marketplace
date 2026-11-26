import { expect, it } from 'bun:test';
import { fingerprint } from '../../../gcloud/src/ce/discovery';
import { evaluateGcpOperationalHealth, type OperationalRead } from '../../../gcloud/src/ce/operational-health';
import { operationalFixture } from '../../../gcloud/test/ce/operational-health.test';
import {
  collectGcpOperationalHealth,
  type GcpOperationalObservationPort,
} from '../../src/ce/gcp-operational-observation';

it('captures every read immediately, preserves failures, and checks ownership before and after', async () => {
  const f = operationalFixture();
  const events: string[] = [];
  const captures: Array<{ check: string; read: OperationalRead }> = [];
  const port: GcpOperationalObservationPort = {
    binding: async () => {
      events.push('binding');
      return structuredClone(f.binding);
    },
    observe: async (node, check, signal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      events.push(`observe:${check}`);
      if (node.nodeName === 'node-b' && check === 'runtime') throw new Error('PRIVATE_FAILURE');
      return f.collection.nodes.find((row) => row.nodeName === node.nodeName)?.[check].projection;
    },
    capture: async (entry) => {
      events.push(`capture:${entry.check}`);
      captures.push(entry);
    },
  };
  const result = await collectGcpOperationalHealth(port, f.binding, f.profile, fingerprint(f.profile));
  expect(captures).toHaveLength(21);
  expect(events[0]).toBe('binding');
  expect(events.at(-1)).toBe('binding');
  for (let i = 1; i < events.length - 1; i += 2) expect(events[i + 1]).toBe(events[i].replace('observe:', 'capture:'));
  expect(result.nodes[1].runtime.available).toBe(false);
  expect(result.nodes[1].runtime.projection).toBeUndefined();
  expect(evaluateGcpOperationalHealth(result, f.binding, f.profile, fingerprint(f.profile)).status).toBe('unknown');
  expect(JSON.stringify(result)).not.toContain('PRIVATE_FAILURE');
});
it('unavailable final ownership never reuses the initial binding and capture failure stops collection', async () => {
  const f = operationalFixture();
  let bindings = 0;
  let reads = 0;
  const port: GcpOperationalObservationPort = {
    binding: async () => {
      if (bindings++) throw new Error('unavailable');
      return structuredClone(f.binding);
    },
    observe: async (node, check) => {
      reads++;
      return f.collection.nodes.find((row) => row.nodeName === node.nodeName)?.[check].projection;
    },
    capture: async () => {},
  };
  const result = await collectGcpOperationalHealth(port, f.binding, f.profile, fingerprint(f.profile));
  expect(result.bindingAfter).toBeUndefined();
  expect(evaluateGcpOperationalHealth(result, f.binding, f.profile, fingerprint(f.profile)).status).toBe('unknown');
  bindings = 0;
  reads = 0;
  port.capture = async () => {
    throw new Error('capture failed');
  };
  await expect(collectGcpOperationalHealth(port, f.binding, f.profile, fingerprint(f.profile))).rejects.toThrow(
    'capture failed',
  );
  expect(reads).toBe(1);
});
