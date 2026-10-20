#!/usr/bin/env python3
"""Observe selected expanded viewport pages in an owned installed-native session."""

# Standalone script follows repository CLI conventions.
# pylint: disable=invalid-name
import argparse
import gzip
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


def capture_page(
    root: Path,
    pane: str,
    identifier: str,
    width: int,
    geometry: tuple[int, int] | None = None,
) -> dict:
    """Retain a compressed frame and independently inspect its visible rows."""
    frame = json.loads((root / "frames" / (identifier + ".json")).read_text())
    frame_path = root / "frames" / (identifier + ".json")
    packed = gzip.compress(frame_path.read_bytes())
    archive = frame_path.with_suffix(".json.gz")
    archive.write_bytes(packed)
    if gzip.decompress(archive.read_bytes()) != frame_path.read_bytes():
        message = "Capture compression verification failed"
        raise RuntimeError(message)
    frame_path.unlink()
    time.sleep(0.12)
    observation = subprocess.check_output(  # noqa: S603 - owner-controlled pane and fixed argv
        [  # noqa: S607 - inherited verified Herdr CLI
            "herdr",
            "pane",
            "read",
            pane,
            "--source",
            "visible",
            "--lines",
            "60",
            "--format",
            "ansi",
        ]
    )
    (root / "visible" / (identifier + ".ansi")).parent.mkdir(mode=0o700, exist_ok=True)
    (root / "visible" / (identifier + ".ansi")).write_bytes(observation)
    actual = driver.plain(observation.decode()).splitlines()
    # Independent terminal viewport must contain every requested native row.
    expected = [driver.plain(line).rstrip() for line in frame["viewport"]["rows"]]
    actual = [line.rstrip() for line in actual]
    geometry_matches = (
        geometry is None
        or (frame.get("terminalColumns"), frame.get("terminalRows")) == geometry
    )
    passed = (
        geometry_matches
        and frame["terminalColumns"] >= width
        and all(line in actual for line in expected)
    )
    return {
        "id": identifier,
        "passed": passed,
        "geometryMatches": geometry_matches,
        "offset": frame["viewport"]["offset"],
        "totalLines": frame["viewport"]["totalLines"],
        "pageLines": len(expected),
    }


def terminal_geometry(
    root: Path, ready: dict, geometry_frame: str | None
) -> tuple[int, int]:
    """Bind scrolling to readiness or explicit fresh same-installation evidence."""
    columns = driver.terminal_allocation(
        root, ready, geometry_frame, [ready["terminalColumns"]]
    )
    evidence = ready
    if geometry_frame:
        evidence = json.loads((root / "frames" / geometry_frame).read_text())
    height = evidence.get("terminalRows")
    if not isinstance(height, int) or isinstance(height, bool) or height < 1:
        message = "Terminal height missing or invalid; supply a fresh --geometry-frame"
        raise ValueError(message)
    return columns, height


def next_page_offset(finding: dict, policy: str) -> int | None:
    """Choose exhaustive pages or representative boundaries, middle, and final rows."""
    if policy not in {"full", "representative"}:
        message = f"Unknown page policy: {policy}"
        raise ValueError(message)
    offset = finding["offset"]
    page_lines = finding["pageLines"]
    total_lines = finding["totalLines"]
    if offset + page_lines >= total_lines:
        return None
    stride = max(1, page_lines - 1)
    last = total_lines - page_lines
    if policy == "full" or last <= 3 * stride:
        return offset + stride
    return next(
        value for value in (stride, last // 2, last - stride, last) if value > offset
    )


def main() -> None:
    """Compare each selected observation against its complete native frame."""
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("--pane", required=True)
    parser.add_argument("--all-cases", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument(
        "--page-policy", choices=["full", "representative"], default="full"
    )
    parser.add_argument("--geometry-frame", help="Fresh native geometry frame filename")
    args = parser.parse_args()
    root = args.root.resolve()
    ready = json.loads((root / "ready.json").read_text())
    geometry = terminal_geometry(root, ready, args.geometry_frame)
    cases = json.loads((root / "cases.json").read_text())
    previous = []
    if args.resume and (root / "surface-inspection.jsonl").exists():
        previous = [
            json.loads(line)
            for line in (root / "surface-inspection.jsonl").read_text().splitlines()
        ]
    completed = {item["id"]: item for item in previous if item["passed"]}
    failures = []
    pages = 0
    reused_pages = 0
    with (root / "surface-inspection.jsonl").open("a") as findings:
        for preset in ["unicode", "ascii", "nerd"]:
            for theme in ["xcsh-dark", "xcsh-light"]:
                for case in cases if args.all_cases else cases[:6]:
                    for width in [40, 76, 120, 153]:
                        offset = 0
                        while True:
                            identifier = (
                                f"scroll-{case['id']}-{theme}-{preset}-{width}-{offset}"
                            )
                            prior = completed.get(identifier)
                            if prior:
                                pages += 1
                                reused_pages += 1
                                offset = next_page_offset(prior, args.page_policy)
                                if offset is None:
                                    break
                                continue
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
                            finding = capture_page(
                                root, args.pane, identifier, width, geometry
                            )
                            findings.write(json.dumps(finding) + "\n")
                            findings.flush()
                            if not finding["passed"]:
                                failures.append(identifier)
                            pages += 1
                            offset = next_page_offset(finding, args.page_policy)
                            if offset is None:
                                break
                    print(
                        f"SURFACE_CAPTURE case={case['id']} pages={pages} failures={len(failures)}",
                        flush=True,
                    )
    driver.atomic(
        root / "surface-summary.json",
        {
            "pages": pages,
            "reusedPages": reused_pages,
            "pagePolicy": args.page_policy,
            "failureCount": len(failures),
            "failures": failures,
            "runtimeVersion": ready.get("runtimeVersion", "not-declared"),
            "pluginVersion": ready.get("pluginVersion", "not-declared"),
        },
    )
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
