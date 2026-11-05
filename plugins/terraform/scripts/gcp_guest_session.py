"""Dispatch original-bound Site CLI capture through the qualified SSH PTY."""

from __future__ import annotations

import ipaddress
import math
import os
import re
import shlex
import stat
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, NoReturn, Protocol
from uuid import uuid4

from .guest_pty import PROMPT, OriginalPtySession, digest, now_ms, record, visible

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

FRESHNESS_MS = 300000
COMMAND_MS = 60000
LOG_LINES = 200
CE_NIC_COUNT = 2
NAME = re.compile(r"[a-z][a-z0-9-]{0,62}")
NUMERIC_ID = re.compile(r"[1-9][0-9]{0,19}")
SHA256 = re.compile(r"[0-9a-f]{64}")
CONTAINER_ID = re.compile(r"[0-9a-f]{12,64}")
ALGORITHMS = frozenset(("ssh-ed25519", "rsa-sha2-512", "rsa-sha2-256"))
FIXED = {
    "health": "health",
    "diagnosis": "diagnosis",
    "vpm": "status vpm",
    "clock": "execcli date",
    "interfaces": "execcli ip-address",
    "routes": "execcli ip-route",
    "vpm-unit": "execcli systemctl-status-vpm",
    "vpm-journal": "execcli journalctl -u vpm -n 200",
    "cloud-init": "execcli cloud-init-status",
    "failed-units": "execcli systemctl-failed",
    "boot-warnings": "execcli journalctl -b -p warning -n 200",
    "cri-list": "execcli crictl-ps-a",
    "docker-list": "execcli docker-ps-a",
}
DISCOVERY = {
    "root": "",
    "status": "status ",
    "execcli": "execcli ",
    "journal": "execcli journalctl ",
    "cri-inspect": "execcli crictl-inspect ",
    "cri-logs": "execcli crictl-logs ",
    "docker-inspect": "execcli docker-inspect ",
    "docker-logs": "execcli docker-logs ",
}
KNOWN_COMPLETIONS = frozenset(
    [word for command in FIXED.values() for word in command.split()]
    + [
        "exit",
        "crictl-inspect",
        "crictl-logs",
        "docker-inspect",
        "docker-logs",
        "--tail",
    ]
)


def reject(message: str) -> NoReturn:
    """Refuse an unsafe input without retaining its private value."""
    raise ValueError(message)


@dataclass(frozen=True)
class GuestBinding:
    """Immutable joins supplied by the original cloud and serial controller."""

    project: str
    region: str
    site_name: str
    node_name: str
    zone: str
    instance_id: str
    observer_name: str
    observer_id: str
    observer_address: str
    address: str
    original_interfaces: tuple[str, ...]
    token_node: str
    token_site: str
    token_expires: float
    token_sha256: str
    ownership_sha256: str
    observer_key: Path
    ce_key: Path
    observer_hosts: Path
    ce_hosts: Path
    observer_algorithm: str
    ce_algorithm: str

    def validate(self, epoch: float) -> None:
        """Reject missing or foreign token, node, NIC and observer bindings."""
        if any(
            NAME.fullmatch(value) is None
            for value in (
                self.project,
                self.region,
                self.site_name,
                self.node_name,
                self.zone,
                self.observer_name,
            )
        ) or not self.zone.startswith(self.region + "-"):
            reject("Original named cloud scope required")
        if (
            not NUMERIC_ID.fullmatch(self.instance_id)
            or not NUMERIC_ID.fullmatch(self.observer_id)
            or self.instance_id == self.observer_id
            or self.node_name == self.observer_name
        ):
            reject("Original distinct numeric VM identities required")
        if (
            self.token_node != self.node_name
            or self.token_site != self.site_name
            or not math.isfinite(self.token_expires)
            or not math.isfinite(epoch)
            or epoch >= self.token_expires
            or not SHA256.fullmatch(self.token_sha256)
            or not SHA256.fullmatch(self.ownership_sha256)
        ):
            reject("Original unexpired token and ownership joins required")
        addresses = (self.observer_address, self.address, *self.original_interfaces)
        if any(str(ipaddress.IPv4Address(value)) != value for value in addresses):
            reject("Original canonical IPv4 addresses required")
        if (
            not isinstance(self.original_interfaces, tuple)
            or len(self.original_interfaces) != CE_NIC_COUNT
            or len(set(self.original_interfaces)) != CE_NIC_COUNT
            or self.address not in self.original_interfaces
            or self.observer_address in self.original_interfaces
        ):
            reject("Original two-interface CE NIC join required")
        if (
            self.observer_algorithm not in ALGORITHMS
            or self.ce_algorithm not in ALGORITHMS
        ):
            reject("Original serial-verified SSH algorithms required")


def private_identity(path: Path) -> tuple[int, int, int, int, int, str]:
    """Join immutable private file bytes and identity without following a link."""
    before = path.lstat()
    if (
        path.resolve(strict=True) != path
        or not stat.S_ISREG(before.st_mode)
        or before.st_uid != os.getuid()
        or before.st_nlink != 1
        or before.st_mode & 0o077
    ):
        reject("Original canonical private SSH input required")
    checksum = digest(path.read_bytes())
    after = path.lstat()
    identity = (
        before.st_dev,
        before.st_ino,
        before.st_mtime_ns,
        before.st_ctime_ns,
        before.st_mode,
    )
    if identity != (
        after.st_dev,
        after.st_ino,
        after.st_mtime_ns,
        after.st_ctime_ns,
        after.st_mode,
    ):
        reject("Original private SSH input changed during inspection")
    return (*identity, checksum)


def ssh_options(key: Path, hosts: Path, algorithm: str) -> list[str]:
    """Build fixed noninteractive options with pinned hosts and no forwarding."""
    return [
        "-F",
        "/dev/null",
        "-e",
        "~",
        "-i",
        str(key),
        "-o",
        "BatchMode=yes",
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "UserKnownHostsFile=" + str(hosts),
        "-o",
        "GlobalKnownHostsFile=/dev/null",
        "-o",
        "HostKeyAlgorithms=" + algorithm,
        "-o",
        "UpdateHostKeys=no",
        "-o",
        "VerifyHostKeyDNS=no",
        "-o",
        "ForwardAgent=no",
        "-o",
        "ForwardX11=no",
        "-o",
        "ClearAllForwardings=yes",
        "-o",
        "PermitLocalCommand=no",
        "-o",
        "ControlMaster=no",
        "-o",
        "ControlPath=none",
        "-o",
        "ConnectTimeout=15",
        "-o",
        "ConnectionAttempts=1",
        "-o",
        "ServerAliveInterval=5",
        "-o",
        "ServerAliveCountMax=2",
        "-o",
        "PreferredAuthentications=publickey",
        "-o",
        "PasswordAuthentication=no",
        "-o",
        "KbdInteractiveAuthentication=no",
    ]


class Transport(Protocol):
    """Qualified transport contract; test doubles provide offline evidence only."""

    root: Path
    failed: bool
    truncated: bool

    def exchange(
        self, command: bytes, suffix: bytes = b"\r", *, _deadline_ms: int | None = None
    ) -> bytes:
        """Exchange bounded framed bytes on the original terminal."""
        ...

    def disconnect(self) -> None:
        """Request protocol closure of the original SSH client."""
        ...

    def clear_pending(self, *, deadline_ms: int) -> bytes:
        """Clear only unfinished completion input within the original budget."""
        ...

    def close(self) -> bool:
        """Retain unresolved descriptors until independently verified absence."""
        ...


class GuestSession:
    """Use scoped fresh completion and original-node container listings."""

    def __init__(
        self,
        root: Path,
        binding: GuestBinding,
        *,
        executable: Path,
        executable_sha256: str,
        verify_inputs: Callable[[], None],
        verify_original: Callable[[GuestBinding], None],
        verify_trust: Callable[[GuestBinding, str], None],
        operation_deadline_ms: int,
        closure_deadline_ms: int,
        epoch: Callable[[], float] = time.time,
        monotonic: Callable[[], int] = now_ms,
        transport: Callable[..., Transport] = OriginalPtySession,
    ) -> None:
        """Admit original joins and serial trust before opening a single session."""
        self._binding = binding
        self.verify_inputs, self.verify_original, self.verify_trust = (
            verify_inputs,
            verify_original,
            verify_trust,
        )
        self.epoch, self.monotonic = epoch, monotonic
        self._deadlines = (operation_deadline_ms, closure_deadline_ms)
        self.failed = self.closed = False
        self.retained: list[dict[str, object]] = []
        self.completions: dict[str, tuple[int, frozenset[str], str]] = {}
        self.listings: dict[str, tuple[int, tuple[str, ...], str]] = {}
        binding.validate(epoch())
        self.inputs = {
            path: private_identity(path)
            for path in (
                binding.observer_key,
                binding.ce_key,
                binding.observer_hosts,
                binding.ce_hosts,
            )
        }
        self.check_inputs()
        self.check_owner()
        if (
            monotonic() >= min(self.deadlines)
            or closure_deadline_ms < operation_deadline_ms
        ):
            reject("Original operation and closure budgets required")
        proxy = [
            str(executable),
            *ssh_options(
                binding.observer_key, binding.observer_hosts, binding.observer_algorithm
            ),
            "-W",
            binding.address + ":22",
            "ubuntu@" + binding.observer_address,
        ]
        argv = [
            str(executable),
            "-tt",
            *ssh_options(binding.ce_key, binding.ce_hosts, binding.ce_algorithm),
            "-o",
            "ProxyCommand=" + shlex.join(proxy),
            "admin@" + binding.address,
        ]
        self.transport = transport(
            root,
            argv,
            executable_sha256=executable_sha256,
            assert_inputs=self.check_inputs,
            assert_owner=self.check_owner,
            operation_deadline_ms=operation_deadline_ms,
            closure_deadline_ms=closure_deadline_ms,
        )

    @property
    def binding(self) -> GuestBinding:
        """Return the immutable original binding without admitting a successor."""
        return self._binding

    @property
    def deadlines(self) -> tuple[int, int]:
        """Return the original operation and closure deadlines."""
        return self._deadlines

    def check_inputs(self) -> None:
        """Check immutable local inputs separately from the operation deadline."""
        self.verify_inputs()
        if any(
            private_identity(path) != identity for path, identity in self.inputs.items()
        ):
            reject("Original private SSH input replaced or rotated")

    def check_owner(self) -> None:
        """Refresh independent original VM/token/NIC joins and both serial trusts."""
        self.binding.validate(self.epoch())
        self.verify_original(self.binding)
        for role in ("observer", "ce"):
            self.verify_trust(self.binding, role)
        self.binding.validate(self.epoch())

    def guard(self, deadline: int) -> None:
        """Spend guards within the command budget and refuse retired sessions."""
        if (
            self.failed
            or self.closed
            or self.transport.failed
            or self.transport.truncated
        ):
            reject("Original guest capture is retired")
        self.check_inputs()
        self.check_owner()
        self.check_inputs()
        if self.monotonic() >= min(deadline, self.deadlines[0]):
            msg = "Original guest command budget exhausted"
            raise TimeoutError(msg)

    def retain(
        self, kind: str, command: bytes, raw: bytes, started: int
    ) -> dict[str, object]:
        """Durably retain exact command/output bytes with original VM attribution."""
        sequence = len(self.retained) + 1
        stem = self.transport.root / ("guest-" + str(sequence))
        for suffix, payload_bytes in (
            (".command.private.bin", command),
            (".output.private.bin", raw),
        ):
            path = stem.with_suffix(suffix)
            with path.open("xb") as stream:
                stream.write(payload_bytes)
                stream.flush()
                os.fsync(stream.fileno())
            path.chmod(0o400)
        value: dict[str, object] = {
            "schemaVersion": 1,
            "kind": kind,
            "instanceId": self.binding.instance_id,
            "observerId": self.binding.observer_id,
            "tokenSha256": self.binding.token_sha256,
            "ownershipSha256": self.binding.ownership_sha256,
            "startedMonotonicMs": started,
            "finishedMonotonicMs": self.monotonic(),
            "sha256": digest(raw),
            "commandSha256": digest(command),
            "path": str(stem.with_suffix(".output.private.bin")),
            "truncated": self.transport.truncated,
            "guestAcceptanceComplete": False,
        }
        self.retained.append(value)
        record(stem.with_suffix(".private.json"), value)
        return value

    def failure(self, kind: str, error: BaseException) -> None:
        """Retire capture and preserve a sanitized failure without replay."""
        self.failed = True
        record(
            self.transport.root / ("failure-" + uuid4().hex + ".json"),
            {
                "kind": kind,
                "errorType": type(error).__name__,
                "instanceId": self.binding.instance_id,
                "signalsSent": False,
                "guestAcceptanceComplete": False,
            },
        )

    def require(self, scope: str, required: set[str]) -> None:
        """Require fresh completion from this original session and exact scope."""
        item = self.completions.get(scope)
        if item is None or not 0 <= self.monotonic() - item[0] <= FRESHNESS_MS:
            reject("Fresh scoped completion required")
        if not required <= item[1]:
            reject("Unavailable supported Site CLI command")

    def discover(self, scope: str) -> bytes:
        """Query only qualified completion contexts, then clear pending input."""
        if scope not in DISCOVERY:
            reject("Unsupported completion scope")
        started = self.monotonic()
        deadline = min(self.deadlines[0], started + COMMAND_MS)
        try:
            self.guard(deadline)
            words = DISCOVERY[scope].split()
            if words:
                self.require("root", {words[0]})
            if len(words) > 1:
                self.require("execcli", {words[1]})
            command = DISCOVERY[scope].encode()
            raw = self.transport.exchange(command, b"\t", _deadline_ms=deadline)
            item = self.retain("completion-" + scope, command + b"\t", raw, started)
            parsed = visible(raw)
            if parsed is None:
                reject("Incomplete Site CLI completion controls")
            tokens: set[str] = set()
            for line in parsed.decode("utf-8", errors="strict").splitlines():
                columns = line.strip().split()
                if columns and all(column in KNOWN_COMPLETIONS for column in columns):
                    tokens.update(columns)
                elif (
                    columns
                    and columns[0] in KNOWN_COMPLETIONS
                    and re.search(r"\S\s{2,}\S", line)
                ):
                    tokens.add(columns[0])
            # Ctrl-U clears an unfinished completion line; it does not run it.
            self.transport.clear_pending(deadline_ms=deadline)
            self.guard(deadline)
            self.completions[scope] = (
                self.monotonic(),
                frozenset(tokens),
                str(item["sha256"]),
            )
            record(
                self.transport.root
                / ("guest-" + str(len(self.retained)) + ".verified.private.json"),
                item,
            )
        except BaseException as error:
            self.failure("completion-" + scope, error)
            raise
        else:
            return raw

    def command(self, kind: str, container_id: str | None) -> str:
        """Construct commands only from supported mappings and fresh local IDs."""
        if kind in FIXED:
            if container_id is not None:
                reject("Unexpected container ID")
            command = FIXED[kind]
        elif kind in ("cri-inspect", "cri-logs", "docker-inspect", "docker-logs"):
            self.require("root", {"execcli"})
            self.require("execcli", {kind.replace("cri-", "crictl-")})
            runtime = kind.split("-", 1)[0]
            listing = self.listings.get(runtime)
            if (
                listing is None
                or not 0 <= self.monotonic() - listing[0] <= FRESHNESS_MS
            ):
                reject("Fresh original listing required")
            if (
                container_id is None
                or CONTAINER_ID.fullmatch(container_id) is None
                or container_id not in listing[1]
                or sum(
                    value.startswith(container_id) or container_id.startswith(value)
                    for value in listing[1]
                )
                != 1
            ):
                reject("Foreign or ambiguous container ID")
            command = "execcli " + kind.replace("cri-", "crictl-") + " " + container_id
            if kind.endswith("logs"):
                self.require(kind, {"--tail"})
                command += " --tail=200"
        else:
            reject("Unsupported Site CLI operation")
        words = command.split()
        self.require("root", {words[0]})
        if words[0] in ("status", "execcli"):
            self.require(words[0], {words[1]})
        if kind in ("vpm-journal", "boot-warnings"):
            self.require("journal", {word for word in words if word.startswith("-")})
        return command

    def run(self, kind: str, *, container_id: str | None = None) -> bytes:
        """Execute an approved original-bound capture without accepting coverage."""
        command = self.command(kind, container_id).encode()
        started = self.monotonic()
        deadline = min(self.deadlines[0], started + COMMAND_MS)
        try:
            self.guard(deadline)
            raw = self.transport.exchange(command, _deadline_ms=deadline)
            item = self.retain(kind, command + b"\r", raw, started)
            if container_id is not None:
                item.update(
                    {
                        "containerId": container_id,
                        "listingSha256": self.listings[kind.split("-", 1)[0]][2],
                    }
                )
            if kind.endswith("logs") or kind in ("vpm-journal", "boot-warnings"):
                text = visible(raw)
                if text is None:
                    reject("Incomplete log terminal controls")
                item["truncated"] = len(text.splitlines()) >= LOG_LINES
            self.guard(deadline)
            if kind in ("cri-list", "docker-list"):
                text = visible(raw)
                if text is None or not re.search(rb"CONTAINER\s+(?:ID|IMAGE)", text):
                    reject("Malformed original container listing")
                rows = text.decode("utf-8", errors="strict").splitlines()
                headers = [
                    index
                    for index, row in enumerate(rows)
                    if re.search(r"CONTAINER\s+(?:ID|IMAGE)", row)
                ]
                if len(headers) != 1:
                    reject("Malformed original container listing")
                ids: list[str] = []
                for row in rows[headers[0] + 1 :]:
                    if not row.strip() or PROMPT.fullmatch(row.encode()):
                        continue
                    columns = row.split()
                    if (
                        len(columns) < CE_NIC_COUNT
                        or CONTAINER_ID.fullmatch(columns[0]) is None
                    ):
                        reject("Malformed original container listing")
                    ids.append(columns[0])
                parsed_ids = tuple(ids)
                if len(parsed_ids) != len(set(parsed_ids)):
                    reject("Ambiguous original container listing")
                self.listings[kind.split("-", 1)[0]] = (
                    self.monotonic(),
                    parsed_ids,
                    str(item["sha256"]),
                )
            record(
                self.transport.root
                / ("guest-" + str(len(self.retained)) + ".verified.private.json"),
                item,
            )
        except BaseException as error:
            self.failure(kind, error)
            raise
        else:
            return raw

    def close(self) -> bool:
        """Use verified SSH protocol closure and retain unresolved transports."""
        if self.closed:
            return True
        self.transport.disconnect()
        self.closed = self.transport.close()
        return self.closed
