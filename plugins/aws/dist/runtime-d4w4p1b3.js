// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

// plugins/aws/src/tools/aws-ce-power.ts
import { randomUUID } from 'node:crypto';
import { siteBindings, staticAzRoutes } from './runtime-9wx65fpp.js';
import { makeExecApi } from './runtime-30f0rzjf.js';
import {
  buildAwsWholeSitePowerPlan,
  collectAwsPowerBgpServices,
  collectAwsPowerNlbServices,
  dispatchAwsNativeBgpPower,
  dispatchAwsTerraformBgpPower,
  evidencePasses,
  powerServiceComponentSha256,
  reconcileAwsNativeBgpPower,
  reconcileAwsTerraformBgpPower,
  retireAwsNativeBgpPowerPolicy,
  retireAwsTerraformBgpPowerPolicy,
  reviseAwsTerraformDirectServiceRoutes,
  reviseAwsTerraformNlbMembership,
  reviseAwsTerraformPowerConfiguration,
  reviseAwsTerraformStaticServiceRoutes,
  runAwsWholeSitePower,
  validateAwsTerraformDirectServiceReceipt,
  validateAwsTerraformNlbMembershipReceipt,
  validateAwsTerraformPowerReceipt,
  validateAwsTerraformStaticServiceReceipt,
  validatePowerServiceInventory,
  verifyAwsWholeSitePowerPlan,
} from './runtime-9341kvfb.js';
import { readAwsTerraformInstanceBindings, readAwsTerraformWorkflowStatus } from './runtime-b20mprzb.js';
import { awsPlatformService } from './runtime-dwcehj38.js';
import { scopedAwsApi } from './runtime-fex55vat.js';
import {
  assertAwsTerraformDeploymentActive,
  awsTerraformFoundationDeployment,
  awsTerraformService,
  bindTerraformIngress,
  bindTerraformStaticRouting,
  discoverAwsTerraformInterfaces,
  loadAwsTerraformBrownfieldBinding,
  readAwsTrafficProbeEvidence,
  withAwsTerraformLifecycle,
} from './runtime-qqrc1c7h.js';
import { acquireProcessLock, loadAwsCheckpoint, loadAwsPlan, verifyAwsCePlan } from './runtime-wf8fjv0g.js';
import { canonicalSha256 } from './runtime-wvre8ba5.js';

// plugins/aws/src/ce/whole-site-power-identities.ts
var object = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed power identity evidence');
  return value;
};
var array = (value) => {
  if (!Array.isArray(value)) throw new Error('Missing power identity collection');
  return value.map(object);
};
function tags(value, expected) {
  const rows = array(value);
  const seen = new Set();
  for (const row of rows) {
    if (typeof row.Key !== 'string' || typeof row.Value !== 'string' || seen.has(row.Key))
      throw new Error('Duplicate or malformed power ownership tags');
    seen.add(row.Key);
  }
  if (Object.entries(expected).some(([key, value]) => !rows.some((r) => r.Key === key && r.Value === value)))
    throw new Error('Whole-site power cloud ownership differs');
}
async function collectAwsPowerIdentities(base, resolved, rawApi, runtime, signal) {
  verifyAwsCePlan(base);
  if (base.intent.operation !== 'deploy') throw new Error('Power identities require the original deployment plan');
  const selections = siteBindings(base);
  const expected = selections.flatMap(({ site, binding }) =>
    site.nodeIndexes.map((nodeIndex, offset) => ({ nodeIndex, nodeName: binding.nodes[offset], siteName: site.name })),
  );
  const instanceIds = expected.map((node) => resolved[`__INSTANCE_${node.nodeIndex}__`]);
  const interfaceIds = expected.flatMap((node) =>
    base.interfaces.map((item) => resolved[`__ENI_${node.nodeIndex}_${item.index}__`]),
  );
  const macs = expected.flatMap((node) =>
    base.interfaces.map((item) => resolved[`__ENI_${node.nodeIndex}_${item.index}_MAC__`]?.toLowerCase()),
  );
  if (
    instanceIds.some((id) => !/^i-[a-f0-9]{8,17}$/.test(id ?? '')) ||
    interfaceIds.some((id) => !/^eni-[a-f0-9]{8,17}$/.test(id ?? '')) ||
    macs.some((mac) => !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(mac ?? '')) ||
    new Set(instanceIds).size !== expected.length ||
    new Set(interfaceIds).size !== interfaceIds.length ||
    new Set(macs).size !== macs.length
  )
    throw new Error('Power execution identifiers are unresolved or duplicated');
  const api = scopedAwsApi(rawApi, base.intent.awsProfile ?? 'default', signal);
  const read = async (args) => {
    const result = await api.exec('aws', [...args, '--region', base.region, '--output', 'json']);
    if (result.exitCode !== 0) throw new Error('Power identity observation unavailable');
    const value = object(JSON.parse(result.stdout));
    if (['NextToken', 'NextMarker', 'nextToken'].some((key) => value[key] !== undefined))
      throw new Error('Partial power identity response');
    return value;
  };
  if ((await read(['sts', 'get-caller-identity'])).Account !== base.accountId)
    throw new Error('Power authenticated account differs');
  const reservations = array(
    (await read(['ec2', 'describe-instances', '--instance-ids', ...instanceIds])).Reservations,
  );
  if (reservations.some((row) => row.OwnerId !== base.accountId)) throw new Error('Power reservation owner differs');
  const instances = reservations.flatMap((row) => array(row.Instances));
  const enis = array(
    (await read(['ec2', 'describe-network-interfaces', '--network-interface-ids', ...interfaceIds])).NetworkInterfaces,
  );
  if (instances.length !== expected.length || enis.length !== interfaceIds.length)
    throw new Error('Power cloud resource discovery is incomplete');
  const nodes = [];
  const states = [];
  for (const node of expected) {
    const instanceId = resolved[`__INSTANCE_${node.nodeIndex}__`];
    const matches = instances.filter((row) => row.InstanceId === instanceId);
    if (matches.length !== 1) throw new Error('Duplicate or missing power instance');
    const instance = matches[0];
    const ownerTags = {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-execution-engine': base.engine,
      'xcsh-deployment-id': base.deploymentName,
      'xcsh-plan-sha256': base.planSha256,
      'xcsh-node-index': String(node.nodeIndex),
      'ves-io-site-name': node.siteName,
    };
    tags(instance.Tags, ownerTags);
    const state = object(instance.State).Name;
    if (!['running', 'stopped', 'pending', 'stopping'].includes(String(state)))
      throw new Error('Power instance lifecycle state is unavailable');
    states.push(String(state));
    const attached = array(instance.NetworkInterfaces);
    if (attached.length !== base.interfaces.length) throw new Error('Power instance interface count differs');
    const interfaces = base.interfaces.map((item) => {
      const id = resolved[`__ENI_${node.nodeIndex}_${item.index}__`];
      const mac = resolved[`__ENI_${node.nodeIndex}_${item.index}_MAC__`].toLowerCase();
      const rows = enis.filter((row) => row.NetworkInterfaceId === id);
      const attachments = attached.filter((row) => row.NetworkInterfaceId === id);
      if (rows.length !== 1 || attachments.length !== 1) throw new Error('Power ENI identity is duplicated or missing');
      const eni = rows[0],
        attachment = object(eni.Attachment),
        embedded = attachments[0];
      tags(eni.TagSet, { ...ownerTags, 'xcsh-interface-index': String(item.index) });
      if (
        eni.OwnerId !== base.accountId ||
        eni.Status !== 'in-use' ||
        attachment.InstanceId !== instanceId ||
        attachment.DeviceIndex !== item.index ||
        object(embedded.Attachment).DeviceIndex !== item.index ||
        String(eni.MacAddress).toLowerCase() !== mac ||
        String(embedded.MacAddress).toLowerCase() !== mac
      )
        throw new Error('Power ENI ownership, attachment or MAC differs');
      if (!['slo', 'sli', 'data'].includes(item.role))
        throw new Error('Power interface role has no registration mapping');
      return { index: item.index, role: item.role, id, mac, device: '' };
    });
    nodes.push({ ...node, instanceId, interfaces });
  }
  for (const { binding } of selections) {
    const selected = nodes.filter((node) => node.siteName === binding.siteName);
    const expectedInterfaces = selected.flatMap((node) =>
      node.interfaces.map((item) => ({
        node: node.nodeName,
        role: item.role,
        mac: item.mac,
      })),
    );
    const evidence = await runtime.observeRegisteredDevices(
      binding,
      Object.fromEntries(selected.map((node) => [node.nodeName, node.instanceId])),
      expectedInterfaces,
      signal,
    );
    if (evidence.status !== 'observed' || evidence.interfaces.length !== expectedInterfaces.length)
      throw new Error('Power registration hardware identity unavailable');
    const devices = new Set();
    for (const node of selected)
      for (const item of node.interfaces) {
        const matches = evidence.interfaces.filter(
          (row) => row.node === node.nodeName && row.role === item.role && row.mac.toLowerCase() === item.mac,
        );
        const device = matches[0]?.device;
        const desired = base.interfaces.find((row) => row.index === item.index)?.guestDevice;
        if (
          matches.length !== 1 ||
          !device ||
          !/^[a-zA-Z0-9_.:-]+$/.test(device) ||
          devices.has(`${node.nodeName}/${device}`) ||
          (desired !== undefined && device !== desired)
        )
          throw new Error('Power registration device identity differs');
        devices.add(`${node.nodeName}/${device}`);
        item.device = device;
      }
  }
  return {
    sourcePlanSha256: base.planSha256,
    owner: {
      deploymentId: base.deploymentName,
      engine: base.engine,
      provider: 'aws',
      account: base.accountId,
      region: base.region,
    },
    nodes,
    cloud: states.every((s) => s === 'running')
      ? 'running'
      : states.every((s) => s === 'stopped')
        ? 'stopped'
        : 'unknown',
    source: 'aws-cli-and-registration-hardware',
    observedAt: new Date().toISOString(),
    originalCeHeartbeat: 'unknown',
    canSatisfyInterfaceMutationGate: false,
  };
}

// plugins/aws/src/ce/whole-site-power-routes.ts
import { isIP } from 'node:net';

function object2(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed direct route evidence');
  return value;
}
function rows(value) {
  if (!Array.isArray(value)) throw Error('Incomplete direct route evidence');
  return value.map(object2);
}
function network(cidr) {
  const parts = cidr.split('/'),
    bits = Number(parts[1]);
  if (parts.length !== 2 || isIP(parts[0]) !== 4 || !/^\d{1,2}$/.test(parts[1]) || bits < 0 || bits > 32)
    throw Error('Malformed direct service route prefix');
  const start = parts[0].split('.').reduce((value, octet) => value * 256 + Number(octet), 0),
    size = 2 ** (32 - bits);
  if (start % size) throw Error('Unaligned direct service route prefix');
  return { start, end: start + size - 1 };
}
function overlaps(left, right) {
  const a = network(left),
    b = network(right);
  return a.start <= b.end && b.start <= a.end;
}
async function collectAwsPowerDirectRoutes(base, values, raw, signal) {
  verifyAwsCePlan(base);
  if (
    base.intent.routing.profile !== 'direct-eni' ||
    base.topology.nodeCount !== 1 ||
    !base.intent.routes.length ||
    base.interfaces.length !== 2 ||
    base.interfaces[0].role !== 'slo' ||
    base.interfaces[1].role !== 'sli'
  )
    throw Error('Exact single-site dual-interface direct routes required');
  const { __INSTANCE_1__: instance, __ENI_1_0__: slo, __ENI_1_1__: sli } = values;
  if (
    !/^i-[a-f0-9]{8,17}$/.test(instance ?? '') ||
    ![slo, sli].every((v) => /^eni-[a-f0-9]{8,17}$/.test(v ?? '')) ||
    slo === sli
  )
    throw Error('Direct route runtime identities unresolved');
  const routes = base.intent.routes
    .map((route) => {
      const parts = route.destinationCidr.split('/');
      const prefix = Number(parts[1]);
      if (
        !/^rtb-[a-f0-9]{8,17}$/.test(route.routeTableId) ||
        !base.intent.brownfield.routeTableIds.includes(route.routeTableId) ||
        route.node !== 1 ||
        parts.length !== 2 ||
        isIP(parts[0]) !== 4 ||
        !Number.isInteger(prefix) ||
        prefix < 1 ||
        prefix > 32
      )
        throw Error('Direct service route ownership or destination differs');
      network(route.destinationCidr);
      return { routeTableId: route.routeTableId, destinationCidr: route.destinationCidr, networkInterfaceId: sli };
    })
    .sort((a, b) => a.routeTableId.localeCompare(b.routeTableId) || a.destinationCidr.localeCompare(b.destinationCidr));
  if (new Set(routes.map((r) => `${r.routeTableId}/${r.destinationCidr}`)).size !== routes.length)
    throw Error('Duplicate direct service route');
  const api = scopedAwsApi(raw, base.intent.awsProfile ?? 'default', signal);
  const read = async (args) => {
    const result = await api.exec('aws', [...args, '--region', base.region, '--output', 'json']);
    if (result.exitCode) throw Error('Direct route service unavailable');
    const data = object2(JSON.parse(result.stdout));
    if (['NextToken', 'nextToken', 'NextMarker', 'Marker'].some((k) => Object.hasOwn(data, k)))
      throw Error('Partial direct route evidence');
    return data;
  };
  if ((await read(['sts', 'get-caller-identity'])).Account !== base.accountId)
    throw Error('Direct route account differs');
  const enis = rows(
    (await read(['ec2', 'describe-network-interfaces', '--network-interface-ids', slo])).NetworkInterfaces,
  );
  if (
    enis.length !== 1 ||
    enis[0].NetworkInterfaceId !== slo ||
    enis[0].OwnerId !== base.accountId ||
    !/^subnet-[a-f0-9]{8,17}$/.test(String(enis[0].SubnetId)) ||
    object2(enis[0].Attachment).InstanceId !== instance ||
    object2(enis[0].Attachment).DeviceIndex !== 0
  )
    throw Error('Direct route SLO identity differs');
  const ids = [...new Set(routes.map((r) => r.routeTableId))];
  const tables = rows((await read(['ec2', 'describe-route-tables', '--route-table-ids', ...ids])).RouteTables);
  if (
    tables.length !== ids.length ||
    new Set(tables.map((t) => t.RouteTableId)).size !== ids.length ||
    tables.some((t) => !ids.includes(String(t.RouteTableId)))
  )
    throw Error('Direct route table cardinality differs');
  const bindings = [];
  const statuses = [];
  const memberships = [];
  for (const table of tables) {
    if (table.OwnerId !== base.accountId || !/^vpc-[a-f0-9]{8,17}$/.test(String(table.VpcId)))
      throw Error('Direct route table ownership differs');
    const associations = rows(table.Associations);
    if (
      !associations.length ||
      associations.some(
        (a) =>
          a.Main === true ||
          a.SubnetId === enis[0].SubnetId ||
          !/^subnet-[a-f0-9]{8,17}$/.test(String(a.SubnetId)) ||
          object2(a.AssociationState).State !== 'associated',
      ) ||
      new Set(associations.map((a) => a.SubnetId)).size !== associations.length
    )
      throw Error('Direct service route overlaps SLO or ambiguous association');
    const all = rows(table.Routes);
    const destinations = all.map(
      (r) => r.DestinationCidrBlock ?? r.DestinationIpv6CidrBlock ?? r.DestinationPrefixListId,
    );
    if (destinations.some((d) => typeof d !== 'string') || new Set(destinations).size !== all.length)
      throw Error('Duplicate or malformed route inventory');
    for (const route of routes.filter((r) => r.routeTableId === table.RouteTableId)) {
      const matches = all.filter((r) => r.DestinationCidrBlock === route.destinationCidr);
      const overlapping = all.filter(
        (row) =>
          typeof row.DestinationCidrBlock === 'string' &&
          row.DestinationCidrBlock !== route.destinationCidr &&
          overlaps(row.DestinationCidrBlock, route.destinationCidr),
      );
      if (!matches.length) {
        memberships.push({
          routeTableId: route.routeTableId,
          destinationCidr: route.destinationCidr,
          status: overlapping.length ? 'pending' : 'withdrawn',
        });
        statuses.push(overlapping.length ? 'pending' : 'withdrawn');
        continue;
      }
      const actual = matches[0];
      if (
        actual.NetworkInterfaceId !== sli ||
        actual.Origin !== 'CreateRoute' ||
        [
          'GatewayId',
          'NatGatewayId',
          'TransitGatewayId',
          'VpcPeeringConnectionId',
          'EgressOnlyInternetGatewayId',
          'CarrierGatewayId',
          'LocalGatewayId',
          'CoreNetworkArn',
        ].some((k) => Object.hasOwn(actual, k)) ||
        !['active', 'blackhole'].includes(String(actual.State))
      )
        throw Error('Foreign direct service route target');
      memberships.push({
        routeTableId: route.routeTableId,
        destinationCidr: route.destinationCidr,
        status: actual.State === 'active' ? 'active' : 'pending',
      });
      statuses.push(actual.State === 'active' ? 'active' : 'pending');
    }
    bindings.push({
      routeTableId: table.RouteTableId,
      vpcId: table.VpcId,
      subnets: associations.map((a) => a.SubnetId).sort(),
    });
  }
  const services = {
    schemaVersion: 1,
    kind: 'aws-ce-direct-route-power-services',
    sourcePlanSha256: base.planSha256,
    engine: base.engine,
    accountId: base.accountId,
    region: base.region,
    instanceId: instance,
    sloNetworkInterfaceId: slo,
    sloSubnetId: enis[0].SubnetId,
    routes,
    tables: bindings.sort((a, b) => String(a.routeTableId).localeCompare(String(b.routeTableId))),
  };
  return {
    services,
    servicesSha256: canonicalSha256(services),
    memberships,
    status: statuses.every((s) => s === 'active')
      ? 'active'
      : statuses.every((s) => s === 'withdrawn')
        ? 'withdrawn'
        : 'pending',
    traffic: 'unknown',
    collectedAt: new Date().toISOString(),
  };
}

// plugins/aws/src/ce/whole-site-power-tgw.ts
import { isIP as isIP2 } from 'node:net';

function object3(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed static TGW evidence');
  return value;
}
function rows2(value) {
  if (!Array.isArray(value)) throw Error('Incomplete static TGW evidence');
  return value.map(object3);
}
function exactly(value) {
  const items = rows2(value);
  if (items.length !== 1) throw Error('Static TGW evidence cardinality differs');
  return items[0];
}
function network2(cidr) {
  const parts = cidr.split('/'),
    bits = Number(parts[1]);
  if (parts.length !== 2 || isIP2(parts[0]) !== 4 || !/^\d{1,2}$/.test(parts[1]) || bits < 0 || bits > 32)
    throw Error('Malformed static TGW route prefix');
  const start = parts[0].split('.').reduce((value, octet) => value * 256 + Number(octet), 0),
    size = 2 ** (32 - bits);
  if (start % size) throw Error('Unaligned static TGW route prefix');
  return { start, end: start + size - 1 };
}
async function collectAwsPowerStaticTgwRoutes(base, values, raw, signal) {
  verifyAwsCePlan(base);
  const intent = base.intent,
    routing = intent.routing,
    appliances = staticAzRoutes(intent);
  const gateway = routing.transitGatewayId ?? '',
    table = routing.transitGatewayRouteTableId ?? '',
    attachment = values.__TGW_TRANSPORT_ATTACHMENT__,
    vpc = values.__VPC_ID__ ?? intent.vpc.vpcId;
  if (
    routing.profile !== 'tgw-static' ||
    !appliances.length ||
    intent.routes.length ||
    routing.transportAttachmentId ||
    !/^tgw-[a-f0-9]{8,17}$/.test(gateway ?? '') ||
    !/^tgw-rtb-[a-f0-9]{8,17}$/.test(table ?? '') ||
    !/^tgw-attach-[a-f0-9]{8,17}$/.test(attachment ?? '') ||
    !/^vpc-[a-f0-9]{8,17}$/.test(vpc ?? '') ||
    !intent.brownfield.resourceIds.includes(gateway) ||
    !intent.brownfield.transitGatewayRouteTableIds.includes(table) ||
    !routing.destinationCidrs.length ||
    new Set(routing.destinationCidrs).size !== routing.destinationCidrs.length ||
    canonicalSha256(routing.associations) !== canonicalSha256([table]) ||
    routing.propagations.length
  )
    throw Error('Static TGW service scope unresolved or ambiguous');
  const api = scopedAwsApi(raw, intent.awsProfile ?? 'default', signal);
  const read = async (args) => {
    const result = await api.exec('aws', [...args, '--region', base.region, '--output', 'json']);
    if (result.exitCode) throw Error('Static TGW service unavailable');
    const data = object3(JSON.parse(result.stdout));
    if (['NextToken', 'nextToken', 'NextMarker', 'Marker'].some((k) => Object.hasOwn(data, k)))
      throw Error('Partial static TGW evidence');
    return data;
  };
  const ownership = (resource, node) => {
    const tags = rows2(resource.Tags);
    const expected = {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-deployment-id': base.deploymentName,
      'xcsh-execution-engine': base.engine,
      'xcsh-plan-sha256': base.planSha256,
      ...(node ? { 'xcsh-node-index': String(node) } : {}),
    };
    if (
      new Set(tags.map((t) => t.Key)).size !== tags.length ||
      tags.some((t) => typeof t.Key !== 'string' || typeof t.Value !== 'string') ||
      Object.entries(expected).some(([key, value]) => !tags.some((t) => t.Key === key && t.Value === value))
    )
      throw Error('Foreign static TGW resource ownership');
  };
  if ((await read(['sts', 'get-caller-identity'])).Account !== base.accountId)
    throw Error('Static TGW account differs');
  const transport = exactly(
    (await read(['ec2', 'describe-transit-gateway-vpc-attachments', '--transit-gateway-attachment-ids', attachment]))
      .TransitGatewayVpcAttachments,
  );
  ownership(transport);
  if (
    transport.TransitGatewayAttachmentId !== attachment ||
    transport.TransitGatewayId !== gateway ||
    transport.VpcId !== vpc ||
    transport.VpcOwnerId !== base.accountId ||
    transport.State !== 'available' ||
    object3(transport.Options).ApplianceModeSupport !== 'enable'
  )
    throw Error('Static TGW retained transport differs');
  const transportSubnets = transport.SubnetIds;
  if (
    !Array.isArray(transportSubnets) ||
    transportSubnets.length !== appliances.length ||
    new Set(transportSubnets).size !== transportSubnets.length
  )
    throw Error('Static TGW transport subnet identity incomplete');
  const routeTable = exactly(
    (await read(['ec2', 'describe-transit-gateway-route-tables', '--transit-gateway-route-table-ids', table]))
      .TransitGatewayRouteTables,
  );
  if (
    routeTable.TransitGatewayRouteTableId !== table ||
    routeTable.TransitGatewayId !== gateway ||
    routeTable.State !== 'available'
  )
    throw Error('Static TGW route table differs');
  const associations = rows2(
    (await read(['ec2', 'get-transit-gateway-route-table-associations', '--transit-gateway-route-table-id', table]))
      .Associations,
  ).filter((a) => a.TransitGatewayAttachmentId === attachment);
  if (associations.length !== 1 || associations[0].State !== 'associated')
    throw Error('Static TGW retained association differs');
  const propagations = rows2(
    (await read(['ec2', 'get-transit-gateway-route-table-propagations', '--transit-gateway-route-table-id', table]))
      .TransitGatewayRouteTablePropagations,
  ).filter((a) => a.TransitGatewayAttachmentId === attachment);
  if (propagations.some((a) => a.State !== 'disabled')) throw Error('Static TGW unexpected propagation');
  const applianceBindings = [];
  for (const appliance of appliances) {
    const rt = values[`__STATIC_ROUTE_TABLE_${appliance.node}__`],
      eni = values[`__ENI_${appliance.node}_1__`],
      instance = values[`__INSTANCE_${appliance.node}__`];
    if (
      !/^rtb-[a-f0-9]{8,17}$/.test(rt ?? '') ||
      !/^eni-[a-f0-9]{8,17}$/.test(eni ?? '') ||
      !/^i-[a-f0-9]{8,17}$/.test(instance ?? '')
    )
      throw Error('Static TGW appliance runtime identity unresolved');
    const nic = exactly(
      (await read(['ec2', 'describe-network-interfaces', '--network-interface-ids', eni])).NetworkInterfaces,
    );
    if (
      nic.NetworkInterfaceId !== eni ||
      nic.OwnerId !== base.accountId ||
      nic.VpcId !== vpc ||
      !transportSubnets.includes(nic.SubnetId) ||
      object3(nic.Attachment).InstanceId !== instance ||
      object3(nic.Attachment).DeviceIndex !== 1
    )
      throw Error('Static TGW SLI transport identity differs');
    const local = exactly((await read(['ec2', 'describe-route-tables', '--route-table-ids', rt])).RouteTables);
    ownership(local, appliance.node);
    const localAssociations = rows2(local.Associations);
    if (
      local.RouteTableId !== rt ||
      local.OwnerId !== base.accountId ||
      local.VpcId !== vpc ||
      localAssociations.length !== 1 ||
      localAssociations[0].SubnetId !== nic.SubnetId ||
      localAssociations[0].Main === true ||
      object3(localAssociations[0].AssociationState).State !== 'associated'
    )
      throw Error('Static TGW appliance table association differs');
    const localRoutes = rows2(local.Routes);
    const ids = localRoutes.map(
      (r) => r.DestinationCidrBlock ?? r.DestinationIpv6CidrBlock ?? r.DestinationPrefixListId,
    );
    if (ids.some((v) => typeof v !== 'string') || new Set(ids).size !== ids.length)
      throw Error('Static TGW appliance route inventory malformed');
    for (const [direction, prefixes] of [
      ['forward', appliance.forwardCidrs],
      ['return', appliance.returnCidrs],
    ])
      for (const destination of prefixes) {
        const match = localRoutes.filter((r) => r.DestinationCidrBlock === destination);
        const key = direction === 'forward' ? 'NetworkInterfaceId' : 'TransitGatewayId';
        if (
          match.length !== 1 ||
          match[0][key] !== (direction === 'forward' ? eni : gateway) ||
          match[0].State !== 'active' ||
          match[0].Origin !== 'CreateRoute' ||
          [
            'GatewayId',
            'NatGatewayId',
            'VpcPeeringConnectionId',
            direction === 'forward' ? 'TransitGatewayId' : 'NetworkInterfaceId',
          ].some((k) => Object.hasOwn(match[0], k))
        )
          throw Error('Static TGW appliance forward/return route differs');
      }
    applianceBindings.push({
      node: appliance.node,
      routeTableId: rt,
      networkInterfaceId: eni,
      instanceId: instance,
      subnetId: nic.SubnetId,
      availabilityZone: appliance.availabilityZone,
      forwardCidrs: appliance.forwardCidrs,
      returnCidrs: appliance.returnCidrs,
    });
  }
  if (
    new Set(applianceBindings.map((a) => a.routeTableId)).size !== appliances.length ||
    new Set(applianceBindings.map((a) => a.subnetId)).size !== appliances.length ||
    new Set(applianceBindings.map((a) => a.networkInterfaceId)).size !== appliances.length
  )
    throw Error('Static TGW appliance identity duplicated');
  const memberships = [];
  for (const destination of [...routing.destinationCidrs].sort()) {
    const expected = network2(destination),
      merged = new Map();
    for (const filter of ['exact-match', 'subnet-of-match', 'supernet-of-match']) {
      const result = await read([
        'ec2',
        'search-transit-gateway-routes',
        '--transit-gateway-route-table-id',
        table,
        '--filters',
        `Name=route-search.${filter},Values=${destination}`,
      ]);
      if (result.AdditionalRoutesAvailable !== false) throw Error('Partial static TGW route search');
      const seen = new Set();
      for (const route of rows2(result.Routes)) {
        const prefix = route.DestinationCidrBlock;
        if (typeof prefix !== 'string' || seen.has(prefix) || Object.hasOwn(route, 'PrefixListId'))
          throw Error('Malformed or duplicate static TGW route search');
        seen.add(prefix);
        const actual = network2(prefix);
        if (
          actual.start > expected.end ||
          expected.start > actual.end ||
          (filter === 'exact-match' && prefix !== destination)
        )
          throw Error('Unrelated static TGW route search');
        const target = exactly(route.TransitGatewayAttachments);
        if (
          route.Type !== 'static' ||
          target.TransitGatewayAttachmentId !== attachment ||
          !['active', 'blackhole'].includes(String(route.State))
        )
          throw Error('Foreign static TGW service route');
        const normalized = { destinationCidr: prefix, type: route.Type, state: route.State, attachmentId: attachment };
        const prior = merged.get(prefix);
        if (prior && canonicalSha256(prior) !== canonicalSha256(normalized))
          throw Error('Static TGW route changed during collection');
        merged.set(prefix, normalized);
      }
    }
    const matches = [...merged.values()];
    memberships.push({
      destinationCidr: destination,
      status:
        matches.length === 0
          ? 'withdrawn'
          : matches.length === 1 && matches[0].destinationCidr === destination && matches[0].state === 'active'
            ? 'active'
            : 'pending',
    });
  }
  const services = {
    schemaVersion: 1,
    kind: 'aws-ce-static-tgw-power-services',
    sourcePlanSha256: base.planSha256,
    engine: base.engine,
    accountId: base.accountId,
    region: base.region,
    transitGatewayId: gateway,
    routeTableId: table,
    transportAttachmentId: attachment,
    vpcId: vpc,
    transportSubnets: [...transportSubnets].sort(),
    appliances: applianceBindings,
    destinationCidrs: [...routing.destinationCidrs].sort(),
  };
  return {
    services,
    servicesSha256: canonicalSha256(services),
    memberships,
    status: memberships.every((m) => m.status === 'active')
      ? 'active'
      : memberships.every((m) => m.status === 'withdrawn')
        ? 'withdrawn'
        : 'pending',
    traffic: 'unknown',
    collectedAt: new Date().toISOString(),
  };
}

// plugins/aws/src/ce/whole-site-power-service-inventory.ts
async function collectAwsPowerServiceInventory(base, values, api, runtime, signal, retainedBgp) {
  verifyAwsCePlan(base);
  const components = [];
  let bgpBindings;
  const profile = base.intent.routing.profile;
  if (profile === 'tgw-connect') {
    const observation = await collectAwsPowerBgpServices(base, values, api, runtime, signal, retainedBgp);
    bgpBindings = observation.services.platform;
    components.push({
      kind: 'bgp',
      services: observation.services,
      servicesSha256: observation.servicesSha256,
      status: observation.status,
    });
  } else if (profile === 'tgw-static') {
    const observation = await collectAwsPowerStaticTgwRoutes(base, values, api, signal);
    components.push({
      kind: 'static-tgw',
      services: observation.services,
      servicesSha256: observation.servicesSha256,
      status: observation.status,
    });
  } else if (profile === 'direct-eni') {
    const observation = await collectAwsPowerDirectRoutes(base, values, api, signal);
    components.push({
      kind: 'direct',
      services: observation.services,
      servicesSha256: observation.servicesSha256,
      status: observation.status,
    });
  } else if (profile !== 'nlb-ingress') throw Error('Whole-site service routing profile lacks an owned observer');
  if (base.intent.ingress?.mode === 'nlb') {
    const observation = await collectAwsPowerNlbServices(base, values, api, signal);
    components.push({
      kind: 'nlb',
      services: observation.services,
      servicesSha256: observation.servicesSha256,
      status: observation.status,
    });
  }
  if (!components.length) throw Error('Whole-site services are missing');
  const services = {
    schemaVersion: 1,
    kind: 'aws-ce-whole-site-services',
    sourcePlanSha256: base.planSha256,
    engine: base.engine,
    components: components.map(({ kind, services, servicesSha256 }) => ({ kind, services, servicesSha256 })),
  };
  return {
    services,
    servicesSha256: canonicalSha256(services),
    components,
    bgpBindings,
    status: components.every((row) => row.status === 'active')
      ? 'active'
      : components.every((row) => row.status === 'withdrawn')
        ? 'withdrawn'
        : 'pending',
    freshness: 'unqualified',
    traffic: 'unknown',
    collectedAt: new Date().toISOString(),
  };
}

// plugins/aws/src/ce/whole-site-power-bindings.ts
async function collectAwsPowerBindings(base, values, api, runtime, signal, retainedBgp) {
  const before = await collectAwsPowerIdentities(base, values, api, runtime, signal);
  const inventory = await collectAwsPowerServiceInventory(base, values, api, runtime, signal, retainedBgp);
  const after = await collectAwsPowerIdentities(base, values, api, runtime, signal);
  if (
    canonicalSha256({ owner: before.owner, nodes: before.nodes }) !==
    canonicalSha256({ owner: after.owner, nodes: after.nodes })
  )
    throw Error('Whole-site identities changed during service collection');
  const bindings = {
    sourcePlanSha256: base.planSha256,
    owner: after.owner,
    nodes: after.nodes,
    servicesSha256: inventory.servicesSha256,
    servicesInventory: inventory.services,
  };
  validatePowerServiceInventory(base, bindings);
  return {
    bindings,
    bgpBindings: inventory.bgpBindings,
    components: inventory.components,
    cloud: after.cloud,
    status: inventory.status,
    freshness: 'unqualified',
    traffic: 'unknown',
    canSatisfyInterfaceMutationGate: false,
    collectedAt: new Date().toISOString(),
  };
}

// plugins/aws/src/ce/native-whole-site-power.ts
async function optional(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function context(base, plan, effect, storage) {
  verifyAwsWholeSitePowerPlan(base, plan);
  if (
    base.engine !== 'native' ||
    plan.operation !== effect ||
    canonicalSha256(storage.owner) !== canonicalSha256(plan.bindings.owner)
  )
    throw new Error('Native power owning engine or deployment store differs');
  if (
    base.topology.nodeCount !== 1 ||
    plan.bindings.nodes.length !== 1 ||
    siteBindings(base).length !== 1 ||
    siteBindings(base)[0].site.nodeIndexes.length !== 1
  )
    throw new Error('Native power requires a separately qualified multi-node lifecycle contract');
  await storage.verify();
  if (canonicalSha256(await storage.read(`${plan.planId}.json`)) !== canonicalSha256(plan))
    throw new Error('Native power saved immutable plan differs');
  const checkpoint = await storage.read(`${plan.planId}-checkpoint.json`);
  const attempt = checkpoint.pending;
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.planSha256 !== plan.planSha256 ||
    checkpoint.bindingsSha256 !== plan.bindingsSha256 ||
    checkpoint.step !== (effect === 'stop' ? 3 : 1) ||
    checkpoint.complete !== false ||
    !attempt ||
    attempt.effect !== effect ||
    attempt.requestSha256 !== canonicalSha256({ planSha256: plan.planSha256, effect }) ||
    !Number.isFinite(Date.parse(attempt.originalAttemptAt)) ||
    Date.parse(attempt.originalAttemptAt) > Date.now() ||
    canonicalSha256(attempt) !== canonicalSha256(checkpoint.attempts?.[effect])
  )
    throw new Error('Native power original attempt checkpoint differs');
  const marker = {
    schemaVersion: 1,
    engine: 'native',
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    instanceId: plan.bindings.nodes[0].instanceId,
    attempt,
  };
  return { marker, name: `${plan.planId}-${effect}-native-dispatch.json` };
}
async function identities(base, plan, api, runtime, signal) {
  const resolved = {};
  for (const node of plan.bindings.nodes) {
    resolved[`__INSTANCE_${node.nodeIndex}__`] = node.instanceId;
    for (const item of node.interfaces) {
      resolved[`__ENI_${node.nodeIndex}_${item.index}__`] = item.id;
      resolved[`__ENI_${node.nodeIndex}_${item.index}_MAC__`] = item.mac;
    }
  }
  const current = await collectAwsPowerIdentities(base, resolved, api, runtime, signal);
  if (
    canonicalSha256({ owner: current.owner, nodes: current.nodes }) !==
    canonicalSha256({ owner: plan.bindings.owner, nodes: plan.bindings.nodes })
  )
    throw new Error('Native power live ownership or interface identities changed');
  return current;
}
async function dispatchAwsNativePowerState(base, plan, authorizedPlanSha256, effect, storage, api, runtime, signal) {
  if (authorizedPlanSha256 !== plan.planSha256) throw new Error('Native power authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.native-power-dispatch-lock`);
  try {
    const { marker, name } = await context(base, plan, effect, storage);
    if ((await optional(storage, name)) !== undefined)
      throw new Error('Native power already submitted; reconcile original attempt');
    const current = await identities(base, plan, api, runtime, signal);
    if (current.cloud !== (effect === 'stop' ? 'running' : 'stopped'))
      throw new Error('Native power prerequisite cloud state is unavailable');
    signal?.throwIfAborted();
    await storage.write(name, marker);
    const result = await scopedAwsApi(api, base.intent.awsProfile ?? 'default', signal).exec('aws', [
      'ec2',
      effect === 'stop' ? 'stop-instances' : 'start-instances',
      '--instance-ids',
      marker.instanceId,
      '--region',
      base.region,
      '--output',
      'json',
    ]);
    if (result.exitCode !== 0) throw new Error('Native power provider submission failed; reconcile original attempt');
    let value;
    try {
      value = JSON.parse(result.stdout);
    } catch {
      throw new Error('Malformed native power acknowledgement');
    }
    const rows = value?.[effect === 'stop' ? 'StoppingInstances' : 'StartingInstances'];
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      rows[0]?.InstanceId !== marker.instanceId ||
      rows[0]?.PreviousState?.Name !== (effect === 'stop' ? 'running' : 'stopped') ||
      rows[0]?.CurrentState?.Name !== (effect === 'stop' ? 'stopping' : 'pending')
    )
      throw new Error('Malformed native power acknowledgement');
  } finally {
    await release();
  }
}
async function reconcileAwsNativePowerState(base, plan, effect, originalAttemptAt, storage, api, runtime, signal) {
  const release = await acquireProcessLock(`${storage.directory}/.native-power-dispatch-lock`);
  try {
    const { marker, name } = await context(base, plan, effect, storage);
    if (originalAttemptAt !== marker.attempt.originalAttemptAt)
      throw new Error('Native power original attempt differs');
    const saved = await optional(storage, name);
    if (saved === undefined) return 'not-submitted';
    if (canonicalSha256(saved) !== canonicalSha256(marker)) throw new Error('Native power dispatch marker differs');
    const current = await identities(base, plan, api, runtime, signal);
    if (current.cloud === (effect === 'stop' ? 'stopped' : 'running')) return 'completed';
    return 'pending';
  } finally {
    await release();
  }
}

// plugins/aws/src/ce/terraform-power-session.ts
async function openAwsTerraformPowerSession(base, storage, terraform, api, signal) {
  verifyAwsCePlan(base);
  const owner = storage.owner;
  if (
    base.engine !== 'terraform' ||
    owner.engine !== 'terraform' ||
    owner.provider !== 'aws' ||
    owner.deploymentId !== base.intent.deploymentName ||
    owner.account !== base.intent.accountId ||
    owner.region !== base.intent.region
  )
    throw Error('Terraform power runner owner differs');
  await storage.verify();
  signal?.throwIfAborted();
  const placement =
    base.intent.vpc.mode === 'brownfield'
      ? await loadAwsTerraformBrownfieldBinding(base, storage, api, signal)
      : undefined;
  return terraform.open(owner, await awsTerraformFoundationDeployment(base, {}, placement), 'current');
}

// plugins/aws/src/ce/terraform-power-controller.ts
async function optional2(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function context2(base, plan, effect, storage, requireFresh = false) {
  verifyAwsWholeSitePowerPlan(base, plan);
  if (
    base.engine !== 'terraform' ||
    plan.operation !== (effect === 'stop' ? 'stop' : 'start') ||
    canonicalSha256(storage.owner) !== canonicalSha256(plan.bindings.owner)
  )
    throw new Error('Terraform power owning engine or deployment store differs');
  if (
    base.topology.nodeCount !== 1 ||
    plan.bindings.nodes.length !== 1 ||
    siteBindings(base).length !== 1 ||
    siteBindings(base)[0].site.nodeIndexes.length !== 1
  )
    throw new Error('Terraform power requires a separately qualified multi-node lifecycle contract');
  await storage.verify();
  if (canonicalSha256(await storage.read(`${plan.planId}.json`)) !== canonicalSha256(plan))
    throw new Error('Terraform power saved immutable plan differs');
  const checkpoint = await storage.read(`${plan.planId}-checkpoint.json`);
  const attempt = checkpoint.pending;
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.planSha256 !== plan.planSha256 ||
    checkpoint.bindingsSha256 !== plan.bindingsSha256 ||
    checkpoint.step !== (effect === 'stop' ? 3 : effect === 'start' ? 1 : 5) ||
    checkpoint.complete !== false ||
    !attempt ||
    attempt.effect !== effect ||
    attempt.requestSha256 !== canonicalSha256({ planSha256: plan.planSha256, effect }) ||
    !Number.isFinite(Date.parse(attempt.originalAttemptAt)) ||
    Date.parse(attempt.originalAttemptAt) > Date.now() ||
    canonicalSha256(attempt) !== canonicalSha256(checkpoint.attempts?.[effect])
  )
    throw new Error('Terraform power original attempt checkpoint differs');
  if (effect === 'release') {
    const v = checkpoint.evidence?.restored;
    const age = v ? Date.now() - Date.parse(String(v.collectedAt)) : NaN;
    if (
      v?.source !== 'live' ||
      v.planSha256 !== plan.planSha256 ||
      v.bindingsSha256 !== plan.bindingsSha256 ||
      v.gate !== 'restored' ||
      v.identity !== 'verified' ||
      v.cloud !== 'running' ||
      v.services !== 'active' ||
      v.traffic !== 'passing' ||
      v.registration !== 'healthy' ||
      v.configuration !== 'verified' ||
      v.versions !== 'stable' ||
      v.interfaces !== 'up' ||
      v.canSatisfyInterfaceMutationGate !== true ||
      !Number.isFinite(age) ||
      age < 0 ||
      (requireFresh && age > 30000)
    )
      throw Error('Terraform release requires current restored operational gate');
  }
  const marker = {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    instanceId: plan.bindings.nodes[0].instanceId,
    attempt,
  };
  return { marker, name: `${plan.planId}-${effect}-terraform-dispatch.json` };
}
async function identities2(base, plan, api, runtime, signal) {
  const resolved = {};
  for (const node of plan.bindings.nodes) {
    resolved[`__INSTANCE_${node.nodeIndex}__`] = node.instanceId;
    for (const item of node.interfaces) {
      resolved[`__ENI_${node.nodeIndex}_${item.index}__`] = item.id;
      resolved[`__ENI_${node.nodeIndex}_${item.index}_MAC__`] = item.mac;
    }
  }
  const current = await collectAwsPowerIdentities(base, resolved, api, runtime, signal);
  if (
    canonicalSha256({ owner: current.owner, nodes: current.nodes }) !==
    canonicalSha256({ owner: plan.bindings.owner, nodes: plan.bindings.nodes })
  )
    throw new Error('Terraform power live ownership or interface identities changed');
  return current;
}
function verifyPreparation(plan, effect, marker, value) {
  const prep = value;
  if (!prep || canonicalSha256(prep.marker) !== canonicalSha256(marker) || !prep.revision)
    throw Error('Terraform power preparation differs');
  const revision = prep.revision;
  if (
    revision.effect !== effect ||
    revision.instanceId !== plan.bindings.nodes[0].instanceId ||
    revision.address !== `aws_ec2_instance_state.ce_power_${plan.bindings.nodes[0].nodeIndex}`
  )
    throw Error('Terraform power revision differs');
  return prep;
}
async function projection(session, receipt, address, signal) {
  return session.readProposedResourceFields(
    receipt,
    { [address]: ['instance_id', 'state', 'force'] },
    process.env,
    signal,
  );
}
async function dispatchAwsTerraformPowerState(
  base,
  plan,
  authorizedPlanSha256,
  effect,
  storage,
  terraform,
  api,
  runtime,
  signal,
) {
  if (authorizedPlanSha256 !== plan.planSha256) throw Error('Terraform power authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.terraform-power-dispatch-lock`);
  try {
    const { marker, name } = await context2(base, plan, effect, storage, true);
    const session = await openAwsTerraformPowerSession(base, storage, terraform, api, signal);
    const prepName = `${plan.planId}-${effect}-terraform-preparation.json`;
    const existing = await optional2(storage, prepName);
    let prep;
    if (existing) {
      prep = verifyPreparation(plan, effect, marker, existing);
    } else {
      if ((await optional2(storage, name)) !== undefined)
        throw Error('Terraform power dispatch lacks retained preparation');
      if (!session.readConfigurationSha256) throw Error('Terraform current configuration reader required');
      const before = await session.readConfigurationSha256();
      const source = await session.readConfiguration(before);
      const revision = reviseAwsTerraformPowerConfiguration(base, plan, source, effect);
      prep = { marker, revision };
      await storage.write(`${plan.planId}-${effect}-terraform-source.json`, { marker, configuration: source });
      await storage.write(prepName, prep);
    }
    const source = await storage.read(`${plan.planId}-${effect}-terraform-source.json`);
    if (
      canonicalSha256(source.marker) !== canonicalSha256(marker) ||
      canonicalSha256(reviseAwsTerraformPowerConfiguration(base, plan, source.configuration, effect)) !==
        canonicalSha256(prep.revision)
    )
      throw Error('Terraform power retained source or revision differs');
    if (prep.receipt && (await session.readPlanApplicationState(prep.receipt)) !== 'planned')
      throw Error('Terraform power already submitted; reconcile original attempt');
    const current = await identities2(base, plan, api, runtime, signal);
    if (current.cloud !== (effect === 'start' ? 'stopped' : 'running'))
      throw Error('Terraform power prerequisite cloud state unavailable');
    if (!session.readConfigurationSha256) throw Error('Terraform current configuration reader required');
    const currentHash = await session.readConfigurationSha256();
    if (currentHash === prep.revision.beforeSha256)
      await session.reviseConfiguration(currentHash, prep.revision.configuration);
    else if (currentHash !== prep.revision.afterSha256) throw Error('Terraform power current revision differs');
    if (!prep.receipt) {
      const receipt = await session.plan(process.env, signal);
      validateAwsTerraformPowerReceipt(
        base,
        plan,
        effect,
        prep.revision,
        receipt,
        await projection(session, receipt, prep.revision.address, signal),
      );
      prep = { ...prep, receipt };
      await storage.write(prepName, prep);
    }
    if (!prep.receipt) throw Error('Terraform power saved receipt missing');
    const priorFields = await session.readPlannedResourceFields(
      prep.receipt,
      { [prep.revision.address]: ['instance_id', 'state', 'force'] },
      process.env,
      signal,
    );
    const prior = priorFields[prep.revision.address];
    if (effect === 'release' && prior?.state !== 'running')
      throw Error('Terraform release prior control is not running');
    if (
      prep.revision.expectedActions[0] === 'create'
        ? prior !== null
        : !prior ||
          prior.instance_id !== prep.revision.instanceId ||
          prior.force !== false ||
          !['running', 'stopped'].includes(String(prior.state))
    )
      throw Error('Terraform prior power ownership differs');
    validateAwsTerraformPowerReceipt(
      base,
      plan,
      effect,
      prep.revision,
      prep.receipt,
      await projection(session, prep.receipt, prep.revision.address, signal),
    );
    if ((await session.readPlanApplicationState(prep.receipt)) !== 'planned')
      throw Error('Terraform power already submitted; reconcile original attempt');
    const priorMarker = await optional2(storage, name);
    if (
      priorMarker !== undefined &&
      canonicalSha256(priorMarker) !== canonicalSha256({ marker, receipt: prep.receipt })
    )
      throw Error('Terraform power dispatch marker differs');
    signal?.throwIfAborted();
    await storage.write(name, { marker, receipt: prep.receipt });
    await session.apply(prep.receipt, process.env, signal);
  } finally {
    await release();
  }
}
async function reconcileAwsTerraformPowerState(
  base,
  plan,
  effect,
  originalAttemptAt,
  storage,
  terraform,
  api,
  runtime,
  signal,
) {
  const release = await acquireProcessLock(`${storage.directory}/.terraform-power-dispatch-lock`);
  try {
    const { marker, name } = await context2(base, plan, effect, storage);
    if (originalAttemptAt !== marker.attempt.originalAttemptAt) throw Error('Terraform power original attempt differs');
    const value = await optional2(storage, `${plan.planId}-${effect}-terraform-preparation.json`);
    if (value === undefined) {
      if ((await optional2(storage, name)) !== undefined) throw Error('Terraform power preparation missing');
      return 'not-submitted';
    }
    const prep = verifyPreparation(plan, effect, marker, value);
    if (!prep.receipt) {
      if ((await optional2(storage, name)) !== undefined) throw Error('Terraform power receipt missing');
      return 'not-submitted';
    }
    const source = await storage.read(`${plan.planId}-${effect}-terraform-source.json`);
    if (
      canonicalSha256(source.marker) !== canonicalSha256(marker) ||
      canonicalSha256(reviseAwsTerraformPowerConfiguration(base, plan, source.configuration, effect)) !==
        canonicalSha256(prep.revision)
    )
      throw Error('Terraform power retained source or revision differs');
    const session = await openAwsTerraformPowerSession(base, storage, terraform, api, signal);
    if (effect === 'release') {
      const outcome = await optional2(storage, `${plan.planId}-${effect}-terraform-outcome.json`);
      if (outcome !== undefined) {
        const v = outcome;
        if (
          canonicalSha256(v.marker) !== canonicalSha256(marker) ||
          canonicalSha256(v.receipt) !== canonicalSha256(prep.receipt)
        )
          throw Error('Terraform release outcome differs');
        const dispatch = await storage.read(name);
        if (canonicalSha256(dispatch) !== canonicalSha256({ marker, receipt: prep.receipt }))
          throw Error('Terraform release dispatch marker differs');
        verifyAppliedIdentities(plan, prep.revision.address, v.fields, true);
        if ((await optional2(storage, `${plan.planId}-release-terraform-final-preparing.json`)) === undefined) {
          await session.reconcileApplyFromEvidence(prep.receipt, canonicalSha256(outcome));
        }
        return await finishRelease(base, plan, marker, prep, storage, session, api, runtime, signal);
      }
    }
    const journal = await session.readPlanApplicationState(prep.receipt);
    const saved = await optional2(storage, name);
    if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256({ marker, receipt: prep.receipt }))
      throw Error('Terraform power dispatch marker differs');
    if (journal === 'planned') return 'not-submitted';
    if (saved === undefined) throw Error('Terraform power submitted journal lacks dispatch marker');
    validateAwsTerraformPowerReceipt(
      base,
      plan,
      effect,
      prep.revision,
      prep.receipt,
      await projection(session, prep.receipt, prep.revision.address, signal),
    );
    const current = await identities2(base, plan, api, runtime, signal);
    const node = plan.bindings.nodes[0];
    const selections = {
      [prep.revision.address]: ['id', 'instance_id', 'state', 'force'],
      [`aws_instance.node_${node.nodeIndex}`]: ['id'],
    };
    for (const item of node.interfaces)
      selections[`aws_network_interface.node_${node.nodeIndex}_nic_${item.index}`] = ['id', 'mac_address'];
    const fields = await session.readAppliedResourceFields(prep.receipt, selections, process.env, signal);
    verifyAppliedIdentities(plan, prep.revision.address, fields, effect === 'release');
    const control = fields[prep.revision.address];
    if (effect === 'release') {
      if (control !== null) return 'pending';
      if (current.cloud !== 'running') return 'pending';
    } else if (
      !control ||
      control.state !== (effect === 'stop' ? 'stopped' : 'running') ||
      current.cloud !== (effect === 'stop' ? 'stopped' : 'running')
    )
      return 'pending';
    const evidence = {
      schemaVersion: 1,
      marker,
      receipt: prep.receipt,
      cloud: current,
      fields,
      collectedAt: new Date().toISOString(),
    };
    await storage.write(`${plan.planId}-${effect}-terraform-outcome.json`, evidence);
    await session.reconcileApplyFromEvidence(prep.receipt, canonicalSha256(evidence));
    if (effect === 'release')
      return await finishRelease(base, plan, marker, prep, storage, session, api, runtime, signal);
    return 'completed';
  } finally {
    await release();
  }
}
function verifyAppliedIdentities(plan, address, fields, removal) {
  const node = plan.bindings.nodes[0];
  if (fields[`aws_instance.node_${node.nodeIndex}`]?.id !== node.instanceId)
    throw Error('Terraform applied VM identity differs');
  for (const item of node.interfaces) {
    const row = fields[`aws_network_interface.node_${node.nodeIndex}_nic_${item.index}`];
    if (row?.id !== item.id || String(row?.mac_address).toLowerCase() !== item.mac.toLowerCase())
      throw Error('Terraform applied ENI identity differs');
  }
  const control = fields[address];
  if (removal) {
    if (control !== null) throw Error('Terraform removed control is still present');
  } else if (
    control &&
    (control.id !== node.instanceId || control.instance_id !== node.instanceId || control.force !== false)
  )
    throw Error('Terraform applied power identity differs');
}
async function finishRelease(base, plan, marker, prep, storage, session, api, runtime, signal) {
  const current = await identities2(base, plan, api, runtime, signal);
  if (current.cloud !== 'running') return 'pending';
  const preparingName = `${plan.planId}-release-terraform-final-preparing.json`;
  const preparing = await optional2(storage, preparingName);
  const expectedPreparing = { marker, removalReceipt: prep.receipt };
  if (preparing !== undefined && canonicalSha256(preparing) !== canonicalSha256(expectedPreparing))
    throw Error('Terraform final preparation differs');
  if (preparing === undefined) await storage.write(preparingName, expectedPreparing);
  const name = `${plan.planId}-release-terraform-final-plan.json`;
  const saved = await optional2(storage, name);
  if (saved && canonicalSha256(saved.marker) !== canonicalSha256(marker))
    throw Error('Terraform final no-change marker differs');
  const receipt = saved?.receipt ?? (await session.plan(process.env, signal));
  if (
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== base.deploymentName ||
    receipt.backendIdentity !== `local:${base.deploymentName}` ||
    receipt.configurationSha256 !== prep.revision.afterSha256 ||
    receipt.providerLockSha256 !== prep.receipt?.providerLockSha256 ||
    !receipt.noChanges ||
    receipt.operation ||
    receipt.actionInvocations?.length ||
    new Set(receipt.changes.map((r) => r.address)).size !== receipt.changes.length ||
    receipt.changes.some((r) => canonicalSha256(r.actions) !== canonicalSha256(['no-op']))
  )
    throw Error('Terraform release final no-change plan differs');
  if ((await session.readPlanApplicationState(receipt)) !== 'planned')
    throw Error('Terraform final no-change journal differs');
  const node = plan.bindings.nodes[0];
  const selections = {
    [prep.revision.address]: ['instance_id'],
    [`aws_instance.node_${node.nodeIndex}`]: ['id'],
  };
  for (const item of node.interfaces)
    selections[`aws_network_interface.node_${node.nodeIndex}_nic_${item.index}`] = ['id', 'mac_address'];
  if (!saved) await storage.write(name, { marker, receipt });
  const fields = await session.readAppliedResourceFields(receipt, selections, process.env, signal);
  verifyAppliedIdentities(plan, prep.revision.address, fields, true);
  await storage.write(`${plan.planId}-release-terraform-complete.json`, {
    schemaVersion: 1,
    marker,
    receipt,
    fields,
    cloud: current,
    collectedAt: new Date().toISOString(),
  });
  return 'completed';
}

// plugins/aws/src/ce/whole-site-power-operational.ts
function exactInterfaces(value, nodes) {
  if (!Array.isArray(value)) return false;
  const expected = nodes.flatMap((node) => node.interfaces.map((item) => ({ node: node.nodeName, ...item })));
  return (
    value.length === expected.length &&
    expected.every(
      (item) =>
        value.filter(
          (row) =>
            row &&
            typeof row === 'object' &&
            row.node === item.node &&
            row.role === item.role &&
            typeof row.mac === 'string' &&
            row.mac.toLowerCase() === item.mac.toLowerCase() &&
            row.device === item.device,
        ).length === 1,
    )
  );
}
async function collectAwsPowerOperational(base, plan, values, api, runtime, signal) {
  verifyAwsWholeSitePowerPlan(base, plan);
  const result = {
    source: 'live',
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    identity: 'unknown',
    cloud: 'unknown',
    registration: 'unknown',
    configuration: 'unknown',
    versions: 'unknown',
    interfaceState: 'unknown',
    traffic: 'unknown',
    freshness: 'unqualified',
    canSatisfyInterfaceMutationGate: false,
    contractFingerprint: runtime.contract.fingerprint,
    collectedAt: new Date().toISOString(),
  };
  try {
    const identities = await collectAwsPowerIdentities(base, values, api, runtime, signal);
    if (
      canonicalSha256({ owner: identities.owner, nodes: identities.nodes }) !==
      canonicalSha256({ owner: plan.bindings.owner, nodes: plan.bindings.nodes })
    )
      throw Error('Operational identity differs');
    result.identity = 'verified';
    result.cloud = identities.cloud;
    const observations = [];
    for (const { binding } of siteBindings(base)) {
      const nodes = plan.bindings.nodes.filter((node) => node.siteName === binding.siteName),
        instances = Object.fromEntries(nodes.map((node) => [node.nodeName, node.instanceId]));
      const expected = nodes.flatMap((node) =>
        node.interfaces.map((item) => ({
          node: node.nodeName,
          role: item.role,
          mac: item.mac,
        })),
      );
      const before = await runtime.observeOwnedSite(binding, signal),
        uid = before.system_metadata?.uid;
      if (typeof uid !== 'string' || !uid.trim()) throw Error('Operational site UID missing');
      const health = await runtime.observeHealth(binding, signal),
        registration = await runtime.observeRegistrations(binding, instances, signal),
        configuration = await runtime.observeAwsRegisteredConfiguration(binding, instances, expected, signal),
        versions = await runtime.observePowerVersions(binding, signal);
      let interfaces;
      try {
        interfaces = await runtime.observeAwsInterfaces(binding, expected, signal);
      } catch {
        signal?.throwIfAborted();
        interfaces = { status: 'unknown', interfaces: [], observedAt: new Date().toISOString() };
      }
      const after = await runtime.observeOwnedSite(binding, signal);
      if (
        after.system_metadata?.uid !== uid ||
        canonicalSha256(after.spec) !== canonicalSha256(before.spec) ||
        (configuration.status === 'configured' && configuration.siteUid !== uid) ||
        health.siteUid !== uid ||
        versions.status !== 'observed' ||
        versions.siteUid !== uid
      )
        throw Error('Operational site changed or unavailable');
      const boundInterfaces =
        exactInterfaces(interfaces.interfaces, nodes) &&
        interfaces.interfaces.every((row) => typeof row.linkUp === 'boolean');
      observations.push({
        registration: health.status === 'healthy' && registration.status === 'healthy',
        configuration: configuration.status === 'configured' && exactInterfaces(configuration.interfaces, nodes),
        versions: versions.stable === true,
        interfaceState:
          boundInterfaces && interfaces.status === 'observed' && interfaces.interfaces.every((row) => row.linkUp)
            ? 'up'
            : boundInterfaces && interfaces.status === 'down' && interfaces.interfaces.some((row) => !row.linkUp)
              ? 'down'
              : 'unknown',
      });
    }
    const finalIdentity = await collectAwsPowerIdentities(base, values, api, runtime, signal);
    if (
      canonicalSha256({ owner: finalIdentity.owner, nodes: finalIdentity.nodes }) !==
      canonicalSha256({ owner: plan.bindings.owner, nodes: plan.bindings.nodes })
    ) {
      result.identity = 'unknown';
      result.cloud = 'unknown';
      throw Error('Operational hardware changed during observation');
    }
    result.cloud = finalIdentity.cloud;
    result.registration = observations.every((row) => row.registration) ? 'healthy' : 'unknown';
    result.configuration = observations.every((row) => row.configuration) ? 'verified' : 'unknown';
    result.versions = observations.every((row) => row.versions) ? 'stable' : 'unknown';
    result.interfaceState = observations.some((row) => row.interfaceState === 'unknown')
      ? 'unknown'
      : observations.some((row) => row.interfaceState === 'down')
        ? 'down'
        : 'up';
  } catch {
    signal?.throwIfAborted();
  }
  return { ...result, collectedAt: new Date().toISOString() };
}

// plugins/aws/src/ce/whole-site-power-evidence.ts
async function collectAwsWholeSitePowerEvidence(base, plan, gate, values, api, runtime, signal, retainedBgp, storage) {
  const operational = await collectAwsPowerOperational(base, plan, values, api, runtime, signal);
  let services = 'unknown';
  try {
    const inventory = await collectAwsPowerServiceInventory(base, values, api, runtime, signal, retainedBgp);
    if (inventory.servicesSha256 === plan.bindings.servicesSha256 && inventory.status !== 'pending')
      services = inventory.status;
  } catch {
    signal?.throwIfAborted();
  }
  let traffic = 'unknown';
  if (storage) {
    const receipt = await readAwsTrafficProbeEvidence(base, storage, values);
    if (receipt.status === 'healthy') traffic = 'passing';
  }
  return {
    source: 'live',
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    gate,
    identity: operational.identity,
    cloud: operational.cloud,
    registration: operational.registration,
    configuration: operational.configuration,
    versions: operational.versions,
    interfaces: operational.interfaceState,
    canSatisfyInterfaceMutationGate: operational.canSatisfyInterfaceMutationGate,
    services,
    traffic,
    collectedAt: new Date().toISOString(),
  };
}

// plugins/aws/src/ce/direct-route-power-controller.ts
async function optional3(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function context3(base, plan, effect, storage) {
  verifyAwsWholeSitePowerPlan(base, plan);
  await storage.verify();
  if (
    base.engine !== 'native' ||
    plan.operation !== (effect === 'withdraw' ? 'stop' : 'start') ||
    canonicalSha256(storage.owner) !== canonicalSha256(plan.bindings.owner) ||
    canonicalSha256(await storage.read(`${plan.planId}.json`)) !== canonicalSha256(plan)
  )
    throw Error('Native direct route owner or plan differs');
  const cp = await storage.read(`${plan.planId}-checkpoint.json`);
  const attempt = cp.pending;
  if (
    cp.schemaVersion !== 1 ||
    cp.planSha256 !== plan.planSha256 ||
    cp.bindingsSha256 !== plan.bindingsSha256 ||
    cp.step !== (effect === 'withdraw' ? 1 : 3) ||
    cp.complete !== false ||
    !attempt ||
    attempt.effect !== effect ||
    attempt.requestSha256 !== canonicalSha256({ planSha256: plan.planSha256, effect }) ||
    canonicalSha256(cp.attempts?.[effect]) !== canonicalSha256(attempt) ||
    !Number.isFinite(Date.parse(attempt.originalAttemptAt)) ||
    Date.parse(attempt.originalAttemptAt) > Date.now()
  )
    throw Error('Native direct route original attempt differs');
  return {
    schemaVersion: 1,
    engine: 'native',
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    servicesSha256: powerServiceComponentSha256(base, plan.bindings, 'direct'),
    attempt,
  };
}
async function observe(base, plan, values, api, signal) {
  const observed = await collectAwsPowerDirectRoutes(base, values, api, signal);
  if (observed.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'direct'))
    throw Error('Native direct route service identity differs');
  return observed;
}
async function retainedStop(base, plan, storage) {
  if (!plan.maintenance) throw Error('Native direct route maintenance missing');
  const id = `aws-ce-power-${plan.maintenance.stopPlanSha256.slice(0, 24)}`;
  const stop = await storage.read(`${id}.json`);
  verifyAwsWholeSitePowerPlan(base, stop);
  const outcome = await storage.read(`${id}-withdraw-native-route-outcome.json`);
  if (
    stop.operation !== 'stop' ||
    stop.planSha256 !== plan.maintenance.stopPlanSha256 ||
    stop.transitionId !== plan.transitionId ||
    stop.bindingsSha256 !== plan.bindingsSha256 ||
    outcome.marker.planSha256 !== stop.planSha256 ||
    outcome.marker.bindingsSha256 !== stop.bindingsSha256 ||
    outcome.marker.attempt.effect !== 'withdraw' ||
    outcome.observed.status !== 'withdrawn' ||
    outcome.observed.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'direct') ||
    canonicalSha256(outcome.observed.services) !== powerServiceComponentSha256(base, plan.bindings, 'direct')
  )
    throw Error('Native direct route completed withdrawal differs');
  for (const [index, route] of outcome.observed.services.routes.entries()) {
    const saved = await storage.read(`${id}-withdraw-native-route-${index}-dispatch.json`);
    if (
      canonicalSha256(saved.marker) !== canonicalSha256(outcome.marker) ||
      canonicalSha256(saved.services) !== powerServiceComponentSha256(base, plan.bindings, 'direct') ||
      canonicalSha256(saved.route) !== canonicalSha256(route)
    )
      throw Error('Native direct route retained dispatch differs');
  }
}
async function dispatchAwsNativeDirectRoutes(base, plan, authorization, effect, storage, values, api, signal) {
  if (authorization !== plan.planSha256) throw Error('Native direct route authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.native-direct-route-lock`);
  try {
    const marker = await context3(base, plan, effect, storage);
    const observed = await observe(base, plan, values, api, signal);
    if (effect === 'restore') await retainedStop(base, plan, storage);
    for (const [index, route] of observed.services.routes.entries()) {
      const name = `${plan.planId}-${effect}-native-route-${index}-dispatch.json`;
      const expected = { marker, services: observed.services, route };
      const saved = await optional3(storage, name);
      if (saved !== undefined) {
        if (canonicalSha256(saved) !== canonicalSha256(expected))
          throw Error('Native direct route dispatch marker differs');
        const current = await routeState(base, plan, values, api, route, signal);
        if (current !== (effect === 'withdraw' ? 'withdrawn' : 'active'))
          throw Error('Native direct route submitted attempt pending; reconcile');
        continue;
      }
      const current = await routeState(base, plan, values, api, route, signal);
      if (current !== (effect === 'withdraw' ? 'active' : 'withdrawn'))
        throw Error('Native direct route prerequisite differs');
      signal?.throwIfAborted();
      await storage.write(name, expected);
      const result = await scopedAwsApi(api, base.intent.awsProfile ?? 'default', signal).exec('aws', [
        'ec2',
        effect === 'withdraw' ? 'delete-route' : 'create-route',
        '--route-table-id',
        route.routeTableId,
        '--destination-cidr-block',
        route.destinationCidr,
        ...(effect === 'restore' ? ['--network-interface-id', route.networkInterfaceId] : []),
        '--region',
        base.region,
        '--output',
        'json',
      ]);
      if (result.exitCode) throw Error('Native direct route submission failed; reconcile original attempt');
      const ack = JSON.parse(result.stdout || '{}');
      if (
        !ack ||
        typeof ack !== 'object' ||
        Array.isArray(ack) ||
        Object.keys(ack).some((k) => k !== 'Return') ||
        ('Return' in ack && ack.Return !== true)
      )
        throw Error('Native direct route acknowledgement malformed');
    }
  } finally {
    await release();
  }
}
async function routeState(base, plan, values, api, route, signal) {
  const observed = await observe(base, plan, values, api, signal);
  const matches = observed.memberships.filter(
    (r) => r.routeTableId === route.routeTableId && r.destinationCidr === route.destinationCidr,
  );
  if (matches.length !== 1) throw Error('Native direct route inventory incomplete');
  return matches[0].status;
}
async function reconcileAwsNativeDirectRoutes(base, plan, effect, originalAttemptAt, storage, values, api, signal) {
  const release = await acquireProcessLock(`${storage.directory}/.native-direct-route-lock`);
  try {
    const marker = await context3(base, plan, effect, storage);
    if (originalAttemptAt !== marker.attempt.originalAttemptAt)
      throw Error('Native direct route original attempt differs');
    if (effect === 'restore') await retainedStop(base, plan, storage);
    const observed = await observe(base, plan, values, api, signal);
    let missing = false;
    let submittedPending = false;
    for (const [index, route] of observed.services.routes.entries()) {
      const saved = await optional3(storage, `${plan.planId}-${effect}-native-route-${index}-dispatch.json`);
      if (saved === undefined) {
        missing = true;
        continue;
      }
      if (canonicalSha256(saved) !== canonicalSha256({ marker, services: observed.services, route }))
        throw Error('Native direct route dispatch marker differs');
      if (
        (await routeState(base, plan, values, api, route, signal)) !== (effect === 'withdraw' ? 'withdrawn' : 'active')
      )
        submittedPending = true;
    }
    if (missing) return submittedPending ? 'pending' : 'not-submitted';
    if (observed.status !== (effect === 'withdraw' ? 'withdrawn' : 'active')) return 'pending';
    await storage.write(`${plan.planId}-${effect}-native-route-outcome.json`, { marker, observed });
    return 'completed';
  } finally {
    await release();
  }
}

// plugins/aws/src/ce/nlb-power-controller.ts
async function optional4(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function context4(base, plan, effect, storage) {
  verifyAwsWholeSitePowerPlan(base, plan);
  await storage.verify();
  if (
    plan.operation !== (effect === 'withdraw' ? 'stop' : 'start') ||
    base.topology.nodeCount !== 1 ||
    canonicalSha256(storage.owner) !== canonicalSha256(plan.bindings.owner) ||
    canonicalSha256(await storage.read(`${plan.planId}.json`)) !== canonicalSha256(plan)
  )
    throw Error('NLB owning plan differs');
  const cp = await storage.read(`${plan.planId}-checkpoint.json`);
  const attempt = cp.pending;
  if (
    cp.schemaVersion !== 1 ||
    cp.planSha256 !== plan.planSha256 ||
    cp.bindingsSha256 !== plan.bindingsSha256 ||
    cp.step !== (effect === 'withdraw' ? 1 : 3) ||
    cp.complete !== false ||
    !attempt ||
    attempt.effect !== effect ||
    attempt.requestSha256 !== canonicalSha256({ planSha256: plan.planSha256, effect }) ||
    !Number.isFinite(Date.parse(attempt.originalAttemptAt)) ||
    Date.parse(attempt.originalAttemptAt) > Date.now() ||
    canonicalSha256(attempt) !== canonicalSha256(cp.attempts?.[effect])
  )
    throw Error('NLB original attempt differs');
  return {
    schemaVersion: 1,
    engine: base.engine,
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    servicesSha256: powerServiceComponentSha256(base, plan.bindings, 'nlb'),
    attempt,
  };
}
async function dispatchAwsNativeNlbMembership(base, plan, authorization, effect, storage, values, api, signal) {
  if (base.engine !== 'native') throw Error('Native NLB engine differs');
  if (authorization !== plan.planSha256) throw Error('Native NLB authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.native-nlb-power-lock`);
  try {
    const marker = await context4(base, plan, effect, storage);
    const name = `${plan.planId}-${effect}-native-nlb-dispatch.json`;
    if ((await optional4(storage, name)) !== undefined)
      throw Error('Native NLB already submitted; reconcile original attempt');
    const observed = await collectAwsPowerNlbServices(base, values, api, signal);
    if (
      observed.servicesSha256 !== marker.servicesSha256 ||
      observed.status !== (effect === 'withdraw' ? 'active' : 'withdrawn')
    )
      throw Error('Native NLB current service binding or prerequisite differs');
    signal?.throwIfAborted();
    await storage.write(name, { marker, services: observed.services });
    const r = await scopedAwsApi(api, base.intent.awsProfile ?? 'default', signal).exec('aws', [
      'elbv2',
      effect === 'withdraw' ? 'deregister-targets' : 'register-targets',
      '--target-group-arn',
      observed.services.targetGroupArn,
      '--targets',
      JSON.stringify([observed.services.target]),
      '--region',
      base.region,
      '--output',
      'json',
    ]);
    if (r.exitCode) throw Error('Native NLB submission failed; reconcile original attempt');
    const acknowledgement = JSON.parse(r.stdout || '{}');
    if (
      !acknowledgement ||
      typeof acknowledgement !== 'object' ||
      Array.isArray(acknowledgement) ||
      Object.keys(acknowledgement).length
    )
      throw Error('Native NLB acknowledgement malformed');
  } finally {
    await release();
  }
}
async function reconcileAwsNativeNlbMembership(base, plan, effect, originalAttemptAt, storage, values, api, signal) {
  if (base.engine !== 'native') throw Error('Native NLB engine differs');
  const release = await acquireProcessLock(`${storage.directory}/.native-nlb-power-lock`);
  try {
    const marker = await context4(base, plan, effect, storage);
    if (originalAttemptAt !== marker.attempt.originalAttemptAt) throw Error('NLB original attempt differs');
    const saved = await optional4(storage, `${plan.planId}-${effect}-native-nlb-dispatch.json`);
    if (!saved) return 'not-submitted';
    if (
      canonicalSha256(saved.marker) !== canonicalSha256(marker) ||
      canonicalSha256(saved.services) !== marker.servicesSha256
    )
      throw Error('Native NLB dispatch marker differs');
    const observed = await collectAwsPowerNlbServices(base, values, api, signal);
    if (observed.servicesSha256 !== marker.servicesSha256) throw Error('Native NLB retained service identity changed');
    if (observed.status !== (effect === 'withdraw' ? 'withdrawn' : 'active')) return 'pending';
    await storage.write(`${plan.planId}-${effect}-native-nlb-outcome.json`, { marker, observed });
    return 'completed';
  } finally {
    await release();
  }
}
async function retainedWithdrawal(base, plan, storage, effect) {
  if (effect !== 'restore') return;
  if (!plan.maintenance) throw Error('Terraform NLB stopped maintenance missing');
  const id = `aws-ce-power-${plan.maintenance.stopPlanSha256.slice(0, 24)}`;
  const stop = await storage.read(`${id}.json`);
  verifyAwsWholeSitePowerPlan(base, stop);
  if (
    stop.operation !== 'stop' ||
    stop.planSha256 !== plan.maintenance.stopPlanSha256 ||
    stop.transitionId !== plan.transitionId ||
    stop.bindingsSha256 !== plan.bindingsSha256
  )
    throw Error('Terraform NLB retained stop plan differs');
  const prior = await storage.read(`${id}-withdraw-terraform-nlb-preparation.json`);
  if (
    prior.marker.planSha256 !== plan.maintenance.stopPlanSha256 ||
    prior.marker.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'nlb') ||
    prior.marker.bindingsSha256 !== plan.bindingsSha256 ||
    !prior.receipt
  )
    throw Error('Terraform NLB retained withdrawal differs');
  const dispatch = await storage.read(`${id}-withdraw-terraform-nlb-dispatch.json`);
  const outcome = await storage.read(`${id}-withdraw-terraform-nlb-outcome.json`);
  if (
    prior.marker.engine !== 'terraform' ||
    prior.marker.attempt.effect !== 'withdraw' ||
    canonicalSha256(dispatch) !== canonicalSha256({ marker: prior.marker, receipt: prior.receipt }) ||
    canonicalSha256(outcome.marker) !== canonicalSha256(prior.marker) ||
    canonicalSha256(outcome.receipt) !== canonicalSha256(prior.receipt) ||
    outcome.observed.status !== 'withdrawn' ||
    outcome.observed.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'nlb') ||
    canonicalSha256(outcome.observed.services) !== powerServiceComponentSha256(base, plan.bindings, 'nlb') ||
    canonicalSha256(outcome.applied) !== canonicalSha256({ [prior.revision.address]: null }) ||
    !Number.isFinite(Date.parse(outcome.collectedAt)) ||
    Date.parse(outcome.collectedAt) > Date.now() ||
    Date.parse(outcome.collectedAt) < Date.parse(prior.marker.attempt.originalAttemptAt)
  )
    throw Error('Terraform NLB completed withdrawal evidence differs');
  const services = outcome.observed.services;
  if (
    canonicalSha256(reviseAwsTerraformNlbMembership(base, services, prior.source, 'withdraw')) !==
    canonicalSha256(prior.revision)
  )
    throw Error('Terraform NLB completed withdrawal revision differs');
  validateAwsTerraformNlbMembershipReceipt(
    base,
    services,
    prior.revision,
    prior.receipt,
    {
      [prior.revision.address]: {
        target_group_arn: services.targetGroupArn,
        target_id: services.target.Id,
        port: services.target.Port,
        availability_zone: 'all',
      },
    },
    { [prior.revision.address]: null },
  );
  return prior.revision;
}
async function projections(session, receipt, address, signal) {
  const selections = { [address]: ['target_group_arn', 'target_id', 'port', 'availability_zone'] };
  return {
    before: await session.readPlannedResourceFields(receipt, selections, process.env, signal),
    after: await session.readProposedResourceFields(receipt, selections, process.env, signal),
  };
}
async function dispatchAwsTerraformNlbMembership(
  base,
  plan,
  authorization,
  effect,
  storage,
  values,
  api,
  terraform,
  signal,
) {
  if (base.engine !== 'terraform' || authorization !== plan.planSha256)
    throw Error('Terraform NLB engine or authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.terraform-nlb-power-lock`);
  try {
    const marker = await context4(base, plan, effect, storage);
    const name = `${plan.planId}-${effect}-terraform-nlb-preparation.json`;
    const dispatchName = `${plan.planId}-${effect}-terraform-nlb-dispatch.json`;
    const observed = await collectAwsPowerNlbServices(base, values, api, signal);
    if (observed.servicesSha256 !== marker.servicesSha256) throw Error('Terraform NLB service identity differs');
    const session = await openAwsTerraformPowerSession(base, storage, terraform, api, signal);
    let prep = await optional4(storage, name);
    const retained = await retainedWithdrawal(base, plan, storage, effect);
    if (prep) {
      if (
        canonicalSha256(prep.marker) !== canonicalSha256(marker) ||
        canonicalSha256(reviseAwsTerraformNlbMembership(base, observed.services, prep.source, effect, retained)) !==
          canonicalSha256(prep.revision)
      )
        throw Error('Terraform NLB preparation differs');
      if (prep.receipt && (await session.readPlanApplicationState(prep.receipt)) !== 'planned')
        throw Error('Terraform NLB already submitted; reconcile original attempt');
    } else {
      if ((await optional4(storage, dispatchName)) !== undefined)
        throw Error('Terraform NLB submission lacks preparation');
      if (!session.readConfigurationSha256) throw Error('Terraform NLB configuration reader missing');
      const source = await session.readConfiguration(await session.readConfigurationSha256());
      prep = {
        marker,
        source,
        revision: reviseAwsTerraformNlbMembership(base, observed.services, source, effect, retained),
      };
      await storage.write(name, prep);
    }
    if (observed.status !== (effect === 'withdraw' ? 'active' : 'withdrawn'))
      throw Error('Terraform NLB prerequisite membership differs');
    if (!session.readConfigurationSha256) throw Error('Terraform NLB configuration reader missing');
    const current = await session.readConfigurationSha256();
    if (current === prep.revision.beforeSha256) await session.reviseConfiguration(current, prep.revision.configuration);
    else if (current !== prep.revision.afterSha256) throw Error('Terraform NLB current revision differs');
    if (!prep.receipt) {
      const receipt = await session.plan(process.env, signal);
      const fields = await projections(session, receipt, prep.revision.address, signal);
      validateAwsTerraformNlbMembershipReceipt(
        base,
        observed.services,
        prep.revision,
        receipt,
        fields.before,
        fields.after,
      );
      prep = { ...prep, receipt };
      await storage.write(name, prep);
    }
    if (!prep.receipt) throw Error('Terraform NLB receipt missing');
    const fields = await projections(session, prep.receipt, prep.revision.address, signal);
    validateAwsTerraformNlbMembershipReceipt(
      base,
      observed.services,
      prep.revision,
      prep.receipt,
      fields.before,
      fields.after,
    );
    if ((await session.readPlanApplicationState(prep.receipt)) !== 'planned')
      throw Error('Terraform NLB already submitted');
    const expected = { marker, receipt: prep.receipt };
    const saved = await optional4(storage, dispatchName);
    if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256(expected))
      throw Error('Terraform NLB dispatch marker differs');
    signal?.throwIfAborted();
    await storage.write(dispatchName, expected);
    await session.apply(prep.receipt, process.env, signal);
  } finally {
    await release();
  }
}
async function reconcileAwsTerraformNlbMembership(
  base,
  plan,
  effect,
  originalAttemptAt,
  storage,
  values,
  api,
  terraform,
  signal,
) {
  if (base.engine !== 'terraform') throw Error('Terraform NLB engine differs');
  const release = await acquireProcessLock(`${storage.directory}/.terraform-nlb-power-lock`);
  try {
    const marker = await context4(base, plan, effect, storage);
    if (originalAttemptAt !== marker.attempt.originalAttemptAt) throw Error('Terraform NLB original attempt differs');
    const prep = await optional4(storage, `${plan.planId}-${effect}-terraform-nlb-preparation.json`);
    const saved = await optional4(storage, `${plan.planId}-${effect}-terraform-nlb-dispatch.json`);
    if (!prep?.receipt) {
      if (saved !== undefined) throw Error('Terraform NLB submission lacks receipt');
      return 'not-submitted';
    }
    if (canonicalSha256(prep.marker) !== canonicalSha256(marker))
      throw Error('Terraform NLB preparation marker differs');
    const observed = await collectAwsPowerNlbServices(base, values, api, signal);
    if (
      observed.servicesSha256 !== marker.servicesSha256 ||
      canonicalSha256(
        reviseAwsTerraformNlbMembership(
          base,
          observed.services,
          prep.source,
          effect,
          await retainedWithdrawal(base, plan, storage, effect),
        ),
      ) !== canonicalSha256(prep.revision)
    )
      throw Error('Terraform NLB retained preparation differs');
    const session = await openAwsTerraformPowerSession(base, storage, terraform, api, signal);
    const journal = await session.readPlanApplicationState(prep.receipt);
    if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256({ marker, receipt: prep.receipt }))
      throw Error('Terraform NLB dispatch marker differs');
    if (journal === 'planned') return 'not-submitted';
    if (saved === undefined) throw Error('Terraform NLB submitted journal lacks marker');
    const fields = await projections(session, prep.receipt, prep.revision.address, signal);
    validateAwsTerraformNlbMembershipReceipt(
      base,
      observed.services,
      prep.revision,
      prep.receipt,
      fields.before,
      fields.after,
    );
    const applied = await session.readAppliedResourceFields(
      prep.receipt,
      { [prep.revision.address]: ['target_group_arn', 'target_id', 'port', 'availability_zone'] },
      process.env,
      signal,
    );
    const expected =
      effect === 'withdraw'
        ? null
        : {
            target_group_arn: observed.services.targetGroupArn,
            target_id: observed.services.target.Id,
            port: observed.services.target.Port,
            availability_zone: 'all',
          };
    if (Object.keys(applied).length !== 1 || !Object.hasOwn(applied, prep.revision.address))
      throw Error('Terraform NLB applied identity incomplete');
    const actual = applied[prep.revision.address];
    const owned = {
      target_group_arn: observed.services.targetGroupArn,
      target_id: observed.services.target.Id,
      port: observed.services.target.Port,
      availability_zone: 'all',
    };
    if (actual !== null && canonicalSha256(actual) !== canonicalSha256(owned))
      throw Error('Terraform NLB applied attachment identity differs');
    if (canonicalSha256(actual) !== canonicalSha256(expected)) return 'pending';
    if (observed.status !== (effect === 'withdraw' ? 'withdrawn' : 'active')) return 'pending';
    const evidence = { marker, receipt: prep.receipt, observed, applied, collectedAt: new Date().toISOString() };
    await storage.write(`${plan.planId}-${effect}-terraform-nlb-outcome.json`, evidence);
    await session.reconcileApplyFromEvidence(prep.receipt, canonicalSha256(evidence));
    return 'completed';
  } finally {
    await release();
  }
}

// plugins/aws/src/ce/static-tgw-power-controller.ts
function serviceRoutes(services) {
  return services.destinationCidrs.map((destinationCidr) => ({
    routeTableId: services.routeTableId,
    destinationCidr,
    transportAttachmentId: services.transportAttachmentId,
  }));
}
async function optional5(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function context5(base, plan, effect, storage) {
  verifyAwsWholeSitePowerPlan(base, plan);
  await storage.verify();
  if (
    base.engine !== 'native' ||
    plan.operation !== (effect === 'withdraw' ? 'stop' : 'start') ||
    canonicalSha256(storage.owner) !== canonicalSha256(plan.bindings.owner) ||
    canonicalSha256(await storage.read(`${plan.planId}.json`)) !== canonicalSha256(plan)
  )
    throw Error('Native static TGW route owner or plan differs');
  const cp = await storage.read(`${plan.planId}-checkpoint.json`);
  const attempt = cp.pending;
  if (
    cp.schemaVersion !== 1 ||
    cp.planSha256 !== plan.planSha256 ||
    cp.bindingsSha256 !== plan.bindingsSha256 ||
    cp.step !== (effect === 'withdraw' ? 1 : 3) ||
    cp.complete !== false ||
    !attempt ||
    attempt.effect !== effect ||
    attempt.requestSha256 !== canonicalSha256({ planSha256: plan.planSha256, effect }) ||
    canonicalSha256(cp.attempts?.[effect]) !== canonicalSha256(attempt) ||
    !Number.isFinite(Date.parse(attempt.originalAttemptAt)) ||
    Date.parse(attempt.originalAttemptAt) > Date.now()
  )
    throw Error('Native static TGW route original attempt differs');
  return {
    schemaVersion: 1,
    engine: 'native',
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    servicesSha256: powerServiceComponentSha256(base, plan.bindings, 'static-tgw'),
    attempt,
  };
}
async function observe2(base, plan, values, api, signal) {
  const observed = await collectAwsPowerStaticTgwRoutes(base, values, api, signal);
  if (observed.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'static-tgw'))
    throw Error('Native static TGW route service identity differs');
  return observed;
}
async function retainedStop2(base, plan, storage) {
  if (!plan.maintenance) throw Error('Native static TGW route maintenance missing');
  const id = `aws-ce-power-${plan.maintenance.stopPlanSha256.slice(0, 24)}`;
  const stop = await storage.read(`${id}.json`);
  verifyAwsWholeSitePowerPlan(base, stop);
  const outcome = await storage.read(`${id}-withdraw-native-static-tgw-outcome.json`);
  if (
    stop.operation !== 'stop' ||
    stop.planSha256 !== plan.maintenance.stopPlanSha256 ||
    stop.transitionId !== plan.transitionId ||
    stop.bindingsSha256 !== plan.bindingsSha256 ||
    outcome.marker.planSha256 !== stop.planSha256 ||
    outcome.marker.bindingsSha256 !== stop.bindingsSha256 ||
    outcome.marker.attempt.effect !== 'withdraw' ||
    outcome.observed.status !== 'withdrawn' ||
    outcome.observed.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'static-tgw') ||
    canonicalSha256(outcome.observed.services) !== powerServiceComponentSha256(base, plan.bindings, 'static-tgw')
  )
    throw Error('Native static TGW route completed withdrawal differs');
  for (const [index, route] of serviceRoutes(outcome.observed.services).entries()) {
    const saved = await storage.read(`${id}-withdraw-native-static-tgw-${index}-dispatch.json`);
    if (
      canonicalSha256(saved.marker) !== canonicalSha256(outcome.marker) ||
      canonicalSha256(saved.services) !== powerServiceComponentSha256(base, plan.bindings, 'static-tgw') ||
      canonicalSha256(saved.route) !== canonicalSha256(route)
    )
      throw Error('Native static TGW route retained dispatch differs');
  }
}
async function dispatchAwsNativeStaticTgwRoutes(base, plan, authorization, effect, storage, values, api, signal) {
  if (authorization !== plan.planSha256) throw Error('Native static TGW route authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.native-static-tgw-lock`);
  try {
    const marker = await context5(base, plan, effect, storage);
    const observed = await observe2(base, plan, values, api, signal);
    if (effect === 'restore') await retainedStop2(base, plan, storage);
    for (const [index, route] of serviceRoutes(observed.services).entries()) {
      const name = `${plan.planId}-${effect}-native-static-tgw-${index}-dispatch.json`;
      const expected = { marker, services: observed.services, route };
      const saved = await optional5(storage, name);
      if (saved !== undefined) {
        if (canonicalSha256(saved) !== canonicalSha256(expected))
          throw Error('Native static TGW route dispatch marker differs');
        const current = await routeState2(base, plan, values, api, route, signal);
        if (current !== (effect === 'withdraw' ? 'withdrawn' : 'active'))
          throw Error('Native static TGW route submitted attempt pending; reconcile');
        continue;
      }
      const current = await routeState2(base, plan, values, api, route, signal);
      if (current !== (effect === 'withdraw' ? 'active' : 'withdrawn'))
        throw Error('Native static TGW route prerequisite differs');
      signal?.throwIfAborted();
      await storage.write(name, expected);
      const result = await scopedAwsApi(api, base.intent.awsProfile ?? 'default', signal).exec('aws', [
        'ec2',
        effect === 'withdraw' ? 'delete-transit-gateway-route' : 'create-transit-gateway-route',
        '--transit-gateway-route-table-id',
        route.routeTableId,
        '--destination-cidr-block',
        route.destinationCidr,
        ...(effect === 'restore' ? ['--transit-gateway-attachment-id', route.transportAttachmentId] : []),
        '--region',
        base.region,
        '--output',
        'json',
      ]);
      if (result.exitCode) throw Error('Native static TGW route submission failed; reconcile original attempt');
      const ack = JSON.parse(result.stdout || '{}');
      if (
        !ack ||
        typeof ack !== 'object' ||
        Array.isArray(ack) ||
        Object.keys(ack).join(',') !== 'Route' ||
        !ack.Route ||
        typeof ack.Route !== 'object' ||
        Array.isArray(ack.Route) ||
        ack.Route.DestinationCidrBlock !== route.destinationCidr ||
        ack.Route.Type !== 'static'
      )
        throw Error('Native static TGW route acknowledgement malformed');
    }
  } finally {
    await release();
  }
}
async function routeState2(base, plan, values, api, route, signal) {
  const observed = await observe2(base, plan, values, api, signal);
  const matches = observed.memberships.filter((r) => r.destinationCidr === route.destinationCidr);
  if (matches.length !== 1) throw Error('Native static TGW route inventory incomplete');
  return matches[0].status;
}
async function reconcileAwsNativeStaticTgwRoutes(base, plan, effect, originalAttemptAt, storage, values, api, signal) {
  const release = await acquireProcessLock(`${storage.directory}/.native-static-tgw-lock`);
  try {
    const marker = await context5(base, plan, effect, storage);
    if (originalAttemptAt !== marker.attempt.originalAttemptAt)
      throw Error('Native static TGW route original attempt differs');
    if (effect === 'restore') await retainedStop2(base, plan, storage);
    const observed = await observe2(base, plan, values, api, signal);
    let missing = false;
    let submittedPending = false;
    for (const [index, route] of serviceRoutes(observed.services).entries()) {
      const saved = await optional5(storage, `${plan.planId}-${effect}-native-static-tgw-${index}-dispatch.json`);
      if (saved === undefined) {
        missing = true;
        continue;
      }
      if (canonicalSha256(saved) !== canonicalSha256({ marker, services: observed.services, route }))
        throw Error('Native static TGW route dispatch marker differs');
      if (
        (await routeState2(base, plan, values, api, route, signal)) !== (effect === 'withdraw' ? 'withdrawn' : 'active')
      )
        submittedPending = true;
    }
    if (missing) return submittedPending ? 'pending' : 'not-submitted';
    if (observed.status !== (effect === 'withdraw' ? 'withdrawn' : 'active')) return 'pending';
    await storage.write(`${plan.planId}-${effect}-native-static-tgw-outcome.json`, { marker, observed });
    return 'completed';
  } finally {
    await release();
  }
}

// plugins/aws/src/ce/terraform-direct-power-controller.ts
async function optional6(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function context6(base, plan, effect, storage) {
  verifyAwsWholeSitePowerPlan(base, plan);
  await storage.verify();
  if (
    plan.operation !== (effect === 'withdraw' ? 'stop' : 'start') ||
    base.topology.nodeCount !== 1 ||
    canonicalSha256(storage.owner) !== canonicalSha256(plan.bindings.owner) ||
    canonicalSha256(await storage.read(`${plan.planId}.json`)) !== canonicalSha256(plan)
  )
    throw Error('Direct route owning plan differs');
  const cp = await storage.read(`${plan.planId}-checkpoint.json`);
  const attempt = cp.pending;
  if (
    cp.schemaVersion !== 1 ||
    cp.planSha256 !== plan.planSha256 ||
    cp.bindingsSha256 !== plan.bindingsSha256 ||
    cp.step !== (effect === 'withdraw' ? 1 : 3) ||
    cp.complete !== false ||
    !attempt ||
    attempt.effect !== effect ||
    attempt.requestSha256 !== canonicalSha256({ planSha256: plan.planSha256, effect }) ||
    !Number.isFinite(Date.parse(attempt.originalAttemptAt)) ||
    Date.parse(attempt.originalAttemptAt) > Date.now() ||
    canonicalSha256(attempt) !== canonicalSha256(cp.attempts?.[effect])
  )
    throw Error('Direct route original attempt differs');
  return {
    schemaVersion: 1,
    engine: base.engine,
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    servicesSha256: powerServiceComponentSha256(base, plan.bindings, 'direct'),
    attempt,
  };
}
async function retainedWithdrawal2(base, plan, storage, effect) {
  if (effect !== 'restore') return;
  if (!plan.maintenance) throw Error('Terraform direct route stopped maintenance missing');
  const id = `aws-ce-power-${plan.maintenance.stopPlanSha256.slice(0, 24)}`;
  const stop = await storage.read(`${id}.json`);
  verifyAwsWholeSitePowerPlan(base, stop);
  if (
    stop.operation !== 'stop' ||
    stop.planSha256 !== plan.maintenance.stopPlanSha256 ||
    stop.transitionId !== plan.transitionId ||
    stop.bindingsSha256 !== plan.bindingsSha256
  )
    throw Error('Terraform direct route retained stop plan differs');
  const prior = await storage.read(`${id}-withdraw-terraform-direct-preparation.json`);
  if (
    prior.marker.planSha256 !== plan.maintenance.stopPlanSha256 ||
    prior.marker.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'direct') ||
    prior.marker.bindingsSha256 !== plan.bindingsSha256 ||
    !prior.receipt
  )
    throw Error('Terraform direct route retained withdrawal differs');
  const dispatch = await storage.read(`${id}-withdraw-terraform-direct-dispatch.json`);
  const outcome = await storage.read(`${id}-withdraw-terraform-direct-outcome.json`);
  if (
    prior.marker.schemaVersion !== 1 ||
    prior.marker.engine !== 'terraform' ||
    prior.marker.attempt.requestSha256 !== canonicalSha256({ planSha256: stop.planSha256, effect: 'withdraw' }) ||
    !Number.isFinite(Date.parse(prior.marker.attempt.originalAttemptAt)) ||
    Date.parse(prior.marker.attempt.originalAttemptAt) > Date.now() ||
    prior.marker.attempt.effect !== 'withdraw' ||
    canonicalSha256(dispatch) !== canonicalSha256({ marker: prior.marker, receipt: prior.receipt }) ||
    canonicalSha256(outcome.marker) !== canonicalSha256(prior.marker) ||
    canonicalSha256(outcome.receipt) !== canonicalSha256(prior.receipt) ||
    outcome.observed.status !== 'withdrawn' ||
    outcome.observed.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'direct') ||
    canonicalSha256(outcome.observed.services) !== powerServiceComponentSha256(base, plan.bindings, 'direct') ||
    canonicalSha256(outcome.applied) !==
      canonicalSha256(
        Object.fromEntries(Object.keys(prior.revision.routes).map((name) => [`aws_route.${name}`, null])),
      ) ||
    !Number.isFinite(Date.parse(outcome.collectedAt)) ||
    Date.parse(outcome.collectedAt) > Date.now() ||
    Date.parse(outcome.collectedAt) < Date.parse(prior.marker.attempt.originalAttemptAt)
  )
    throw Error('Terraform direct route completed withdrawal evidence differs');
  const services = outcome.observed.services;
  if (
    canonicalSha256(reviseAwsTerraformDirectServiceRoutes(base, services, prior.source, 'withdraw')) !==
    canonicalSha256(prior.revision)
  )
    throw Error('Terraform direct route completed withdrawal revision differs');
  validateAwsTerraformDirectServiceReceipt(
    base,
    services,
    prior.revision,
    prior.receipt,
    ownedFields(prior.revision),
    absentFields(prior.revision),
  );
  return prior.revision;
}
function selections(revision) {
  return Object.fromEntries(
    Object.keys(revision.routes).map((name) => [
      `aws_route.${name}`,
      ['route_table_id', 'destination_cidr_block', 'network_interface_id'],
    ]),
  );
}
function absentFields(revision) {
  return Object.fromEntries(Object.keys(selections(revision)).map((address) => [address, null]));
}
function ownedFields(revision) {
  return Object.fromEntries(
    Object.entries(revision.routes).map(([name, route]) => [
      `aws_route.${name}`,
      {
        destination_cidr_block: route.destination_cidr_block,
        network_interface_id: route.network_interface_id,
        route_table_id: route.route_table_id,
      },
    ]),
  );
}
async function projections2(session, receipt, revision, signal) {
  return {
    before: await session.readPlannedResourceFields(receipt, selections(revision), process.env, signal),
    after: await session.readProposedResourceFields(receipt, selections(revision), process.env, signal),
  };
}
async function dispatchAwsTerraformDirectRoutes(
  base,
  plan,
  authorization,
  effect,
  storage,
  values,
  api,
  terraform,
  signal,
) {
  if (base.engine !== 'terraform' || authorization !== plan.planSha256)
    throw Error('Terraform direct route engine or authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.terraform-direct-power-lock`);
  try {
    const marker = await context6(base, plan, effect, storage);
    const name = `${plan.planId}-${effect}-terraform-direct-preparation.json`;
    const dispatchName = `${plan.planId}-${effect}-terraform-direct-dispatch.json`;
    const observed = await collectAwsPowerDirectRoutes(base, values, api, signal);
    if (observed.servicesSha256 !== marker.servicesSha256)
      throw Error('Terraform direct route service identity differs');
    const session = await openAwsTerraformPowerSession(base, storage, terraform, api, signal);
    let prep = await optional6(storage, name);
    const retained = await retainedWithdrawal2(base, plan, storage, effect);
    if (prep) {
      if (
        canonicalSha256(prep.marker) !== canonicalSha256(marker) ||
        canonicalSha256(
          reviseAwsTerraformDirectServiceRoutes(base, observed.services, prep.source, effect, retained),
        ) !== canonicalSha256(prep.revision)
      )
        throw Error('Terraform direct route preparation differs');
      if (prep.receipt && (await session.readPlanApplicationState(prep.receipt)) !== 'planned')
        throw Error('Terraform direct route already submitted; reconcile original attempt');
    } else {
      if ((await optional6(storage, dispatchName)) !== undefined)
        throw Error('Terraform direct route submission lacks preparation');
      if (!session.readConfigurationSha256) throw Error('Terraform direct route configuration reader missing');
      const source = await session.readConfiguration(await session.readConfigurationSha256());
      prep = {
        marker,
        source,
        revision: reviseAwsTerraformDirectServiceRoutes(base, observed.services, source, effect, retained),
      };
      await storage.write(name, prep);
    }
    if (observed.status !== (effect === 'withdraw' ? 'active' : 'withdrawn'))
      throw Error('Terraform direct route prerequisite membership differs');
    if (!session.readConfigurationSha256) throw Error('Terraform direct route configuration reader missing');
    const current = await session.readConfigurationSha256();
    if (current === prep.revision.beforeSha256) await session.reviseConfiguration(current, prep.revision.configuration);
    else if (current !== prep.revision.afterSha256) throw Error('Terraform direct route current revision differs');
    if (!prep.receipt) {
      const receipt = await session.plan(process.env, signal);
      const fields = await projections2(session, receipt, prep.revision, signal);
      validateAwsTerraformDirectServiceReceipt(
        base,
        observed.services,
        prep.revision,
        receipt,
        fields.before,
        fields.after,
      );
      prep = { ...prep, receipt };
      await storage.write(name, prep);
    }
    if (!prep.receipt) throw Error('Terraform direct route receipt missing');
    const fields = await projections2(session, prep.receipt, prep.revision, signal);
    validateAwsTerraformDirectServiceReceipt(
      base,
      observed.services,
      prep.revision,
      prep.receipt,
      fields.before,
      fields.after,
    );
    if ((await session.readPlanApplicationState(prep.receipt)) !== 'planned')
      throw Error('Terraform direct route already submitted');
    const expected = { marker, receipt: prep.receipt };
    const saved = await optional6(storage, dispatchName);
    if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256(expected))
      throw Error('Terraform direct route dispatch marker differs');
    signal?.throwIfAborted();
    await storage.write(dispatchName, expected);
    await session.apply(prep.receipt, process.env, signal);
  } finally {
    await release();
  }
}
async function reconcileAwsTerraformDirectRoutes(
  base,
  plan,
  effect,
  originalAttemptAt,
  storage,
  values,
  api,
  terraform,
  signal,
) {
  if (base.engine !== 'terraform') throw Error('Terraform direct route engine differs');
  const release = await acquireProcessLock(`${storage.directory}/.terraform-direct-power-lock`);
  try {
    const marker = await context6(base, plan, effect, storage);
    if (originalAttemptAt !== marker.attempt.originalAttemptAt)
      throw Error('Terraform direct route original attempt differs');
    const prep = await optional6(storage, `${plan.planId}-${effect}-terraform-direct-preparation.json`);
    const saved = await optional6(storage, `${plan.planId}-${effect}-terraform-direct-dispatch.json`);
    if (!prep?.receipt) {
      if (saved !== undefined) throw Error('Terraform direct route submission lacks receipt');
      return 'not-submitted';
    }
    if (canonicalSha256(prep.marker) !== canonicalSha256(marker))
      throw Error('Terraform direct route preparation marker differs');
    const observed = await collectAwsPowerDirectRoutes(base, values, api, signal);
    if (
      observed.servicesSha256 !== marker.servicesSha256 ||
      canonicalSha256(
        reviseAwsTerraformDirectServiceRoutes(
          base,
          observed.services,
          prep.source,
          effect,
          await retainedWithdrawal2(base, plan, storage, effect),
        ),
      ) !== canonicalSha256(prep.revision)
    )
      throw Error('Terraform direct route retained preparation differs');
    const session = await openAwsTerraformPowerSession(base, storage, terraform, api, signal);
    const journal = await session.readPlanApplicationState(prep.receipt);
    if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256({ marker, receipt: prep.receipt }))
      throw Error('Terraform direct route dispatch marker differs');
    if (journal === 'planned') return 'not-submitted';
    if (saved === undefined) throw Error('Terraform direct route submitted journal lacks marker');
    const fields = await projections2(session, prep.receipt, prep.revision, signal);
    validateAwsTerraformDirectServiceReceipt(
      base,
      observed.services,
      prep.revision,
      prep.receipt,
      fields.before,
      fields.after,
    );
    const applied = await session.readAppliedResourceFields(
      prep.receipt,
      selections(prep.revision),
      process.env,
      signal,
    );
    const owned = ownedFields(prep.revision);
    const absent = absentFields(prep.revision);
    if (canonicalSha256(Object.keys(applied).sort()) !== canonicalSha256(Object.keys(owned).sort()))
      throw Error('Terraform direct route applied identity incomplete');
    for (const address of Object.keys(owned))
      if (applied[address] !== null && canonicalSha256(applied[address]) !== canonicalSha256(owned[address]))
        throw Error('Terraform direct route applied route identity differs');
    if (canonicalSha256(applied) !== canonicalSha256(effect === 'withdraw' ? absent : owned)) return 'pending';
    if (observed.status !== (effect === 'withdraw' ? 'withdrawn' : 'active')) return 'pending';
    const evidence = { marker, receipt: prep.receipt, observed, applied, collectedAt: new Date().toISOString() };
    await storage.write(`${plan.planId}-${effect}-terraform-direct-outcome.json`, evidence);
    await session.reconcileApplyFromEvidence(prep.receipt, canonicalSha256(evidence));
    return 'completed';
  } finally {
    await release();
  }
}

// plugins/aws/src/ce/terraform-static-tgw-power-controller.ts
async function optional7(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function context7(base, plan, effect, storage) {
  verifyAwsWholeSitePowerPlan(base, plan);
  await storage.verify();
  if (
    plan.operation !== (effect === 'withdraw' ? 'stop' : 'start') ||
    base.topology.nodeCount !== 1 ||
    canonicalSha256(storage.owner) !== canonicalSha256(plan.bindings.owner) ||
    canonicalSha256(await storage.read(`${plan.planId}.json`)) !== canonicalSha256(plan)
  )
    throw Error('Static TGW owning plan differs');
  const cp = await storage.read(`${plan.planId}-checkpoint.json`);
  const attempt = cp.pending;
  if (
    cp.schemaVersion !== 1 ||
    cp.planSha256 !== plan.planSha256 ||
    cp.bindingsSha256 !== plan.bindingsSha256 ||
    cp.step !== (effect === 'withdraw' ? 1 : 3) ||
    cp.complete !== false ||
    !attempt ||
    attempt.effect !== effect ||
    attempt.requestSha256 !== canonicalSha256({ planSha256: plan.planSha256, effect }) ||
    !Number.isFinite(Date.parse(attempt.originalAttemptAt)) ||
    Date.parse(attempt.originalAttemptAt) > Date.now() ||
    canonicalSha256(attempt) !== canonicalSha256(cp.attempts?.[effect])
  )
    throw Error('Static TGW original attempt differs');
  return {
    schemaVersion: 1,
    engine: base.engine,
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    servicesSha256: powerServiceComponentSha256(base, plan.bindings, 'static-tgw'),
    attempt,
  };
}
async function retainedWithdrawal3(base, plan, storage, effect) {
  if (effect !== 'restore') return;
  if (!plan.maintenance) throw Error('Terraform static TGW stopped maintenance missing');
  const id = `aws-ce-power-${plan.maintenance.stopPlanSha256.slice(0, 24)}`;
  const stop = await storage.read(`${id}.json`);
  verifyAwsWholeSitePowerPlan(base, stop);
  if (
    stop.operation !== 'stop' ||
    stop.planSha256 !== plan.maintenance.stopPlanSha256 ||
    stop.transitionId !== plan.transitionId ||
    stop.bindingsSha256 !== plan.bindingsSha256
  )
    throw Error('Terraform static TGW retained stop plan differs');
  const prior = await storage.read(`${id}-withdraw-terraform-static-tgw-preparation.json`);
  if (
    prior.marker.planSha256 !== plan.maintenance.stopPlanSha256 ||
    prior.marker.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'static-tgw') ||
    prior.marker.bindingsSha256 !== plan.bindingsSha256 ||
    !prior.receipt
  )
    throw Error('Terraform static TGW retained withdrawal differs');
  const dispatch = await storage.read(`${id}-withdraw-terraform-static-tgw-dispatch.json`);
  const outcome = await storage.read(`${id}-withdraw-terraform-static-tgw-outcome.json`);
  if (
    prior.marker.engine !== 'terraform' ||
    prior.marker.attempt.effect !== 'withdraw' ||
    canonicalSha256(dispatch) !== canonicalSha256({ marker: prior.marker, receipt: prior.receipt }) ||
    canonicalSha256(outcome.marker) !== canonicalSha256(prior.marker) ||
    canonicalSha256(outcome.receipt) !== canonicalSha256(prior.receipt) ||
    outcome.observed.status !== 'withdrawn' ||
    outcome.observed.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'static-tgw') ||
    canonicalSha256(outcome.observed.services) !== powerServiceComponentSha256(base, plan.bindings, 'static-tgw') ||
    canonicalSha256(outcome.applied) !==
      canonicalSha256(
        Object.fromEntries(
          Object.keys(prior.revision.routes).map((name) => [`aws_ec2_transit_gateway_route.${name}`, null]),
        ),
      ) ||
    !Number.isFinite(Date.parse(outcome.collectedAt)) ||
    Date.parse(outcome.collectedAt) > Date.now() ||
    Date.parse(outcome.collectedAt) < Date.parse(prior.marker.attempt.originalAttemptAt)
  )
    throw Error('Terraform static TGW completed withdrawal evidence differs');
  const services = outcome.observed.services;
  if (
    canonicalSha256(reviseAwsTerraformStaticServiceRoutes(base, services, prior.source, 'withdraw')) !==
    canonicalSha256(prior.revision)
  )
    throw Error('Terraform static TGW completed withdrawal revision differs');
  validateAwsTerraformStaticServiceReceipt(
    base,
    services,
    prior.revision,
    prior.receipt,
    ownedFields2(services, prior.revision),
    absentFields2(prior.revision),
  );
  return prior.revision;
}
function selections2(revision) {
  return Object.fromEntries(
    Object.keys(revision.routes).map((name) => [
      `aws_ec2_transit_gateway_route.${name}`,
      ['destination_cidr_block', 'transit_gateway_attachment_id', 'transit_gateway_route_table_id', 'blackhole'],
    ]),
  );
}
function absentFields2(revision) {
  return Object.fromEntries(Object.keys(selections2(revision)).map((address) => [address, null]));
}
function ownedFields2(services, revision) {
  return Object.fromEntries(
    Object.entries(revision.routes).map(([name, route]) => [
      `aws_ec2_transit_gateway_route.${name}`,
      {
        destination_cidr_block: route.destination_cidr_block,
        transit_gateway_attachment_id: services.transportAttachmentId,
        transit_gateway_route_table_id: services.routeTableId,
        blackhole: false,
      },
    ]),
  );
}
async function projections3(session, receipt, revision, signal) {
  return {
    before: await session.readPlannedResourceFields(receipt, selections2(revision), process.env, signal),
    after: await session.readProposedResourceFields(receipt, selections2(revision), process.env, signal),
  };
}
async function dispatchAwsTerraformStaticTgwRoutes(
  base,
  plan,
  authorization,
  effect,
  storage,
  values,
  api,
  terraform,
  signal,
) {
  if (base.engine !== 'terraform' || authorization !== plan.planSha256)
    throw Error('Terraform static TGW engine or authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.terraform-static-tgw-power-lock`);
  try {
    const marker = await context7(base, plan, effect, storage);
    const name = `${plan.planId}-${effect}-terraform-static-tgw-preparation.json`;
    const dispatchName = `${plan.planId}-${effect}-terraform-static-tgw-dispatch.json`;
    const observed = await collectAwsPowerStaticTgwRoutes(base, values, api, signal);
    if (observed.servicesSha256 !== marker.servicesSha256) throw Error('Terraform static TGW service identity differs');
    const session = await openAwsTerraformPowerSession(base, storage, terraform, api, signal);
    let prep = await optional7(storage, name);
    const retained = await retainedWithdrawal3(base, plan, storage, effect);
    if (prep) {
      if (
        canonicalSha256(prep.marker) !== canonicalSha256(marker) ||
        canonicalSha256(
          reviseAwsTerraformStaticServiceRoutes(base, observed.services, prep.source, effect, retained),
        ) !== canonicalSha256(prep.revision)
      )
        throw Error('Terraform static TGW preparation differs');
      if (prep.receipt && (await session.readPlanApplicationState(prep.receipt)) !== 'planned')
        throw Error('Terraform static TGW already submitted; reconcile original attempt');
    } else {
      if ((await optional7(storage, dispatchName)) !== undefined)
        throw Error('Terraform static TGW submission lacks preparation');
      if (!session.readConfigurationSha256) throw Error('Terraform static TGW configuration reader missing');
      const source = await session.readConfiguration(await session.readConfigurationSha256());
      prep = {
        marker,
        source,
        revision: reviseAwsTerraformStaticServiceRoutes(base, observed.services, source, effect, retained),
      };
      await storage.write(name, prep);
    }
    if (observed.status !== (effect === 'withdraw' ? 'active' : 'withdrawn'))
      throw Error('Terraform static TGW prerequisite membership differs');
    if (!session.readConfigurationSha256) throw Error('Terraform static TGW configuration reader missing');
    const current = await session.readConfigurationSha256();
    if (current === prep.revision.beforeSha256) await session.reviseConfiguration(current, prep.revision.configuration);
    else if (current !== prep.revision.afterSha256) throw Error('Terraform static TGW current revision differs');
    if (!prep.receipt) {
      const receipt = await session.plan(process.env, signal);
      const fields = await projections3(session, receipt, prep.revision, signal);
      validateAwsTerraformStaticServiceReceipt(
        base,
        observed.services,
        prep.revision,
        receipt,
        fields.before,
        fields.after,
      );
      prep = { ...prep, receipt };
      await storage.write(name, prep);
    }
    if (!prep.receipt) throw Error('Terraform static TGW receipt missing');
    const fields = await projections3(session, prep.receipt, prep.revision, signal);
    validateAwsTerraformStaticServiceReceipt(
      base,
      observed.services,
      prep.revision,
      prep.receipt,
      fields.before,
      fields.after,
    );
    if ((await session.readPlanApplicationState(prep.receipt)) !== 'planned')
      throw Error('Terraform static TGW already submitted');
    const expected = { marker, receipt: prep.receipt };
    const saved = await optional7(storage, dispatchName);
    if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256(expected))
      throw Error('Terraform static TGW dispatch marker differs');
    signal?.throwIfAborted();
    await storage.write(dispatchName, expected);
    await session.apply(prep.receipt, process.env, signal);
  } finally {
    await release();
  }
}
async function reconcileAwsTerraformStaticTgwRoutes(
  base,
  plan,
  effect,
  originalAttemptAt,
  storage,
  values,
  api,
  terraform,
  signal,
) {
  if (base.engine !== 'terraform') throw Error('Terraform static TGW engine differs');
  const release = await acquireProcessLock(`${storage.directory}/.terraform-static-tgw-power-lock`);
  try {
    const marker = await context7(base, plan, effect, storage);
    if (originalAttemptAt !== marker.attempt.originalAttemptAt)
      throw Error('Terraform static TGW original attempt differs');
    const prep = await optional7(storage, `${plan.planId}-${effect}-terraform-static-tgw-preparation.json`);
    const saved = await optional7(storage, `${plan.planId}-${effect}-terraform-static-tgw-dispatch.json`);
    if (!prep?.receipt) {
      if (saved !== undefined) throw Error('Terraform static TGW submission lacks receipt');
      return 'not-submitted';
    }
    if (canonicalSha256(prep.marker) !== canonicalSha256(marker))
      throw Error('Terraform static TGW preparation marker differs');
    const observed = await collectAwsPowerStaticTgwRoutes(base, values, api, signal);
    if (
      observed.servicesSha256 !== marker.servicesSha256 ||
      canonicalSha256(
        reviseAwsTerraformStaticServiceRoutes(
          base,
          observed.services,
          prep.source,
          effect,
          await retainedWithdrawal3(base, plan, storage, effect),
        ),
      ) !== canonicalSha256(prep.revision)
    )
      throw Error('Terraform static TGW retained preparation differs');
    const session = await openAwsTerraformPowerSession(base, storage, terraform, api, signal);
    const journal = await session.readPlanApplicationState(prep.receipt);
    if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256({ marker, receipt: prep.receipt }))
      throw Error('Terraform static TGW dispatch marker differs');
    if (journal === 'planned') return 'not-submitted';
    if (saved === undefined) throw Error('Terraform static TGW submitted journal lacks marker');
    const fields = await projections3(session, prep.receipt, prep.revision, signal);
    validateAwsTerraformStaticServiceReceipt(
      base,
      observed.services,
      prep.revision,
      prep.receipt,
      fields.before,
      fields.after,
    );
    const applied = await session.readAppliedResourceFields(
      prep.receipt,
      selections2(prep.revision),
      process.env,
      signal,
    );
    const owned = ownedFields2(observed.services, prep.revision);
    const absent = absentFields2(prep.revision);
    if (canonicalSha256(Object.keys(applied).sort()) !== canonicalSha256(Object.keys(owned).sort()))
      throw Error('Terraform static TGW applied identity incomplete');
    for (const address of Object.keys(owned))
      if (applied[address] !== null && canonicalSha256(applied[address]) !== canonicalSha256(owned[address]))
        throw Error('Terraform static TGW applied route identity differs');
    if (canonicalSha256(applied) !== canonicalSha256(effect === 'withdraw' ? absent : owned)) return 'pending';
    if (observed.status !== (effect === 'withdraw' ? 'withdrawn' : 'active')) return 'pending';
    const evidence = { marker, receipt: prep.receipt, observed, applied, collectedAt: new Date().toISOString() };
    await storage.write(`${plan.planId}-${effect}-terraform-static-tgw-outcome.json`, evidence);
    await session.reconcileApplyFromEvidence(prep.receipt, canonicalSha256(evidence));
    return 'completed';
  } finally {
    await release();
  }
}

// plugins/aws/src/ce/whole-site-power-service-controller.ts
async function components(base, plan, effect, at, storage, terraform) {
  verifyAwsWholeSitePowerPlan(base, plan);
  if (
    !plan.bindings.servicesInventory ||
    base.topology.nodeCount !== 1 ||
    plan.operation !== (effect === 'withdraw' ? 'stop' : 'start') ||
    canonicalSha256(storage.owner) !== canonicalSha256(plan.bindings.owner)
  )
    throw Error('Complete owning single-node service plan required');
  await storage.verify();
  if (canonicalSha256(await storage.read(`${plan.planId}.json`)) !== canonicalSha256(plan))
    throw Error('Complete service saved plan differs');
  const checkpoint = await storage.read(`${plan.planId}-checkpoint.json`);
  const attempt = checkpoint.pending;
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.planSha256 !== plan.planSha256 ||
    checkpoint.bindingsSha256 !== plan.bindingsSha256 ||
    checkpoint.step !== (effect === 'withdraw' ? 1 : 3) ||
    checkpoint.complete !== false ||
    !attempt ||
    attempt.effect !== effect ||
    attempt.originalAttemptAt !== at ||
    !Number.isFinite(Date.parse(at)) ||
    Date.parse(at) > Date.now() ||
    attempt.requestSha256 !== canonicalSha256({ planSha256: plan.planSha256, effect }) ||
    canonicalSha256(attempt) !== canonicalSha256(checkpoint.attempts?.[effect])
  )
    throw Error('Complete service original attempt differs');
  const kinds = plan.bindings.servicesInventory.components.map((row) => row.kind);
  if (base.engine === 'terraform' && kinds.some((k) => k !== 'bgp') && !terraform)
    throw Error('Terraform service owner is unavailable');
  return kinds;
}
async function component(kind, dispatch, base, plan, effect, at, storage, values, api, runtime, signal, terraform) {
  if (kind === 'bgp') {
    if (dispatch)
      await (base.engine === 'native' ? dispatchAwsNativeBgpPower : dispatchAwsTerraformBgpPower)(
        base,
        plan,
        plan.planSha256,
        effect,
        storage,
        values,
        api,
        runtime,
        signal,
      );
    return (base.engine === 'native' ? reconcileAwsNativeBgpPower : reconcileAwsTerraformBgpPower)(
      base,
      plan,
      effect,
      at,
      storage,
      values,
      api,
      runtime,
      signal,
    );
  }
  if (base.engine === 'native') {
    const submit =
      kind === 'nlb'
        ? dispatchAwsNativeNlbMembership
        : kind === 'direct'
          ? dispatchAwsNativeDirectRoutes
          : dispatchAwsNativeStaticTgwRoutes;
    const reconcile =
      kind === 'nlb'
        ? reconcileAwsNativeNlbMembership
        : kind === 'direct'
          ? reconcileAwsNativeDirectRoutes
          : reconcileAwsNativeStaticTgwRoutes;
    if (dispatch) await submit(base, plan, plan.planSha256, effect, storage, values, api, signal);
    return reconcile(base, plan, effect, at, storage, values, api, signal);
  }
  if (!terraform) throw Error('Terraform component owner is unavailable');
  const submit =
    kind === 'nlb'
      ? dispatchAwsTerraformNlbMembership
      : kind === 'direct'
        ? dispatchAwsTerraformDirectRoutes
        : dispatchAwsTerraformStaticTgwRoutes;
  const reconcile =
    kind === 'nlb'
      ? reconcileAwsTerraformNlbMembership
      : kind === 'direct'
        ? reconcileAwsTerraformDirectRoutes
        : reconcileAwsTerraformStaticTgwRoutes;
  if (dispatch) await submit(base, plan, plan.planSha256, effect, storage, values, api, terraform, signal);
  return reconcile(base, plan, effect, at, storage, values, api, terraform, signal);
}
async function reconcileAwsPowerServices(base, plan, effect, at, storage, values, api, runtime, signal, terraform) {
  const kinds = await components(base, plan, effect, at, storage, terraform);
  const statuses = [];
  for (const kind of kinds)
    statuses.push(
      await component(kind, false, base, plan, effect, at, storage, values, api, runtime, signal, terraform),
    );
  return statuses.every((s) => s === 'completed')
    ? 'completed'
    : statuses.every((s) => s === 'not-submitted')
      ? 'not-submitted'
      : 'pending';
}
async function continueAwsPowerServices(base, plan, effect, at, storage, values, api, runtime, signal, terraform) {
  const release = await acquireProcessLock(`${storage.directory}/.power-service-continuation-lock`);
  try {
    const kinds = await components(base, plan, effect, at, storage, terraform);
    for (const kind of kinds) {
      signal?.throwIfAborted();
      let status = await component(
        kind,
        false,
        base,
        plan,
        effect,
        at,
        storage,
        values,
        api,
        runtime,
        signal,
        terraform,
      );
      if (status === 'not-submitted')
        status = await component(kind, true, base, plan, effect, at, storage, values, api, runtime, signal, terraform);
      if (status !== 'completed') return 'pending';
    }
    return 'completed';
  } finally {
    await release();
  }
}

// plugins/aws/src/ce/whole-site-power-driver.ts
function createAwsWholeSitePowerDriver(base, boundPlan, values, storage, api, runtime, terraform) {
  verifyAwsWholeSitePowerPlan(base, boundPlan);
  const inventory = boundPlan.bindings.servicesInventory;
  if (!inventory) throw Error('Owning power driver requires complete service inventory');
  if (base.engine === 'terraform' && !terraform) throw Error('Terraform power owner unavailable');
  const bgp = inventory.components.find((row) => row.kind === 'bgp');
  const retained = bgp ? bgp.services.platform : undefined;
  const assertPlan = (plan) => {
    verifyAwsWholeSitePowerPlan(base, plan);
    if (canonicalSha256(plan) !== canonicalSha256(boundPlan)) throw Error('Owning power driver plan differs');
  };
  const observe = (plan, gate, signal) => {
    assertPlan(plan);
    return collectAwsWholeSitePowerEvidence(base, plan, gate, values, api, runtime, signal, retained, storage);
  };
  const attempt = async (plan, effect) => {
    const checkpoint = await storage.read(`${plan.planId}-checkpoint.json`);
    if (checkpoint.pending?.effect !== effect) throw Error('Owning power driver original attempt missing');
    return checkpoint.pending.originalAttemptAt;
  };
  const restored = async (plan, signal) => {
    const evidence = await observe(plan, 'restored', signal);
    await storage.write(`${plan.planId}-restored-last-evidence.json`, evidence);
    if (!evidencePasses(plan, 'restored', evidence, Date.now())) throw Error('Current restored power gate unavailable');
  };
  const releasePolicy = async (plan, signal) => {
    if (!bgp) return 'completed';
    await restored(plan, signal);
    return (base.engine === 'native' ? retireAwsNativeBgpPowerPolicy : retireAwsTerraformBgpPowerPolicy)(
      base,
      plan,
      plan.planSha256,
      storage,
      values,
      api,
      runtime,
      signal,
    );
  };
  return {
    engine: base.engine,
    readBindings: async (signal) =>
      (await collectAwsPowerBindings(base, values, api, runtime, signal, retained)).bindings,
    observe,
    execute: async (plan, effect, signal) => {
      assertPlan(plan);
      const gate =
        effect === 'withdraw'
          ? 'ready-to-stop'
          : effect === 'restore'
            ? 'running'
            : effect === 'stop'
              ? 'withdrawn'
              : effect === 'start'
                ? 'ready-to-start'
                : 'restored';
      const prerequisite = await observe(plan, gate, signal);
      if (!evidencePasses(plan, gate, prerequisite, Date.now()))
        throw Error(`Owning driver current ${gate} prerequisite unavailable`);
      if (effect === 'withdraw' || effect === 'restore') {
        await continueAwsPowerServices(
          base,
          plan,
          effect,
          await attempt(plan, effect),
          storage,
          values,
          api,
          runtime,
          signal,
          terraform,
        );
      } else if (effect === 'release') {
        if ((await releasePolicy(plan, signal)) !== 'completed') return;
        if (base.engine === 'terraform' && terraform)
          await dispatchAwsTerraformPowerState(
            base,
            plan,
            plan.planSha256,
            effect,
            storage,
            terraform,
            api,
            runtime,
            signal,
          );
        else await restored(plan, signal);
      } else if (base.engine === 'terraform' && terraform)
        await dispatchAwsTerraformPowerState(
          base,
          plan,
          plan.planSha256,
          effect,
          storage,
          terraform,
          api,
          runtime,
          signal,
        );
      else await dispatchAwsNativePowerState(base, plan, plan.planSha256, effect, storage, api, runtime, signal);
    },
    reconcile: async (plan, effect, at, signal) => {
      assertPlan(plan);
      if ((await attempt(plan, effect)) !== at) throw Error('Owning driver original attempt differs');
      if (effect === 'withdraw' || effect === 'restore') {
        const status = await reconcileAwsPowerServices(
          base,
          plan,
          effect,
          at,
          storage,
          values,
          api,
          runtime,
          signal,
          terraform,
        );
        if (status !== 'pending') return status;
        const current = await observe(plan, effect === 'withdraw' ? 'ready-to-stop' : 'running', signal);
        if (
          current.identity !== 'verified' ||
          current.cloud !== 'running' ||
          current.registration !== 'healthy' ||
          current.configuration !== 'verified' ||
          current.versions !== 'stable' ||
          current.interfaces !== 'up' ||
          !current.canSatisfyInterfaceMutationGate
        )
          return 'pending';
        return continueAwsPowerServices(base, plan, effect, at, storage, values, api, runtime, signal, terraform);
      }
      if (effect === 'release') {
        if ((await releasePolicy(plan, signal)) !== 'completed') return 'pending';
        if (base.engine === 'native') {
          await restored(plan, signal);
          return 'completed';
        }
      }
      if (base.engine === 'terraform' && terraform)
        return reconcileAwsTerraformPowerState(base, plan, effect, at, storage, terraform, api, runtime, signal);
      if (effect === 'release') throw Error('Power release owner unavailable');
      return reconcileAwsNativePowerState(base, plan, effect, at, storage, api, runtime, signal);
    },
    finish: async (plan, signal) => {
      assertPlan(plan);
      await restored(plan, signal);
      const current = await collectAwsPowerBindings(base, values, api, runtime, signal, retained);
      if (canonicalSha256(current.bindings) !== plan.bindingsSha256 || current.status !== 'active')
        throw Error('Final owning power bindings changed');
      if (base.engine === 'terraform') {
        const complete = await storage.read(`${plan.planId}-release-terraform-complete.json`);
        if (
          complete.marker?.planSha256 !== plan.planSha256 ||
          complete.marker?.bindingsSha256 !== plan.bindingsSha256 ||
          complete.receipt?.noChanges !== true
        )
          throw Error('Final Terraform release verification missing');
      }
      return { engine: base.engine, noChanges: true };
    },
  };
}

// plugins/aws/src/tools/aws-ce-power.ts
var defaults = { platform: awsPlatformService, terraform: awsTerraformService, makeApi: makeExecApi };
function createAwsCePowerTool(pi, dependencies = defaults) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_power',
    label: 'AWS Customer Edge Power',
    description:
      'Prepare an immutable owning-engine whole-site stop/start plan, apply its exact saved digest, or observe its gates. Missing interface freshness or traffic proof remains pending. Single-node lifecycle only.',
    parameters: Type.Object({
      operation: Type.Union(['prepare-stop', 'prepare-start', 'apply', 'status'].map((value) => Type.Literal(value))),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
      powerPlanId: Type.Optional(Type.String()),
      powerPlanSha256: Type.Optional(Type.String()),
      stopPlanId: Type.Optional(Type.String()),
      stopPlanSha256: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        const allowed = [
          'operation',
          'basePlanId',
          'basePlanSha256',
          ...(params.operation === 'prepare-start' ? ['stopPlanId', 'stopPlanSha256'] : []),
          ...(['apply', 'status'].includes(params.operation) ? ['powerPlanId', 'powerPlanSha256'] : []),
        ];
        if (
          !['prepare-stop', 'prepare-start', 'apply', 'status'].includes(params.operation) ||
          Object.keys(params).some((key) => !allowed.includes(key))
        )
          throw Error('AWS power parameters differ');
        const { plan: base } = await loadAwsPlan(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        if (base.intent.operation !== 'deploy' || base.topology.nodeCount !== 1)
          throw Error('AWS power requires original single-node deployment; multi-node lifecycle unqualified');
        const platform = await dependencies.platform(pi, signal);
        const owner = {
          deploymentId: base.deploymentName,
          engine: base.engine,
          provider: 'aws',
          account: base.accountId,
          region: base.region,
        };
        const storage = await platform.storage(owner);
        const executeActive = async () => {
          if (base.engine === 'terraform') await assertAwsTerraformDeploymentActive(storage);
          const runtime = await platform.runtime(base.engine, base.intent.platformContext);
          const api = dependencies.makeApi(ctx.cwd);
          await storage.verify();
          const terraform = base.engine === 'terraform' ? await dependencies.terraform(pi, signal) : undefined;
          let values;
          if (terraform) {
            const workflow = await readAwsTerraformWorkflowStatus(base, storage);
            if (
              workflow.progress.state !== 'registered' ||
              workflow.routing?.state === 'partial' ||
              (base.intent.routing.profile === 'tgw-connect' && !workflow.routing)
            )
              throw Error('Current Terraform registered routing execution bindings unavailable');
            const session = await terraform.open(owner, await awsTerraformFoundationDeployment(base), 'current');
            const instances = await readAwsTerraformInstanceBindings(base, session, process.env, signal);
            const outputs = await session.readOutputs(
              [
                'ce_vpc_id',
                'ce_interfaces',
                'ce_instances',
                ...(base.intent.ingress?.mode === 'nlb' ? ['ce_ingress'] : []),
                ...(base.intent.routing.profile === 'tgw-static'
                  ? ['ce_transport_attachment', 'ce_static_route_tables']
                  : []),
              ],
              process.env,
              signal,
            );
            const discovered = await discoverAwsTerraformInterfaces(base, outputs, api, signal);
            for (const [key, value] of Object.entries(discovered.bindings)) {
              const retained = workflow.routing?.resolvedValues[key];
              if (retained !== undefined && retained !== value)
                throw Error('Current Terraform interfaces differ from retained routing bindings');
            }
            const currentInstances = outputs.ce_instances;
            for (let node = 1; node <= base.topology.nodeCount; node++)
              if (currentInstances[String(node)]?.id !== instances[`__INSTANCE_${node}__`])
                throw Error('Current Terraform instance identity changed during power binding collection');
            values = {
              ...workflow.routing?.resolvedValues,
              ...discovered.bindings,
              ...instances,
              ...bindTerraformIngress(base, outputs),
              ...(base.intent.routing.profile === 'tgw-static' ? bindTerraformStaticRouting(base, outputs) : {}),
            };
          } else {
            const checkpoint = await loadAwsCheckpoint(ctx.sessionManager, base.planId, base.planSha256);
            if (!checkpoint || checkpoint.engine !== base.engine || checkpoint.state !== 'complete')
              throw Error('Exact completed native execution bindings unavailable');
            values = checkpoint.resolvedValues;
          }
          const loadPower = async (id, digest) => {
            if (!id || !digest || !/^[a-f0-9]{64}$/.test(digest) || id !== `aws-ce-power-${digest.slice(0, 24)}`)
              throw Error('Exact saved power plan ID and digest required');
            const power = await storage.read(`${id}.json`);
            verifyAwsWholeSitePowerPlan(base, power);
            if (power.planId !== id || power.planSha256 !== digest) throw Error('Saved power identity differs');
            return power;
          };
          let power;
          if (params.operation === 'prepare-stop') {
            const current = await collectAwsPowerBindings(base, values, api, runtime, signal);
            power = buildAwsWholeSitePowerPlan(base, 'stop', current.bindings, randomUUID());
            await storage.write(`${power.planId}.json`, power);
          } else if (params.operation === 'prepare-start') {
            const stop = await loadPower(params.stopPlanId, params.stopPlanSha256);
            if (stop.operation !== 'stop') throw Error('Stopped maintenance plan required');
            const maintenance = await storage.read(`${stop.planId}-maintenance.json`);
            const bgp = stop.bindings.servicesInventory?.components.find((row) => row.kind === 'bgp');
            const retained = bgp ? bgp.services.platform : undefined;
            const current = await collectAwsPowerBindings(base, values, api, runtime, signal, retained);
            if (
              current.cloud !== 'stopped' ||
              current.status !== 'withdrawn' ||
              canonicalSha256(current.bindings) !== stop.bindingsSha256
            )
              throw Error('Current stopped identities or service withdrawal unavailable');
            power = buildAwsWholeSitePowerPlan(base, 'start', stop.bindings, stop.transitionId, maintenance);
            const existing = await storage.read(`${power.planId}.json`).catch((error) => {
              if (error.code !== 'ENOENT') throw error;
            });
            if (existing && canonicalSha256(existing) !== canonicalSha256(power))
              throw Error('Saved power plan differs');
            if (!existing) await storage.write(`${power.planId}.json`, power);
          } else power = await loadPower(params.powerPlanId, params.powerPlanSha256);
          const driver = createAwsWholeSitePowerDriver(base, power, values, storage, api, runtime, terraform);
          let result;
          if (params.operation === 'apply')
            result = await runAwsWholeSitePower(base, power, power.planSha256, storage, driver, signal);
          else if (params.operation === 'status')
            result = await driver.observe(power, power.operation === 'stop' ? 'stopped' : 'restored', signal);
          else {
            const artifactId = await ctx.sessionManager.saveArtifact(
              JSON.stringify({
                kind: power.kind,
                engine: power.engine,
                operation: power.operation,
                planId: power.planId,
                planSha256: power.planSha256,
                fullCeAcceptance: false,
              }),
              'aws-ce-power',
            );
            if (!artifactId) throw Error('Power plan reference persistence failed');
            result = {
              operation: power.operation,
              engine: power.engine,
              planId: power.planId,
              planSha256: power.planSha256,
              artifactId,
              fullCeAcceptance: false,
            };
          }
          return {
            content: [
              {
                type: 'text',
                text: `AWS CE power ${params.operation}: exact owning plan ${power.planId}. Qualification gates remain explicit.`,
              },
            ],
            details: { tool: 'aws_ce_power', power: result },
            isError: false,
          };
        };
        return base.engine === 'terraform'
          ? await withAwsTerraformLifecycle(storage, signal, executeActive)
          : await executeActive();
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [{ type: 'text', text: error.message }],
          isError: true,
          details: { tool: 'aws_ce_power' },
        };
      }
    },
  };
}

export { createAwsCePowerTool };
