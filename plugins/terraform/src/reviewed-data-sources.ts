type Json = Record<string, unknown>;

function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Reviewed Terraform data object required');
  return value as Json;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function nonsensitive(value: unknown): boolean {
  if (value === false) return true;
  return value !== null && typeof value === 'object' && Object.values(value).every(nonsensitive);
}

function moduleResources(values: unknown): Json[] {
  const module = object(object(values).root_module ?? {});
  if (module.child_modules !== undefined && (!Array.isArray(module.child_modules) || module.child_modules.length))
    throw new Error('Nested Terraform data requires a verified mapping');
  const rows = module.resources ?? [];
  if (!Array.isArray(rows)) throw new Error('Reviewed Terraform data inventory required');
  return rows.map(object);
}

/** Detect observed data in either independent state representation. No lookup is
 * needed for ordinary managed-only or fully destroyed workspaces. */
export function hasReviewedDataSources(
  identity: unknown,
  state: unknown,
  selectedAddresses: readonly string[] = [],
): boolean {
  const selected = new Set(selectedAddresses);
  const raw = object(identity).resources;
  const rows = [
    ...(Array.isArray(raw)
      ? raw.map(object).map((row): Json => ({ ...row, address: `data.${row.type}.${row.name}` }))
      : []),
    ...moduleResources(object(state).values ?? {}),
  ].filter((row) => row.mode === 'data' && !selected.has(String(row.address)));
  if (rows.some((row) => row.type !== 'google_compute_image'))
    throw new Error('Foreign state data requires a verified read-only mapping');
  return rows.length > 0;
}

/** Terraform can retain an unchanged lookup solely in the original prior state.
 * Admit that representation only with an exact literal saved declaration, pinned
 * provider and an explicit change inventory containing no entry for the lookup. */
function priorReviewedImage(
  config: Json,
  saved: Json,
  declarations: Map<string, Json>,
  selected: Set<string>,
  address: string,
): Json {
  if (
    !Array.isArray(saved.resource_changes) ||
    saved.resource_changes.map(object).some((row) => row.address === address)
  )
    throw new Error('Exact absent data change required for prior-only lookup');
  const configuration = object(saved.configuration),
    root = object(configuration.root_module);
  if (root.module_calls !== undefined) throw new Error('Nested saved data configuration requires a verified mapping');
  const declared = moduleResources({ root_module: root }).filter(
    (row) => row.mode === 'data' && !selected.has(String(row.address)),
  );
  if (
    declared.length !== declarations.size ||
    declared.some((row) => !declarations.has(String(row.address))) ||
    new Set(declared.map((row) => row.address)).size !== declared.length
  )
    throw new Error('Saved data configuration inventory differs');
  const matches = declared.filter((row) => row.address === address);
  if (matches.length !== 1) throw new Error('Saved data declaration is missing or ambiguous');
  const row = matches[0],
    declaration = declarations.get(address);
  if (
    !declaration ||
    canonical(Object.keys(row).sort()) !==
      canonical(['address', 'expressions', 'mode', 'name', 'provider_config_key', 'schema_version', 'type']) ||
    row.type !== 'google_compute_image' ||
    row.name !== address.split('.')[2] ||
    row.schema_version !== 0 ||
    row.provider_config_key !== 'google'
  )
    throw new Error('Exact static saved image declaration required');
  const expressions = object(row.expressions);
  if (
    canonical(Object.keys(expressions).sort()) !== canonical(['name', 'project']) ||
    ['name', 'project'].some(
      (key) => canonical(object(expressions[key])) !== canonical({ constant_value: declaration[key] }),
    )
  )
    throw new Error('Saved image expression differs or is unresolved');
  const required = object(object(object(config.terraform).required_providers).google);
  const provider = object(object(configuration.provider_config).google);
  if (
    required.source !== 'hashicorp/google' ||
    typeof required.version !== 'string' ||
    !/^=\s*\d+\.\d+\.\d+$/.test(required.version) ||
    provider.name !== 'google' ||
    provider.full_name !== 'registry.terraform.io/hashicorp/google' ||
    provider.alias !== undefined ||
    provider.module_address !== undefined ||
    provider.version_constraint !== required.version.replace(/^=\s*/, '')
  )
    throw new Error('Saved image provider differs from the original exact pin');
  const prior = moduleResources(object(saved.prior_state).values).filter(
    (row) => row.mode === 'data' && !selected.has(String(row.address)),
  );
  if (prior.length !== declarations.size || prior.some((row) => !declarations.has(String(row.address))))
    throw new Error('Original prior-only data inventory differs');
  const sources = prior.filter((row) => row.address === address);
  if (sources.length !== 1) throw new Error('Original prior-only image is missing or ambiguous');
  return sources[0];
}

/** A static Google image lookup is read-only, but it is not automatically owned.
 * Verify the original declaration, saved plan and both state representations
 * before omitting it from the managed-resource projection. Never modify state. */
export function projectReviewedDataSources(
  configuration: unknown,
  plan: unknown,
  identity: unknown,
  state: unknown,
  terraformVersion: string,
  operation?: 'destroy',
  selectedAddresses: readonly string[] = [],
): Json {
  const config = object(configuration),
    saved = object(plan),
    raw = object(identity),
    rendered = object(state);
  if (
    saved.terraform_version !== terraformVersion ||
    typeof saved.format_version !== 'string' ||
    !/^1\.\d+$/.test(saved.format_version) ||
    rendered.terraform_version !== terraformVersion ||
    rendered.format_version !== '1.0' ||
    (raw.terraform_version !== undefined && raw.terraform_version !== terraformVersion)
  )
    throw new Error('Reviewed Terraform data format or version changed');
  const selected = new Set(selectedAddresses);
  const declarations = new Map<string, Json>();
  for (const [type, names] of Object.entries(object(config.data ?? {}))) {
    for (const [name, value] of Object.entries(object(names))) {
      if (selected.has(`data.${type}.${name}`)) continue;
      if (type !== 'google_compute_image')
        throw new Error('Foreign Terraform data type lacks a verified read-only mapping');
      const declaration = object(value);
      if (
        !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name) ||
        canonical(Object.keys(declaration).sort()) !== canonical(['name', 'project']) ||
        typeof declaration.project !== 'string' ||
        !/^[a-z][a-z0-9-]*[a-z0-9]$/.test(declaration.project) ||
        typeof declaration.name !== 'string' ||
        !/^[a-z][a-z0-9-]*[a-z0-9]$/.test(declaration.name)
      )
        throw new Error('Exact static Google image declaration required');
      declarations.set(`data.${type}.${name}`, declaration);
    }
  }
  const planned = moduleResources(
    operation === 'destroy' ? object(saved.prior_state).values : saved.planned_values,
  ).filter((row) => row.mode === 'data' && !selected.has(String(row.address)));
  const observed = moduleResources(rendered.values).filter(
    (row) => row.mode === 'data' && !selected.has(String(row.address)),
  );
  if (!Array.isArray(raw.resources)) throw new Error('Raw Terraform data inventory unavailable');
  const rawData = raw.resources
    .map(object)
    .filter((row) => row.mode === 'data' && !selected.has(`data.${row.type}.${row.name}`));
  if (
    !declarations.size ||
    planned.length > declarations.size ||
    planned.some((row) => !declarations.has(String(row.address))) ||
    observed.length !== declarations.size ||
    rawData.length !== declarations.size
  )
    throw new Error('Reviewed Terraform data inventories differ');
  for (const [address, declaration] of declarations) {
    const matches = (rows: Json[]) => rows.filter((row) => row.address === address);
    const planRows = matches(planned),
      stateRows = matches(observed);
    if (!planRows.length && operation !== 'destroy')
      planRows.push(priorReviewedImage(config, saved, declarations, selected, address));
    const rawRows = rawData.filter((row) => `data.${row.type}.${row.name}` === address);
    if (planRows.length !== 1 || stateRows.length !== 1 || rawRows.length !== 1)
      throw new Error('Reviewed Terraform data identity is missing or ambiguous');
    const source = rawRows[0];
    if (
      source.module !== undefined ||
      source.provider !== 'provider["registry.terraform.io/hashicorp/google"]' ||
      !Array.isArray(source.instances) ||
      source.instances.length !== 1
    )
      throw new Error('Reviewed Terraform data provider or instance differs');
    const instance = object(source.instances[0]);
    if (
      instance.schema_version !== 0 ||
      instance.index_key !== undefined ||
      instance.deposed !== undefined ||
      (instance.sensitive_attributes !== undefined &&
        (!Array.isArray(instance.sensitive_attributes) || instance.sensitive_attributes.length))
    )
      throw new Error('Reviewed raw Terraform data is ambiguous or sensitive');
    const attributes = object(instance.attributes);
    for (const row of [planRows[0], stateRows[0]]) {
      const values = object(row.values);
      if (
        row.type !== 'google_compute_image' ||
        row.name !== source.name ||
        row.schema_version !== 0 ||
        row.provider_name !== 'registry.terraform.io/hashicorp/google' ||
        !nonsensitive(row.sensitive_values) ||
        values.project !== declaration.project ||
        values.name !== declaration.name ||
        typeof values.image_id !== 'string' ||
        !/^[1-9][0-9]*$/.test(values.image_id) ||
        values.id !== `projects/${declaration.project}/global/images/${declaration.name}` ||
        canonical(values) !== canonical(attributes)
      )
        throw new Error('Reviewed Terraform image identity, sensitivity or values changed');
    }
  }
  const values = object(rendered.values),
    module = object(values.root_module);
  return {
    ...rendered,
    values: {
      ...values,
      root_module: {
        ...module,
        resources: moduleResources(values).filter((row) => row.mode !== 'data' || selected.has(String(row.address))),
      },
    },
  };
}
