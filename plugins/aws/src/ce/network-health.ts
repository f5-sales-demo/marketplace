import { isIP } from 'node:net';
import type { AwsExecApi } from '../aws/exec';
import type { AwsCeCheckpoint, AwsCePlan } from './types';

type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed network evidence');
  return value as Json;
}
async function read(api: AwsExecApi, args: string[], region: string): Promise<Json> {
  const result = await api.exec('aws', [...args, '--region', region, '--output', 'json']);
  if (result.exitCode !== 0) throw new Error('Network observation unavailable');
  const raw = object(JSON.parse(result.stdout));
  if (raw.NextToken || raw.NextMarker) throw new Error('Incomplete network evidence');
  return raw;
}
function owned(value: unknown, plan: AwsCePlan): boolean {
  if (!Array.isArray(value)) return false;
  const tags = new Map<string, string>();
  for (const item of value) {
    const tag = object(item);
    if (typeof tag.Key !== 'string' || typeof tag.Value !== 'string' || tags.has(tag.Key)) return false;
    tags.set(tag.Key, tag.Value);
  }
  return (
    tags.get('xcsh-managed-by') === 'aws-ce' &&
    tags.get('xcsh-deployment-id') === plan.deploymentName &&
    tags.get('xcsh-execution-engine') === plan.engine
  );
}
export async function collectAwsNetworkHealth(
  kind: 'bgp' | 'nlb' | 'routes',
  plan: AwsCePlan,
  checkpoint: AwsCeCheckpoint | undefined,
  api: AwsExecApi,
  signal?: AbortSignal,
): Promise<Json> {
  const binding = {
    deploymentId: plan.deploymentName,
    siteName: plan.siteName,
    engine: plan.engine,
    accountId: plan.accountId,
    region: plan.region,
    observedAt: new Date().toISOString(),
    source: 'aws-cli-live',
  };
  try {
    signal?.throwIfAborted();
    const identity = await read(api, ['sts', 'get-caller-identity'], plan.region);
    if (identity.Account !== plan.accountId) throw new Error('Network observation account differs');
    const values = checkpoint?.resolvedValues ?? {};
    if (kind === 'bgp') {
      if (!Number.isInteger(plan.routing.customerAsn) || !Number.isInteger(plan.routing.transitGatewayAsn))
        throw new Error('Missing expected ASNs');
      const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
      const ids = actions.map((action) => values[action.capture?.placeholder ?? '']);
      if (
        !ids.length ||
        ids.some((id) => !/^tgw-connect-peer-[0-9a-f]{8,21}$/.test(id ?? '')) ||
        new Set(ids).size !== ids.length
      )
        throw new Error('Missing peer identities');
      const raw = await read(
        api,
        ['ec2', 'describe-transit-gateway-connect-peers', '--transit-gateway-connect-peer-ids', ...ids],
        plan.region,
      );
      if (!Array.isArray(raw.TransitGatewayConnectPeers) || raw.TransitGatewayConnectPeers.length !== ids.length)
        throw new Error('Missing peer evidence');
      const seen = new Set<string>();
      const sessions = [];
      const transports = [];
      let available = true;
      for (const value of raw.TransitGatewayConnectPeers) {
        const peer = object(value);
        const id = String(peer.TransitGatewayConnectPeerId);
        const action = actions[ids.indexOf(id)];
        const attachmentArgument = action?.args?.includes('--transit-gateway-attachment-id')
          ? action.args[action.args.indexOf('--transit-gateway-attachment-id') + 1]
          : undefined;
        const expectedAttachment = attachmentArgument?.startsWith('__')
          ? values[attachmentArgument]
          : (attachmentArgument ?? values.__TGW_CONNECT_ATTACHMENT__);

        if (
          !ids.includes(id) ||
          seen.has(id) ||
          !owned(peer.Tags, plan) ||
          peer.TransitGatewayAttachmentId !== expectedAttachment
        )
          throw new Error('Foreign peer evidence');
        seen.add(id);
        const config = object(peer.ConnectPeerConfiguration);
        const transportIndex = action.args?.indexOf('--peer-address') ?? -1;
        const transportArgument = transportIndex >= 0 ? action.args?.[transportIndex + 1] : undefined;
        const transportAddress = transportArgument?.startsWith('__') ? values[transportArgument] : transportArgument;
        const expectedGatewayAddress = action.args?.includes('--transit-gateway-address')
          ? action.args[action.args.indexOf('--transit-gateway-address') + 1]
          : undefined;
        if (
          config.PeerAddress !== (transportAddress ?? values[`__NODE_${action.node}_SLI_IP__`]) ||
          (expectedGatewayAddress !== undefined && config.TransitGatewayAddress !== expectedGatewayAddress) ||
          config.Protocol !== 'gre' ||
          !Array.isArray(config.BgpConfigurations) ||
          config.BgpConfigurations.length !== 2
        )
          throw new Error('Peer topology differs');
        if (
          isIP(String(config.TransitGatewayAddress)) !== 4 ||
          !Array.isArray(config.InsideCidrBlocks) ||
          config.InsideCidrBlocks.length !== 1 ||
          typeof config.InsideCidrBlocks[0] !== 'string'
        )
          throw new Error('Missing GRE endpoint facts');
        const cidrIndex = action.args?.indexOf('--inside-cidr-blocks') ?? -1;
        const plannedCidr = cidrIndex >= 0 ? action.args?.[cidrIndex + 1] : undefined;
        const [insideAddress, insidePrefix] = String(config.InsideCidrBlocks[0]).split('/');
        const ipv4 = (address: string) => address.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
        if (
          config.InsideCidrBlocks[0] !== plannedCidr ||
          isIP(insideAddress) !== 4 ||
          insidePrefix !== '29' ||
          ipv4(insideAddress) % 8 !== 0
        )
          throw new Error('GRE inside CIDR differs from plan');
        const insideNetwork = ipv4(insideAddress);
        let ceEndpoint: string | undefined;
        transports.push({
          peerId: id,
          awsGreAddress: config.TransitGatewayAddress,
          ceGreAddress: config.PeerAddress,
          insideCidr: config.InsideCidrBlocks[0],
        });
        available &&= peer.State === 'available';
        const addresses = new Set<string>();
        for (const item of config.BgpConfigurations) {
          const session = object(item);
          const endpoint = String(session.TransitGatewayAddress);
          if (
            isIP(endpoint) !== 4 ||
            isIP(String(session.PeerAddress)) !== 4 ||
            addresses.has(endpoint) ||
            session.TransitGatewayAsn !== plan.routing.transitGatewayAsn ||
            session.PeerAsn !== plan.routing.customerAsn ||
            !['up', 'down'].includes(String(session.BgpStatus))
          )
            throw new Error('Invalid BGP session evidence');
          const local = String(session.PeerAddress);
          if (
            [endpoint, local].some((address) => ipv4(address) <= insideNetwork || ipv4(address) >= insideNetwork + 7) ||
            endpoint === local ||
            (ceEndpoint !== undefined && ceEndpoint !== local)
          )
            throw new Error('BGP endpoint is outside its planned tunnel');
          ceEndpoint = local;
          addresses.add(endpoint);
          sessions.push({
            peerId: id,
            awsEndpoint: endpoint,
            ceEndpoint: session.PeerAddress,
            status: session.BgpStatus,
          });
        }
      }
      const established = sessions.filter((session) => session.status === 'up').length;
      return {
        ...binding,
        status: available && established === sessions.length ? 'healthy' : 'degraded',
        expectedPeers: ids.length,
        expectedSessions: ids.length * 2,
        establishedSessions: established,
        sessions,
        transports,
        packetTtlEvidence: 'unknown',
        routes: 'unknown',
        traffic: 'unknown',
      };
    }
    if (kind === 'routes') {
      const expected = (actionKind: string) =>
        plan.actions
          .filter((action) => action.kind === actionKind)
          .map((action) => {
            const arg = (flag: string) => {
              const index = action.args?.indexOf(flag) ?? -1;
              const value = index >= 0 ? action.args?.[index + 1] : undefined;
              return value?.startsWith('__') ? values[value] : value;
            };
            return {
              tableId: arg('--transit-gateway-route-table-id'),
              attachmentId: arg('--transit-gateway-attachment-id'),
              destination: arg('--destination-cidr-block'),
            };
          });
      const associations = expected('tgw-associate');
      const propagations = expected('tgw-propagate');
      const routes = expected('tgw-route-create');
      const pairs = [...associations, ...propagations, ...routes];
      if (
        !pairs.length ||
        pairs.some(
          ({ tableId, attachmentId }) =>
            !/^tgw-rtb-[0-9a-f]{8,21}$/.test(tableId ?? '') || !/^tgw-attach-[0-9a-f]{8,21}$/.test(attachmentId ?? ''),
        ) ||
        routes.some(
          ({ destination }) => !destination || (isIP(destination.split('/')[0]) === 0 && destination !== '0.0.0.0/0'),
        )
      )
        throw new Error('Missing planned TGW route identities');
      const tableIds = [...new Set(pairs.map(({ tableId }) => tableId as string))].sort();
      const observedAssociations: Array<{ tableId: string; attachmentId: string; state: string }> = [];
      const observedPropagations: Array<{ tableId: string; attachmentId: string; state: string }> = [];
      for (const tableId of tableIds) {
        const associationRows = await read(
          api,
          ['ec2', 'get-transit-gateway-route-table-associations', '--transit-gateway-route-table-id', tableId],
          plan.region,
        );
        if (!Array.isArray(associationRows.Associations)) throw new Error('Missing TGW association evidence');
        for (const item of associationRows.Associations) {
          const row = object(item);
          if (
            typeof row.TransitGatewayAttachmentId !== 'string' ||
            typeof row.State !== 'string' ||
            !['associating', 'associated', 'disassociating', 'disassociated'].includes(row.State)
          )
            throw new Error('Invalid TGW association evidence');
          observedAssociations.push({
            tableId,
            attachmentId: row.TransitGatewayAttachmentId,
            state: row.State,
          });
        }
        const propagationRows = await read(
          api,
          ['ec2', 'get-transit-gateway-route-table-propagations', '--transit-gateway-route-table-id', tableId],
          plan.region,
        );
        if (!Array.isArray(propagationRows.TransitGatewayRouteTablePropagations))
          throw new Error('Missing TGW propagation evidence');
        for (const item of propagationRows.TransitGatewayRouteTablePropagations) {
          const row = object(item);
          if (
            typeof row.TransitGatewayAttachmentId !== 'string' ||
            typeof row.State !== 'string' ||
            !['enabling', 'enabled', 'disabling', 'disabled'].includes(row.State)
          )
            throw new Error('Invalid TGW propagation evidence');
          observedPropagations.push({
            tableId,
            attachmentId: row.TransitGatewayAttachmentId,
            state: row.State,
          });
        }
      }
      const observedRoutes: Array<{
        tableId: string;
        destination: string;
        attachmentId: string;
        state: string;
        type: string;
      }> = [];
      for (const route of routes) {
        const raw = await read(
          api,
          [
            'ec2',
            'search-transit-gateway-routes',
            '--transit-gateway-route-table-id',
            route.tableId as string,
            '--filters',
            `Name=route-search.exact-match,Values=${route.destination}`,
          ],
          plan.region,
        );
        if (raw.AdditionalRoutesAvailable !== false || !Array.isArray(raw.Routes) || raw.Routes.length !== 1)
          throw new Error('Incomplete TGW route evidence');
        const row = object(raw.Routes[0]);
        if (!Array.isArray(row.TransitGatewayAttachments) || row.TransitGatewayAttachments.length !== 1)
          throw new Error('Ambiguous TGW route attachment evidence');
        const attachment = object(row.TransitGatewayAttachments[0]);
        if (
          row.DestinationCidrBlock !== route.destination ||
          typeof row.State !== 'string' ||
          typeof row.Type !== 'string' ||
          attachment.TransitGatewayAttachmentId !== route.attachmentId
        )
          throw new Error('TGW route differs from plan');
        observedRoutes.push({
          tableId: route.tableId as string,
          destination: route.destination as string,
          attachmentId: route.attachmentId as string,
          state: row.State,
          type: row.Type,
        });
      }
      const pair = (
        rows: Array<{ tableId: string; attachmentId: string; state: string }>,
        tableId?: string,
        attachmentId?: string,
      ) => rows.filter((row) => row.tableId === tableId && row.attachmentId === attachmentId);
      const healthy =
        associations.every(
          ({ tableId, attachmentId }) =>
            pair(observedAssociations, tableId, attachmentId).length === 1 &&
            pair(observedAssociations, tableId, attachmentId)[0].state === 'associated',
        ) &&
        propagations.every(
          ({ tableId, attachmentId }) =>
            pair(observedPropagations, tableId, attachmentId).length === 1 &&
            pair(observedPropagations, tableId, attachmentId)[0].state === 'enabled',
        ) &&
        observedRoutes.every((route) => route.state === 'active' && route.type === 'static');
      return {
        ...binding,
        status: healthy ? 'healthy' : 'degraded',
        expectedAssociations: associations.length,
        expectedPropagations: propagations.length,
        expectedRoutes: routes.length,
        associations: observedAssociations.filter((row) =>
          associations.some(
            ({ tableId, attachmentId }) => tableId === row.tableId && attachmentId === row.attachmentId,
          ),
        ),
        propagations: observedPropagations.filter((row) =>
          propagations.some(
            ({ tableId, attachmentId }) => tableId === row.tableId && attachmentId === row.attachmentId,
          ),
        ),
        routes: observedRoutes,
        traffic: 'unknown',
      };
    }
    const arn = values.__NLB_TARGET_GROUP_ARN__;
    if (
      typeof arn !== 'string' ||
      !arn.startsWith(`arn:${plan.intent.partition}:elasticloadbalancing:${plan.region}:${plan.accountId}:targetgroup/`)
    )
      throw new Error('Missing scoped target group');
    const rawTags = await read(api, ['elbv2', 'describe-tags', '--resource-arns', arn], plan.region);
    if (!Array.isArray(rawTags.TagDescriptions) || rawTags.TagDescriptions.length !== 1)
      throw new Error('Missing target group ownership');
    const description = object(rawTags.TagDescriptions[0]);
    if (description.ResourceArn !== arn || !owned(description.Tags, plan)) throw new Error('Foreign target group');
    const expected = Array.from(
      { length: plan.topology.nodeCount },
      (_, index) => values[`__NODE_${index + 1}_SLO_IP__`],
    );
    if (expected.some((address) => isIP(address ?? '') !== 4) || new Set(expected).size !== expected.length)
      throw new Error('Missing target identities');
    const raw = await read(api, ['elbv2', 'describe-target-health', '--target-group-arn', arn], plan.region);
    if (!Array.isArray(raw.TargetHealthDescriptions) || raw.TargetHealthDescriptions.length !== expected.length)
      throw new Error('Incomplete target membership');
    const seen = new Set<string>();
    const targets = raw.TargetHealthDescriptions.map((value) => {
      const row = object(value);
      const target = object(row.Target);
      const health = object(row.TargetHealth);
      if (
        typeof target.Id !== 'string' ||
        !expected.includes(target.Id) ||
        seen.has(target.Id) ||
        target.Port !== (plan.intent.ingress?.mode === 'nlb' ? plan.intent.ingress.port : 443) ||
        !['healthy', 'initial', 'unhealthy', 'unused', 'draining', 'unavailable', 'unhealthy.draining'].includes(
          String(health.State),
        )
      )
        throw new Error('Invalid target evidence');
      seen.add(target.Id);
      return { address: target.Id, port: target.Port, state: health.State };
    });
    return {
      ...binding,
      status: targets.every((target) => target.state === 'healthy') ? 'healthy' : 'degraded',
      targetGroupArn: arn,
      targets,
      traffic: 'unknown',
    };
  } catch {
    signal?.throwIfAborted();
    return { ...binding, status: 'unknown', reason: 'network-evidence-unavailable-or-invalid' };
  }
}
