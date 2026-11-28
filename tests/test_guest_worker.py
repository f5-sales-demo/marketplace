"""Source guard and dispatch contracts for the real Site CLI worker."""

from __future__ import annotations

from pathlib import Path

import pytest

from plugins.terraform.scripts.gcp_guest_session import GuestBinding
from plugins.terraform.scripts.guest_worker import GuestControlWorker, ParentGuestGuards


class Peer:
    def __init__(self):
        self.sent: list[dict] = []
        self.change: dict = {}
        self.incoming: dict | None = None

    def send(self, message: dict, deadline: int) -> None:
        self.sent.append(message)

    def receive(self, deadline: int) -> dict:
        if self.incoming is not None:
            return self.incoming
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
    def __init__(self, binding: GuestBinding):
        self.binding = binding
        self.retained: list[dict[str, object]] = []
        self.calls: list[tuple[str, str, str | None] | tuple[str, str]] = []
        self.closed = False

    def run(self, kind: str, *, container_id: str | None = None) -> bytes:
        self.calls.append(("capture", kind, container_id))
        self.retained.append(
            {
                "path": "/private/output",
                "sha256": "a" * 64,
                "truncated": kind == "vpm-journal",
                "guestAcceptanceComplete": False,
            }
        )

        return b"retained capture"

    def discover(self, scope: str) -> bytes:
        self.calls.append(("discover", scope))
        self.retained.append(
            {
                "path": "/private/discovery",
                "sha256": "b" * 64,
                "guestAcceptanceComplete": False,
            }
        )

        return b"retained discovery"

    def close(self) -> bool:
        self.closed = True
        return True


@pytest.fixture
def binding() -> GuestBinding:
    node_name = "example-node"
    site_name = "example-site"
    return GuestBinding(
        project="example-project",
        region="us-central1",
        site_name="example-site",
        node_name="example-node",
        zone="us-central1-a",
        instance_id="123",
        observer_name="example-observer",
        observer_id="456",
        observer_address="192.0.2.1",
        address="192.0.2.2",
        original_interfaces=("192.0.2.3", "192.0.2.2"),
        token_node=node_name,
        token_site=site_name,
        token_expires=2000.0,
        token_sha256="a" * 64,
        ownership_sha256="b" * 64,
        observer_key=Path("/private/observer-key"),
        ce_key=Path("/private/ce-key"),
        observer_hosts=Path("/private/observer-hosts"),
        ce_hosts=Path("/private/ce-hosts"),
        observer_algorithm="ssh-ed25519",
        ce_algorithm="ssh-ed25519",
    )


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
    peer.incoming = {"type": "command", "id": 1, "operation": "close"}
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


@pytest.mark.parametrize("now", [2500, 2501])
def test_close_refuses_at_or_after_original_reserve_without_touching_guest(
    binding, now
):
    peer = Peer()
    guest = Guest(binding)
    closing = []
    worker = GuestControlWorker(
        peer,
        guest,
        2000,
        closure_deadline_ms=2500,
        monotonic=lambda: now,
        begin_close=lambda: closing.append(True),
    )
    with pytest.raises(TimeoutError, match="deadline"):
        worker.dispatch({"type": "command", "id": 1, "operation": "close"})
    assert not guest.closed
    assert not closing


def test_worker_uses_original_bound_methods_after_attribute_replacement(
    binding, monkeypatch
):
    peer = Peer()
    guest = Guest(binding)
    worker = GuestControlWorker(peer, guest, 100000, monotonic=lambda: 1000)

    def replaced(*args, **kwargs):
        pytest.fail("Replacement method must never execute")

    for name in ("run", "discover", "close"):
        monkeypatch.setattr(guest, name, replaced)
    worker.dispatch(
        {"type": "command", "id": 1, "operation": "discover", "scope": "root"}
    )
    worker.dispatch({"type": "command", "id": 2, "operation": "capture", "kind": "vpm"})
    assert (
        worker.dispatch({"type": "command", "id": 3, "operation": "close"})["closed"]
        is True
    )
    assert guest.calls == [("discover", "root"), ("capture", "vpm", None)]


def test_failed_cloud_guard_keeps_only_verified_original_input_closure_authority(
    binding,
):
    peer = Peer()
    now = [1000]
    guards = ParentGuestGuards(
        peer, binding, 2000, closure_deadline_ms=2500, monotonic=lambda: now[0]
    )
    peer.change = {"approved": False}
    with pytest.raises(ValueError, match="verification refused"):
        guards.original(binding)
    assert guards.failed
    peer.change = {}
    now[0] = 2001
    guards.begin_close()
    guards.inputs()
    assert guards.failed
    with pytest.raises(ValueError, match=r"retired|closing"):
        guards.original(binding)


def test_valid_failed_command_retains_partial_evidence_and_can_close_without_replay(
    binding,
):
    class FailingGuest(Guest):
        def run(self, kind: str, *, container_id: str | None = None) -> bytes:
            super().run(kind, container_id=container_id)
            message = "Incomplete original capture"
            raise ValueError(message)

    peer = Peer()
    guest = FailingGuest(binding)
    worker = GuestControlWorker(peer, guest, 100000, monotonic=lambda: 1000)
    peer.incoming = {
        "type": "command",
        "id": 1,
        "operation": "capture",
        "kind": "vpm-journal",
    }
    failed = worker.serve_once()
    assert failed["type"] == "command-failure"
    assert failed["guestAcceptanceComplete"] is False
    assert failed["errorType"] == "ValueError"
    assert failed["evidence"][0]["truncated"] is True
    assert worker.failed
    peer.incoming = {"type": "command", "id": 2, "operation": "close"}
    assert worker.serve_once()["closed"] is True
    assert len(guest.calls) == 1
    assert worker.failed


def test_malformed_serve_command_permanently_retires_capture_before_any_guest_work(
    binding,
):
    peer = Peer()
    guest = Guest(binding)
    worker = GuestControlWorker(peer, guest, 100000, monotonic=lambda: 1000)
    peer.incoming = {
        "type": "command",
        "id": 1,
        "operation": "capture",
        "kind": "vpm; shell",
    }
    with pytest.raises(ValueError, match="capture kind"):
        worker.serve_once()
    assert worker.failed
    peer.incoming = {"type": "command", "id": 1, "operation": "capture", "kind": "vpm"}
    with pytest.raises(ValueError, match="retired"):
        worker.serve_once()
    assert not guest.calls
