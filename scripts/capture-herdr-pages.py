#!/usr/bin/env python3
"""Capture every native visible page for completed renderer frames in an owned pane."""
# CLI filenames follow repository conventions; orchestration keeps one lifecycle owner.
# pylint: disable=invalid-name,too-many-locals,too-many-statements

import argparse
import hashlib
import json
import os
import subprocess
import time
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

spec = spec_from_file_location(
    "capture_driver", Path(__file__).with_name("drive-salesforce-capture.py")
)
if spec is None or spec.loader is None:
    msg = "Native capture driver cannot be loaded"
    raise ImportError(msg)
driver = module_from_spec(spec)
spec.loader.exec_module(driver)


def main() -> None:
    """Run the explicitly scoped capture workflow."""
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("--pane", required=True)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    if os.environ.get("HERDR_ENV") != "1":
        msg = "Managed Herdr binding required"
        raise RuntimeError(msg)
    root = args.root.resolve()
    ready = json.loads((root / "ready.json").read_text())
    actual = ready["terminalColumns"]
    height = (
        json.loads(
            next(
                (root / "frames").glob("query-zero-xcsh-dark-unicode-40-C.json")
            ).read_text()
        )["terminalRows"]
        - 4
    )
    out = root / "pages"
    out.mkdir(mode=0o700, exist_ok=True)
    original = [
        p
        for p in sorted((root / "frames").glob("*.json"))
        if not p.name.startswith("progress-") and "-page-" not in p.name
    ]
    count = 0
    failures = []
    with (root / "page-inspection.jsonl").open("a") as journal:
        for path in original:
            frame = json.loads(path.read_text())
            if frame["width"] not in [40, 76, 120, 153, actual]:
                continue
            visible = frame
            if frame["width"] > actual:
                counterpart = (
                    root / "frames" / path.name.replace("-153-", f"-{actual}-")
                )
                visible = json.loads(counterpart.read_text())
            for offset in range(0, len(visible["lines"]), height):
                identifier = frame["id"] + "-page-" + str(offset)
                control = {
                    "id": identifier,
                    "case": frame["case"],
                    "theme": frame["theme"],
                    "preset": frame["preset"],
                    "width": frame["width"],
                    "expanded": frame["expanded"],
                    "scroll": offset,
                }
                driver.atomic(root / "control.json", control)
                driver.wait(root, identifier)
                data = b""
                for _ in range(10):
                    time.sleep(0.06)
                    data = subprocess.check_output(  # noqa: S603 - argv is fixed or comes from the owner-controlled capture protocol
                        [  # noqa: S607 - argv is fixed or comes from the owner-controlled capture protocol
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
                    if identifier in driver.plain(data.decode()):
                        break
                matched = identifier in driver.plain(data.decode())
                (out / (identifier + ".ansi")).write_bytes(data)
                result = {
                    "id": identifier,
                    "sourceFrame": frame["id"],
                    "offset": offset,
                    "declaredWidth": frame["width"],
                    "visibleWidth": min(frame["width"], actual),
                    "visibleRows": height,
                    "nativeMarkerObserved": matched,
                    "sha256": hashlib.sha256(data).hexdigest(),
                }
                journal.write(json.dumps(result) + "\n")
                journal.flush()
                if not matched:
                    failures.append(identifier)
                count += 1
                if count % 50 == 0:
                    print(
                        f"NATIVE_PAGES captured={count} failed={len(failures)}",
                        flush=True,
                    )
                if args.limit and count >= args.limit:
                    return
    driver.atomic(
        root / "page-summary.json",
        {
            "pages": count,
            "failures": failures,
            "nativeTerminalColumns": actual,
            "requestedWidths": [40, 76, 120, 153],
            "viewportQualification": "actual width captured independently; wider renderer frames preserved in full buffers",
        },
    )
    print(f"NATIVE_PAGES_COMPLETE captured={count} failed={len(failures)}", flush=True)


if __name__ == "__main__":
    main()
