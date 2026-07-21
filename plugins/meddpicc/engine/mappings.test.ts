import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { checkMappings } from "./mappings";

const dir = path.join(import.meta.dir, "..");
const schema = JSON.parse(await Bun.file(path.join(dir, "schema", "meddpicc-schema.json")).text());
const refs = path.join(dir, "skills", "deal-qualification", "references");
const cell = JSON.parse(await Bun.file(path.join(refs, "cell-mapping.json")).text());
const sfdc = JSON.parse(await Bun.file(path.join(refs, "sfdc-field-mapping.json")).text());

describe("checkMappings", () => {
	test("shipped mappings conform to the schema", () => {
		const r = checkMappings(schema, cell, sfdc);
		expect(r.failures_debug ?? r).toBeDefined(); // keep output visible on failure
		expect(r.ok).toBe(true);
		expect(r.cell.failures).toEqual([]);
		expect(r.sfdc.failures).toEqual([]);
	});
	test("detects a broken cell jsonPath", () => {
		const broken = structuredClone(cell);
		broken.staticFields[0].jsonPath = `${broken.staticFields[0].jsonPath}TYPO`;
		const r = checkMappings(schema, broken, sfdc);
		expect(r.ok).toBe(false);
		expect(r.cell.failures.some(f => f.endsWith("TYPO"))).toBe(true);
	});
});
