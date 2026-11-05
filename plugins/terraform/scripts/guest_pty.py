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
from pathlib import Path
from typing import TYPE_CHECKING, NoReturn, TypedDict

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


def visible(raw: bytes) -> bytes | None:
    """Parse bounded terminal controls while preserving original bytes."""
    result = bytearray()
    index = 0
    while index < len(raw):
        if raw[index] != ESCAPE:
            if raw[index] == 0:
                msg = "NUL in terminal output"
                _source_error(msg)
            result.append(raw[index])
            index += 1
            continue
        if index + 1 == len(raw):
            return None
        if raw[index + 1] == CSI_START:
            match = CSI.match(raw, index)
            if match:
                index = match.end()
                continue
            if all(
                ASCII_GRAPHIC_MIN <= value <= CSI_PARAMETER_MAX
                for value in raw[index + 2 :]
            ):
                return None
            msg = "Malformed CSI terminal control"
            _source_error(msg)
        if raw[index + 1] != OSC_START:
            msg = "Unsupported terminal escape"
            _source_error(msg)
        header = raw[index + 2 : index + 4]
        if len(header) < OSC_HEADER_SIZE:
            if header in (b"", b"0", b"2"):
                return None
            msg = "Unsupported OSC terminal control"
            _source_error(msg)
        if header not in (b"0;", b"2;"):
            msg = "Unsupported OSC terminal control"
            _source_error(msg)
        index += 4
        start = index
        while True:
            if index - start > OSC_TITLE_LIMIT:
                msg = "Overlong OSC window title"
                _source_error(msg)
            if index == len(raw):
                return None
            value = raw[index]
            if value == OSC_BELL:
                index += 1
                break
            if value == ESCAPE:
                if index + 1 == len(raw):
                    return None
                if raw[index + 1] != OSC_TERMINATOR:
                    msg = "Embedded OSC terminal control"
                    _source_error(msg)
                index += 2
                break
            if not ASCII_GRAPHIC_MIN <= value <= ASCII_GRAPHIC_MAX:
                msg = "Invalid OSC title"
                _source_error(msg)
            index += 1
    return bytes(result)


class PtyStartupError(RuntimeError):
    """Carry the retained original session after a failed startup."""

    def __init__(self, session: OriginalPtySession) -> None:
        """Prepare an original owned capture without replaying an actor."""
        super().__init__("Original PTY startup failed; capture retained")
        self.session = session


class OriginalPtySession:
    """Retain original gated PTY capture and independently verify closure."""

    def __init__(
        self,
        root: str | Path,
        argv: Sequence[str],
        *,
        executable_sha256: str,
        assert_inputs: Callable[[], None],
        assert_owner: Callable[[], None],
        operation_deadline_ms: int,
        closure_deadline_ms: int,
        command_timeout_ms: int = 60000,
        max_output_bytes: int = 4 * 1024 * 1024,
    ) -> None:
        """Prepare an original owned capture without replaying an actor."""
        construction_deadline = min(operation_deadline_ms, now_ms() + 60000)
        if (
            not callable(assert_inputs)
            or not callable(assert_owner)
            or not argv
            or any(
                not isinstance(arg, str) or bytes([0]).decode() in arg for arg in argv
            )
        ):
            msg = "Trusted original arguments and guards required"
            _source_error(msg)
        if (
            not isinstance(operation_deadline_ms, int)
            or not isinstance(closure_deadline_ms, int)
            or now_ms() >= min(operation_deadline_ms, closure_deadline_ms)
        ):
            msg = "Original operation and closure deadline required"
            _source_error(msg)
        if (
            not 0 < command_timeout_ms <= COMMAND_MAX_MS
            or not 0 < max_output_bytes <= 4 * 1024 * 1024
        ):
            msg = "Bounded command and capture limits required"
            _source_error(msg)
        self.root = Path(root)
        self.root.mkdir(mode=0o700)
        self.argv = tuple(argv)
        self.assert_inputs, self.assert_owner = assert_inputs, assert_owner
        self._deadlines = (operation_deadline_ms, closure_deadline_ms)
        self.command_timeout_ms, self.limit = command_timeout_ms, max_output_bytes
        self.total = self.kept = 0
        self.tail = bytearray()
        self.failed = self.truncated = self.closed = False
        self.commands: list[dict[str, int | bool]] = []
        self.capabilities: set[bytes] = set()
        self.discovery_ms: int | None = None
        self.original = None
        self.exe_identity = pinned(self.argv[0], executable_sha256)
        self.exe_sha256 = executable_sha256
        assert_inputs()
        assert_owner()
        if now_ms() >= construction_deadline:
            msg = "Original construction budget exhausted before spawn"
            _deadline_error(msg)
        self.fd: int | None
        self.fd, slave = pty.openpty()
        self.stream = os.fdopen(
            os.open(
                self.root / "terminal.private.bin",
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o600,
            ),
            "wb",
        )
        identity_path = self.root / "bootstrap.private.json"
        gate = [
            sys.executable,
            "-I",
            "-B",
            str(Path(__file__).resolve()),
            "--gate",
            str(identity_path),
            str(slave),
            executable_sha256,
            digest(json.dumps(self.argv).encode()),
            *self.argv,
        ]
        self.released = False
        gate_out = (self.root / "gate.stdout.private").open("xb")
        gate_err = (self.root / "gate.stderr.private").open("xb")
        try:
            # S603 false positive: fixed isolated interpreter/gate and pinned
            # executable arguments; the child re-verifies the exact argument hash.
            self.child = subprocess.Popen(  # noqa: S603
                gate,
                stdin=subprocess.PIPE,
                stdout=gate_out,
                stderr=gate_err,
                pass_fds=(slave,),
                start_new_session=True,
                env={"PATH": "/usr/bin:/bin", "TERM": "dumb"},
            )
        finally:
            os.close(slave)
            gate_out.close()
            gate_err.close()
        startup = min(construction_deadline, now_ms() + 15000)
        try:
            while not identity_path.exists():
                if self.child.poll() is not None or now_ms() >= startup:
                    msg = "Original gated actor did not publish identity"
                    _deadline_error(msg)
                time.sleep(0.005)
            value = json.loads(identity_path.read_text())
            self.original = process_identity(self.child.pid)
            if value != self.original or self.original["group"] != self.child.pid:
                msg = "Original gated actor identity differs"
                _source_error(msg)
            record(
                self.root / "admitted.private.json",
                {
                    "identity": self.original,
                    "argvSha256": digest(json.dumps(self.argv).encode()),
                },
            )
            assert_inputs()
            assert_owner()
            release = self._release_pipe()
            release.write(b"go\n")
            release.close()
            self.released = True
            while True:
                self._guard(actor=False)
                if self.child.poll() is not None or now_ms() >= startup:
                    msg = "Original exec phase did not start"
                    _deadline_error(msg)
                parts = (
                    (Path("/proc") / str(self.child.pid) / "cmdline")
                    .read_bytes()
                    .split(bytes([0]))
                )
                if parts[:-1] == [arg.encode() for arg in self.argv]:
                    break
                time.sleep(0.005)
            self._guard()
            self._read_prompt(startup)
        except BaseException as error:
            self.failed = True
            pending_release = self.child.stdin
            if (
                not self.released
                and pending_release is not None
                and not pending_release.closed
            ):
                # EOF retires only the unreleased gate; it cannot execute SSH.
                pending_release.close()
            self._flush()
            record(
                self.root / "startup-failed.private.json",
                {
                    "errorType": type(error).__name__,
                    "pid": self.child.pid,
                    "signalsSent": False,
                },
            )
            RETAINED[str(self.root)] = self
            raise PtyStartupError(self) from error

    @property
    def operation_deadline_ms(self) -> int:
        """Return the original immutable operation deadline."""
        return self._deadlines[0]

    @property
    def closure_deadline_ms(self) -> int:
        """Return the original immutable closure deadline."""
        return self._deadlines[1]

    def _guard(self, *, actor: bool = True) -> None:
        """Verify original inputs, deadline and actor identity."""
        self.assert_inputs()
        if now_ms() >= self.operation_deadline_ms:
            msg = "Original operation deadline exhausted"
            _deadline_error(msg)
        if actor and (
            process_identity(self.child.pid) != self.original
            or pinned(self.argv[0], self.exe_sha256) != self.exe_identity
        ):
            msg = "Original executable or actor changed"
            _source_error(msg)

    def _live_fd(self) -> int:
        """Require the original descriptor before a terminal operation."""
        if self.fd is None:
            _source_error("Original PTY descriptor is released")
        return self.fd

    def _release_pipe(self) -> IO[bytes]:
        """Require the original private gate pipe without substituting stdin."""
        release = self.child.stdin
        if release is None:
            _source_error("Original gate pipe is unavailable")
        return release

    def _flush(self) -> None:
        """Durably retain partial terminal bytes."""
        self.stream.flush()
        os.fsync(self.stream.fileno())

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
        self.total += len(raw)
        retained = raw[: max(0, self.limit - self.kept)]
        self.stream.write(retained)
        self._flush()
        self.kept += len(retained)
        self.truncated = self.total > self.kept
        self.tail.extend(retained)
        return True

    def _read_prompt(self, deadline: int) -> bytes:
        """Require a final quiescent prompt within the original deadline."""
        while now_ms() < deadline:
            self._guard()
            self._drain(min(0.02, max(0, (deadline - now_ms()) / 1000)))
            if self.truncated:
                msg = "Truncated terminal capture"
                _source_error(msg)
            value = visible(bytes(self.tail))
            if value is None:
                continue
            if any(match.end() == len(value) for match in PROMPT.finditer(value)):
                if deadline - now_ms() < PROMPT_QUIET_MS:
                    break
                if not self._drain(0.1):
                    return bytes(self.tail)
        msg = "Original command or prompt deadline exhausted"
        _deadline_error(msg)

    def exchange(
        self, command: bytes, suffix: bytes = b"\r", *, _deadline_ms: int | None = None
    ) -> bytes:
        """Execute an approved framed command within one original budget."""
        if self.failed or self.closed or self.truncated:
            msg = "Original capture is retired"
            _source_error(msg)
        if (
            type(command) is not bytes
            or len(command) > COMMAND_MAX_BYTES
            or any(byte < ASCII_GRAPHIC_MIN or byte == DELETE for byte in command)
            or any(byte in command for byte in b";&|$\x60<>~")
            or suffix not in (b"\r", b"\t")
        ):
            msg = "Command injection or invalid framing"
            _source_error(msg)
        start = self.total
        deadline = min(self.operation_deadline_ms, now_ms() + self.command_timeout_ms)
        if _deadline_ms is not None:
            deadline = min(deadline, _deadline_ms)
        try:
            self.assert_owner()
            self._guard()
            if now_ms() >= deadline:
                msg = "Original command budget exhausted before write"
                _deadline_error(msg)
            self.tail.clear()
            os.write(self._live_fd(), command)
            os.write(self._live_fd(), suffix)
            value = self._read_prompt(deadline)
            self.assert_owner()
            self._guard()
            if now_ms() >= deadline:
                msg = "Original command budget exhausted during final ownership check"
                _deadline_error(msg)
        except BaseException:
            self.failed = True
            raise
        else:
            return value
        finally:
            self.commands.append(
                {"startByte": start, "endByte": self.total, "failed": self.failed}
            )
            record(
                self.root / ("command-" + str(len(self.commands)) + ".private.json"),
                self.commands[-1],
            )

    def clear_pending(self, *, deadline_ms: int) -> bytes:
        """Clear unfinished completion input within its original command budget."""
        if self.failed or self.closed or self.truncated:
            _source_error("Original capture is retired")
        deadline = min(
            deadline_ms, self.operation_deadline_ms, now_ms() + self.command_timeout_ms
        )
        try:
            self.assert_owner()
            self._guard()
            if now_ms() >= deadline:
                _deadline_error(
                    "Original completion clear budget exhausted before write"
                )
            os.write(self._live_fd(), bytes([21]))
            return self.exchange(b"", _deadline_ms=deadline)
        except BaseException:
            self.failed = True
            raise

    def discover(self) -> set[bytes]:
        """Discover completion and clear input within the same budget."""
        deadline = min(self.operation_deadline_ms, now_ms() + self.command_timeout_ms)
        raw = self.exchange(b"", b"\t", _deadline_ms=deadline)
        completion = visible(raw)
        if completion is None:
            _source_error("Original completion has incomplete controls")
        self.capabilities = set(
            re.findall(rb"(?m)^\s*([a-z][a-z0-9-]*)(?=\s|$)", completion)
        )
        self.discovery_ms = now_ms()
        self.clear_pending(deadline_ms=deadline)
        return self.capabilities

    def request_logout(self) -> None:
        """Request only a freshly discovered supported logout."""
        if (
            self.failed
            or self.closed
            or b"exit" not in self.capabilities
            or self.discovery_ms is None
            or now_ms() - self.discovery_ms > DISCOVERY_MAX_AGE_MS
        ):
            msg = "Fresh supported logout command required"
            _source_error(msg)
        self.assert_owner()
        self._guard()
        os.write(self._live_fd(), b"exit")
        os.write(self._live_fd(), b"\r")

    def disconnect(self) -> None:
        """Close only the verified owned SSH client through its protocol escape."""
        if self.closed or self.child.poll() is not None:
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
        self.assert_inputs()
        if (
            process_identity(self.child.pid) != self.original
            or pinned(self.argv[0], self.exe_sha256) != self.exe_identity
        ):
            msg = "Original SSH client identity changed"
            _source_error(msg)
        record(
            self.root / "protocol-close.private.json",
            {"identity": self.original, "signalsSent": False},
        )
        os.write(self._live_fd(), b"\r")
        os.write(self._live_fd(), b"~.")

    def receipt(self) -> dict[str, object]:
        """Describe transport evidence without claiming guest acceptance."""
        return {
            "identity": self.original,
            "signalsSent": False,
            "failed": self.failed,
            "truncated": self.truncated,
            "totalBytes": self.total,
            "retainedBytes": self.kept,
            "closed": self.closed,
            "guestAcceptanceComplete": False,
        }

    def close(self) -> bool:
        """Release descriptors only after original group absence."""
        if self.closed:
            return True
        while self.child.poll() is None and now_ms() < self.closure_deadline_ms:
            try:
                self._drain(
                    min(0.02, max(0, (self.closure_deadline_ms - now_ms()) / 1000))
                )
            except EOFError:
                time.sleep(0.005)
        try:
            absent = (
                self.original is not None
                and self.child.poll() is not None
                and group_absent(self.original)
            )
        except (ValueError, OSError, psutil.Error):
            absent = False
        if not absent:
            self.failed = True
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
        self.stream.close()
        os.close(self._live_fd())
        self.fd = None
        self.closed = True
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
        msg = "This module requires a trusted owning controller"
        raise SystemExit(msg)


StartupFailure = PtyStartupError
