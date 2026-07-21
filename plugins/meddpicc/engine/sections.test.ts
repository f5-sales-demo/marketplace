import { describe, expect, test } from "bun:test";
import { QUALIFICATION_ELEMENTS, SECTION_ORDER } from "./sections";

describe("sections", () => {
	test("canonical order has 13 sections in the schema's completionStatus order", () => {
		expect(SECTION_ORDER).toEqual([
			"metrics", "economicBuyer", "decisionCriteria", "decisionProcess", "paperProcess",
			"implicateThePain", "champion", "competition",
			"threeWhys", "stakeholders", "salesStrategy", "closePlan", "team",
		]);
	});
	test("qualification elements are the first 8", () => {
		expect(QUALIFICATION_ELEMENTS).toEqual(SECTION_ORDER.slice(0, 8));
	});
});
