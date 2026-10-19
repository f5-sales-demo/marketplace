#!/usr/bin/env python3
"""Exercise appearance changes and retirement during owned synthetic executions."""

# Standalone CLI follows repository names.
# pylint: disable=invalid-name
import argparse
import importlib.util
import json
import time
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "driver", Path(__file__).with_name("drive-salesforce-capture.py")
)
if spec is None or spec.loader is None:
    raise ImportError(__file__)
WIDTH = 153
RETIREMENTS = 18
APPEARANCE_CHANGES = 54
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)


def main() -> None:
    """Retain independent per-tool active appearance and teardown receipts."""
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    cases = json.loads((root / "cases.json").read_text())[:6]
    failures = []
    for case in cases:
        for action in ["cancel", "context-replacement", "shutdown"]:
            identifier = case["id"] + "-" + action
            driver.atomic(
                root / "control.json",
                {
                    "id": identifier,
                    "case": case["id"],
                    "action": "repeat",
                    "theme": "xcsh-dark",
                    "preset": "unicode",
                    "width": 153,
                    "expanded": False,
                },
            )
            time.sleep(0.3)
            for index, (theme, preset) in enumerate(
                [
                    ("xcsh-light", "ascii"),
                    ("xcsh-dark", "nerd"),
                    ("xcsh-light", "unicode"),
                ]
            ):
                switch = identifier + "-switch-" + str(index)
                driver.atomic(
                    root / "control.json",
                    {
                        "id": switch,
                        "action": "appearance",
                        "theme": theme,
                        "preset": preset,
                        "width": 153,
                    },
                )
                driver.wait(root, switch)
                frame = json.loads((root / "frames" / (switch + ".json")).read_text())
                if frame["terminalColumns"] < WIDTH or any(
                    driver.columns(line) > WIDTH for line in frame["lines"]
                ):
                    failures.append(switch)
            retired = identifier + "-retire"
            driver.atomic(root / "control.json", {"id": retired, "action": action})
            driver.wait(root, retired)
            # Wait for the interrupted original controller to settle before another case.
            deadline = time.monotonic() + 30
            while not (root / "frames" / (identifier + ".json")).exists():
                if time.monotonic() > deadline:
                    msg = "Interrupted capture did not settle"
                    raise TimeoutError(msg)
                time.sleep(0.04)
            print("ACTIVE_CAPTURE " + identifier, flush=True)
    manifest = json.loads((root / "manifest.json").read_text())
    if len(manifest["appearance"]) != APPEARANCE_CHANGES or not all(
        row["active"] for row in manifest["appearance"]
    ):
        failures.append("appearance-count-or-inactive")
    if len(manifest["teardown"]) != RETIREMENTS or not all(
        row["aborted"]
        and row["lateUpdatesRejected"] == 1
        and row["repaintsAfterRetirement"] == 0
        for row in manifest["teardown"]
    ):
        failures.append("retirement-count-or-late-repaint")
    driver.atomic(
        root / "active-summary.json",
        {
            "appearance": len(manifest["appearance"]),
            "retirements": len(manifest["teardown"]),
            "failureCount": len(failures),
            "failures": failures,
            "runtimeVersion": manifest["runtimeVersion"],
            "pluginVersion": manifest["pluginVersion"],
            "evidenceTier": "installed-native-renderer-with-synthetic-service",
        },
    )
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
