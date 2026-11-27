import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { recordSalesforceCommand } from './sf/command-evidence';
import { normalizeDescribe, type SfFieldDescription, type SfSObjectDescription } from './sf/describe';
import { execSfJson, type SfExecApi } from './sf/exec';
import { sanitize } from './sf/sanitize';

export interface OrgIdentity {
  orgId: string;
  userId: string;
  username: string;
  instanceUrl: string;
  userType?: string;
}
export interface ProductRule {
  field: string;
  match: 'exact' | 'prefix';
  value: string | number | boolean;
}
export interface ProductGroup {
  name: string;
  quotaEligible?: boolean;
  rules: ProductRule[];
}
export interface RenewalPredicate {
  field: string;
  value: string | boolean | number;
}
export interface ReportMappings {
  opportunityAmount: string;
  lineItemAmount?: string;
  territory?: string;
  renewal?: RenewalPredicate;
  productGroups: ProductGroup[];
}
export interface OrgConfiguration {
  revision: string;
  discovery: {
    identity: OrgIdentity;
    collectedAt: string;
    objects: Record<string, SfSObjectDescription>;
    accessibleObjects: string[];
    queryable: Record<string, boolean>;
    fiscalPeriods: Array<{ Type: string; StartDate: string; EndDate: string }>;
    territoryCandidates: string[];
    productCandidates: string[];
    unavailable: string[];
  };
  mappings: ReportMappings;
}
export interface PrivateConfiguration {
  version: 1;
  orgs: Record<string, OrgConfiguration>;
}
export interface ConfigurationPlan {
  title: string;
  summary: readonly string[];
  questions: readonly { id: string; prompt: string; defaultValue?: string }[];
  validate(answers: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<void>;
  apply(answers: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<void>;
}

export const configurationPath = () =>
  process.env.SF_PIPELINE_CONFIG || join(homedir(), '.xcsh', 'private', 'salesforce', 'config.json');
export const soqlString = (value: string) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
const identifier = /^[A-Za-z][A-Za-z0-9_]*$/;
const sfId = /^(?:00D|005)[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/;
const digest = (text: string | undefined) =>
  text === undefined ? 'missing' : createHash('sha256').update(text).digest('hex');

export async function queryRecords(api: SfExecApi, query: string, identity: OrgIdentity, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const raw = (
    await execSfJson(api, ['data', 'query', '--query', query, '--target-org', identity.username], signal, query)
  ).result as { records?: Record<string, unknown>[]; done?: boolean; totalSize?: number };
  if (
    !raw ||
    !Array.isArray(raw.records) ||
    raw.done !== true ||
    (typeof raw.totalSize === 'number' && raw.totalSize > raw.records.length)
  )
    throw new Error('Incomplete Salesforce query; totals are not verified.');
  return raw.records;
}

export async function resolveIdentity(api: SfExecApi, target?: string, signal?: AbortSignal): Promise<OrgIdentity> {
  signal?.throwIfAborted();
  const args = ['org', 'display', ...(target ? ['--target-org', target] : [])];
  const org = (await execSfJson(api, args, signal)).result as {
    id?: string;
    orgId?: string;
    username?: string;
    instanceUrl?: string;
  };
  const orgId = org?.id ?? org?.orgId;
  if (!orgId?.startsWith('00D') || !sfId.test(orgId) || !org.username || !org.instanceUrl)
    throw new Error('Verified Salesforce organization identity is unavailable.');
  const identity = { orgId, username: org.username, instanceUrl: org.instanceUrl, userId: '' };
  const users = await queryRecords(
    api,
    `SELECT Id, UserType FROM User WHERE Username = ${soqlString(org.username)} LIMIT 1`,
    identity,
    signal,
  );
  const userId = users[0]?.Id;
  if (users.length !== 1 || typeof userId !== 'string' || !userId.startsWith('005') || !sfId.test(userId))
    throw new Error('Verified Salesforce user identity is unavailable.');
  return { ...identity, userId, ...(typeof users[0].UserType === 'string' ? { userType: users[0].UserType } : {}) };
}

export function sameIdentity(a: OrgIdentity, b: OrgIdentity) {
  return a.orgId === b.orgId && a.userId === b.userId && a.username === b.username && a.instanceUrl === b.instanceUrl;
}

/** Registered org-scoped tools pin aliases/defaults before starting the requested command. */
export function createPinnedExecApi(api: SfExecApi): SfExecApi {
  return {
    recordsCommands: true,
    exec: async (command, args, options) => {
      const topic = args[0]?.split(':')[0];
      const scoped = ['data', 'apex', 'sobject', 'schema', 'limits', 'api'].includes(topic);
      if (!scoped || args.includes('--help')) {
        recordSalesforceCommand(args);
        return sanitize(await api.exec(command, args, options));
      }
      let target: string | undefined;
      const pinnedArgs: string[] = [];
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        let selected: string | undefined;
        if (arg === '--target-org' || arg === '-o') selected = args[++i];
        else if (arg.startsWith('--target-org=')) selected = arg.slice('--target-org='.length);
        else if (/^-o.+/.test(arg)) selected = arg.slice(2).replace(/^=/, '');
        else {
          pinnedArgs.push(arg);
          continue;
        }
        if (!selected || !/^[A-Za-z0-9._@-]+$/.test(selected) || (target && selected !== target))
          throw new Error('Invalid or conflicting Salesforce target organization.');
        target = selected;
      }
      const identity = await resolveIdentity(api, target, options?.signal);
      recordSalesforceCommand([...pinnedArgs, '--target-org', identity.username]);
      const result = sanitize(await api.exec(command, [...pinnedArgs, '--target-org', identity.username], options));
      if (!sameIdentity(identity, await resolveIdentity(api, target, options?.signal)))
        throw new Error('Salesforce organization changed during tool execution; discard the result.');
      return result;
    },
  };
}

async function privateFile(path: string) {
  if (!isAbsolute(path)) throw new Error('SF_PIPELINE_CONFIG must select an absolute user-owned path.');
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0)
      throw new Error('Salesforce configuration must be a private user-owned regular file.');
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function parseConfiguration(text?: string): PrivateConfiguration {
  if (text === undefined) return { version: 1, orgs: {} };
  const parsed = JSON.parse(text) as PrivateConfiguration;
  if (parsed?.version !== 1 || !parsed.orgs || typeof parsed.orgs !== 'object' || Array.isArray(parsed.orgs))
    throw new Error('Unsupported Salesforce private configuration schema.');
  return parsed;
}
export async function readConfiguration(path = configurationPath()) {
  return parseConfiguration(await privateFile(path));
}
export async function configurationFingerprint(path = configurationPath()) {
  return digest(await privateFile(path));
}

const metadataCache = new Map<string, { expires: number; config: OrgConfiguration }>();
/** Metadata is isolated by organization, authenticated user and private file revision. */
export async function loadOrgConfiguration(
  api: SfExecApi,
  identity: OrgIdentity,
  signal?: AbortSignal,
  path = configurationPath(),
) {
  const text = await privateFile(path);
  const saved = parseConfiguration(text).orgs[identity.orgId];
  const key = `${identity.orgId}:${identity.userId}:${identity.username}:${digest(text)}:${identity.instanceUrl}`;
  const cached = metadataCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.config;
  const config = await discoverConfiguration(api, identity, signal);
  if (saved) {
    config.mappings = { ...saved.mappings };
    config.revision = saved.revision;
    const lineItemPath = config.mappings.lineItemAmount?.split('.');
    const directAmountMissing =
      lineItemPath?.length === 2 &&
      !config.discovery.objects.OpportunityLineItem?.fields.some(
        (field) => field.name === lineItemPath[1] && ['currency', 'double', 'int'].includes(field.type),
      );
    if (config.mappings.lineItemAmount && (!config.discovery.queryable.OpportunityLineItem || directAmountMissing)) {
      config.mappings.lineItemAmount = undefined;
      config.discovery.unavailable.push('Product breakdown: confirmed line-item schema is unavailable.');
    }
    if (
      config.mappings.productGroups.some((group) =>
        group.rules.some(
          (rule) =>
            (!config.mappings.lineItemAmount && !rule.field.startsWith('Opportunity.')) ||
            (!config.discovery.queryable.Product2 &&
              (rule.field.startsWith('Product2.') || rule.field.startsWith('OpportunityLineItem.Product2.'))),
        ),
      )
    ) {
      config.mappings.productGroups = [];
      config.discovery.unavailable.push(
        'Product classification and quota eligibility are unavailable because confirmed product schema or amount mapping is unavailable.',
      );
    }
  }
  await discoverMappingSchema(api, config, config.mappings, signal);
  validateMappings(config);
  metadataCache.set(key, { expires: Date.now() + 30 * 60_000, config });
  if (metadataCache.size > 20) {
    const first = metadataCache.keys().next().value;
    if (first) metadataCache.delete(first);
  }
  return config;
}
export function clearConfigurationCache() {
  metadataCache.clear();
}

/** Resolve configured relationship paths against the selected org's discovered schema. */
export function resolveField(config: OrgConfiguration, path: string): SfFieldDescription {
  const parts = path.split('.');
  if (parts.length < 2 || parts.some((p) => !identifier.test(p))) throw new Error(`Invalid field path: ${path}`);
  let object = parts[0];
  parts.shift();
  if (!config.discovery.queryable[object]) throw new Error(`Object is not queryable: ${object}`);
  for (const relationship of parts.slice(0, -1)) {
    const field = config.discovery.objects[object]?.fields.find((f) => f.relationshipName === relationship);
    if (field?.referenceTo?.length !== 1) throw new Error(`Unresolved relationship: ${path}`);
    object = field.referenceTo[0];
    if (!config.discovery.queryable[object]) throw new Error(`Object is not queryable: ${object}`);
  }
  const field = config.discovery.objects[object]?.fields.find((f) => f.name === parts.at(-1));
  if (!field) throw new Error(`Unknown field: ${path}`);
  return field;
}

function mappingPaths(mappings: ReportMappings): string[] {
  return [
    mappings.opportunityAmount,
    mappings.lineItemAmount,
    mappings.territory,
    mappings.renewal?.field,
    ...mappings.productGroups.flatMap((group) => group.rules.map((rule) => rule.field)),
    ...mappings.productGroups.flatMap((group) =>
      group.rules
        .filter((rule) => rule.field.startsWith('Product2.'))
        .map((rule) => `OpportunityLineItem.${rule.field}`),
    ),
  ].filter((field): field is string => Boolean(field));
}

/** Describe only relationship targets required by the reviewed mappings. */
async function discoverMappingSchema(
  api: SfExecApi,
  config: OrgConfiguration,
  mappings: ReportMappings,
  signal?: AbortSignal,
) {
  for (const fieldPath of mappingPaths(mappings)) {
    const parts = fieldPath.split('.');
    if (parts.length < 2 || parts.some((part) => !identifier.test(part)))
      throw new Error(`Invalid field path: ${fieldPath}`);
    let object = parts[0];
    for (const relationship of parts.slice(1, -1)) {
      const field = config.discovery.objects[object]?.fields.find((entry) => entry.relationshipName === relationship);
      if (field?.referenceTo?.length !== 1) throw new Error(`Unresolved relationship: ${fieldPath}`);
      object = field.referenceTo[0];
      if (!identifier.test(object)) throw new Error(`Invalid relationship target: ${fieldPath}`);
      if (!config.discovery.objects[object]) {
        const raw = (
          await execSfJson(
            api,
            ['sobject', 'describe', '--sobject', object, '--target-org', config.discovery.identity.username],
            signal,
          )
        ).result;
        config.discovery.objects[object] = normalizeDescribe(raw);
        config.discovery.queryable[object] = (raw as { queryable?: boolean })?.queryable === true;
      }
    }
  }
}

/** Pass resolved paths to report planning so relationship fields do not look absent. */
export function pipelineCapabilities(config: OrgConfiguration) {
  const paths = [...mappingPaths(config.mappings), 'Opportunity.Account.Name', 'Opportunity.Owner.Name'];
  const resolvedFieldPaths = [...new Set(paths)].filter((field) => {
    try {
      resolveField(config, field);
      return true;
    } catch {
      return false;
    }
  });
  return {
    opportunityFields: config.discovery.objects.Opportunity?.fields.map((field) => field.name),
    lineItemFields: config.discovery.objects.OpportunityLineItem?.fields.map((field) => field.name),
    queryable: config.discovery.queryable,
    resolvedFieldPaths,
  };
}

export function validateMappings(config: OrgConfiguration, mappings = config.mappings) {
  const money = (path: string, root: string) => {
    if (!path.startsWith(`${root}.`) || !['currency', 'double', 'int'].includes(resolveField(config, path).type))
      throw new Error(`Amount mapping must reference a numeric ${root} field: ${path}`);
  };
  money(mappings.opportunityAmount, 'Opportunity');
  if (mappings.lineItemAmount) money(mappings.lineItemAmount, 'OpportunityLineItem');
  if (mappings.territory) {
    if (
      !mappings.territory.startsWith('Opportunity.') ||
      !['string', 'picklist', 'reference', 'id'].includes(resolveField(config, mappings.territory).type)
    )
      throw new Error('Territory mapping must be a supported Opportunity field.');
  }
  if (mappings.renewal) {
    const { field: path, value } = mappings.renewal;
    const field = resolveField(config, path);
    if (
      !path.startsWith('Opportunity.') ||
      !field.filterable ||
      !['boolean', 'string', 'picklist', 'int', 'double', 'currency'].includes(field.type) ||
      (field.type === 'boolean'
        ? typeof value !== 'boolean'
        : ['int', 'double', 'currency'].includes(field.type)
          ? typeof value !== 'number' || !Number.isFinite(value)
          : typeof value !== 'string')
    )
      throw new Error('Renewal predicate has an incompatible field, type or value.');
  }
  if (!Array.isArray(mappings.productGroups)) throw new Error('Product groups must be an array.');
  const names = new Set<string>();
  for (const group of mappings.productGroups) {
    if (
      !group ||
      typeof group.name !== 'string' ||
      !group.name.trim() ||
      group.name === 'Uncategorized' ||
      names.has(group.name) ||
      (group.quotaEligible !== undefined && typeof group.quotaEligible !== 'boolean') ||
      !Array.isArray(group.rules) ||
      !group.rules.length
    )
      throw new Error('Each product group needs a unique name, rules and optional explicit quota eligibility.');
    names.add(group.name);
    for (const rule of group.rules) {
      if (
        !rule ||
        !['exact', 'prefix'].includes(rule.match) ||
        typeof rule.field !== 'string' ||
        !['Opportunity', 'OpportunityLineItem', 'Product2'].includes(rule.field.split('.')[0])
      )
        throw new Error('Product rules need a supported field path and exact or prefix match.');
      if (!rule.field.startsWith('Opportunity.') && !mappings.lineItemAmount)
        throw new Error('Line-item product rules require a confirmed line-item amount mapping.');
      const field = resolveField(config, rule.field);
      const textual = ['string', 'picklist', 'id', 'reference'].includes(field.type);
      const numeric = ['currency', 'double', 'int', 'percent'].includes(field.type);
      const valid =
        rule.match === 'prefix'
          ? textual && typeof rule.value === 'string' && rule.value.length > 0
          : textual
            ? typeof rule.value === 'string'
            : numeric
              ? typeof rule.value === 'number' && Number.isFinite(rule.value)
              : field.type === 'boolean' && typeof rule.value === 'boolean';
      if (!valid)
        throw new Error(
          'Product rule value must match the discovered field type. Prefix matches require nonempty text.',
        );
    }
  }
}

function answersToMappings(answers: Readonly<Record<string, string>>): ReportMappings {
  return {
    opportunityAmount: answers.opportunityAmount,
    lineItemAmount: answers.lineItemAmount && answers.lineItemAmount !== '-' ? answers.lineItemAmount : undefined,
    territory: answers.territory && answers.territory !== '-' ? answers.territory : undefined,
    renewal: answers.renewal && answers.renewal !== '-' ? JSON.parse(answers.renewal) : undefined,
    productGroups: JSON.parse(answers.productGroups || '[]'),
  };
}

export async function discoverConfiguration(
  api: SfExecApi,
  identity: OrgIdentity,
  signal?: AbortSignal,
): Promise<OrgConfiguration> {
  const objects: Record<string, SfSObjectDescription> = {},
    queryable: Record<string, boolean> = {},
    unavailable: string[] = [];
  let accessibleObjects: string[] = [];
  try {
    const result = (
      await execSfJson(api, ['sobject', 'list', '--sobject', 'all', '--target-org', identity.username], signal)
    ).result;
    if (Array.isArray(result))
      accessibleObjects = result.filter((name): name is string => typeof name === 'string' && identifier.test(name));
  } catch (error) {
    signal?.throwIfAborted();
    if (/REQUEST_LIMIT_EXCEEDED|429|rate limit/i.test(String(error))) throw error;
    unavailable.push(`Object catalog: ${sanitize(String(error))}`);
  }
  const selected = [
    'Opportunity',
    'OpportunityLineItem',
    'Product2',
    'Account',
    'User',
    'OpportunityTeamMember',
    'Territory2',
    'Period',
  ];
  for (const name of selected) {
    signal?.throwIfAborted();
    try {
      const result = (
        await execSfJson(api, ['sobject', 'describe', '--sobject', name, '--target-org', identity.username], signal)
      ).result;
      const described = normalizeDescribe(result);
      objects[name] = described;
      queryable[name] = (result as { queryable?: boolean })?.queryable === true;
    } catch (error) {
      signal?.throwIfAborted();
      if (/REQUEST_LIMIT_EXCEEDED|429|rate limit/i.test(String(error))) throw error;
      unavailable.push(`${name} schema: ${sanitize(String(error))}`);
      queryable[name] = false;
    }
  }
  if (!objects.Opportunity || !queryable.Opportunity)
    throw new Error('Opportunity schema/query access is unavailable.');
  let fiscalPeriods: OrgConfiguration['discovery']['fiscalPeriods'] = [];
  try {
    fiscalPeriods = (
      await queryRecords(
        api,
        "SELECT Type, StartDate, EndDate FROM Period WHERE Type IN ('Quarter', 'Year') AND StartDate <= TODAY AND EndDate >= TODAY",
        identity,
        signal,
      )
    )
      .filter((r) => typeof r.Type === 'string' && typeof r.StartDate === 'string' && typeof r.EndDate === 'string')
      .map((r) => ({ Type: String(r.Type), StartDate: String(r.StartDate), EndDate: String(r.EndDate) }));
  } catch (error) {
    signal?.throwIfAborted();
    if (/REQUEST_LIMIT_EXCEEDED|429|rate limit/i.test(String(error))) throw error;
    unavailable.push(`Fiscal periods: ${sanitize(String(error))}`);
  }
  const candidates = (concept: RegExp, roots: string[]) =>
    roots.flatMap(
      (root) =>
        objects[root]?.fields.filter((f) => concept.test(`${f.name} ${f.label}`)).map((f) => `${root}.${f.name}`) ?? [],
    );
  return {
    revision: randomUUID(),
    discovery: {
      identity,
      objects,
      accessibleObjects,
      queryable,
      fiscalPeriods,
      unavailable,
      collectedAt: new Date().toISOString(),
      territoryCandidates: candidates(/territor/i, ['Opportunity']),
      productCandidates: candidates(/product|family|segment|category|name|code/i, [
        'Opportunity',
        'OpportunityLineItem',
        'Product2',
      ]),
    },
    mappings: {
      opportunityAmount: 'Opportunity.Amount',
      lineItemAmount:
        queryable.OpportunityLineItem && objects.OpportunityLineItem?.fields.some((f) => f.name === 'TotalPrice')
          ? 'OpportunityLineItem.TotalPrice'
          : undefined,
      productGroups: [],
    },
  };
}

async function validateQueryMappings(
  api: SfExecApi,
  config: OrgConfiguration,
  mappings: ReportMappings,
  signal?: AbortSignal,
) {
  await discoverMappingSchema(api, config, mappings, signal);
  validateMappings(config, mappings);
  const paths = mappingPaths(mappings);
  for (const root of new Set(paths.map((p) => p.split('.')[0]))) {
    const fields = [...new Set(paths.filter((p) => p.startsWith(`${root}.`)).map((p) => p.slice(root.length + 1)))];
    await queryRecords(api, `SELECT ${fields.join(', ')} FROM ${root} LIMIT 1`, config.discovery.identity, signal);
  }
}

async function atomicWrite(path: string, baseline: string, config: PrivateConfiguration, signal?: AbortSignal) {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const info = await lstat(parent);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0)
    throw new Error('Configuration directory must be private and user-owned.');
  const lockPath = `${path}.lock`,
    temporary = `${path}.${randomUUID()}.tmp`;
  const lock = await open(lockPath, 'wx', 0o600).catch(() => {
    throw new Error('Configuration is being edited; retry setup.');
  });
  try {
    if (digest(await privateFile(path)) !== baseline)
      throw new Error('Configuration changed during review; retry setup.');
    signal?.throwIfAborted();
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(`${JSON.stringify(config, null, 2)}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
    signal?.throwIfAborted();
    if (digest(await privateFile(path)) !== baseline)
      throw new Error('Configuration changed during review; retry setup.');
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
    await lock.close();
    await unlink(lockPath);
  }
}

export async function prepareSalesforceConfiguration(
  api: SfExecApi,
  target?: string,
  signal?: AbortSignal,
  path = configurationPath(),
): Promise<ConfigurationPlan> {
  const text = await privateFile(path),
    previous = parseConfiguration(text),
    baseline = digest(text);
  const identity = await resolveIdentity(api, target, signal);
  const config = await discoverConfiguration(api, identity, signal);
  config.mappings = previous.orgs[identity.orgId]?.mappings ?? config.mappings;
  const validate = async (answers: Readonly<Record<string, string>>, currentSignal?: AbortSignal) => {
    currentSignal?.throwIfAborted();
    if (!sameIdentity(identity, await resolveIdentity(api, target, currentSignal)))
      throw new Error('Salesforce organization changed during configuration review.');
    if (digest(await privateFile(path)) !== baseline)
      throw new Error('Configuration changed during review; retry setup.');
    await validateQueryMappings(api, config, answersToMappings(answers), currentSignal);
  };
  return {
    title: 'Salesforce private configuration',
    summary: [
      `Verified organization: ${identity.orgId}`,
      `Private file: ${path}`,
      `${Object.keys(config.discovery.objects).length} object descriptions discovered.`,
      `Territory candidates: ${config.discovery.territoryCandidates.join(', ') || 'none'}`,
      `Product candidates: ${config.discovery.productCandidates.join(', ') || 'none'}`,
      ...config.discovery.unavailable,
      'Optional business mappings remain unresolved until you confirm them. No account or opportunity records are saved.',
    ],
    questions: [
      {
        id: 'opportunityAmount',
        prompt: 'Opportunity amount field path',
        defaultValue: config.mappings.opportunityAmount,
      },
      {
        id: 'lineItemAmount',
        prompt: "Line-item amount field path (optional; '-' clears)",
        defaultValue: config.mappings.lineItemAmount ?? '',
      },
      {
        id: 'territory',
        prompt: "Territory field path (optional; '-' clears)",
        defaultValue: config.mappings.territory ?? '',
      },
      {
        id: 'renewal',
        prompt: "Renewal predicate JSON: {field,value} (optional; '-' clears)",
        defaultValue: config.mappings.renewal ? JSON.stringify(config.mappings.renewal) : '',
      },
      {
        id: 'productGroups',
        prompt: 'Product groups JSON: [{name,quotaEligible,rules:[{field,match,value}]}]',
        defaultValue: JSON.stringify(config.mappings.productGroups),
      },
    ],
    validate,
    apply: async (answers, currentSignal) => {
      await validate(answers, currentSignal);
      config.mappings = answersToMappings(answers);
      await atomicWrite(
        path,
        baseline,
        { version: 1, orgs: { ...previous.orgs, [identity.orgId]: config } },
        currentSignal,
      );
    },
  };
}
