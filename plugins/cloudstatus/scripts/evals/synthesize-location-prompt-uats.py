#!/usr/bin/env python3
# pylint: disable=invalid-name,line-too-long,missing-function-docstring
# ruff: noqa: D103, EM101, EM102, T201, TRY003
"""Generate controlled live-UAT variants for the Regional Edge address-map regression."""

from __future__ import annotations

import argparse
import json

EXACT_ADDRESS_MAP_PROMPT = "show me a map of all the address locations of the F5 regional edges that are located in the united states"

ADDRESS_MAP_VARIANTS = (
    EXACT_ADDRESS_MAP_PROMPT,
    "Show a map of every address location for F5 Regional Edges located in the United States.",
    "Map all United States address locations of the F5 Distributed Cloud Regional Edges.",
    "I need a map of all United States address locations for F5 Regional Edges; use United States as the registry filter and do not research addresses one by one.",
)


def synthesize(scenario_id: str, count: int) -> list[dict[str, str]]:
    """Return deterministic, semantically equivalent prompts for one live scenario."""
    if scenario_id != "visual-address-us":
        raise ValueError(
            f"prompt synthesis is only defined for visual-address-us, not {scenario_id}"
        )
    if count < 1:
        raise ValueError("count must be positive")
    return [
        {
            "id": scenario_id,
            "prompt": ADDRESS_MAP_VARIANTS[index % len(ADDRESS_MAP_VARIANTS)],
        }
        for index in range(count)
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", default="visual-address-us")
    parser.add_argument("--count", type=int, default=4)
    args = parser.parse_args()
    for item in synthesize(args.scenario, args.count):
        print(json.dumps(item))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
