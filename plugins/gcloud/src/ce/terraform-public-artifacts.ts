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

export const GCP_GOOGLE810_TERRAFORM_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> | undefined = {
  configurationVersion: 2,
  versions: { terraform: '1.17.1', google: '8.10.0', xcsh: '15.15.7' },
  providerLock:
    '# This file is maintained automatically by "terraform init".\n# Manual edits may be lost in future updates.\n\nprovider "registry.terraform.io/f5-sales-demo/xcsh" {\n  version     = "15.15.7"\n  constraints = "15.15.7"\n  hashes = [\n    "h1:ZzVyH47TI2iuDchgBC8rfK1mERE5Zx1OZd92/GfwxdY=",\n    "h1:me9KdbvJMPVojT5jh/skY9pCpbLxfl6qGQPUeykbr5c=",\n    "zh:1d5d72740ffda5b14fd92b51c5078bd2d7f48eff71e876e34c2d6c73fdf7f3ca",\n    "zh:2581a16c4f4997818f23e02336e730cfe005e7b935c5236490fea4bec27afe37",\n    "zh:2d20771e496cd467ee684d43b4ed10fb7844c5c8de1562def63e02ce20890b79",\n    "zh:632fbf84bc600b3657d2fa0a0cf6cef9511d0b8a219ed4a6e8b5be8acfb40a63",\n    "zh:6402187ed75dbb5c010405617a4cbe62a1146c2604859144e9779004dcfd023c",\n    "zh:71d6e5d3855d382f30f76a74bb392d97f483e1758feb56da374ae22ceeeeb726",\n    "zh:87df39d0a5db723c36cfcb57c6f6e3df18aaca0e8a555a541abe4714883b72c1",\n    "zh:95513584b227b9c7923e641aae986935821077b1eb4116845b5312ac412bbc72",\n    "zh:c14d573d0659a32c56a93746b0d7da121b40b2d0c46a86a4c1b5dea50b002845",\n    "zh:cf70fee6a41250ac91aff9d9f3b56b0b332952f3037c1651959151f085c559fa",\n    "zh:f4c3d62299b5ddd49937f9bcd31adea4a2ac00988c1db7a670102957c24fa6f3",\n  ]\n}\n\nprovider "registry.terraform.io/hashicorp/google" {\n  version     = "8.10.0"\n  constraints = "8.10.0"\n  hashes = [\n    "h1:KK+bSy5WlYDU1ikIxpXhdSw1E/tv1DHKWc5PwOe1RrQ=",\n    "h1:y/h4PR7S15y5Nv55/6tfQ40YuHr6T+U8h/dbxiMMllc=",\n    "zh:0dbda00be503fb47cebbb67011fa6c49bb00a3bbc3491ec0e9d4e14b1ce1b0dc",\n    "zh:22e291cb672fd02af19a9269de4c30abd51448fd1373554844921b5bad32f94a",\n    "zh:46e589f030ff42d55dc6fc865de5df2b9d1ce54ea244df5ce927034cc5ff897f",\n    "zh:4c54ccd68260d01338a86a618ec33e97e83df6b1c5bd94e528c7a779e8fcabdf",\n    "zh:715a5f898ff0557966d7ceac23da2bf7d521d37b989ce6788de8666c8125f8c4",\n    "zh:7201f7c897afc32f85f61b0f2f02dd9cc58ad0d939b30382b49bad0e752c442d",\n    "zh:7656d49394d9a2e8ec7a1cc7bd732bff110e63e0667598533c4645ec90862440",\n    "zh:8b3166f24ffd12225fffd71102ea7690b6a4d703d67bfc9a425c3c08c41f48f0",\n    "zh:a9a1730a087ded8366adc73cc87ed88160c6d700b8836cecdd5c1c181adf396f",\n    "zh:d7dca048608213e6a8510051720bccc9d2e235fb87f3d67d4f7d8afbcdfc4bd6",\n    "zh:db82d70bcf064b848fb78009ec9bd616cba3d50abe100014e0ade885e5ed8c15",\n    "zh:f569b65999264a9416862bca5cd2a6177d94ccb0424f3a4ef424428912b9cb3c",\n  ]\n}\n',
  expectedLockSha256: 'sha256:fafc5491583b367f9f3a915093e1b311171960cf909143fadc49acb0a862aeb0',
};

/** Authenticated Google8.11 packages; process and live mapping gates remain separate. */
export const GCP_TERRAFORM1171_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> | undefined = {
  configurationVersion: 2,
  versions: { terraform: '1.17.1', google: '8.11.0', xcsh: '15.15.7' },
  providerLock:
    '# This file is maintained automatically by "terraform init".\n# Manual edits may be lost in future updates.\n\nprovider "registry.terraform.io/f5-sales-demo/xcsh" {\n  version     = "15.15.7"\n  constraints = "15.15.7"\n  hashes = [\n    "h1:ZzVyH47TI2iuDchgBC8rfK1mERE5Zx1OZd92/GfwxdY=",\n    "h1:me9KdbvJMPVojT5jh/skY9pCpbLxfl6qGQPUeykbr5c=",\n    "zh:1d5d72740ffda5b14fd92b51c5078bd2d7f48eff71e876e34c2d6c73fdf7f3ca",\n    "zh:2581a16c4f4997818f23e02336e730cfe005e7b935c5236490fea4bec27afe37",\n    "zh:2d20771e496cd467ee684d43b4ed10fb7844c5c8de1562def63e02ce20890b79",\n    "zh:632fbf84bc600b3657d2fa0a0cf6cef9511d0b8a219ed4a6e8b5be8acfb40a63",\n    "zh:6402187ed75dbb5c010405617a4cbe62a1146c2604859144e9779004dcfd023c",\n    "zh:71d6e5d3855d382f30f76a74bb392d97f483e1758feb56da374ae22ceeeeb726",\n    "zh:87df39d0a5db723c36cfcb57c6f6e3df18aaca0e8a555a541abe4714883b72c1",\n    "zh:95513584b227b9c7923e641aae986935821077b1eb4116845b5312ac412bbc72",\n    "zh:c14d573d0659a32c56a93746b0d7da121b40b2d0c46a86a4c1b5dea50b002845",\n    "zh:cf70fee6a41250ac91aff9d9f3b56b0b332952f3037c1651959151f085c559fa",\n    "zh:f4c3d62299b5ddd49937f9bcd31adea4a2ac00988c1db7a670102957c24fa6f3",\n  ]\n}\n\nprovider "registry.terraform.io/hashicorp/google" {\n  version     = "8.11.0"\n  constraints = "8.11.0"\n  hashes = [\n    "h1:R1e8efd3fnpQeN17HzPLfvFAvBv4qTsQEVEEHDa+QXE=",\n    "h1:Wx0mcCg4BAModGKKRbKG0WCdeNc1atseaYCVI08Pu1c=",\n    "zh:06f745dab16e27e746335e1fea09b504dd6fc5ee5d490acdc1bf623b3758a3cb",\n    "zh:0e844d82d0194c769305afe8a109bbd02ed03d2e2fb7c2128a4f086571ae7412",\n    "zh:212c6a9f1f64ac7056e8e85a96de28f00906a8b87e9301611aa20da370753df3",\n    "zh:32aef908bdfd7a67ed10b04d9396d1cdcb11d5bb0baeb89f50fa567cf86c57fb",\n    "zh:47bdba00b1f59937ddb1c6232ee00b7e651d23cb34ad28c859a8da0e4b2277a6",\n    "zh:7b2bcc663e91f19f8ba9dba75037d7d58aa53ffbf4104a8bb952362b1aef0bf8",\n    "zh:7bdfabf1da462eacceb2d36a8331b35ce70a5f6e4538a14097c47d8958c4067d",\n    "zh:8e2017664ccf3fd6ee45c0e7e2b6351ca3c5e812387b3a679f1adc54d640ffef",\n    "zh:c8fbfb3de6f3ecbb44ece3bb05f232a8cf9cf8899a97ae9dd503a208c16d8552",\n    "zh:d9a36ee8b8b86cae8bcaf9034a254b701fec3a4cd53b5f50a7ccde4d4388e3b4",\n    "zh:e173cb16a4673a7a914531c64e7ff0716b27ed6b46e79c1507e50e1af928b4dd",\n    "zh:f569b65999264a9416862bca5cd2a6177d94ccb0424f3a4ef424428912b9cb3c",\n  ]\n}\n',
  expectedLockSha256: 'sha256:c3c6fb09abfd85ce60f31e91fb3ef14b5d30d2ae67680c499c7f4003fcbcaf14',
};

/** Current Terraform artifact; historical provider lock and versions remain resolvable. */
export const GCP_XCSH15157_TERRAFORM1172_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> | undefined =
  GCP_TERRAFORM1171_ARTIFACTS && {
    ...GCP_TERRAFORM1171_ARTIFACTS,
    versions: { ...GCP_TERRAFORM1171_ARTIFACTS.versions, terraform: '1.17.2' },
  };

/** Historical observer graph retains its exact XC15.15.7 lock and versions. */
export const GCP_XCSH15157_OBSERVER_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> | undefined =
  GCP_XCSH15157_TERRAFORM1172_ARTIFACTS && { ...GCP_XCSH15157_TERRAFORM1172_ARTIFACTS, configurationVersion: 3 };

/** Historical XC15.16.2 receipts retain their exact provider lock for recovery and teardown. */
export const GCP_XCSH15162_TERRAFORM_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> = {
  configurationVersion: 2,
  versions: { terraform: '1.17.2', google: '8.11.0', xcsh: '15.16.2' },
  providerLock:
    '# This file is maintained automatically by "terraform init".\n# Manual edits may be lost in future updates.\n\nprovider "registry.terraform.io/f5-sales-demo/xcsh" {\n  version     = "15.16.2"\n  constraints = "15.16.2"\n  hashes = [\n    "h1:cXFxYCm3XL+3hRt3o12gVahNXy+CFbfPi7kTkmAoGOc=",\n    "zh:0df781a1b339c1a117f1ea2f2cab9f1af9ff65b3ba01930e05fc2cce868ecf7e",\n    "zh:2f4ed2a942b409bac7c9701577fcf80ed5a1f0fbf0e464b261c0011516e5f32b",\n    "zh:559cb87e10546922686f598c0deaa0e0d618beffd808d45c4553b3cafcbbdca4",\n    "zh:814d4ba853499bc2dac9b1ae3fbcf3dc249d1458d1cd731179af6cba090e1f1b",\n    "zh:95513584b227b9c7923e641aae986935821077b1eb4116845b5312ac412bbc72",\n    "zh:ac2964d6843d403a3dc5487a0df357799396b5f43089126e9270dec297dd5e45",\n    "zh:b7bd9eb7bca47e3a3433ef68efa0196810caf73df73f55b6b62318142d6bb08c",\n    "zh:b8fad4ceed32add1f96904c626ec8fe3e737de4e51a9ebf6c01a5d04aa37bc31",\n    "zh:d3ca6ea4c7b61273475f86e684c637ff70d0458e46f24646842fa4f998dad256",\n    "zh:e3c3b7a35e971443bfc2a6854f9f70a9f3f39aaa02fef4d8c5ede931f523e8eb",\n    "zh:f6e88921032cc2bba91bd2769f9b31d4d11004698ce7fe0659d92fda24208aa2",\n  ]\n}\n\nprovider "registry.terraform.io/hashicorp/google" {\n  version     = "8.11.0"\n  constraints = "8.11.0"\n  hashes = [\n    "h1:Wx0mcCg4BAModGKKRbKG0WCdeNc1atseaYCVI08Pu1c=",\n    "zh:06f745dab16e27e746335e1fea09b504dd6fc5ee5d490acdc1bf623b3758a3cb",\n    "zh:0e844d82d0194c769305afe8a109bbd02ed03d2e2fb7c2128a4f086571ae7412",\n    "zh:212c6a9f1f64ac7056e8e85a96de28f00906a8b87e9301611aa20da370753df3",\n    "zh:32aef908bdfd7a67ed10b04d9396d1cdcb11d5bb0baeb89f50fa567cf86c57fb",\n    "zh:47bdba00b1f59937ddb1c6232ee00b7e651d23cb34ad28c859a8da0e4b2277a6",\n    "zh:7b2bcc663e91f19f8ba9dba75037d7d58aa53ffbf4104a8bb952362b1aef0bf8",\n    "zh:7bdfabf1da462eacceb2d36a8331b35ce70a5f6e4538a14097c47d8958c4067d",\n    "zh:8e2017664ccf3fd6ee45c0e7e2b6351ca3c5e812387b3a679f1adc54d640ffef",\n    "zh:c8fbfb3de6f3ecbb44ece3bb05f232a8cf9cf8899a97ae9dd503a208c16d8552",\n    "zh:d9a36ee8b8b86cae8bcaf9034a254b701fec3a4cd53b5f50a7ccde4d4388e3b4",\n    "zh:e173cb16a4673a7a914531c64e7ff0716b27ed6b46e79c1507e50e1af928b4dd",\n    "zh:f569b65999264a9416862bca5cd2a6177d94ccb0424f3a4ef424428912b9cb3c",\n  ]\n}\n',
  expectedLockSha256: 'sha256:05b1685de902eec100da53ec973895b04f5faa5b81b3f5257de09caeace531bc',
};

/** Authenticated current registry packages; capture and live qualification remain separate gates. */
export const GCP_XCSH15173_TERRAFORM_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> = {
  configurationVersion: 2,
  versions: { terraform: '1.17.2', google: '8.11.0', xcsh: '15.17.3' },
  providerLock:
    '# This file is maintained automatically by "terraform init".\n# Manual edits may be lost in future updates.\n\nprovider "registry.terraform.io/f5-sales-demo/xcsh" {\n  version     = "15.17.3"\n  constraints = "15.17.3"\n  hashes = [\n    "h1:IbBBBaRzyjz4LWNl2b9LNlxJpF4Y+xvsPXCStCxT0K0=",\n    "zh:0341f888a0598010916e0ab605b3fb9c11209c7f4d30d146ee47c8fca1bb92ae",\n    "zh:1b643d818eb28dfcb494d74e065ddfe809786a7f72f0b5284336d29bb8086b40",\n    "zh:48c917ca9348ae815a2a4465eee949da0d2512a9562fc7ea94ec72d1e52c59e2",\n    "zh:69f4607c3f4e0816ffe9a625bbaa1533583940898ec5d322790b31f316c2597f",\n    "zh:72dd29cefcda936ddd205589a64b9229dee67e53f80d813b8aee615508ae47fa",\n    "zh:7fdfcf578b744dfb33d492baa556dfbe099a74a6ca5464dd37442768ebc20c6c",\n    "zh:95513584b227b9c7923e641aae986935821077b1eb4116845b5312ac412bbc72",\n    "zh:9763efa0afb34c8697342a3c22586479a66f870503a8a74039070a97de8134f2",\n    "zh:b07ddd557ae04d073492f9142425462dd680d0d65c8e15b020121a66e4a0cae9",\n    "zh:b1b128edeb49ca73b89cb6e11141a92795e14c18a6c4134b72a612d65adc96f7",\n    "zh:fefd73bbaa4e369d28c85d66ff43584f29094fc371a931e993cd872e8ffb70af",\n  ]\n}\n\nprovider "registry.terraform.io/hashicorp/google" {\n  version     = "8.11.0"\n  constraints = "8.11.0"\n  hashes = [\n    "h1:Wx0mcCg4BAModGKKRbKG0WCdeNc1atseaYCVI08Pu1c=",\n    "zh:06f745dab16e27e746335e1fea09b504dd6fc5ee5d490acdc1bf623b3758a3cb",\n    "zh:0e844d82d0194c769305afe8a109bbd02ed03d2e2fb7c2128a4f086571ae7412",\n    "zh:212c6a9f1f64ac7056e8e85a96de28f00906a8b87e9301611aa20da370753df3",\n    "zh:32aef908bdfd7a67ed10b04d9396d1cdcb11d5bb0baeb89f50fa567cf86c57fb",\n    "zh:47bdba00b1f59937ddb1c6232ee00b7e651d23cb34ad28c859a8da0e4b2277a6",\n    "zh:7b2bcc663e91f19f8ba9dba75037d7d58aa53ffbf4104a8bb952362b1aef0bf8",\n    "zh:7bdfabf1da462eacceb2d36a8331b35ce70a5f6e4538a14097c47d8958c4067d",\n    "zh:8e2017664ccf3fd6ee45c0e7e2b6351ca3c5e812387b3a679f1adc54d640ffef",\n    "zh:c8fbfb3de6f3ecbb44ece3bb05f232a8cf9cf8899a97ae9dd503a208c16d8552",\n    "zh:d9a36ee8b8b86cae8bcaf9034a254b701fec3a4cd53b5f50a7ccde4d4388e3b4",\n    "zh:e173cb16a4673a7a914531c64e7ff0716b27ed6b46e79c1507e50e1af928b4dd",\n    "zh:f569b65999264a9416862bca5cd2a6177d94ccb0424f3a4ef424428912b9cb3c",\n  ]\n}\n',
  expectedLockSha256: 'sha256:ddd3bbbad292cc08b82014de3060fcf800c02fb2113311c06f50720c1075d615',
};

/** Historical observer receipts retain their original graph and exact provider lock. */
const GCP_XCSH15162_OBSERVER_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> = {
  ...GCP_XCSH15162_TERRAFORM_ARTIFACTS,
  configurationVersion: 3,
};

/** Separate graph version; never rewrites or substitutes a stored version2 profile. */
export const GCP_XCSH15173_OBSERVER_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> = {
  ...GCP_XCSH15173_TERRAFORM_ARTIFACTS,
  configurationVersion: 3,
};

/** Current verified artifact identities only; positive guest/capture gates remain closed. */
export const GCP_XCSH15176_TERRAFORM_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> = {
  configurationVersion: 2,
  versions: { terraform: '1.17.2', google: '8.12.0', xcsh: '15.17.6' },
  providerLock:
    '# This file is maintained automatically by "terraform init".\n# Manual edits may be lost in future updates.\n\nprovider "registry.terraform.io/f5-sales-demo/xcsh" {\n  version     = "15.17.6"\n  constraints = "15.17.6"\n  hashes = [\n    "h1:ENO86u3HFmLllw/yPw/XIZm/LiRL4gq0PhbBcS3STbc=",\n    "h1:QDyAkSojvGnf4QMA0WS7FKToQf3Td55yrEoilTH3yZw=",\n    "zh:6454f368f2174f52f750c7349c6557496b38e247d6052c293ba786a0018989e8",\n    "zh:6c9a88a00b6e54e3f6b81aa01409735d18b16da676d448289c7e367182090262",\n    "zh:7682d1ab71255ffebd104e6cc2af623f3e8db539b64fc842a3166df0fd3ac6bf",\n    "zh:95513584b227b9c7923e641aae986935821077b1eb4116845b5312ac412bbc72",\n    "zh:b01f4c5071604cce7eb5ad0257a78b73e409110eebe2ff9dbd18abcce7827521",\n    "zh:bebac89299b264ac2720bd3720d586e4baf6c9104c88edd876c840d6e166547b",\n    "zh:c162efa3bb6e8f448ec2b35d0d5384b00a7b6c0cf1fb3103c468b56bde390fe4",\n    "zh:c1e8960bd6866206ec84434b2c7e0c168862900c2961c1512add57c302aefd50",\n    "zh:c46ddce355b575e84d6352b59b8d18abea43136768974651fc25b1b2cb178aa3",\n    "zh:d4450445b6b7ed9b4654b7e331a4afd17702ad5242bc3c53e860d429e650aadc",\n    "zh:deaff6041070605720bb9ab3a451cb5f37d3dcf366e50b6c691a395b87898300",\n  ]\n}\n\nprovider "registry.terraform.io/hashicorp/google" {\n  version     = "8.12.0"\n  constraints = "8.12.0"\n  hashes = [\n    "h1:9d+FdGigXECjhHgs8RcW5JhsTTXVNga0X1Pd4O4QHjY=",\n    "h1:es4kOf5hndCahoF3bLHmsLKX93JpkeuThvKQ4Pnm6m8=",\n    "zh:0b486637c4f4a2ff260dcf98e0ab74aa2655884c27df909fc79de9c2829ea6ef",\n    "zh:0b9c04d4bb269389d799f6b871877172d13cd059571768c6c36b28cf297b6fba",\n    "zh:0c63d340b3fda4156bccbd4f02e8ef7d320bea75bd1706573a90851e00129c47",\n    "zh:20371948b3d7f0469f2ad99608d9626a816127c9eb1b4cd007f09e1f68878728",\n    "zh:2a6d9c60699366894da043e604ebe5fee9246bb01bef73ebd100d3dbaf3e5e34",\n    "zh:47aa133c201e1edd2d1eb789f2ef4ccc769fdb49d5000b042280c2ac37acf368",\n    "zh:58e2910ee0625ecd352c2e55050ed35771ed7860dd1e738ee4b53eab695a2ee8",\n    "zh:84a44faf0dc811e48a8590e244c02ffff4a6a10095a4bc869979e7b0e94ae46d",\n    "zh:b8f42d7d79776b54d37c93b51a3f10ae45425fb91fb182bcb2a966e1bd52bdad",\n    "zh:eddf30f53a99381388ff25702ed0c727586deb8c502cd5af395dc98afb217a49",\n    "zh:f569b65999264a9416862bca5cd2a6177d94ccb0424f3a4ef424428912b9cb3c",\n    "zh:f79b40a9d29763535baed6de1cd0d42960059916a1723f8fb4af8a2801dd2f4c",\n  ]\n}\n',
  expectedLockSha256: 'sha256:f77a17ac8bfb5a808da63d887e8427c8663a460600174842e9b534dabf4419a5',
};

/** Separate current observer graph; no historical input or public admission is replaced. */
export const GCP_XCSH15176_OBSERVER_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> = {
  ...GCP_XCSH15176_TERRAFORM_ARTIFACTS,
  configurationVersion: 3,
};

/** Verified current tuple; authenticated guest/live/publication gates remain separate. */
export const GCP_XCSH15178_TERRAFORM_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> = {
  configurationVersion: 2,
  versions: { terraform: '1.17.2', google: '8.12.0', xcsh: '15.17.8' },
  providerLock:
    '# This file is maintained automatically by "terraform init".\n# Manual edits may be lost in future updates.\n\nprovider "registry.terraform.io/f5-sales-demo/xcsh" {\n  version     = "15.17.8"\n  constraints = "15.17.8"\n  hashes = [\n    "h1:BDzdbsyeGRSL+69aYkK28Y32gOORRvpL/qo6TpoEho4=",\n    "h1:sdWqL1TklnHZRkFOOWmr9yFVOuRO93LG3jRMB/q0xyI=",\n    "zh:1d8f62ed772a35675fd8d22be5001b3e9160af99253cc3c24516b7b7defd76be",\n    "zh:22afbde3a99622921b5537a89436091465c8645dd140bf98fc0f1c6af3a151a4",\n    "zh:287c8ed6dde6f913dd218ec713dd17459587e9cf4bf197bc811c84deb65f16ed",\n    "zh:5519792b1dbd23ebb162546b43e68fd7a8c43c5aa69a95e745c0f48f556c593a",\n    "zh:6720c8d5bd97a3071dbf320c2f996bc9bc4d3b674d594e017d8e9d9e42403b99",\n    "zh:87f46dc4b4ca79f1d358e902705321770dfcf5ff2e2c1e8fadb41e67de7a5605",\n    "zh:95513584b227b9c7923e641aae986935821077b1eb4116845b5312ac412bbc72",\n    "zh:bee54896d0c9de3f95c08ea1794caf693c4bb85428fbac462ae159cc8f11dfb9",\n    "zh:d2ef28ceb07719d8830ba5d16057596344c8627303561c062541e7b99a52ab9f",\n    "zh:e302f36aa22111ef6bf42ad01a47c6ab92371efe8a712246c9ae348a4fa53641",\n    "zh:fdc9aa9390a34608f6434631706ef6756e8fce9fadacce5c6cd659bb129e6489",\n  ]\n}\n\nprovider "registry.terraform.io/hashicorp/google" {\n  version     = "8.12.0"\n  constraints = "8.12.0"\n  hashes = [\n    "h1:9d+FdGigXECjhHgs8RcW5JhsTTXVNga0X1Pd4O4QHjY=",\n    "h1:es4kOf5hndCahoF3bLHmsLKX93JpkeuThvKQ4Pnm6m8=",\n    "zh:0b486637c4f4a2ff260dcf98e0ab74aa2655884c27df909fc79de9c2829ea6ef",\n    "zh:0b9c04d4bb269389d799f6b871877172d13cd059571768c6c36b28cf297b6fba",\n    "zh:0c63d340b3fda4156bccbd4f02e8ef7d320bea75bd1706573a90851e00129c47",\n    "zh:20371948b3d7f0469f2ad99608d9626a816127c9eb1b4cd007f09e1f68878728",\n    "zh:2a6d9c60699366894da043e604ebe5fee9246bb01bef73ebd100d3dbaf3e5e34",\n    "zh:47aa133c201e1edd2d1eb789f2ef4ccc769fdb49d5000b042280c2ac37acf368",\n    "zh:58e2910ee0625ecd352c2e55050ed35771ed7860dd1e738ee4b53eab695a2ee8",\n    "zh:84a44faf0dc811e48a8590e244c02ffff4a6a10095a4bc869979e7b0e94ae46d",\n    "zh:b8f42d7d79776b54d37c93b51a3f10ae45425fb91fb182bcb2a966e1bd52bdad",\n    "zh:eddf30f53a99381388ff25702ed0c727586deb8c502cd5af395dc98afb217a49",\n    "zh:f569b65999264a9416862bca5cd2a6177d94ccb0424f3a4ef424428912b9cb3c",\n    "zh:f79b40a9d29763535baed6de1cd0d42960059916a1723f8fb4af8a2801dd2f4c",\n  ]\n}\n',
  expectedLockSha256: 'sha256:74834870028124a9006ab8d34d49517b71b7a7e3ea5a3c1004b3899dacca3b4b',
};
/** Original observer graph with a new exact tuple; historical receipts are unchanged. */
export const GCP_XCSH15178_OBSERVER_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> = {
  ...GCP_XCSH15178_TERRAFORM_ARTIFACTS,
  configurationVersion: 3,
};

/** Latest stable signed tuple; source mapping does not establish live acceptance. */
export const GCP_XCSH15179_TERRAFORM_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> = {
  configurationVersion: 2,
  versions: { terraform: '1.17.2', google: '8.12.0', xcsh: '15.17.9' },
  providerLock:
    '# This file is maintained automatically by "terraform init".\n# Manual edits may be lost in future updates.\n\nprovider "registry.terraform.io/f5-sales-demo/xcsh" {\n  version     = "15.17.9"\n  constraints = "15.17.9"\n  hashes = [\n    "h1:t1cMcRCZX3eS/C4aOQvrhTNB7aIvCJpr+ToUn3awBPI=",\n    "zh:0b1e314767c4ee8604d5efb205ba6ec0b0bad939a55d686827afcdc4ff2a86ab",\n    "zh:1414a6a66f289729ece7227411e96b1e8ab8866e3e4e649ee4c241c4c87c0d32",\n    "zh:2d1d58f27eb12c980374d10407a3b5764d0c9e81756b64135c317b026c677616",\n    "zh:583000fb3a8070ca92295349af9a2090db7d02462201d82d31f55a0e66fb320a",\n    "zh:5db3ba7153cc4343f6fc2a6a50ab232538fc184938692a7b11e9f64beb226992",\n    "zh:85b4c917dd211bf4f8eb5e18321db34c243ec9ff82cfd6831d7c6e6fd044a6e7",\n    "zh:95513584b227b9c7923e641aae986935821077b1eb4116845b5312ac412bbc72",\n    "zh:ac663e89fe2ac12d56796b49a6bdb260effaa4f6c75557f2dc3df0bbdb8111d3",\n    "zh:c9d45a2ecbe174662c9d7c1c2c9656da46277b3a8ee4fdfd48e17b46126ce99c",\n    "zh:daa46eea6c86574518b94a631a50546a808680f0024b58eab8f8a96b9063001f",\n    "zh:ea3d325a9ede113ba43dab4c4602534bd7492274daa0b68f4de95f0d3db2c194",\n  ]\n}\n\nprovider "registry.terraform.io/hashicorp/google" {\n  version     = "8.12.0"\n  constraints = "8.12.0"\n  hashes = [\n    "h1:es4kOf5hndCahoF3bLHmsLKX93JpkeuThvKQ4Pnm6m8=",\n    "zh:0b486637c4f4a2ff260dcf98e0ab74aa2655884c27df909fc79de9c2829ea6ef",\n    "zh:0b9c04d4bb269389d799f6b871877172d13cd059571768c6c36b28cf297b6fba",\n    "zh:0c63d340b3fda4156bccbd4f02e8ef7d320bea75bd1706573a90851e00129c47",\n    "zh:20371948b3d7f0469f2ad99608d9626a816127c9eb1b4cd007f09e1f68878728",\n    "zh:2a6d9c60699366894da043e604ebe5fee9246bb01bef73ebd100d3dbaf3e5e34",\n    "zh:47aa133c201e1edd2d1eb789f2ef4ccc769fdb49d5000b042280c2ac37acf368",\n    "zh:58e2910ee0625ecd352c2e55050ed35771ed7860dd1e738ee4b53eab695a2ee8",\n    "zh:84a44faf0dc811e48a8590e244c02ffff4a6a10095a4bc869979e7b0e94ae46d",\n    "zh:b8f42d7d79776b54d37c93b51a3f10ae45425fb91fb182bcb2a966e1bd52bdad",\n    "zh:eddf30f53a99381388ff25702ed0c727586deb8c502cd5af395dc98afb217a49",\n    "zh:f569b65999264a9416862bca5cd2a6177d94ccb0424f3a4ef424428912b9cb3c",\n    "zh:f79b40a9d29763535baed6de1cd0d42960059916a1723f8fb4af8a2801dd2f4c",\n  ]\n}\n',
  expectedLockSha256: 'sha256:40fdb8634396951a615fe16eaeb575ce9ed0a6756bb15c4611c1c2e5fb5b8fee',
};
export const GCP_XCSH15179_OBSERVER_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> = {
  ...GCP_XCSH15179_TERRAFORM_ARTIFACTS,
  configurationVersion: 3,
};
/** Current normally installed signed tuple; operational and guest acceptance remain independent. */
export const GCP_XCSH151712_TERRAFORM_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> = {
  configurationVersion: 2,
  versions: { terraform: '1.17.2', google: '8.12.0', xcsh: '15.17.12' },
  providerLock:
    '# This file is maintained automatically by "terraform init".\n# Manual edits may be lost in future updates.\n\nprovider "registry.terraform.io/f5-sales-demo/xcsh" {\n  version     = "15.17.12"\n  constraints = "15.17.12"\n  hashes = [\n    "h1:Fu/tuqwG1Z+hDSc52z+XE5rxvqa9TNEzoJ+gAr9/Z/M=",\n    "zh:0ec6fde717eec576bbbf112fea6de764b37f7b68f156c5d3c83ab8fc39b63037",\n    "zh:292456a689d93a90d5fc676415f7d023ef5d3abf0f63414f4f93fc820510017d",\n    "zh:2e2c5e00f3818ebd33fe80490e0fa89e8874de3cf5f52a980dda2d5ca64ff8d2",\n    "zh:340aad458bbbc2cd00809af1460d48c183082ea1db965eea251b1828385edbd6",\n    "zh:7019498bd09b1e54883a55762b517cbcefd6acc8cccbd2fa97a91822e0ecc62a",\n    "zh:7c9101f514b1dbde10dc0ac28f00c3eb9d37c330c00b5f45966f1c3ec0cbe719",\n    "zh:7ce9bab44f117f7257f5e500049fec1635095e6db5409a1d628fed6ec355b901",\n    "zh:95513584b227b9c7923e641aae986935821077b1eb4116845b5312ac412bbc72",\n    "zh:9e8076de014402dbd020155e0502aa4decb345f20f7acc6c863b3429ae1c9972",\n    "zh:e9a0c0d6fa11b9a2e4f5c52462e4be648e2352cb74a10000b4d68193ade84a5d",\n    "zh:ff7fcdee11b36d3f1808d33ca0c18046373db20d11884b783664d7f82fbd2e06",\n  ]\n}\n\nprovider "registry.terraform.io/hashicorp/google" {\n  version     = "8.12.0"\n  constraints = "8.12.0"\n  hashes = [\n    "h1:es4kOf5hndCahoF3bLHmsLKX93JpkeuThvKQ4Pnm6m8=",\n    "zh:0b486637c4f4a2ff260dcf98e0ab74aa2655884c27df909fc79de9c2829ea6ef",\n    "zh:0b9c04d4bb269389d799f6b871877172d13cd059571768c6c36b28cf297b6fba",\n    "zh:0c63d340b3fda4156bccbd4f02e8ef7d320bea75bd1706573a90851e00129c47",\n    "zh:20371948b3d7f0469f2ad99608d9626a816127c9eb1b4cd007f09e1f68878728",\n    "zh:2a6d9c60699366894da043e604ebe5fee9246bb01bef73ebd100d3dbaf3e5e34",\n    "zh:47aa133c201e1edd2d1eb789f2ef4ccc769fdb49d5000b042280c2ac37acf368",\n    "zh:58e2910ee0625ecd352c2e55050ed35771ed7860dd1e738ee4b53eab695a2ee8",\n    "zh:84a44faf0dc811e48a8590e244c02ffff4a6a10095a4bc869979e7b0e94ae46d",\n    "zh:b8f42d7d79776b54d37c93b51a3f10ae45425fb91fb182bcb2a966e1bd52bdad",\n    "zh:eddf30f53a99381388ff25702ed0c727586deb8c502cd5af395dc98afb217a49",\n    "zh:f569b65999264a9416862bca5cd2a6177d94ccb0424f3a4ef424428912b9cb3c",\n    "zh:f79b40a9d29763535baed6de1cd0d42960059916a1723f8fb4af8a2801dd2f4c",\n  ]\n}\n',
  expectedLockSha256: 'sha256:18b715851e8ea176e7b0f11c270f2f0cd2c835a30d497e7676add5156eccfccc',
};
export const GCP_XCSH151712_OBSERVER_ARTIFACTS: Omit<GcpTerraformInputs, 'intent'> = {
  ...GCP_XCSH151712_TERRAFORM_ARTIFACTS,
  configurationVersion: 3,
};

/** New deployments select the latest qualified stable tuple without a release-age delay. */
export const GCP_PUBLIC_TERRAFORM_ARTIFACTS = GCP_XCSH151712_TERRAFORM_ARTIFACTS;
export const GCP_OBSERVER_TERRAFORM_ARTIFACTS = GCP_XCSH151712_OBSERVER_ARTIFACTS;

const packagedProfiles = [
  GCP_XCSH15179_TERRAFORM_ARTIFACTS,
  GCP_XCSH15179_OBSERVER_ARTIFACTS,
  GCP_XCSH15173_TERRAFORM_ARTIFACTS,
  GCP_XCSH15173_OBSERVER_ARTIFACTS,
  GCP_LEGACY_TERRAFORM_ARTIFACTS,
  GCP_PREVIOUS_TERRAFORM_ARTIFACTS,
  GCP_GOOGLE810_TERRAFORM_ARTIFACTS,
  GCP_TERRAFORM1171_ARTIFACTS,
  GCP_XCSH15157_TERRAFORM1172_ARTIFACTS,
  GCP_XCSH15157_OBSERVER_ARTIFACTS,
  GCP_XCSH15162_TERRAFORM_ARTIFACTS,
  GCP_XCSH15162_OBSERVER_ARTIFACTS,
  GCP_PUBLIC_TERRAFORM_ARTIFACTS,
  GCP_OBSERVER_TERRAFORM_ARTIFACTS,
  GCP_XCSH15176_TERRAFORM_ARTIFACTS,
  GCP_XCSH15176_OBSERVER_ARTIFACTS,
  GCP_XCSH15178_TERRAFORM_ARTIFACTS,
  GCP_XCSH15178_OBSERVER_ARTIFACTS,
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
