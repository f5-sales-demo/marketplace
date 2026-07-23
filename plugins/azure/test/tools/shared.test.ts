import { afterEach, describe, expect, it } from 'bun:test';
import { AzAuthError, AzExecError, AzNotFoundError, AzSessionExpiredError } from '../../src/az/exec';
import {
  detectErrorType,
  errorResult,
  makeExecApi,
  normalizeResource,
  normalizeResourceGroup,
  normalizeSubscription,
  normalizeVm,
  textResult,
} from '../../src/tools/shared';

describe('textResult', () => {
  it('returns content array with text type', () => {
    const result = textResult('hello', { tool: 'az_account' });
    expect(result.content).toEqual([{ type: 'text', text: 'hello' }]);
    expect(result.details.tool).toBe('az_account');
    expect(result).not.toHaveProperty('isError');
  });
});

describe('errorResult', () => {
  it('returns content with isError true', () => {
    const result = errorResult('fail', { tool: 'az_group', errorType: 'auth_required' });
    expect(result.content).toEqual([{ type: 'text', text: 'fail' }]);
    expect(result.isError).toBe(true);
    expect(result.details.errorType).toBe('auth_required');
  });
});

describe('detectErrorType', () => {
  it('maps AzAuthError to auth_required', () => {
    expect(detectErrorType(new AzAuthError('msg'))).toBe('auth_required');
  });

  it('maps AzSessionExpiredError to session_expired', () => {
    expect(detectErrorType(new AzSessionExpiredError('msg'))).toBe('session_expired');
  });

  it('maps AzNotFoundError to not_found', () => {
    expect(detectErrorType(new AzNotFoundError('msg'))).toBe('not_found');
  });

  it('maps AzExecError to exec_error', () => {
    expect(detectErrorType(new AzExecError('msg'))).toBe('exec_error');
  });

  it('maps unknown error to exec_error', () => {
    expect(detectErrorType(new Error('unknown'))).toBe('exec_error');
  });

  it('maps non-Error to exec_error', () => {
    expect(detectErrorType('string error')).toBe('exec_error');
  });
});

describe('normalizeSubscription', () => {
  it('extracts whitelisted fields', () => {
    const raw = {
      id: 'sub-123',
      name: 'My Sub',
      state: 'Enabled',
      isDefault: true,
      tenantId: 'tenant-1',
      user: { name: 'user@test.com', type: 'user' },
      extraField: 'should be ignored',
    };
    const result = normalizeSubscription(raw);
    expect(result).toEqual({
      id: 'sub-123',
      name: 'My Sub',
      state: 'Enabled',
      isDefault: true,
      tenantId: 'tenant-1',
      user: { name: 'user@test.com', type: 'user' },
    });
    expect(result).not.toHaveProperty('extraField');
  });

  it('handles missing fields with defaults', () => {
    const result = normalizeSubscription({});
    expect(result.id).toBe('');
    expect(result.name).toBe('');
    expect(result.isDefault).toBe(false);
    expect(result.user).toEqual({ name: '', type: '' });
  });
});

describe('normalizeResourceGroup', () => {
  it('extracts whitelisted fields', () => {
    const raw = {
      id: '/sub/rg1',
      name: 'rg-dev',
      location: 'eastus',
      properties: { provisioningState: 'Succeeded' },
      tags: { env: 'dev' },
      managedBy: 'should be ignored',
    };
    const result = normalizeResourceGroup(raw);
    expect(result.name).toBe('rg-dev');
    expect(result.location).toBe('eastus');
    expect(result.tags).toEqual({ env: 'dev' });
    expect(result).not.toHaveProperty('managedBy');
  });

  it('handles missing tags', () => {
    const result = normalizeResourceGroup({ name: 'rg1' });
    expect(result.tags).toEqual({});
  });
});

describe('normalizeResource', () => {
  it('extracts whitelisted fields', () => {
    const raw = {
      id: '/sub/r1',
      name: 'myvm',
      type: 'Microsoft.Compute/virtualMachines',
      location: 'westus',
      resourceGroup: 'rg1',
      provisioningState: 'Succeeded',
      tags: {},
      identity: { principalId: 'should-be-stripped' },
    };
    const result = normalizeResource(raw);
    expect(result.name).toBe('myvm');
    expect(result.type).toBe('Microsoft.Compute/virtualMachines');
    expect(result).not.toHaveProperty('identity');
  });
});

describe('normalizeVm', () => {
  it('extracts safe fields only', () => {
    const raw = {
      id: '/sub/vm1',
      name: 'web-01',
      location: 'eastus2',
      resourceGroup: 'rg-prod',
      hardwareProfile: { vmSize: 'Standard_D2s_v5' },
      storageProfile: { osDisk: { osType: 'Linux' } },
      provisioningState: 'Succeeded',
      powerState: 'VM running',
      publicIps: '20.1.2.3',
      fqdns: 'web-01.eastus2.cloudapp.azure.com',
      osProfile: { adminUsername: 'SHOULD_NOT_APPEAR', adminPassword: 'SECRET' },
      networkProfile: { networkInterfaces: [{ id: 'nic-1' }] },
    };
    const result = normalizeVm(raw);
    expect(result.name).toBe('web-01');
    expect(result.vmSize).toBe('Standard_D2s_v5');
    expect(result.osType).toBe('Linux');
    expect(result.powerState).toBe('VM running');
    expect(result.publicIps).toBe('20.1.2.3');
    expect(result.fqdns).toBe('web-01.eastus2.cloudapp.azure.com');
    expect(result).not.toHaveProperty('osProfile');
    expect(result).not.toHaveProperty('networkProfile');
    expect(JSON.stringify(result)).not.toContain('SHOULD_NOT_APPEAR');
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });

  it('handles missing nested fields', () => {
    const result = normalizeVm({ name: 'vm1' });
    expect(result.vmSize).toBe('');
    expect(result.osType).toBe('');
    expect(result.powerState).toBe('');
    expect(result.publicIps).toBe('');
    expect(result.fqdns).toBe('');
  });
});

describe('makeExecApi forwards AbortSignal to Bun.spawn only while live', () => {
  const realSpawn = Bun.spawn;

  const emptyStream = () => new ReadableStream<Uint8Array>({ start: (c) => c.close() });
  const fakeChild = () => ({
    stdout: emptyStream(),
    stderr: emptyStream(),
    exited: Promise.resolve(0),
    exitCode: 0,
    killed: false,
  });

  let recordedOptions: { signal?: AbortSignal } | undefined;

  function installSpawnSpy() {
    recordedOptions = undefined;
    Bun.spawn = ((_cmd: string[], options: { signal?: AbortSignal }) => {
      recordedOptions = options;
      return fakeChild();
    }) as unknown as typeof Bun.spawn;
  }

  afterEach(() => {
    Bun.spawn = realSpawn;
  });

  it('hands a live (non-aborted) signal to Bun.spawn', async () => {
    installSpawnSpy();
    const controller = new AbortController();
    await makeExecApi('/tmp').exec('az', ['account', 'show'], { signal: controller.signal });
    expect(recordedOptions).toBeDefined();
    expect('signal' in (recordedOptions ?? {})).toBe(true);
    expect(recordedOptions?.signal).toBe(controller.signal);
  });

  it('withholds an already-aborted (stale) signal from Bun.spawn', async () => {
    installSpawnSpy();
    const controller = new AbortController();
    controller.abort(); // stale abort left over from a prior turn
    await makeExecApi('/tmp').exec('az', ['account', 'show'], { signal: controller.signal });
    expect(recordedOptions).toBeDefined();
    expect('signal' in (recordedOptions ?? {})).toBe(false);
  });
});

describe('makeExecApi live execution', () => {
  it('a non-aborted signal still returns output', async () => {
    const api = makeExecApi(process.cwd());
    const controller = new AbortController();
    const r = await api.exec('sh', ['-c', 'echo hello-live'], { signal: controller.signal });
    expect(r.stdout.trim()).toBe('hello-live');
    expect(r.exitCode).toBe(0);
  });

  it('a stale, already-aborted signal does NOT false-cancel a fresh command', async () => {
    const api = makeExecApi(process.cwd());
    const controller = new AbortController();
    controller.abort();
    const r = await api.exec('sh', ['-c', 'echo still-runs'], { signal: controller.signal });
    expect(r.stdout.trim()).toBe('still-runs');
    expect(r.exitCode).toBe(0);
  });

  it('runs without any signal supplied', async () => {
    const api = makeExecApi(process.cwd());
    const r = await api.exec('sh', ['-c', 'echo no-signal']);
    expect(r.stdout.trim()).toBe('no-signal');
    expect(r.exitCode).toBe(0);
  });
});
