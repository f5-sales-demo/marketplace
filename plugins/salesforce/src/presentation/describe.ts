import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import type { Args, Options, Result, View } from './shared';
import { context, data, evidence, fields, hint, record, rows, table } from './shared';

const types: Record<string, string> = {
  string: 'Text',
  textarea: 'Long text',
  datetime: 'Date/time',
  date: 'Date',
  id: 'ID',
  reference: 'Reference',
  boolean: 'Yes/no',
  double: 'Number',
  int: 'Integer',
  currency: 'Amount',
  picklist: 'Picklist',
  multipicklist: 'Multiple choices',
};
function queryUse(field: Args): string {
  if (typeof field.filterable !== 'boolean' || typeof field.groupable !== 'boolean') return 'Not returned';
  return field.filterable && field.groupable
    ? 'Filter, group'
    : field.filterable
      ? 'Filter'
      : field.groupable
        ? 'Group'
        : 'Neither';
}
export function describeView(
  p: PresentationAPI,
  result: Result,
  options: Options,
  args: Args,
  operation = 'sf sobject describe',
): View {
  const details = record(result.details),
    described = record(details.described);
  const all = rows(described.fields),
    relationships = rows(described.childRelationships);
  if (!Array.isArray(described.fields) || all.length !== described.fields.length)
    return {
      summary: 'Schema unavailable',
      warnings: ['Malformed schema payload. Field catalog is not verified.'],
      sections: [...context(operation, args), ...evidence(p, result, args)],
    };
  const match = String(args.match ?? '')
    .trim()
    .toLowerCase();
  const selected = all.filter(
    (field) =>
      !match || String(field.name).toLowerCase().includes(match) || String(field.label).toLowerCase().includes(match),
  );
  const selectedRels = relationships.filter(
    (rel) =>
      !match ||
      String(rel.childSObject).toLowerCase().includes(match) ||
      String(rel.relationshipName ?? '')
        .toLowerCase()
        .includes(match),
  );
  const preview = match || options.expanded ? selected : selected.filter((f) => !f.custom);
  const rawFields = rows(record(details.describeEvidence).fields);
  return {
    sections: [
      ...context(operation, args),
      ...(match ? [fields({ Filter: args.match })] : []),
      ...(match && !selected.length && !selectedRels.length
        ? [hint('No matching fields or child relationships. Try a shorter or different filter.')]
        : []),
      ...(preview.length
        ? [
            table(
              p,
              preview.map((field) => ({
                label: field.label ?? field.name,
                name: field.name,
                type: types[String(field.type)] ?? field.type,
                queryUse: queryUse(rawFields.find((r) => r.name === field.name) ?? field),
              })),
              match ? 'Matching fields' : options.expanded ? 'Fields' : 'Standard fields',
              ['label', 'name', 'type', 'queryUse'],
              { label: 'Label', name: 'API name', type: 'Type', queryUse: 'Query use' },
            ),
          ]
        : []),
      ...(match || options.expanded ? data(p, selectedRels, 'Child relationships') : []),
      ...(!options.expanded
        ? [
            hint(
              `${match ? `${all.length - selected.length} fields outside filter` : `${selected.length - preview.length} custom fields omitted`}; complete picklists and ${relationships.length - (match ? selectedRels.length : 0)} relationships in expanded details${match ? `; full catalog of ${all.length} fields retained` : ''}`,
            ),
          ]
        : [...data(p, selected, 'Selected field metadata'), ...evidence(p, result, args)]),
    ],
  };
}
