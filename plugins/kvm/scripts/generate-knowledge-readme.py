#!/usr/bin/env python3
# ruff: noqa: D103, T201
"""Render the human KVM knowledge document from its canonical JSON ledger."""
# pylint: disable=invalid-name

import argparse
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]


def render() -> str:
    ledger = json.loads(
        (ROOT / "knowledge" / "ledger.json").read_text(encoding="utf-8")
    )
    lines = [
        "# KVM Secure Mesh Site v2",
        "",
        "This document is generated from `knowledge/ledger.json`. Edit the ledger, then regenerate this file.",
        "",
        "## Fixed contract",
        "",
        "The plugin owns one Ubuntu 24.04 x86_64 KVM deployment: one 8-vCPU, 32-GiB, 100-GiB dual-NIC Secure Mesh CE; isolated NAT SLO, physical home-LAN SLI, one inside-VIP HTTP LB, one private origin pool, one deterministic workload, and one FRR peer. Namespace is `system`; there are no AppStack, public-cloud, legacy-image, or external-workspace paths. See `NETWORKING.md` for rollback, DHCP, and external-client acceptance limits.",
        "",
        "## Validated knowledge",
        "",
    ]
    for entry in ledger["entries"]:
        lines.extend(
            [
                f"### {entry['id']}: {entry['category']}",
                "",
                f"- Hypothesis: {entry['hypothesis']}",
                f"- Experiment: {entry['experiment']}",
                f"- Sanitized evidence: {entry['evidence']}",
                f"- Outcome: {entry['outcome']}",
                f"- Root cause: {entry['rootCause']}",
                f"- Rejected: {', '.join(entry['rejectedApproaches'])}",
                f"- Correction: {entry['correction']}",
                f"- Plugin requirement: {entry['pluginRequirement']}",
                f"- Automated test: {entry['automatedTest']}",
                f"- Live acceptance: {entry['liveAcceptance']}",
                f"- References: {', '.join(entry['references'])}",
                "",
            ]
        )
    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--stdout", action="store_true")
    args = parser.parse_args()
    OUTPUT = render()
    if args.stdout:
        print(OUTPUT, end="")
    else:
        (ROOT / "README.md").write_text(OUTPUT, encoding="utf-8")
