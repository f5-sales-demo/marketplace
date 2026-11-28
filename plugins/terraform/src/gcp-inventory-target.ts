export type GcpInventoryResourceTarget =
  | Readonly<{ kind: 'disk'; name: string; zone: string }>
  | Readonly<{ kind: 'network' | 'firewall'; name: string }>
  | Readonly<{ kind: 'subnetwork'; name: string; region: string }>;
const validName = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);

/** Exact documented GET paths. Project is supplied by the original ADC owner,
 * never a resource argument; no caller URL, query, alternate family or method.
 */
export function compileGcpInventoryResourceTarget(project: string, input: GcpInventoryResourceTarget) {
  if (!validName(project) || !input) throw new Error('Original Compute inventory scope required');
  const target = Object.freeze({ ...input });
  if (!validName(target.name)) throw new Error('Original Compute inventory name required');
  const keys = Object.keys(target).sort().join(',');
  let path: string;
  if (target.kind === 'disk' && keys === 'kind,name,zone' && validName(target.zone))
    path = `projects/${project}/zones/${target.zone}/disks/${target.name}`;
  else if (target.kind === 'subnetwork' && keys === 'kind,name,region' && validName(target.region))
    path = `projects/${project}/regions/${target.region}/subnetworks/${target.name}`;
  else if (['network', 'firewall'].includes(target.kind) && keys === 'kind,name')
    path = `projects/${project}/global/${target.kind}s/${target.name}`;
  else throw new Error('Original Compute inventory target differs');
  return Object.freeze({ target, path, selfLink: `https://www.googleapis.com/compute/v1/${path}` });
}
