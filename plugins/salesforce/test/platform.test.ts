import { describe, expect, it } from 'bun:test';
import {
  detectPackageManagers,
  detectPlatform,
  getAuthOptions,
  getInstallOptions,
  type PlatformInfo,
} from '../src/platform';

describe('detectPlatform', () => {
  it('returns a valid os field', async () => {
    const info = await detectPlatform();
    expect(['darwin', 'linux', 'win32']).toContain(info.os);
  });

  it('returns a non-empty arch', async () => {
    const info = await detectPlatform();
    expect(info.arch.length).toBeGreaterThan(0);
  });

  it('returns packageManagers as an array', async () => {
    const info = await detectPlatform();
    expect(Array.isArray(info.packageManagers)).toBe(true);
  });

  it('isCorporateManaged is a boolean', async () => {
    const info = await detectPlatform();
    expect(typeof info.isCorporateManaged).toBe('boolean');
  });
});

describe('detectPackageManagers', () => {
  it('returns an array of detected managers', async () => {
    const managers = await detectPackageManagers();
    expect(Array.isArray(managers)).toBe(true);
    for (const m of managers) {
      expect(['brew', 'npm', 'apt', 'winget', 'scoop']).toContain(m);
    }
  });

  it('npm is detected when available', async () => {
    const managers = await detectPackageManagers();
    // npm/bun should be available in test environment
    expect(managers).toContain('npm');
  });
});

describe('getInstallOptions', () => {
  it('returns brew option for macOS with brew', () => {
    const platform: PlatformInfo = {
      os: 'darwin',
      arch: 'arm64',
      packageManagers: ['brew', 'npm'],
      isCorporateManaged: false,
    };
    const options = getInstallOptions(platform);
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options[0].label).toContain('Homebrew');
    expect(options[0].command[0]).toBe('brew');
  });

  it('returns npm fallback for linux without apt', () => {
    const platform: PlatformInfo = {
      os: 'linux',
      arch: 'x64',
      packageManagers: ['npm'],
      isCorporateManaged: false,
    };
    const options = getInstallOptions(platform);
    expect(options).toHaveLength(1);
    expect(options[0].manager).toBe('npm');
  });

  it('returns winget for windows', () => {
    const platform: PlatformInfo = {
      os: 'win32',
      arch: 'x64',
      packageManagers: ['winget', 'npm'],
      isCorporateManaged: false,
    };
    const options = getInstallOptions(platform);
    expect(options[0].label).toContain('winget');
  });

  it('returns empty for no package managers', () => {
    const platform: PlatformInfo = {
      os: 'linux',
      arch: 'x64',
      packageManagers: [],
      isCorporateManaged: false,
    };
    const options = getInstallOptions(platform);
    expect(options).toHaveLength(0);
  });
});

describe('getAuthOptions', () => {
  it('always includes web browser option first', () => {
    const options = getAuthOptions();
    expect(options[0].key).toBe('web');
    expect(options[0].available).toBe(true);
  });

  it('includes sfdx_url option', () => {
    const options = getAuthOptions();
    const sfdx = options.find((o) => o.key === 'sfdx_url');
    expect(sfdx).toBeDefined();
  });

  it('includes access_token option', () => {
    const options = getAuthOptions();
    const at = options.find((o) => o.key === 'access_token');
    expect(at).toBeDefined();
  });

  it('includes jwt option', () => {
    const options = getAuthOptions();
    const jwt = options.find((o) => o.key === 'jwt');
    expect(jwt).toBeDefined();
  });
});
