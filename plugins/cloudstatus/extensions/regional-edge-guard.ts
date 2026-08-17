import type { ExtensionAPI } from "@f5-sales-demo/xcsh";

const LOCATION_SKILL = /cloudstatus(?:[:/])location\b/i;
const REGIONAL_EDGE = /\bregional\s+edges?\b/i;
const COLLECTOR = /^\s*python3\s+skill:\/\/cloudstatus:network-intelligence\/scripts\/network_lookup\.py\s+(locations\s+--format\s+map-v1|location)\s+"\$CLOUDSTATUS_QUERY"\s*$/;

type WorkflowState = {
	active: boolean;
	skillRead: boolean;
	collector: "map" | "factual" | undefined;
	rendered: boolean;
};

function freshState(): WorkflowState {
	return { active: false, skillRead: false, collector: undefined, rendered: false };
}

function inputText(input: Record<string, unknown>): string {
	try {
		return JSON.stringify(input);
	} catch {
		return "";
	}
}

function blocked(reason: string) {
	return { block: true, reason: `Cloudstatus Regional Edge guard: ${reason}` };
}

/**
 * Enforce the Regional Edge registry-only workflow at the tool boundary.
 *
 * This deliberately activates only for the location skill or an attempted task/search
 * containing Regional Edge language, so ordinary network-intelligence work is unaffected.
 */
export default function regionalEdgeGuard(pi: ExtensionAPI): void {
	let state = freshState();

	pi.on("session_start", () => {
		state = freshState();
	});

	pi.on("tool_call", event => {
		const text = inputText(event.input);
		if (event.toolName === "read" && LOCATION_SKILL.test(text)) {
			state.active = true;
			state.skillRead = true;
			return undefined;
		}

		if ((event.toolName === "task" || event.toolName === "web_search") && REGIONAL_EDGE.test(text)) {
			state.active = true;
			return blocked("use cloudstatus:location and its direct registry collector; do not delegate or search");
		}

		if (!state.active) return undefined;

		if (event.toolName === "task" || event.toolName === "web_search" || event.toolName === "display_media") {
			return blocked("this workflow does not permit delegation, web search, or display media");
		}

		if (event.toolName === "bash") {
			const command = String(event.input.command ?? "");
			const match = command.match(COLLECTOR);
			if (!state.skillRead) return blocked("read cloudstatus:location before invoking the registry collector");
			if (!match) return blocked("only the direct network_lookup.py registry collector is allowed");
			if (state.collector) return blocked("the registry collector may run exactly once per request");
			state.collector = match[1].startsWith("locations") ? "map" : "factual";
			return undefined;
		}

		if (event.toolName === "render_map") {
			if (state.collector !== "map") return blocked("render_map requires locations --format map-v1, not a factual location call");
			if (state.rendered) return blocked("render_map may run exactly once per request");
			state.rendered = true;
		}

		return undefined;
	});
}
