import { QUALIFICATION_ELEMENTS, SECTION_ORDER } from './sections';

type Schema = Record<string, unknown>;

/** Read an element's own `properties` block from the schema (definition/questions/scoreDefinition live here). */
function elementProps(schema: unknown, element: string): Record<string, unknown> {
  const qual = ((schema as Schema)?.properties as Schema)?.qualification as Schema | undefined;
  const el = (qual?.properties as Schema)?.[element] as Schema | undefined;
  const props = el?.properties as Record<string, unknown> | undefined;
  return props && typeof props === 'object' ? props : {};
}

function constOf(node: unknown): string {
  return typeof (node as Schema)?.const === 'string' ? ((node as Schema).const as string) : '';
}

export interface ElementHint {
  element: string;
  definition: string;
  questions: string[];
  scoreDefinition: Record<string, string>;
}

export function computeElementHint(schema: unknown, element: string): ElementHint {
  if (!QUALIFICATION_ELEMENTS.includes(element)) {
    throw new Error(`Unknown MEDDPICC element: ${element}\nValid: ${QUALIFICATION_ELEMENTS.join(', ')}`);
  }
  const props = elementProps(schema, element);
  const questions = (props.questions as Schema)?.default;
  const rubric = (props.scoreDefinition as Schema)?.default;
  return {
    element,
    definition: constOf(props.definition),
    questions: Array.isArray(questions) ? (questions as string[]) : [],
    scoreDefinition:
      rubric && typeof rubric === 'object' ? (rubric as Record<string, string>) : {},
  };
}

export interface HintOverview {
  order: readonly string[];
  elements: Array<{ element: string; definition: string }>;
  workflow: string;
  deeper: string;
}

export function computeHintOverview(schema: unknown): HintOverview {
  const elements = QUALIFICATION_ELEMENTS.map((element) => ({
    element,
    definition: constOf(elementProps(schema, element).definition),
  }));
  return {
    order: SECTION_ORDER,
    elements,
    workflow:
      'Qualify each MEDDPICC element in order: gather responses, then set score (0-4) and evidence. ' +
      'Use `next <deal.json>` to get the current section plus its questions and rubric, `score <deal.json>` ' +
      'for the rollup, and `validate <deal.json>` to check schema conformance.',
    deeper:
      'Run `hint <element>` for one element\'s questions + 0-4 rubric. ' +
      'Read xcsh://plugin/meddpicc/schema for the full contract and xcsh://plugin/meddpicc/example for a worked deal.',
  };
}
