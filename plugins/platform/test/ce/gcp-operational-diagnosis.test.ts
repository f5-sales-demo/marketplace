import { expect, it } from 'bun:test';
import {
  GCP_REQUIRED_OPERATIONAL_DOMAINS,
  projectGcpOperationalDiagnosis,
} from '../../src/ce/gcp-operational-diagnosis';

const nodes = ['a', 'b', 'c'].map((suffix, i) => ({
  nodeName: `node-${suffix}`,
  instanceId: String(i + 1),
  sloAddress: `192.0.2.${i + 1}`,
}));
function fixture() {
  return {
    responses: Object.fromEntries(
      nodes.map((node) => [
        node.nodeName,
        {
          node_name: node.nodeName,
          nodes_connectivity: nodes
            .filter((peer) => peer !== node)
            .map((peer) => ({ dest_ip: peer.sloAddress, sent: 5, received: 5 })),
          dns_query_result: GCP_REQUIRED_OPERATIONAL_DOMAINS.map(
            (domain) =>
              `;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 1\n;; flags: qr; QUERY: 1, ANSWER: 1, AUTHORITY: 0\n;${domain}. IN A\n`,
          ),
          domain_curl_result: Object.fromEntries(
            GCP_REQUIRED_OPERATIONAL_DOMAINS.map((domain) => [`https://${domain}`, 'OK']),
          ),
          registration_status: 'OK',
          ntp_sync_status: 'System clock synchronized: yes\n NTP service: active',
          gateway_connectivity: { lost: 100 },
          private: 'PRIVATE',
        },
      ]),
    ),
  };
}
it('requires exact selected-node peer and domain joins and keeps gateway loss informational', () => {
  const projection = projectGcpOperationalDiagnosis(fixture(), nodes[0], nodes);
  expect(Object.values(projection.checks)).toEqual(['pass', 'pass', 'pass']);
  expect(projection.peers).toEqual(nodes.slice(1).map(({ nodeName, instanceId }) => ({ nodeName, instanceId })));
  expect(JSON.stringify(projection)).not.toContain('PRIVATE');
  expect(JSON.stringify(projection)).not.toContain('192.0.2.');
});
it('retains packet, DNS and time failures as negative evidence', () => {
  const f = fixture();
  const row = f.responses['node-a'];
  row.nodes_connectivity[0].received = 0;
  row.dns_query_result[0] = row.dns_query_result[0].replace('NOERROR', 'SERVFAIL').replace('ANSWER: 1', 'ANSWER: 0');
  row.ntp_sync_status = 'System clock synchronized: no\n NTP service: inactive';
  expect(Object.values(projectGcpOperationalDiagnosis(f, nodes[0], nodes).checks)).toEqual(['fail', 'fail', 'fail']);
});
it('rejects foreign peers, missing domains, duplicate queries, malformed packet counts and unqualified states', () => {
  for (const change of [
    (r: ReturnType<typeof fixture>['responses'][string]) => {
      r.nodes_connectivity[0].dest_ip = '192.0.2.99';
    },
    (r: ReturnType<typeof fixture>['responses'][string]) => {
      r.nodes_connectivity[0].sent = -1;
    },
    (r: ReturnType<typeof fixture>['responses'][string]) => {
      r.dns_query_result.pop();
    },
    (r: ReturnType<typeof fixture>['responses'][string]) => {
      r.dns_query_result[1] = r.dns_query_result[0];
    },
    (r: ReturnType<typeof fixture>['responses'][string]) => {
      r.domain_curl_result['https://downloads.volterra.io'] = 'unqualified';
    },
    (r: ReturnType<typeof fixture>['responses'][string]) => {
      r.node_name = 'foreign';
    },
  ]) {
    const f = fixture();
    change(f.responses['node-a']);
    expect(() => projectGcpOperationalDiagnosis(f, nodes[0], nodes)).toThrow();
  }
});
