import { describe, expect, it } from 'bun:test';
import type { PlatformInfo } from '../src/platform';
import { buildAuthStep, buildInstallStep, buildVerifyCommand } from '../src/wizard';

describe('buildInstallStep', () => {
  it('returns install options for macOS with brew', () => {
    const platform: PlatformInfo = {
      os: 'darwin',
      arch: 'arm64',
      packageManagers: ['brew', 'npm'],
      isCorporateManaged: false,
    };
    const options = buildInstallStep(platform);
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
    const options = buildInstallStep(platform);
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
    const options = buildInstallStep(platform);
    expect(options[0].label).toContain('winget');
  });
});

describe('buildAuthStep', () => {
  it('always includes web browser option first', () => {
    const options = buildAuthStep();
    expect(options[0].key).toBe('web');
    expect(options[0].available).toBe(true);
  });
});

describe('buildVerifyCommand', () => {
  it('returns the sf org display command with alias', () => {
    const cmd = buildVerifyCommand('SFDC');
    expect(cmd).toEqual(['sf', 'org', 'display', '--target-org', 'SFDC', '--json']);
  });

  it('uses provided alias', () => {
    const cmd = buildVerifyCommand('my-org');
    expect(cmd).toContain('my-org');
  });
});
