import { describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { presentationFingerprintErrors } from '../scripts/check-presentation-fingerprints.mjs';
import {
  parseRetiredTasks,
  parseTasks,
  pluginSourceFingerprint,
  reconcileTasks,
  renderRetiredTasks,
  renderTasks,
  seedTasks,
  validateTasks,
} from '../scripts/presentation-tracker.mjs';

const inventory = [
  {
    name: 'example',
    version: '1.0.0',
    fingerprint: 'abc',
    surfaces: [
      {
        id: 'example.tool.outside_src',
        scope: 'registered tool outside_src (extensions/integration.ts)',
        fingerprint: 'abc',
      },
    ],
  },
];
const links = {
  shared: 'https://github.com/f5-sales-demo/marketplace/issues/1',
  example: 'https://github.com/f5-sales-demo/marketplace/issues/2',
};
describe('presentation tracker evidence and coverage gates', () => {
  test('every actual surface has eight gates and every plugin has seven delivery gates', () => {
    const tasks = seedTasks(inventory, links);
    expect(tasks).toHaveLength(19); // four shared, eight surface, seven delivery
    expect(validateTasks(tasks, inventory, links)).toEqual([]);
  });
  test('duplicate and omitted IDs cannot pass', () => {
    const tasks = seedTasks(inventory, links);
    expect(validateTasks([...tasks, tasks[0]], inventory, links).join()).toContain('duplicate');
    expect(validateTasks(tasks.slice(1), inventory, links).join()).toContain('missing');
  });
  test('VERIFIED requires a receipt and complete provenance; BLOCKED needs next action', () => {
    const tasks = seedTasks(inventory, links);
    tasks[4].status = 'VERIFIED';
    expect(validateTasks(tasks, inventory, links).join()).toContain('receipt');
    tasks[4].receipt = 'private:acceptance-001';
    expect(validateTasks(tasks, inventory, links).join()).toContain('provenance');
    tasks[4].evidence = `scenario=read-only; outcome=pass; source=${'a'.repeat(40)}; plugin=1.0.0; runtime=23.5.1; host=Mac`;
    expect(validateTasks(tasks, inventory, links)).toEqual([]);
    tasks[4].status = 'BLOCKED';
    expect(validateTasks(tasks, inventory, links).join()).toContain('next action');
  });
  test('N/A needs a reason and applies only to unexposed capability gates', () => {
    const tasks = seedTasks(inventory, links);
    tasks[4].status = 'NOT APPLICABLE';
    tasks[4].blocker = 'No service attached; next action: configure service';
    expect(validateTasks(tasks, inventory, links).join()).toContain('NOT APPLICABLE');
  });
  test('roundtrip and repeated regeneration preserve edited evidence and literal text', () => {
    const tasks = seedTasks(inventory, links);
    tasks[4].evidence = 'literal a | b\nzero=0 false=false';
    expect(parseTasks(renderTasks(tasks))).toEqual(tasks);
    expect(reconcileTasks(tasks, tasks)).toEqual(tasks);
  });
  test('source drift reopens acceptance while preserving prior receipts', () => {
    const tasks = seedTasks(inventory, links);
    tasks[4].status = 'VERIFIED';
    tasks[4].receipt = 'private:prior';
    const changed = seedTasks(
      [{ ...inventory[0], surfaces: [{ ...inventory[0].surfaces[0], fingerprint: 'changed' }] }],
      links,
    );
    const result = reconcileTasks(changed, tasks);
    expect(result[4].status).toBe('TODO');
    expect(result[4].receipt).toBe('private:prior');
    expect(result[4].blocker).toContain('invalidated');
  });
  test('removed surfaces require explicit retirement rather than discarding receipts', () => {
    expect(() => reconcileTasks([], seedTasks(inventory, links))).toThrow('retire');
  });
});

test('retired rows preserve history with a reason, removal SHA and delivery link', () => {
  const previous = seedTasks(inventory, links);
  previous[4].receipt = 'private:historic';
  const expected = seedTasks([{ ...inventory[0], surfaces: [] }], links);
  const retirement = {
    reason: 'Removed private progress lifecycle registration',
    removalSha: 'b'.repeat(40),
    delivery: links.example,
  };
  const retired = [];
  const current = reconcileTasks(expected, previous, {
    retirements: Object.fromEntries(
      previous.filter((t) => t.id.startsWith('example.tool.')).map((t) => [t.id, retirement]),
    ),
    retired,
  });
  expect(current.map((t) => t.id)).toEqual(expected.map((t) => t.id));
  expect(retired).toHaveLength(8);
  expect(retired[0].receipt).toBe('private:historic');
  expect(retired[0].reason).toBe(retirement.reason);
  expect(validateTasks(current, [{ ...inventory[0], surfaces: [] }], links, retired)).toEqual([]);
  expect(validateTasks(current, [{ ...inventory[0], surfaces: [] }], links, [...retired, retired[0]]).join()).toContain(
    'duplicate',
  );
  expect(
    validateTasks(current, [{ ...inventory[0], surfaces: [] }], links, [{ ...retired[0], reason: '' }]).join(),
  ).toContain('reason');
  expect(() =>
    reconcileTasks(expected, previous, { retirements: { [previous[4].id]: retirement }, retired: [] }),
  ).toThrow('retire');
});

test('retired appendix roundtrips all historical cells and stays out of active tasks', () => {
  const prior = seedTasks(inventory, links)[4];
  const retired = [
    {
      ...prior,
      evidence: 'literal a | b\nfalse=false',
      receipt: 'private:old',
      reason: 'Removed lifecycle',
      removalSha: 'c'.repeat(40),
      removalDelivery: links.example,
    },
  ];
  const text = renderTasks([seedTasks(inventory, links)[0]]) + renderRetiredTasks(retired);
  expect(parseTasks(text)).toHaveLength(1);
  expect(parseRetiredTasks(text)).toEqual(retired);
});

test('repeated invalidation coalesces only its warning and preserves every fingerprint and receipt', () => {
  const previous = seedTasks(inventory, links);
  const notice = 'Evidence invalidated by source/runtime/scope change; next action: requalify this gate.';
  const originalNotes = 'Recorded failure; next action: resolve vendor dependency';
  const history = ['a'.repeat(64), 'b'.repeat(64)];
  previous[4].status = 'BLOCKED';
  previous[4].evidence = 'scenario=retained; outcome=failed';
  previous[4].receipt = 'private:failed-receipt';
  previous[4].blocker = `${notice} Prior input=${history[0]}. ${notice} Prior input=${history[1]}. ${originalNotes}`;
  const unchanged = reconcileTasks(previous, previous);
  expect(unchanged[4].status).toBe('BLOCKED');
  expect(unchanged[4].blocker.split(notice)).toHaveLength(2);
  for (const fingerprint of history) expect(unchanged[4].blocker).toContain(`Prior input=${fingerprint}.`);
  expect(unchanged[4].blocker).toContain(originalNotes);
  expect(unchanged[4].evidence).toBe(previous[4].evidence);
  expect(unchanged[4].receipt).toBe(previous[4].receipt);
  expect(reconcileTasks(unchanged, unchanged)).toEqual(unchanged);
  const changed = seedTasks(
    [{ ...inventory[0], surfaces: [{ ...inventory[0].surfaces[0], fingerprint: 'changed' }] }],
    links,
  );
  const reopened = reconcileTasks(changed, unchanged);
  expect(reopened[4].status).toBe('TODO');
  expect(reopened[4].blocker.split(notice)).toHaveLength(2);
  expect(reopened[4].blocker).toContain(`Prior input=${previous[4].input}.`);
  for (const fingerprint of history) expect(reopened[4].blocker).toContain(`Prior input=${fingerprint}.`);
  expect(reopened[4].blocker).toContain(originalNotes);
  expect(reopened[4].receipt).toBe(previous[4].receipt);
});

function fingerprintFixture(run: (root: string, regenerate: () => void) => void) {
  const root = mkdtempSync(join(tmpdir(), 'tracker-final-bytes-'));
  try {
    for (const path of ['plugins/example/.xcsh-plugin', 'scripts/agent-validation-runtime', '.xcsh-plugin', 'docs'])
      mkdirSync(join(root, path), { recursive: true });
    writeFileSync(
      join(root, '.xcsh-plugin/marketplace.json'),
      JSON.stringify({
        plugins: [{ name: 'example', source: 'plugins/example' }],
      }),
    );
    writeFileSync(
      join(root, 'scripts/agent-validation-runtime/package.json'),
      JSON.stringify({ dependencies: { '@f5-sales-demo/xcsh': '23.10.13' } }),
    );
    writeFileSync(
      join(root, 'plugins/example/.xcsh-plugin/plugin.json'),
      JSON.stringify({ name: 'example', version: '1.0.0', tags: ['one', 'two'] }, null, 2),
    );
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        '-c',
        'core.hooksPath=/dev/null',
        'commit',
        '--quiet',
        '-m',
        'test: seed',
      ],
      { cwd: root },
    );
    const regenerate = () => {
      const fingerprint = pluginSourceFingerprint(root, 'plugins/example', '23.10.13');
      const current = [
        {
          ...inventory[0],
          fingerprint,
          surfaces: inventory[0].surfaces.map((surface) => ({ ...surface, fingerprint })),
        },
      ];
      writeFileSync(
        join(root, 'docs/marketplace-presentation-todo.md'),
        `<!-- tracker-metadata\n{"runtime":"23.10.13"}\n-->\n${renderTasks(seedTasks(current, links))}`,
      );
    };
    regenerate();
    run(root, regenerate);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('manifest formatting after tracker generation fails until final bytes are regenerated', () => {
  fingerprintFixture((root, regenerate) => {
    expect(presentationFingerprintErrors(root)).toEqual([]);
    const path = join(root, 'plugins/example/.xcsh-plugin/plugin.json');
    writeFileSync(path, JSON.stringify(JSON.parse(readFileSync(path, 'utf8'))));
    expect(presentationFingerprintErrors(root)).toEqual(['Stale presentation fingerprint: example']);
    regenerate();
    expect(presentationFingerprintErrors(root)).toEqual([]);
  });
});

test('new forced-tracked runtime chunks reopen evidence and checkout fingerprints remain identical', () => {
  fingerprintFixture((root, regenerate) => {
    writeFileSync(join(root, '.gitignore'), 'plugins/example/dist/\n');
    mkdirSync(join(root, 'plugins/example/dist'));
    writeFileSync(join(root, 'plugins/example/dist/runtime-new.js'), 'export const ready = true;');
    expect(presentationFingerprintErrors(root)).toEqual([]);
    execFileSync('git', ['add', '-f', 'plugins/example/dist/runtime-new.js'], { cwd: root });
    expect(presentationFingerprintErrors(root)).toEqual(['Stale presentation fingerprint: example']);
    regenerate();
    expect(presentationFingerprintErrors(root)).toEqual([]);
    const original = pluginSourceFingerprint(root, 'plugins/example', '23.10.13');
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        '-c',
        'core.hooksPath=/dev/null',
        'commit',
        '--quiet',
        '-m',
        'test: stage chunk',
      ],
      { cwd: root },
    );
    const checkout = join(root, 'checkout');
    execFileSync('git', ['clone', '--quiet', '--local', root, checkout]);
    expect(pluginSourceFingerprint(checkout, 'plugins/example', '23.10.13')).toBe(original);
    expect(presentationFingerprintErrors(checkout)).toEqual([]);
  });
});

test('commit checker rejects unstaged input bytes even when the working tracker matches', () => {
  fingerprintFixture((root, regenerate) => {
    execFileSync('git', ['add', '.'], { cwd: root });
    writeFileSync(join(root, 'plugins/example/.xcsh-plugin/plugin.json'), '{"version":"2.0.0"}');
    regenerate();
    const checker = resolve(import.meta.dir, '../scripts/check-presentation-fingerprints.mjs');
    const result = spawnSync('node', [checker, root], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Stage all tracker inputs');
    execFileSync('git', ['add', '.'], { cwd: root });
    expect(spawnSync('node', [checker, root], { encoding: 'utf8' }).status).toBe(0);
  });
});

test('runtime changes fail independently of source bytes', () => {
  fingerprintFixture((root) => {
    writeFileSync(
      join(root, 'scripts/agent-validation-runtime/package.json'),
      JSON.stringify({ dependencies: { '@f5-sales-demo/xcsh': '23.10.14' } }),
    );
    expect(presentationFingerprintErrors(root)).toEqual([
      'Tracker runtime differs from the declared validation runtime',
      'Stale presentation fingerprint: example',
    ]);
  });
});
