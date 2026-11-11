"""Source guard and dispatch contracts for the real Site CLI worker."""

from __future__ import annotations

from collections import namedtuple

import pytest

from plugins.terraform.scripts.guest_worker import GuestControlWorker, ParentGuestGuards


class Peer:
    def __init__(self):
        self.sent = []
        self.change = {}

    def send(self, value, deadline):
        self.sent.append(value)

    def receive(self, deadline):
        value = self.sent[-1]
        return {
            "type": "guard-result",
            "id": value["id"],
            "guard": value["guard"],
            "anchor": value["anchor"],
            "approved": True,
            **self.change,
        }


class Guest:
    def __init__(self, binding):
        self.binding = binding
        self.retained = []
        self.calls = []
        self.closed = False

    def run(self, kind, *, container_id=None):
        self.calls.append(("capture", kind, container_id))
        self.retained.append(
            {
                "path": "/private/output",
                "sha256": "a" * 64,
                "truncated": kind == "vpm-journal",
                "guestAcceptanceComplete": False,
            }
        )

    def discover(self, scope):
        self.calls.append(("discover", scope))
        self.retained.append(
            {
                "path": "/private/discovery",
                "sha256": "b" * 64,
                "guestAcceptanceComplete": False,
            }
        )

    def close(self):
        self.closed = True
        return True


@pytest.fixture
def binding():

    value = namedtuple(
        "Binding", "instance_id observer_id token_sha256 ownership_sha256"
    )
    return value("123", "456", "a" * 64, "b" * 64)


def test_parent_guards_bind_original_node_and_exact_source_response(binding):
    peer = Peer()
    guards = ParentGuestGuards(peer, binding, 100000, monotonic=lambda: 1000)
    guards.inputs()
    guards.original(binding)
    guards.trust(binding, "ce")
    assert [item["guard"] for item in peer.sent] == ["inputs", "original", "trust"]
    assert peer.sent[-1]["role"] == "ce"
    assert peer.sent[-1]["instanceId"] == "123"
    assert peer.sent[-1]["observerId"] == "456"


@pytest.mark.parametrize(
    "change",
    [
        {"approved": False},
        {"id": 2},
        {"anchor": "c" * 64},
        {"guard": "foreign"},
        {"extra": True},
    ],
)
def test_failed_or_foreign_parent_guard_permanently_retires_capture(binding, change):
    peer = Peer()
    peer.change = change
    guards = ParentGuestGuards(peer, binding, 100000, monotonic=lambda: 1000)
    with pytest.raises(
        ValueError, match=r"Original|Supported|Unexpected|Duplicate|Nonfinite"
    ):
        guards.inputs()
    peer.change = {}
    with pytest.raises(ValueError, match="retired"):
        guards.inputs()


def test_worker_dispatches_only_declared_operations_and_keeps_incomplete_logs(binding):
    peer = Peer()
    guest = Guest(binding)
    worker = GuestControlWorker(peer, guest, 100000, monotonic=lambda: 1000)
    result = worker.dispatch(
        {"type": "command", "id": 1, "operation": "discover", "scope": "root"}
    )
    assert result["evidence"][0]["path"] == "/private/discovery"
    result = worker.dispatch(
        {"type": "command", "id": 2, "operation": "capture", "kind": "vpm-journal"}
    )
    assert result["evidence"][0]["truncated"] is True
    assert result["guestAcceptanceComplete"] is False
    with pytest.raises(
        ValueError, match=r"Original|Supported|Unexpected|Duplicate|Nonfinite"
    ):
        worker.dispatch(
            {"type": "command", "id": 2, "operation": "capture", "kind": "vpm"}
        )
    assert (
        worker.dispatch({"type": "command", "id": 3, "operation": "close"})["closed"]
        is True
    )
    assert guest.closed


def test_binding_replacement_refuses_before_guest_command(binding):
    peer = Peer()
    guest = Guest(binding)
    worker = GuestControlWorker(peer, guest, 100000, monotonic=lambda: 1000)
    guest.binding = binding._replace(instance_id="999")
    with pytest.raises(ValueError, match="binding"):
        worker.dispatch(
            {"type": "command", "id": 1, "operation": "capture", "kind": "vpm"}
        )
    assert not guest.calls


def test_retired_capture_can_only_close_its_original_session(binding):
    peer = Peer()
    guest = Guest(binding)
    worker = GuestControlWorker(peer, guest, 100000, monotonic=lambda: 1000)
    with pytest.raises(
        ValueError, match=r"Original|Supported|Unexpected|Duplicate|Nonfinite"
    ):
        worker.dispatch(
            {"type": "command", "id": 1, "operation": "capture", "kind": "vpm; shell"}
        )
    with pytest.raises(ValueError, match="retired"):
        worker.dispatch(
            {"type": "command", "id": 1, "operation": "capture", "kind": "vpm"}
        )
    assert (
        worker.dispatch({"type": "command", "id": 1, "operation": "close"})["closed"]
        is True
    )


@pytest.mark.parametrize("change", [{"id": True}, {"approved": 1}])
def test_guard_boolean_id_or_integer_approval_cannot_impersonate_source(
    binding, change
):
    peer = Peer()
    peer.change = change
    guards = ParentGuestGuards(peer, binding, 100000, monotonic=lambda: 1000)
    with pytest.raises(
        ValueError, match=r"Original|Supported|Unexpected|Duplicate|Nonfinite"
    ):
        guards.inputs()


def test_original_close_window_remains_available_after_operation_deadline(binding):
    """Close the original session within its fixed reserve without new capture."""
    now = [2001]
    peer = Peer()
    peer.receive = lambda _deadline: {"type": "command", "id": 1, "operation": "close"}
    guest = Guest(binding)
    worker = GuestControlWorker(
        peer, guest, 2000, closure_deadline_ms=2500, monotonic=lambda: now[0]
    )
    assert worker.serve_once()["closed"] is True
    assert peer.sent[-1]["closed"] is True


def test_close_reserve_does_not_authorize_more_guest_capture(binding):
    """Keep capture retired after the original operation while closure remains."""
    peer = Peer()
    guest = Guest(binding)
    worker = GuestControlWorker(
        peer, guest, 2000, closure_deadline_ms=2500, monotonic=lambda: 2001
    )
    with pytest.raises(TimeoutError, match="deadline"):
        worker.dispatch(
            {"type": "command", "id": 1, "operation": "capture", "kind": "vpm"}
        )
    assert not guest.calls
    assert (
        worker.dispatch({"type": "command", "id": 1, "operation": "close"})["closed"]
        is True
    )


def test_closing_parent_guard_allows_only_original_input_checks(binding):
    """Use the declared original close reserve without renewing cloud authority."""
    peer = Peer()
    guards = ParentGuestGuards(
        peer, binding, 2000, closure_deadline_ms=2500, monotonic=lambda: 2001
    )
    guards.begin_close()
    guards.inputs()
    with pytest.raises(ValueError, match="closing"):
        guards.original(binding)
