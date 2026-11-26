/** Authenticated artifact identities. Process/live qualification remains separate. */
const profiles = [
  {
    terraformVersion: '1.17.2',
    googleVersion: '8.11.0',
    xcshVersion: '15.15.7',
    providerLockSha256: 'c3c6fb09abfd85ce60f31e91fb3ef14b5d30d2ae67680c499c7f4003fcbcaf14',
    terraformSha256: 'dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e',
    googleProviderSha256: 'f6c7080ca82f5ecc2f279f9b6edf152ec366890f76ab0a97a1667bdf17331ef5',
    xcProviderSha256: 'd30f9a3921dc16262da4d278cd97bc62e9af73f21ded6d12480798da6d726dc7',
  },
  {
    terraformVersion: '1.17.1',
    googleVersion: '8.11.0',
    xcshVersion: '15.15.7',
    providerLockSha256: 'c3c6fb09abfd85ce60f31e91fb3ef14b5d30d2ae67680c499c7f4003fcbcaf14',
    terraformSha256: '1eaecd79a92a0114d70017b5d5e274c12e5b4561d971ff0b5e24073cddd287dc',
    googleProviderSha256: 'f6c7080ca82f5ecc2f279f9b6edf152ec366890f76ab0a97a1667bdf17331ef5',
    xcProviderSha256: 'd30f9a3921dc16262da4d278cd97bc62e9af73f21ded6d12480798da6d726dc7',
  },
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
  {
    terraformVersion: '1.17.2',
    googleVersion: '8.11.0',
    xcshVersion: '15.16.2',
    providerLockSha256: '05b1685de902eec100da53ec973895b04f5faa5b81b3f5257de09caeace531bc',
    terraformSha256: 'dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e',
    googleProviderSha256: 'f6c7080ca82f5ecc2f279f9b6edf152ec366890f76ab0a97a1667bdf17331ef5',
    xcProviderSha256: '542d99d1905fe03fadce8a889390751b3ad1531f367ef678cf03d97204ef7cc1',
  },
  {
    terraformVersion: '1.17.2',
    googleVersion: '8.11.0',
    xcshVersion: '15.17.3',
    providerLockSha256: 'ddd3bbbad292cc08b82014de3060fcf800c02fb2113311c06f50720c1075d615',
    terraformSha256: 'dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e',
    googleProviderSha256: 'f6c7080ca82f5ecc2f279f9b6edf152ec366890f76ab0a97a1667bdf17331ef5',
    xcProviderSha256: '89a8011443732db8b64bb7fd44df21da15e4cf6183384e21e531d4533653edb0',
  },
  {
    terraformVersion: '1.17.2',
    googleVersion: '8.12.0',
    xcshVersion: '15.17.6',
    providerLockSha256: 'f77a17ac8bfb5a808da63d887e8427c8663a460600174842e9b534dabf4419a5',
    terraformSha256: 'dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e',
    googleProviderSha256: '97cc25d78bb8fc4c4cccc0672af0cc776b1175e0f0a5cd6a67ba55f0380189f0',
    xcProviderSha256: '3c38dd6ceba946a199970effa34ce0bfcfd4348524b11ec51df3dd9124c5d65f',
  },
  {
    terraformVersion: '1.17.2',
    googleVersion: '8.12.0',
    xcshVersion: '15.17.8',
    providerLockSha256: '74834870028124a9006ab8d34d49517b71b7a7e3ea5a3c1004b3899dacca3b4b',
    terraformSha256: 'dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e',
    googleProviderSha256: '97cc25d78bb8fc4c4cccc0672af0cc776b1175e0f0a5cd6a67ba55f0380189f0',
    xcProviderSha256: 'a480b2e2c07fb0bd890b94563fc0357538066c8d0a38dcb2349c3cd2555c4fc1',
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

export function resolveInstalledGcpExecutableProfile(
  terraformSha256: string,
  googleProviderSha256?: string,
): InstalledGcpVersionProfile {
  const matching = profiles.filter(
    (profile) =>
      profile.terraformSha256 === terraformSha256 &&
      (googleProviderSha256 === undefined || profile.googleProviderSha256 === googleProviderSha256),
  );
  const families = new Set(
    matching.map((profile) => JSON.stringify([profile.googleVersion, profile.googleProviderSha256])),
  );
  if (!matching.length || families.size !== 1)
    throw new Error('Original admitted Terraform and Google executable profile required; ambiguous provider family');
  return matching[0];
}

/** Current source mapping only; this predicate grants no live execution acceptance.
 * Reference identity prevents a copied or mixed artifact tuple from entering it. */
export type OriginalXcshCreationProfile = InstalledGcpVersionProfile & {
  readonly xcshVersion: '15.17.3' | '15.17.6' | '15.17.8';
};
export function isOriginalCreationScopeProfile(
  profile: InstalledGcpVersionProfile,
): profile is OriginalXcshCreationProfile {
  return [
    'ddd3bbbad292cc08b82014de3060fcf800c02fb2113311c06f50720c1075d615',
    'f77a17ac8bfb5a808da63d887e8427c8663a460600174842e9b534dabf4419a5',
    '74834870028124a9006ab8d34d49517b71b7a7e3ea5a3c1004b3899dacca3b4b',
  ].some(
    (providerLockSha256) =>
      profile === resolveInstalledGcpVersionProfile({ terraformVersion: '1.17.2', providerLockSha256 }),
  );
}

/** Resolve only a source-owned original pair; no request can declare a version. */
export function resolveInstalledXcshCreationExecutableProfile(
  terraformSha256: string,
  xcshSha256: string,
): OriginalXcshCreationProfile {
  const matching = profiles.filter(
    (profile) =>
      profile.terraformSha256 === terraformSha256 &&
      profile.xcProviderSha256 === xcshSha256 &&
      isOriginalCreationScopeProfile(profile),
  );
  if (matching.length !== 1 || !isOriginalCreationScopeProfile(matching[0]))
    throw new Error('Original qualified XC creation executable pair required');
  return matching[0];
}
