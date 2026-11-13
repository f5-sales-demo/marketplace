"""Original parent-verified dispatch around the real SSH Site CLI session."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, NoReturn, Protocol

import psutil

from .gcp_guest_session import GuestGuards, GuestOptions, GuestSession
from .guest_control import clock_ms, decode_guest_command, integer_type

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from .gcp_guest_session import GuestBinding
    from .guest_control import ControlPeer


def refuse(message: str) -> NoReturn:
    """Refuse invalid original control input without exposing its value."""
    raise ValueError(message)


def expired(message: str) -> NoReturn:
    """Refuse an exhausted original command deadline."""
    raise TimeoutError(message)


def interrupted(message: str) -> NoReturn:
    """Retain an incomplete original peer stream as a failure."""
    raise EOFError(message)


def binding_anchor(binding: GuestBinding) -> str:
    """Bind every original VM, token, NIC and SSH input in the immutable tuple."""
    raw = json.dumps(
        binding._asdict(), sort_keys=True, default=str, allow_nan=False
    ).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def close_deadline(operation: int, requested: int | None) -> int:
    """Bound closure by the original declared five-minute reserve."""
    value = operation if requested is None else requested
    if (
        not integer_type(operation)
        or not integer_type(value)
        or operation <= 0
        or not operation <= value <= operation + 300000
    ):
        refuse("Original guest operation and bounded close reserve required")
    return value


class ParentGuestGuards:
    """Request independent original cloud and serial checks from the parent."""

    def __init__(
        self,
        port: ControlPeer,
        binding: GuestBinding,
        operation_deadline_ms: int,
        *,
        monotonic: Callable[[], int] = clock_ms,
        closure_deadline_ms: int | None = None,
    ) -> None:
        """Retain the original peer, fixed budget and capture identity."""
        self.port = port
        self.binding = binding
        self.anchor = binding_anchor(binding)
        self.deadline = operation_deadline_ms
        self.closure_deadline = close_deadline(
            operation_deadline_ms, closure_deadline_ms
        )
        self.closing = False
        self.monotonic = monotonic
        self.sequence = 0
        self.failed = False

    def _check(self, guard: str, role: str | None = None) -> None:
        if self.failed and not (self.closing and guard == "inputs"):
            msg = "Original parent guest guard retired"
            refuse(msg)
        try:
            now = self.monotonic()
            if self.closing and guard != "inputs":
                refuse("Original guest guard is closing; cloud capture remains retired")
            limit = self.closure_deadline if self.closing else self.deadline
            deadline = min(limit, now + 60000)
            if now >= deadline or binding_anchor(self.binding) != self.anchor:
                msg = "Original guest guard budget or binding differs"
                refuse(msg)
            self.sequence += 1
            request = {
                "type": "guard",
                "id": self.sequence,
                "guard": guard,
                "anchor": self.anchor,
                "instanceId": self.binding.instance_id,
                "observerId": self.binding.observer_id,
            }
            if role is not None:
                if role not in ("observer", "ce"):
                    msg = "Original serial trust role required"
                    refuse(msg)
                request["role"] = role
            self.port.send(request, deadline)
            response = self.port.receive(deadline)
            expected = {
                "type": "guard-result",
                "id": self.sequence,
                "guard": guard,
                "anchor": self.anchor,
                "approved": True,
            }
            if (
                response != expected
                or not integer_type(response.get("id"))
                or response.get("approved") is not True
            ):
                msg = "Original parent guest verification refused"
                refuse(msg)
            if self.monotonic() >= deadline:
                msg = "Original parent guest guard deadline exhausted"
                expired(msg)
        except BaseException:
            self.failed = True
            raise

    def begin_close(self) -> None:
        """Retire cloud commands and retain only the fixed original close checks."""
        self.closing = True

    def inputs(self) -> None:
        """Verify original parent-owned input identities."""
        self._check("inputs")

    def original(self, binding: GuestBinding) -> None:
        """Verify the original VM, token and NIC ownership join."""
        if binding_anchor(binding) != self.anchor:
            self.failed = True
            msg = "Original guest binding changed"
            refuse(msg)
        self._check("original")

    def trust(self, binding: GuestBinding, role: str) -> None:
        """Verify the original serial-anchored SSH host trust."""
        if binding_anchor(binding) != self.anchor:
            self.failed = True
            msg = "Original guest binding changed"
            refuse(msg)
        self._check("trust", role)


class CaptureCommand(Protocol):
    """Supported capture signature retained from the original guest session."""

    def __call__(self, kind: str, *, container_id: str | None = None) -> bytes:
        """Retain original guest output for one supported capture."""


class GuestCapture(Protocol):
    """Original session contract; the production factory opens real SSH only."""

    @property
    def binding(self) -> GuestBinding:
        """Read the original immutable guest binding."""

    @property
    def retained(self) -> list[dict[str, object]]:
        """Read retained evidence from the original session."""

    def run(self, kind: str, *, container_id: str | None = None) -> bytes:
        """Capture a supported original-node diagnostic."""

    def discover(self, scope: str) -> bytes:
        """Discover a supported Site CLI scope."""

    def close(self) -> bool:
        """Close the original session without replay."""


@dataclass(frozen=True)
class OriginalGuestMethods:
    """Retain typed bound methods without accepting session replacement."""

    capture: CaptureCommand
    discover: Callable[[str], bytes]
    close: Callable[[], bool]


class GuestControlWorker:
    """Dispatch supported commands and retain incomplete capture as incomplete."""

    def __init__(
        self,
        port: ControlPeer,
        session: GuestCapture,
        operation_deadline_ms: int,
        *,
        monotonic: Callable[[], int] = clock_ms,
        closure_deadline_ms: int | None = None,
        begin_close: Callable[[], None] | None = None,
    ) -> None:
        """Retain the original peer, fixed budget and capture identity."""
        self.port = port
        self.session = session
        self.anchor = binding_anchor(session.binding)
        self.deadlines = (
            operation_deadline_ms,
            close_deadline(operation_deadline_ms, closure_deadline_ms),
        )
        self.begin_close = begin_close
        self.monotonic = monotonic
        self.sequence = 0
        self.failed = self.closed = False
        self.original_methods = OriginalGuestMethods(
            session.run, session.discover, session.close
        )

    def dispatch(self, value: object) -> dict:
        """Execute one original-bound supported command and retain evidence."""
        try:
            command = decode_guest_command(value)
            operation = command["operation"]
            if self.closed or command["id"] != self.sequence + 1:
                msg = "Original guest command sequence or lifecycle differs"
                refuse(msg)
            if self.failed and operation != "close":
                msg = "Original guest capture retired"
                refuse(msg)
            if binding_anchor(self.session.binding) != self.anchor:
                msg = "Original guest binding changed"
                refuse(msg)
            limit = self.deadlines[1] if operation == "close" else self.deadlines[0]
            if self.monotonic() >= limit:
                msg = "Original guest operation deadline exhausted"
                expired(msg)
            self.sequence = command["id"]
            before = len(self.session.retained)
            result = {
                "type": "command-result",
                "id": self.sequence,
                "operation": operation,
                "anchor": self.anchor,
                "guestAcceptanceComplete": False,
            }
            if operation == "close":
                if self.begin_close is not None:
                    self.begin_close()
                self.closed = self.original_methods.close()
                result["closed"] = self.closed
            elif operation == "discover":
                self.original_methods.discover(command["scope"])
            else:
                self.original_methods.capture(
                    command["kind"], container_id=command.get("containerId")
                )
            if binding_anchor(self.session.binding) != self.anchor:
                msg = "Original guest binding changed during capture"
                refuse(msg)
            result["evidence"] = [dict(item) for item in self.session.retained[before:]]
        except BaseException:
            self.failed = True
            raise
        return result

    def serve_once(self) -> dict:
        """Consume one parent command while nested original guards use this port."""
        deadline = min(self.deadlines[1], self.monotonic() + 60000)
        try:
            value = self.port.receive(deadline)
            command = decode_guest_command(value)
        except BaseException:
            self.failed = True
            raise
        before = len(self.session.retained)
        try:
            result = self.dispatch(command)
        except (ValueError, EOFError, OSError, RuntimeError, psutil.Error) as error:
            if self.sequence != command["id"]:
                raise
            result = {
                "type": "command-failure",
                "id": self.sequence,
                "operation": command["operation"],
                "anchor": self.anchor,
                "guestAcceptanceComplete": False,
                "errorType": type(error).__name__,
                "evidence": [dict(item) for item in self.session.retained[before:]],
            }
        self.port.send(result, deadline)
        return result


def open_guest_control_worker(
    port: ControlPeer,
    root: Path,
    binding: GuestBinding,
    executable: Path,
    executable_sha256: str,
    deadlines: tuple[int, int],
) -> GuestControlWorker:
    """Open the shipped real SSH PTY; no conversational transport override."""
    guards = ParentGuestGuards(
        port, binding, deadlines[0], closure_deadline_ms=deadlines[1]
    )
    session = GuestSession(
        root,
        binding,
        options=GuestOptions(
            executable=executable,
            executable_sha256=executable_sha256,
            guards=GuestGuards(guards.inputs, guards.original, guards.trust),
            deadlines=deadlines,
        ),
    )
    return GuestControlWorker(
        port,
        session,
        deadlines[0],
        closure_deadline_ms=deadlines[1],
        begin_close=guards.begin_close,
    )
