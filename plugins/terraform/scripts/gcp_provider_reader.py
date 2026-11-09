"""One-shot original provider process reader for the compiled GCP controller."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import stat
import sys
import time
from dataclasses import asdict
from pathlib import Path
from typing import TYPE_CHECKING, NoReturn, TypeGuard, cast

if TYPE_CHECKING:
    from collections.abc import Callable

    from .gcp_provider_process import OriginalProviderCandidates, ProviderCandidate

FILE_FIELDS = ("dev", "ino", "uid", "nlink", "mode", "size", "mtimeNs", "ctimeNs")
PARENT_FIELDS = ("dev", "ino", "uid", "mode")
LIMIT = 65536
ASCII_GRAPHIC_MIN = 32
ASCII_DELETE = 127
ARGUMENT_COUNT = 5
ORIGINAL_BUDGET_MS = 7200000
FINAL_RESERVE_MS = 300000
PINS = {
    "bootstrap": "aac3ade3f7d90fbf63e3ea0c46120a0cfbd159e1e503dde04721979507a1548b",
    "terraform": "00a240950f88f51a03ad90975f1647737e40ddcd5df30a703fd840aa07dccced",
    "provider": "1c620693bca3fe61c3b8ce8d313f3c6dc35648f2246784e5d92fe3d22e0dfd9f",
}


def reject(message: str) -> NoReturn:
    """Refuse malformed or changed original inputs without printing private values."""
    raise ValueError(message)


def identity(value: os.stat_result) -> dict[str, str]:
    """Use the same decimal fields as the original installed context."""
    return {
        "dev": str(value.st_dev),
        "ino": str(value.st_ino),
        "uid": str(value.st_uid),
        "nlink": str(value.st_nlink),
        "mode": str(value.st_mode),
        "size": str(value.st_size),
        "mtimeNs": str(value.st_mtime_ns),
        "ctimeNs": str(value.st_ctime_ns),
    }


def canonical(path: str) -> Path:
    """Require a canonical absolute original path without controls."""
    value = Path(path)
    if (
        not value.is_absolute()
        or value.resolve(strict=True) != value
        or any(ord(v) < ASCII_GRAPHIC_MIN or ord(v) == ASCII_DELETE for v in path)
    ):
        reject("Original canonical input path required")
    return value


def read_owned(path: Path, maximum: int, *, private: bool = False) -> bytes:
    """Read immutable owned bytes through one original no-follow descriptor."""
    before = path.lstat()
    if (
        not stat.S_ISREG(before.st_mode)
        or before.st_uid != os.getuid()
        or before.st_nlink != 1
        or before.st_mode & (0o077 if private else 0o022)
        or not 0 < before.st_size <= maximum
    ):
        reject("Original owned single-link input required")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        if identity(os.fstat(stream.fileno())) != identity(before):
            reject("Original input changed during open")
        raw = stream.read(maximum + 1)
        if identity(os.fstat(stream.fileno())) != identity(before) or identity(
            path.lstat()
        ) != identity(before):
            reject("Original input changed during read")
    return raw


def ensure_reader_session() -> None:
    """Keep an executor-created original session; create one only if needed."""
    if os.getsid(0) != os.getpid():
        if os.getpgrp() == os.getpid():
            reject("Original provider reader session ownership is ambiguous")
        os.setsid()
    if os.getpgrp() != os.getpid():
        reject("Original provider reader process group required")


def exact_integer(value: object) -> TypeGuard[int]:
    """JSON clock integers exclude booleans and floating-point values."""
    value_type = type(value)
    return isinstance(value, int) and value_type is int


def require_capture_budget(request: dict[str, object], now: int) -> int:
    """Keep the original operation budget and its separately supplied final reserve."""
    start, deadline = request.get("originalStartMs"), request.get("deadlineMs")
    if (
        not exact_integer(start)
        or not exact_integer(deadline)
        or deadline - start != ORIGINAL_BUDGET_MS
        or now < start
    ):
        reject("Original provider observation budget required")
    final = request.get("finalCapture")
    if final is not None:
        if not isinstance(final, dict):
            reject("Original final capture budget required")
        final_start, final_deadline = (
            final.get("finalStartedMs"),
            final.get("finalDeadlineMs"),
        )
        if (
            not exact_integer(final_start)
            or not exact_integer(final_deadline)
            or final_deadline - final_start != FINAL_RESERVE_MS
            or not start <= final_start <= now
        ):
            reject("Original final capture budget required")
        deadline = final_deadline
    if now >= deadline:
        reject("Original provider capture budget exhausted")
    return deadline


def inspect_executor(executor: dict[str, object]) -> tuple[bool, bool]:
    """Inspect original identity and group absence without selecting replacement PIDs."""
    transport = importlib.import_module(
        (__package__ or "xcsh_provider_capture") + ".guest_pty"
    )
    try:
        current = transport.process_identity(executor["pid"])
    except (FileNotFoundError, ProcessLookupError, ValueError):
        available = False
    else:
        if current != executor:
            reject("Original executor identity changed")
        available = True
    return available, transport.group_absent(executor)


def collect_cohort(
    executor: dict[str, object],
    discover: Callable[[], tuple[ProviderCandidate, ...]],
    *,
    assert_inputs: Callable[[], None] | None = None,
) -> tuple[bool, bool, tuple[ProviderCandidate, ...]]:
    """Accept an exit race only after independent original group absence."""
    if assert_inputs is not None:
        assert_inputs()
    available, closed = inspect_executor(executor)
    candidates: tuple[ProviderCandidate, ...] = ()
    if available:
        try:
            candidates = discover()
        except (FileNotFoundError, ProcessLookupError):
            if assert_inputs is not None:
                assert_inputs()
            available, closed = inspect_executor(executor)
            if available or not closed:
                raise
    if assert_inputs is not None:
        assert_inputs()
    return available, closed, candidates


def require_private_root(root: Path) -> None:
    """Keep the original request's owned private evidence directory."""
    parent = root.lstat()
    if (
        not stat.S_ISDIR(parent.st_mode)
        or parent.st_uid != os.getuid()
        or parent.st_mode & 0o077
    ):
        reject("Original private provider reader directory required")


def main() -> None:
    """Inspect one original provider cohort and exit naturally without signals."""
    os.umask(0o077)
    ensure_reader_session()
    if (
        len(sys.argv) != ARGUMENT_COUNT
        or sys.argv[1] != "--request"
        or sys.argv[3] != "--sha256"
    ):
        reject("Fixed provider reader arguments required")
    request_path = canonical(sys.argv[2])
    raw = read_owned(request_path, LIMIT, private=True)
    if hashlib.sha256(raw).hexdigest() != sys.argv[4]:
        reject("Original provider request bytes changed")
    request = json.loads(raw)
    root = request_path.parent
    require_private_root(root)
    if request.get("schemaVersion") != 1 or not isinstance(request.get("inputs"), dict):
        reject("Original provider reader admission required")
    deadline = require_capture_budget(request, time.monotonic_ns() // 1000000)

    def verify() -> None:
        """Recheck admitted file and parent identities around every witness."""
        if (
            hashlib.sha256(read_owned(request_path, LIMIT, private=True)).hexdigest()
            != sys.argv[4]
        ):
            reject("Original provider request changed")
        for binding in request["inputs"].values():
            path = canonical(binding["path"])
            current = identity(path.lstat())
            if any(
                current[key] != binding["expectedIdentity"][key] for key in FILE_FIELDS
            ):
                reject("Original admitted provider input identity changed")
            directory = path.parent.lstat()
            if (
                not stat.S_ISDIR(directory.st_mode)
                or directory.st_uid != os.getuid()
                or directory.st_mode & 0o022
                or any(
                    identity(directory)[key] != binding["expectedParentIdentity"][key]
                    for key in PARENT_FIELDS
                )
            ):
                reject("Original admitted provider input parent changed")
            if (
                hashlib.sha256(read_owned(path, 256 * 1024 * 1024)).hexdigest()
                != binding["sha256"]
            ):
                reject("Original admitted provider input bytes changed")

    verify()
    scripts = Path(__file__).resolve().parent
    for name in (
        "__init__.py",
        "guest_pty.py",
        "gcp_provider_process.py",
        "gcp_provider_reader.py",
    ):
        binding = request["inputs"].get("script:" + name)
        if binding is None or canonical(binding["path"]) != scripts / name:
            reject("All original provider reader sources required")
    for role, expected in PINS.items():
        binding = request["executables"][role]
        if binding["sha256"] != expected or not any(
            binding == value for value in request["inputs"].values()
        ):
            reject("Original qualified provider executable required")
    if Path(sys.executable).resolve() != canonical(
        request["executables"]["bootstrap"]["path"]
    ):
        reject("Original provider reader interpreter changed")
    spec = importlib.util.spec_from_file_location(
        "xcsh_provider_capture",
        scripts / "__init__.py",
        submodule_search_locations=[str(scripts)],
    )
    if spec is None or spec.loader is None:
        reject("Original provider reader package loader unavailable")
    package = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = package
    spec.loader.exec_module(package)
    monitor_module = importlib.import_module(
        "xcsh_provider_capture.gcp_provider_process"
    )
    transport = importlib.import_module("xcsh_provider_capture.guest_pty")
    reader = transport.process_identity(os.getpid())

    def discover() -> tuple[ProviderCandidate, ...]:
        """Admit a monitor only while inspecting this original cohort."""
        monitor = cast(
            "OriginalProviderCandidates",
            monitor_module.OriginalProviderCandidates(
                root / "provider-captures",
                request["executor"],
                executables=monitor_module.ProviderExecutables(
                    terraform=monitor_module.PinnedExecutable(
                        canonical(request["executables"]["terraform"]["path"]),
                        PINS["terraform"],
                    ),
                    provider=monitor_module.PinnedExecutable(
                        canonical(request["executables"]["provider"]["path"]),
                        PINS["provider"],
                    ),
                    bootstrap=monitor_module.PinnedExecutable(
                        canonical(request["executables"]["bootstrap"]["path"]),
                        PINS["bootstrap"],
                    ),
                ),
                assert_inputs=verify,
            ),
        )
        return monitor.discover()

    available, closed, candidates = collect_cohort(
        request["executor"], discover, assert_inputs=verify
    )
    verify()
    if time.monotonic_ns() // 1000000 >= deadline:
        reject("Original provider observation deadline exhausted")
    transport.record(
        root / "provider-result.private.json",
        {
            "schemaVersion": 1,
            "kind": "original-provider-cohort",
            "requestSha256": sys.argv[4],
            "executor": request["executor"],
            "reader": reader,
            "candidates": [asdict(value) for value in candidates],
            "executorAvailable": available,
            "executorGroupClosed": closed,
            "applyPhaseQualified": False,
            "signalsSent": False,
            "cloudSubmissions": 0,
        },
    )


if __name__ == "__main__":
    main()
