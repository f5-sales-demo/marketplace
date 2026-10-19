#!/usr/bin/env python3
"""Inspect real workflow messages rendered by the published native components."""

# CLI filename follows repository conventions.
# pylint: disable=invalid-name
import argparse
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "driver", Path(__file__).with_name("drive-salesforce-capture.py")
)
if spec is None or spec.loader is None:
    raise ImportError(__file__)
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)


def main() -> None:
    """Capture each appearance and reject overflow or missing native evidence."""
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    cases = json.loads((root / "cases.json").read_text())
    findings = []
    for preset in ["unicode", "ascii", "nerd"]:
        for theme in ["xcsh-dark", "xcsh-light"]:
            for case in cases:
                for expanded in [False, True]:
                    for width in [40, 76, 120, 153]:
                        identifier = f"{case['id']}-{theme}-{preset}-{width}-{'E' if expanded else 'C'}"
                        driver.atomic(
                            root / "control.json",
                            {
                                "id": identifier,
                                "case": case["id"],
                                "theme": theme,
                                "preset": preset,
                                "width": width,
                                "expanded": expanded,
                            },
                        )
                        driver.wait(root, identifier)
                        frame = json.loads(
                            (root / "frames" / (identifier + ".json")).read_text()
                        )
                        passed = (
                            frame["terminalColumns"] >= width
                            and bool(frame["lines"])
                            and all(
                                driver.columns(line) <= width for line in frame["lines"]
                            )
                        )
                        findings.append(
                            {
                                "id": identifier,
                                "passed": passed,
                                "lineCount": len(frame["lines"]),
                            }
                        )
                        if len(findings) % 40 == 0:
                            print(
                                f"FRAME_PROGRESS frames={len(findings)} failed={sum(not item['passed'] for item in findings)}",
                                flush=True,
                            )
    driver.atomic(root / "workflow-frame-audit.json", findings)
    failures = [item for item in findings if not item["passed"]]
    print(json.dumps({"frames": len(findings), "failures": failures}), flush=True)
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
