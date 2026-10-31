import { expect, test } from 'bun:test';
import { canonicalEqual, canonicalSha256, canonicalSnapshot } from '../../src/ce/canonical';

function result(action: () => boolean): unknown {
  try {
    return { value: action() };
  } catch (error) {
    return { error: (error as Error).constructor.name };
  }
}
function parity(left: unknown, right: unknown) {
  expect(result(() => canonicalEqual(left, right))).toEqual(
    result(() => canonicalSha256(left) === canonicalSha256(right)),
  );
  expect(result(() => canonicalEqual({ value: left }, { value: right }))).toEqual(
    result(() => canonicalSha256({ value: left }) === canonicalSha256({ value: right })),
  );
}

test('canonical equality preserves ordinary JSON and wrapped undefined semantics', () => {
  const shared = { nested: [true, null, 'x', 0] };
  const values: unknown[] = [
    null,
    true,
    false,
    '',
    'x',
    0,
    -0,
    1,
    undefined,
    [],
    [undefined],
    [null],
    Array(2),
    [null, null],
    {},
    { x: undefined },
    { a: 1, b: 2 },
    { b: 2, a: 1 },
    { first: shared, second: shared },
    JSON.parse('{"first":{"nested":[true,null,"x",0]},"second":{"nested":[true,null,"x",0]}}'),
    Object.assign(Object.create(null), { x: 1 }),
  ];
  for (const a of values) for (const b of values) parity(a, b);
});

test('exotic values preserve legacy results and errors despite an earlier mismatch', () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  const exotic: unknown[] = [
    NaN,
    Infinity,
    -Infinity,
    1n,
    Symbol('x'),
    () => 1,
    new Date(0),
    /x/,
    new Map([['x', 1]]),
    new Set([1]),
    new Number(1),
    cycle,
    JSON.parse('{"__proto__":{"x":1},"y":2}'),
    {
      toJSON() {
        return { x: 1 };
      },
    },
    {
      get x() {
        return 1;
      },
    },
    {
      get x() {
        throw new TypeError('getter');
      },
    },
    new Proxy({ x: 1 }, {}),
    new Proxy(
      { x: 1 },
      {
        ownKeys() {
          throw new TypeError('proxy');
        },
      },
    ),
    Object.assign([1], { map: () => ['override'] }),
    Object.create({ x: 1 }),
  ];
  for (const a of exotic) {
    parity(a, { mismatch: true });
    parity({ first: 1, later: a }, { first: 2 });
    parity(a, a);
  }
});

test('fresh mutable inputs never use an identity or observation cache', () => {
  const a = { nested: [{ state: 'up' }], owner: 'owned' };
  const b = structuredClone(a);
  expect(canonicalEqual(a, b)).toBe(true);
  b.nested[0].state = 'down';
  expect(canonicalEqual(a, b)).toBe(false);
  b.nested[0].state = 'up';
  expect(canonicalEqual(a, b)).toBe(true);
  b.owner = 'foreign';
  expect(canonicalEqual(a, b)).toBe(false);
});

test('deterministic nested JSON comparisons match hashes across mutations', () => {
  let seed = 1930;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const make = (depth: number): unknown => {
    const choice = random() % (depth ? 7 : 4);
    if (choice === 0) return null;
    if (choice === 1) return Boolean(random() % 2);
    if (choice === 2) return random() / 100;
    if (choice === 3) return String(random());
    if (choice === 4) return Array.from({ length: random() % 4 }, () => make(depth - 1));
    const obj: Record<string, unknown> = {};
    for (let i = 0, count = random() % 4; i < count; i++) obj[`key${i}`] = make(depth - 1);
    return obj;
  };
  for (let index = 0; index < 300; index++) {
    const a = make(4);
    parity(a, structuredClone(a));
    parity(a, make(4));
  }
});

test('canonical request snapshot rejects mutation even when both caller copies change together', () => {
  const original = { owner: 'owned', interfaces: [{ state: 'up' }], omitted: undefined };
  const matches = canonicalSnapshot(original);
  const copied = structuredClone(original);
  expect(matches(copied)).toBe(true);
  original.interfaces[0].state = 'down';
  copied.interfaces[0].state = 'down';
  expect(matches(original)).toBe(false);
  expect(matches(copied)).toBe(false);
  copied.interfaces[0].state = 'up';
  expect(matches(copied)).toBe(true);
});

test('canonical request snapshot preserves canonical bytes and exotic value errors', () => {
  const values: unknown[] = [
    null,
    true,
    -0,
    'unicode \u00e9',
    {},
    { missing: undefined },
    [undefined],
    [null],
    Array(2),
    { 10: 'ten', 2: 'two', a: 1 },
    new Date(0),
    NaN,
    {
      toJSON() {
        return { a: 1 };
      },
    },
    JSON.parse('{"__proto__":{"a":1},"b":2}'),
  ];
  for (const left of values)
    for (const right of values) {
      expect(result(() => canonicalSnapshot(left)(right))).toEqual(
        result(() => canonicalSha256(left) === canonicalSha256(right)),
      );
    }
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  for (const invalid of [
    undefined,
    1n,
    Symbol('invalid'),
    () => 1,
    cycle,
    {
      get later() {
        throw new TypeError('getter');
      },
    },
  ]) {
    expect(result(() => canonicalSnapshot(invalid)({}))).toEqual(
      result(() => canonicalSha256(invalid) === canonicalSha256({})),
    );
    expect(result(() => canonicalSnapshot({})(invalid))).toEqual(
      result(() => canonicalSha256({}) === canonicalSha256(invalid)),
    );
  }
});
