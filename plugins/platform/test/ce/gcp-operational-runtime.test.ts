import { expect, it, spyOn } from 'bun:test';
import { fingerprint } from '../../../gcloud/src/ce/discovery';
import { operationalFixture } from '../../../gcloud/test/ce/operational-health.test';
import { createGcpOperationalCommandPort } from '../../src/ce/gcp-operational-command';
import {
  collectGcpOperationalRuntime,
  collectGcpOperationalRuntimeEvidence,
  collectGcpOperationalRuntimeListing,
} from '../../src/ce/gcp-operational-runtime';

function fixture(omit?: string, duplicate?: string, withoutNamespace = false) {
  const f = operationalFixture();
  const rows = f.profile.roles.control.containers
    .filter((mapping) => mapping.service !== omit)
    .map((mapping, index) => ({
      id: (index + 1).toString(16).padStart(64, '0'),
      name: mapping.name,
      pod: `${mapping.podPrefix}abc12`,
      namespace: mapping.namespace,
    }));
  if (duplicate) rows.push({ ...rows.find((row) => row.name === duplicate)!, id: 'f'.repeat(64) });
  let requests = 0;
  const commands: string[][] = [];
  const port = createGcpOperationalCommandPort(
    f.binding,
    'https://console.example.test',
    'private',
    async () => f.binding,
    async () => {},
    (async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      requests++;
      const { command } = JSON.parse(String(init?.body));
      commands.push(command);
      const output =
        command[0] === 'crictl-ps-a'
          ? `CONTAINER IMAGE CREATED STATE NAME ATTEMPT POD ID POD${withoutNamespace ? '' : ' NAMESPACE'}\n` +
            rows
              .map(
                (r) =>
                  `${r.id} image 2 hours ago Running ${r.name} 0 ${'a'.repeat(64)} ${r.pod}${withoutNamespace ? '' : ` ${r.namespace}`}`,
              )
              .join('\n')
          : (() => {
              const r = rows.find((r) => r.id === command[1]);
              if (!r) throw new Error('Unlisted inspection');
              return JSON.stringify({
                status: {
                  id: r.id,
                  metadata: { name: r.name, attempt: 0 },
                  state: 'CONTAINER_RUNNING',
                  labels: { 'io.kubernetes.pod.name': r.pod, 'io.kubernetes.pod.namespace': r.namespace },
                  env: 'PRIVATE',
                },
              });
            })();
      return Response.json({ output, return_code: 0 });
    }) as unknown as typeof fetch,
  );
  return { ...f, port, commands, rows, requests: () => requests };
}
it('inspects every frozen core and dependency mapping only from the original listing', async () => {
  const f = fixture();
  const output = await collectGcpOperationalRuntime(
    f.port,
    f.binding.nodes[0],
    f.binding.ownershipFingerprint,
    f.profile,
    fingerprint(f.profile),
  );
  expect(output).toHaveLength(f.profile.roles.control.containers.length);
  expect(f.commands[0]).toEqual(['crictl-ps-a']);
  expect(f.commands.slice(1).every((c) => c[0] === 'crictl-inspect' && /^[a-f0-9]{64}$/.test(c[1]))).toBe(true);
  expect(JSON.stringify(output)).not.toContain('PRIVATE');
});
it('retains independent inspections when required dependencies are missing or ambiguous', async () => {
  for (const f of [fixture('coredns'), fixture(undefined, 'etcd')]) {
    const output = await collectGcpOperationalRuntime(
      f.port,
      f.binding.nodes[0],
      f.binding.ownershipFingerprint,
      f.profile,
      fingerprint(f.profile),
    );
    expect(output).toHaveLength(f.profile.roles.control.containers.length - 1);
    expect(output.filter((row) => ['etcd', 'coredns'].includes(row.name))).toHaveLength(1);
    expect(f.requests()).toBe(f.profile.roles.control.containers.length);
    expect(f.commands.some((c) => c[1] === 'f'.repeat(64))).toBe(false);
  }
});
it('rejects overlapping mappings and unqualified profiles', async () => {
  const f = fixture();
  Object.assign(f.profile.roles.control.containers[1], {
    name: f.profile.roles.control.containers[0].name,
    podPrefix: f.profile.roles.control.containers[0].podPrefix,
  });
  await expect(
    collectGcpOperationalRuntime(
      f.port,
      f.binding.nodes[0],
      f.binding.ownershipFingerprint,
      f.profile,
      fingerprint(f.profile),
    ),
  ).rejects.toThrow('Frozen runtime placement required');
  await expect(
    collectGcpOperationalRuntime(
      f.port,
      f.binding.nodes[0],
      f.binding.ownershipFingerprint,
      f.profile,
      fingerprint({ changed: true }),
    ),
  ).rejects.toThrow('Frozen runtime placement required');
  expect(f.requests()).toBe(0);
});
it('detects a running singleton on an unassigned original even if the expected mappings remain complete', async () => {
  const f = fixture();
  const mapping = {
    service: 'ganges',
    name: 'ganges',
    namespace: 'default',
    podPrefix: 'ganges-',
    podShape: 'deployment' as const,
  };
  f.profile.roles.other = {
    ...structuredClone(f.profile.roles.control),
    components: [...f.profile.roles.control.components, 'ganges'],
    containers: [...f.profile.roles.control.containers, mapping],
  };
  f.profile.inventoryServices.push('ganges');
  f.rows.push({ id: 'e'.repeat(64), name: 'ganges', namespace: 'default', pod: 'ganges-abcdef1234-abc12' });
  const result = await collectGcpOperationalRuntimeEvidence(
    f.port,
    f.binding.nodes[0],
    f.binding.ownershipFingerprint,
    f.profile,
    fingerprint(f.profile),
  );
  expect(result.placementState).toBe('drift');
  expect(result.containers).toHaveLength(f.profile.roles.control.containers.length);
  expect(f.commands.some((command) => command[1] === 'e'.repeat(64))).toBe(false);
});

it('resolves omitted namespaces through this original node fixed inspections before selection', async () => {
  const f = fixture(undefined, undefined, true);
  const listing = await collectGcpOperationalRuntimeListing(f.port, f.binding.nodes[0], f.binding.ownershipFingerprint);
  expect(listing.nodeName).toBe(f.binding.nodes[0].nodeName);
  expect(listing.instanceId).toBe(f.binding.nodes[0].instanceId);
  expect(listing.ownershipFingerprint).toBe(f.binding.ownershipFingerprint);
  expect(listing.containers.map((c) => c.namespace)).toEqual(f.rows.map((r) => r.namespace));
  expect(f.requests()).toBe(f.rows.length + 1);
  expect(f.commands.slice(1).map((c) => c[1])).toEqual(f.rows.map((r) => r.id));
  const projected = await collectGcpOperationalRuntime(
    f.port,
    f.binding.nodes[0],
    f.binding.ownershipFingerprint,
    f.profile,
    fingerprint(f.profile),
  );
  expect(projected).toHaveLength(f.profile.roles.control.containers.length);
  expect(JSON.stringify(projected)).not.toContain('PRIVATE');
});
it('refuses unresolved namespace labels and aborted discovery rather than guessing placement', async () => {
  for (const namespace of [undefined, '', 'foreign.namespace']) {
    const f = fixture(undefined, undefined, true);
    f.rows[0].namespace = namespace as string;
    await expect(
      collectGcpOperationalRuntimeListing(f.port, f.binding.nodes[0], f.binding.ownershipFingerprint),
    ).rejects.toThrow();
  }
  const f = fixture(undefined, undefined, true);
  await expect(
    collectGcpOperationalRuntimeListing(
      f.port,
      f.binding.nodes[0],
      f.binding.ownershipFingerprint,
      AbortSignal.abort(),
    ),
  ).rejects.toThrow();
  expect(f.requests()).toBe(0);
});

it('refuses namespace inspection when the original listing ages out during resolution', async () => {
  const f = fixture(undefined, undefined, true);
  let now = Date.now();
  const clock = spyOn(Date, 'now').mockImplementation(() => now);
  const delayed = {
    ...f.port,
    execute: async (...args: Parameters<typeof f.port.execute>) => {
      const output = await f.port.execute(...args);
      if (args[1].kind === 'list') now += 301_000;
      return output;
    },
  };
  try {
    await expect(
      collectGcpOperationalRuntimeListing(delayed, f.binding.nodes[0], f.binding.ownershipFingerprint),
    ).rejects.toThrow();
    expect(f.commands).toEqual([['crictl-ps-a']]);
  } finally {
    clock.mockRestore();
  }
});
