import { expect, test } from 'bun:test';
import { resolveInstalledGcpVersionProfile } from '../src/installed-version-profile';

test('latest and historical deployment versions resolve only their own authenticated lock and binaries', () => {
  const latest = resolveInstalledGcpVersionProfile({
    terraformVersion: '1.17.1',
    providerLockSha256: '2ff7b8d6b6c29f989ffbbb0ac39131b1ac33da0b6dcef9e4310204e605a5a034',
  });
  expect(latest.googleVersion).toBe('8.10.0');
  expect(latest.xcshVersion).toBe('15.15.6');
  expect(latest.terraformSha256).toBe('1eaecd79a92a0114d70017b5d5e274c12e5b4561d971ff0b5e24073cddd287dc');
  const legacy = resolveInstalledGcpVersionProfile({
    terraformVersion: '1.16.6',
    providerLockSha256: '6d7c7b6c9f2d2c0ca301e7c845b893b07722149b0bc6853f6058d5f27a28050a',
  });
  expect(legacy.googleVersion).toBe('8.7.0');
  expect(legacy.terraformSha256).toBe('00a240950f88f51a03ad90975f1647737e40ddcd5df30a703fd840aa07dccced');
  expect(Object.isFrozen(latest)).toBe(true);
  for (const input of [
    { terraformVersion: '1.17.1', providerLockSha256: legacy.providerLockSha256 },
    { terraformVersion: '1.16.6', providerLockSha256: latest.providerLockSha256 },
    { terraformVersion: '1.18.0', providerLockSha256: latest.providerLockSha256 },
  ])
    expect(() => resolveInstalledGcpVersionProfile(input)).toThrow();
});
