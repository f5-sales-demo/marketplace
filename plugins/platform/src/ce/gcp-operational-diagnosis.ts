export const GCP_DIAGNOSIS_PARSER_VERSION = 'site-cli-diagnosis/v1';
export const GCP_REQUIRED_OPERATIONAL_DOMAINS = [
  'api.bcti.brightcloud.com',
  'downloads.volterra.io',
  'identityauthority.ves.volterra.io',
  'myip.volterra.io',
  'register.ves.volterra.io',
] as const;
type DiagnosticNode = { nodeName: string; instanceId: string; sloAddress: string };
const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
/** Parse one node-bound command's own row; aggregate rows cannot substitute for the selected original. */
export function projectGcpOperationalDiagnosis(value: unknown, node: DiagnosticNode, originals: DiagnosticNode[]) {
  if (
    originals.length !== 3 ||
    originals.some(
      (n) =>
        !/^[a-z][a-z0-9-]{0,62}$/.test(n.nodeName) ||
        !/^\d+$/.test(n.instanceId) ||
        !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(n.sloAddress),
    ) ||
    ['nodeName', 'instanceId', 'sloAddress'].some(
      (key) => new Set(originals.map((n) => n[key as keyof DiagnosticNode])).size !== 3,
    ) ||
    originals.filter(
      (n) => n.nodeName === node.nodeName && n.instanceId === node.instanceId && n.sloAddress === node.sloAddress,
    ).length !== 1
  )
    throw new Error('Original diagnostic joins required');
  const response = object(value);
  const responses = object(response?.responses);
  if (
    !responses ||
    Object.keys(responses).sort().join(',') !==
      originals
        .map((n) => n.nodeName)
        .sort()
        .join(',')
  )
    throw new Error('Diagnostic node set differs');
  const row = object(responses[node.nodeName]);
  if (!row || row.node_name !== node.nodeName) throw new Error('Diagnostic selected node differs');
  const peers = originals.filter((n) => n.nodeName !== node.nodeName);
  const connectivity = Array.isArray(row.nodes_connectivity) ? row.nodes_connectivity.map(object) : [];
  if (
    connectivity.length !== 2 ||
    connectivity.some((r) => !r || !peers.some((n) => n.sloAddress === r.dest_ip)) ||
    new Set(connectivity.map((r) => r?.dest_ip)).size !== 2
  )
    throw new Error('Diagnostic peer join differs');
  const packetStates = connectivity.map((r) => {
    if (
      !Number.isSafeInteger(r?.sent) ||
      !Number.isSafeInteger(r?.received) ||
      Number(r?.sent) <= 0 ||
      Number(r?.received) < 0 ||
      Number(r?.received) > Number(r?.sent)
    )
      throw new Error('Diagnostic packet counts malformed');
    return r?.sent === r?.received ? 'pass' : 'fail';
  });
  const domains = object(row.domain_curl_result);
  const urls = GCP_REQUIRED_OPERATIONAL_DOMAINS.map((domain) => `https://${domain}`);
  if (!domains || Object.keys(domains).sort().join(',') !== urls.sort().join(','))
    throw new Error('Diagnostic required domains differ');
  const dns = Array.isArray(row.dns_query_result) ? row.dns_query_result : [];
  const dnsStates = new Map<string, 'pass' | 'fail'>();
  for (const query of dns) {
    if (typeof query !== 'string') throw new Error('Diagnostic DNS query malformed');
    const questions = [...query.matchAll(/^;([a-z0-9.-]+)\.\s+IN\s+A\s*$/gm)];
    const statuses = [...query.matchAll(/^;; ->>HEADER<<- opcode: QUERY, status: ([A-Z]+), id: \d+\s*$/gm)];
    if (
      questions.length !== 1 ||
      statuses.length !== 1 ||
      !(GCP_REQUIRED_OPERATIONAL_DOMAINS as readonly string[]).includes(questions[0][1]) ||
      dnsStates.has(questions[0][1])
    )
      throw new Error('Diagnostic DNS join malformed');
    const state = statuses[0][1];
    if (!['NOERROR', 'NXDOMAIN', 'SERVFAIL', 'REFUSED'].includes(state))
      throw new Error('Diagnostic DNS state unqualified');
    const answerCount = query.match(/QUERY: 1, ANSWER: (\d+),/);
    if (!answerCount) throw new Error('Diagnostic DNS answer count unavailable');
    dnsStates.set(questions[0][1], state === 'NOERROR' && Number(answerCount[1]) > 0 ? 'pass' : 'fail');
  }
  if (dnsStates.size !== GCP_REQUIRED_OPERATIONAL_DOMAINS.length) throw new Error('Diagnostic DNS coverage missing');
  const curl = Object.values(domains);
  if (curl.some((state) => state !== 'OK')) throw new Error('Diagnostic domain state requires qualification');
  if (row.registration_status !== 'OK') throw new Error('Diagnostic registration state requires qualification');
  if (
    typeof row.ntp_sync_status !== 'string' ||
    !/^System clock synchronized: (yes|no)$/m.test(row.ntp_sync_status) ||
    !/^\s*NTP service: (active|inactive)$/m.test(row.ntp_sync_status)
  )
    throw new Error('Diagnostic time synchronization malformed');
  return {
    peers: peers.map(({ nodeName, instanceId }) => ({ nodeName, instanceId })),
    checks: {
      'peer-connectivity': packetStates.every((s) => s === 'pass') ? 'pass' : 'fail',
      'required-domains': [...dnsStates.values()].every((s) => s === 'pass') ? 'pass' : 'fail',
      'time-synchronization':
        /^System clock synchronized: yes$/m.test(row.ntp_sync_status) &&
        /^\s*NTP service: active$/m.test(row.ntp_sync_status)
          ? 'pass'
          : 'fail',
    },
  };
}
