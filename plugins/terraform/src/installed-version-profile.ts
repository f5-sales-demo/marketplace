/** Authenticated artifact identities. Process/live qualification remains separate. */
const profiles = [
  {
    terraformVersion: '1.17.1',
    googleVersion: '8.10.0',
    xcshVersion: '15.15.7',
    providerLockSha256: 'fafc5491583b367f9f3a915093e1b311171960cf909143fadc49acb0a862aeb0',
    terraformSha256: '1eaecd79a92a0114d70017b5d5e274c12e5b4561d971ff0b5e24073cddd287dc',
    googleProviderSha256: 'f792c2ebae7abfc9123e9506b641fa789335b8905caa34effd899595e93e40a9',
    xcProviderSha256: 'd30f9a3921dc16262da4d278cd97bc62e9af73f21ded6d12480798da6d726dc7',
  },
  {
    terraformVersion: '1.17.1',
    googleVersion: '8.10.0',
    xcshVersion: '15.15.6',
    providerLockSha256: '2ff7b8d6b6c29f989ffbbb0ac39131b1ac33da0b6dcef9e4310204e605a5a034',
    terraformSha256: '1eaecd79a92a0114d70017b5d5e274c12e5b4561d971ff0b5e24073cddd287dc',
    googleProviderSha256: 'f792c2ebae7abfc9123e9506b641fa789335b8905caa34effd899595e93e40a9',
    xcProviderSha256: '99173b9eb36d1deeeb3297374f5b86f4a37631b9ba88a9e9da82ced549ad35b3',
  },
  {
    terraformVersion: '1.16.6',
    googleVersion: '8.7.0',
    xcshVersion: '15.13.0',
    providerLockSha256: '6d7c7b6c9f2d2c0ca301e7c845b893b07722149b0bc6853f6058d5f27a28050a',
    terraformSha256: '00a240950f88f51a03ad90975f1647737e40ddcd5df30a703fd840aa07dccced',
    googleProviderSha256: '1c620693bca3fe61c3b8ce8d313f3c6dc35648f2246784e5d92fe3d22e0dfd9f',
    xcProviderSha256: 'c25cc2562047d72ef3b10d2cd8319f13f8c5b6785aa62cc9006b6370ae68fd67',
  },
];

for (const profile of profiles) Object.freeze(profile);
Object.freeze(profiles);
export type InstalledGcpVersionProfile = Readonly<(typeof profiles)[number]>;
export interface InstalledGcpVersionBinding {
  readonly terraformVersion: string;
  readonly providerLockSha256: string;
}
export function resolveInstalledGcpVersionProfile(input: InstalledGcpVersionBinding): InstalledGcpVersionProfile {
  const profile = profiles.find(
    (value) =>
      value.terraformVersion === input.terraformVersion && value.providerLockSha256 === input.providerLockSha256,
  );
  if (!profile) throw new Error('Original installed GCP runtime version and provider lock profile required');
  return profile;
}

export function resolveInstalledGcpExecutableProfile(terraformSha256: string): InstalledGcpVersionProfile {
  const profile = profiles.find((value) => value.terraformSha256 === terraformSha256);
  if (!profile) throw new Error('Original admitted Terraform executable profile required');
  return profile;
}
