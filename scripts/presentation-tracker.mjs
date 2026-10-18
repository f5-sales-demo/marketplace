import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const surfaceGates = {
  capture:
    'Capture and inspect current installed output; record exact invocation, resolved runtime/plugin and host. Keep raw captures private; publish findings only.',
  defaults:
    'Define useful default results, target/filter scope, units and consequential states. Preserve unknown evidence; distinguish supported, ready, provisional and unavailable.',
  layout:
    'Inspect readable tables and exact Bash/Zsh command copying at 40/76/120/153 columns, collapsed and expanded, both themes and Unicode/ASCII/Nerd presets. Include long text, pagination, counts, monetary grouping and units when exposed.',
  outcomes:
    'Check empty, unavailable, partial and failed outcomes independently with observable causes and next actions. An unavailable service is not an empty result.',
  fidelity:
    'Preserve zero, false, empty strings, literal text, warnings and complete safe evidence. Verify consequential data survives truncation/expansion; redact secrets without inventing values.',
  expansion:
    'Useful default results remain visible; expansion is needed only for long results or technical evidence. Check long text, pagination and scroll behavior.',
  live: 'Switch theme/preset in the running session and verify updated output; where progress exists, check animation, cancellation, completion and timer cleanup. For content workflows, verify the resulting shared message surface.',
  acceptance:
    'Run focused regressions and installed acceptance using the shipped surface and a safe executed example. Attach separate test and installed/service receipts; mocked output cannot satisfy live acceptance.',
};
export const deliveryGates = {
  adapter:
    'Shared-renderer adoption and domain adapter complete. Content-only surfaces use shared message/lifecycle output; never invent a native adapter or copy Salesforce private rendering.',
  checks:
    'Required plugin, compatibility, hermeticity and catalog checks pass at the exact source and runtime; retain commands and outcomes.',
  merge: 'Linked implementation PR is MERGED with green CI at its delivered source SHA.',
  artifact:
    'Available version published; download and verify the immutable artifact against tag/source and digest. Publication alone does not establish installed acceptance.',
  hosts:
    'Verify Mac and Ubuntu installations and resolved executable/plugin provenance separately; explicitly qualify unsupported-host behavior.',
  service:
    'Supported-host/service acceptance passes with scoped safe scenarios. Missing service, credential or supported host is BLOCKED with the exact prerequisite and next action.',
  cleanup:
    'Retire task-owned panes/worktrees, preserve unrelated work and prior receipts, and update affected tracker IDs.',
};
export const sharedGates = {
  inventory:
    'Inventory actual registrations and shipped invocation surfaces; record starting source SHA and installed plugin/runtime versions on Mac and Ubuntu. Registration discovery is source evidence only.',
  contract:
    'Define reusable presentation behavior from Salesforce 2.3.11 results; preserve qualified original receipts and generate a reproducible installed native baseline when visual receipts are missing. Audit all six tools, command width, tables, currency grouping, monetary formatting and live spinner behavior.',
  renderer:
    'Track runtime renderer changes separately from plugin domain adapters. Use the common presentation API; prohibit copying Salesforce private renderer code into other plugins.',
  matrix:
    'Extend the common verification matrix and run tracker validation for duplicate IDs, exact catalog/registration coverage and VERIFIED tasks without complete provenance and receipts.',
};
export const focus = {
  salesforce:
    'Locate accepted 2.3.11 receipts; audit all six registered tools. Preserve command width, tables, currency grouping, monetary formatting and live spinner behavior through shared-renderer adoption. In this campaign, Salesforce service checks use the authorized corporate MDM MacBook. Ubuntu/NUC service access is unavailable by policy; source, immutable-artifact and unavailable-state checks remain separate.',
  aws: 'Identity/profile/region, EC2/S3, Exec/Help and CE discovery/plans/status/diagnostics. Distinguish unsupported lifecycle actions from empty results.',
  azure:
    'Tenant/subscription, resources/VMs/groups, Resource Graph/activity logs, Exec/Help, CE plans/status/diagnostics and cloud-init analysis.',
  gcloud:
    'Account/config/project, compute/storage, Exec/Help and gated GCP CE. Keep qualified support separate from readiness evidence.',
  platform:
    'Namespace/site/provider scope, capabilities, bootstrap, configuration and status; separate supported, ready, provisional and unavailable states.',
  github:
    'Repository/branch, issues/PRs/search, workflows/checks and Git lifecycle; preserve pagination and unfamiliar errors. Installed scenarios are read-only.',
  gitlab:
    'Project scope, issues/details/search, Exec/Help; qualify auth failures, partial search sources and pagination.',
  cloudstatus:
    'Incidents/status, network intelligence, regional-edge advisories and diagnosis. Show consequential freshness, source and geographic coverage.',
  kvm: 'Capability/plan/status/diagnosis and host preparation. Keep VM state, network evidence and unsupported-host results readable.',
  'asm-migration':
    'Assessment/conversion, plans, validation and deployment status; separate conversion warnings, blockers and execution outcomes.',
  terraform:
    'Registry/version, validation, authoring and troubleshooting. Preserve ownership, resource changes, plan summaries and warnings without state secrets.',
  herdr:
    'Setup/status, pairing and workspace/tab/pane/agent guidance. Distinguish admission, working, idle, blocked and semantic completion. Task-owned panes only.',
  xorg: 'Setup/readiness, display/app observations and controls. Qualify Ubuntu support and unavailable Mac capabilities; inspect captures one at a time.',
  zoom: 'Setup/readiness, meeting/window/camera status and control guidance; separate observed state from inferred readiness. No messages or joins solely for testing.',
  ghostty:
    'Install/setup/status and terminal guidance; platform limitations, executable provenance and configuration summaries.',
  firecrawl:
    'Scrape/crawl/map/search, service setup/status and skills; retain target, limits, partial results and failure explanations.',
  devcontainer:
    'Identity/tool catalog, diagnosis, maintenance and integration setup/status. Separate available tools, missing dependencies and unsupported capabilities.',
  'docs-tools':
    'Every registered validation/review command, skill and agent, including surfaces without native adapters. Findings include file locations, severity and verified outcomes.',
  'docs-pipeline':
    'Every ownership, authoring, preview and release command/skill/agent. Distinguish instructions from executed results.',
  brand:
    'Every branding, typography, asset and accessibility workflow; actionable findings retain required design detail.',
  'sales-engineer':
    'Every persona, demo, operations, Q&A and debrief; separate observed evidence, assumptions and proposed actions.',
  meddpicc:
    'Every qualification, stakeholder, action-plan and forecast workflow; preserve unknown evidence and avoid invented scores or business conclusions.',
  'osint-framework':
    'Every catalog, investigation and pipeline; retain sources, target/scope, confidence and unavailable tools. Authorized public/example targets only.',
};
const hash = (text) => createHash('sha256').update(text).digest('hex');
export const stableName = (name) => name.replace(/[^a-zA-Z0-9_-]+/g, '.').replace(/^\.|\.$/g, '');
export function shippedFiles(root, plugin) {
  const base = join(root, plugin.source);
  const surfaces = [];
  function add(kind, name, file, detail = '') {
    const path = relative(root, file);
    surfaces.push({
      id: `${plugin.name}.${kind}.${stableName(name)}`,
      scope: `${kind} ${name}: ${path}${detail ? ` (${detail})` : ''}`,
      fingerprint: hash(readFileSync(file)),
    });
  }
  function walk(dir, visit) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, visit);
      else if (entry.isFile()) visit(path);
    }
  }
  // These are the shipped marketplace content conventions, not guesses for native tools.
  walk(join(base, 'skills'), (file) => {
    if (file.endsWith('/SKILL.md')) {
      const name = readFileSync(file, 'utf8')
        .match(/^name:\s*["']?([^\n"']+)/m)?.[1]
        ?.trim();
      if (!name) throw new Error(`Skill missing declared name: ${file}`);
      add('skill', name, file);
    }
  });
  for (const [dir, kind] of [
    ['commands', 'command'],
    ['agents', 'agent'],
  ]) {
    walk(join(base, dir), (file) => {
      if (file.endsWith('.md')) add(kind, relative(join(base, dir), file).replace(/\.md$/, ''), file);
    });
  }
  const hooks = join(base, 'hooks', 'hooks.json');
  if (existsSync(hooks)) {
    const declared = JSON.parse(readFileSync(hooks, 'utf8')).hooks;
    for (const [event, entries] of Object.entries(declared ?? {})) {
      for (const [i, entry] of entries.entries()) {
        for (const [j, hook] of (entry.hooks ?? []).entries()) {
          add('hook', `${event}.${i}.${j}`, hooks, `matcher=${entry.matcher ?? '*'}; type=${hook.type}`);
        }
      }
    }
  }
  walk(join(base, 'hooks'), (file) => {
    if (!file.endsWith('.json')) add('hook-file', relative(join(base, 'hooks'), file), file);
  });
  return surfaces;
}
const displayName = (name) => ({ azure: 'Azure', github: 'GitHub', gitlab: 'GitLab' })[name] ?? name;
export function seedTasks(inventory, links) {
  const tasks = [];
  function add(id, scope, acceptance, input, delivery) {
    tasks.push({
      id,
      status: 'TODO',
      scope,
      acceptance,
      evidence: '',
      receipt: '',
      delivery: `<${delivery}>`,
      blocker: '',
      input,
    });
  }
  for (const [gate, acceptance] of Object.entries(sharedGates))
    add(`shared.${gate}`, 'shared foundation', acceptance, hash(JSON.stringify(inventory)), links.shared);
  for (const plugin of inventory) {
    for (const surface of plugin.surfaces)
      for (const gate of Object.keys(surfaceGates))
        add(`${surface.id}.${gate}`, surface.scope, `[A-${gate}](#a-${gate})`, surface.fingerprint, links[plugin.name]);
    for (const [gate, acceptance] of Object.entries(deliveryGates))
      add(
        `${plugin.name}.delivery.${gate}`,
        `${displayName(plugin.name)} delivery`,
        acceptance,
        plugin.fingerprint,
        links[plugin.name],
      );
  }
  return tasks;
}
const fields = ['id', 'status', 'scope', 'acceptance', 'evidence', 'receipt', 'delivery', 'blocker', 'input'];
const encode = (value) => String(value).replace(/&/g, '&amp;').replace(/\|/g, '&#124;').replace(/\r?\n/g, '<br>');
const decode = (value) =>
  value
    .replace(/<br>/g, '\n')
    .replace(/&#124;/g, '|')
    .replace(/&amp;/g, '&');
export function renderTasks(tasks) {
  return (
    '| ID | Status | Scope | Acceptance | Evidence | Receipt | Delivery | Blocker | Input fingerprint |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n' +
    tasks.map((t) => `| ${fields.map((f) => encode(t[f])).join(' | ')} |`).join('\n') +
    '\n'
  );
}
export function parseTasks(text) {
  text = text.split('## Retired surfaces')[0];
  return text
    .split('\n')
    .filter((line) =>
      /^\| (?:shared|[a-z0-9-]+\.(?:tool|command|skill|agent|hook|hook-file|lifecycle|advisory|message|flag|shortcut|delivery))\./.test(
        line,
      ),
    )
    .map((line) => {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((cell) => decode(cell.trim()));
      if (cells.length !== fields.length) throw new Error(`Malformed task row: ${cells[0]}`);
      return Object.fromEntries(fields.map((field, i) => [field, cells[i]]));
    });
}
export function validateTasks(tasks, inventory, links, retired = []) {
  const expected = new Map(seedTasks(inventory, links).map((t) => [t.id, t]));
  const errors = [],
    seen = new Set();
  for (const task of tasks) {
    if (seen.has(task.id)) errors.push(`duplicate ID: ${task.id}`);
    seen.add(task.id);
    const original = expected.get(task.id);
    if (!original) {
      errors.push(`unexpected ID: ${task.id}`);
      continue;
    }
    for (const field of ['scope', 'acceptance', 'input'])
      if (task[field] !== original[field]) errors.push(`stale ${field}: ${task.id}; regenerate and requalify`);
    if (!task.delivery.includes(original.delivery)) errors.push(`missing linked issue: ${task.id}`);
    if (!['TODO', 'IN PROGRESS', 'VERIFIED', 'BLOCKED', 'NOT APPLICABLE'].includes(task.status))
      errors.push(`invalid status: ${task.id}`);
    if (task.status === 'VERIFIED') {
      if (!/^(https:\/\/\S+|private:[\w./-]+)/.test(task.receipt.replace(/^<(.+)>$/, '$1')))
        errors.push(`VERIFIED requires receipt: ${task.id}`);
      if (
        !/source=[a-f0-9]{40}/.test(task.evidence) ||
        !['scenario', 'outcome', 'plugin', 'runtime', 'host'].every((k) => new RegExp(`${k}=\\S`).test(task.evidence))
      )
        errors.push(`VERIFIED requires complete provenance: ${task.id}`);
    }
    if (task.status === 'BLOCKED' && (!task.blocker.trim() || !/next action:/i.test(task.blocker)))
      errors.push(`BLOCKED needs prerequisite and next action: ${task.id}`);
    if (
      task.status === 'NOT APPLICABLE' &&
      (!/\.(layout|expansion|live)$/.test(task.id) || !/^Capability not exposed: .+; reason: .+/i.test(task.blocker))
    )
      errors.push(`NOT APPLICABLE requires an unexposed capability and reason: ${task.id}`);
  }
  for (const task of retired) {
    if (fields.some((field) => typeof task[field] !== 'string'))
      errors.push(`retirement needs complete historical row: ${task.id}`);
    if (seen.has(task.id)) errors.push(`duplicate ID: ${task.id}`);
    seen.add(task.id);
    if (expected.has(task.id)) errors.push(`retired ID still registered: ${task.id}`);
    if (!task.reason?.trim()) errors.push(`retirement needs reason: ${task.id}`);
    if (!/^[a-f0-9]{40}$/.test(task.removalSha ?? '')) errors.push(`retirement needs removal SHA: ${task.id}`);
    if (!/^https:\/\/github.com\/\S+/.test(task.removalDelivery ?? ''))
      errors.push(`retirement needs delivery link: ${task.id}`);
  }
  for (const id of expected.keys()) if (!seen.has(id)) errors.push(`missing ID: ${id}`);
  return errors;
}
export function reconcileTasks(expected, previous, { retirements = {}, retired = [] } = {}) {
  const old = new Map(previous.map((t) => [t.id, t]));
  if (old.size !== previous.length) throw new Error('duplicate prior task IDs');
  const result = expected.map((task) => {
    const prior = old.get(task.id);
    old.delete(task.id);
    if (!prior) return task;
    const updated = {
      ...task,
      status: prior.status,
      evidence: prior.evidence,
      receipt: prior.receipt,
      delivery: /^https:\/\/\S+$/.test(prior.delivery) ? `<${prior.delivery}>` : prior.delivery,
      blocker: prior.blocker,
    };
    if (task.input !== prior.input || task.scope !== prior.scope || task.acceptance !== prior.acceptance) {
      updated.status = 'TODO';
      updated.blocker =
        `Evidence invalidated by source/runtime/scope change; next action: requalify this gate. Prior input=${prior.input}. ${prior.blocker}`.trim();
    }
    return updated;
  });
  const removals = [...old.values()];
  if (
    removals.some((task) => {
      const r = retirements[task.id];
      return (
        !r?.reason?.trim() ||
        !/^[a-f0-9]{40}$/.test(r.removalSha ?? '') ||
        !/^https:\/\/github.com\/\S+/.test(r.delivery ?? '')
      );
    })
  )
    throw new Error(
      `Explicitly retire removed IDs with receipt preservation before regeneration: ${[...old.keys()].join(', ')}`,
    );
  const ids = new Set([...result, ...retired].map((t) => t.id));
  if (ids.size !== result.length + retired.length) throw new Error('duplicate current or retired task IDs');
  for (const task of removals) {
    if (ids.has(task.id)) throw new Error(`duplicate retired ID: ${task.id}`);
    ids.add(task.id);
    const r = retirements[task.id];
    retired.push({ ...task, reason: r.reason, removalSha: r.removalSha, removalDelivery: r.delivery });
  }
  return result;
}
const retirementFields = [...fields, 'reason', 'removalSha', 'removalDelivery'];
export function parseRetiredTasks(text) {
  const appendix = text.split('## Retired surfaces\n')[1];
  if (!appendix) return [];
  return appendix
    .split('\n')
    .filter((line) => /^\| [a-z0-9-]+\./.test(line))
    .map((line) => {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((cell) => decode(cell.trim()));
      if (cells.length !== retirementFields.length) throw new Error('Malformed retired task row');
      return Object.fromEntries(retirementFields.map((field, i) => [field, cells[i]]));
    });
}
export function renderRetiredTasks(retired) {
  if (!retired.length) return '';
  return (
    '## Retired surfaces\n\nComplete historical rows are retained below. Only current registrations count as active surfaces.\n\n' +
    '| ID | Status | Scope | Acceptance | Evidence | Receipt | Delivery | Blocker | Input fingerprint | Reason | Removal SHA | Removal delivery |\n' +
    '| ' +
    retirementFields.map(() => '---').join(' | ') +
    ' |\n' +
    retired.map((t) => '| ' + retirementFields.map((f) => encode(t[f])).join(' | ') + ' |').join('\n') +
    '\n\n'
  );
}
export function renderTracker(inventory, metadata, tasks, retired = []) {
  let text =
    '<!-- Generated wide task tables retain stable editable cells. -->\n<!-- markdownlint-disable MD013 MD060 -->\n# Marketplace presentation TODO tracker\n\n';
  text += `Umbrella: <${metadata.links.umbrella}>. Tracking-system delivery: <${metadata.links.tracking}>. Shared prerequisite: <${metadata.links.shared}>.\n\n`;
  text +=
    'This file is canonical. Issues hold discussions and link to IDs; they do not duplicate task checkboxes. This milestone creates tracking and acceptance criteria. Presentation implementation proceeds through the TODOs in later sessions.\n\n';
  text +=
    '## Completion and evidence rules\n\nStatuses: TODO, IN PROGRESS, VERIFIED, BLOCKED. NOT APPLICABLE is permitted only for an unexposed capability, with a reason; missing credentials, services or supported hosts remain BLOCKED. Every task row has stable ID, exact scope, acceptance, evidence, receipt, linked delivery and blocker fields. Input fingerprints invalidate prior acceptance on source/runtime changes.\n\n';
  text +=
    'VERIFIED evidence uses `scenario=...; outcome=...; source=<40-character SHA>; plugin=...; runtime=...; host=...`. Receipt is a sanitized public HTTPS link or `private:<identifier>`. Source/mock tests, green merged PR, immutable artifacts and installed/live acceptance remain separate milestones. Keep customer data, credentials and raw installed captures private; public receipts contain outcomes and provenance only. Preserve prior receipts when reopening a task.\n\n';
  text += '## Source and installed baseline\n\n';
  text += `Starting catalog source: \`${metadata.source}\`. Discovery runtime: \`${metadata.runtime}\` (repository-pinned published dependency; synthetic registration discovery). Starting installed runtime: Mac \`${metadata.installed.Mac.runtime}\`; Ubuntu \`${metadata.installed.Ubuntu.runtime}\`. Observed ${metadata.observed}; installed registry versions establish inventory only, not output acceptance.\n\n`;
  text +=
    'Native registrations come from the published runtime installed-plugin loader with synthetic executable availability and denied execution/network; no lifecycle handlers are executed. Both present/absent executable branches are inventoried. Shipped commands, skills, agents and hook declarations are enumerated using marketplace content conventions. Native tools outside src/tools are included. Each source surface lists its origin; content-only plugins have no invented native tool. Runtime lifecycle mode/status is tracked for every plugin; setup only where declared, plus actual event, integration, message, advisory, flag and shortcut registrations.\n\n';
  text +=
    '## Session workflow\n\nAt each continuation read this tracker, verify active source and installed versions, run inventory validation, and resume the first unfinished ID in implementation order. Preserve prior receipts. Reopen acceptance when source/runtime changes invalidate it. End each milestone with completed IDs, remaining IDs and exact blockers. Inspect visual captures individually. Presentation verification does not authorize infrastructure changes, external communications, meeting joins or destructive operations; use task-owned panes only.\n\n';
  text +=
    'Order: shared foundation and Salesforce regression baseline; AWS/Azure/GCloud/Platform/GitHub/GitLab; remaining native/service/host plugins; content workflows. For shipped content, inspect the content and execute a safe example workflow, qualifying instructions separately from executed results.\n\n';
  text +=
    '## Reproduce and update\n\n```sh\nPUPPETEER_SKIP_DOWNLOAD=true bun install --frozen-lockfile --cwd scripts/agent-validation-runtime\nbun test tests/presentation-tracker.test.ts\n# Validate actual registrations and all canonical rows:\nbun test scripts/presentation-inventory.test.ts\n# Preserve edits/receipts and add newly exposed surfaces:\nTRACKER_ACTION=update bun test scripts/presentation-inventory.test.ts\n```\n\nDo not edit IDs, scope, acceptance or fingerprints by hand. Update status/evidence/receipt/delivery/blocker cells directly. New sources are reconciled by ID. Removed IDs stop generation until explicit retirement preserves their receipts. Generation refuses duplicate IDs. Inventory drift fails CI through the existing plugin test runner.\n\n';
  text +=
    '## Common verification matrix\n\nEvery exposed surface has eight independent gates. Required layout combinations: 40/76/120/153 columns × collapsed/expanded × xcsh-dark/xcsh-light × Unicode/ASCII/Nerd (48 combinations). Inspect each capture separately; record textual findings. Command surfaces require exact Bash and Zsh copy/execute checks with synthetic safe commands. Check monetary/count/unit formatting, literal long text, pagination, warnings and timer cleanup where exposed. Content workflows use shipped guidance and resulting shared output; unsupported capability requires a reason, not an exemption for the whole surface.\n\n';
  for (const [gate, acceptance] of Object.entries(surfaceGates)) text += `### A-${gate}\n\n${acceptance}\n\n`;
  text += `## Shared prerequisites\n\n${renderTasks(tasks.filter((t) => t.id.startsWith('shared.')))}\n`;
  for (const plugin of inventory) {
    text += `## Plugin ${displayName(plugin.name)}\n\nIssue: <${metadata.links[plugin.name]}>. Source version: \`${plugin.version}\`. Installed Mac: \`${metadata.installed.Mac.plugins[plugin.name] ?? 'not installed'}\`; Ubuntu: \`${metadata.installed.Ubuntu.plugins[plugin.name] ?? 'not installed'}\`. Lifecycle: ${plugin.mode}.\n\n${focus[plugin.name]}\n\n`;
    text +=
      `${plugin.surfaces.length} exposed surfaces:\n\n` +
      plugin.surfaces.map((s) => `- \`${s.id}\` — ${s.scope}`).join('\n') +
      '\n\n';
    text += `${renderTasks(tasks.filter((t) => t.id.startsWith(`${plugin.name}.`)))}\n`;
  }
  text += renderRetiredTasks(retired);
  text += `<!-- tracker-metadata\n${JSON.stringify(metadata, null, 2)}\n-->\n`;
  return text;
}
