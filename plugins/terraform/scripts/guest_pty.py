"""Owned gated PTY capture. No cloud mutation and no process signals."""

from __future__ import annotations

import errno
import hashlib
import json
import math
import os
import pty
import re
import select
import subprocess
import sys
import time
from contextlib import ExitStack
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, NoReturn, TypedDict, TypeGuard

import psutil

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence
    from typing import IO

PROMPT = re.compile(
    rb"(?m)(?:^|\r?\n)(?:>>>|[A-Za-z0-9_.:@/-]+(?:\([^\r\n]*\))?[>#]) ?$"
)
CSI = re.compile(rb"\x1b\[[0-?]*[ -/]*[@-~]")


class ActorIdentity(TypedDict):
    """Original kernel and SDK identity recorded before execution."""

    pid: int
    group: int
    start: str
    boot: str


RETAINED: dict[str, object] = {}


PROC_STAT_MIN_FIELDS = 20
ESCAPE = 27
CSI_START = 91
OSC_START = 93
ASCII_GRAPHIC_MIN = 32
CSI_PARAMETER_MAX = 63
ASCII_GRAPHIC_MAX = 126
DELETE = 127
OSC_HEADER_SIZE = 2
OSC_TITLE_LIMIT = 256
OSC_BELL = 7
OSC_TERMINATOR = 92
COMMAND_MAX_MS = 60000
COMMAND_MAX_BYTES = 8192
PROMPT_QUIET_MS = 100
DISCOVERY_MAX_AGE_MS = 300000
GATE_MIN_ARGUMENTS = 6


def _source_error(message: str) -> NoReturn:
    """Reject an invalid original input without exposing secret values."""
    raise ValueError(message)


def _deadline_error(message: str) -> NoReturn:
    """Retire an operation that exceeded its original admitted budget."""
    raise TimeoutError(message)


def now_ms() -> int:
    """Read the shared Linux monotonic clock in milliseconds."""
    return time.monotonic_ns() // 1000000


def digest(value: bytes) -> str:
    """Hash exact retained bytes."""
    return hashlib.sha256(value).hexdigest()


def record(path: Path, value: object) -> None:
    """Publish a complete immutable private receipt without overwriting."""
    raw = json.dumps(value, sort_keys=True).encode()
    partial = path.with_name(path.name + ".partial")
    with partial.open("xb") as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    partial.chmod(0o400)
    os.link(partial, path)
    partial.unlink()


def process_identity(pid: int) -> ActorIdentity:
    """Join original kernel and psutil identity before execution."""
    folder = Path("/proc") / str(pid)
    if folder.stat().st_uid != os.getuid():
        msg = "Original actor owner changed"
        _source_error(msg)
    raw = (folder / "stat").read_text()
    fields = raw[raw.rfind(")") + 2 :].split()
    if len(fields) < PROC_STAT_MIN_FIELDS or fields[0] not in ("R", "S", "D", "I"):
        msg = "Original actor is unavailable or stopped"
        _source_error(msg)
    sdk = psutil.Process(pid)
    ticks = os.sysconf("SC_CLK_TCK")
    btime = int(
        next(
            line.split()[1]
            for line in Path("/proc/stat").read_text().splitlines()
            if line.startswith("btime ")
        )
    )
    birth = btime + int(fields[19]) / ticks
    if (
        sdk.ppid() != int(fields[1])
        or sdk.uids().real != os.getuid()
        or not math.isfinite(sdk.create_time())
        or abs(sdk.create_time() - birth) > 1 / ticks
    ):
        msg = "Independent SDK actor identity differs"
        _source_error(msg)
    if os.getpgid(pid) != int(fields[2]):
        msg = "Independent group identity differs"
        _source_error(msg)
    return {
        "pid": pid,
        "group": int(fields[2]),
        "start": fields[19],
        "boot": Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
    }


def group_absent(original: ActorIdentity) -> bool:
    """Independently inspect every remaining original group member."""
    if Path("/proc/sys/kernel/random/boot_id").read_text().strip() != original["boot"]:
        msg = "Original actor boot changed"
        _source_error(msg)
    for folder in Path("/proc").iterdir():
        if not folder.name.isdecimal():
            continue
        try:
            raw = (folder / "stat").read_text()
            fields = raw[raw.rfind(")") + 2 :].split()
            if int(fields[2]) != original["group"]:
                continue
            sdk = psutil.Process(int(folder.name))
            if (
                folder.stat().st_uid != os.getuid()
                or sdk.uids().real != os.getuid()
                or os.getpgid(sdk.pid) != original["group"]
            ):
                msg = "Original group attribution differs"
                _source_error(msg)
        except (FileNotFoundError, ProcessLookupError, psutil.NoSuchProcess):
            continue
        else:
            return False
    return True


def pinned(path: str | Path, expected: str) -> tuple[int, int, int, int, int]:
    """Verify the owned canonical executable and retain its file identity."""
    path = Path(path)
    before = path.lstat()
    if (
        path.resolve(strict=True) != path
        or not path.is_file()
        or before.st_uid != os.getuid()
        or before.st_nlink != 1
        or before.st_mode & 0o022
    ):
        msg = "Owned canonical executable required"
        _source_error(msg)
    if digest(path.read_bytes()) != expected:
        msg = "Reviewed executable differs"
        _source_error(msg)
    after = path.lstat()
    if (
        before.st_dev,
        before.st_ino,
        before.st_mtime_ns,
        before.st_ctime_ns,
        before.st_mode,
    ) != (
        after.st_dev,
        after.st_ino,
        after.st_mtime_ns,
        after.st_ctime_ns,
        after.st_mode,
    ):
        msg = "Executable changed while inspecting"
        _source_error(msg)
    return (
        before.st_dev,
        before.st_ino,
        before.st_mtime_ns,
        before.st_ctime_ns,
        before.st_mode,
    )


def _csi_end(raw: bytes, index: int) -> int | None:
    """Recognize one complete CSI sequence or a bounded partial prefix."""
    match = CSI.match(raw, index)
    if match:
        return match.end()
    if all(
        ASCII_GRAPHIC_MIN <= value <= CSI_PARAMETER_MAX for value in raw[index + 2 :]
    ):
        return None
    _source_error("Malformed CSI terminal control")


def _osc_end(raw: bytes, index: int) -> int | None:
    """Permit only bounded title updates, never clipboard or embedded controls."""
    header = raw[index + 2 : index + 4]
    if len(header) < OSC_HEADER_SIZE:
        if header in (b"", b"0", b"2"):
            return None
        _source_error("Unsupported OSC terminal control")
    if header not in (b"0;", b"2;"):
        _source_error("Unsupported OSC terminal control")
    index += 4
    start = index
    while True:
        if index - start > OSC_TITLE_LIMIT:
            _source_error("Overlong OSC window title")
        if index == len(raw):
            return None
        value = raw[index]
        if value == OSC_BELL:
            return index + 1
        if value == ESCAPE:
            if index + 1 == len(raw):
                return None
            if raw[index + 1] != OSC_TERMINATOR:
                _source_error("Embedded OSC terminal control")
            return index + 2
        if not ASCII_GRAPHIC_MIN <= value <= ASCII_GRAPHIC_MAX:
            _source_error("Invalid OSC title")
        index += 1


def exact_bytes(value: object) -> TypeGuard[bytes]:
    """Only builtin bytes may supply the inspected terminal buffer."""
    value_type = type(value)
    return isinstance(value, bytes) and value_type is bytes


def visible(raw: bytes) -> bytes | None:
    """Parse bounded terminal controls while preserving original bytes."""
    result = bytearray()
    index = 0
    while index < len(raw):
        if raw[index] != ESCAPE:
            if raw[index] == 0:
                _source_error("NUL in terminal output")
            result.append(raw[index])
            index += 1
            continue
        if index + 1 == len(raw):
            return None
        if raw[index + 1] == CSI_START:
            end = _csi_end(raw, index)
        elif raw[index + 1] == OSC_START:
            end = _osc_end(raw, index)
        else:
            _source_error("Unsupported terminal escape")
        if end is None:
            return None
        index = end
    return bytes(result)


class PtyStartupError(RuntimeError):
    """Carry the retained original session after a failed startup."""

    def __init__(self, session: OriginalPtySession) -> None:
        """Prepare an original owned capture without replaying an actor."""
        super().__init__("Original PTY startup failed; capture retained")
        self.session = session


@dataclass
class PtyGuards:
    """Original source and independently refreshed ownership guards."""

    inputs: Callable[[], None]
    owner: Callable[[], None]


@dataclass(frozen=True)
class PtyOptions:
    """Original executable and immutable operation, closure and output limits."""

    executable_sha256: str
    guards: PtyGuards
    operation_deadline_ms: int
    closure_deadline_ms: int
    command_timeout_ms: int = COMMAND_MAX_MS
    max_output_bytes: int = 4 * 1024 * 1024


@dataclass
class PtyCapture:
    """Durable partial capture state belongs to this original terminal."""

    total: int = 0
    kept: int = 0
    tail: bytearray = field(default_factory=bytearray)
    failed: bool = False
    truncated: bool = False
    closed: bool = False
    commands: list[dict[str, int | bool]] = field(default_factory=list)
    capabilities: set[bytes] = field(default_factory=set)
    discovery_ms: int | None = None


@dataclass
class PtyActor:
    """Retain original process and descriptors until independently verified closure."""

    child: subprocess.Popen[bytes] | None = None
    fd: int | None = None
    stream: IO[bytes] | None = None
    original: ActorIdentity | None = None
    released: bool = False
    exe_identity: tuple[int, int, int, int, int] | None = None
    lifetime: ExitStack = field(default_factory=ExitStack)


class OriginalPtySession:
    """Retain original gated PTY capture and independently verify closure."""

    def __init__(
        self, root: str | Path, argv: Sequence[str], *, options: PtyOptions
    ) -> None:
        """Prepare one original owned capture without replaying an actor."""
        construction_deadline = min(
            options.operation_deadline_ms, now_ms() + COMMAND_MAX_MS
        )
        if (
            not callable(options.guards.inputs)
            or not callable(options.guards.owner)
            or not argv
            or any(
                not isinstance(arg, str) or bytes([0]).decode() in arg for arg in argv
            )
        ):
            _source_error("Trusted original arguments and guards required")
        if (
            not isinstance(options.operation_deadline_ms, int)
            or not isinstance(options.closure_deadline_ms, int)
            or now_ms()
            >= min(options.operation_deadline_ms, options.closure_deadline_ms)
        ):
            _source_error("Original operation and closure deadline required")
        if (
            not 0 < options.command_timeout_ms <= COMMAND_MAX_MS
            or not 0 < options.max_output_bytes <= 4 * 1024 * 1024
        ):
            _source_error("Bounded command and capture limits required")
        self.root = Path(root)
        self.root.mkdir(mode=0o700)
        self.argv = tuple(argv)
        self._options = options
        self.capture = PtyCapture()
        self.actor = PtyActor()
        self.actor.exe_identity = pinned(self.argv[0], options.executable_sha256)
        options.guards.inputs()
        options.guards.owner()
        if now_ms() >= construction_deadline:
            _deadline_error("Original construction budget exhausted before spawn")
        try:
            self._spawn_gate()
            self._await_gate(construction_deadline)
        except BaseException as error:
            try:
                self._startup_failure(error)
            except BaseException as persistence_error:
                message = "Original PTY startup and capture persistence failed"
                raise BaseExceptionGroup(
                    message,
                    [PtyStartupError(self), error, persistence_error],
                ) from None
            raise PtyStartupError(self) from error

    def _spawn_gate(self) -> None:
        """Own local descriptors separately from the long-lived original process."""
        with ExitStack() as descriptors:
            self.actor.fd, slave = pty.openpty()
            descriptors.callback(os.close, slave)
            self.actor.stream = os.fdopen(
                os.open(
                    self.root / "terminal.private.bin",
                    os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                    0o600,
                ),
                "wb",
            )
            gate = [
                sys.executable,
                "-I",
                "-B",
                str(Path(__file__).resolve()),
                "--gate",
                str(self.root / "bootstrap.private.json"),
                str(slave),
                self.options.executable_sha256,
                digest(json.dumps(self.argv).encode()),
                *self.argv,
            ]
            gate_out = descriptors.enter_context(
                (self.root / "gate.stdout.private").open("xb")
            )
            gate_err = descriptors.enter_context(
                (self.root / "gate.stderr.private").open("xb")
            )
            # Fixed isolated interpreter/gate and pinned argv; retained process lifetime
            # is closed only after original group absence, never to force termination.
            self.actor.child = self.actor.lifetime.enter_context(
                subprocess.Popen(  # noqa: S603
                    gate,
                    stdin=subprocess.PIPE,
                    stdout=gate_out,
                    stderr=gate_err,
                    pass_fds=(slave,),
                    start_new_session=True,
                    env={"PATH": "/usr/bin:/bin", "TERM": "dumb"},
                )
            )

    def _child(self) -> subprocess.Popen[bytes]:
        """Never replace an unavailable original process handle."""
        if self.actor.child is None:
            _source_error("Original gated process handle unavailable")
        return self.actor.child

    def _stream(self) -> IO[bytes]:
        """Require the original retained terminal stream."""
        if self.actor.stream is None:
            _source_error("Original terminal stream unavailable")
        return self.actor.stream

    def _await_gate(self, construction_deadline: int) -> None:
        """Verify one original identity and release its single-use gate."""
        startup = min(construction_deadline, now_ms() + 15000)
        identity_path = self.root / "bootstrap.private.json"
        while not identity_path.exists():
            if self._child().poll() is not None or now_ms() >= startup:
                _deadline_error("Original gated actor did not publish identity")
            time.sleep(0.005)
        value = json.loads(identity_path.read_text())
        self.actor.original = process_identity(self._child().pid)
        if (
            value != self.actor.original
            or self.actor.original["group"] != self._child().pid
        ):
            _source_error("Original gated actor identity differs")
        record(
            self.root / "admitted.private.json",
            {
                "identity": self.actor.original,
                "argvSha256": digest(json.dumps(self.argv).encode()),
            },
        )
        self.options.guards.inputs()
        self.options.guards.owner()
        release = self._release_pipe()
        release.write(b"go\n")
        release.close()
        self.actor.released = True
        self._await_exec(startup)
        self._guard()
        self._read_prompt(startup)

    def _await_exec(self, startup: int) -> None:
        """Preserve the original startup bound across the bootstrap transition."""
        while True:
            self._guard(actor=False)
            if self._child().poll() is not None or now_ms() >= startup:
                _deadline_error("Original exec phase did not start")
            parts = (
                (Path("/proc") / str(self._child().pid) / "cmdline")
                .read_bytes()
                .split(bytes([0]))
            )
            if parts[:-1] == [arg.encode() for arg in self.argv]:
                return
            time.sleep(0.005)

    def _startup_failure(self, error: BaseException) -> None:
        """Preserve partial evidence and unresolved actors without signals."""
        self.capture.failed = True
        RETAINED[str(self.root)] = self
        child = self.actor.child
        if child is not None:
            release = child.stdin
            if not self.actor.released and release is not None and not release.closed:
                release.close()
        elif self.actor.fd is not None:
            # A missing process handle cannot prove group absence. Release only
            # these locally owned descriptors and retain the unresolved capture.
            os.close(self.actor.fd)
            self.actor.fd = None
        if self.actor.stream is not None:
            try:
                self._flush()
            finally:
                if child is None:
                    self.actor.stream.close()
                    self.actor.stream = None
        record(
            self.root / "startup-failed.private.json",
            {
                "errorType": type(error).__name__,
                "pid": child.pid if child else None,
                "actorHandleAvailable": child is not None,
                "signalsSent": False,
            },
        )
        RETAINED[str(self.root)] = self

    @property
    def options(self) -> PtyOptions:
        """Return the original frozen admission without permitting a new budget."""
        return self._options

    @property
    def failed(self) -> bool:
        """Read irreversible capture failure evidence."""
        return self.capture.failed

    @property
    def truncated(self) -> bool:
        """Read incomplete retained-byte evidence."""
        return self.capture.truncated

    @property
    def operation_deadline_ms(self) -> int:
        """Return the original immutable operation deadline."""
        return self.options.operation_deadline_ms

    @property
    def closure_deadline_ms(self) -> int:
        """Return the original immutable closure deadline."""
        return self.options.closure_deadline_ms

    def _guard(self, *, actor: bool = True) -> None:
        """Verify original inputs, deadline and actor identity."""
        self.options.guards.inputs()
        if now_ms() >= self.operation_deadline_ms:
            msg = "Original operation deadline exhausted"
            _deadline_error(msg)
        if actor and (
            process_identity(self._child().pid) != self.actor.original
            or pinned(self.argv[0], self.options.executable_sha256)
            != self.actor.exe_identity
        ):
            msg = "Original executable or actor changed"
            _source_error(msg)

    def _live_fd(self) -> int:
        """Require the original descriptor before a terminal operation."""
        if self.actor.fd is None:
            _source_error("Original PTY descriptor is released")
        return self.actor.fd

    def _release_pipe(self) -> IO[bytes]:
        """Require the original private gate pipe without substituting stdin."""
        release = self._child().stdin
        if release is None:
            _source_error("Original gate pipe is unavailable")
        return release

    def _flush(self) -> None:
        """Durably retain partial terminal bytes."""
        self._stream().flush()
        os.fsync(self._stream().fileno())

    def _drain(self, wait: float) -> bool:
        """Read bounded bytes without accepting incomplete capture."""
        if not select.select([self._live_fd()], [], [], wait)[0]:
            return False
        try:
            raw = os.read(self._live_fd(), 65536)
        except OSError as error:
            if error.errno == errno.EIO:
                msg = "Original PTY closed"
                raise EOFError(msg) from error
            raise
        if not raw:
            msg = "Original PTY closed"
            raise EOFError(msg)
        self.capture.total += len(raw)
        retained = raw[: max(0, self.options.max_output_bytes - self.capture.kept)]
        self._stream().write(retained)
        self._flush()
        self.capture.kept += len(retained)
        self.capture.truncated = self.capture.total > self.capture.kept
        self.capture.tail.extend(retained)
        return True

    def _read_prompt(self, deadline: int) -> bytes:
        """Require a final quiescent prompt within the original deadline."""
        while now_ms() < deadline:
            self._guard()
            self._drain(min(0.02, max(0, (deadline - now_ms()) / 1000)))
            if self.capture.truncated:
                msg = "Truncated terminal capture"
                _source_error(msg)
            value = visible(bytes(self.capture.tail))
            if value is None:
                continue
            if any(match.end() == len(value) for match in PROMPT.finditer(value)):
                if deadline - now_ms() < PROMPT_QUIET_MS:
                    break
                if not self._drain(0.1):
                    return bytes(self.capture.tail)
        msg = "Original command or prompt deadline exhausted"
        _deadline_error(msg)

    def exchange(
        self, command: bytes, suffix: bytes = b"\r", *, _deadline_ms: int | None = None
    ) -> bytes:
        """Execute an approved framed command within one original budget."""
        if self.capture.failed or self.capture.closed or self.capture.truncated:
            msg = "Original capture is retired"
            _source_error(msg)
        if (
            not exact_bytes(command)
            or len(command) > COMMAND_MAX_BYTES
            or any(byte < ASCII_GRAPHIC_MIN or byte == DELETE for byte in command)
            or any(byte in command for byte in b";&|$\x60<>~")
            or suffix not in (b"\r", b"\t")
        ):
            msg = "Command injection or invalid framing"
            _source_error(msg)
        start = self.capture.total
        deadline = min(
            self.operation_deadline_ms, now_ms() + self.options.command_timeout_ms
        )
        if _deadline_ms is not None:
            deadline = min(deadline, _deadline_ms)
        try:
            self.options.guards.owner()
            self._guard()
            if now_ms() >= deadline:
                msg = "Original command budget exhausted before write"
                _deadline_error(msg)
            self.capture.tail.clear()
            os.write(self._live_fd(), command)
            os.write(self._live_fd(), suffix)
            value = self._read_prompt(deadline)
            self.options.guards.owner()
            self._guard()
            if now_ms() >= deadline:
                msg = "Original command budget exhausted during final ownership check"
                _deadline_error(msg)
        except BaseException:
            self.capture.failed = True
            raise
        else:
            return value
        finally:
            self.capture.commands.append(
                {
                    "startByte": start,
                    "endByte": self.capture.total,
                    "failed": self.capture.failed,
                }
            )
            record(
                self.root
                / ("command-" + str(len(self.capture.commands)) + ".private.json"),
                self.capture.commands[-1],
            )

    def clear_pending(self, *, deadline_ms: int) -> bytes:
        """Clear unfinished completion input within its original command budget."""
        if self.capture.failed or self.capture.closed or self.capture.truncated:
            _source_error("Original capture is retired")
        deadline = min(
            deadline_ms,
            self.operation_deadline_ms,
            now_ms() + self.options.command_timeout_ms,
        )
        try:
            self.options.guards.owner()
            self._guard()
            if now_ms() >= deadline:
                _deadline_error(
                    "Original completion clear budget exhausted before write"
                )
            os.write(self._live_fd(), bytes([21]))
            return self.exchange(b"", _deadline_ms=deadline)
        except BaseException:
            self.capture.failed = True
            raise

    def discover(self) -> set[bytes]:
        """Discover completion and clear input within the same budget."""
        deadline = min(
            self.operation_deadline_ms, now_ms() + self.options.command_timeout_ms
        )
        raw = self.exchange(b"", b"\t", _deadline_ms=deadline)
        completion = visible(raw)
        if completion is None:
            _source_error("Original completion has incomplete controls")
        self.capture.capabilities = set(
            re.findall(rb"(?m)^\s*([a-z][a-z0-9-]*)(?=\s|$)", completion)
        )
        self.capture.discovery_ms = now_ms()
        self.clear_pending(deadline_ms=deadline)
        return self.capture.capabilities

    def request_logout(self) -> None:
        """Request only a freshly discovered supported logout."""
        if (
            self.capture.failed
            or self.capture.closed
            or b"exit" not in self.capture.capabilities
            or self.capture.discovery_ms is None
            or now_ms() - self.capture.discovery_ms > DISCOVERY_MAX_AGE_MS
        ):
            msg = "Fresh supported logout command required"
            _source_error(msg)
        self.options.guards.owner()
        self._guard()
        os.write(self._live_fd(), b"exit")
        os.write(self._live_fd(), b"\r")

    def disconnect(self) -> None:
        """Close only the verified owned SSH client through its protocol escape."""
        if self.capture.closed or self._child().poll() is not None:
            return
        pairs = [self.argv[index : index + 2] for index in range(len(self.argv) - 1)]
        if (
            Path(self.argv[0]).name != "ssh"
            or ("-F", "/dev/null") not in pairs
            or ("-e", "~") not in pairs
            or "-tt" not in self.argv
        ):
            msg = "Verified SSH escape configuration required"
            _source_error(msg)
        if now_ms() >= self.closure_deadline_ms:
            msg = "Original SSH closure reserve exhausted"
            _deadline_error(msg)
        self.options.guards.inputs()
        if (
            process_identity(self._child().pid) != self.actor.original
            or pinned(self.argv[0], self.options.executable_sha256)
            != self.actor.exe_identity
        ):
            msg = "Original SSH client identity changed"
            _source_error(msg)
        record(
            self.root / "protocol-close.private.json",
            {"identity": self.actor.original, "signalsSent": False},
        )
        os.write(self._live_fd(), b"\r")
        os.write(self._live_fd(), b"~.")

    def receipt(self) -> dict[str, object]:
        """Describe transport evidence without claiming guest acceptance."""
        return {
            "identity": self.actor.original,
            "signalsSent": False,
            "failed": self.capture.failed,
            "truncated": self.capture.truncated,
            "totalBytes": self.capture.total,
            "retainedBytes": self.capture.kept,
            "closed": self.capture.closed,
            "guestAcceptanceComplete": False,
        }

    def close(self) -> bool:
        """Release descriptors only after original group absence."""
        if self.capture.closed:
            return True
        if self.actor.child is None:
            if not (self.root / "unresolved.private.json").exists():
                record(self.root / "unresolved.private.json", self.receipt())
            RETAINED[str(self.root)] = self
            return False
        while self._child().poll() is None and now_ms() < self.closure_deadline_ms:
            try:
                self._drain(
                    min(0.02, max(0, (self.closure_deadline_ms - now_ms()) / 1000))
                )
            except EOFError:
                time.sleep(0.005)
        try:
            absent = (
                self.actor.original is not None
                and self._child().poll() is not None
                and group_absent(self.actor.original)
            )
        except (ValueError, OSError, psutil.Error):
            absent = False
        if not absent:
            self.capture.failed = True
            self._flush()
            if not (self.root / "unresolved.private.json").exists():
                record(self.root / "unresolved.private.json", self.receipt())
            RETAINED[str(self.root)] = self
            return False
        try:
            while self._drain(0):
                pass
        except EOFError:
            pass
        self._flush()
        self._stream().close()
        os.close(self._live_fd())
        self.actor.fd = None
        self.actor.stream = None
        self.actor.lifetime.close()
        self.capture.closed = True
        record(self.root / "closure.private.json", self.receipt())
        RETAINED.pop(str(self.root), None)
        return True


def gate() -> None:
    """Publish original identity before single-use executable release."""
    path = Path(sys.argv[2])
    slave = int(sys.argv[3])
    expected_executable = sys.argv[4]
    expected_arguments = sys.argv[5]
    argv = sys.argv[6:]
    if not argv or digest(json.dumps(argv).encode()) != expected_arguments:
        _source_error("Original gated arguments changed")
    pinned(argv[0], expected_executable)
    record(path, process_identity(os.getpid()))
    if sys.stdin.buffer.readline(4) != b"go\n" or sys.stdin.buffer.read(1) != b"":
        raise SystemExit(73)
    for descriptor in (0, 1, 2):
        os.dup2(slave, descriptor)
    os.close(slave)
    pinned(argv[0], expected_executable)
    # S606 false positive: canonical owned executable and exact arguments verified
    # on both sides of the single-use stdin/EOF gate; no shell interpretation.
    os.execve(argv[0], argv, dict(os.environ))  # noqa: S606


if __name__ == "__main__":
    if len(sys.argv) > GATE_MIN_ARGUMENTS and sys.argv[1] == "--gate":
        gate()
    else:
        MESSAGE = "This module requires a trusted owning controller"
        raise SystemExit(MESSAGE)


StartupFailure = PtyStartupError
