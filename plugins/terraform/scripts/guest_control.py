"""Bounded original-session control frames for the real guest worker."""

from __future__ import annotations

import json
import os
import re
import select
import stat
import struct
import time
from typing import NoReturn, Protocol, TypeGuard

from .gcp_guest_session import CONTAINER_ID, DISCOVERY, FIXED


def refuse(message: str) -> NoReturn:
    """Refuse invalid original control input without exposing its value."""
    raise ValueError(message)


def expired(message: str) -> NoReturn:
    """Refuse an exhausted original command deadline."""
    raise TimeoutError(message)


def interrupted(message: str) -> NoReturn:
    """Retain an incomplete original peer stream as a failure."""
    raise EOFError(message)


MAX_FRAME = 65536
MAX_COMMAND_MS = 60000
NONCE = re.compile(r"[a-f0-9]{64}")
INSPECTIONS = frozenset(("cri-inspect", "cri-logs", "docker-inspect", "docker-logs"))


def clock_ms() -> int:
    """Read the original Linux monotonic clock."""
    return time.monotonic_ns() // 1000000


def _pairs(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result = {}
    for key, value in pairs:
        if key in result:
            msg = "Duplicate original guest control key"
            refuse(msg)
        result[key] = value
    return result


def integer_type(value: object) -> TypeGuard[int]:
    """Reject booleans wherever an original integer identity is required."""
    return isinstance(value, int) and not isinstance(value, bool)


def _integer(value: object) -> bool:
    return integer_type(value) and 0 < value <= 2**31 - 1


class ControlPeer(Protocol):
    """Bounded parent/worker wire contract; real factories use GuestControlPort."""

    def receive(self, deadline: int) -> dict:
        """Receive one attributed message within the original deadline."""

    def send(self, message: dict, deadline: int) -> None:
        """Send one attributed message within the original deadline."""


def decode_guest_command(value: object) -> dict:
    """Accept fixed Site CLI operations; source listing checks still gate IDs."""
    if (
        not isinstance(value, dict)
        or value.get("type") != "command"
        or not _integer(value.get("id"))
    ):
        msg = "Original guest command identity required"
        refuse(msg)
    operation = value.get("operation")
    expected = {"type", "id", "operation"}
    if operation == "close":
        pass
    elif operation == "discover":
        expected.add("scope")
        if not isinstance(value.get("scope"), str) or value["scope"] not in DISCOVERY:
            msg = "Supported guest discovery scope required"
            refuse(msg)
    elif operation == "capture":
        expected.add("kind")
        kind = value.get("kind")
        if not isinstance(kind, str) or (kind not in FIXED and kind not in INSPECTIONS):
            msg = "Supported guest capture kind required"
            refuse(msg)
        if kind in INSPECTIONS:
            expected.add("containerId")
            container = value.get("containerId")
            if (
                not isinstance(container, str)
                or CONTAINER_ID.fullmatch(container) is None
            ):
                msg = "Original bounded container ID required"
                refuse(msg)
    else:
        msg = "Supported guest operation required"
        refuse(msg)
    if set(value) != expected:
        msg = "Unexpected guest command fields"
        refuse(msg)
    return dict(value)


class GuestControlPort:
    """Retire on malformed, foreign, interrupted or timed-out original frames."""

    def __init__(self, read_fd: int, write_fd: int, session: str) -> None:
        """Bind the original peer descriptors and nonce before any frame."""
        if not isinstance(session, str) or NONCE.fullmatch(session) is None:
            msg = "Original guest control nonce required"
            refuse(msg)
        self.read_fd, self.write_fd, self.session = read_fd, write_fd, session
        self.sent = self.received = 0
        self.failed = False
        self.identities = {}
        for descriptor in dict.fromkeys((read_fd, write_fd)):
            if not integer_type(descriptor) or descriptor < 0:
                msg = "Original guest control descriptor required"
                refuse(msg)
            info = os.fstat(descriptor)
            if not stat.S_ISFIFO(info.st_mode) and not stat.S_ISSOCK(info.st_mode):
                msg = "Original guest control pipe or socket required"
                refuse(msg)
            self.identities[descriptor] = (info.st_dev, info.st_ino, info.st_mode)
            os.set_blocking(descriptor, False)

    def _guard(self, deadline: int) -> None:
        if self.failed:
            msg = "Original guest control port retired"
            refuse(msg)
        now = clock_ms()
        if not integer_type(deadline) or deadline - now > MAX_COMMAND_MS:
            msg = "Bounded original guest command deadline required"
            refuse(msg)
        if now >= deadline:
            msg = "Original guest control deadline exhausted"
            expired(msg)
        for descriptor, expected in self.identities.items():
            info = os.fstat(descriptor)
            if (info.st_dev, info.st_ino, info.st_mode) != expected:
                msg = "Original guest control descriptor changed"
                refuse(msg)

    def _read(self, size: int, deadline: int) -> bytes:
        chunks = []
        remaining = size
        while remaining:
            self._guard(deadline)
            ready, _, _ = select.select(
                [self.read_fd], [], [], max(0, (deadline - clock_ms()) / 1000)
            )
            if not ready:
                msg = "Original guest control deadline exhausted"
                expired(msg)
            try:
                chunk = os.read(self.read_fd, min(remaining, 4096))
            except BlockingIOError:
                continue
            if not chunk:
                msg = "Original guest control frame interrupted"
                interrupted(msg)
            chunks.append(chunk)
            remaining -= len(chunk)
        self._guard(deadline)
        return b"".join(chunks)

    def receive(self, deadline: int) -> dict:
        """Receive exactly one complete ordered frame from the original peer."""
        try:
            size = struct.unpack(">I", self._read(4, deadline))[0]
            if not 0 < size <= MAX_FRAME:
                msg = "Original guest control frame exceeds bound"
                refuse(msg)
            value = json.loads(
                self._read(size, deadline).decode("utf-8", errors="strict"),
                object_pairs_hook=_pairs,
                parse_constant=lambda _value: (_ for _ in ()).throw(
                    ValueError("Nonfinite original guest control value")
                ),
            )
            if not isinstance(value, dict) or set(value) != {
                "schemaVersion",
                "kind",
                "session",
                "sequence",
                "message",
            }:
                refuse("Original guest control attribution differs")
            if (
                not integer_type(value["schemaVersion"])
                or value["schemaVersion"] != 1
                or value["kind"] != "original-guest-control"
                or value["session"] != self.session
            ):
                refuse("Original guest control attribution differs")
            if (
                not _integer(value["sequence"])
                or value["sequence"] != self.received + 1
                or not isinstance(value["message"], dict)
            ):
                msg = "Original guest control attribution differs"
                refuse(msg)
            self.received += 1
            return value["message"]
        except BaseException:
            self.failed = True
            raise

    def send(self, message: dict, deadline: int) -> None:
        """Write a bounded complete frame without renewing its deadline."""
        try:
            self._guard(deadline)
            if not isinstance(message, dict) or not _integer(self.sent + 1):
                msg = "Original guest control message required"
                refuse(msg)
            payload = json.dumps(
                {
                    "schemaVersion": 1,
                    "kind": "original-guest-control",
                    "session": self.session,
                    "sequence": self.sent + 1,
                    "message": message,
                },
                allow_nan=False,
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")
            if not 0 < len(payload) <= MAX_FRAME:
                msg = "Original guest control frame exceeds bound"
                refuse(msg)
            raw = struct.pack(">I", len(payload)) + payload
            offset = 0
            while offset < len(raw):
                self._guard(deadline)
                _, ready, _ = select.select(
                    [], [self.write_fd], [], max(0, (deadline - clock_ms()) / 1000)
                )
                if not ready:
                    msg = "Original guest control deadline exhausted"
                    expired(msg)
                try:
                    count = os.write(self.write_fd, raw[offset : offset + 4096])
                except BlockingIOError:
                    continue
                if count <= 0:
                    msg = "Original guest control write interrupted"
                    interrupted(msg)
                offset += count
            self._guard(deadline)
            self.sent += 1
        except BaseException:
            self.failed = True
            raise
