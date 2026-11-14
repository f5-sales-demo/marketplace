"""Bounded original xcsh creation observation for the installed capture worker.

The request carries file bindings only. Independent kernel/SDK observations issue
the opaque process witnesses; neither requests nor results authorize execution.
"""

from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import os
import re
import stat
import sys
import time
from importlib.machinery import SourceFileLoader
from operator import is_
from pathlib import Path
from typing import TYPE_CHECKING, Any, NoReturn

if TYPE_CHECKING:
    from types import CodeType

LIMIT = 65536
MAX_INPUTS = 1024
MAX_TARGETS = 128
ORIGINAL_BUDGET_MS = 7200000
WINDOW_MS = 45000
STARTUP_MS = 15000
ARGUMENT_COUNT = 5
PRIVATE_FILE_MODE = 0o400
PRIVATE_DIRECTORY_MODE = 0o700
ASCII_GRAPHIC_MIN = 32
ASCII_DELETE = 127
MAX_FILE = 256 * 1024 * 1024
FILE_FIELDS = {"dev", "ino", "uid", "nlink", "mode", "size", "mtimeNs", "ctimeNs"}
PARENT_FIELDS = {"dev", "ino", "uid", "mode"}
PINS = {
    "bootstrap": "aac3ade3f7d90fbf63e3ea0c46120a0cfbd159e1e503dde04721979507a1548b",
    "terraform": "dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e",
    "xcsh": "542d99d1905fe03fadce8a889390751b3ad1531f367ef678cf03d97204ef7cc1",
}
SOURCE_NAMES = (
    "__init__.py",
    "guest_pty.py",
    "gcp_provider_process.py",
    "gcp_provider_reader.py",
    "xcsh_creation_observer.py",
    "xcsh_creation_reader.py",
)


def reject() -> NoReturn:
    """Refuse without exposing request, source or credential values."""
    message = "Original xcsh reader admission or evidence differs"
    raise ValueError(message)


def exact_native_type(value: object, expected: type) -> bool:
    """Require exact scalar types; bool and integer subclasses never become int."""
    return is_(type(value), expected)


def strict_object(raw: bytes) -> dict[str, Any]:
    """Require one UTF-8 JSON object with no duplicate keys or trailing bytes."""

    def pairs(rows: list[tuple[str, Any]]) -> dict[str, Any]:
        value: dict[str, Any] = {}
        for key, item in rows:
            if key in value:
                reject()
            value[key] = item
        return value

    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=pairs)
    except (ValueError, UnicodeDecodeError, RecursionError):
        reject()
    if not isinstance(value, dict):
        reject()
    return value


def canonical(path: object) -> Path:
    """Reject aliases, controls and noncanonical paths before opening an input."""
    if not isinstance(path, str) or any(
        ord(v) < ASCII_GRAPHIC_MIN or ord(v) == ASCII_DELETE for v in path
    ):
        reject()
    result = Path(path)
    if not result.is_absolute() or result.resolve(strict=True) != result:
        reject()
    return result


def identity(value: os.stat_result) -> dict[str, str]:
    """Retain exact decimal file metadata, including nanosecond change time."""
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


def read_original(path: Path, maximum: int = MAX_FILE) -> bytes:
    """Read one original owned single-link input through a no-follow descriptor."""
    before = path.lstat()
    if (
        not stat.S_ISREG(before.st_mode)
        or before.st_uid != os.getuid()
        or before.st_nlink != 1
        or before.st_mode & 0o022
        or not 0 < before.st_size <= maximum
    ):
        reject()
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        if identity(os.fstat(descriptor)) != identity(before):
            reject()
        with os.fdopen(descriptor, "rb", closefd=False) as stream:
            raw = stream.read(maximum + 1)
        if len(raw) != before.st_size or identity(os.fstat(descriptor)) != identity(
            before
        ):
            reject()
    finally:
        os.close(descriptor)
    if identity(path.lstat()) != identity(before):
        reject()
    return raw


def validate_bindings(rows: object) -> dict[str, dict[str, Any]]:
    """Admit exact binding shapes; no caller field can enable a capability."""
    if not isinstance(rows, dict) or not 0 < len(rows) <= MAX_INPUTS:
        reject()
    paths: dict[str, dict[str, Any]] = {}
    for key, row in rows.items():
        if not isinstance(key, str) or not isinstance(row, dict):
            reject()
        if (
            set(row) != {"path", "sha256", "expectedIdentity", "expectedParentIdentity"}
            or not isinstance(row["path"], str)
            or not row["path"].startswith("/")
        ):
            reject()
        if (
            not isinstance(row["sha256"], str)
            or re.fullmatch(r"[a-f0-9]{64}", row["sha256"]) is None
        ):
            reject()
        for field, keys in (
            ("expectedIdentity", FILE_FIELDS),
            ("expectedParentIdentity", PARENT_FIELDS),
        ):
            item = row[field]
            if (
                not isinstance(item, dict)
                or set(item) != keys
                or any(
                    not isinstance(value, str)
                    or re.fullmatch(r"(?:0|[1-9][0-9]*)", value) is None
                    for value in item.values()
                )
            ):
                reject()
        previous = paths.setdefault(row["path"], row)
        if previous != row:
            reject()
    return copy.deepcopy(rows)


def validate_executor(actor: object) -> None:
    """Require the exact original group/session identity and strict scalar types."""
    if not isinstance(actor, dict) or set(actor) != {"pid", "group", "start", "boot"}:
        reject()
    if (
        not exact_native_type(actor["pid"], int)
        or actor["pid"] <= 0
        or not exact_native_type(actor["group"], int)
        or actor["group"] != actor["pid"]
    ):
        reject()
    if (
        not isinstance(actor["start"], str)
        or re.fullmatch(r"[1-9][0-9]*", actor["start"]) is None
        or not isinstance(actor["boot"], str)
        or re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", actor["boot"])
        is None
    ):
        reject()


def validate_request(data: dict[str, Any], now: int) -> int:
    """Keep the exact original two-hour operation and a bounded 45-second read."""
    if set(data) != {
        "schemaVersion",
        "kind",
        "originalStartMs",
        "deadlineMs",
        "windowMs",
        "startupDeadlineMs",
        "executor",
        "executables",
        "inputs",
        "scope",
    }:
        reject()
    if (
        not exact_native_type(data["schemaVersion"], int)
        or data["schemaVersion"] != 1
        or data["kind"] != "original-xcsh-creation-window"
    ):
        reject()
    start, deadline, window = (
        data["originalStartMs"],
        data["deadlineMs"],
        data["windowMs"],
    )
    if (
        any(not exact_native_type(v, int) for v in (start, deadline, window, now))
        or deadline - start != ORIGINAL_BUDGET_MS
        or window != WINDOW_MS
        or not start <= now < deadline
    ):
        reject()
    startup = data["startupDeadlineMs"]
    if not exact_native_type(startup, int) or not now < startup <= min(
        deadline, now + STARTUP_MS
    ):
        reject()
    validate_executor(data["executor"])
    inputs = validate_bindings(data["inputs"])
    executables = data["executables"]
    if not isinstance(executables, dict) or set(executables) != set(PINS):
        reject()
    for role, digest in PINS.items():
        value = executables[role]
        if (
            not isinstance(value, dict)
            or set(value) != {"path", "sha256"}
            or value["sha256"] != digest
            or not any(
                value == {"path": row["path"], "sha256": row["sha256"]}
                for row in inputs.values()
            )
        ):
            reject()
    scope = data["scope"]
    if (
        not isinstance(scope, dict)
        or set(scope) != {"path", "sha256", "planSha256", "targets"}
        or not isinstance(scope["planSha256"], str)
        or re.fullmatch(r"[a-f0-9]{64}", scope["planSha256"]) is None
    ):
        reject()
    if not any(
        scope["path"] == row["path"] and scope["sha256"] == row["sha256"]
        for row in inputs.values()
    ):
        reject()
    if (
        not isinstance(scope["targets"], list)
        or not 0 < len(scope["targets"]) <= MAX_TARGETS
    ):
        reject()
    unique = set()
    for target in scope["targets"]:
        if (
            not isinstance(target, dict)
            or set(target) != {"type_name", "name", "namespace"}
            or target["type_name"] not in ("xcsh_token", "xcsh_securemesh_site_v2")
            or any(
                not isinstance(target[k], str)
                or re.fullmatch(r"[a-z0-9.-]{1,253}", target[k]) is None
                for k in ("name", "namespace")
            )
        ):
            reject()
        key = tuple(target[k] for k in ("type_name", "name", "namespace"))
        if key in unique:
            reject()
        unique.add(key)
    return min(deadline, now + window)


class OriginalCreationInputs:
    """Own a file snapshot and retain a permanent refusal on any later change."""

    def __init__(self, rows: dict[str, dict[str, Any]]) -> None:
        """Copy admitted identities instead of retaining mutable caller objects."""
        self.rows = validate_bindings(rows)
        self.refused = False
        self.checked: set[Path] = set()
        self.sources: dict[Path, bytes] = {}

    def verify(self) -> None:
        """Check every identity on every read; hash only unchanged original inputs."""
        if self.refused:
            reject()
        try:
            for key, row in self.rows.items():
                path = canonical(row["path"])
                before = path.lstat()
                if (
                    identity(before) != row["expectedIdentity"]
                    or before.st_uid != os.getuid()
                    or before.st_nlink != 1
                    or before.st_mode & 0o022
                ):
                    reject()
                parent = path.parent.lstat()
                if (
                    not stat.S_ISDIR(parent.st_mode)
                    or parent.st_uid != os.getuid()
                    or parent.st_mode & 0o022
                    or any(
                        identity(parent)[k] != row["expectedParentIdentity"][k]
                        for k in PARENT_FIELDS
                    )
                ):
                    reject()
                if path not in self.checked:
                    raw = read_original(path)
                    if hashlib.sha256(raw).hexdigest() != row["sha256"]:
                        reject()
                    if key.startswith("script:"):
                        self.sources[path] = raw
                    self.checked.add(path)
                if identity(path.lstat()) != identity(before):
                    reject()
        except (ValueError, OSError, KeyError, TypeError):
            self.refused = True
            reject()

    def source(self, path: Path) -> bytes:
        """Return only verified source buffers, never a Python bytecode cache."""
        self.verify()
        if path not in self.sources:
            reject()
        return self.sources[path]


class AdmittedCreationSourceLoader(SourceFileLoader):
    """Compile exact admitted module bytes using Python's standard loader."""

    def __init__(self, name: str, path: str, raw: bytes) -> None:
        """Retain one fixed module name and its verified source buffer."""
        super().__init__(name, path)
        self.raw = raw

    def get_code(self, fullname: str) -> CodeType:
        """Reject another module name and bypass every cached bytecode file."""
        if fullname != self.name:
            reject()
        return self.source_to_code(self.raw, self.path)


def load_modules(guard: OriginalCreationInputs) -> tuple[Any, Any]:
    """Load the distinct xcsh observer with shared file, kernel and SDK primitives."""
    scripts = Path(__file__).resolve().parent
    for filename in SOURCE_NAMES:
        binding = guard.rows.get("script:" + filename)
        if binding is None or canonical(binding["path"]) != scripts / filename:
            reject()
    for filename in SOURCE_NAMES[:-1]:
        stem = Path(filename).stem
        name = "xcsh_original_creation" + ("." + stem if stem != "__init__" else "")
        path = scripts / filename
        loader = AdmittedCreationSourceLoader(name, str(path), guard.source(path))
        spec = importlib.util.spec_from_file_location(
            name,
            path,
            loader=loader,
            submodule_search_locations=[str(scripts)] if stem == "__init__" else None,
        )
        if spec is None:
            reject()
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        loader.exec_module(module)
    guard.verify()
    return sys.modules["xcsh_original_creation.xcsh_creation_observer"], sys.modules[
        "xcsh_original_creation.guest_pty"
    ]


def ready_creation_receipts(
    observer: Any, witnesses: dict[int, Any]
) -> tuple[dict[str, Any], ...] | None:
    """Join only already-issued evidence, including after original group closure."""
    observer.check_inputs()
    for token in witnesses.values():
        issued = observer.witnesses.get(id(token))
        if issued is None or issued[0] is not token:
            message = "An originally issued xcsh creation witness is required"
            raise ValueError(message)
    covered = {
        claim.data["target"]["type_name"]
        + ":"
        + claim.data["target"]["namespace"]
        + ":"
        + claim.data["target"]["name"]
        for token in witnesses.values()
        for claim in observer.witnesses[id(token)][1]
        if (observer.directory / ("receipt-" + claim.data["nonce"] + ".json")).exists()
    }
    if len(covered) != len(observer.targets):
        return None
    return observer.complete(tuple(witnesses.values()))


def admit_reader_request() -> tuple[
    Path, dict[str, Any], int, int, OriginalCreationInputs
]:
    """Admit exact request, interpreter and source inputs before reader startup."""
    os.umask(0o077)
    if (
        len(sys.argv) != ARGUMENT_COUNT
        or sys.argv[1] != "--request"
        or sys.argv[3] != "--sha256"
    ):
        reject()
    path = canonical(sys.argv[2])
    raw = read_original(path, LIMIT)
    if (
        hashlib.sha256(raw).hexdigest() != sys.argv[4]
        or stat.S_IMODE(path.lstat().st_mode) != PRIVATE_FILE_MODE
    ):
        reject()
    root = path.parent
    parent = root.lstat()
    if (
        not stat.S_ISDIR(parent.st_mode)
        or parent.st_uid != os.getuid()
        or stat.S_IMODE(parent.st_mode) != PRIVATE_DIRECTORY_MODE
    ):
        reject()
    data = strict_object(raw)
    start = time.monotonic_ns() // 1000000
    deadline = validate_request(data, start)
    if Path(sys.executable).resolve() != canonical(
        data["executables"]["bootstrap"]["path"]
    ):
        reject()
    row = {
        "path": str(path),
        "sha256": sys.argv[4],
        "expectedIdentity": identity(path.lstat()),
        "expectedParentIdentity": {k: identity(parent)[k] for k in PARENT_FIELDS},
    }
    guard = OriginalCreationInputs({**data["inputs"], "original-reader-request": row})
    guard.verify()
    return root, data, start, deadline, guard


def prepare_creation_reader(
    root: Path,
    data: dict[str, Any],
    guard: OriginalCreationInputs,
    start: int,
    deadline: int,
) -> tuple[Any, Any, dict[str, Any]]:
    """Prepare the original observer and persist its unchanged ready receipt."""
    module, transport = load_modules(guard)
    if os.getsid(0) != os.getpid():
        if os.getpgrp() == os.getpid():
            reject()
        os.setsid()
    reader = transport.process_identity(os.getpid())
    process = sys.modules["xcsh_original_creation.gcp_provider_process"]
    executables = {
        key: process.PinnedExecutable(canonical(value["path"]), value["sha256"])
        for key, value in data["executables"].items()
    }
    observer = module.OriginalXcshCreationObserver(
        root / "xcsh-observer",
        data["executor"],
        terraform=executables["terraform"],
        xcsh=executables["xcsh"],
        bootstrap=executables["bootstrap"],
        scope_file=canonical(data["scope"]["path"]),
        scope_file_sha256=data["scope"]["sha256"],
        plan_sha256=data["scope"]["planSha256"],
        targets=data["scope"]["targets"],
        assert_inputs=guard.verify,
        original_deadline_ms=data["deadlineMs"],
    )
    base = {
        "schemaVersion": 1,
        "requestSha256": sys.argv[4],
        "executor": data["executor"],
        "reader": reader,
        "scopeSha256": data["scope"]["planSha256"],
        "scopeFileSha256": data["scope"]["sha256"],
        "windowStartedMs": start,
        "windowDeadlineMs": deadline,
        "executionAuthorized": False,
        "signalsSent": False,
        "cloudSubmissions": 0,
    }
    if time.monotonic_ns() // 1000000 >= min(deadline, data["startupDeadlineMs"]):
        reject()
    transport.record(
        root / "xcsh-ready.private.json",
        {**base, "kind": "original-xcsh-creation-ready"},
    )
    return observer, transport, base


def capture_creation_window(
    root: Path,
    data: dict[str, Any],
    guard: OriginalCreationInputs,
    observer: Any,
    transport: Any,
    base: dict[str, Any],
    deadline: int,
) -> None:
    """Retain bounded original observations and require complete target coverage."""
    witnesses: dict[int, Any] = {}
    incomplete: set[int] = set()
    receipts: tuple[dict[str, Any], ...] = ()
    try:
        lifecycle = sys.modules["xcsh_original_creation.gcp_provider_reader"]
        while time.monotonic_ns() // 1000000 < deadline:
            available, closed = lifecycle.inspect_executor(data["executor"])
            if not available and not lifecycle.original_exit_transition(
                data["executor"]
            ):
                reject()
            ready = ready_creation_receipts(observer, witnesses)
            if ready is not None:
                receipts = ready
                break
            if not available or closed:
                if closed:
                    break
                guard.verify()
                time.sleep(
                    min(0.05, max(0, deadline - time.monotonic_ns() // 1000000) / 1000)
                )
                continue
            observed = observer.observe()
            incomplete.update(observed.incomplete_pids)
            for token in observed.witnesses:
                witnesses[token.pid] = token
                incomplete.discard(token.pid)
            ready = ready_creation_receipts(observer, witnesses)
            if ready is not None:
                receipts = ready
                break
            guard.verify()
            time.sleep(
                min(0.05, max(0, deadline - time.monotonic_ns() // 1000000) / 1000)
            )
        guard.verify()
        observer.check_inputs()
        transport.record(
            root / "xcsh-result.private.json",
            {
                **base,
                "kind": "original-xcsh-creation-result",
                "finishedMs": time.monotonic_ns() // 1000000,
                "complete": bool(receipts),
                "targetCount": len(data["scope"]["targets"]),
                "witnessCount": len(witnesses),
                "incompletePids": sorted(incomplete),
                "receipts": receipts,
            },
        )
    except Exception as error:
        transport.record(
            root / "xcsh-reader-failure.private.json",
            {
                **base,
                "kind": "original-xcsh-creation-reader-failure",
                "errorType": type(error).__name__,
                "complete": False,
            },
        )
        message = "Original xcsh reader admission or evidence differs"
        raise ValueError(message) from error


def main() -> None:
    """Start before apply release, retain partial evidence and exit without signals."""
    root, data, start, deadline, guard = admit_reader_request()
    observer, transport, base = prepare_creation_reader(
        root, data, guard, start, deadline
    )
    capture_creation_window(root, data, guard, observer, transport, base, deadline)


if __name__ == "__main__":
    main()
