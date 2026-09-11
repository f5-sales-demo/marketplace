import type { AzExecApi } from '../az/exec';
import { canonicalSha256 } from './canonical';
import type { AzureCeAction, AzureCeCheckpoint, AzureCePlan } from './types';

type Json = Record<string, unknown>;
type PendingAction = NonNullable<AzureCeCheckpoint['pendingAction']>;

const RECOVERABLE_KINDS = new Set([
  'resource-group-create',
  'vnet-create',
  'subnet-create',
  'nsg-create',
  'nsg-rule-create',
  'public-ip-create',
  'nic-create',
  'nic-update',
  'vm-create',
  'vm-start',
  'vm-stop',
  'vm-deallocate',
  'vm-resize',
  'vm-delete',
  'route-table-create',
  'route-create',
  'route-association-update',
  'route-server-create',
  'route-server-peer-create',
  'brownfield-restore',
]);

function object(value: unknown, message: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Json;
}

function nested(value: unknown, keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Json)[key];
  }
  return current;
}

function lower(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function options(args: string[], name: string): string[] {
  const index = args.indexOf(name);
  if (index < 0) return [];
  const values: string[] = [];
  for (let cursor = index + 1; cursor < args.length && !args[cursor].startsWith('--'); cursor++)
    values.push(args[cursor]);
  return values;
}

function errorCode(stdout: string, stderr: string): string | undefined {
  for (const raw of [stderr, stdout]) {
    try {
      const value = JSON.parse(raw) as unknown;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as Json;
        if (typeof record.code === 'string') return record.code;
        if (record.error && typeof record.error === 'object' && !Array.isArray(record.error)) {
          const code = (record.error as Json).code;
          if (typeof code === 'string') return code;
        }
      }
    } catch {
      // Azure CLI often emits its error code in human-readable stderr.
    }
  }
  return (
    /^(?:ERROR:\s*)?\(([A-Za-z][A-Za-z0-9]+)\)/m.exec(stderr)?.[1] ??
    /^Code:\s*([A-Za-z][A-Za-z0-9]+)\s*$/m.exec(stderr)?.[1]
  );
}

function assertRecoverableAction(action: AzureCeAction): asserts action is AzureCeAction & {
  command: 'az';
  args: string[];
  resourceId: string;
} {
  if (
    !action.mutates ||
    action.command !== 'az' ||
    !action.args ||
    !action.resourceId ||
    !RECOVERABLE_KINDS.has(action.kind)
  )
    throw new Error('Azure native mutation has no supported durable recovery contract');
}

function expectedRequest(plan: AzureCePlan, action: AzureCeAction): PendingAction {
  assertRecoverableAction(action);
  const resourceId = action.resourceId.toLowerCase();
  return {
    actionId: action.id,
    kind: action.kind,
    resourceId,
    requestSha256: canonicalSha256({
      planSha256: plan.planSha256,
      actionId: action.id,
      kind: action.kind,
      resourceId,
      args: action.args,
    }),
  };
}

export function buildAzureNativePendingAction(plan: AzureCePlan, action: AzureCeAction): PendingAction {
  return expectedRequest(plan, action);
}

export function validateAzureNativePendingAction(
  plan: AzureCePlan,
  completedActionIds: string[],
  value: unknown,
): PendingAction {
  const action = plan.actions[completedActionIds.length];
  if (!action) throw new Error('Pending Azure native mutation has no next immutable action');
  const expected = expectedRequest(plan, action);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Pending Azure native mutation is malformed');
  const candidate = value as Json;
  if (
    Object.keys(candidate).sort().join(',') !== 'actionId,kind,requestSha256,resourceId' ||
    canonicalSha256(candidate) !== canonicalSha256(expected)
  )
    throw new Error('Pending Azure native mutation differs from the immutable request');
  return expected;
}

function ownershipParent(resourceId: string): string | undefined {
  const patterns = [
    /^(.*\/providers\/microsoft\.network\/virtualnetworks\/[^/]+)\/subnets\/[^/]+$/i,
    /^(.*\/providers\/microsoft\.network\/networksecuritygroups\/[^/]+)\/securityrules\/[^/]+$/i,
    /^(.*\/providers\/microsoft\.network\/routetables\/[^/]+)\/routes\/[^/]+$/i,
    /^(.*\/providers\/microsoft\.network\/virtualhubs\/[^/]+)\/bgpconnections\/[^/]+$/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(resourceId);
    if (match) return match[1];
  }
}

async function readResource(
  plan: AzureCePlan,
  resourceId: string,
  api: AzExecApi,
  signal?: AbortSignal,
  vm = false,
): Promise<Json | undefined> {
  const group = !resourceId.toLowerCase().includes('/providers/');
  const result = await api.exec(
    'az',
    group
      ? [
          'group',
          'show',
          '--name',
          plan.intent.resourceGroup,
          '--subscription',
          plan.subscription.id,
          '--output',
          'json',
        ]
      : vm
        ? [
            'vm',
            'show',
            '--ids',
            resourceId,
            '--show-details',
            '--subscription',
            plan.subscription.id,
            '--output',
            'json',
          ]
        : ['resource', 'show', '--ids', resourceId, '--subscription', plan.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  if (result.exitCode !== 0) {
    const code = errorCode(result.stdout, result.stderr);
    if (code === 'ResourceNotFound' || code === 'ResourceGroupNotFound') return undefined;
    throw new Error('Azure pending mutation postcondition evidence is unavailable');
  }
  let value: Json;
  try {
    value = object(JSON.parse(result.stdout), 'Malformed Azure pending mutation postcondition evidence');
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Malformed Azure pending mutation postcondition evidence');
    throw error;
  }
  if (lower(value.id) !== resourceId.toLowerCase() || value.nextLink !== undefined)
    throw new Error('Azure pending mutation returned a different resource identity');
  return value;
}

function assertOwner(plan: AzureCePlan, value: Json, expectedPlanSha256 = plan.planSha256): void {
  const tags = object(value.tags, 'Azure pending mutation ownership tags are unavailable');
  if (
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    tags['xcsh-execution-engine'] !== plan.engine ||
    tags['xcsh-plan-sha256'] !== expectedPlanSha256
  )
    throw new Error('Azure pending mutation belongs to another owner or immutable plan');
}

async function assertTargetOwnership(
  plan: AzureCePlan,
  action: AzureCeAction,
  value: Json,
  api: AzExecApi,
  signal?: AbortSignal,
): Promise<void> {
  const expectedOwner = action.expectedOwnerPlanSha256 ?? plan.planSha256;
  const parentId = ownershipParent(action.resourceId ?? '');
  if (!parentId) {
    assertOwner(plan, value, expectedOwner);
    return;
  }
  const parent = await readResource(plan, parentId, api, signal);
  if (!parent) throw new Error('Azure pending mutation ownership parent is absent');
  assertOwner(plan, parent, expectedOwner);
}

function sameStrings(actual: unknown, expected: string[]): boolean {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => lower(value) === expected[index].toLowerCase())
  );
}

function requirePostcondition(condition: boolean, kind: AzureCeAction['kind']): true {
  if (!condition) throw new Error(`Azure pending ${kind} postcondition differs from the immutable request`);
  return true;
}

function routeMatches(route: Json, action: AzureCeAction): boolean {
  const args = action.args ?? [];
  const properties = (
    route.properties && typeof route.properties === 'object' && !Array.isArray(route.properties)
      ? route.properties
      : route
  ) as Json;
  return (
    properties.addressPrefix === option(args, '--address-prefix') &&
    lower(properties.nextHopType) === lower(option(args, '--next-hop-type')) &&
    lower(properties.nextHopIpAddress ?? '') === lower(option(args, '--next-hop-ip-address') ?? '')
  );
}

function childPostcondition(action: AzureCeAction, value: Json): boolean {
  const args = action.args ?? [];
  const properties = object(value.properties ?? {}, 'Azure pending mutation properties are malformed');
  if (action.kind === 'subnet-create') {
    const expected = options(args, '--address-prefixes');
    const actual = Array.isArray(properties.addressPrefixes) ? properties.addressPrefixes : [properties.addressPrefix];
    return requirePostcondition(sameStrings(actual, expected), action.kind);
  }
  if (action.kind === 'nsg-rule-create') {
    return requirePostcondition(
      Number(properties.priority) === Number(option(args, '--priority')) &&
        lower(properties.direction) === lower(option(args, '--direction')) &&
        lower(properties.protocol) === lower(option(args, '--protocol')) &&
        lower(properties.access) === lower(option(args, '--access')) &&
        sameStrings(properties.sourceAddressPrefixes, options(args, '--source-address-prefixes')) &&
        sameStrings(properties.destinationAddressPrefixes, options(args, '--destination-address-prefixes')) &&
        sameStrings(properties.destinationPortRanges, options(args, '--destination-port-ranges')),
      action.kind,
    );
  }
  if (action.kind === 'route-server-peer-create') {
    return requirePostcondition(
      lower(properties.peerIp) === lower(option(args, '--peer-ip')) &&
        Number(properties.peerAsn) === Number(option(args, '--peer-asn')),
      action.kind,
    );
  }
  if (action.kind === 'route-create') return requirePostcondition(routeMatches(value, action), action.kind);
  return true;
}

function brownfieldPostcondition(action: AzureCeAction, value: Json): boolean {
  const args = action.args ?? [];
  if (args.slice(0, 4).join(' ') === 'network route-table route create') {
    const routes = nested(value, ['properties', 'routes']);
    const selected = Array.isArray(routes)
      ? routes.filter(
          (candidate) =>
            candidate &&
            typeof candidate === 'object' &&
            !Array.isArray(candidate) &&
            String((candidate as Json).name) === option(args, '--name'),
        )
      : [];
    return selected.length === 1 && routeMatches(selected[0] as Json, action);
  }
  if (args.slice(0, 4).join(' ') === 'network route-table route delete') {
    const routes = nested(value, ['properties', 'routes']);
    return (
      Array.isArray(routes) &&
      !routes.some(
        (candidate) =>
          candidate &&
          typeof candidate === 'object' &&
          !Array.isArray(candidate) &&
          String((candidate as Json).name) === option(args, '--name'),
      )
    );
  }
  if (args.slice(0, 4).join(' ') === 'network vnet subnet update') {
    const actual = lower(nested(value, ['properties', 'routeTable', 'id']));
    const expected = lower(option(args, '--route-table'));
    return args.includes('--remove') ? !actual : Boolean(expected) && actual === expected;
  }
  throw new Error('Azure brownfield recovery request is unsupported');
}

function resourcePostcondition(plan: AzureCePlan, action: AzureCeAction, value: Json): boolean {
  const args = action.args ?? [];
  const provisioning = nested(value, ['properties', 'provisioningState']) ?? value.provisioningState;
  if (typeof provisioning === 'string' && provisioning !== 'Succeeded') return false;
  switch (action.kind) {
    case 'resource-group-create':
      return requirePostcondition(lower(value.location) === plan.region.toLowerCase(), action.kind);
    case 'vnet-create':
      return requirePostcondition(
        sameStrings(
          nested(value, ['properties', 'addressSpace', 'addressPrefixes']),
          options(args, '--address-prefixes'),
        ),
        action.kind,
      );
    case 'public-ip-create':
      return requirePostcondition(
        lower(nested(value, ['sku', 'name'])) === lower(option(args, '--sku')) &&
          lower(nested(value, ['properties', 'publicIPAllocationMethod'])) ===
            lower(option(args, '--allocation-method')),
        action.kind,
      );
    case 'nic-create': {
      const ipConfigurations = nested(value, ['properties', 'ipConfigurations']);
      const configurations = Array.isArray(ipConfigurations) ? ipConfigurations : [];
      const expectedSubnet = option(args, '--subnet');
      const groupScope = action.resourceId?.slice(
        0,
        action.resourceId.toLowerCase().indexOf('/providers/microsoft.network/'),
      );
      const subnetId = expectedSubnet?.startsWith('/')
        ? expectedSubnet
        : `${groupScope}/providers/Microsoft.Network/virtualNetworks/${option(args, '--vnet-name')}/subnets/${expectedSubnet}`;
      const publicIp = option(args, '--public-ip-address');
      const publicIpId = publicIp
        ? `${groupScope}/providers/Microsoft.Network/publicIPAddresses/${publicIp}`
        : undefined;
      const nsg = option(args, '--network-security-group');
      const nsgId = nsg ? `${groupScope}/providers/Microsoft.Network/networkSecurityGroups/${nsg}` : undefined;
      return requirePostcondition(
        configurations.length === 1 &&
          lower(nested(configurations[0], ['properties', 'subnet', 'id'])) === lower(subnetId) &&
          lower(nested(configurations[0], ['properties', 'publicIPAddress', 'id'])) === lower(publicIpId) &&
          lower(nested(value, ['properties', 'networkSecurityGroup', 'id'])) === lower(nsgId),
        action.kind,
      );
    }
    case 'vm-create': {
      const expectedNics = options(args, '--nics').map(
        (name) =>
          `${action.resourceId?.slice(0, action.resourceId.toLowerCase().indexOf('/providers/microsoft.compute/'))}` +
          `/providers/Microsoft.Network/networkInterfaces/${name}`,
      );
      const actualNics =
        nested(value, ['networkProfile', 'networkInterfaces']) ??
        nested(value, ['properties', 'networkProfile', 'networkInterfaces']);
      const image =
        nested(value, ['storageProfile', 'imageReference']) ??
        nested(value, ['properties', 'storageProfile', 'imageReference']);
      const marketplacePlan = value.plan ?? nested(value, ['properties', 'plan']);
      return requirePostcondition(
        lower(
          nested(value, ['hardwareProfile', 'vmSize']) ?? nested(value, ['properties', 'hardwareProfile', 'vmSize']),
        ) === lower(option(args, '--size')) &&
          Array.isArray(actualNics) &&
          sameStrings(
            actualNics.map((row) => nested(row, ['id'])),
            expectedNics,
          ) &&
          lower(nested(image, ['publisher'])) === lower(option(args, '--plan-publisher')) &&
          lower(nested(image, ['offer'])) === lower(option(args, '--plan-product')) &&
          lower(nested(image, ['sku'])) === lower(option(args, '--plan-name')) &&
          lower(nested(image, ['version'])) === lower(plan.image.version) &&
          lower(nested(marketplacePlan, ['publisher'])) === lower(option(args, '--plan-publisher')) &&
          lower(nested(marketplacePlan, ['product'])) === lower(option(args, '--plan-product')) &&
          lower(nested(marketplacePlan, ['name'])) === lower(option(args, '--plan-name')),
        action.kind,
      );
    }
    case 'route-server-create': {
      const configurations = nested(value, ['properties', 'ipConfigurations']);
      const rows = Array.isArray(configurations) ? configurations : [];
      const hostedSubnet = option(args, '--hosted-subnet');
      const groupScope = action.resourceId?.slice(
        0,
        action.resourceId.toLowerCase().indexOf('/providers/microsoft.network/'),
      );
      const publicIp = `${groupScope}/providers/Microsoft.Network/publicIPAddresses/${option(args, '--public-ip-address')}`;
      return requirePostcondition(
        rows.some(
          (row) =>
            lower(nested(row, ['properties', 'subnet', 'id'])) === lower(hostedSubnet) &&
            lower(nested(row, ['properties', 'publicIPAddress', 'id'])) === lower(publicIp),
        ),
        action.kind,
      );
    }
    case 'nic-update':
      return requirePostcondition(
        lower(nested(value, ['properties', 'ipConfigurations', '0', 'properties', 'subnet', 'id'])) ===
          lower(option(args, '--subnet')),
        action.kind,
      );
    case 'route-association-update':
      return requirePostcondition(
        lower(nested(value, ['properties', 'routeTable', 'id'])) === lower(option(args, '--route-table')),
        action.kind,
      );
    case 'brownfield-restore':
      return brownfieldPostcondition(action, value);
    default:
      return childPostcondition(action, value);
  }
}

/** Observe the exact postcondition of a durable native Azure mutation before any replay. */
export async function azureNativePendingActionConverged(
  plan: AzureCePlan,
  action: AzureCeAction,
  api: AzExecApi,
  signal?: AbortSignal,
): Promise<boolean> {
  assertRecoverableAction(action);
  const value = await readResource(
    plan,
    action.resourceId as string,
    api,
    signal,
    ['vm-create', 'vm-start', 'vm-stop', 'vm-deallocate', 'vm-resize', 'vm-delete'].includes(action.kind),
  );
  if (action.kind === 'vm-delete') return value === undefined;
  if (!value) return false;
  if (
    ['route-association-update', 'brownfield-restore'].includes(action.kind) ||
    (action.kind === 'route-create' && plan.intent.brownfield.routeChanges.length > 0)
  ) {
    return resourcePostcondition(plan, action, value);
  }
  await assertTargetOwnership(plan, action, value, api, signal);
  if (action.kind === 'vm-start' || action.kind === 'vm-stop' || action.kind === 'vm-deallocate') {
    const expected = action.kind === 'vm-start' ? 'running' : 'deallocated';
    return lower(value.powerState).replace(/^vm\s+/, '') === expected;
  }
  if (action.kind === 'vm-resize') {
    return (
      lower(
        nested(value, ['hardwareProfile', 'vmSize']) ?? nested(value, ['properties', 'hardwareProfile', 'vmSize']),
      ) === lower(option(action.args ?? [], '--size'))
    );
  }
  return resourcePostcondition(plan, action, value);
}
