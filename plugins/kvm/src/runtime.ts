import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { KvmHostObservation, KvmImagePrerequisiteObservation } from './lifecycle';

const SALES_DEMO_ORIGIN = 'https://f5-sales-demo.console.ves.volterra.io';
const IMAGE_PATH = '/api/register/namespaces/system/get-image-download-url';
const CARDINALITY_FAILURE = 'number of maurice_config object is not one';

export interface KvmCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type KvmCommandRunner = (command: string, args: string[], cwd?: string) => Promise<KvmCommandResult>;

export interface KvmRuntimeStatus {
  hostname: string;
  libvirtUri: 'qemu:///system';
  terraformResources: number;
  domains: Array<{ name: string; state: string }>;
  frr: { present: boolean; peers: number; established: number; sha256?: string };
  traffic?: { samples: number; successes: number; statusCodes: number[] };
}

export async function runKvmCommand(command: string, args: string[], cwd?: string): Promise<KvmCommandResult> {
  const child = Bun.spawn([command, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function probeKvmImagePrerequisite(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<KvmImagePrerequisiteObservation> {
  const rawUrl = env.XCSH_API_URL;
  const token = env.XCSH_API_TOKEN;
  if (!rawUrl || !token) throw new Error('Sales Demo XCSH_API_URL and XCSH_API_TOKEN are required');
  const base = new URL(rawUrl);
  if (base.origin !== SALES_DEMO_ORIGIN || (base.pathname !== '/' && base.pathname !== ''))
    throw new Error('KVM SMSv2 operations are restricted to the F5 Sales Demo tenant');

  const response = await fetcher(new URL(IMAGE_PATH, base), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `APIToken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ provider: 'KVM' }),
  });
  if (response.ok) return { available: true };

  const body = (await response.text()).slice(0, 16_384);
  if (body.includes(CARDINALITY_FAILURE)) return { available: false, diagnostic: CARDINALITY_FAILURE };
  throw new Error(`KVM image prerequisite probe failed with HTTP ${response.status}`);
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const TERRAFORM_RESOURCE_KINDS: Record<string, string> = {
  docker_container: 'container',
  libvirt_domain: 'domain',
  libvirt_network: 'network',
  libvirt_volume: 'volume',
};

function terraformOwnedResources(module: unknown): Set<string> {
  const owned = new Set<string>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const current = value as { resources?: unknown; child_modules?: unknown };
    if (Array.isArray(current.resources)) {
      for (const candidate of current.resources) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
        const resource = candidate as { type?: unknown; values?: unknown };
        if (typeof resource.type !== 'string') continue;
        const kind = TERRAFORM_RESOURCE_KINDS[resource.type];
        if (!kind || !resource.values || typeof resource.values !== 'object' || Array.isArray(resource.values))
          continue;
        const name = (resource.values as { name?: unknown }).name;
        if (typeof name === 'string' && name.length > 0) owned.add(`${kind}:${name}`);
      }
    }
    if (Array.isArray(current.child_modules)) for (const child of current.child_modules) visit(child);
  };
  visit(module);
  return owned;
}

async function requireCommand(run: KvmCommandRunner, command: string, args: string[], cwd?: string): Promise<string> {
  const result = await run(command, args, cwd);
  if (result.exitCode !== 0) throw new Error(`KVM host prerequisite command failed: ${command}`);
  return result.stdout;
}

export async function inspectKvmHost(
  workspace: string,
  run: KvmCommandRunner = runKvmCommand,
  exists: (path: string) => Promise<boolean> = pathExists,
): Promise<KvmHostObservation> {
  for (const file of ['backend.tf', 'kvm.tf', 'kvm_frr.tf', '.terraform.lock.hcl'])
    if (!(await exists(join(workspace, file)))) throw new Error(`KVM Terraform workspace is missing ${file}`);

  const hostname = (await requireCommand(run, 'hostname', [], workspace)).trim();
  const terraform = await requireCommand(run, 'terraform', ['version', '-json'], workspace);
  try {
    const version = (JSON.parse(terraform) as { terraform_version?: unknown }).terraform_version;
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('invalid Terraform version');
  } catch {
    throw new Error('Terraform returned an invalid version document');
  }

  const libvirtUri = (await requireCommand(run, 'virsh', ['--connect', 'qemu:///system', 'uri'], workspace)).trim();
  if (libvirtUri !== 'qemu:///system') throw new Error('KVM host did not confirm qemu:///system');

  const shown = await requireCommand(run, 'terraform', [`-chdir=${workspace}`, 'show', '-json'], workspace);
  let state: { values?: { root_module?: unknown } };
  try {
    state = JSON.parse(shown) as typeof state;
  } catch {
    throw new Error('Terraform returned invalid state JSON during KVM ownership inspection');
  }
  const owned = terraformOwnedResources(state.values?.root_module);

  const [domains, networks, volumes, containers] = await Promise.all([
    requireCommand(run, 'virsh', ['--connect', 'qemu:///system', 'list', '--all', '--name'], workspace),
    requireCommand(run, 'virsh', ['--connect', 'qemu:///system', 'net-list', '--all', '--name'], workspace),
    requireCommand(run, 'virsh', ['--connect', 'qemu:///system', 'vol-list', 'default', '--name'], workspace),
    run('docker', ['ps', '--all', '--format', '{{.Names}}'], workspace).then((result) =>
      result.exitCode === 0 ? result.stdout : '',
    ),
  ]);

  return {
    hostname,
    libvirtUri: 'qemu:///system',
    projectResources: [
      ...lines(domains)
        .filter((name) => /^onprem-ce-\d{2}$/.test(name))
        .map((name) => ({ kind: 'domain', name, owned: owned.has(`domain:${name}`) })),
      ...lines(networks)
        .filter((name) => /^ce-bgp-net-[0-9a-f]{8}$/.test(name))
        .map((name) => ({ kind: 'network', name, owned: owned.has(`network:${name}`) })),
      ...lines(volumes)
        .filter((name) => /^onprem-ce-\d{2}-.+\.(?:qcow2|iso)$/.test(name))
        .map((name) => ({ kind: 'volume', name, owned: owned.has(`volume:${name}`) })),
      ...lines(containers)
        .filter((name) => /^mcn-kvm-frr(?:-[0-9a-f]{8})?$/.test(name))
        .map((name) => ({ kind: 'container', name, owned: owned.has(`container:${name}`) })),
    ],
  };
}

function countTerraformResources(module: unknown): number {
  if (!module || typeof module !== 'object') return 0;
  const value = module as { resources?: unknown; child_modules?: unknown };
  const own = Array.isArray(value.resources) ? value.resources.length : 0;
  const children = Array.isArray(value.child_modules) ? value.child_modules : [];
  return own + children.reduce((total, child) => total + countTerraformResources(child), 0);
}

function bgpPeerStates(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(bgpPeerStates);
  const object = value as Record<string, unknown>;
  const direct =
    object.peers && typeof object.peers === 'object' && !Array.isArray(object.peers)
      ? Object.values(object.peers as Record<string, unknown>).flatMap((peer) => {
          if (!peer || typeof peer !== 'object') return [];
          const state = (peer as Record<string, unknown>).state ?? (peer as Record<string, unknown>).bgpState;
          return typeof state === 'string' ? [state] : [];
        })
      : [];
  return [
    ...direct,
    ...Object.entries(object)
      .filter(([key]) => key !== 'peers')
      .flatMap(([, child]) => bgpPeerStates(child)),
  ];
}

export async function inspectKvmRuntimeStatus(
  workspace: string,
  options: { trafficUrl?: string; trafficSamples?: number } = {},
  run: KvmCommandRunner = runKvmCommand,
  exists: (path: string) => Promise<boolean> = pathExists,
): Promise<KvmRuntimeStatus> {
  const host = await inspectKvmHost(workspace, run, exists);
  const shown = await run('terraform', [`-chdir=${workspace}`, 'show', '-json'], workspace);
  if (shown.exitCode !== 0) throw new Error('Terraform KVM state inspection failed; output was withheld');
  let state: { values?: { root_module?: unknown } };
  try {
    state = JSON.parse(shown.stdout) as typeof state;
  } catch {
    throw new Error('Terraform returned invalid state JSON');
  }

  const domainNames = host.projectResources
    .filter((resource) => resource.kind === 'domain')
    .map((resource) => resource.name)
    .sort();
  const domains = [];
  for (const name of domainNames) {
    const result = await run('virsh', ['--connect', 'qemu:///system', 'domstate', name], workspace);
    domains.push({ name, state: result.exitCode === 0 ? result.stdout.trim().toLowerCase() : 'unavailable' });
  }

  const frrContainer = host.projectResources.find((resource) => resource.kind === 'container')?.name;
  let frr: KvmRuntimeStatus['frr'] = { present: false, peers: 0, established: 0 };
  if (frrContainer) {
    const result = await run('docker', ['exec', frrContainer, 'vtysh', '-c', 'show bgp summary json'], workspace);
    if (result.exitCode === 0) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(result.stdout);
      } catch {
        throw new Error('FRR returned invalid BGP summary JSON');
      }
      const states = bgpPeerStates(parsed);
      frr = {
        present: true,
        peers: states.length,
        established: states.filter((peerState) => peerState.toLowerCase() === 'established').length,
        sha256: createHash('sha256').update(result.stdout).digest('hex'),
      };
    }
  }

  let traffic: KvmRuntimeStatus['traffic'];
  if (options.trafficUrl !== undefined) {
    const target = new URL(options.trafficUrl);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.hash)
      throw new Error('Traffic target must be an HTTP(S) URL without credentials or a fragment');
    const samples = options.trafficSamples ?? 3;
    if (!Number.isSafeInteger(samples) || samples < 1 || samples > 20)
      throw new Error('Traffic samples must be an integer from 1 through 20');
    const statusCodes: number[] = [];
    for (let sample = 0; sample < samples; sample += 1) {
      const result = await run(
        'curl',
        [
          '--fail',
          '--silent',
          '--show-error',
          '--max-time',
          '10',
          '--output',
          '/dev/null',
          '--write-out',
          '%{http_code}',
          target.href,
        ],
        workspace,
      );
      const statusCode =
        result.exitCode === 0 && /^\d{3}$/.test(result.stdout.trim()) ? Number(result.stdout.trim()) : 0;
      statusCodes.push(statusCode);
    }
    traffic = {
      samples,
      successes: statusCodes.filter((statusCode) => statusCode >= 200 && statusCode < 400).length,
      statusCodes,
    };
  }

  return {
    hostname: host.hostname,
    libvirtUri: host.libvirtUri,
    terraformResources: countTerraformResources(state.values?.root_module),
    domains,
    frr,
    ...(traffic ? { traffic } : {}),
  };
}
