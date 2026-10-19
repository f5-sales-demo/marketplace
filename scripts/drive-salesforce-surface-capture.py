#!/usr/bin/env python3
"""Observe each expanded viewport page in an owned installed-native session."""

# Standalone script follows repository CLI conventions.
# pylint: disable=invalid-name
import argparse
import importlib.util
import json
import subprocess
import time
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "driver", Path(__file__).with_name("drive-salesforce-capture.py")
)
if spec is None or spec.loader is None:
    raise ImportError(__file__)
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)


def main() -> None:
    """Capture every page and compare each observation against the native frame."""
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("--pane", required=True)
    args = parser.parse_args()
    root = args.root.resolve()
    ready = json.loads((root / "ready.json").read_text())
    cases = json.loads((root / "cases.json").read_text())
    failures = []
    pages = 0
    with (root / "surface-inspection.jsonl").open("a") as findings:
        for preset in ["unicode", "ascii", "nerd"]:
            for theme in ["xcsh-dark", "xcsh-light"]:
                for case in cases[:6]:
                    for width in [40, 76, 120, 153]:
                        offset = 0
                        while True:
                            identifier = (
                                f"scroll-{case['id']}-{theme}-{preset}-{width}-{offset}"
                            )
                            driver.atomic(
                                root / "control.json",
                                {
                                    "id": identifier,
                                    "case": case["id"],
                                    "theme": theme,
                                    "preset": preset,
                                    "width": width,
                                    "expanded": True,
                                    "scroll": offset,
                                },
                            )
                            driver.wait(root, identifier)
                            frame = json.loads(
                                (root / "frames" / (identifier + ".json")).read_text()
                            )
                            time.sleep(0.12)
                            observation = subprocess.check_output(  # noqa: S603 - owner-controlled pane and fixed argv
                                [  # noqa: S607 - inherited verified Herdr CLI
                                    "herdr",
                                    "pane",
                                    "read",
                                    args.pane,
                                    "--source",
                                    "visible",
                                    "--lines",
                                    "60",
                                    "--format",
                                    "ansi",
                                ]
                            )
                            (root / "visible" / (identifier + ".ansi")).parent.mkdir(
                                mode=0o700, exist_ok=True
                            )
                            (root / "visible" / (identifier + ".ansi")).write_bytes(
                                observation
                            )
                            actual = driver.plain(observation.decode()).splitlines()
                            # Independent terminal viewport must contain every requested native row.
                            expected = [
                                driver.plain(line).rstrip()
                                for line in frame["viewport"]["rows"]
                            ]
                            actual = [line.rstrip() for line in actual]
                            passed = frame["terminalColumns"] >= width and all(
                                line in actual for line in expected
                            )
                            finding = {
                                "id": identifier,
                                "passed": passed,
                                "offset": frame["viewport"]["offset"],
                                "totalLines": frame["viewport"]["totalLines"],
                                "pageLines": len(expected),
                            }
                            findings.write(json.dumps(finding) + "\n")
                            findings.flush()
                            if not passed:
                                failures.append(identifier)
                            pages += 1
                            if frame["viewport"]["offset"] + len(expected) >= len(
                                frame["lines"]
                            ):
                                break
                            offset += max(1, len(expected) - 1)
                    print(
                        f"SURFACE_CAPTURE case={case['id']} pages={pages} failures={len(failures)}",
                        flush=True,
                    )
    driver.atomic(
        root / "surface-summary.json",
        {
            "pages": pages,
            "failureCount": len(failures),
            "failures": failures,
            "runtimeVersion": ready["runtimeVersion"],
            "pluginVersion": ready["pluginVersion"],
        },
    )
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
