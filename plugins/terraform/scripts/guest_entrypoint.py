"""Pinned standalone original GCP guest worker over owned control FIFOs."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import stat
import sys
import time
from dataclasses import dataclass
from importlib.machinery import SourceFileLoader
from pathlib import Path
from typing import TYPE_CHECKING, NoReturn, TypeGuard

if TYPE_CHECKING:
    from collections.abc import Callable
    from types import CodeType, ModuleType

    from .gcp_guest_session import GuestBinding


ASCII_GRAPHIC_MIN = 32
ASCII_DELETE = 127
DEADLINE_COUNT = 2
ORIGINAL_BUDGET_MS = 7200000
CLOSE_RESERVE_MS = 300000
STARTUP_MS = 15000
COMMAND_MS = 60000
ARGUMENT_COUNT = 5
LIMIT = 1048576
REQUEST_LIMIT = 65536
SOURCE_FILES = (
    "__init__.py",
    "guest_pty.py",
    "gcp_guest_session.py",
    "guest_control.py",
    "guest_worker.py",
    "gcp_provider_process.py",
    "gcp_provider_reader.py",
    "guest_entrypoint.py",
)
FILE_FIELDS = ("dev", "ino", "uid", "nlink", "mode", "size", "mtimeNs", "ctimeNs")
PARENT_FIELDS = ("dev", "ino", "uid", "mode")
PORT_FIELDS = ("dev", "ino", "uid", "mode", "nlink")
KEY_ROLES = ("observer_key", "ce_key", "observer_hosts", "ce_hosts")


def refuse(message: str) -> NoReturn:
    """Refuse invalid input without exposing its private value."""
    raise ValueError(message)


def file_identity(info: os.stat_result) -> dict[str, str]:
    """Keep exact integer filesystem identities across the native handoff."""
    return dict(
        zip(
            FILE_FIELDS,
            map(
                str,
                (
                    info.st_dev,
                    info.st_ino,
                    info.st_uid,
                    info.st_nlink,
                    info.st_mode,
                    info.st_size,
                    info.st_mtime_ns,
                    info.st_ctime_ns,
                ),
            ),
            strict=True,
        )
    )


def canonical(value: str) -> Path:
    """Require canonical absolute source paths without controls."""
    path = Path(value)
    if (
        not path.is_absolute()
        or path.resolve(strict=True) != path
        or any(
            ord(char) < ASCII_GRAPHIC_MIN or ord(char) == ASCII_DELETE for char in value
        )
    ):
        refuse("Original canonical guest input required")
    return path


def private_root(path: Path) -> None:
    """Require the original private request/control directory."""
    info = path.lstat()
    if (
        not stat.S_ISDIR(info.st_mode)
        or info.st_uid != os.getuid()
        or info.st_mode & 0o077
    ):
        refuse("Original private guest directory required")


def read_owned(path: Path, maximum: int, *, private: bool = False) -> bytes:
    """Read one owned no-follow descriptor and recheck its original identity."""
    canonical(str(path))
    before = path.lstat()
    if (
        not stat.S_ISREG(before.st_mode)
        or before.st_uid != os.getuid()
        or before.st_nlink != 1
        or before.st_mode & (0o077 if private else 0o022)
        or not 0 < before.st_size <= maximum
    ):
        refuse("Original owned private guest input required")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        if file_identity(os.fstat(stream.fileno())) != file_identity(before):
            refuse("Original guest input changed during open")
        raw = stream.read(maximum + 1)
        if file_identity(os.fstat(stream.fileno())) != file_identity(
            before
        ) or file_identity(path.lstat()) != file_identity(before):
            refuse("Original guest input changed during read")
    return raw


def _pairs(values: list[tuple[str, object]]) -> dict:
    output = {}
    for key, value in values:
        if key in output:
            refuse("Duplicate original guest request key")
        output[key] = value
    return output


def _float(raw: str) -> float:
    result = float(raw)
    if not math.isfinite(result):
        refuse("Nonfinite original guest request value")
    return result


def _constant(_raw: str) -> NoReturn:
    refuse("Nonfinite original guest request value")


def decode_request(raw: bytes) -> dict:
    """Decode finite UTF8 JSON without discarding duplicate identities."""
    value = json.loads(
        raw.decode("utf-8", errors="strict"),
        object_pairs_hook=_pairs,
        parse_float=_float,
        parse_constant=_constant,
    )
    if not isinstance(value, dict):
        refuse("Original guest request object required")
    return value


def read_request(path: Path, expected: str) -> dict:
    """Bind the private original request to the compiled parent's exact bytes."""
    raw = read_owned(path, REQUEST_LIMIT, private=True)
    if hashlib.sha256(raw).hexdigest() != expected:
        refuse("Original guest request bytes changed")
    return decode_request(raw)


def _integer(value: object) -> TypeGuard[int]:
    return isinstance(value, int) and not isinstance(value, bool)


def validate_budget(request: dict, now: int) -> tuple[int, int, int]:
    """Retain the original two-hour operation and bounded close/startup windows."""
    start, deadlines, startup = (
        request.get("originalStartMs"),
        request.get("deadlines"),
        request.get("startupDeadlineMs"),
    )
    if (
        not _integer(start)
        or not isinstance(deadlines, list)
        or len(deadlines) != DEADLINE_COUNT
        or not all(_integer(value) for value in deadlines)
        or not _integer(startup)
    ):
        refuse("Original guest budget integers required")
    operation, closure = deadlines
    if (
        start < 0
        or operation - start != ORIGINAL_BUDGET_MS
        or not start <= now < operation
        or not operation <= closure <= operation + CLOSE_RESERVE_MS
        or not now < startup <= min(operation, now + STARTUP_MS)
    ):
        refuse("Original guest budget or fixed reserve differs")
    return operation, closure, startup


def verify_inputs(inputs: dict) -> dict[str, bytes]:
    """Recheck admitted file and parent identities and exact source bytes."""
    output = {}
    paths = set()
    for name, binding in inputs.items():
        if not isinstance(binding, dict) or set(binding) != {
            "path",
            "sha256",
            "expectedIdentity",
            "expectedParentIdentity",
        }:
            refuse("Original guest input admission required")
        path = canonical(binding["path"])
        if path in paths:
            refuse("Duplicate original guest input path")
        paths.add(path)
        before = file_identity(path.lstat())
        if binding["expectedIdentity"] != before:
            refuse("Original guest input identity changed")
        parent = path.parent.lstat()
        if (
            not stat.S_ISDIR(parent.st_mode)
            or parent.st_uid != os.getuid()
            or parent.st_mode & 0o022
            or binding["expectedParentIdentity"]
            != {key: file_identity(parent)[key] for key in PARENT_FIELDS}
        ):
            refuse("Original guest input parent changed")
        raw = read_owned(path, 256 * LIMIT, private=name in KEY_ROLES)
        if (
            hashlib.sha256(raw).hexdigest() != binding["sha256"]
            or file_identity(path.lstat()) != before
        ):
            refuse("Original guest input bytes changed")
        output[name] = raw
    return output


class CapturedGuestSource(SourceFileLoader):
    """Compile only captured source bytes, never cached bytecode."""

    def __init__(self, name: str, path: str, raw: bytes) -> None:
        """Retain one exact original module source."""
        super().__init__(name, path)
        self.raw = raw

    def get_code(self, fullname: str) -> CodeType:
        """Compile the original module without a cache lookup."""
        if fullname != self.name:
            refuse("Original guest source module name changed")
        return self.source_to_code(self.raw, self.path)


def load_sources(inputs: dict, captured: dict[str, bytes]) -> dict[str, ModuleType]:
    """Load only the complete shipped module set from its original directory."""
    scripts = Path(__file__).resolve().parent
    for filename in SOURCE_FILES:
        binding = inputs.get("script:" + filename)
        if (
            not isinstance(binding, dict)
            or canonical(binding["path"]) != scripts / filename
            or "script:" + filename not in captured
        ):
            refuse("All original shipped guest sources required")
    output = {}
    for filename in SOURCE_FILES[:-1]:
        name = (
            "xcsh_guest_capture"
            if filename == "__init__.py"
            else "xcsh_guest_capture." + filename[:-3]
        )
        path = scripts / filename
        loader = CapturedGuestSource(name, str(path), captured["script:" + filename])
        spec = importlib.util.spec_from_file_location(
            name,
            path,
            loader=loader,
            submodule_search_locations=[str(scripts)]
            if filename == "__init__.py"
            else None,
        )
        if spec is None:
            refuse("Original guest source unavailable")
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        loader.exec_module(module)
        output[filename[:-3]] = module
    return output


def open_port(binding: dict, path: Path, flags: int) -> int:
    """Join the original private FIFO path and descriptor before framing."""
    if set(binding) != {"path", "identity"} or canonical(binding["path"]) != path:
        refuse("Original guest FIFO path required")
    before = path.lstat()
    expected = {key: file_identity(before)[key] for key in PORT_FIELDS}
    if (
        not stat.S_ISFIFO(before.st_mode)
        or before.st_uid != os.getuid()
        or before.st_nlink != 1
        or before.st_mode & 0o077
        or binding["identity"] != expected
    ):
        refuse("Original private guest FIFO identity required")
    fd = os.open(path, flags | os.O_NONBLOCK | os.O_NOFOLLOW)
    if {key: file_identity(os.fstat(fd))[key] for key in PORT_FIELDS} != expected:
        os.close(fd)
        refuse("Original guest FIFO descriptor differs")
    return fd


@dataclass
class VerifiedGuestPort:
    """Keep source/request/actor checks around captured real FIFO methods."""

    send_original: Callable[[dict, int], None]
    receive_original: Callable[[int], dict]
    verify: Callable[[], None]

    def send(self, message: dict, deadline: int) -> None:
        """Send within original source, actor and byte attribution."""
        self.verify()
        self.send_original(message, deadline)
        self.verify()

    def receive(self, deadline: int) -> dict:
        """Receive within original source, actor and byte attribution."""
        self.verify()
        value = self.receive_original(deadline)
        self.verify()
        return value


@dataclass(frozen=True)
class OriginalGuestEntry:
    """Retain the original request, loaded sources, budget and actor snapshots."""

    path: Path
    expected: str
    request: dict
    identities: tuple[dict, dict]
    modules: dict[str, ModuleType]
    binding: GuestBinding
    budget: tuple[int, int, int]
    actor: dict

    def verify(self, descriptors: tuple[int, int]) -> None:
        """Recheck original inputs and actor around every control frame."""
        if (
            read_request(self.path, self.expected) != self.request
            or file_identity(self.path.lstat()) != self.identities[0]
            or {
                key: file_identity(self.path.parent.lstat())[key]
                for key in PARENT_FIELDS
            }
            != self.identities[1]
        ):
            refuse("Original guest request or directory changed")
        verify_inputs(self.request["inputs"])
        if self.modules["guest_pty"].process_identity(os.getpid()) != self.actor:
            refuse("Original guest worker actor changed")
        for descriptor, role in zip(descriptors, ("read", "write"), strict=True):
            binding = self.request["ports"][role]
            if {
                key: file_identity(os.fstat(descriptor))[key] for key in PORT_FIELDS
            } != binding["identity"] or {
                key: file_identity(canonical(binding["path"]).lstat())[key]
                for key in PORT_FIELDS
            } != binding["identity"]:
                refuse("Original guest control FIFO changed")


def prepare_entry(path: Path, expected: str) -> OriginalGuestEntry:
    """Admit exact private inputs before any control or SSH session is opened."""
    request = read_request(path, expected)
    expected_keys = {
        "schemaVersion",
        "kind",
        "nonce",
        "inputs",
        "binding",
        "originalStartMs",
        "deadlines",
        "startupDeadlineMs",
        "ports",
    }
    if (
        set(request) != expected_keys
        or not _integer(request["schemaVersion"])
        or request["schemaVersion"] != 1
        or request["kind"] != "original-gcp-guest-worker"
        or not isinstance(request["inputs"], dict)
    ):
        refuse("Original guest worker request schema required")
    private_root(path.parent)
    identities = (
        file_identity(path.lstat()),
        {key: file_identity(path.parent.lstat())[key] for key in PARENT_FIELDS},
    )
    budget = validate_budget(request, time.monotonic_ns() // 1000000)
    captured = verify_inputs(request["inputs"])
    if not {"python", "ssh", *KEY_ROLES} <= set(request["inputs"]):
        refuse("Original guest interpreter SSH and private key inputs required")
    modules = load_sources(request["inputs"], captured)
    modules["gcp_provider_reader"].ensure_reader_session()
    if Path(sys.executable).resolve() != canonical(request["inputs"]["python"]["path"]):
        refuse("Original guest interpreter differs")
    actor = modules["guest_pty"].process_identity(os.getpid())
    values = dict(request["binding"])
    if set(values) != set(
        modules["gcp_guest_session"].GuestBinding._fields
    ) or not isinstance(values["original_interfaces"], list):
        refuse("Original complete guest binding required")
    values["original_interfaces"] = tuple(values["original_interfaces"])
    for role in KEY_ROLES:
        if values[role] != request["inputs"][role]["path"]:
            refuse("Original guest private SSH binding differs")
        values[role] = canonical(values[role])
    binding = modules["gcp_guest_session"].GuestBinding(**values)
    binding.validate(time.time())
    ports = request["ports"]
    if (
        not isinstance(ports, dict)
        or set(ports) != {"root", "read", "write"}
        or ports["root"] != str(path.parent)
    ):
        refuse("Original guest control root required")
    return OriginalGuestEntry(
        path, expected, request, identities, modules, binding, budget, actor
    )


def serve_entry(entry: OriginalGuestEntry) -> None:
    """Serve the real source factory through verified original descriptors."""
    root = entry.path.parent
    ports = entry.request["ports"]
    read_fd = open_port(ports["read"], root / "request.fifo", os.O_RDONLY)
    write_fd = open_port(ports["write"], root / "response.fifo", os.O_WRONLY)
    control = entry.modules["guest_control"]
    worker = entry.modules["guest_worker"]
    pty = entry.modules["guest_pty"]
    original_port = control.GuestControlPort(read_fd, write_fd, entry.request["nonce"])
    port = VerifiedGuestPort(
        original_port.send,
        original_port.receive,
        lambda: entry.verify((read_fd, write_fd)),
    )
    anchor = worker.binding_anchor(entry.binding)
    pty.record(
        root / "worker-identity.private.json",
        {
            "actor": entry.actor,
            "requestSha256": entry.expected,
            "signalsSent": False,
            "guestAcceptanceComplete": False,
        },
    )
    try:
        port.send(
            {
                "type": "worker-bound",
                "requestSha256": entry.expected,
                "anchor": anchor,
                "binding": json.loads(json.dumps(entry.binding._asdict(), default=str)),
            },
            entry.budget[2],
        )
        approved = port.receive(entry.budget[2])
        if (
            approved
            != {
                "type": "binding-approved",
                "requestSha256": entry.expected,
                "anchor": anchor,
                "approved": True,
            }
            or approved.get("approved") is not True
        ):
            refuse("Original guest binding approval refused")
        original = worker.open_guest_control_worker(
            port,
            root / "guest",
            entry.binding,
            canonical(entry.request["inputs"]["ssh"]["path"]),
            entry.request["inputs"]["ssh"]["sha256"],
            entry.budget[:2],
        )
        port.send(
            {"type": "worker-ready", "requestSha256": entry.expected, "anchor": anchor},
            min(entry.budget[0], control.clock_ms() + COMMAND_MS),
        )
        while not original.closed:
            original.serve_once()
    finally:
        for descriptor, role in ((read_fd, "read"), (write_fd, "write")):
            if {
                key: file_identity(os.fstat(descriptor))[key] for key in PORT_FIELDS
            } != ports[role]["identity"]:
                refuse("Original guest FIFO retirement identity differs")
            os.close(descriptor)


def main() -> None:
    """Run only the shipped real SSH factory through original verified FIFOs."""
    os.umask(0o077)
    if (
        len(sys.argv) != ARGUMENT_COUNT
        or sys.argv[1] != "--request"
        or sys.argv[3] != "--sha256"
    ):
        refuse("Fixed original guest worker arguments required")
    serve_entry(prepare_entry(canonical(sys.argv[2]), sys.argv[4]))


if __name__ == "__main__":
    main()
