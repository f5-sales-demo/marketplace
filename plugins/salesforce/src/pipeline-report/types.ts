import type { ReportMappings } from '../configuration';
import type { OrgCapabilities } from './capabilities';
export interface PipelineReportOptions {
  userIds: string[];
  orgAlias?: string;
  quarterStart?: string;
  quarterEnd?: string;
  fiscalYearStart?: string;
  fiscalYearEnd?: string;
  staleCutoff?: string;
  teamMemberNames?: string[];
  capabilities?: OrgCapabilities;
  mappings?: ReportMappings;
  unavailable?: string[];
}
export interface AccountRow {
  name: string;
  territory: string;
  totals: Record<string, number>;
  total: number;
}
export type SectionTotals = Record<string, number>;
export interface SectionData {
  accounts: AccountRow[];
  totals: SectionTotals;
  total?: number;
  quotaTotal?: number;
  quotaUnknownAmount?: number;
}
export type ForecastSummary = Record<string, number>;
export interface DealSummary {
  oppId: string;
  name: string;
  accountName: string;
  stage: string;
  closeDate: string;
  forecast: string;
  amount: number;
  ownerName: string;
  nextStep?: string;
}
export interface CloseMonthBucket {
  label: string;
  yearMonth: string;
  amount: number;
  oppCount: number;
}
export interface DataAnomaly {
  severity: 'info' | 'warning' | 'error';
  category: string;
  message: string;
  details?: string;
}
export interface CurrencyReport {
  currency: string;
  netNew: SectionData;
  booked?: SectionData;
  renewals?: SectionData;
  productBreakdown?: SectionData;
  forecast: ForecastSummary;
  topDeals: DealSummary[];
  topRenewals?: DealSummary[];
  closeDistribution: CloseMonthBucket[];
  renewalDistribution?: CloseMonthBucket[];
  fyBookedTotal?: number;
}
export interface PipelineReportData extends Omit<CurrencyReport, 'currency'> {
  currency?: string;
  currencyBreakdown?: CurrencyReport[];
  sourceQueries?: { query: string; records: Record<string, unknown>[] }[];
  generated: string;
  openScopeStart?: string;
  quarter: { start?: string; end?: string };
  territories: string[];
  teamMembers: string[];
  lineItemCount: number;
  skusFound: string[];
  anomalies: DataAnomaly[];
  fyLabel?: string;
  unavailable?: string[];
  amountField: string;
  productAmountField?: string;
  coverage?: { scope: 'owner or team' | 'owner only'; owner: number; team: number; overlap: number; distinct: number };
}
