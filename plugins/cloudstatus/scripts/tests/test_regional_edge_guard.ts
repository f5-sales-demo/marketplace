import { describe, expect, it } from "bun:test";
import regionalEdgeGuard from "../../extensions/regional-edge-guard";

type ToolCallHandler = (event: { toolName: string; input: Record<string, unknown> }) => unknown;
type SessionStartHandler = () => unknown;

function guard() {
	let toolCall: ToolCallHandler | undefined;
	let sessionStart: SessionStartHandler | undefined;
	regionalEdgeGuard({
		on(event: string, handler: ToolCallHandler | SessionStartHandler) {
			if (event === "tool_call") toolCall = handler as ToolCallHandler;
			if (event === "session_start") sessionStart = handler as SessionStartHandler;
		},
	} as Parameters<typeof regionalEdgeGuard>[0]);
	return { call: (toolName: string, input: Record<string, unknown> = {}) => toolCall?.({ toolName, input }), reset: () => sessionStart?.() };
}

const locationSkill = { path: "skill://cloudstatus/location/SKILL.md" };
const mapCollector = { command: 'python3 skill://cloudstatus:network-intelligence/scripts/network_lookup.py locations --format map-v1 "$CLOUDSTATUS_QUERY"' };
const factualCollector = { command: 'python3 skill://cloudstatus:network-intelligence/scripts/network_lookup.py location "$CLOUDSTATUS_QUERY"' };

describe("Cloudstatus Regional Edge guard", () => {
	it("allows the one direct visual collector followed by one map", () => {
		const runtime = guard();
		expect(runtime.call("read", locationSkill)).toBeUndefined();
		expect(runtime.call("bash", mapCollector)).toBeUndefined();
		expect(runtime.call("render_map", { locations: [] })).toBeUndefined();
	});

	it("allows a factual collector but never a map", () => {
		const runtime = guard();
		runtime.call("read", locationSkill);
		expect(runtime.call("bash", factualCollector)).toBeUndefined();
		expect(runtime.call("render_map", { locations: [] })).toMatchObject({ block: true });
	});

	it("blocks delegation and search when Regional Edge text appears before the skill", () => {
		const runtime = guard();
		expect(runtime.call("task", { prompt: "research F5 Regional Edge addresses" })).toMatchObject({ block: true });
		expect(runtime.call("web_search", { query: "F5 Regional Edge locations" })).toMatchObject({ block: true });
	});

	it("blocks forbidden tools and arbitrary Bash after the location skill", () => {
		const runtime = guard();
		runtime.call("read", locationSkill);
		for (const [toolName, input] of [
			["task", { prompt: "delegate" }],
			["web_search", { query: "edge" }],
			["display_media", {}],
			["bash", { command: "curl https://example.test" }],
		] as const) {
			expect(runtime.call(toolName, input)).toMatchObject({ block: true });
		}
	});

	it("blocks duplicate collection plus premature and duplicate rendering", () => {
		const runtime = guard();
		runtime.call("read", locationSkill);
		expect(runtime.call("render_map", { locations: [] })).toMatchObject({ block: true });
		expect(runtime.call("bash", mapCollector)).toBeUndefined();
		expect(runtime.call("bash", mapCollector)).toMatchObject({ block: true });
		expect(runtime.call("render_map", { locations: [] })).toBeUndefined();
		expect(runtime.call("render_map", { locations: [] })).toMatchObject({ block: true });
	});

	it("resets for each top-level session and preserves ordinary network-intelligence delegation", () => {
		const runtime = guard();
		runtime.call("read", locationSkill);
		runtime.call("bash", factualCollector);
		expect(runtime.call("bash", factualCollector)).toMatchObject({ block: true });
		runtime.reset();
		expect(runtime.call("task", { prompt: "Investigate BGP paths for AS35280" })).toBeUndefined();
		expect(runtime.call("bash", factualCollector)).toBeUndefined();
	});
});
