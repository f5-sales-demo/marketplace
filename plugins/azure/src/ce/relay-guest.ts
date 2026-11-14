import { canonicalSha256, sha256Hex } from './canonical';
import { compileAzureRelayFrrConfig } from './relay-config';
import type { AzureRelayPlan } from './relay-plan';
import type { observeAzureRelayRouteServerIdentity } from './relay-route-server';
import { relayCapabilities, relayDaemons, relayGroups, relayTmpfs } from './relay-runtime-layout';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure relay guest: ${message}`);
};
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed response');
  return value as Json;
};

const activationSource = String.raw`import base64, fcntl, hashlib, json, os, pathlib, re, subprocess, time
mode = payload['mode']
if mode not in ['activate','observe']:
    raise RuntimeError('Guest operation differs')
root = pathlib.Path('/etc/xcsh-relay')
if root.is_symlink() or not root.is_dir() or root.stat().st_uid != 0 or (root / 'frr').is_symlink():
    raise RuntimeError('Guest configuration directory owner differs')
if os.geteuid() != 0:
    raise RuntimeError('Owned guest activation requires root')
lock = open('/run/xcsh-relay-activation.lock', 'a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
def read(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_uid != 0:
        raise RuntimeError('Guest file owner differs')
    return json.loads(path.read_text())
plan = read(root / 'plan.json')
software = read(root / 'software.json')
for record in [plan, software]:
    if any(record.get(key) != expected[key] for key in ['sourcePlanSha256', 'relayPlanSha256']):
        raise RuntimeError('Guest plan/software owner differs')
if plan.get('relayName') != expected['relayName'] or plan.get('frrImage') != expected['frrImage'] or plan.get('frrVersion') != expected['frrVersion'] or plan.get('docker', {}).get('sha256') != expected['dockerArchiveSha256']:
    raise RuntimeError('Guest saved software differs')
if software.get('status') != 'software-prepared' or software.get('frrImage') != expected['frrImage'] or software.get('dockerArchiveSha256') != expected['dockerArchiveSha256'] or not re.fullmatch(re.escape(expected['frrVersion']) + r'(?:_[a-zA-Z0-9][a-zA-Z0-9._-]*)?', software.get('reportedFrrVersion','')):
    raise RuntimeError('Prepared software identity differs')
docker = '/opt/xcsh-relay/bin/docker'
env = dict(os.environ, DOCKER_HOST='unix:///run/xcsh-relay-docker.sock')
def run(args):
    result = subprocess.run(args, check=True, capture_output=True, text=True, env=env, timeout=60)
    if result.stderr.strip():
        raise RuntimeError('Guest command returned diagnostics')
    return result.stdout
version = run([docker, '--version']).strip()
if not re.fullmatch(r'Docker version ' + re.escape(expected['dockerVersion']) + r', build [a-f0-9]+', version) or version != software.get('dockerBinaryVersion'):
    raise RuntimeError('Current Docker binary differs')
images = json.loads(run([docker, 'image', 'inspect', expected['frrImage']]))
if len(images) != 1 or images[0].get('Id') != software.get('imageId') or expected['frrImage'] not in images[0].get('RepoDigests',[]) or images[0].get('Architecture') != 'amd64' or images[0].get('Os') != 'linux':
    raise RuntimeError('Current immutable image differs')
image_id = images[0]['Id']
if not re.fullmatch(r'sha256:[a-f0-9]{64}', image_id):
    raise RuntimeError('Current image ID is unresolved')
interfaces = json.loads(run(['ip', '-j', '-4', 'address', 'show']))
matching = [value for value in interfaces if value.get('address','').lower() == expected['mac'] and any(ip.get('family') == 'inet' and ip.get('local') == expected['address'] for ip in value.get('addr_info',[]))]
if len(matching) != 1 or not re.fullmatch(r'[a-zA-Z0-9_.:-]{1,32}', matching[0].get('ifname','')):
    raise RuntimeError('Current guest NIC MAC/address differs')
for name in ['daemons','vtysh.conf']:
    path = root / 'frr' / name
    if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != plan.get('daemonFilesSha256',{}).get(name):
        raise RuntimeError('Guest daemon configuration differs')
config = payload['configuration']
if hashlib.sha256(config.encode()).hexdigest() != expected['configSha256']:
    raise RuntimeError('Requested config digest differs')
config_record = {key: expected[key] for key in ['sourcePlanSha256','relayPlanSha256','relayName','configSha256']}
conf_path = root / 'frr' / 'frr.conf'
record_path = root / 'config.json'
for path, content, file_mode in [(conf_path,config,0o644),(record_path,json.dumps(config_record),0o600)]:
    if path.exists() or path.is_symlink():
        if path.is_symlink() or not path.is_file() or path.stat().st_uid != 0:
            raise RuntimeError('Guest configuration file owner differs')
        valid = (read(path) == config_record) if path == record_path else (hashlib.sha256(path.read_bytes()).hexdigest() == expected['configSha256'])
        if not valid:
            raise RuntimeError('Existing guest configuration differs; replacement plan required')
    else:
        if mode == 'observe':
            raise RuntimeError('Guest configuration observation unavailable')
        temporary = path.with_suffix(path.suffix + '.pending')
        if temporary.exists() or temporary.is_symlink():
            if temporary.is_symlink() or not temporary.is_file() or temporary.stat().st_uid != 0 or temporary.read_text() != content:
                raise RuntimeError('Pending guest configuration differs')
        else:
            with open(temporary, 'x') as output:
                output.write(content)
                output.flush()
                os.fsync(output.fileno())
        temporary.chmod(file_mode)
        temporary.replace(path)
        directory = os.open(str(path.parent), os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
if mode == 'activate':
    parser_output = run([docker, 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', 'frr', '--entrypoint', '/usr/bin/vtysh', '--mount', 'type=bind,source=/etc/xcsh-relay/frr,target=/etc/frr,readonly', image_id, '--config_dir', '/etc/frr', '-C', '-f', '/etc/frr/frr.conf'])
    if parser_output.strip():
        raise RuntimeError('Guest configuration parser returned diagnostics')
active = subprocess.run(['systemctl','is-active','--quiet','xcsh-relay.service'], capture_output=True, text=True, timeout=15)
if active.returncode not in [0,3]:
    raise RuntimeError('Guest service state unavailable')
if active.returncode == 3:
    if mode == 'observe':
        raise RuntimeError('Guest service observation is inactive')
    run(['systemctl','start','xcsh-relay.service'])
run(['systemctl','is-active','--quiet','xcsh-relay.service'])
deadline = time.monotonic() + 30
while True:
    current = subprocess.run([docker,'container','inspect','xcsh-relay-frr'], capture_output=True, text=True, env=env, timeout=15)
    if current.returncode == 0 and not current.stderr.strip():
        containers = json.loads(current.stdout)
        if len(containers) == 1 and containers[0].get('State',{}).get('Running') is True:
            candidate_id = containers[0].get('Id','')
            if not re.fullmatch(r'[a-f0-9]{64}', candidate_id) or containers[0].get('Image') != image_id:
                raise RuntimeError('Current routing container identity differs')
            probe = subprocess.run([docker,'exec',candidate_id,'/usr/bin/vtysh','-c','show daemons'], capture_output=True, text=True, env=env, timeout=15)
            daemons = probe.stdout.split()
            if probe.returncode == 0 and not probe.stderr.strip() and len(daemons) == len(set(daemons)) and set(daemons) == set(${JSON.stringify(relayDaemons)}):
                break
            if mode == 'observe':
                raise RuntimeError('Current routing daemon observation unavailable')
    elif current.returncode != 1 or not re.fullmatch(r'Error(?: response from daemon)?: No such (?:container|object): xcsh-relay-frr', current.stderr.strip()):
        raise RuntimeError('Current container observation unavailable')
    if time.monotonic() >= deadline:
        raise RuntimeError('Current routing container has not started')
    time.sleep(1)
if len(containers) != 1:
    raise RuntimeError('Current routing container missing or duplicated')
container = containers[0]
host = container.get('HostConfig',{})
capabilities = set(${JSON.stringify(relayCapabilities)})
reported_caps = host.get('CapAdd',[])
if not isinstance(reported_caps,list) or any(not isinstance(cap,str) for cap in reported_caps):
    raise RuntimeError('Current routing capabilities malformed')
normalized_caps = [cap.removeprefix('CAP_') for cap in reported_caps]
if len(normalized_caps) != len(set(normalized_caps)) or set(normalized_caps) != capabilities:
    raise RuntimeError('Current routing capabilities differ')
if host.get('Tmpfs') != ${JSON.stringify(relayTmpfs)} or sorted(host.get('GroupAdd',[])) != sorted(${JSON.stringify(relayGroups)}):
    raise RuntimeError('Current routing writable layout/groups differ')
runtime_config = container.get('Config',{})
if runtime_config.get('Entrypoint') != ['/sbin/tini','--'] or runtime_config.get('Cmd') != ['/usr/lib/frr/docker-start'] or runtime_config.get('User') not in ['', 'root', '0']:
    raise RuntimeError('Current routing entrypoint differs')
if container.get('Image') != image_id or container.get('State',{}).get('Running') is not True or host.get('NetworkMode') != 'host' or host.get('ReadonlyRootfs') is not True or host.get('Privileged') is not False or host.get('CapDrop') != ['ALL'] or host.get('SecurityOpt') not in [['no-new-privileges'], ['no-new-privileges=true']]:
    raise RuntimeError('Current routing container identity/capabilities differ')
mounts = [mount for mount in container.get('Mounts',[]) if mount.get('Destination') == '/etc/frr']
if len(mounts) != 1 or mounts[0].get('Source') != str(root / 'frr') or mounts[0].get('RW') is not False:
    raise RuntimeError('Current routing container config mount differs')
container_id = container.get('Id','')
if not re.fullmatch(r'[a-f0-9]{64}', container_id):
    raise RuntimeError('Current container identity unavailable')
receipt = dict(expected, status='configured', imageId=image_id, interfaceName=matching[0]['ifname'], containerId=container_id)
print('XCSH_RELAY_RECEIPT:' + expected['nonce'] + ':' + json.dumps(receipt, separators=(',',':')))
`;

/** Compile guest configuration from joined cloud identity; the coordinator must collect authoritative CE endpoints. */
export function compileAzureRelayGuestActivation(
  source: AzureCePlan,
  plan: AzureRelayPlan,
  relayName: string,
  server: Awaited<ReturnType<typeof observeAzureRelayRouteServerIdentity>>,
  ceEndpoints: Array<{ node: number; address: string }>,
  nonce: string,
) {
  require(/^[a-f0-9]{32}$/.test(nonce), 'resolved response nonce required');
  const configuration = compileAzureRelayFrrConfig(source, plan, relayName, server, ceEndpoints, plan.returnPrefixes);
  const relay = server.relays.find((item) => item.name === relayName);
  require(relay && /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(relay.mac), 'joined relay MAC required');
  if (!relay) throw Error('Azure relay guest: relay missing');
  const expected = {
    nonce,
    sourcePlanSha256: source.planSha256,
    relayPlanSha256: plan.planSha256,
    relayName,
    vmId: relay.vmId,
    nicId: relay.nicId,
    mac: relay.mac,
    address: relay.address,
    configSha256: configuration.configSha256,
    frrImage: plan.frr.image,
    frrVersion: plan.frr.version,
    dockerVersion: plan.docker.version,
    dockerArchiveSha256: plan.docker.sha256,
  };
  return guestRequest(expected, configuration.config, 'activate');
}
function guestRequest(
  expected: {
    nonce: string;
    sourcePlanSha256: string;
    relayPlanSha256: string;
    relayName: string;
    vmId: string;
    nicId: string;
    mac: string;
    address: string;
    configSha256: string;
    frrImage: string;
    frrVersion: string;
    dockerVersion: string;
    dockerArchiveSha256: string;
  },
  configuration: string,
  mode: 'activate' | 'observe',
) {
  const payload = { expected, configuration, mode };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  const python = `import base64, json\npayload = json.loads(base64.b64decode('${encoded}'))\nexpected = payload['expected']\n${activationSource}`;
  const script = `python3 - <<'XCSH_RELAY_GUEST'\n${python}XCSH_RELAY_GUEST`;
  const body = { commandId: 'RunShellScript', script: [script] };
  const subscription = expected.vmId.split('/')[2];
  const args = [
    'vm',
    'run-command',
    'invoke',
    '--ids',
    expected.vmId,
    '--command-id',
    body.commandId,
    '--scripts',
    script,
    '--subscription',
    subscription,
    '--output',
    'json',
  ];
  return {
    expected: structuredClone(expected),
    configuration,
    mode,
    body,
    args,
    python,
    requestSha256: canonicalSha256({ expected, body, args, configuration, mode }),
  };
}
/** Observe only current software/config/container state after submission; never republish files or restart services. */
export function compileAzureRelayGuestObservation(activation: AzureRelayGuestRequest) {
  verifyRequest(activation);
  require(activation.mode === 'activate', 'activation request required for recovery');
  return guestRequest(activation.expected, activation.configuration, 'observe');
}
function verifyRequest(request: AzureRelayGuestRequest) {
  require(request.requestSha256 ===
    canonicalSha256({
      expected: request.expected,
      body: request.body,
      args: request.args,
      configuration: request.configuration,
      mode: request.mode,
    }) && sha256Hex(request.configuration) === request.expected.configSha256, 'request integrity differs');
}
export type AzureRelayGuestRequest = ReturnType<typeof compileAzureRelayGuestActivation>;

/** Exact public RunCommand result mapping. Request success and unbound stdout are insufficient. */
export function parseAzureRelayGuestReceipt(request: AzureRelayGuestRequest, raw: unknown) {
  verifyRequest(request);
  const result = object(raw);
  require(!result.nextLink &&
    !result.error &&
    Array.isArray(result.value) &&
    result.value.length === 2, 'complete guest stdout/stderr required');
  const values = (result.value as unknown[]).map(object);
  const stdout = values.filter((value) => value.code === 'ComponentStatus/StdOut/succeeded' && value.level === 'Info');
  const stderr = values.filter((value) => value.code === 'ComponentStatus/StdErr/succeeded' && value.level === 'Info');
  require(stdout.length === 1 &&
    stderr.length === 1 &&
    typeof stdout[0].message === 'string' &&
    typeof stderr[0].message === 'string' &&
    !stderr[0].message.trim(), 'guest command evidence unavailable or contains diagnostics');
  const prefix = `XCSH_RELAY_RECEIPT:${request.expected.nonce}:`;
  const lines = (stdout[0].message as string).trim().split('\n');
  require(lines.length === 1 && lines[0].startsWith(prefix), 'one nonce-bound guest receipt required');
  const value = object(JSON.parse(lines[0].slice(prefix.length)));
  require(Object.keys(value).sort().join(',') ===
    [...Object.keys(request.expected), 'status', 'imageId', 'interfaceName', 'containerId']
      .sort()
      .join(','), 'unexpected guest receipt fields');
  for (const [key, expected] of Object.entries(request.expected))
    require(value[key] === expected, 'guest receipt identity differs');
  require(value.status === 'configured' &&
    typeof value.imageId === 'string' &&
    /^sha256:[a-f0-9]{64}$/.test(value.imageId) &&
    typeof value.containerId === 'string' &&
    /^[a-f0-9]{64}$/.test(value.containerId) &&
    typeof value.interfaceName === 'string' &&
    /^[a-zA-Z0-9_.:-]{1,32}$/.test(value.interfaceName), 'current guest runtime identity unavailable');
  return {
    ...request.expected,
    imageId: String(value.imageId),
    containerId: String(value.containerId),
    interfaceName: String(value.interfaceName),
    status: 'configured' as const,
    requestSha256: request.requestSha256,
    observedAt: new Date().toISOString(),
    routing: 'unknown' as const,
    traffic: 'unknown' as const,
    ceSampleFreshnessQualified: false as const,
  };
}
