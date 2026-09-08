import { expect, test } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import {
  type AwsQuiescenceAdmission,
  compileAwsSiteReplacement,
  runAwsSiteReplacement,
} from '../../src/ce/site-replacement';
import { siteBindings } from '../../src/ce/topology';
import { replacementContract, replacementObservation, replacementVersions } from './replacement-version-fixtures';
import { foundationPlan } from './terraform-fixtures';

function fixture(engine: 'native' | 'terraform', failAt = '', ha = false) {
  const original = foundationPlan(ha);
  const { planId: _id, planSha256: _sha, ...base } = original;
  const draft = {
    ...base,
    engine,
    intent: { ...base.intent, engine },
    deploymentName: 'ce',
    accountId: '123456789012',
    region: 'us-east-1',
  };
  const hash = canonicalSha256(draft);
  const plan = { ...draft, planId: `aws-ce-${hash.slice(0, 24)}`, planSha256: hash };
  const { binding } = siteBindings(plan)[0];
  const preparation = {
    owner: binding.owner,
    siteName: binding.siteName,
    uid: 'old-site',
    resourceVersion: 'one',
    contractFingerprint: `sha256:${'a'.repeat(64)}`,
    source: `/api/config/namespaces/system/securemesh_site_v2s/${binding.siteName}`,
    deviceSource: `/api/register/namespaces/system/registrations_by_site/${binding.siteName}`,
    observedAt: new Date().toISOString(),
    evidenceKind: 'preboot-interface-configuration-required',
    instances: Object.fromEntries(binding.nodes.map((node, index) => [node, `i-${12345678 + index}`])),
    interfaces: binding.nodes.flatMap((node, index) =>
      ['slo', 'sli'].map((role, nic) => ({
        node,
        role,
        mac: `02:00:00:00:0${index + 1}:0${nic + 1}`,
        device: `ens${5 + nic}`,
        mtu: 1500,
      })),
    ),
    request: { metadata: { name: binding.siteName }, spec: {} },
  };
  const resources = {
    versions: replacementVersions(binding),
    interfaceIds: Object.fromEntries(
      preparation.interfaces.map((item, index) => [`${item.node}/${item.role}`, `eni-${12345678 + index}`]),
    ),
    elasticIpAllocationIds: Object.fromEntries(
      binding.nodes.map((node, index) => [node, `eipalloc-${12345678 + index}`]),
    ),
    bootstrapTokenNames: Object.fromEntries(
      binding.nodes.map((node, index) => [node, `observed-registration-token-${index + 1}`]),
    ),
  };
  const replacement = compileAwsSiteReplacement(plan, binding.siteName, preparation, resources);
  const records = new Map<string, unknown>();
  const events: string[] = [];
  let uid: string | undefined = 'old-site';
  let stopped = false;
  let launched = false;
  let failed = false;
  const boundary = (name: string) => {
    events.push(name);
    if (!failed && name === failAt) {
      failed = true;
      throw new Error('interrupted');
    }
  };
  const storage = {
    owner: binding.owner,
    verify: async () => {},
    read: async (name: string) => {
      if (!records.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(records.get(name));
    },
    write: async (name: string, value: unknown) => {
      records.set(name, structuredClone(value));
    },
  };
  const driver = {
    quiescenceAdmissionVersion: 1 as const,
    engine,
    assertOwnership: async () => {
      events.push('ownership');
    },
    quiesce: async (_plan: unknown, _signal?: AbortSignal, admission?: AwsQuiescenceAdmission) => {
      await admission?.(stopped ? 'complete' : 'intact');
      if (!stopped) {
        stopped = true;
        boundary('quiesce');
      }
    },
    launch: async () => {
      expect(uid).toBe('new-site');
      if (!launched) {
        launched = true;
        boundary('launch');
      }
      return Object.fromEntries(binding.nodes.map((node, index) => [node, `i-${87654321 + index}`]));
    },
  };
  const runtime = {
    engine,
    observeUpgrade: async () => replacementObservation(binding, uid),
    ownedSiteConfiguration: () => ({ routing: 'original' }),
    observeOwnedSite: async () => {
      if (!uid) throw Object.assign(new Error('absent'), { category: 'not-found' });
      return { system_metadata: { uid }, resource_version: 'one' };
    },
    deleteBootstrapToken: async () => {
      boundary('token-delete');
    },
    deleteSite: async () => {
      expect(stopped).toBe(true);
      uid = undefined;
      boundary('site-delete');
    },
    ensureAwsPreparedSite: async (
      _binding: unknown,
      _preparation: unknown,
      save: (record: unknown) => Promise<void>,
    ) => {
      expect(stopped).toBe(true);
      if (!uid) {
        uid = 'new-site';
        boundary('site-create');
      }
      await save({ uid });
    },
    bootstrap: async () => '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture\n',
    approveRegistrations: async () => ({ status: 'healthy' }),
    observeRegistrations: async () => ({ status: 'healthy' }),
    observeAwsRegisteredConfiguration: async () => ({ status: 'configured' }),
    ensureAwsInterfaceMtu: async () => {},
  };
  return {
    replacement,
    sourcePlan: plan,
    preparation,
    resources,
    events,
    driver,
    runtime,
    storage,
    run: () =>
      runAwsSiteReplacement(
        replacement,
        replacement.planSha256,
        driver,
        runtime as never,
        storage,
        replacementContract,
      ),
  };
}
for (const engine of ['native', 'terraform'] as const) {
  test(`${engine} recovers lost quiesce response when only XC resource version advances`, async () => {
    const f = fixture(engine, 'quiesce');
    await expect(f.run()).rejects.toThrow('interrupted');
    const observe = f.runtime.observeOwnedSite;
    f.runtime.observeOwnedSite = async () => ({ ...(await observe()), resource_version: 'two' });
    expect((await f.run()).status).toBe('registered-with-configured-interfaces');
    expect(f.events.filter((event) => event === 'quiesce')).toHaveLength(1);
    expect(f.events.filter((event) => event === 'site-create')).toHaveLength(1);
  });
  test(`${engine} rejects configuration drift after interrupted quiesce`, async () => {
    const f = fixture(engine, 'quiesce');
    await expect(f.run()).rejects.toThrow('interrupted');
    f.runtime.ownedSiteConfiguration = () => ({ routing: 'changed' });
    await expect(f.run()).rejects.toThrow('configuration changed during');
    expect(f.events).not.toContain('token-delete');
    expect(f.events).not.toContain('site-delete');
  });
  test(`${engine} rejects a changed initial resource version before quiescing`, async () => {
    const f = fixture(engine);
    const observe = f.runtime.observeOwnedSite;
    f.runtime.observeOwnedSite = async () => ({ ...(await observe()), resource_version: 'two' });
    await expect(f.run()).rejects.toThrow('configuration changed before');
    expect(f.events).not.toContain('quiesce');
  });
  test(`${engine} persists the configuration guard before any quiesce mutation`, async () => {
    const f = fixture(engine);
    const write = f.storage.write;
    f.storage.write = async (name, value) => {
      if ((value as { quiesceConfigurationSha256?: string }).quiesceConfigurationSha256)
        throw new Error('checkpoint unavailable');
      return write(name, value);
    };
    await expect(f.run()).rejects.toThrow('checkpoint unavailable');
    expect(f.events).not.toContain('quiesce');
  });
  for (const boundary of ['', 'quiesce', 'token-delete', 'site-delete', 'site-create', 'launch']) {
    test(`${engine} coupled replacement resumes after ${boundary || 'no interruption'}`, async () => {
      const f = fixture(engine, boundary);
      if (boundary) await expect(f.run()).rejects.toThrow('interrupted');
      expect((await f.run()).status).toBe('registered-with-configured-interfaces');
      expect((await f.run()).status).toBe('registered-with-configured-interfaces');
      expect(f.events.filter((event) => event === 'site-create')).toHaveLength(1);
      expect(f.events.filter((event) => event === 'launch')).toHaveLength(1);
    });
  }
}
test('configuration changes after token deletion still block site deletion', async () => {
  const f = fixture('terraform');
  const remove = f.runtime.deleteBootstrapToken;
  f.runtime.deleteBootstrapToken = async () => {
    await remove();
    f.runtime.ownedSiteConfiguration = () => ({ routing: 'changed' });
  };
  await expect(f.run()).rejects.toThrow('configuration changed before deletion');
  expect(f.events).not.toContain('site-delete');
});
test('an older platform runtime is rejected before replacement mutation', async () => {
  const f = fixture('terraform');
  Object.assign(f.runtime, { ownedSiteConfiguration: undefined });
  await expect(f.run()).rejects.toThrow('updated platform runtime');
  expect(f.events).not.toContain('quiesce');
});
test('rejects wrong engine or authorization before any cloud action', async () => {
  const f = fixture('native');
  await expect(
    runAwsSiteReplacement(f.replacement, '0'.repeat(64), f.driver, f.runtime as never, f.storage, replacementContract),
  ).rejects.toThrow('authorization');
  await expect(
    runAwsSiteReplacement(
      f.replacement,
      f.replacement.planSha256,
      { ...f.driver, engine: 'terraform' },
      f.runtime as never,
      f.storage,
      replacementContract,
    ),
  ).rejects.toThrow('engine');
  expect(f.events).toHaveLength(0);
});

test('replacement planning rejects stale evidence, scope changes and incomplete retained resources', () => {
  const f = fixture('native');
  expect(() =>
    compileAwsSiteReplacement(
      f.sourcePlan,
      'site-1',
      { ...f.preparation, observedAt: '2000-01-01T00:00:00Z' },
      f.resources,
    ),
  ).toThrow('Fresh');
  expect(() =>
    compileAwsSiteReplacement(
      f.sourcePlan,
      'site-1',
      { ...f.preparation, owner: { ...f.preparation.owner, account: '999999999999' } },
      f.resources,
    ),
  ).toThrow('ownership');
  expect(() =>
    compileAwsSiteReplacement(f.sourcePlan, 'site-1', f.preparation, { ...f.resources, elasticIpAllocationIds: {} }),
  ).toThrow('EIP');
  expect(() =>
    compileAwsSiteReplacement(f.sourcePlan, 'site-1', f.preparation, { ...f.resources, bootstrapTokenNames: {} }),
  ).toThrow('token');
});

test('site identity drift stops the coordinator before termination', async () => {
  const f = fixture('native');
  f.runtime.observeOwnedSite = async () => ({ system_metadata: { uid: 'another-site' }, resource_version: 'one' });
  await expect(f.run()).rejects.toThrow('Site UID changed');
  expect(f.events).not.toContain('quiesce');
});

test('replacement cannot change the planned MTU or omit a planned interface', () => {
  const f = fixture('terraform');
  const altered = structuredClone(f.preparation);
  altered.interfaces[0].mtu = 9000;
  expect(() => compileAwsSiteReplacement(f.sourcePlan, 'site-1', altered, f.resources)).toThrow('MTU differs');
  altered.interfaces = altered.interfaces.slice(0, 1);
  expect(() => compileAwsSiteReplacement(f.sourcePlan, 'site-1', altered, f.resources)).toThrow('layout differs');
});

for (const engine of ['native', 'terraform'] as const) {
  test(`${engine} replaces a three-node HA site as one coupled group`, async () => {
    const f = fixture(engine, '', true);
    expect(f.replacement.binding.nodes).toHaveLength(3);
    expect(f.preparation.interfaces).toHaveLength(6);
    const result = await f.run();
    expect(result.status).toBe('registered-with-configured-interfaces');
    expect(Object.keys(result.instances ?? {})).toHaveLength(3);
    expect(f.events.filter((event) => event === 'site-create')).toHaveLength(1);
  });
}

test('interrupted replacement rejects altered cached bootstrap before another cloud action', async () => {
  const f = fixture('native', 'launch');
  await expect(f.run()).rejects.toThrow('interrupted');
  const path = `${f.replacement.planId}.json`;
  const checkpoint = (await f.storage.read(path)) as { bootstrap: Record<string, string> };
  checkpoint.bootstrap['ce-1'] += 'unapproved-change';
  await f.storage.write(path, checkpoint);
  const count = f.events.length;
  await expect(f.run()).rejects.toThrow('bootstrap checkpoint integrity');
  expect(f.events).toHaveLength(count);
});

for (const engine of ['native', 'terraform'] as const) {
  test(`${engine} replacement preserves observed versions and binds admission before shutdown`, async () => {
    const f = fixture(engine);
    expect(f.replacement.schemaVersion).toBe(2);
    const original = structuredClone(f.replacement.binding);
    f.runtime.ensureAwsPreparedSite = async (binding, preparation, _save) => {
      expect(binding).toMatchObject({ initialVersions: f.resources.versions.versions });
      expect(preparation.request.spec.software_settings).toEqual({
        sw: { volterra_software_version: 'crt-20260201-0179' },
        os: { operating_system_version: '9.2026.17' },
      });
      throw new Error('creation inspected');
    };
    await expect(f.run()).rejects.toThrow('creation inspected');
    expect(f.replacement.binding).toEqual(original);
    const cp = (await f.storage.read(`${f.replacement.planId}.json`)) as Record<string, unknown>;
    expect(cp.versionAdmissionSha256).toBe(canonicalSha256(f.resources.versions));
  });
  test(`${engine} rejects version drift before any shutdown`, async () => {
    const f = fixture(engine);
    const observe = f.runtime.observeUpgrade;
    f.runtime.observeUpgrade = async () => ({ ...(await observe()), physicalSiteUid: 'changed' });
    await expect(f.run()).rejects.toThrow('effective versions changed');
    expect(f.events).not.toContain('quiesce');
  });
  test(`${engine} rejects an old driver before cloud inspection`, async () => {
    const f = fixture(engine);
    Object.assign(f.driver, { quiescenceAdmissionVersion: undefined });
    await expect(f.run()).rejects.toThrow('admission');
    expect(f.events).toHaveLength(0);
  });
  test(`${engine} partial shutdown cannot resume without saved admission`, async () => {
    const f = fixture(engine, 'quiesce');
    await expect(f.run()).rejects.toThrow('interrupted');
    const path = `${f.replacement.planId}.json`;
    const cp = (await f.storage.read(path)) as Record<string, unknown>;
    delete cp.versionAdmissionSha256;
    await f.storage.write(path, cp);
    await expect(f.run()).rejects.toThrow('admission');
    expect(f.events).not.toContain('site-delete');
  });
}

for (const engine of ['native', 'terraform'] as const) {
  test(`${engine} an intact retry rechecks versions despite a saved admission`, async () => {
    const f = fixture(engine);
    const quiesce = f.driver.quiesce;
    f.driver.quiesce = async (_plan, _signal, admit) => {
      await admit?.('intact');
      throw new Error('before cloud mutation');
    };
    await expect(f.run()).rejects.toThrow('before cloud mutation');
    f.driver.quiesce = quiesce;
    const observe = f.runtime.observeUpgrade;
    f.runtime.observeUpgrade = async () => ({ ...(await observe()), physicalSiteUid: 'changed' });
    await expect(f.run()).rejects.toThrow('effective versions changed');
    expect(f.events).not.toContain('quiesce');
  });
  test(`${engine} partial shutdown resumes without requiring the old site online`, async () => {
    const f = fixture(engine, 'quiesce');
    await expect(f.run()).rejects.toThrow('interrupted');
    const observe = f.runtime.observeUpgrade;
    f.runtime.observeUpgrade = async () => {
      const value = await observe();
      if (value.siteUid === 'old-site') throw new Error('offline site must not be observed');
      return value;
    };
    expect((await f.run()).status).toBe('registered-with-configured-interfaces');
  });
  test(`${engine} replacement cannot converge with the old baseline or reused physical identity`, async () => {
    for (const wrong of ['version', 'identity']) {
      const f = fixture(engine);
      const observe = f.runtime.observeUpgrade;
      f.runtime.observeUpgrade = async () => {
        const value = await observe();
        if (value.siteUid !== 'old-site') {
          if (wrong === 'identity') value.physicalSiteUid = 'old-physical';
          else value.os.installed = '9.2026.14';
        }
        return value;
      };
      await expect(f.run()).rejects.toThrow('physical identity or effective versions differ');
      const cp = (await f.storage.read(`${f.replacement.planId}.json`)) as Record<string, unknown>;
      expect(cp.phase).toBe('registration');
    }
  });
}
test('obsolete replacement schema and forged version admission fail closed', async () => {
  const f = fixture('terraform', 'quiesce');
  await expect(f.run()).rejects.toThrow('interrupted');
  const path = `${f.replacement.planId}.json`;
  const cp = (await f.storage.read(path)) as Record<string, unknown>;
  cp.versionAdmissionSha256 = '0'.repeat(64);
  await f.storage.write(path, cp);
  await expect(f.run()).rejects.toThrow('admission differs');
  Object.assign(f.replacement, { schemaVersion: 1 });
  await expect(f.run()).rejects.toThrow('obsolete');
});

test('saved shutdown admission cannot outlive its configuration guard', async () => {
  const f = fixture('terraform', 'token-delete');
  await expect(f.run()).rejects.toThrow('interrupted');
  const path = `${f.replacement.planId}.json`;
  const checkpoint = (await f.storage.read(path)) as Record<string, unknown>;
  delete checkpoint.quiesceConfigurationSha256;
  await f.storage.write(path, checkpoint);
  const count = f.events.length;
  await expect(f.run()).rejects.toThrow('configuration admission is missing');
  expect(f.events).toHaveLength(count);
});

test('registration may precede version publication without completing or repeating replacement', async () => {
  const f = fixture('terraform');
  const observe = f.runtime.observeUpgrade;
  f.runtime.observeUpgrade = async () => {
    const value = await observe();
    return value.siteUid === 'old-site' ? value : { ...value, status: 'unknown' };
  };
  const pending = await f.run();
  expect(pending.status).toBe('pending-versions');
  expect(pending.routing).toBe('unknown');
  const path = `${f.replacement.planId}.json`;
  const cp = (await f.storage.read(path)) as Record<string, unknown>;
  expect(cp.phase).toBe('registration');
  f.runtime.observeUpgrade = observe;
  expect((await f.run()).status).toBe('registered-with-configured-interfaces');
  expect(f.events.filter((event) => event === 'launch')).toHaveLength(1);
  expect(f.events.filter((event) => event === 'site-create')).toHaveLength(1);
});

test('published but still installing replacement versions remain pending', async () => {
  const f = fixture('native');
  const observe = f.runtime.observeUpgrade;
  f.runtime.observeUpgrade = async () => {
    const value = await observe();
    return value.siteUid === 'old-site' ? value : { ...value, online: false, siteState: 'PROVISIONING' };
  };
  expect((await f.run()).status).toBe('pending-versions');
  f.runtime.observeUpgrade = observe;
  expect((await f.run()).status).toBe('registered-with-configured-interfaces');
  expect(f.events.filter((event) => event === 'launch')).toHaveLength(1);
});
