import { describe, expect, it } from 'bun:test';
import {
  applyKvmLifecyclePlan,
  type KvmLifecycleDependencies,
  type KvmLifecyclePlan,
  KvmPrerequisiteUnavailableError,
  type KvmReleasePrerequisite,
  preflightKvmLifecycle,
  prepareKvmLifecyclePlan,
} from '../src/lifecycle';

const prerequisite: KvmReleasePrerequisite = {
  id: 'maurice_config_cardinality_exactly_one',
  resource: 'maurice_config',
  cardinality: { exactly: 1 },
  enforcement: 'server',
  availability: 'external_tenant_prerequisite',
  reason:
    'The tenant must contain exactly one maurice_config object before the platform can issue a Customer Edge image download URL.',
  source: {
    kind: 'runtime_api_error',
    operation: 'ves.io.schema.registration.CustomAPI.GetImageDownloadUrl',
    immutable: true,
  },
  publication: {
    repository: 'f5-sales-demo/api-specs-enriched',
    tag: 'v7.0.3',
    commit: '55151d9bda8ea8f04c595e76ee6b05aee96d7fc7',
    asset: 'openapi.json',
    sha256: 'sha256:d17d0e8366d49132d8de12498585725cc77d20390919b359de8c126d3e624993',
  },
};

function dependencies(
  events: string[],
  image: Awaited<ReturnType<KvmLifecycleDependencies['probeImagePrerequisite']>>,
): KvmLifecycleDependencies {
  return {
    async readReleasePrerequisite() {
      events.push('release-prerequisite');
      return prerequisite;
    },
    async probeImagePrerequisite() {
      events.push('image-prerequisite');
      return image;
    },
    async inspectHost() {
      events.push('host');
      return {
        hostname: 'kvm-demo.example.test',
        libvirtUri: 'qemu:///system',
        projectResources: [],
      };
    },
    async createSavedPlan() {
      events.push('terraform-plan');
      return {
        path: '/secure/evidence/kvm.tfplan',
        sha256: 'b'.repeat(64),
        mode: 'apply',
        add: 12,
        change: 0,
        destroy: 0,
        azureActions: 0,
      };
    },
  };
}

describe('KVM SMSv2 lifecycle prerequisite ordering', () => {
  it('rejects a structurally valid but unpinned release before any live or host probe', async () => {
    const events: string[] = [];
    const unpinned = structuredClone(prerequisite);
    unpinned.publication.tag = 'v7.0.4';
    unpinned.publication.commit = 'f'.repeat(40);
    unpinned.publication.sha256 = `sha256:${'f'.repeat(64)}`;
    const deps = dependencies(events, { available: true });
    deps.readReleasePrerequisite = async () => {
      events.push('release-prerequisite');
      return unpinned;
    };

    await expect(preflightKvmLifecycle('/workspace/mcn/terraform', deps)).rejects.toThrow(
      'published KVM prerequisite contract is unsupported',
    );
    expect(events).toEqual(['release-prerequisite']);
  });

  it('rejects an unavailable tenant prerequisite before host or Terraform planning', async () => {
    const events: string[] = [];
    const operation = prepareKvmLifecyclePlan(
      { workspace: '/workspace/mcn/terraform', mode: 'apply' },
      dependencies(events, {
        available: false,
        diagnostic: 'number of maurice_config object is not one',
      }),
    );

    await expect(operation).rejects.toBeInstanceOf(KvmPrerequisiteUnavailableError);
    await expect(operation).rejects.toThrow('maurice_config_cardinality_exactly_one');
    expect(events).toEqual(['release-prerequisite', 'image-prerequisite']);
  });

  it('creates a saved plan only after the immutable contract and live image probe pass', async () => {
    const events: string[] = [];
    const result = await prepareKvmLifecyclePlan(
      { workspace: '/workspace/mcn/terraform', mode: 'apply' },
      dependencies(events, { available: true }),
    );

    expect(events).toEqual(['release-prerequisite', 'image-prerequisite', 'host', 'terraform-plan']);
    expect(result.releasePrerequisite).toEqual(prerequisite);
    expect(result.savedPlan).toMatchObject({ mode: 'apply', azureActions: 0 });
  });

  it('rejects any saved plan containing Azure actions', async () => {
    const events: string[] = [];
    const deps = dependencies(events, { available: true });
    deps.createSavedPlan = async () => {
      events.push('terraform-plan');
      return {
        path: '/secure/evidence/kvm.tfplan',
        sha256: 'b'.repeat(64),
        mode: 'apply',
        add: 12,
        change: 0,
        destroy: 0,
        azureActions: 1,
      };
    };

    await expect(
      prepareKvmLifecyclePlan({ workspace: '/workspace/mcn/terraform', mode: 'apply' }, deps),
    ).rejects.toThrow('Azure actions');
  });
});

function preparedPlan(mode: 'apply' | 'destroy' = 'apply'): KvmLifecyclePlan {
  return {
    releasePrerequisite: prerequisite,
    imagePrerequisite: { available: true },
    host: {
      hostname: 'kvm-demo.example.test',
      libvirtUri: 'qemu:///system',
      projectResources: [{ kind: 'domain', name: 'onprem-ce-01', owned: true }],
    },
    savedPlan: {
      path: '/secure/evidence/kvm.tfplan',
      sha256: 'b'.repeat(64),
      mode,
      add: mode === 'apply' ? 12 : 0,
      change: 0,
      destroy: mode === 'destroy' ? 12 : 0,
      azureActions: 0,
    },
  };
}

describe('KVM SMSv2 exact saved-plan apply', () => {
  it('rechecks the live prerequisite and rejects before mutation when it becomes unavailable', async () => {
    const events: string[] = [];
    await expect(
      applyKvmLifecyclePlan(preparedPlan(), {
        readReleasePrerequisite: async () => {
          events.push('release-prerequisite');
          return prerequisite;
        },
        probeImagePrerequisite: async () => {
          events.push('image-prerequisite');
          return { available: false, diagnostic: 'number of maurice_config object is not one' };
        },
        inspectHost: async () => {
          events.push('host');
          return preparedPlan().host;
        },
        hashSavedPlan: async () => {
          events.push('hash');
          return 'b'.repeat(64);
        },
        applySavedPlan: async () => {
          events.push('MUTATION');
        },
      }),
    ).rejects.toBeInstanceOf(KvmPrerequisiteUnavailableError);
    expect(events).toEqual(['release-prerequisite', 'image-prerequisite']);
  });

  it('rejects saved-plan byte drift before mutation', async () => {
    const events: string[] = [];
    await expect(
      applyKvmLifecyclePlan(preparedPlan(), {
        readReleasePrerequisite: async () => prerequisite,
        probeImagePrerequisite: async () => ({ available: true }),
        inspectHost: async () => preparedPlan().host,
        hashSavedPlan: async () => 'c'.repeat(64),
        applySavedPlan: async () => {
          events.push('MUTATION');
        },
      }),
    ).rejects.toThrow('changed after inspection');
    expect(events).toEqual([]);
  });

  it('rejects an ownership-unsafe destroy before mutation', async () => {
    const plan = preparedPlan('destroy');
    plan.host.projectResources.push({ kind: 'network', name: 'unrelated', owned: false });
    let mutated = false;
    await expect(
      applyKvmLifecyclePlan(plan, {
        readReleasePrerequisite: async () => prerequisite,
        probeImagePrerequisite: async () => ({ available: true }),
        inspectHost: async () => plan.host,
        hashSavedPlan: async () => plan.savedPlan.sha256,
        applySavedPlan: async () => {
          mutated = true;
        },
      }),
    ).rejects.toThrow('unowned');
    expect(mutated).toBe(false);
  });

  it('applies only the exact revalidated saved plan', async () => {
    const plan = preparedPlan();
    const events: string[] = [];
    await applyKvmLifecyclePlan(plan, {
      readReleasePrerequisite: async () => {
        events.push('release-prerequisite');
        return prerequisite;
      },
      probeImagePrerequisite: async () => {
        events.push('image-prerequisite');
        return { available: true };
      },
      inspectHost: async () => {
        events.push('host');
        return plan.host;
      },
      hashSavedPlan: async () => {
        events.push('hash');
        return plan.savedPlan.sha256;
      },
      applySavedPlan: async (path) => {
        events.push(`apply:${path}`);
      },
    });
    expect(events).toEqual([
      'release-prerequisite',
      'image-prerequisite',
      'host',
      'hash',
      'apply:/secure/evidence/kvm.tfplan',
    ]);
  });
});
