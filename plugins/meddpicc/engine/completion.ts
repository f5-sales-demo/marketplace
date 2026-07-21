import { QUALIFICATION_ELEMENTS, SECTION_ORDER, type SectionStatus } from "./sections";

export interface CompletionResult {
	order: readonly string[];
	completionStatus: Record<string, SectionStatus>;
	nextIncompleteSection: string | null;
}

function nonEmptyString(v: unknown): boolean {
	return typeof v === "string" && v.trim().length > 0;
}

function hasNonEmptyResponse(responses: unknown): boolean {
	return Array.isArray(responses) && responses.some(nonEmptyString);
}

function qualStatus(el: Record<string, unknown> | undefined): SectionStatus {
	if (!el) return "not_started";
	const score = typeof el.score === "number" ? el.score : 0;
	const responses = hasNonEmptyResponse(el.responses);
	const evidence = nonEmptyString(el.evidence);
	if (score >= 3 && responses && evidence) return "complete";
	if (score === 0 && !responses && !evidence) return "not_started";
	return "partial";
}

type Deal = Record<string, unknown>;

function threeWhysStatus(deal: Deal): SectionStatus {
	const tw = deal.threeWhys as { f5?: Record<string, unknown> } | undefined;
	if (!tw || !tw.f5) return "not_started";
	const f5 = tw.f5;
	const all = nonEmptyString(f5.whyAnything) && nonEmptyString(f5.whyF5) && nonEmptyString(f5.whyNow);
	const any = nonEmptyString(f5.whyAnything) || nonEmptyString(f5.whyF5) || nonEmptyString(f5.whyNow);
	return all ? "complete" : any ? "partial" : "not_started";
}

function stakeholdersStatus(deal: Deal): SectionStatus {
	const list = deal.stakeholders;
	if (!Array.isArray(list) || list.length === 0) return "not_started";
	const complete = list.every(
		s => nonEmptyString((s as Record<string, unknown>).name) &&
			nonEmptyString((s as Record<string, unknown>).title) &&
			nonEmptyString((s as Record<string, unknown>).roleInDeal),
	);
	return complete ? "complete" : "partial";
}

function salesStrategyStatus(deal: Deal): SectionStatus {
	const ss = deal.salesStrategy as Record<string, unknown> | undefined;
	if (!ss) return "not_started";
	const dvp = nonEmptyString(ss.differentiatedValueProposition);
	const win = nonEmptyString(ss.winStrategy);
	if (dvp && win) return "complete";
	return dvp || win ? "partial" : "not_started";
}

function closePlanStatus(deal: Deal): SectionStatus {
	const cp = deal.closePlan as { milestones?: unknown; criticalActions?: unknown } | undefined;
	if (!cp) return "not_started";
	const m = Array.isArray(cp.milestones) && cp.milestones.length > 0;
	const a = Array.isArray(cp.criticalActions) && cp.criticalActions.length > 0;
	if (m && a) return "complete";
	return m || a ? "partial" : "not_started";
}

function teamStatus(deal: Deal): SectionStatus {
	const team = deal.team as { f5?: unknown; partner?: unknown } | undefined;
	if (!team) return "not_started";
	const f5 = Array.isArray(team.f5) && team.f5.length > 0;
	const partner = Array.isArray(team.partner) && team.partner.length > 0;
	if (f5) return "complete";
	return partner ? "partial" : "not_started";
}

export function computeCompletion(deal: unknown): CompletionResult {
	const d = (deal ?? {}) as Deal;
	const qualification = (d.qualification ?? {}) as Record<string, Record<string, unknown>>;
	const completionStatus: Record<string, SectionStatus> = {};

	for (const el of QUALIFICATION_ELEMENTS) {
		completionStatus[el] = qualStatus(qualification[el]);
	}
	completionStatus.threeWhys = threeWhysStatus(d);
	completionStatus.stakeholders = stakeholdersStatus(d);
	completionStatus.salesStrategy = salesStrategyStatus(d);
	completionStatus.closePlan = closePlanStatus(d);
	completionStatus.team = teamStatus(d);

	const nextIncompleteSection = SECTION_ORDER.find(s => completionStatus[s] !== "complete") ?? null;

	return { order: SECTION_ORDER, completionStatus, nextIncompleteSection };
}
