import { canonicalSha256 } from './canonical';
import { compileAzureRelayGuestRoute, parseAzureRelayGuestRoute } from './relay-guest-routes';

const require = (value: unknown, message: string): void => {
  if (!value) throw Error(`Azure relay guest FIB: ${message}`);
};
const object = (value: unknown): Record<string, unknown> => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed evidence');
  return value as Record<string, unknown>;
};

/** Collect one exact installed route, alongside its current FRR source path and guest identity. */
export function compileAzureRelayGuestFib(...args: Parameters<typeof compileAzureRelayGuestRoute>) {
  const routeRequest = compileAzureRelayGuestRoute(...args);
  require(routeRequest.routeBinding.direction === 'received', 'received route required for FIB observation');
  const [source, plan] = args;
  const returning = plan.returnPrefixes.includes(routeRequest.routeBinding.prefix);
  const subnet = plan.sloCidr
    .split('/')[0]
    .split('.')
    .reduce((sum, octet) => sum * 256 + Number(octet), 0);
  const gateway = [24, 16, 8, 0].map((shift) => Math.floor((subnet + 1) / 2 ** shift) % 256).join('.');
  const fibBinding = {
    prefix: routeRequest.routeBinding.prefix,
    returning,
    azureGateway: gateway,
    sourcePlanSha256: source.planSha256,
  };
  const encoded = Buffer.from(JSON.stringify(fibBinding)).toString('base64');
  const original =
    "print('XCSH_RELAY_ROUTE:' + expected['nonce'] + ':' + json.dumps(dict(session=dict(guest=receipt,sessions=sessions),route=route), separators=(',',':')))";
  require(routeRequest.python.split(original).length === 2, 'route program mapping differs');
  const readback = `fib_binding = json.loads(base64.b64decode('${encoded}'))
installed = json.loads(run([docker,'exec',container_id,'/usr/bin/vtysh','-c','show ip route ' + fib_binding['prefix'] + ' json']))
if not isinstance(installed,dict) or set(installed) != {fib_binding['prefix']}:
    raise RuntimeError('Exact Zebra prefix unavailable or partial')
paths = installed[fib_binding['prefix']]
if not isinstance(paths,list) or len(paths) != 1 or not isinstance(paths[0],dict):
    raise RuntimeError('One exact Zebra route required')
zebra = paths[0]
next_hop = fib_binding['azureGateway'] if fib_binding['returning'] else route['nextHop']
if zebra.get('prefix') != fib_binding['prefix'] or zebra.get('protocol') != 'bgp' or zebra.get('vrfId') != 0 or zebra.get('vrfName') != 'default' or zebra.get('table') != 254 or any(zebra.get(key) is not True for key in ['selected','destSelected','installed']):
    raise RuntimeError('Zebra selected installation differs')
nexthops = zebra.get('nexthops')
if not isinstance(nexthops,list) or len(nexthops) != 1 or not isinstance(nexthops[0],dict):
    raise RuntimeError('One exact Zebra next hop required')
hop = nexthops[0]
if hop.get('ip') != next_hop or hop.get('afi') != 'ipv4' or hop.get('active') is not True or hop.get('fib') is not True or hop.get('interfaceName') != receipt['interfaceName']:
    raise RuntimeError('Zebra next hop/device installation differs')
def exact_prefix(value):
    return value == fib_binding['prefix'] or (fib_binding['prefix'].endswith('/32') and value == fib_binding['prefix'][:-3])
kernel = json.loads(run(['ip','-j','-4','route','show','table','main','exact',fib_binding['prefix']]))
if not isinstance(kernel,list) or len(kernel) != 1 or not isinstance(kernel[0],dict):
    raise RuntimeError('One exact kernel route required; default fallback cannot pass')
entry = kernel[0]
if not exact_prefix(entry.get('dst')) or entry.get('gateway') != next_hop or entry.get('dev') != receipt['interfaceName'] or entry.get('protocol') not in ['bgp','186',186] or entry.get('flags') != [] or entry.get('type','unicast') != 'unicast' or entry.get('table','main') not in ['main',254] or 'multipath' in entry or 'nexthops' in entry:
    raise RuntimeError('Kernel BGP prefix/next-hop/device differs')
probe_address = fib_binding['prefix'].split('/')[0]
lookup = json.loads(run(['ip','-j','-4','route','get',probe_address]))
if not isinstance(lookup,list) or len(lookup) != 1 or not isinstance(lookup[0],dict):
    raise RuntimeError('One kernel route lookup required')
result = lookup[0]
if result.get('dst') != probe_address or result.get('gateway') != next_hop or result.get('dev') != receipt['interfaceName'] or result.get('prefsrc') != expected['address'] or result.get('flags') != [] or result.get('type','unicast') != 'unicast' or result.get('table','main') not in ['main',254] or 'multipath' in result:
    raise RuntimeError('Kernel lookup path/source differs')
interfaces = json.loads(run(['ip','-j','-4','address','show']))
joined = [item for item in interfaces if item.get('ifname') == receipt['interfaceName'] and item.get('address','').lower() == expected['mac'] and any(address.get('family') == 'inet' and address.get('local') == expected['address'] for address in item.get('addr_info',[]))]
if len(joined) != 1 or type(joined[0].get('ifindex')) is not int or hop.get('interfaceIndex') != joined[0]['ifindex']:
    raise RuntimeError('Kernel/Zebra physical interface join changed')
final = json.loads(run([docker,'container','inspect','xcsh-relay-frr']))
if len(final) != 1 or final[0].get('Id') != container_id or final[0].get('Image') != image_id or final[0].get('State',{}).get('Running') is not True:
    raise RuntimeError('FRR container changed during FIB collection')
fib = dict(prefix=fib_binding['prefix'],nextHop=next_hop,interfaceName=receipt['interfaceName'],interfaceIndex=joined[0]['ifindex'],protocol='bgp',table=254,installed=True,lookupAddress=probe_address,sourceAddress=expected['address'])
print('XCSH_RELAY_FIB:' + expected['nonce'] + ':' + json.dumps(dict(membership=dict(session=dict(guest=receipt,sessions=sessions),route=route),fib=fib),separators=(',',':')))
`;
  const python = routeRequest.python.replace(original, readback.trimEnd());
  const script = `python3 - <<'XCSH_RELAY_GUEST'\n${python}XCSH_RELAY_GUEST`;
  const body = { commandId: 'RunShellScript', script: [script] };
  const commandArgs = [...routeRequest.args];
  commandArgs[commandArgs.indexOf('--scripts') + 1] = script;
  const draft = { routeRequest, fibBinding, python, body, args: commandArgs };
  return { ...draft, requestSha256: canonicalSha256(draft) };
}
export type AzureRelayGuestFibRequest = ReturnType<typeof compileAzureRelayGuestFib>;

/** Current Linux forwarding installation only; cloud traffic and CE sample freshness remain separate. */
export function parseAzureRelayGuestFib(request: AzureRelayGuestFibRequest, raw: unknown) {
  const { requestSha256, ...draft } = request;
  require(requestSha256 === canonicalSha256(draft), 'request integrity differs');
  const value = object(raw);
  require(!value.error &&
    !value.nextLink &&
    Array.isArray(value.value) &&
    value.value.length === 2, 'complete public response required');
  const entries = (value.value as unknown[]).map(object);
  const stdout = entries.filter((entry) => entry.code === 'ComponentStatus/StdOut/succeeded' && entry.level === 'Info');
  const stderr = entries.filter((entry) => entry.code === 'ComponentStatus/StdErr/succeeded' && entry.level === 'Info');
  require(stdout.length === 1 &&
    stderr.length === 1 &&
    typeof stdout[0].message === 'string' &&
    typeof stderr[0].message === 'string' &&
    !stderr[0].message.trim(), 'command unavailable or contains diagnostics');
  const nonce = request.routeRequest.sessionRequest.expected.nonce;
  const marker = `XCSH_RELAY_FIB:${nonce}:`;
  const lines = (stdout[0].message as string).trim().split('\n');
  require(lines.length === 1 && lines[0].startsWith(marker), 'one nonce-bound FIB receipt required');
  const payload = object(JSON.parse(lines[0].slice(marker.length)));
  require(Object.keys(payload).sort().join(',') === 'fib,membership', 'unexpected receipt fields');
  const membership = parseAzureRelayGuestRoute(request.routeRequest, {
    value: [
      {
        code: 'ComponentStatus/StdOut/succeeded',
        level: 'Info',
        message: `XCSH_RELAY_ROUTE:${nonce}:${JSON.stringify(payload.membership)}`,
      },
      { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
    ],
  });
  const fib = object(payload.fib);
  const binding = request.fibBinding;
  const guest = object(membership.session.guest);
  require(Object.keys(fib).sort().join(',') ===
    'installed,interfaceIndex,interfaceName,lookupAddress,nextHop,prefix,protocol,sourceAddress,table' &&
    fib.prefix === binding.prefix &&
    fib.nextHop === (binding.returning ? binding.azureGateway : membership.route.nextHop) &&
    fib.interfaceName === guest.interfaceName &&
    Number.isInteger(fib.interfaceIndex) &&
    (fib.interfaceIndex as number) > 0 &&
    fib.protocol === 'bgp' &&
    fib.table === 254 &&
    fib.installed === true &&
    fib.lookupAddress === binding.prefix.split('/')[0] &&
    fib.sourceAddress === guest.address, 'FIB receipt identity or installed path differs');
  return {
    status: 'observed' as const,
    source: 'current-linux-fib' as const,
    membership,
    fib,
    requestSha256,
    collectedAt: new Date().toISOString(),
    traffic: 'unknown' as const,
    ceSampleFreshnessQualified: false as const,
  };
}
