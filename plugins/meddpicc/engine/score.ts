import { QUALIFICATION_ELEMENTS } from "./sections";

export interface ScoreResult {
	elementScores: Record<string, number>;
	sum: number;
	overallScore: number;
	overallRating: "Red" | "Yellow" | "Green";
}

function ratingFor(sum: number): ScoreResult["overallRating"] {
	if (sum <= 13) return "Red";
	if (sum <= 25) return "Yellow";
	return "Green";
}

export function computeScore(deal: unknown): ScoreResult {
	const scores = (deal as { scoring?: { elementScores?: Record<string, unknown> } })?.scoring?.elementScores ?? {};
	const elementScores: Record<string, number> = {};
	let sum = 0;
	for (const el of QUALIFICATION_ELEMENTS) {
		const raw = scores[el];
		const n = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
		elementScores[el] = n;
		sum += n;
	}
	// Round to 1 decimal for deterministic, stable output (e.g. 21/32*100 = 65.625 -> 65.6).
	const overallScore = Math.round((sum / 32) * 1000) / 10;
	return { elementScores, sum, overallScore, overallRating: ratingFor(sum) };
}
