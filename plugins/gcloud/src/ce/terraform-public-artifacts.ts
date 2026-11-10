import type { GcpTerraformInputs } from './terraform-session';

/** Verified immutable XC v15.13.0 and Darwin ARM64/Linux AMD64 provider lock. */
export const GCP_LEGACY_TERRAFORM_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> = {
  configurationVersion: 2,
  versions: {
    terraform: '1.16.6',
    google: '8.7.0',
    xcsh: '15.13.0',
  },
  providerLock:
    '# This file is maintained automatically by "terraform init".\n# Manual edits may be lost in future updates.\n\nprovider "registry.terraform.io/f5-sales-demo/xcsh" {\n  version     = "15.13.0"\n  constraints = "15.13.0"\n  hashes = [\n    "h1:CfB9Clvh4C1I4QucrCtv6YqlvX9Z6E5P3V6iBT2W9uE=",\n    "h1:jFFVz1Mu+WqOMqYT48AcDSfm2MdFOkb78bJA86Sc/+c=",\n    "zh:14f1155c9403858e0b158d44f318ec44863060c9d5db7559cbcceef5d006a424",\n    "zh:1c5c910f9f307811dc89467e1abd8bb377daabb096718a9f6e85e03592bbfe58",\n    "zh:3b24ef444843b72c3eaf9837a45705a3fbc0aad16e7fa86391f7e9ea7bc4dbb9",\n    "zh:3bff1de417cf0509b5c25588f87ecce347d85cd5e05cd1a4ce2ba5ec4f259df7",\n    "zh:52d065e9f92683a7bf6e8233f6fd0723af8a40264e57d9e35f58b1b46e44eb4b",\n    "zh:575471e9607e67bb6c923c070ae9995ddd497ff8ae9730fad4974e0c1f095f5b",\n    "zh:604a529d3df49d8488b998ee2480ef1db711ca7fccb9b99235d49e63410f9853",\n    "zh:81fccfac3658c324c36b5102d5c5e18389f957ef2b50c841a59cb42fb5d48f43",\n    "zh:9386d0ec3d5b0c4ab63f6c27e791bb24578f8ead9e8fe66f51b8c384acab3fed",\n    "zh:95513584b227b9c7923e641aae986935821077b1eb4116845b5312ac412bbc72",\n    "zh:c21b6380b084455a5e47040e5ec3df6cc0ae51cfd502e7b22038d4925b970697",\n  ]\n}\n\nprovider "registry.terraform.io/hashicorp/google" {\n  version     = "8.7.0"\n  constraints = "8.7.0"\n  hashes = [\n    "h1:r0evOKSNhYYj04qb6VCTVtm7/uWr67jMZ2TsgLubk6o=",\n    "h1:vCPO1IbM2/WfU4R3QYtzxIyM5ZLYL0pgDS8bmap20hI=",\n    "zh:087771b1c22126084ec1ac26272f7e0bce1030bedd9d692b6eef38e6baf5db2e",\n    "zh:4e075872421717124f1a059f80a9cd2a742e868e94ee74546e52494a02f656d2",\n    "zh:5024e53d378a551d354244db25085c2db530dfdd7bdbd3a3df03abdc957a8a20",\n    "zh:52dd649ad0c39f51bf39218e896ced370d4c56d65876715b6c12e2ac17f16f71",\n    "zh:70d6c8f5371a354f8265fe4f2c279e0c2f6a06054538dbe2d92e428692192439",\n    "zh:7aceb5fe517d2dbd270644663a2b237fc3be3e06577a40d2009983b5a5088fcd",\n    "zh:bb3a6fd8f472080f3199e57e61cbbdd253c8210b2b70e6c4e30e06b08c39e7de",\n    "zh:cbd1a1de219397ba98f17203751300433766f5c36953e6aece4a1fb1817638a9",\n    "zh:d12886e54a30e3b6f174f879777616401f8749466443bc6db870eddd42985fa7",\n    "zh:d58a84d3a387c78e8ac58b200ceb51a3e332105a11420f33e03aa69b3ec4449f",\n    "zh:ed11511bc8ee66fbe2d0e6b59f694c127f140cba7ea9654e332c3ebfbdf8bea9",\n    "zh:f569b65999264a9416862bca5cd2a6177d94ccb0424f3a4ef424428912b9cb3c",\n  ]\n}\n',
  expectedLockSha256: 'sha256:6d7c7b6c9f2d2c0ca301e7c845b893b07722149b0bc6853f6058d5f27a28050a',
};

/** Authenticated latest stable provider packages; live qualification remains required. */
export const GCP_PREVIOUS_TERRAFORM_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> | undefined = {
  configurationVersion: 2,
  versions: {
    terraform: '1.17.1',
    google: '8.10.0',
    xcsh: '15.15.6',
  },
  providerLock:
    '# This file is maintained automatically by "terraform init".\n# Manual edits may be lost in future updates.\n\nprovider "registry.terraform.io/f5-sales-demo/xcsh" {\n  version     = "15.15.6"\n  constraints = "15.15.6"\n  hashes = [\n    "h1:CPKzMmsKIFJo0WlCPSK0Fs9zWX2Flzxy13nXP47RS90=",\n    "h1:IxWHLGlJLqsSVH3KzpVZZPjYPO5r3sserw9KF6E2ep0=",\n    "zh:0dc77e240b08b5035d2f3367182a8c3c9df8c5ac6120f790df947ff22772afcf",\n    "zh:1457c6fd18390af39bca641484708f34f10eed8bfe5e6432b0d430faf3d97f19",\n    "zh:261a74243fafb9cf540c4d90e4b67f4a8c824ccc833b0debfdd631ff8f53350d",\n    "zh:6e1a68c483696d233692983bd5a24d12419923deb76c1f66e5fe8dd2f04344f4",\n    "zh:826048a87330885105b3bf6a96f240e1b46a2f725b1802d0ad11f0ce36a52b25",\n    "zh:8c8ed7352568f853a9db71157363080dfa951c432dc59a4011c7599bc92894b9",\n    "zh:95513584b227b9c7923e641aae986935821077b1eb4116845b5312ac412bbc72",\n    "zh:a068f359b095fc5daef787a8bda25cffb31406d0de4ae7b02441b78777c80b12",\n    "zh:a46205d26f225341679d1adff61eabbce24825e520da288ea54f687852cb6220",\n    "zh:c3bdabf172003c874b894fbcdc615c8b5502b0ed16407c5b95bfce9f5d3a1ca5",\n    "zh:e7814c97afa4fce5a795ac69ee286aa367b494e9afd3cf587203a1ea7aa12750",\n  ]\n}\n\nprovider "registry.terraform.io/hashicorp/google" {\n  version     = "8.10.0"\n  constraints = "8.10.0"\n  hashes = [\n    "h1:KK+bSy5WlYDU1ikIxpXhdSw1E/tv1DHKWc5PwOe1RrQ=",\n    "h1:y/h4PR7S15y5Nv55/6tfQ40YuHr6T+U8h/dbxiMMllc=",\n    "zh:0dbda00be503fb47cebbb67011fa6c49bb00a3bbc3491ec0e9d4e14b1ce1b0dc",\n    "zh:22e291cb672fd02af19a9269de4c30abd51448fd1373554844921b5bad32f94a",\n    "zh:46e589f030ff42d55dc6fc865de5df2b9d1ce54ea244df5ce927034cc5ff897f",\n    "zh:4c54ccd68260d01338a86a618ec33e97e83df6b1c5bd94e528c7a779e8fcabdf",\n    "zh:715a5f898ff0557966d7ceac23da2bf7d521d37b989ce6788de8666c8125f8c4",\n    "zh:7201f7c897afc32f85f61b0f2f02dd9cc58ad0d939b30382b49bad0e752c442d",\n    "zh:7656d49394d9a2e8ec7a1cc7bd732bff110e63e0667598533c4645ec90862440",\n    "zh:8b3166f24ffd12225fffd71102ea7690b6a4d703d67bfc9a425c3c08c41f48f0",\n    "zh:a9a1730a087ded8366adc73cc87ed88160c6d700b8836cecdd5c1c181adf396f",\n    "zh:d7dca048608213e6a8510051720bccc9d2e235fb87f3d67d4f7d8afbcdfc4bd6",\n    "zh:db82d70bcf064b848fb78009ec9bd616cba3d50abe100014e0ade885e5ed8c15",\n    "zh:f569b65999264a9416862bca5cd2a6177d94ccb0424f3a4ef424428912b9cb3c",\n  ]\n}\n',
  expectedLockSha256: 'sha256:2ff7b8d6b6c29f989ffbbb0ac39131b1ac33da0b6dcef9e4310204e605a5a034',
};

export const GCP_PUBLIC_TERRAFORM_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> | undefined = {
  configurationVersion: 2,
  versions: { terraform: '1.17.1', google: '8.10.0', xcsh: '15.15.7' },
  providerLock:
    '# This file is maintained automatically by "terraform init".\n# Manual edits may be lost in future updates.\n\nprovider "registry.terraform.io/f5-sales-demo/xcsh" {\n  version     = "15.15.7"\n  constraints = "15.15.7"\n  hashes = [\n    "h1:ZzVyH47TI2iuDchgBC8rfK1mERE5Zx1OZd92/GfwxdY=",\n    "h1:me9KdbvJMPVojT5jh/skY9pCpbLxfl6qGQPUeykbr5c=",\n    "zh:1d5d72740ffda5b14fd92b51c5078bd2d7f48eff71e876e34c2d6c73fdf7f3ca",\n    "zh:2581a16c4f4997818f23e02336e730cfe005e7b935c5236490fea4bec27afe37",\n    "zh:2d20771e496cd467ee684d43b4ed10fb7844c5c8de1562def63e02ce20890b79",\n    "zh:632fbf84bc600b3657d2fa0a0cf6cef9511d0b8a219ed4a6e8b5be8acfb40a63",\n    "zh:6402187ed75dbb5c010405617a4cbe62a1146c2604859144e9779004dcfd023c",\n    "zh:71d6e5d3855d382f30f76a74bb392d97f483e1758feb56da374ae22ceeeeb726",\n    "zh:87df39d0a5db723c36cfcb57c6f6e3df18aaca0e8a555a541abe4714883b72c1",\n    "zh:95513584b227b9c7923e641aae986935821077b1eb4116845b5312ac412bbc72",\n    "zh:c14d573d0659a32c56a93746b0d7da121b40b2d0c46a86a4c1b5dea50b002845",\n    "zh:cf70fee6a41250ac91aff9d9f3b56b0b332952f3037c1651959151f085c559fa",\n    "zh:f4c3d62299b5ddd49937f9bcd31adea4a2ac00988c1db7a670102957c24fa6f3",\n  ]\n}\n\nprovider "registry.terraform.io/hashicorp/google" {\n  version     = "8.10.0"\n  constraints = "8.10.0"\n  hashes = [\n    "h1:KK+bSy5WlYDU1ikIxpXhdSw1E/tv1DHKWc5PwOe1RrQ=",\n    "h1:y/h4PR7S15y5Nv55/6tfQ40YuHr6T+U8h/dbxiMMllc=",\n    "zh:0dbda00be503fb47cebbb67011fa6c49bb00a3bbc3491ec0e9d4e14b1ce1b0dc",\n    "zh:22e291cb672fd02af19a9269de4c30abd51448fd1373554844921b5bad32f94a",\n    "zh:46e589f030ff42d55dc6fc865de5df2b9d1ce54ea244df5ce927034cc5ff897f",\n    "zh:4c54ccd68260d01338a86a618ec33e97e83df6b1c5bd94e528c7a779e8fcabdf",\n    "zh:715a5f898ff0557966d7ceac23da2bf7d521d37b989ce6788de8666c8125f8c4",\n    "zh:7201f7c897afc32f85f61b0f2f02dd9cc58ad0d939b30382b49bad0e752c442d",\n    "zh:7656d49394d9a2e8ec7a1cc7bd732bff110e63e0667598533c4645ec90862440",\n    "zh:8b3166f24ffd12225fffd71102ea7690b6a4d703d67bfc9a425c3c08c41f48f0",\n    "zh:a9a1730a087ded8366adc73cc87ed88160c6d700b8836cecdd5c1c181adf396f",\n    "zh:d7dca048608213e6a8510051720bccc9d2e235fb87f3d67d4f7d8afbcdfc4bd6",\n    "zh:db82d70bcf064b848fb78009ec9bd616cba3d50abe100014e0ade885e5ed8c15",\n    "zh:f569b65999264a9416862bca5cd2a6177d94ccb0424f3a4ef424428912b9cb3c",\n  ]\n}\n',
  expectedLockSha256: 'sha256:fafc5491583b367f9f3a915093e1b311171960cf909143fadc49acb0a862aeb0',
};

const packagedProfiles = [
  GCP_LEGACY_TERRAFORM_ARTIFACTS,
  GCP_PREVIOUS_TERRAFORM_ARTIFACTS,
  GCP_PUBLIC_TERRAFORM_ARTIFACTS,
].filter((profile): profile is Omit<GcpTerraformInputs, 'intent'> => profile !== undefined);
Object.freeze(packagedProfiles);
for (const profile of packagedProfiles) {
  Object.freeze(profile.versions);
  Object.freeze(profile);
}
/** Resolve immutable packaged inputs, preserving stored versions instead of migrating them. */
export function resolveGcpTerraformArtifacts(input: unknown): Omit<GcpTerraformInputs, 'intent'> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Original packaged GCP artifacts required');
  const value = input as Partial<GcpTerraformInputs>;
  for (const profile of packagedProfiles) {
    if (
      value.configurationVersion === profile.configurationVersion &&
      value.versions?.terraform === profile.versions.terraform &&
      value.versions.google === profile.versions.google &&
      value.versions.xcsh === profile.versions.xcsh &&
      value.providerLock === profile.providerLock &&
      value.expectedLockSha256 === profile.expectedLockSha256
    )
      return profile;
  }
  throw new Error('Original packaged GCP artifact version or lock differs');
}
