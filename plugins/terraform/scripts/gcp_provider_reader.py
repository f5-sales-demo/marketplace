"""One-shot original provider process reader for the compiled GCP controller."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import stat
import sys
import time
from dataclasses import asdict, dataclass, field
from importlib.machinery import SourceFileLoader
from pathlib import Path
from typing import TYPE_CHECKING, NoReturn, NotRequired, TypedDict, TypeGuard, cast

if TYPE_CHECKING:
    from collections.abc import Callable
    from types import CodeType, ModuleType

    from .gcp_provider_process import (
        OriginalProviderCandidates,
        ProviderCandidate,
        ProviderStderrPipe,
    )

FILE_FIELDS = ("dev", "ino", "uid", "nlink", "mode", "size", "mtimeNs", "ctimeNs")
PARENT_FIELDS = ("dev", "ino", "uid", "mode")
LIMIT = 65536
ASCII_GRAPHIC_MIN = 32
ASCII_DELETE = 127
ARGUMENT_COUNT = 5
ORIGINAL_BUDGET_MS = 7200000
FINAL_RESERVE_MS = 300000
EXIT_STAT_FIELDS = 20
PINS = {
    "bootstrap": "aac3ade3f7d90fbf63e3ea0c46120a0cfbd159e1e503dde04721979507a1548b",
    "terraform": "00a240950f88f51a03ad90975f1647737e40ddcd5df30a703fd840aa07dccced",
    "provider": "1c620693bca3fe61c3b8ce8d313f3c6dc35648f2246784e5d92fe3d22e0dfd9f",
}


LATEST_PINS = {
    "bootstrap": "aac3ade3f7d90fbf63e3ea0c46120a0cfbd159e1e503dde04721979507a1548b",
    "terraform": "1eaecd79a92a0114d70017b5d5e274c12e5b4561d971ff0b5e24073cddd287dc",
    "provider": "f792c2ebae7abfc9123e9506b641fa789335b8905caa34effd899595e93e40a9",
}


GOOGLE811_PINS = {
    **LATEST_PINS,
    "provider": "f6c7080ca82f5ecc2f279f9b6edf152ec366890f76ab0a97a1667bdf17331ef5",
}


def select_provider_pins(executables: dict[str, dict[str, str]]) -> dict[str, str]:
    """Select the exact admitted pair; never migrate an original reader request."""
    for profile in (PINS, LATEST_PINS, GOOGLE811_PINS):
        if all(
            executables.get(role, {}).get("sha256") == digest
            for role, digest in profile.items()
        ):
            return profile
    return reject("Original qualified provider executable profile required")


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


def original_exit_transition(executor: dict[str, object]) -> bool:
    """Corroborate a gone or naturally dying original actor, never a stop."""
    transport = importlib.import_module(
        (__package__ or "xcsh_provider_capture") + ".guest_pty"
    )
    folder = Path("/proc") / str(executor["pid"])
    try:
        owned = folder.stat()
        raw = (folder / "stat").read_text()
    except FileNotFoundError:
        return True
    fields = raw[raw.rfind(")") + 2 :].split()
    if len(fields) < EXIT_STAT_FIELDS or fields[0] not in ("Z", "X"):
        return False
    if (
        int(fields[2]) != executor["group"]
        or fields[19] != executor["start"]
        or Path("/proc/sys/kernel/random/boot_id").read_text().strip()
        != executor["boot"]
        or owned.st_uid != os.getuid()
    ):
        reject("Original exiting executor identity differs")
    try:
        sdk = transport.psutil.Process(executor["pid"])
        ticks = os.sysconf("SC_CLK_TCK")
        birth = (
            int(
                next(
                    line.split()[1]
                    for line in Path("/proc/stat").read_text().splitlines()
                    if line.startswith("btime ")
                )
            )
            + int(fields[19]) / ticks
        )
        if (
            sdk.uids().real != os.getuid()
            or os.getpgid(sdk.pid) != executor["group"]
            or sdk.status()
            not in (transport.psutil.STATUS_ZOMBIE, transport.psutil.STATUS_DEAD)
            or not math.isfinite(sdk.create_time())
            or abs(sdk.create_time() - birth) > 1 / ticks
        ):
            reject("Independent original executor exit identity differs")
    except (FileNotFoundError, ProcessLookupError, transport.psutil.NoSuchProcess):
        try:
            folder.lstat()
        except FileNotFoundError:
            return True
        raise
    return True


def collect_cohort(
    executor: dict[str, object],
    discover: Callable[[], tuple[ProviderCandidate, ...]],
    *,
    assert_inputs: Callable[[], None] | None = None,
    closure_deadline_ms: int | None = None,
) -> tuple[bool, bool, tuple[ProviderCandidate, ...]]:
    """Accept an exit race only after independent original group absence."""
    if assert_inputs is not None:
        assert_inputs()
    available, closed = inspect_executor(executor)
    if not available and not closed and not original_exit_transition(executor):
        reject("Original executor unavailable while its group remains live")
    candidates: tuple[ProviderCandidate, ...] = ()
    if available:
        try:
            candidates = discover()
        except (FileNotFoundError, ProcessLookupError, ValueError) as error:
            if (
                isinstance(error, ValueError)
                and str(error) != "Original actor is unavailable or stopped"
            ):
                raise
            if assert_inputs is not None:
                assert_inputs()
            if not original_exit_transition(executor):
                raise
            available, closed = inspect_executor(executor)
            closure_end = time.monotonic_ns() // 1000000 + 1000
            if closure_deadline_ms is not None:
                closure_end = min(closure_end, closure_deadline_ms)
            while (
                not available
                and not closed
                and time.monotonic_ns() // 1000000 < closure_end
            ):
                time.sleep(0.01)
                if assert_inputs is not None:
                    assert_inputs()
                available, closed = inspect_executor(executor)
            if available or not closed:
                raise
    if assert_inputs is not None:
        assert_inputs()
    return available, closed, candidates


class ProviderWindowPipe(TypedDict):
    """Exact kernel FIFO fields for one original provider."""

    providerFd: int
    parentFd: int
    device: str
    inode: str
    providerFlags: int
    parentFlags: int


class ProviderWindowObservation(TypedDict):
    """One source-issued original candidate and its sampling history."""

    candidate: dict[str, int | str]
    stderr: ProviderWindowPipe
    firstObservedMs: int
    lastObservedMs: int
    presentAtLastSample: bool


class ProviderWindowResult(TypedDict):
    """Completed bounded sampling evidence without apply authority."""

    windowStartedMs: int
    windowDeadlineMs: int
    finishedMs: int
    samplingWindowComplete: bool
    observations: list[ProviderWindowObservation]
    executorAvailable: bool
    executorGroupClosed: bool
    verificationPolicy: NotRequired[str]
    boundaryAttempts: NotRequired[int]


WINDOW_SCHEMA_VERSION = 2
COHERENT_WINDOW_SCHEMA_VERSION = 3
VERIFIED_WINDOW_SCHEMA_VERSION = 4
COMMAND_MS = 60000
WINDOW_MS = 45000
WINDOW_PROVIDER_LIMIT = 64


def provider_request_profile(request: dict[str, object]) -> str:
    """Admit the legacy snapshot or one fixed bounded original FIFO window."""
    version = request.get("schemaVersion")
    if not exact_integer(version):
        reject("Original provider request version required")
    if version == 1 and "kind" not in request and "windowMs" not in request:
        return "cohort"
    if (
        version == WINDOW_SCHEMA_VERSION
        and request.get("kind") == "original-provider-stderr-window"
        and exact_integer(request.get("windowMs"))
        and request["windowMs"] == WINDOW_MS
    ):
        return "stderr-window"
    if (
        version == COHERENT_WINDOW_SCHEMA_VERSION
        and request.get("kind") == "original-provider-stderr-coherent-window"
        and exact_integer(request.get("windowMs"))
        and request["windowMs"] == WINDOW_MS
    ):
        return "stderr-coherent-window"
    if (
        version == VERIFIED_WINDOW_SCHEMA_VERSION
        and request.get("kind") == "original-provider-stderr-verified-window"
        and exact_integer(request.get("windowMs"))
        and request["windowMs"] == WINDOW_MS
    ):
        return "stderr-verified-window"
    reject("Original provider observation profile required")


def collect_window_cohort(
    monitor: OriginalProviderCandidates,
    *,
    coherent: bool,
    verify: Callable[[], None],
    deadline: int,
) -> tuple[bool, bool, tuple[ProviderCandidate, ...], dict[int, ProviderStderrPipe]]:
    """Collect one original cohort with explicitly versioned acquisition semantics."""
    acquired: dict[int, ProviderStderrPipe] = {}

    def discover_joint() -> tuple[ProviderCandidate, ...]:
        acquisition = monitor.acquire_stderr()
        if acquisition.incomplete_pids:
            reject("Prospective original provider acquisition incomplete")
        acquired.update({value.provider.pid: value for value in acquisition.witnesses})
        return tuple(value.provider for value in acquisition.witnesses)

    available, closed, candidates = collect_cohort(
        dict(monitor.parent),
        discover_joint if coherent else monitor.discover,
        assert_inputs=verify,
        closure_deadline_ms=deadline,
    )
    return available, closed, candidates, acquired


@dataclass(frozen=True)
class WindowSamplingPolicy:
    """Versioned observation policy; legacy bool callers preserve version3."""

    coherent: bool
    verified_boundary: bool = False


@dataclass
class WindowSample:
    """A proposed sample that has not passed its final input verification."""

    witnesses: dict[int, ProviderStderrPipe]
    observations: dict[int, ProviderWindowObservation]
    candidate_ids: tuple[int, ...]


@dataclass
class WindowSamplingState:
    """Commit only observations admitted by the selected fixed policy."""

    policy: WindowSamplingPolicy
    witnesses: dict[int, ProviderStderrPipe] = field(default_factory=dict)
    observations: dict[int, ProviderWindowObservation] = field(default_factory=dict)
    boundary_attempts: int = 0

    def propose(
        self,
        monitor: OriginalProviderCandidates,
        candidates: tuple[ProviderCandidate, ...],
        acquired: dict[int, ProviderStderrPipe],
        captured: int,
    ) -> WindowSample:
        """Retain original witness checks without admitting an unfinished sample."""
        witnesses = (
            dict(self.witnesses) if self.policy.verified_boundary else self.witnesses
        )
        observations = (
            {
                pid: cast("ProviderWindowObservation", dict(value))
                for pid, value in self.observations.items()
            }
            if self.policy.verified_boundary
            else self.observations
        )
        for value in observations.values():
            value["presentAtLastSample"] = False
        for candidate in candidates:
            if candidate.pid not in witnesses:
                if len(witnesses) >= WINDOW_PROVIDER_LIMIT:
                    reject("Original provider window candidate limit exceeded")
                witness = (
                    acquired[candidate.pid]
                    if self.policy.coherent
                    else monitor.capture_stderr(candidate)
                )
                witnesses[candidate.pid] = witness
                observations[candidate.pid] = {
                    "candidate": asdict(candidate),
                    "stderr": {
                        "providerFd": 2,
                        "parentFd": witness.parent_fd,
                        "device": str(witness.device),
                        "inode": str(witness.inode),
                        "providerFlags": witness.provider_flags,
                        "parentFlags": witness.parent_flags,
                    },
                    "firstObservedMs": captured,
                    "lastObservedMs": captured,
                    "presentAtLastSample": True,
                }
                if not self.policy.coherent:
                    monitor.require_stderr(witness)
            else:
                monitor.require_stderr(witnesses[candidate.pid])
            observations[candidate.pid]["lastObservedMs"] = captured
            observations[candidate.pid]["presentAtLastSample"] = True
        return WindowSample(
            witnesses, observations, tuple(value.pid for value in candidates)
        )

    def commit(self, proposed: WindowSample, verified: int) -> None:
        """Timestamp v4 evidence at completed verification, never its start."""
        if self.policy.verified_boundary:
            for pid in proposed.candidate_ids:
                value = proposed.observations[pid]
                if pid not in self.observations:
                    value["firstObservedMs"] = verified
                value["lastObservedMs"] = verified
        self.witnesses = proposed.witnesses
        self.observations = proposed.observations

    def boundary(
        self,
        verified: int,
        proposed: WindowSample | None,
        emit: Callable[[dict[str, object]], None],
    ) -> None:
        """Preserve late attempts separately without admitting their observations."""
        self.boundary_attempts += 1
        emit(
            {
                "kind": "boundary-attempt",
                "verifiedAtMs": verified,
                "samplingWindowComplete": False,
                "observations": list(proposed.observations.values())
                if proposed
                else [],
            }
        )

    def closed(self) -> None:
        """Original independently closed group has no currently present providers."""
        for value in self.observations.values():
            value["presentAtLastSample"] = False


def capture_stderr_window(
    monitor: OriginalProviderCandidates,
    *,
    deadline: int,
    verify: Callable[[], None],
    emit: Callable[[dict[str, object]], None],
    coherent: bool | WindowSamplingPolicy = False,
    clock: Callable[[], int] = lambda: time.monotonic_ns() // 1000000,
    pause: Callable[[], None] = lambda: time.sleep(0.25),
) -> ProviderWindowResult:
    """Retain a fixed45s sampling window with an independently fixed command end."""
    started = clock()
    ended = min(deadline, started + WINDOW_MS)
    if started >= ended:
        reject("Original provider window budget exhausted")
    command_end = min(deadline, started + COMMAND_MS)
    state = WindowSamplingState(
        coherent
        if isinstance(coherent, WindowSamplingPolicy)
        else WindowSamplingPolicy(coherent)
    )
    available, closed = False, False
    try:
        verify()
        emit({"kind": "ready", "windowStartedMs": started, "windowDeadlineMs": ended})
        while clock() < ended:
            available, closed, candidates, acquired = collect_window_cohort(
                monitor, coherent=state.policy.coherent, verify=verify, deadline=ended
            )
            captured = clock()
            if captured >= ended:
                if state.policy.verified_boundary:
                    state.boundary(captured, None, emit)
                break
            proposed = state.propose(monitor, candidates, acquired, captured)
            verify()
            verified = clock()
            if verified >= ended:
                if not state.policy.verified_boundary:
                    reject("Original provider window capture exceeded its budget")
                state.boundary(verified, proposed, emit)
                break
            state.commit(proposed, verified)
            emit(
                {
                    "kind": "sample",
                    "capturedMonotonicMs": verified
                    if state.policy.verified_boundary
                    else captured,
                }
            )
            if closed:
                break
            pause()
        verify()
        available, closed = inspect_executor(dict(monitor.parent))
        if not available and not closed:
            reject("Original executor unavailable while its group remains live")
        if state.policy.verified_boundary and clock() >= command_end:
            reject("Original provider command finalisation budget exhausted")
        if state.policy.verified_boundary and not state.observations:
            reject("Original verified provider observation required")
        if closed:
            state.closed()
        result: ProviderWindowResult = {
            "windowStartedMs": started,
            "windowDeadlineMs": ended,
            "finishedMs": clock(),
            "samplingWindowComplete": True,
            "observations": list(state.observations.values()),
            "executorAvailable": available,
            "executorGroupClosed": closed,
        }
        if state.policy.verified_boundary:
            result["verificationPolicy"] = "completed-before-window-end"
            result["boundaryAttempts"] = state.boundary_attempts
    except Exception:
        emit(
            {
                "kind": "failed",
                "observations": list(state.observations.values()),
                "samplingWindowComplete": False,
            }
        )
        raise
    return result


def require_private_root(root: Path) -> None:
    """Keep the original request's owned private evidence directory."""
    parent = root.lstat()
    if (
        not stat.S_ISDIR(parent.st_mode)
        or parent.st_uid != os.getuid()
        or parent.st_mode & 0o077
    ):
        reject("Original private provider reader directory required")


class AdmittedReaderSourceLoader(SourceFileLoader):
    """Load only captured source bytes through Python's standard source loader."""

    def __init__(self, name: str, path: str, source: bytes) -> None:
        """Bind one module name, canonical source path and admitted byte buffer."""
        super().__init__(name, path)
        self._admitted_source = source

    def get_code(self, fullname: str) -> CodeType:
        """Compile the admitted source without consulting a bytecode cache."""
        if fullname != self.name:
            reject("Original provider source module name changed")
        return self.source_to_code(self._admitted_source, self.path)


def load_reader_modules(scripts: Path) -> tuple[ModuleType, ModuleType]:
    """Compile the admitted sources directly; never execute cached bytecode."""
    for name, filename in [
        ("xcsh_provider_capture", "__init__.py"),
        ("xcsh_provider_capture.guest_pty", "guest_pty.py"),
        ("xcsh_provider_capture.gcp_provider_process", "gcp_provider_process.py"),
    ]:
        path = canonical(str(scripts / filename))
        raw = read_owned(path, LIMIT)
        loader = AdmittedReaderSourceLoader(name, str(path), raw)
        spec = importlib.util.spec_from_file_location(
            name,
            path,
            loader=loader,
            submodule_search_locations=[str(scripts)]
            if filename == "__init__.py"
            else None,
        )
        if spec is None:
            reject("Original provider source module unavailable")
        loaded = importlib.util.module_from_spec(spec)
        sys.modules[name] = loaded
        loader.exec_module(loaded)
    return (
        sys.modules["xcsh_provider_capture.gcp_provider_process"],
        sys.modules["xcsh_provider_capture.guest_pty"],
    )


def record_stderr_window(
    monitor_module: ModuleType,
    transport: ModuleType,
    request: dict[str, object],
    root: Path,
    reader: dict[str, object],
    deadline: int,
    verify: Callable[[], None],
) -> None:
    """Dispatch the fixed window through the original verified modules."""
    executables = cast("dict[str,dict[str,str]]", request["executables"])
    selected_pins = select_provider_pins(executables)
    monitor = monitor_module.OriginalProviderCandidates(
        root / "provider-window-captures",
        request["executor"],
        executables=monitor_module.ProviderExecutables(
            terraform=monitor_module.PinnedExecutable(
                canonical(executables["terraform"]["path"]), selected_pins["terraform"]
            ),
            provider=monitor_module.PinnedExecutable(
                canonical(executables["provider"]["path"]), selected_pins["provider"]
            ),
            bootstrap=monitor_module.PinnedExecutable(
                canonical(executables["bootstrap"]["path"]), selected_pins["bootstrap"]
            ),
        ),
        assert_inputs=verify,
    )

    def emit(value: dict[str, object]) -> None:
        """Persist readiness and incomplete observations in the original root."""
        if value["kind"] == "ready":
            transport.record(
                root / "provider-ready.private.json",
                {
                    **value,
                    "schemaVersion": request["schemaVersion"],
                    "kind": "original-provider-stderr-ready",
                    "requestSha256": sys.argv[4],
                    "executor": request["executor"],
                    "reader": reader,
                    "applyPhaseQualified": False,
                    "signalsSent": False,
                    "cloudSubmissions": 0,
                },
            )
        elif value["kind"] == "boundary-attempt":
            transport.record(root / "provider-window-boundary.private.json", value)
        elif value["kind"] == "failed":
            transport.record(
                root / "provider-window-failed.private.json",
                {
                    **value,
                    "schemaVersion": request["schemaVersion"],
                    "requestSha256": sys.argv[4],
                    "executor": request["executor"],
                    "reader": reader,
                    "applyPhaseQualified": False,
                    "signalsSent": False,
                    "cloudSubmissions": 0,
                },
            )

    result = capture_stderr_window(
        monitor,
        deadline=deadline,
        verify=verify,
        emit=emit,
        coherent=WindowSamplingPolicy(
            provider_request_profile(request)
            in ("stderr-coherent-window", "stderr-verified-window"),
            provider_request_profile(request) == "stderr-verified-window",
        ),
    )
    verify()
    transport.record(
        root / "provider-result.private.json",
        {
            **result,
            "schemaVersion": request["schemaVersion"],
            "kind": request["kind"],
            "requestSha256": sys.argv[4],
            "executor": request["executor"],
            "reader": reader,
            "applyPhaseQualified": False,
            "signalsSent": False,
            "cloudSubmissions": 0,
        },
    )


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
    provider_request_profile(request)
    if not isinstance(request.get("inputs"), dict):
        reject("Original provider reader admission required")
    deadline = require_capture_budget(request, time.monotonic_ns() // 1000000)

    verified_bytes: set[str] = set()

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
                provider_request_profile(request) == "cohort"
                or str(path) not in verified_bytes
            ):
                if (
                    hashlib.sha256(read_owned(path, 256 * 1024 * 1024)).hexdigest()
                    != binding["sha256"]
                ):
                    reject("Original admitted provider input bytes changed")
                verified_bytes.add(str(path))
            if identity(path.lstat()) != current:
                reject("Original admitted provider input changed during verification")

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
    selected_pins = select_provider_pins(request["executables"])
    for role, expected in selected_pins.items():
        binding = request["executables"][role]
        if binding["sha256"] != expected or not any(
            binding == value for value in request["inputs"].values()
        ):
            reject("Original qualified provider executable required")
    if Path(sys.executable).resolve() != canonical(
        request["executables"]["bootstrap"]["path"]
    ):
        reject("Original provider reader interpreter changed")
    monitor_module, transport = load_reader_modules(scripts)
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
                        selected_pins["terraform"],
                    ),
                    provider=monitor_module.PinnedExecutable(
                        canonical(request["executables"]["provider"]["path"]),
                        selected_pins["provider"],
                    ),
                    bootstrap=monitor_module.PinnedExecutable(
                        canonical(request["executables"]["bootstrap"]["path"]),
                        selected_pins["bootstrap"],
                    ),
                ),
                assert_inputs=verify,
            ),
        )
        return monitor.discover()

    if provider_request_profile(request) in (
        "stderr-window",
        "stderr-coherent-window",
        "stderr-verified-window",
    ):
        record_stderr_window(
            monitor_module, transport, request, root, reader, deadline, verify
        )
        return
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
