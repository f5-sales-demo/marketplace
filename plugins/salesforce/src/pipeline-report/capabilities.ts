import type { ReportMappings } from '../configuration';
export interface OrgCapabilities {
  opportunityFields?: string[];
  lineItemFields?: string[];
  queryable?: Record<string, boolean>;
  resolvedFieldPaths?: string[];
}
export interface PipelinePlan {
  useLineItems: boolean;
  lineItemValueField?: string;
  useRenewals: boolean;
  opportunityValueField: string;
  unavailable: string[];
}
export function planPipelineQueries(caps: OrgCapabilities, mappings?: ReportMappings): PipelinePlan {
  const opportunityValueField = mappings?.opportunityAmount?.slice('Opportunity.'.length) || 'Amount';
  if (
    !caps.opportunityFields?.includes(opportunityValueField) &&
    !caps.resolvedFieldPaths?.includes(`Opportunity.${opportunityValueField}`)
  )
    throw new Error('Opportunity amount schema is unavailable; totals are not verified.');
  const lineItemValueField =
    mappings?.lineItemAmount?.slice('OpportunityLineItem.'.length) || (mappings ? undefined : 'TotalPrice');
  const useLineItems = Boolean(
    lineItemValueField &&
      (caps.lineItemFields?.includes(lineItemValueField) ||
        caps.resolvedFieldPaths?.includes(`OpportunityLineItem.${lineItemValueField}`)) &&
      caps.queryable?.OpportunityLineItem,
  );
  const unavailable: string[] = [];
  if (!useLineItems) unavailable.push('Product breakdown: line-item schema or amount mapping unavailable.');
  if (!mappings?.renewal)
    unavailable.push(
      'Renewals section: business meaning has not been confirmed; open pipeline includes all opportunities.',
    );
  return {
    opportunityValueField,
    lineItemValueField,
    useLineItems,
    useRenewals: Boolean(mappings?.renewal),
    unavailable,
  };
}
