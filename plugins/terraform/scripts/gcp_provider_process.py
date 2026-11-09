"""Inspect original Terraform-owned provider candidates through kernel and SDK reads.

This records candidates; it never chooses the first process or qualifies an
apply RPC. The compiled controller must join its original execution events.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import TYPE_CHECKING, NoReturn, cast
from uuid import uuid4

from .guest_pty import ActorIdentity, pinned, process_identity, record

if TYPE_CHECKING:
    from collections.abc import Callable


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
        self.admitted: dict[int, ProviderCandidate] = {}
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
                    "applyPhaseQualified": False,
                    "signalsSent": False,
                },
            )
        except Exception as persistence_error:
            message = "Original provider capture and persistence failed"
            raise ExceptionGroup(message, [error, persistence_error]) from None

    def capture(self, pid: int) -> ProviderCandidate:
        """Retain a fresh independent kernel and SDK process witness."""
        raw = (Path("/proc") / str(pid) / "stat").read_text()
        fields = raw[raw.rfind(")") + 2 :].split()
        if (
            int(fields[1]) != self.parent["pid"]
            or int(fields[2]) != self.parent["group"]
        ):
            _reject("Original provider executor ownership differs")
        first = process_identity(pid)
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
        record(
            self.root / ("provider-" + uuid4().hex + ".private.json"),
            {
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
            },
        )
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
        if self.retired:
            _reject("Original provider capture is retired")
        if self.admitted.get(id(candidate)) is not candidate:
            _reject("An admitted original provider candidate is required")
        try:
            self.check_inputs()
            self.require_parent()
            try:
                current = self.capture(candidate.pid)
            except (FileNotFoundError, ProcessLookupError):
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
        except Exception as error:
            self.failure(error)
            raise
