import { expect, test } from 'bun:test';
import {
  resolveInstalledGcpExecutableProfile,
  resolveInstalledGcpVersionProfile,
} from '../src/installed-version-profile';

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

test('fresh latest xcsh patch has a distinct authenticated profile and preserves the prior tuple', () => {
  const latest = resolveInstalledGcpVersionProfile({
    terraformVersion: '1.17.1',
    providerLockSha256: 'fafc5491583b367f9f3a915093e1b311171960cf909143fadc49acb0a862aeb0',
  });
  expect(latest.xcshVersion).toBe('15.15.7');
  expect(latest.xcProviderSha256).toBe('d30f9a3921dc16262da4d278cd97bc62e9af73f21ded6d12480798da6d726dc7');
  const previous = resolveInstalledGcpVersionProfile({
    terraformVersion: '1.17.1',
    providerLockSha256: '2ff7b8d6b6c29f989ffbbb0ac39131b1ac33da0b6dcef9e4310204e605a5a034',
  });
  expect(previous.xcshVersion).toBe('15.15.6');
  expect(previous.xcProviderSha256).toBe('99173b9eb36d1deeeb3297374f5b86f4a37631b9ba88a9e9da82ced549ad35b3');
  expect(latest).not.toBe(previous);
});

test('Google8.11 has its own authenticated tuple and never adopts an8.10 lock', () => {
  const current = resolveInstalledGcpVersionProfile({
    terraformVersion: '1.17.1',
    providerLockSha256: 'c3c6fb09abfd85ce60f31e91fb3ef14b5d30d2ae67680c499c7f4003fcbcaf14',
  });
  expect(current.googleVersion).toBe('8.11.0');
  expect(current.googleProviderSha256).toBe('f6c7080ca82f5ecc2f279f9b6edf152ec366890f76ab0a97a1667bdf17331ef5');
  const previous = resolveInstalledGcpVersionProfile({
    terraformVersion: '1.17.1',
    providerLockSha256: 'fafc5491583b367f9f3a915093e1b311171960cf909143fadc49acb0a862aeb0',
  });
  expect(previous.googleVersion).toBe('8.10.0');
  expect(current).not.toBe(previous);
});

test('shared Terraform binary alone cannot silently select another Google provider family', () => {
  const tf = '1eaecd79a92a0114d70017b5d5e274c12e5b4561d971ff0b5e24073cddd287dc';
  expect(() => resolveInstalledGcpExecutableProfile(tf)).toThrow('ambiguous');
  expect(
    resolveInstalledGcpExecutableProfile(tf, 'f792c2ebae7abfc9123e9506b641fa789335b8905caa34effd899595e93e40a9')
      .googleVersion,
  ).toBe('8.10.0');
  expect(
    resolveInstalledGcpExecutableProfile(tf, 'f6c7080ca82f5ecc2f279f9b6edf152ec366890f76ab0a97a1667bdf17331ef5')
      .googleVersion,
  ).toBe('8.11.0');
  expect(() =>
    resolveInstalledGcpExecutableProfile(tf, '1c620693bca3fe61c3b8ce8d313f3c6dc35648f2246784e5d92fe3d22e0dfd9f'),
  ).toThrow();
});
