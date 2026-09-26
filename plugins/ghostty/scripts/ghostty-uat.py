#!/usr/bin/env python3
# ruff: noqa: D103, EM101, EM102, PTH101, S603, T201, TRY301
"""Run an interactive command in a real PTY and retain sanitized UAT evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import pty
import re
import select
import signal
import subprocess
import time
from typing import Any

REDACTIONS = (
    re.compile(r"(?i)(token|password|passwd|secret|authorization)=([^\s]+)"),
    re.compile(r"(?i)(bearer)\s+[^\s]+"),
)


class HarnessError(RuntimeError):
    """A deterministic UAT harness failure."""


def sanitize(value: str) -> str:
    for pattern in REDACTIONS:
        value = pattern.sub(lambda match: f"{match.group(1)}=[REDACTED]", value)
    return value


def write_private(path: pathlib.Path, content: bytes) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(descriptor, content)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.chmod(path, 0o600)


def read_scenario(path: pathlib.Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, UnicodeError) as error:
        raise HarnessError("scenario_invalid") from error
    if not isinstance(value, dict):
        raise HarnessError("scenario_invalid")
    argv = value.get("argv")
    if (
        not isinstance(argv, list)
        or not argv
        or not all(isinstance(item, str) and item for item in argv)
    ):
        raise HarnessError("scenario_argv_invalid")
    if not isinstance(value.get("steps", []), list) or not isinstance(
        value.get("required", []), list
    ):
        raise HarnessError("scenario_gates_invalid")
    return value


def _read_available(master: int, transcript: bytearray, timeout: float) -> bool:
    readable, _, _ = select.select([master], [], [], timeout)
    if not readable:
        return False
    try:
        chunk = os.read(master, 65536)
    except OSError:
        return False
    transcript.extend(chunk)
    return bool(chunk)


def _wait_for(
    master: int, transcript: bytearray, expected: str, deadline: float
) -> None:
    while expected not in transcript.decode("utf-8", errors="replace"):
        if time.monotonic() >= deadline:
            raise HarnessError(f"wait_gate_failed:{expected}")
        _read_available(master, transcript, min(0.2, deadline - time.monotonic()))


def run_scenario(scenario: dict[str, Any], timeout: float) -> tuple[int, str]:
    master, slave = pty.openpty()
    transcript = bytearray()
    process = subprocess.Popen(
        scenario["argv"],
        stdin=slave,
        stdout=slave,
        stderr=slave,
        start_new_session=True,
        close_fds=True,
    )
    os.close(slave)
    deadline = time.monotonic() + timeout
    try:
        for step in scenario.get("steps", []):
            if not isinstance(step, dict) or not isinstance(step.get("wait_for"), str):
                raise HarnessError("scenario_step_invalid")
            _wait_for(master, transcript, step["wait_for"], deadline)
            send = step.get("send", "")
            if not isinstance(send, str):
                raise HarnessError("scenario_step_invalid")
            os.write(master, send.encode())
        while process.poll() is None and time.monotonic() < deadline:
            _read_available(master, transcript, 0.2)
        if process.poll() is None:
            raise HarnessError("process_timeout")
        while _read_available(master, transcript, 0.05):
            pass
    except Exception:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
        raise
    finally:
        os.close(master)
    return process.returncode, sanitize(transcript.decode("utf-8", errors="replace"))


def execute(
    scenario_path: pathlib.Path, evidence: pathlib.Path, timeout: float
) -> dict[str, Any]:
    evidence.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(evidence, 0o700)
    scenario = read_scenario(scenario_path)
    exit_code, transcript = run_scenario(scenario, timeout)
    transcript_bytes = transcript.encode()
    write_private(evidence / "transcript.txt", transcript_bytes)
    required = scenario.get("required", [])
    gates = {item: isinstance(item, str) and item in transcript for item in required}
    passed = exit_code == 0 and all(gates.values())
    result = {
        "command": pathlib.Path(scenario["argv"][0]).name,
        "exit_code": exit_code,
        "gates": gates,
        "pty": True,
        "status": "PASS" if passed else "FAIL",
        "transcript_sha256": hashlib.sha256(transcript_bytes).hexdigest(),
    }
    write_private(
        evidence / "result.json",
        (json.dumps(result, sort_keys=True, separators=(",", ":")) + "\n").encode(),
    )
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    run_parser = subparsers.add_parser("run")
    run_parser.add_argument("--scenario", type=pathlib.Path, required=True)
    run_parser.add_argument("--evidence-dir", type=pathlib.Path, required=True)
    run_parser.add_argument("--timeout", type=float, default=300)
    arguments = parser.parse_args()
    try:
        result = execute(arguments.scenario, arguments.evidence_dir, arguments.timeout)
    except (HarnessError, OSError) as error:
        print(json.dumps({"reason": str(error), "status": "FAIL"}, sort_keys=True))
        return 1
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
