import { describe, expect, test } from 'bun:test';
import {
  isOriginalCreationScopeProfile,
  resolveInstalledGcpVersionProfile,
  resolveInstalledXcshCreationExecutableProfile,
} from '../src/installed-version-profile';

const lock = '18b715851e8ea176e7b0f11c270f2f0cd2c835a30d497e7676add5156eccfccc';
const terraform = 'dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e';
const google = '97cc25d78bb8fc4c4cccc0672af0cc776b1175e0f0a5cd6a67ba55f0380189f0';
const xcsh = '6b824230418d6acfda3b44c7e8def6dee3cfc03f25ca3f0766b6d5cf528c661d';

describe('current signed XC 15.17.12 artifact profile', () => {
  test('resolves the exact current lock and independently verified executables', () => {
    const profile = resolveInstalledGcpVersionProfile({ terraformVersion: '1.17.2', providerLockSha256: lock });
    expect(profile).toMatchObject({
      terraformVersion: '1.17.2',
      googleVersion: '8.12.0',
      xcshVersion: '15.17.12',
      terraformSha256: terraform,
      googleProviderSha256: google,
      xcProviderSha256: xcsh,
    });
    expect(isOriginalCreationScopeProfile(profile)).toBe(true);
  });
  test('binds original creation to the current exact executable pair', () => {
    const profile = resolveInstalledXcshCreationExecutableProfile(terraform, xcsh);
    expect(profile.xcshVersion).toBe('15.17.12');
    expect(profile.providerLockSha256).toBe(lock);
    expect(isOriginalCreationScopeProfile({ ...profile })).toBe(false);
    expect(() => resolveInstalledXcshCreationExecutableProfile('0'.repeat(64), xcsh)).toThrow();
  });
  test('retains historical ownership profiles without silently replacing stored locks', () => {
    const historical = resolveInstalledGcpVersionProfile({
      terraformVersion: '1.17.2',
      providerLockSha256: '40fdb8634396951a615fe16eaeb575ce9ed0a6756bb15c4611c1c2e5fb5b8fee',
    });
    expect(historical.xcshVersion).toBe('15.17.9');
    expect(() =>
      resolveInstalledGcpVersionProfile({ terraformVersion: '1.17.2', providerLockSha256: '0'.repeat(64) }),
    ).toThrow();
  });
});
