"""Execute the generated production Python against private temporary files and fake guest commands."""
import ast
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
from unittest.mock import patch

payload = json.load(sys.stdin)
script = payload['python']
ast.parse(script)
expected = payload['expected']
commands = []
interface_name = payload.get('interfaceName', 'eth0')
active = False
inspections = 0
real_stat = pathlib.Path.stat
real_open = open

with tempfile.TemporaryDirectory(prefix='relay-guest-fixture-') as directory:
    root = pathlib.Path(directory) / 'relay'
    root.mkdir()
    for item in payload['bootstrap']['write_files']:
        if item['path'].startswith('/etc/xcsh-relay/'):
            target = root / item['path'].removeprefix('/etc/xcsh-relay/')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(item['content'])
    image_id = 'sha256:' + 'b' * 64
    software = dict(sourcePlanSha256=expected['sourcePlanSha256'], relayPlanSha256=expected['relayPlanSha256'],
                    status='software-prepared', frrImage=expected['frrImage'],
                    dockerArchiveSha256=expected['dockerArchiveSha256'], reportedFrrVersion=expected['frrVersion'] + '_git',
                    imageId=image_id, dockerBinaryVersion='Docker version ' + expected['dockerVersion'] + ', build a82e528')
    (root / 'software.json').write_text(json.dumps(software))
    scenario = payload.get('scenario', 'normal')
    if scenario == 'partial-config':
        (root / 'frr' / 'frr.conf').write_text(payload['configuration'])
    if scenario == 'partial-record':
        (root / 'frr' / 'frr.conf').write_text(payload['configuration'])
        record = {key: expected[key] for key in ['sourcePlanSha256','relayPlanSha256','relayName','configSha256']}
        (root / 'config.json.pending').write_text(json.dumps(record))
    if scenario == 'observe-complete' or scenario.startswith(('sessions-', 'routes-', 'fib-')):
        (root / 'frr' / 'frr.conf').write_text(payload['configuration'])
        record = {key: expected[key] for key in ['sourcePlanSha256','relayPlanSha256','relayName','configSha256']}
        (root / 'config.json').write_text(json.dumps(record))
        active = True
    if scenario == 'foreign-config':
        (root / 'frr' / 'frr.conf').write_text('foreign config')
    def stat_root(path, *args, **kwargs):
        value = list(real_stat(path, *args, **kwargs))
        value[4] = 0
        return os.stat_result(value)
    def open_root(path, *args, **kwargs):
        if str(path) == '/run/xcsh-relay-activation.lock':
            path = root / 'activation.lock'
        return real_open(path, *args, **kwargs)
    def run(args, **kwargs):
        global active, inspections
        commands.append(args)
        code, output, diagnostics = 0, '', ''
        if args[0] == 'ip' and 'route' in args:
            fib = payload['fibBinding']
            sender = payload['routeBinding']['sourcePeers'][0]
            gateway = fib['azureGateway'] if fib['returning'] else sender['address']
            device = interface_name if scenario != 'fib-foreign-device' else 'eth9'
            if 'get' in args:
                value = dict(dst=fib['prefix'].split('/')[0],gateway=gateway,dev=device,prefsrc=expected['address'],flags=[],cache=[])
                if scenario == 'fib-lookup-foreign':
                    value['gateway'] = '10.20.0.99'
            else:
                value = dict(dst=fib['prefix'],gateway=gateway,dev=device,protocol='bgp',flags=[])
                if scenario == 'fib-default-fallback':
                    value['dst'] = 'default'
                if scenario == 'fib-kernel-foreign':
                    value['gateway'] = '10.20.0.99'
                if scenario == 'fib-static-substitute':
                    value['protocol'] = 'static'
                if scenario == 'fib-dead-route':
                    value['flags'] = ['linkdown']
            if 'fibKernel' in payload and 'get' not in args:
                return subprocess.CompletedProcess(args, 0, json.dumps(payload['fibKernel']), '')
            output = json.dumps([] if scenario == 'fib-kernel-missing' else [value,value] if scenario == 'fib-duplicate-kernel' else [value])
        elif args[0] == 'ip':
            output = json.dumps([{'ifindex':2,'ifname':interface_name,'address':expected['mac'] if scenario != 'foreign-mac' else '02:00:00:00:00:00',
                                 'addr_info':[{'family':'inet','local':expected['address']}]}])
        elif args[0] == 'systemctl':
            if args[1] == 'is-active':
                code = 0 if active else 3
            elif args[1] == 'start':
                active = True
            else:
                raise RuntimeError('Unexpected fixture service command')
        elif args[0] == '/opt/xcsh-relay/bin/docker':
            if args[1] == '--version':
                output = software['dockerBinaryVersion']
            elif args[1:3] == ['image','inspect']:
                output = json.dumps([{'Id':image_id,'RepoDigests':[expected['frrImage']], 'Architecture':'amd64','Os':'linux'}])
            elif args[1] == 'run':
                assert '--network' in args and args[args.index('--network') + 1] == 'none'
                assert '--cap-drop' in args and args[args.index('--cap-drop') + 1] == 'ALL'
                assert '/usr/bin/vtysh' in args and '-C' in args
                if scenario == 'parser-diagnostics-stdout':
                    output = 'Missing config diagnostics'
                if scenario == 'parser-diagnostics':
                    diagnostics = 'Missing configuration diagnostics'
            elif args[1] == 'exec':
                assert args[2] == 'c'*64 and args[3:5] == ['/usr/bin/vtysh','-c']
                if args[5] == 'show daemons':
                    output = 'mgmtd zebra bgpd watchfrr staticd'
                    if scenario == 'missing-daemons':
                        output = 'watchfrr'
                    if scenario == 'daemon-diagnostics':
                        diagnostics = 'daemon readback unavailable'
                    return subprocess.CompletedProcess(args, 0, output, diagnostics)
                if args[5].startswith('show ip route '):
                    fib = payload['fibBinding']
                    sender = payload['routeBinding']['sourcePeers'][0]
                    gateway = fib['azureGateway'] if fib['returning'] else sender['address']
                    hop = dict(ip=gateway,afi='ipv4',active=True,fib=True,interfaceName=interface_name,interfaceIndex=2)
                    value = dict(prefix=fib['prefix'],protocol='bgp',vrfId=0,vrfName='default',table=254,selected=True,destSelected=True,installed=True,nexthops=[hop])
                    if scenario == 'fib-zebra-not-installed':
                        value['installed'] = False
                    if scenario == 'fib-zebra-foreign':
                        hop['ip'] = '10.20.0.99'
                    if scenario == 'fib-index-foreign':
                        hop['interfaceIndex'] = 9
                    if scenario == 'fib-zebra-duplicate':
                        value['nexthops'].append(dict(hop))
                    return subprocess.CompletedProcess(args,0,json.dumps(payload.get('fibZebra',{fib['prefix']:[value]})), 'diagnostics' if scenario == 'fib-diagnostics' else '')
                binding = payload['sessionBinding']
                neighbors = {peer['address']: dict(localAs=binding['localAsn'], remoteAs=peer['asn'],
                    localRouterId=binding['localAddress'], hostLocal=binding['localAddress'], hostForeign=peer['address'],
                    bgpVersion=4, bgpState='Established') for peer in binding['peers']}
                first = binding['peers'][0]['address']
                if 'neighborReadback' in payload:
                    neighbors = payload['neighborReadback']
                if scenario.startswith(('sessions-outage-', 'routes-outage-', 'fib-outage-')):
                    selected = binding['unavailablePeer']['address']
                    state = scenario.split('-outage-', 1)[1]
                    neighbors[selected]['bgpState'] = state if state in ['Idle','Connect','Active'] else 'Idle'
                    if state == 'other-down':
                        neighbors[next(peer['address'] for peer in binding['peers'] if peer['address'] != selected)]['bgpState'] = 'Idle'
                    if state == 'cloud-down':
                        neighbors[binding['peers'][-1]['address']]['bgpState'] = 'Idle'
                    if state == 'admin-down':
                        neighbors[selected]['adminShutDown'] = True
                    if state == 'missing-state':
                        del neighbors[selected]['bgpState']
                    if state == 'disappeared':
                        del neighbors[selected]
                if scenario == 'sessions-missing':
                    del neighbors[first]
                if scenario == 'sessions-foreign':
                    neighbors['10.20.0.99'] = neighbors[first]
                if scenario == 'sessions-idle':
                    neighbors[first]['bgpState'] = 'Idle'
                if scenario == 'sessions-foreign-asn':
                    neighbors[first]['remoteAs'] = 64512
                if scenario == 'sessions-foreign-host':
                    neighbors[first]['hostLocal'] = '10.20.0.99'
                if scenario == 'sessions-admin-down':
                    neighbors[first]['adminShutDown'] = True
                if scenario == 'sessions-missing-state':
                    del neighbors[first]['bgpState']
                if scenario == 'sessions-diagnostics':
                    diagnostics = 'vtysh observation unavailable'
                if args[5] == 'show bgp ipv4 neighbors json':
                    output = json.dumps(neighbors)
                else:
                    route = payload['routeBinding']
                    assert args[5] == route['command']
                    sender = route['sourcePeers'][0]
                    if route['direction'] == 'received':
                        path = dict(network=route['prefix'],valid=True,bestpath=True,peerId=sender['address'],
                                    path=str(sender['asn']),nexthops=[dict(ip=sender['address'],afi='ipv4',used=True)])
                        value = dict(localAS=route['localAsn'],routerId=route['localAddress'],vrfName='default',
                                     totalRoutes=1,totalPaths=1,routes={route['prefix']:[path]})
                        if scenario in ['routes-duplicate','routes-duplicate-identity']:
                            duplicate = dict(path)
                            if scenario == 'routes-duplicate-identity':
                                duplicate['bestpath'] = False
                                duplicate['version'] = 77
                            value['routes'][route['prefix']].append(duplicate)
                            value['totalPaths'] = 2
                        if scenario == 'routes-stale':
                            path['stale'] = True
                        if scenario == 'routes-missing-best':
                            del path['bestpath']
                        if scenario == 'routes-foreign-source':
                            path['peerId'] = '10.20.0.99'
                        if scenario == 'routes-foreign-nexthop':
                            path['nexthops'][0]['ip'] = '10.20.0.99'
                        if scenario == 'routes-wrong-count':
                            value['totalPaths'] = 7
                    else:
                        path = dict(network=route['prefix'],valid=True,best=True,path=str(sender['asn']),nextHop='0.0.0.0')
                        value = dict(localAS=route['localAsn'],bgpLocalRouterId=route['localAddress'],
                                     totalPrefixCounter=1,advertisedRoutes={route['prefix']:path})
                        if scenario == 'routes-foreign-nexthop':
                            path['nextHop'] = '10.20.0.99'
                        if scenario == 'routes-missing-best':
                            del path['best']
                        if scenario == 'routes-wrong-count':
                            value['totalPrefixCounter'] = 7
                    if scenario == 'routes-foreign-asn':
                        value['localAS'] = 64512
                    if scenario == 'routes-foreign-path':
                        path['path'] = '64512'
                    if scenario == 'routes-missing-prefix':
                        del value['routes' if route['direction']=='received' else 'advertisedRoutes'][route['prefix']]
                    if scenario == 'routes-partial':
                        value['nextLink'] = 'continuation'
                    if scenario == 'routes-diagnostics':
                        diagnostics = 'route observation diagnostics'
                    output = json.dumps(payload.get('routeTable', value))
            elif args[1:3] == ['container','inspect']:
                inspections += 1
                capabilities = ['NET_ADMIN','NET_RAW','SYS_ADMIN','NET_BIND_SERVICE','SETUID','SETGID','SETPCAP','KILL','CHOWN']
                if scenario == 'foreign-capabilities':
                    capabilities.append('DAC_OVERRIDE')
                if scenario == 'missing-capabilities':
                    capabilities.remove('SYS_ADMIN')
                if scenario == 'prefixed-capabilities':
                    capabilities = ['CAP_' + cap for cap in capabilities]
                if scenario == 'duplicate-capabilities':
                    capabilities.append('CAP_SYS_ADMIN')
                tmpfs = {'/var/run/frr':'rw,nosuid,size=16m,mode=1777','/tmp':'rw,noexec,nosuid,size=16m',
                         '/var/lib/frr':'rw,nosuid,size=16m,mode=1777','/var/tmp/frr':'rw,nosuid,size=16m,mode=1777'}
                if scenario == 'missing-state-directory':
                    del tmpfs['/var/lib/frr']
                groups = ['frr','frrvty'] if scenario != 'missing-groups' else []
                if scenario == 'foreign-mount':
                    source = '/foreign/config'
                else:
                    source = str(root/'frr')
                output = json.dumps([{'Image':image_id,'Id':('d' if (scenario == 'sessions-container-changed' and inspections >= 2) or (scenario == 'routes-container-changed' and inspections >= 3) or (scenario == 'fib-container-changed' and inspections >= 4) else 'c')*64,'State':{'Running':True},
                                     'HostConfig':{'NetworkMode':'host','ReadonlyRootfs':True,'Privileged':False,'CapAdd':capabilities,
                                                   'CapDrop':['ALL'],'SecurityOpt':['no-new-privileges'],'Tmpfs':tmpfs,'GroupAdd':groups},
                                     'Config':{'Entrypoint':['/sbin/tini','--'],'Cmd':['/bin/sh'] if scenario == 'foreign-entrypoint' else ['/usr/lib/frr/docker-start'],'User':''},
                                     'Mounts':[{'Destination':'/etc/frr','Source':source,'RW':False}]}])
            else:
                raise RuntimeError('Unexpected fixture Docker command')
        else:
            raise RuntimeError('Unexpected fixture executable')
        if code and kwargs.get('check'):
            raise subprocess.CalledProcessError(code, args, output, diagnostics)
        return subprocess.CompletedProcess(args, code, output, diagnostics)
    code = script.replace("root = pathlib.Path('/etc/xcsh-relay')", 'root = pathlib.Path(' + repr(str(root)) + ')')
    real_monotonic = time.monotonic
    clock_count = 0
    def monotonic():
        global clock_count
        clock_count += 1
        return clock_count * 31 if scenario in ['missing-daemons','daemon-diagnostics'] else real_monotonic()
    with patch('time.monotonic', monotonic), patch('subprocess.run', run), patch('pathlib.Path.stat', stat_root), patch('builtins.open', open_root), patch('os.geteuid', lambda:0):
        for _ in range(2):
            namespace = {}
            try:
                exec(compile(code, '<generated-relay-guest>', 'exec'), namespace)
            finally:
                if 'lock' in namespace:
                    namespace['lock'].close()
    print(json.dumps({'starts':sum(args[:2]==['systemctl','start'] for args in commands),
                      'configSha256':expected['configSha256'], 'executions':2,
                      'parserRuns':sum(args[:2]==['/opt/xcsh-relay/bin/docker','run'] for args in commands)}))
