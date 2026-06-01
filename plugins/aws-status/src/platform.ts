import * as os from 'node:os';
import * as path from 'node:path';

export type PackageManager = 'brew' | 'npm' | 'apt' | 'winget' | 'scoop';

export interface PlatformInfo {
  os: 'darwin' | 'linux' | 'win32';
  arch: string;
  packageManagers: PackageManager[];
  isCorporateManaged: boolean;
  mdmVendor?: string;
  organizationName?: string;
}

function which(cmd: string): boolean {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    return Bun.spawnSync([checker, cmd]).exitCode === 0;
  } catch {
    return false;
  }
}

export async function detectPackageManagers(): Promise<PackageManager[]> {
  const managers: PackageManager[] = [];
  const platform = process.platform;

  if (platform === 'darwin' && which('brew')) managers.push('brew');
  if (platform === 'linux' && which('apt')) managers.push('apt');
  if (platform === 'win32' && which('winget')) managers.push('winget');
  if (platform === 'win32' && which('scoop')) managers.push('scoop');
  if (which('npm')) managers.push('npm');

  return managers;
}

async function detectCorporateManagement(): Promise<{
  isManaged: boolean;
  mdmVendor?: string;
  organizationName?: string;
}> {
  try {
    const profilePath = path.join(os.homedir(), '.xcsh', 'computer-profile.json');
    const file = Bun.file(profilePath);
    if (!(await file.exists())) return { isManaged: false };
    const profile = await file.json();
    const mgmt = profile.management;
    if (!mgmt?.isManaged) return { isManaged: false };
    return {
      isManaged: true,
      mdmVendor: mgmt.mdmVendor,
      organizationName: mgmt.organizationName,
    };
  } catch {
    return { isManaged: false };
  }
}

export async function detectPlatform(): Promise<PlatformInfo> {
  const [packageManagers, corporate] = await Promise.all([detectPackageManagers(), detectCorporateManagement()]);

  return {
    os: process.platform as PlatformInfo['os'],
    arch: os.arch(),
    packageManagers,
    isCorporateManaged: corporate.isManaged,
    mdmVendor: corporate.mdmVendor,
    organizationName: corporate.organizationName,
  };
}
