/**
 * Every string the engine chooses to put on the sheet.
 *
 * Localisation needs this list, and three attempts at writing it down by reading the code produced three
 * different answers — 129, then 198, then 199 — each wrong in a way nothing could catch, because there
 * was nothing to check against. The misses were not exotic: 64 schema-derived strings that carry the
 * questions and the rubric, six element names living only in `SECTION_LABELS`, and the two words every
 * boolean dropdown offers. One false positive too: `note: "elementDefinition"` is a `NoteSource`
 * discriminator, not prose, and a key-name heuristic cannot tell a type tag from text.
 *
 * So this module declares the sources, and `translatable.test.ts` proves the declaration exhaustive
 * against a generated workbook rather than against my reading of the code. The count that gets published
 * is whatever this returns.
 *
 * What is NOT here: anything the deal supplies. An account name is rendered and must never be
 * translated, which is the distinction the oracle draws using `plan.inputCells` — the map that exists to
 * say which cells hold a person's value.
 */
import { BOOLEAN_NO, BOOLEAN_YES } from './generate';
import { ENUM_LABELS, enumLabel } from './labels';
import { schemaConstraint } from './schema-path';
import { QUALIFICATION_ELEMENTS, SECTION_LABELS } from './sections';
import type { WorkbookSpec } from './workbook-spec';

/** Where a translatable string comes from, which is also what has to be re-read when it changes. */
export type TranslatableSource =
  /** `text`, `label`, `title` or `header` in the workbook spec. */
  | 'spec'
  /** An element's definition, questions, or one line of its rubric — all from the schema. */
  | 'schema'
  /** A value some dropdown offers, as the sheet spells it. */
  | 'enum'
  /** A snake_case token's display form, from `ENUM_LABELS`. */
  | 'label'
  /** `Yes` or `No`. */
  | 'boolean'
  /** An element or section name, from `SECTION_LABELS`. */
  | 'section';

/**
 * Keys that carry a string which is NOT prose.
 *
 * `note` names which note to hang (`NoteSource`), so translating it would produce an entry nothing
 * displays — and, worse, would look like coverage.
 */
const NON_PROSE_KEYS = new Set(['note', 'kind', 'id', 'role', 'valueType', 'conditionalFormat', 'shadeWhenEmpty']);

/** Keys in the workbook spec whose string value the sheet shows. */
const PROSE_KEYS = ['text', 'label', 'title', 'header'] as const;

/**
 * The locale enum is identifiers, not prose.
 *
 * A locale slug is chosen by a rep from a list of languages, but the value that lands in the deal is
 * `pt-br` — translating it would mean writing a workbook that asks for a locale that does not exist.
 */
const IDENTIFIER_ENUM_PATHS = new Set(['metadata.locale']);

/** Every dotted path in the schema whose node carries an enum, with the path so a caller can exclude one. */
function enumPaths(schema: unknown): Map<string, readonly string[]> {
  const out = new Map<string, readonly string[]>();
  const walk = (node: unknown, dotted: string): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (Array.isArray(n.enum)) {
      const values = n.enum.filter((v): v is string => typeof v === 'string');
      if (values.length > 0) out.set(dotted, values);
    }
    for (const [key, value] of Object.entries(n)) {
      // `enum`, `const` and `default` hold data, not subschemas: a score table under `default` has keys
      // "0" to "4", and descending into it reports those as schema paths.
      if (key === 'enum' || key === 'const' || key === 'default') continue;
      if (key === 'properties' || key === '$defs' || key === 'definitions') {
        if (value && typeof value === 'object') {
          for (const [name, sub] of Object.entries(value)) walk(sub, dotted ? `${dotted}.${name}` : name);
        }
        continue;
      }
      // An array's members live at the array's own path, which is how `schemaConstraint` reads it too.
      if (key === 'items') walk(value, dotted);
      else if (value && typeof value === 'object' && !Array.isArray(value)) walk(value, dotted);
    }
  };
  walk(schema, '');
  return out;
}

/**
 * The catalogue: every string the engine renders, with every source that renders it.
 *
 * A string can have more than one source — `Close Plan` is both a spec heading and a `SECTION_LABELS`
 * entry — and that matters, because changing either place has to invalidate the same translation.
 */
export function translatableStrings(spec: WorkbookSpec, schema: unknown): Map<string, Set<TranslatableSource>> {
  const out = new Map<string, Set<TranslatableSource>>();
  const add = (text: unknown, source: TranslatableSource): void => {
    if (typeof text !== 'string' || text.trim() === '') return;
    const sources = out.get(text) ?? new Set<TranslatableSource>();
    sources.add(source);
    out.set(text, sources);
  };

  const walkSpec = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walkSpec(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    for (const key of PROSE_KEYS) add(n[key], 'spec');
    for (const [key, value] of Object.entries(n)) {
      if (NON_PROSE_KEYS.has(key)) continue;
      if (typeof value === 'object') walkSpec(value);
    }
  };
  walkSpec(spec);

  // The element text lives in the schema as `const` and `default`, so it is documentation and rendered
  // content at once — the sheet shows every word of it.
  const qualification = (schema as { properties?: { qualification?: { properties?: Record<string, unknown> } } })
    ?.properties?.qualification?.properties;
  for (const element of QUALIFICATION_ELEMENTS) {
    const node = qualification?.[element] as { properties?: Record<string, Record<string, unknown>> } | undefined;
    const properties = node?.properties;
    add(properties?.definition?.const, 'schema');
    for (const question of (properties?.questions?.default as unknown[]) ?? []) add(question, 'schema');
    for (const line of Object.values((properties?.scoreDefinition?.default as Record<string, unknown>) ?? {})) {
      add(line, 'schema');
    }
  }

  for (const [path, values] of enumPaths(schema)) {
    if (IDENTIFIER_ENUM_PATHS.has(path)) continue;
    for (const value of values) add(enumLabel(value), 'enum');
  }

  // A token's display form. Every one of these is also an enum member, so this source exists to say that
  // editing the label table changes the sheet — not to add strings the enums missed.
  for (const label of Object.values(ENUM_LABELS)) add(label, 'label');

  add(BOOLEAN_YES, 'boolean');
  add(BOOLEAN_NO, 'boolean');

  for (const label of Object.values(SECTION_LABELS)) add(label, 'section');

  return out;
}

/** Whether a rendered string is a number, an operator, or punctuation rather than something to translate. */
export function isNonProse(text: string): boolean {
  return /^[\s<>=0-9.%,()/:+-]*$/.test(text);
}

/** Convenience for callers that only need the strings. `schemaConstraint` is re-exported nowhere; this is. */
export function translatableSet(spec: WorkbookSpec, schema: unknown): Set<string> {
  return new Set(translatableStrings(spec, schema).keys());
}

/** The enum values a dotted schema path offers as the sheet spells them, or undefined when it has none. */
export function displayedEnumAt(schema: unknown, dotted: string): Set<string> | undefined {
  const values = schemaConstraint(schema, dotted)?.enum;
  return values ? new Set(values.map(enumLabel)) : undefined;
}
