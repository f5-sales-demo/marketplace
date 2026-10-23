type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed registration observation');
  return value as Json;
};

export function registrationInstanceBindings(response: Json, siteName: string, nodes: string[], cloudIds: string[]) {
  if (!Array.isArray(response.items)) throw new Error('Missing registration observation');
  const result: Record<string, string> = {};
  for (const value of response.items) {
    const spec = object(object(value).get_spec);
    const infra = object(spec.infra);
    if (
      object(spec.passport).cluster_name !== siteName ||
      !nodes.includes(String(infra.hostname)) ||
      !cloudIds.includes(String(infra.instance_id))
    )
      continue;
    const node = String(infra.hostname);
    if (result[node] || Object.values(result).includes(String(infra.instance_id)))
      throw new Error('Ambiguous registration/cloud join');
    result[node] = String(infra.instance_id);
  }
  return result;
}

/** Used by both ownership-gated admission and read-only inventory; only measured joins count. */
export function parseRegistrationObservation(
  response: Json,
  siteName: string,
  nodes: string[],
  clusterSize: number,
  expectedInstances: Record<string, string>,
) {
  if (
    !Array.isArray(response.items) ||
    response.next_page_token ||
    response.continue ||
    (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length))
  )
    return { status: 'unknown', reason: 'registration-list-incomplete' };
  const observations = nodes.map((node) => {
    const matches = (response.items as unknown[]).map(object).filter((item) => {
      const spec = object(item.get_spec);
      const state = object(object(item.object).status).current_state;
      return (
        object(spec.passport).cluster_name === siteName &&
        object(spec.infra).hostname === node &&
        !['RETIRED', 'FAILED', 'DONE', 'FAILED_INACTIVE'].includes(String(state))
      );
    });
    if (matches.length !== 1)
      return { node, status: 'unknown', reason: matches.length ? 'ambiguous-registration' : 'registration-not-found' };
    const item = matches[0],
      spec = object(item.get_spec),
      infra = object(spec.infra);
    const state = object(object(item.object).status).current_state;
    if (
      !expectedInstances[node] ||
      infra.instance_id !== expectedInstances[node] ||
      typeof item.name !== 'string' ||
      !/^r-[a-z0-9-]+$/.test(item.name) ||
      typeof state !== 'string' ||
      !['NOTSET', 'NEW', 'APPROVED', 'ADMITTED', 'PENDING', 'ONLINE', 'UPGRADING', 'MAINTENANCE'].includes(state) ||
      (state !== 'NEW' && object(spec.passport).cluster_size !== clusterSize)
    )
      return { node, status: 'unknown', reason: 'registration-resource-binding-incomplete' };
    return {
      node,
      registration: item.name,
      instanceId: infra.instance_id,
      state,
      status: state === 'ONLINE' ? 'healthy' : 'degraded',
    };
  });
  return {
    nodes: observations,
    status: observations.every((node) => node.status === 'healthy')
      ? 'healthy'
      : observations.some((node) => node.status === 'unknown')
        ? 'unknown'
        : 'degraded',
  };
}
