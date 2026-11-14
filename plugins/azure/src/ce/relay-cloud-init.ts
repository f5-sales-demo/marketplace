import { canonicalStringify, sha256Hex } from './canonical';
import { type AzureRelayPlan, verifyAzureRelayPlan } from './relay-plan';
import { relayCapabilities, relayGroups, relayTmpfs } from './relay-runtime-layout';
import type { AzureCePlan } from './types';

const bootstrapSource = String.raw`import hashlib, io, json, os, pathlib, re, subprocess, tarfile, urllib.request
root = pathlib.Path('/etc/xcsh-relay')
plan = json.loads((root / 'plan.json').read_text())
binary_root = pathlib.Path('/opt/xcsh-relay/bin')
binary_root.mkdir(parents=True, exist_ok=True)
url = plan['docker']['url']
expected_url = 'https://download.docker.com/linux/static/stable/x86_64/docker-' + plan['docker']['version'] + '.tgz'
if url != expected_url:
    raise RuntimeError('Docker source differs from saved plan')
with urllib.request.urlopen(url, timeout=30) as response:
    if response.geturl() != url:
        raise RuntimeError('Docker source redirected')
    data = response.read(128 * 1024 * 1024 + 1)
if len(data) > 128 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != plan['docker']['sha256']:
    raise RuntimeError('Docker archive differs from saved plan')
allowed = {'docker', 'dockerd', 'containerd', 'containerd-shim-runc-v2', 'ctr', 'runc', 'docker-init', 'docker-proxy'}
seen = set()
with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
    for member in archive.getmembers():
        if member.isdir() and member.name.rstrip('/') == 'docker':
            continue
        if not member.isfile() or member.name.count('/') != 1 or not member.name.startswith('docker/') or member.name.split('/')[1] not in allowed or member.size > 256 * 1024 * 1024:
            raise RuntimeError('Unexpected Docker archive member')
        name = member.name.split('/')[1]
        if name in seen:
            raise RuntimeError('Duplicated Docker archive member')
        seen.add(name)
        target = binary_root / name
        temporary = target.with_suffix('.pending')
        temporary.write_bytes(archive.extractfile(member).read())
        temporary.chmod(0o755)
        temporary.replace(target)
if not {'docker', 'dockerd', 'containerd', 'containerd-shim-runc-v2', 'runc'}.issubset(seen):
    raise RuntimeError('Docker runtime archive is incomplete')
docker = str(binary_root / 'docker')
version = subprocess.run([docker, '--version'], check=True, capture_output=True, text=True).stdout.strip()
if not re.fullmatch(r'Docker version ' + re.escape(plan['docker']['version']) + r', build [a-f0-9]+', version):
    raise RuntimeError('Docker binary version differs')
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemctl', 'enable', '--now', 'xcsh-relay-docker.service'], check=True)
env = dict(os.environ, DOCKER_HOST='unix:///run/xcsh-relay-docker.sock')
subprocess.run([docker, 'pull', '--platform', 'linux/amd64', plan['frrImage']], check=True, env=env)
images = json.loads(subprocess.run([docker, 'image', 'inspect', plan['frrImage']], check=True, capture_output=True, text=True, env=env).stdout)
if len(images) != 1 or images[0].get('Architecture') != 'amd64' or images[0].get('Os') != 'linux' or plan['frrImage'] not in images[0].get('RepoDigests', []) or not re.fullmatch(r'sha256:[a-f0-9]{64}', images[0].get('Id', '')):
    raise RuntimeError('Installed FRR image differs')
image_id = images[0]['Id']
probe = subprocess.run([docker, 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', 'frr', '--entrypoint', '/usr/lib/frr/bgpd', image_id, '--version'], check=True, capture_output=True, text=True, env=env)
versions = re.findall(r'^bgpd version (\d+\.\d+\.\d+)((?:_[a-zA-Z0-9][a-zA-Z0-9._-]*)?)(?:[ \t]|$)', probe.stdout, re.MULTILINE)
if len(versions) != 1 or versions[0][0] != plan['frrVersion']:
    raise RuntimeError('Actual FRR version differs')
receipt = {'sourcePlanSha256': plan['sourcePlanSha256'], 'relayPlanSha256': plan['relayPlanSha256'], 'dockerArchiveSha256': plan['docker']['sha256'], 'dockerBinaryVersion': version, 'frrImage': plan['frrImage'], 'imageId': image_id, 'reportedFrrVersion': ''.join(versions[0]), 'versionStdoutSha256': hashlib.sha256(probe.stdout.encode()).hexdigest(), 'status': 'software-prepared'}
temporary = root / 'software.json.pending'
temporary.write_text(json.dumps(receipt))
temporary.chmod(0o600)
temporary.replace(root / 'software.json')
subprocess.run(['/usr/sbin/sysctl', '-w', 'net.ipv4.ip_forward=1'], check=True)
subprocess.run(['systemctl', 'enable', 'xcsh-relay.service'], check=True)
`;

const startSource = String.raw`import hashlib, json, os, pathlib, re, subprocess
root = pathlib.Path('/etc/xcsh-relay')
plan = json.loads((root / 'plan.json').read_text())
software = json.loads((root / 'software.json').read_text())
config = json.loads((root / 'config.json').read_text())
for record in [software, config]:
    if record.get('sourcePlanSha256') != plan['sourcePlanSha256'] or record.get('relayPlanSha256') != plan['relayPlanSha256']:
        raise RuntimeError('Relay software/configuration owner differs')
if software.get('frrImage') != plan['frrImage'] or software.get('dockerArchiveSha256') != plan['docker']['sha256'] or not re.fullmatch(r'sha256:[a-f0-9]{64}', software.get('imageId', '')):
    raise RuntimeError('Relay software identity differs')
if config.get('relayName') != plan['relayName'] or hashlib.sha256((root / 'frr/frr.conf').read_bytes()).hexdigest() != config.get('configSha256'):
    raise RuntimeError('Relay configuration digest differs')
for name in ['daemons', 'vtysh.conf']:
    if hashlib.sha256((root / 'frr' / name).read_bytes()).hexdigest() != plan['daemonFilesSha256'][name]:
        raise RuntimeError('Relay daemon configuration differs')
docker = '/opt/xcsh-relay/bin/docker'
env = dict(os.environ, DOCKER_HOST='unix:///run/xcsh-relay-docker.sock')
images = json.loads(subprocess.run([docker, 'image', 'inspect', software['imageId']], check=True, capture_output=True, text=True, env=env).stdout)
if len(images) != 1 or images[0].get('Id') != software['imageId'] or plan['frrImage'] not in images[0].get('RepoDigests', []) or images[0].get('Architecture') != 'amd64' or images[0].get('Os') != 'linux':
    raise RuntimeError('Current installed relay image differs')
args = [docker, 'run', '--rm', '--name', 'xcsh-relay-frr', '--network', 'host', '--read-only', '--cap-drop', 'ALL']
for capability in ${JSON.stringify(relayCapabilities)}:
    args.extend(['--cap-add', capability])
for group in ${JSON.stringify(relayGroups)}:
    args.extend(['--group-add', group])
for path, options in ${JSON.stringify(relayTmpfs)}.items():
    args.extend(['--tmpfs', path + ':' + options])
args.extend(['--security-opt', 'no-new-privileges', '--mount', 'type=bind,source=/etc/xcsh-relay/frr,target=/etc/frr,readonly', software['imageId']])
os.execve(docker, args, env)
`;

/** Cold relay bootstrap prepares pinned software. It cannot start routing until a joined, digest-bound configuration exists. */
export function renderAzureRelayCloudInit(source: AzureCePlan, plan: AzureRelayPlan, relayName: string): string {
  verifyAzureRelayPlan(source, plan);
  if (plan.relays.filter((relay) => relay.name === relayName).length !== 1)
    throw Error('Azure relay bootstrap: relay is not in the saved plan');
  const daemons =
    'zebra=yes\nbgpd=yes\nstaticd=yes\nbfdd=no\nvtysh_enable=yes\nzebra_options="-A 127.0.0.1 -s 90000000"\nbgpd_options="-A 127.0.0.1"\n';
  const vtysh = 'service integrated-vtysh-config\n';
  const owner = {
    schemaVersion: 1,
    sourcePlanSha256: source.planSha256,
    relayPlanSha256: plan.planSha256,
    engine: plan.engine,
    subscriptionId: plan.subscriptionId,
    deploymentName: plan.deploymentName,
    relayName,
    frrImage: plan.frr.image,
    frrVersion: plan.frr.version,
    docker: plan.docker,
    daemonFilesSha256: { daemons: sha256Hex(daemons), 'vtysh.conf': sha256Hex(vtysh) },
  };
  const dockerUnit = [
    '[Unit]',
    'Description=Owned xcsh relay container engine',
    'After=network-online.target',
    'Wants=network-online.target',
    '[Service]',
    'Type=notify',
    'Environment=PATH=/opt/xcsh-relay/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    'ExecStart=/opt/xcsh-relay/bin/dockerd --host=unix:///run/xcsh-relay-docker.sock --data-root=/var/lib/xcsh-relay-docker --exec-root=/run/xcsh-relay-docker --pidfile=/run/xcsh-relay-docker.pid --bridge=none --iptables=false --ip6tables=false',
    'Restart=on-failure',
    'RestartSec=5',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join('\n');
  const frrUnit = [
    '[Unit]',
    'Description=Owned xcsh FRR relay',
    'After=xcsh-relay-docker.service network-online.target',
    'Requires=xcsh-relay-docker.service',
    'ConditionPathExists=/etc/xcsh-relay/frr/frr.conf',
    'ConditionPathExists=/etc/xcsh-relay/config.json',
    'ConditionPathExists=/etc/xcsh-relay/software.json',
    '[Service]',
    'Type=simple',
    'ExecStart=/usr/bin/python3 /usr/local/lib/xcsh-relay-start.py',
    'ExecStop=/opt/xcsh-relay/bin/docker --host=unix:///run/xcsh-relay-docker.sock stop --time=20 xcsh-relay-frr',
    'Restart=on-failure',
    'RestartSec=5',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join('\n');
  const write = (path: string, content: string, permissions: string) => ({
    path,
    content,
    permissions,
    owner: 'root:root',
  });
  return `#cloud-config\n${JSON.stringify(
    {
      write_files: [
        write('/etc/xcsh-relay/plan.json', canonicalStringify(owner), '0600'),
        write('/etc/xcsh-relay/frr/daemons', daemons, '0644'),
        write('/etc/xcsh-relay/frr/vtysh.conf', vtysh, '0644'),
        write('/usr/local/lib/xcsh-relay-bootstrap.py', bootstrapSource, '0700'),
        write('/usr/local/lib/xcsh-relay-start.py', startSource, '0700'),
        write('/etc/systemd/system/xcsh-relay-docker.service', dockerUnit, '0644'),
        write('/etc/systemd/system/xcsh-relay.service', frrUnit, '0644'),
        write('/etc/sysctl.d/80-xcsh-relay.conf', 'net.ipv4.ip_forward=1\n', '0644'),
      ],
      runcmd: [['python3', '/usr/local/lib/xcsh-relay-bootstrap.py']],
    },
    null,
    2,
  )}\n`;
}
