import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { computeCompletion } from "./completion";

const example = JSON.parse(
	await Bun.file(path.join(import.meta.dir, "..", "schema", "example-deal.json")).text(),
);

describe("computeCompletion", () => {
	test("reproduces evidence-based statuses for the example", () => {
		const r = computeCompletion(example);
		expect(r.completionStatus).toEqual({
			metrics: "complete",
			economicBuyer: "complete",
			decisionCriteria: "complete",
			decisionProcess: "partial",
			paperProcess: "not_started",
			implicateThePain: "complete",
			champion: "complete",
			competition: "partial",
			threeWhys: "complete",
			stakeholders: "complete",
			salesStrategy: "complete",
			closePlan: "complete",
			team: "complete",
		});
	});
	test("next incomplete section is decisionProcess", () => {
		expect(computeCompletion(example).nextIncompleteSection).toBe("decisionProcess");
	});
	test("empty deal -> first section is next", () => {
		const r = computeCompletion({});
		expect(r.completionStatus.metrics).toBe("not_started");
		expect(r.nextIncompleteSection).toBe("metrics");
	});
});
