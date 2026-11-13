"""Inspect original Terraform-owned provider candidates through kernel and SDK reads.

This records candidates; it never chooses the first process or qualifies an
apply RPC. The compiled controller must join its original execution events.
"""

from __future__ import annotations

import os
import re
import stat
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from types import MappingProxyType
from typing import TYPE_CHECKING, NoReturn, cast
from uuid import uuid4

from .guest_pty import (
    ActorIdentity,
    ActorIdentityUnavailableError,
    pinned,
    process_identity,
    record,
)

if TYPE_CHECKING:
    from collections.abc import Callable


class ProviderCandidateUnavailableError(ValueError):
    """An admitted candidate exited before any creation witness was issued."""


def _reject(message: str) -> NoReturn:
    """Refuse changed original inputs without exposing private data."""
    raise ValueError(message)


@dataclass(frozen=True, eq=False)
class ProviderCandidate:
    """An immutable candidate issued only by its original monitor invocation."""

    pid: int
    group: int
    start: str
    boot: str
    parent: int
    executable_sha256: str


@dataclass(frozen=True, eq=False)
class ProviderStderrPipe:
    """An original monitor-issued FIFO witness, never RPC authorization."""

    provider: ProviderCandidate
    parent_fd: int
    device: int
    inode: int
    provider_flags: int
    parent_flags: int


@dataclass(frozen=True)
class ProviderAcquisition:
    """Jointly issued witnesses and explicitly incomplete prospective samples."""

    witnesses: tuple[ProviderStderrPipe, ...]
    incomplete_pids: tuple[int, ...]


@dataclass(frozen=True)
class PinnedExecutable:
    """One original canonical executable and its reviewed digest."""

    path: Path
    sha256: str


@dataclass(frozen=True)
class ProviderExecutables:
    """The original Terraform, Google provider and optional bootstrap images."""

    terraform: PinnedExecutable
    provider: PinnedExecutable
    bootstrap: PinnedExecutable | None = None


class ProviderDescriptorAccessDeniedError(PermissionError):
    """Retain a denied read and later diagnostics without qualifying identity."""

    def __init__(
        self, pid: int, descriptor: int, error: PermissionError, started_ms: int
    ) -> None:
        """Keep original OS error fields and explicitly distinguish later reads."""
        observed_ms = time.monotonic_ns() // 1000000
        super().__init__(error.errno, error.strerror, error.filename)
        raw = None
        diagnostic_error = None
        try:
            raw = (Path("/proc") / str(pid) / "stat").read_text()
        except OSError as unavailable:
            diagnostic_error = type(unavailable).__name__
        self.snapshot = MappingProxyType(
            {
                "pid": pid,
                "descriptor": descriptor,
                "errno": error.errno,
                "filename": error.filename,
                "readStartedMs": started_ms,
                "deniedObservedMs": observed_ms,
                "diagnosticsCompletedMs": time.monotonic_ns() // 1000000,
                "actorStatAfterFailure": raw,
                "actorStatAfterFailureErrorType": diagnostic_error,
                "stateAtDenial": "unknown",
                "identityQualified": False,
                "samplingComplete": False,
                "signalsSent": False,
            }
        )


class OriginalProviderCandidates:
    """Retain all original candidates without latest-PID or replacement adoption."""

    def __init__(
        self,
        root: Path,
        parent: ActorIdentity,
        *,
        executables: ProviderExecutables,
        assert_inputs: Callable[[], None],
    ) -> None:
        """Admit the original executor and immutable executable inputs."""
        if (
            process_identity(parent["pid"]) != parent
            or parent["group"] != parent["pid"]
        ):
            _reject("Original executor group required")
        self.parent = cast("ActorIdentity", MappingProxyType(dict(parent)))
        self.assert_inputs = assert_inputs
        self.root = root
        root.mkdir(mode=448)
        self.root_identity = self.directory_identity(root)
        self.executables = executables
        self.files = {
            binding.path: pinned(binding.path, binding.sha256)
            for binding in (executables.terraform, executables.provider)
        }
        if executables.bootstrap is not None:
            binding = executables.bootstrap
            self.files[binding.path] = pinned(binding.path, binding.sha256)
        self.parents = {
            path.parent: self.directory_identity(path.parent, private=False)
            for path in self.files
        }
        self.executed = False
        self.retired = False
        self.admitted: dict[int, ProviderCandidate | ProviderStderrPipe] = {}
        self.check_inputs()

    @property
    def terraform(self) -> Path:
        """Return an original admitted executable binding."""
        return self.executables.terraform.path

    @property
    def provider(self) -> Path:
        """Return an original admitted executable binding."""
        return self.executables.provider.path

    @property
    def provider_sha256(self) -> str:
        """Return an original admitted executable binding."""
        return self.executables.provider.sha256

    @property
    def bootstrap(self) -> Path | None:
        """Return an original admitted executable binding."""
        return self.executables.bootstrap.path if self.executables.bootstrap else None

    @staticmethod
    def directory_identity(
        path: Path, *, private: bool = True
    ) -> tuple[int, int, int, int]:
        """Verify and retain an owned canonical directory identity."""
        value = path.lstat()
        if (
            path.resolve(strict=True) != path
            or not path.is_dir()
            or value.st_uid != os.getuid()
            or value.st_mode & (63 if private else 18)
        ):
            _reject("Original owned provider evidence directory required")
        return (value.st_dev, value.st_ino, value.st_uid, value.st_mode)

    def check_inputs(self) -> None:
        """Recheck original source inputs and evidence directories."""
        self.assert_inputs()
        if self.directory_identity(self.root) != self.root_identity:
            _reject("Original provider evidence directory changed")
        for path, expected in self.files.items():
            value = path.lstat()
            current = (
                value.st_dev,
                value.st_ino,
                value.st_mtime_ns,
                value.st_ctime_ns,
                value.st_mode,
            )
            if (
                current != expected
                or value.st_uid != os.getuid()
                or value.st_nlink != 1
                or (
                    self.directory_identity(path.parent, private=False)
                    != self.parents[path.parent]
                )
            ):
                _reject("Original provider executable input changed")
        self.assert_inputs()

    def require_parent(self) -> None:
        """Verify the original executor identity and bootstrap transition."""
        if process_identity(self.parent["pid"]) != dict(self.parent):
            _reject("Original executor identity changed")
        image = (Path("/proc") / str(self.parent["pid"]) / "exe").resolve(strict=True)
        if image == self.terraform:
            self.executed = True
        elif image != self.bootstrap or self.executed:
            _reject("Original executor image changed")

    def failure(self, error: Exception) -> None:
        """Retire the monitor and preserve an attributed failure receipt."""
        self.retired = True
        try:
            record(
                self.root / ("failure-" + uuid4().hex + ".private.json"),
                {
                    "schemaVersion": 1,
                    "kind": "provider-candidate-failure",
                    "executor": dict(self.parent),
                    "errorType": type(error).__name__,
                    **(
                        {"descriptorAccessFailure": dict(error.snapshot)}
                        if isinstance(error, ProviderDescriptorAccessDeniedError)
                        else {}
                    ),
                    "applyPhaseQualified": False,
                    "signalsSent": False,
                },
            )
        except Exception as persistence_error:
            message = "Original provider capture and persistence failed"
            raise ExceptionGroup(message, [error, persistence_error]) from None

    def inspect_candidate(
        self, pid: int
    ) -> tuple[ProviderCandidate, dict[str, object]]:
        """Inspect a prospective process without publishing a capability."""
        raw = (Path("/proc") / str(pid) / "stat").read_text()
        fields = raw[raw.rfind(")") + 2 :].split()
        if (
            int(fields[1]) != self.parent["pid"]
            or int(fields[2]) != self.parent["group"]
        ):
            _reject("Original provider executor ownership differs")
        first = process_identity(pid)
        if first["group"] != int(fields[2]) or first["start"] != fields[19]:
            _reject("Original provider identity changed since kernel stat")
        image = (Path("/proc") / str(pid) / "exe").resolve(strict=True)
        if image != self.provider:
            _reject("Original provider executable identity differs")
        sdk_kernel = process_identity(pid)
        if sdk_kernel != first:
            _reject("Original provider identity changed during capture")
        self.check_inputs()
        self.require_parent()
        candidate = ProviderCandidate(
            pid,
            first["group"],
            first["start"],
            first["boot"],
            self.parent["pid"],
            self.provider_sha256,
        )
        evidence = {
            "schemaVersion": 1,
            "kind": "original-provider-candidate",
            "executor": dict(self.parent),
            "identity": first,
            "providerSha256": self.provider_sha256,
            "parent": self.parent["pid"],
            "kernelStat": raw,
            "independentKernelSdkIdentity": sdk_kernel,
            "capturedMonotonicMs": time.monotonic_ns() // 1000000,
            "applyPhaseQualified": False,
            "signalsSent": False,
        }
        return candidate, evidence

    def capture(self, pid: int) -> ProviderCandidate:
        """Retain and issue the legacy independent process witness."""
        candidate, evidence = self.inspect_candidate(pid)
        record(self.root / ("provider-" + uuid4().hex + ".private.json"), evidence)
        self.admitted[id(candidate)] = candidate
        return candidate

    def discover(self) -> tuple[ProviderCandidate, ...]:
        """Preserve all original candidates without choosing one."""
        if self.retired:
            _reject("Original provider capture is retired")
        try:
            self.check_inputs()
            self.require_parent()
            found = []
            for folder in Path("/proc").iterdir():
                if not folder.name.isdecimal():
                    continue
                try:
                    raw = (folder / "stat").read_text()
                    fields = raw[raw.rfind(")") + 2 :].split()
                    if (
                        int(fields[1]) != self.parent["pid"]
                        or int(fields[2]) != self.parent["group"]
                    ):
                        continue
                    if (folder / "exe").resolve(strict=True) != self.provider:
                        continue
                    found.append(self.capture(int(folder.name)))
                except (FileNotFoundError, ProcessLookupError):
                    continue
            self.check_inputs()
            self.require_parent()
        except Exception as error:
            self.failure(error)
            raise
        return tuple(found)

    def require(self, candidate: ProviderCandidate) -> None:
        """Reinspect only a candidate admitted by this original monitor."""
        self._require(candidate, before_witness=False)

    def require_before_witness(self, candidate: ProviderCandidate) -> None:
        """Distinguish exit before witness issuance; changed identities still retire."""
        self._require(candidate, before_witness=True)

    def _require(self, candidate: ProviderCandidate, *, before_witness: bool) -> None:
        """Keep strict ownership checks for both original inspection phases."""
        if self.retired:
            _reject("Original provider capture is retired")
        if (
            not isinstance(candidate, ProviderCandidate)
            or self.admitted.get(id(candidate)) is not candidate
        ):
            _reject("An admitted original provider candidate is required")
        try:
            self.check_inputs()
            self.require_parent()
            try:
                current = self.capture(candidate.pid)
            except (FileNotFoundError, ProcessLookupError) as error:
                if before_witness:
                    message = "Original provider candidate disappeared before witness"
                    raise ProviderCandidateUnavailableError(message) from error
                _reject("Original provider candidate disappeared")
            if (
                current.pid,
                current.group,
                current.start,
                current.boot,
                current.parent,
                current.executable_sha256,
            ) != (
                candidate.pid,
                candidate.group,
                candidate.start,
                candidate.boot,
                candidate.parent,
                candidate.executable_sha256,
            ):
                _reject("Original provider candidate changed")
            self.check_inputs()
        except ProviderCandidateUnavailableError:
            # The creation observer must retain this incomplete candidate. No
            # witness or target coverage is granted; strict callers never enter here.
            raise
        except Exception as error:
            self.failure(error)
            raise

    @staticmethod
    def _inspect_descriptor(pid: int, descriptor: int) -> tuple[int, int, int]:
        """Read kernel FIFO and fdinfo identities without consuming stream bytes."""
        root = Path("/proc") / str(pid)
        path = root / "fd" / str(descriptor)
        first = path.stat()
        if not stat.S_ISFIFO(first.st_mode):
            _reject("Original provider stderr must be a FIFO")
        if str(path.readlink()) != f"pipe:[{first.st_ino}]":
            _reject("Original provider stderr FIFO identity differs")
        rows = (root / "fdinfo" / str(descriptor)).read_text().splitlines()
        flags = [
            row.split(":", 1)[1].strip() for row in rows if row.startswith("flags:")
        ]
        inodes = [
            row.split(":", 1)[1].strip() for row in rows if row.startswith("ino:")
        ]
        if (
            len(flags) != 1
            or re.fullmatch(r"[0-7]+", flags[0]) is None
            or inodes != [str(first.st_ino)]
        ):
            _reject("Original provider stderr descriptor information differs")
        second = path.stat()
        if (first.st_dev, first.st_ino, first.st_mode) != (
            second.st_dev,
            second.st_ino,
            second.st_mode,
        ):
            _reject("Original provider stderr changed during kernel capture")
        return (first.st_dev, first.st_ino, int(flags[0], 8))

    @staticmethod
    def descriptor(pid: int, descriptor: int) -> tuple[int, int, int]:
        """Stop on denied inspection and retain a distinct later actor snapshot."""
        started_ms = time.monotonic_ns() // 1000000
        try:
            return OriginalProviderCandidates._inspect_descriptor(pid, descriptor)
        except PermissionError as error:
            raise ProviderDescriptorAccessDeniedError(
                pid, descriptor, error, started_ms
            ) from error

    def inspect_pipe(
        self, candidate: ProviderCandidate, require_candidate: Callable[[], None]
    ) -> ProviderStderrPipe:
        """Corroborate fd2 with exactly one original parent's read descriptor."""
        require_candidate()
        writer = self.descriptor(candidate.pid, 2)
        if writer[2] & os.O_ACCMODE != os.O_WRONLY:
            _reject("Original provider stderr write end required")
        readers = []
        for path in (Path("/proc") / str(candidate.parent) / "fd").iterdir():
            if not path.name.isdecimal():
                _reject("Original parent stderr descriptor identity malformed")
            try:
                value = path.stat()
                if (
                    not stat.S_ISFIFO(value.st_mode)
                    or (value.st_dev, value.st_ino) != writer[:2]
                ):
                    continue
                observed = self.descriptor(candidate.parent, int(path.name))
                if observed[:2] != writer[:2]:
                    _reject("Original parent stderr FIFO changed during capture")
                if observed[2] & os.O_ACCMODE == os.O_RDONLY:
                    readers.append((int(path.name), observed))
            except FileNotFoundError:
                continue
        if len(readers) != 1:
            _reject("Original provider stderr parent reader missing or ambiguous")
        parent_fd, reader = readers[0]
        require_candidate()
        if (
            self.descriptor(candidate.pid, 2) != writer
            or self.descriptor(candidate.parent, parent_fd) != reader
        ):
            _reject("Original provider stderr pipe changed during capture")
        self.check_inputs()
        return ProviderStderrPipe(
            candidate, parent_fd, *writer[:2], writer[2], reader[2]
        )

    def inspect_stderr(self, candidate: ProviderCandidate) -> ProviderStderrPipe:
        """Reinspect a legacy issued candidate with strict capability checks."""
        return self.inspect_pipe(candidate, lambda: self.require(candidate))

    def inspect_prospective_stderr(
        self, candidate: ProviderCandidate
    ) -> ProviderStderrPipe:
        """Acquire both pipe ends before issuing any process or FIFO capability."""

        def require_candidate() -> None:
            current, _ = self.inspect_candidate(candidate.pid)
            if asdict(current) != asdict(candidate):
                _reject("Prospective original provider identity changed")

        return self.inspect_pipe(candidate, require_candidate)

    def acquire_stderr(self) -> ProviderAcquisition:
        """Preserve all joint acquisitions and departures without choosing a PID."""
        if self.retired:
            _reject("Original provider capture is retired")
        witnesses: list[ProviderStderrPipe] = []
        incomplete: list[int] = []
        try:
            self.check_inputs()
            self.require_parent()
            for folder in Path("/proc").iterdir():
                if not folder.name.isdecimal():
                    continue
                try:
                    raw = (folder / "stat").read_text()
                    fields = raw[raw.rfind(")") + 2 :].split()
                    if (
                        int(fields[1]) != self.parent["pid"]
                        or int(fields[2]) != self.parent["group"]
                        or (folder / "exe").resolve(strict=True) != self.provider
                    ):
                        continue
                except (FileNotFoundError, ProcessLookupError):
                    continue
                pid = int(folder.name)
                prospective = {
                    "schemaVersion": 2,
                    "kind": "original-provider-joint-acquisition",
                    "executor": dict(self.parent),
                    "prospectivePid": pid,
                    "kernelStat": raw,
                    "capturedMonotonicMs": time.monotonic_ns() // 1000000,
                    "applyPhaseQualified": False,
                    "signalsSent": False,
                }
                record(
                    self.root / ("prospective-" + uuid4().hex + ".private.json"),
                    {**prospective, "outcome": "pending", "samplingComplete": False},
                )
                try:
                    candidate, evidence = self.inspect_candidate(pid)
                    if candidate.start != fields[19]:
                        _reject("Prospective original provider identity changed")
                    witness = self.inspect_prospective_stderr(candidate)
                except (FileNotFoundError, ProcessLookupError):
                    # An unrelated missing input must never excuse a live actor.
                    try:
                        folder.lstat()
                    except FileNotFoundError:
                        pass
                    else:
                        raise
                    self.check_inputs()
                    self.require_parent()
                    record(
                        self.root / ("acquisition-" + uuid4().hex + ".private.json"),
                        {
                            **prospective,
                            "outcome": "departed-before-issuance",
                            "samplingComplete": False,
                        },
                    )
                    incomplete.append(pid)
                    continue
                except ActorIdentityUnavailableError as error:
                    try:
                        record(
                            self.root
                            / ("acquisition-" + uuid4().hex + ".private.json"),
                            {
                                **prospective,
                                "outcome": "identity-unavailable-before-issuance",
                                "samplingComplete": False,
                                "identityFailure": dict(error.snapshot),
                            },
                        )
                    except Exception as persistence_error:
                        message = "Prospective identity failure and persistence failed"
                        raise ExceptionGroup(
                            message, [error, persistence_error]
                        ) from None
                    raise
                self.check_inputs()
                self.require_parent()
                record(
                    self.root / ("acquisition-" + uuid4().hex + ".private.json"),
                    {
                        **prospective,
                        "outcome": "jointly-acquired",
                        "samplingComplete": True,
                        "processEvidence": evidence,
                        "witness": asdict(witness),
                    },
                )
                self.admitted[id(candidate)] = candidate
                self.admitted[id(witness)] = witness
                witnesses.append(witness)
            self.check_inputs()
            self.require_parent()
        except Exception as error:
            self.failure(error)
            raise
        return ProviderAcquisition(tuple(witnesses), tuple(incomplete))

    def capture_stderr(self, candidate: ProviderCandidate) -> ProviderStderrPipe:
        """Persist and issue an exact original provider/parent FIFO capability."""
        if self.retired:
            _reject("Original provider capture is retired")
        try:
            witness = self.inspect_stderr(candidate)
            record(
                self.root / ("stderr-pipe-" + uuid4().hex + ".private.json"),
                {
                    "schemaVersion": 1,
                    "kind": "original-provider-stderr-pipe",
                    "executor": dict(self.parent),
                    "provider": {
                        "pid": candidate.pid,
                        "group": candidate.group,
                        "start": candidate.start,
                        "boot": candidate.boot,
                        "parent": candidate.parent,
                        "executableSha256": candidate.executable_sha256,
                    },
                    "providerFd": 2,
                    "parentFd": witness.parent_fd,
                    "pipeIdentity": {
                        "dev": str(witness.device),
                        "ino": str(witness.inode),
                    },
                    "providerFlags": witness.provider_flags,
                    "parentFlags": witness.parent_flags,
                    "capturedMonotonicMs": time.monotonic_ns() // 1000000,
                    "applyPhaseQualified": False,
                    "signalsSent": False,
                },
            )
        except Exception as error:
            self.failure(error)
            raise
        self.admitted[id(witness)] = witness
        return witness

    def require_stderr(self, witness: ProviderStderrPipe) -> None:
        """Reinspect only this monitor's exact original pipe and process witness."""
        if self.retired:
            _reject("Original provider capture is retired")
        if (
            not isinstance(witness, ProviderStderrPipe)
            or self.admitted.get(id(witness)) is not witness
        ):
            _reject("An admitted original provider stderr witness is required")
        try:
            current = self.inspect_stderr(witness.provider)
            if (
                current.parent_fd,
                current.device,
                current.inode,
                current.provider_flags,
                current.parent_flags,
            ) != (
                witness.parent_fd,
                witness.device,
                witness.inode,
                witness.provider_flags,
                witness.parent_flags,
            ):
                _reject("Original provider stderr witness changed")
        except Exception as error:
            self.failure(error)
            raise
