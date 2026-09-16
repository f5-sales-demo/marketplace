import { beforeAll, describe, expect, it } from 'bun:test';

const Type = {
  Object: (shape: unknown) => shape,
  String: (options?: unknown) => ({ type: 'string', ...((options as object) ?? {}) }),
  Boolean: (options?: unknown) => ({ type: 'boolean', ...((options as object) ?? {}) }),
  Number: (options?: unknown) => ({ type: 'number', ...((options as object) ?? {}) }),
  Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
  Array: (item: unknown) => ({ type: 'array', items: item }),
  Union: (items: unknown[]) => ({ union: items }),
  Literal: (value: string) => ({ const: value }),
};

describe('KVM SMSv2 extension', () => {
  let factory: (pi: unknown) => Promise<void>;
  let isKvmSmsv2Prompt: (prompt: string) => boolean;

  beforeAll(async () => {
    const extension = await import('../src/index');
    factory = extension.default as typeof factory;
    isKvmSmsv2Prompt = extension.isKvmSmsv2Prompt;
  });

  it('registers the complete deterministic lifecycle tool surface', async () => {
    const tools: Array<{ name: string }> = [];
    await factory({
      typebox: { Type },
      setLabel() {},
      registerTool(tool: { name: string }) {
        tools.push(tool);
      },
      registerServiceStatus() {},
      on() {},
      logger: { debug() {} },
    });
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'kvm_smsv2_apply',
      'kvm_smsv2_drift',
      'kvm_smsv2_plan',
      'kvm_smsv2_preflight',
      'kvm_smsv2_status',
    ]);
  });

  it('routes only KVM or libvirt Secure Mesh Site requests', () => {
    expect(isKvmSmsv2Prompt('Build an F5 Secure Mesh Site v2 CE on our KVM/libvirt host.')).toBe(true);
    expect(isKvmSmsv2Prompt('Show all libvirt domains.')).toBe(false);
    expect(isKvmSmsv2Prompt('Plan an AWS Customer Edge.')).toBe(false);
  });
});
