"""Independently observe original xcsh creation processes, sinks and receipts.

This family uses shared kernel/file primitives, never Google reader profiles.
Issued witnesses qualify evidence only; they cannot authorize Terraform execution.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import time
from dataclasses import dataclass
from operator import is_
from pathlib import Path
from typing import TYPE_CHECKING, Any, NoReturn, NotRequired, TypedDict, Unpack
from uuid import uuid4

from .gcp_provider_process import (
    OriginalProviderCandidates,
    PinnedExecutable,
    ProviderCandidate,
    ProviderCandidateUnavailableError,
    ProviderDescriptorAccessDeniedError,
    ProviderExecutables,
)
from .gcp_provider_reader import canonical, identity, read_owned
from .guest_pty import ActorIdentity, record

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

PRIVATE_FILE_MODE = 0o400
PRIVATE_DIRECTORY_MODE = 0o700
LIMIT = 65536
FRESHNESS_MS = 300000
MAX_TARGETS = 128
TARGET_KEYS = {"type_name", "name", "namespace"}
PROCESS_KEYS = {
    "pid",
    "parent_pid",
    "start_ticks",
    "boot_id_sha256",
    "executable_sha256",
    "executable_device",
    "executable_inode",
}
CLAIM_KEYS = {
    "schema_version",
    "scope_sha256",
    "scope_file_sha256",
    "target",
    "process",
    "nonce",
}
SCOPE_KEYS = {
    "schema_version",
    "scope_sha256",
    "directory",
    "provider_executable_sha256",
    "resources",
}


def reject(message: str = "Original xcsh creation evidence differs") -> NoReturn:
    """Refuse without including private receipt or process values."""
    raise ValueError(message)


def exact_native_type(value: object, expected: type) -> bool:
    """Match the actual JSON scalar type; bool and subclasses do not match int."""
    return is_(type(value), expected)


def digest(raw: bytes) -> str:
    """Hash exact admitted bytes."""
    return hashlib.sha256(raw).hexdigest()


def target_key(target: object) -> str:
    """Match the producer's declared Go struct field order."""
    if not isinstance(target, dict) or set(target) != TARGET_KEYS:
        reject()
    if target.get("type_name") not in ("xcsh_token", "xcsh_securemesh_site_v2"):
        reject()
    for key in ("name", "namespace"):
        if (
            not isinstance(target[key], str)
            or re.fullmatch(r"[a-z0-9.-]{1,253}", target[key]) is None
        ):
            reject()
    ordered = {key: target[key] for key in ("type_name", "name", "namespace")}
    return digest(json.dumps(ordered, separators=(",", ":")).encode())


def strict_json(raw: bytes) -> dict[str, Any]:
    """Reject duplicate keys and malformed/trailing producer output."""

    def pairs(values: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in values:
            if key in result:
                reject()
            result[key] = value
        return result

    try:
        value = json.loads(raw, object_pairs_hook=pairs)
    except (ValueError, RecursionError, UnicodeDecodeError):
        reject()
    if not isinstance(value, dict):
        reject()
    return value


@dataclass(frozen=True, eq=False)
class OriginalXcshCreationWitness:
    """Opaque evidence witness issued only by its original observer instance."""

    pid: int
    captured_ms: int


@dataclass(frozen=True)
class OriginalXcshCreationObservation:
    """Incomplete prospective samples never become authenticated witnesses."""

    witnesses: tuple[OriginalXcshCreationWitness, ...]
    incomplete_pids: tuple[int, ...]


@dataclass(frozen=True)
class ObservedClaim:
    """Exact original claim bytes, file identity and independent process join."""

    path: Path
    raw: bytes
    file_identity: dict[str, str]
    data: dict[str, Any]


@dataclass(frozen=True)
class PreparedXcshScope:
    """Keep the admitted scope and its exact file/directory bindings together."""

    file: Path
    raw: bytes
    file_identity: dict[str, str]
    parent_identity: tuple[int, int, int, int]
    sha256: str
    plan_sha256: str
    data: dict[str, Any]
    targets: dict[str, dict[str, str]]
    directory: Path
    directory_identity: tuple[int, int, int, int]


class OriginalXcshArtifactUnavailableError(ValueError):
    """Preserve the OS failure category while refusing incomplete capture."""

    def __init__(self, error: OSError) -> None:
        """Keep safe diagnostic fields without exposing a private artifact path."""
        super().__init__("Original xcsh creation artifact is unavailable")
        self.errno = error.errno
        self.cause_type = type(error).__name__


class CreationObserverSettings(TypedDict):
    """Retain named caller bindings while keeping the admission interface together."""

    terraform: PinnedExecutable
    xcsh: PinnedExecutable
    scope_file: Path
    scope_file_sha256: str
    plan_sha256: str
    targets: Sequence[dict[str, str]]
    assert_inputs: Callable[[], None]
    original_deadline_ms: int
    clock: NotRequired[Callable[[], int]]
    bootstrap: NotRequired[PinnedExecutable | None]


class OriginalXcshCreationObserver:
    """Bind the distinct xcsh family to an original executor and prepared scope."""

    def __init__(
        self,
        root: Path,
        parent: ActorIdentity,
        **settings: Unpack[CreationObserverSettings],
    ) -> None:
        """Admit source-owned bindings; JSON alone cannot supply process evidence."""
        required = {
            "terraform",
            "xcsh",
            "scope_file",
            "scope_file_sha256",
            "plan_sha256",
            "targets",
            "assert_inputs",
            "original_deadline_ms",
        }
        if not required <= settings.keys() or settings.keys() - required - {
            "clock",
            "bootstrap",
        }:
            message = "Original xcsh observer requires its complete named bindings"
            raise TypeError(message)
        root.mkdir(mode=0o700)
        self.root = root
        self.assert_inputs = settings["assert_inputs"]
        self.clock = settings.get("clock", lambda: time.monotonic_ns() // 1000000)
        self.deadline = settings["original_deadline_ms"]
        self.retired = False
        self.witnesses: dict[
            int, tuple[OriginalXcshCreationWitness, tuple[ObservedClaim, ...]]
        ] = {}
        self.actors: dict[int, dict[str, Any]] = {}
        self.artifacts: dict[Path, tuple[dict[str, str], bytes]] = {}
        admitted_file = canonical(str(settings["scope_file"]))
        scope_raw = self.read_file(admitted_file)
        scope_identity = identity(admitted_file.lstat())
        scope_parent = OriginalProviderCandidates.directory_identity(
            admitted_file.parent
        )
        if (
            digest(scope_raw) != settings["scope_file_sha256"]
            or re.fullmatch(r"[a-f0-9]{64}", settings["plan_sha256"]) is None
        ):
            reject()
        scope_data = strict_json(scope_raw)
        expected = {target_key(target): dict(target) for target in settings["targets"]}
        if not 0 < len(expected) <= MAX_TARGETS or len(expected) != len(
            settings["targets"]
        ):
            reject()
        if (
            set(scope_data) != SCOPE_KEYS
            or not exact_native_type(scope_data["schema_version"], int)
            or scope_data["schema_version"] != 1
            or scope_data["scope_sha256"] != settings["plan_sha256"]
        ):
            reject()
        if (
            scope_data["provider_executable_sha256"] != settings["xcsh"].sha256
            or not isinstance(scope_data["resources"], list)
            or len(scope_data["resources"]) != len(expected)
            or {target_key(t): t for t in scope_data["resources"]} != expected
        ):
            reject()
        directory = canonical(scope_data["directory"])
        self.prepared_scope = PreparedXcshScope(
            file=admitted_file,
            raw=scope_raw,
            file_identity=scope_identity,
            parent_identity=scope_parent,
            sha256=settings["scope_file_sha256"],
            plan_sha256=settings["plan_sha256"],
            data=scope_data,
            targets=expected,
            directory=directory,
            directory_identity=OriginalProviderCandidates.directory_identity(directory),
        )
        self.monitor = OriginalProviderCandidates(
            root / "xcsh-processes",
            parent,
            executables=ProviderExecutables(
                settings["terraform"], settings["xcsh"], settings.get("bootstrap")
            ),
            assert_inputs=settings["assert_inputs"],
        )
        self.check_inputs()

    @property
    def scope_file(self) -> Path:
        """Expose the original admitted scope file binding."""
        return self.prepared_scope.file

    @property
    def scope_raw(self) -> bytes:
        """Expose the original admitted scope raw binding."""
        return self.prepared_scope.raw

    @property
    def scope_identity(self) -> dict[str, str]:
        """Expose the original admitted scope identity binding."""
        return self.prepared_scope.file_identity

    @property
    def scope_parent(self) -> tuple[int, int, int, int]:
        """Expose the original admitted scope parent binding."""
        return self.prepared_scope.parent_identity

    @property
    def scope_sha256(self) -> str:
        """Expose the original admitted scope sha256 binding."""
        return self.prepared_scope.sha256

    @property
    def plan_sha256(self) -> str:
        """Expose the original admitted plan sha256 binding."""
        return self.prepared_scope.plan_sha256

    @property
    def scope(self) -> dict[str, Any]:
        """Expose the original admitted scope binding."""
        return self.prepared_scope.data

    @property
    def targets(self) -> dict[str, dict[str, str]]:
        """Expose the original admitted targets binding."""
        return self.prepared_scope.targets

    @property
    def directory(self) -> Path:
        """Expose the original admitted directory binding."""
        return self.prepared_scope.directory

    @property
    def directory_identity(self) -> tuple[int, int, int, int]:
        """Expose the original admitted directory identity binding."""
        return self.prepared_scope.directory_identity

    @staticmethod
    def read_file(path: Path) -> bytes:
        """Read one exact owned, private, single-link, mature producer artifact."""
        try:
            canonical(str(path))
            if stat.S_IMODE(path.lstat().st_mode) != PRIVATE_FILE_MODE:
                reject()
            return read_owned(path, LIMIT, private=True)
        except OSError as error:
            raise OriginalXcshArtifactUnavailableError(error) from error

    def read_artifact(self, path: Path) -> bytes:
        """Bind each observed artifact and reject changes during or after reading."""
        try:
            before = identity(path.lstat())
            raw = self.read_file(path)
            after = identity(path.lstat())
        except OSError as error:
            raise OriginalXcshArtifactUnavailableError(error) from error
        binding = (before, raw)
        if before != after or self.artifacts.get(path, binding) != binding:
            reject()
        self.artifacts.setdefault(path, binding)
        return raw

    def check_artifacts(self) -> None:
        """Corroborate all previously observed claim and receipt file identities."""
        for path in tuple(self.artifacts):
            self.read_artifact(path)

    def check_inputs(self) -> None:
        """Recheck scope, sink and original executable identities without replay."""
        if self.retired:
            reject("Original xcsh observer is retired")
        self.assert_inputs()
        self.monitor.check_inputs()
        if (
            identity(self.scope_file.lstat()) != self.scope_identity
            or self.read_file(self.scope_file) != self.scope_raw
            or OriginalProviderCandidates.directory_identity(self.scope_file.parent)
            != self.scope_parent
            or OriginalProviderCandidates.directory_identity(self.directory)
            != self.directory_identity
        ):
            reject()
        self.check_artifacts()
        self.assert_inputs()
        self.check_artifacts()

    def _retain_failure(self, error: Exception) -> None:
        """Retain failures and refuse future observation from this lifetime."""
        self.retired = True
        record(
            self.root / ("failure-" + uuid4().hex + ".private.json"),
            {
                "schemaVersion": 1,
                "kind": "original-xcsh-creation-failure",
                "errorType": type(error).__name__,
                "signalsSent": False,
                "executionAuthorized": False,
                **(
                    {"errno": error.errno, "causeType": error.cause_type}
                    if isinstance(error, OriginalXcshArtifactUnavailableError)
                    else {}
                ),
                **(
                    {"descriptorAccessFailure": dict(error.snapshot)}
                    if isinstance(error, ProviderDescriptorAccessDeniedError)
                    else {}
                ),
            },
        )

    def fail(self, error: Exception) -> NoReturn:
        """Preserve explicit failure calls from original consumers."""
        self._retain_failure(error)
        raise error

    def process(self, candidate: ProviderCandidate) -> dict[str, Any]:
        """Join generic kernel/SDK primitives to the distinct admitted xcsh image."""
        if candidate.pid in self.actors:
            self.monitor.require(candidate)
        else:
            self.monitor.require_before_witness(candidate)
        proc = Path("/proc") / str(candidate.pid)
        executable = (proc / "exe").stat()
        pinned = self.monitor.provider.stat()
        if (executable.st_dev, executable.st_ino) != (pinned.st_dev, pinned.st_ino):
            reject()
        boot = Path("/proc/sys/kernel/random/boot_id").read_bytes()
        if boot.decode().strip() != candidate.boot:
            reject()
        self.monitor.require(candidate)
        return {
            "pid": candidate.pid,
            "parent_pid": candidate.parent,
            "start_ticks": candidate.start,
            "boot_id_sha256": digest(boot),
            "executable_sha256": candidate.executable_sha256,
            "executable_device": executable.st_dev,
            "executable_inode": executable.st_ino,
        }

    def sink_descriptors(self, candidate: ProviderCandidate) -> tuple[int, ...]:
        """Observe every original retained directory descriptor, never choose one."""
        started_ms = self.clock()
        try:
            return self._sink_descriptors(candidate)
        except PermissionError as error:
            raise ProviderDescriptorAccessDeniedError(
                candidate.pid, -1, error, started_ms
            ) from error

    def _sink_descriptors(self, candidate: ProviderCandidate) -> tuple[int, ...]:
        """Read original directory identities while allowing normal entry writes."""
        proc = Path("/proc") / str(candidate.pid)
        values = []
        for path in (proc / "fd").iterdir():
            if not path.name.isdecimal():
                reject()
            try:
                first = path.stat()
            except FileNotFoundError:
                continue
            if (
                not stat.S_ISDIR(first.st_mode)
                or (first.st_dev, first.st_ino) != self.directory_identity[:2]
            ):
                continue
            rows = (proc / "fdinfo" / path.name).read_text().splitlines()
            flags = [
                row.split(":", 1)[1].strip() for row in rows if row.startswith("flags:")
            ]
            inodes = [
                row.split(":", 1)[1].strip() for row in rows if row.startswith("ino:")
            ]
            second = path.stat()
            if (
                first.st_uid != os.getuid()
                or stat.S_IMODE(first.st_mode) != PRIVATE_DIRECTORY_MODE
                or len(flags) != 1
                or re.fullmatch(r"[0-7]+", flags[0]) is None
            ):
                reject()
            if int(flags[0], 8) & os.O_ACCMODE != os.O_RDONLY:
                reject()
            if (
                inodes != [str(first.st_ino)]
                or (first.st_dev, first.st_ino, first.st_uid, first.st_mode)
                != (second.st_dev, second.st_ino, second.st_uid, second.st_mode)
                or str(path.readlink()) != str(self.directory)
            ):
                reject()
            values.append(int(path.name))
        self.monitor.require(candidate)
        return tuple(sorted(values))

    def validate(self, data: dict[str, Any], *, receipt: bool) -> str:
        """Reject unknown fields, bool versions, foreign targets and malformed identities."""
        expected = CLAIM_KEYS | ({"creation_identity_sha256"} if receipt else set())
        if (
            set(data) != expected
            or not exact_native_type(data["schema_version"], int)
            or data["schema_version"] != 1
            or data["scope_sha256"] != self.plan_sha256
            or data["scope_file_sha256"] != self.scope_sha256
        ):
            reject()
        if (
            not isinstance(data["nonce"], str)
            or re.fullmatch(r"[a-f0-9]{32}", data["nonce"]) is None
            or not isinstance(data["process"], dict)
            or set(data["process"]) != PROCESS_KEYS
        ):
            reject()
        key = target_key(data["target"])
        if key not in self.targets or data["target"] != self.targets[key]:
            reject()
        process = data["process"]
        for name in ("pid", "parent_pid", "executable_device", "executable_inode"):
            if not exact_native_type(process[name], int) or process[name] <= 0:
                reject()
        if (
            not isinstance(process["start_ticks"], str)
            or re.fullmatch(r"[1-9][0-9]*", process["start_ticks"]) is None
        ):
            reject()
        for name in ("boot_id_sha256", "executable_sha256"):
            if (
                not isinstance(process[name], str)
                or re.fullmatch(r"[a-f0-9]{64}", process[name]) is None
            ):
                reject()
        if receipt and (
            not isinstance(data["creation_identity_sha256"], str)
            or re.fullmatch(r"[a-f0-9]{64}", data["creation_identity_sha256"]) is None
        ):
            reject()
        return key

    def observe(self) -> OriginalXcshCreationObservation:
        """Require a live original process, descriptor and mature claim together."""
        try:
            self.check_inputs()
            if self.clock() >= self.deadline:
                reject("Original xcsh observation budget exhausted")
            witnesses = []
            incomplete = []
            for candidate in self.monitor.discover():
                try:
                    process = self.process(candidate)
                except (
                    ProviderCandidateUnavailableError,
                    FileNotFoundError,
                    ProcessLookupError,
                ):
                    if candidate.pid in self.actors:
                        reject("Original witnessed xcsh process disappeared")
                    self.check_inputs()
                    self.monitor.require_parent()
                    record(
                        self.root
                        / ("candidate-unavailable-" + uuid4().hex + ".private.json"),
                        {
                            "schemaVersion": 1,
                            "kind": "original-xcsh-candidate-unavailable",
                            "pid": candidate.pid,
                            "start": candidate.start,
                            "executor": dict(self.monitor.parent),
                            "capturedMonotonicMs": self.clock(),
                            "creationQualified": False,
                            "executionAuthorized": False,
                            "signalsSent": False,
                        },
                    )
                    incomplete.append(candidate.pid)
                    continue
                descriptors = self.sink_descriptors(candidate)
                claims = []
                claim_paths = sorted(self.directory.glob("claim-*.json"))
                for path in claim_paths:
                    raw = self.read_artifact(path)
                    data = strict_json(raw)
                    key = self.validate(data, receipt=False)
                    if path.name != "claim-" + key + ".json":
                        reject()
                    if data["process"] != process:
                        if (
                            self.actors.get(data["process"].get("pid"))
                            != data["process"]
                        ):
                            reject()
                        continue
                    claims.append(
                        ObservedClaim(path, raw, identity(path.lstat()), data)
                    )
                if not descriptors:
                    incomplete.append(candidate.pid)
                    continue
                if not claims:
                    if claim_paths:
                        reject("Original xcsh claims belong to another process")
                    if candidate.pid in self.actors:
                        reject("Original witnessed xcsh claims unavailable")
                    record(
                        self.root / ("claim-pending-" + uuid4().hex + ".private.json"),
                        {
                            "schemaVersion": 1,
                            "kind": "original-xcsh-claim-pending",
                            "process": process,
                            "sinkDescriptors": descriptors,
                            "capturedMonotonicMs": self.clock(),
                            "creationQualified": False,
                            "executionAuthorized": False,
                            "signalsSent": False,
                        },
                    )
                    incomplete.append(candidate.pid)
                    continue
                self.monitor.require(candidate)
                self.check_inputs()
                token = OriginalXcshCreationWitness(candidate.pid, self.clock())
                if token.captured_ms >= self.deadline:
                    reject("Original xcsh observation budget exhausted")
                record(
                    self.root / ("observation-" + uuid4().hex + ".private.json"),
                    {
                        "schemaVersion": 1,
                        "kind": "original-xcsh-creation-observation",
                        "process": process,
                        "sinkDescriptors": descriptors,
                        "capturedMonotonicMs": token.captured_ms,
                        "claims": [digest(c.raw) for c in claims],
                        "signalsSent": False,
                        "executionAuthorized": False,
                    },
                )
                self.actors[candidate.pid] = process
                self.witnesses[id(token)] = (token, tuple(claims))
                witnesses.append(token)
            return OriginalXcshCreationObservation(tuple(witnesses), tuple(incomplete))
        except Exception as error:
            self._retain_failure(error)
            raise

    def join(self, token: object) -> tuple[dict[str, Any], ...]:
        """Join retained original evidence after exit without re-observing a new actor."""
        issued = self.witnesses.get(id(token))
        if issued is None or issued[0] is not token:
            reject("An originally issued xcsh creation witness is required")
        original, claims = issued
        try:
            self.check_inputs()
            elapsed = self.clock() - original.captured_ms
            if not 0 <= elapsed <= FRESHNESS_MS:
                reject("Original xcsh witness freshness exhausted")
            receipts = []
            for claim in claims:
                if (
                    identity(claim.path.lstat()) != claim.file_identity
                    or self.read_artifact(claim.path) != claim.raw
                ):
                    reject()
                path = self.directory / ("receipt-" + claim.data["nonce"] + ".json")
                raw = self.read_artifact(path)
                data = strict_json(raw)
                self.validate(data, receipt=True)
                if {key: data[key] for key in CLAIM_KEYS} != claim.data:
                    reject()
                reservation = self.directory / (
                    "identity-" + data["creation_identity_sha256"] + ".json"
                )
                if strict_json(self.read_artifact(reservation)) != data:
                    reject()
                duplicates = [
                    p
                    for p in self.directory.glob("receipt-*.json")
                    if p != path
                    and strict_json(self.read_artifact(p)).get("target")
                    == data["target"]
                ]
                if duplicates:
                    reject()
                receipts.append(data)
            self.check_inputs()
            return tuple(receipts)
        except Exception as error:
            self._retain_failure(error)
            raise

    def complete(self, tokens: Sequence[object]) -> tuple[dict[str, Any], ...]:
        """Require exact prepared target coverage and a closed artifact inventory."""
        try:
            self.check_inputs()
            results: dict[str, dict[str, Any]] = {}
            issued = []
            for token in tokens:
                receipts = self.join(token)
                issued.append(self.witnesses[id(token)][0])
                for receipt in receipts:
                    key = target_key(receipt["target"])
                    if key in results and results[key] != receipt:
                        reject("Original xcsh duplicate target evidence differs")
                    results[key] = receipt
            if set(results) != set(self.targets):
                reject("Original xcsh target coverage is incomplete")
            identities = {r["creation_identity_sha256"] for r in results.values()}
            nonces = {r["nonce"] for r in results.values()}
            if len(identities) != len(results) or len(nonces) != len(results):
                reject("Original xcsh identity reservations are ambiguous")
            expected = (
                {"claim-" + key + ".json" for key in results}
                | {"identity-" + value + ".json" for value in identities}
                | {"receipt-" + value + ".json" for value in nonces}
            )
            if self.scope_file.parent == self.directory:
                expected.add(self.scope_file.name)
            if {p.name for p in self.directory.iterdir()} != expected:
                reject("Original xcsh artifact inventory differs")
            self.check_inputs()
            now = self.clock()
            if any(
                not 0 <= now - witness.captured_ms <= FRESHNESS_MS for witness in issued
            ):
                reject("Original xcsh witness freshness exhausted")
            output = tuple(results[key] for key in sorted(results))
            record(
                self.root / ("complete-" + uuid4().hex + ".private.json"),
                {
                    "schemaVersion": 1,
                    "kind": "original-xcsh-complete-creation-evidence",
                    "scopeSha256": self.plan_sha256,
                    "scopeFileSha256": self.scope_sha256,
                    "targetCount": len(output),
                    "receiptSha256": [
                        digest(json.dumps(r, sort_keys=True).encode()) for r in output
                    ],
                    "signalsSent": False,
                    "executionAuthorized": False,
                },
            )
        except Exception as error:
            if self.retired:
                raise
            self._retain_failure(error)
            raise
        return output
