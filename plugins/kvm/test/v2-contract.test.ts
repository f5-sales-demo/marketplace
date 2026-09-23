import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import kvmExtension from '../src/index';
import { createKvmSmsv2Tools } from '../src/tools';

const root = join(import.meta.dir, '..');

test('publishes only the five clean-break SMSv2 tools', () => {
  const Type = new Proxy(
    {},
    {
      get:
        () =>
        (..._args: unknown[]) => ({}),
    },
  );
  const names = createKvmSmsv2Tools({ typebox: { Type: Type as never } }).map((tool) => tool.name);
  expect(names).toEqual([
    'kvm_smsv2_readiness',
    'kvm_smsv2_deploy',
    'kvm_smsv2_status',
    'kvm_smsv2_reconcile',
    'kvm_smsv2_destroy',
  ]);
});

test('pins the self-contained KVM artifact and excludes retired dependencies', () => {
  const files = ['versions.tf', 'main.tf', 'variables.tf', 'outputs.tf', '.terraform.lock.hcl'];
  const text = files.map((file) => readFileSync(join(root, 'terraform', file), 'utf8')).join('\n');
  expect(text).toContain('required_version = "= 1.16.3"');
  expect(text).toContain('version = "= 9.5.2"');
  expect(text).toContain('data "xcsh_smsv2_kvm_runtime" "ce"');
  expect(text).toContain('name      = data.xcsh_smsv2_kvm_runtime.ce.interface_name');
  expect(text).not.toContain('name      = "eth0"');
  expect(text).toContain('crt-20260801-0205');
  expect(text).toContain('offline_survivability_mode');
  expect(text).toContain('no_offline_survivability_mode');
  expect(text).toContain('upgrade_settings');
  expect(text).toContain('drain_node_timeout               = 300');
  expect(text).toContain('drain_max_unavailable_node_count = 1');
  expect(text).toContain('disable_vega_upgrade_mode');
  expect(text).toContain('373f25b2b1d04674baa48a8916905c68');
  expect(text).toContain('frrouting/frr@sha256:990e83490108b686fd6df3b1cafa6bdbb2714acb00eedb9a89693946f46f45ce');
  expect(text).toContain(
    '08fea112563461f251f3c95a5c5cf8cb25eb60f74cec03e85a97ff91d3efef3059d35837598bbb476008f20db6d3bdc7143c5f2f2a9a6da394a0acc601fd5986',
  );
  expect(text).not.toMatch(/\b(?:aws|azurerm|azure|appstack|voltstack|maurice_config|get-image-download-url)\b/i);
});

test('declares install-scoped setup authorization with no cloud dependency plugins', () => {
  const manifest = JSON.parse(readFileSync(join(root, '.xcsh-plugin', 'plugin.json'), 'utf8'));
  expect(manifest.version).toBe('2.0.1');
  expect(manifest.lifecycle.setupAuthorization).toBe('install');
  expect(manifest.lifecycle.pluginDependencies).toEqual(['platform']);
});

test('registers setup steps within the xcsh integration timeout contract', async () => {
  let integration:
    | {
        dependencies?: string[];
        setup?: { pluginDependencies?: string[]; steps?: Array<{ timeoutMs: number }> };
      }
    | undefined;
  const Type = new Proxy(
    {},
    {
      get:
        () =>
        (..._args: unknown[]) => ({}),
    },
  );
  await kvmExtension({
    typebox: { Type: Type as never },
    setLabel: () => {},
    registerTool: () => {},
    integrations: {
      register: (definition: unknown) => {
        integration = definition as typeof integration;
        return definition;
      },
    },
  });
  expect(integration?.setup?.steps?.length).toBeGreaterThan(0);
  expect(integration?.setup?.steps?.map((step) => step.timeoutMs)).toEqual([7_200_000]);
  expect(integration?.dependencies ?? []).toEqual([]);
  expect(integration?.setup?.pluginDependencies).toEqual(['platform']);
});

test('integration setup remains required until the owned deployment is accepted', async () => {
  let integration:
    | {
        probe?: () => Promise<{ state: string; reason?: string; value?: unknown }>;
      }
    | undefined;
  const calls: Array<{ command: string; action?: string }> = [];
  const Type = new Proxy(
    {},
    {
      get:
        () =>
        (..._args: unknown[]) => ({}),
    },
  );
  await kvmExtension(
    {
      typebox: { Type: Type as never },
      setLabel: () => {},
      registerTool: () => {},
      integrations: {
        register: (definition: unknown) => {
          integration = definition as typeof integration;
          return definition;
        },
      },
    },
    (command, _params, action) => {
      calls.push({ command, action });
      return {
        schemaVersion: 'kvm.smsv2/v2',
        controllerVersion: '2.0.0',
        action: command,
        ok: true,
        result: { state: 'setup_required', deploymentAccepted: false },
      };
    },
  );
  expect(await integration?.probe?.()).toEqual({
    state: 'setup_required',
    reason: 'dependency_missing',
    value: expect.anything(),
  });
  expect(calls).toEqual([{ command: 'setup', action: 'status' }]);
});
