import { expect, it } from 'bun:test';
import { fingerprint } from '../../../gcloud/src/ce/discovery';
import { evaluateGcpOperationalHealth, qualifiedOperationalProfile } from '../../../gcloud/src/ce/operational-health';
import { operationalFixture } from '../../../gcloud/test/ce/operational-health.test';
import { resolveGcpOperationalPlacement } from '../../src/ce/gcp-operational-placement';

function fixture() {
  const f = operationalFixture();
  const base = structuredClone(f.profile.roles.control);
  base.runtimeRole = 'k8s-master-primary';
  const special = {
    service: 'ganges',
    name: 'ganges',
    namespace: 'default',
    podPrefix: 'ganges-',
    podShape: 'deployment' as const,
  };
  f.profile.inventoryServices.push('ganges');
  f.profile.roles = {
    primary: base,
    'primary-ganges': {
      ...structuredClone(base),
      components: [...base.components, 'ganges'],
      containers: [...base.containers, special],
    },
  };
  f.profile.placementCounts = Object.fromEntries(
    [...base.containers.map((c) => c.service), 'ganges'].map((service) => [service, service === 'ganges' ? 1 : 3]),
  );
  const observations = f.binding.nodes.map((node, i) => {
    const role = i === 2 ? f.profile.roles['primary-ganges'] : base;
    return {
      nodeName: node.nodeName,
      runtimeRole: 'k8s-master-primary',
      components: role.components.map((name) => ({ name, state: 'Ready' })),
      containers: role.containers.map((c, j) => ({
        id: (j + 1).toString(16).padStart(64, '0'),
        name: c.name,
        namespace: c.namespace,
        pod: c.podPrefix + (c.podShape === 'deployment' ? 'abcdef1234-abc12' : 'abc12'),
        state: 'Running' as const,
      })),
    };
  });
  return { ...f, observations };
}
it('selects frozen workload roles by complete evidence rather than node suffix', () => {
  const f = fixture();
  const roles = resolveGcpOperationalPlacement(
    f.profile,
    fingerprint(f.profile),
    f.binding.nodes.map((n) => n.nodeName),
    f.observations,
  );
  expect(roles).toEqual({ 'node-a': 'primary', 'node-b': 'primary', 'node-c': 'primary-ganges' });
  [f.observations[0].components, f.observations[2].components] = [
    f.observations[2].components,
    f.observations[0].components,
  ];
  [f.observations[0].containers, f.observations[2].containers] = [
    f.observations[2].containers,
    f.observations[0].containers,
  ];
  expect(
    resolveGcpOperationalPlacement(
      f.profile,
      fingerprint(f.profile),
      f.binding.nodes.map((n) => n.nodeName),
      f.observations,
    )['node-a'],
  ).toBe('primary-ganges');
});
it('refuses omitted core, duplicate singleton placement, foreign nodes, ambiguous roles and changed runtime roles', () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => {
      f.observations[0].components.pop();
    },
    (f: ReturnType<typeof fixture>) => {
      f.observations[0] = { ...structuredClone(f.observations[2]), nodeName: 'node-a' };
    },
    (f: ReturnType<typeof fixture>) => {
      f.observations[0].nodeName = 'foreign';
    },
    (f: ReturnType<typeof fixture>) => {
      f.profile.roles.ambiguous = structuredClone(f.profile.roles.primary);
    },
    (f: ReturnType<typeof fixture>) => {
      f.observations[0].runtimeRole = 'worker';
    },
    (f: ReturnType<typeof fixture>) => {
      f.observations[2].containers.pop();
    },
  ]) {
    const f = fixture();
    change(f);
    expect(() =>
      resolveGcpOperationalPlacement(
        f.profile,
        fingerprint(f.profile),
        f.binding.nodes.map((n) => n.nodeName),
        f.observations,
      ),
    ).toThrow();
  }
});
it('pins full node counts and reports runtime role drift without accepting a new placement', () => {
  const f = fixture();
  f.profile.placementCounts!.etcd = 2;
  expect(qualifiedOperationalProfile(f.profile, fingerprint(f.profile))).toBe(false);
  f.profile.placementCounts!.etcd = 3;
  const result = evaluateGcpOperationalHealth(f.collection, f.binding, f.profile, fingerprint(f.profile));
  expect(result.status).toBe('unknown');
  expect(result.reasonCodes).toContain('required-service-placement-count-mismatch');
});
it('allows independently qualified singleton placement while retaining exact required node counts', () => {
  const f = fixture();
  const piku = {
    service: 'piku',
    name: 'piku',
    namespace: 'default',
    podPrefix: 'piku-',
    podShape: 'deployment' as const,
  };
  f.profile.inventoryServices.push('piku');
  f.profile.placementCounts!.piku = 1;
  for (const [name, role] of Object.entries(f.profile.roles)) {
    f.profile.roles[`${name}-piku`] = {
      ...structuredClone(role),
      components: [...role.components, 'piku'],
      containers: [...role.containers, piku],
    };
  }
  f.observations[0].components.push({ name: 'piku', state: 'Ready' });
  f.observations[0].containers.push({
    id: 'f'.repeat(64),
    name: 'piku',
    namespace: 'default',
    pod: 'piku-abcdef1234-abc12',
    state: 'Running',
  });
  const originals = f.binding.nodes.map((node) => node.nodeName);
  expect(resolveGcpOperationalPlacement(f.profile, fingerprint(f.profile), originals, f.observations)).toEqual({
    'node-a': 'primary-piku',
    'node-b': 'primary',
    'node-c': 'primary-ganges',
  });
  f.observations[1].components.push({ name: 'piku', state: 'Ready' });
  f.observations[1].containers.push(structuredClone(f.observations[0].containers.at(-1)!));
  expect(() => resolveGcpOperationalPlacement(f.profile, fingerprint(f.profile), originals, f.observations)).toThrow();
  for (const node of f.observations) {
    node.components = node.components.filter((row) => row.name !== 'piku');
    node.containers = node.containers.filter((row) => row.name !== 'piku');
  }
  expect(() => resolveGcpOperationalPlacement(f.profile, fingerprint(f.profile), originals, f.observations)).toThrow();
});
