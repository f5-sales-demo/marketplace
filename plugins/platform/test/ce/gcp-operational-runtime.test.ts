import { expect, it } from 'bun:test';
import { fingerprint } from '../../../gcloud/src/ce/discovery';
import { operationalFixture } from '../../../gcloud/test/ce/operational-health.test';
import { createGcpOperationalCommandPort } from '../../src/ce/gcp-operational-command';
import { collectGcpOperationalRuntime } from '../../src/ce/gcp-operational-runtime';

function fixture(omit?: string, duplicate?: string) {
  const f = operationalFixture();
  const rows = f.profile.roles.control.containers
    .filter((mapping) => mapping.service !== omit)
    .map((mapping, index) => ({
      id: (index + 1).toString(16).padStart(64, '0'),
      name: mapping.name,
      pod: `${mapping.podPrefix}abc`,
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
          ? 'CONTAINER IMAGE CREATED STATE NAME ATTEMPT POD ID POD\n' +
            rows.map((r) => `${r.id} image 2 hours ago Running ${r.name} 0 ${'a'.repeat(64)} ${r.pod}`).join('\n')
          : (() => {
              const r = rows.find((r) => r.id === command[1]);
              if (!r) throw new Error('Unlisted inspection');
              return JSON.stringify({
                status: {
                  id: r.id,
                  metadata: { name: r.name, attempt: 0 },
                  state: 'CONTAINER_RUNNING',
                  labels: { 'io.kubernetes.pod.name': r.pod },
                  env: 'PRIVATE',
                },
              });
            })();
      return Response.json({ output, return_code: 0 });
    }) as unknown as typeof fetch,
  );
  return { ...f, port, commands, requests: () => requests };
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
it('rejects missing dependencies and ambiguous mappings before any inspection', async () => {
  for (const f of [fixture('coredns'), fixture(undefined, 'etcd')]) {
    await expect(
      collectGcpOperationalRuntime(
        f.port,
        f.binding.nodes[0],
        f.binding.ownershipFingerprint,
        f.profile,
        fingerprint(f.profile),
      ),
    ).rejects.toThrow('Required runtime coverage missing or ambiguous');
    expect(f.requests()).toBe(1);
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
