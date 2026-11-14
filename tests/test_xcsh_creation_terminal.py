"""Retained creation evidence at a verified original group exit; no replay."""

import copy
import hashlib
import json
import sys
import time

import pytest

from plugins.terraform.scripts import (
    gcp_provider_reader,
    guest_pty,
    xcsh_creation_reader as reader,
)

pytest_plugins = ["tests.xcsh_creation_fixtures"]


def close_original(original):
    parent = original["parent"]
    actor = guest_pty.process_identity(parent.pid)
    parent.stdin.close()
    assert parent.wait(timeout=15) == 0
    assert guest_pty.group_absent(actor)


def test_retained_original_receipt_joins_after_group_exit_without_a_new_observation(
    original,
):
    observer = original["observer"]
    witness = observer.observe().witnesses[0]
    close_original(original)
    result = reader.ready_creation_receipts(observer, {witness.pid: witness})
    assert result is not None
    assert len(result) == 1
    assert result[0]["process"]["pid"] == original["row"]["child"]
    assert observer.retired is False
    assert observer.monitor.retired is False


@pytest.mark.parametrize("original", ["partial"], indirect=True)
def test_incomplete_scope_at_original_exit_retains_partial_evidence_without_a_pass(
    original,
):
    observer = original["observer"]
    witness = observer.observe().witnesses[0]
    close_original(original)
    assert reader.ready_creation_receipts(observer, {witness.pid: witness}) is None
    assert observer.retired is False
    assert list(observer.root.glob("observation-*.private.json"))


def test_copied_terminal_witness_cannot_become_a_retained_original_receipt(original):
    observer = original["observer"]
    witness = observer.observe().witnesses[0]
    close_original(original)
    with pytest.raises(ValueError, match="issued"):
        reader.ready_creation_receipts(observer, {witness.pid: copy.copy(witness)})


@pytest.mark.parametrize("original", ["partial"], indirect=True)
def test_original_target_receipt_is_available_before_remaining_targets_exist(original):
    observer = original["observer"]
    witness = observer.observe().witnesses[0]
    receipts = reader.available_creation_receipts(observer, {witness.pid: witness})
    assert len(receipts) == 1
    assert receipts[0]["target"]["name"] == "example-token"
    assert reader.ready_creation_receipts(observer, {witness.pid: witness}) is None
    assert observer.retired is False
    assert not list(observer.root.glob("complete-*.private.json"))
    evidence = json.loads(
        next(observer.root.glob("available-*.private.json")).read_text()
    )
    assert evidence["targetCount"] == 1
    assert evidence["expectedTargetCount"] == 2
    assert evidence["complete"] is False
    assert evidence["executionAuthorized"] is False
    assert evidence["signalsSent"] is False


@pytest.mark.parametrize("original", ["partial"], indirect=True)
def test_partial_original_receipt_remains_joinable_at_original_group_exit(original):
    observer = original["observer"]
    witness = observer.observe().witnesses[0]
    close_original(original)
    receipts = reader.available_creation_receipts(observer, {witness.pid: witness})
    assert len(receipts) == 1
    assert receipts[0]["process"]["pid"] == original["row"]["child"]
    assert reader.ready_creation_receipts(observer, {witness.pid: witness}) is None


def test_copied_witness_cannot_supply_partial_target_evidence(original):
    observer = original["observer"]
    witness = observer.observe().witnesses[0]
    with pytest.raises(ValueError, match="issued"):
        reader.available_creation_receipts(observer, {witness.pid: copy.copy(witness)})


@pytest.mark.parametrize("original", ["partial"], indirect=True)
def test_previously_joined_target_receipt_cannot_disappear_from_partial_evidence(
    original,
):
    observer = original["observer"]
    witness = observer.observe().witnesses[0]
    receipts = reader.available_creation_receipts(observer, {witness.pid: witness})
    path = observer.directory / ("receipt-" + receipts[0]["nonce"] + ".json")
    path.unlink()
    with pytest.raises((ValueError, OSError)):
        reader.available_creation_receipts(observer, {witness.pid: witness})


@pytest.mark.parametrize("original", ["two"], indirect=True)
def test_one_pending_claim_does_not_hide_a_mature_original_target(original):
    observer = original["observer"]
    witness = observer.observe().witnesses[0]
    claims = observer.witnesses[id(witness)][1]
    pending = next(
        claim for claim in claims if claim.data["target"]["name"] == "example-site"
    )
    path = observer.directory / ("receipt-" + pending.data["nonce"] + ".json")
    raw = path.read_bytes()
    path.unlink()
    receipts = reader.available_creation_receipts(observer, {witness.pid: witness})
    assert [row["target"]["name"] for row in receipts] == ["example-token"]
    assert reader.ready_creation_receipts(observer, {witness.pid: witness}) is None
    assert observer.retired is False
    path.write_bytes(raw)
    path.chmod(0o400)
    ready = reader.ready_creation_receipts(observer, {witness.pid: witness})
    assert ready is not None
    assert len(ready) == 2


@pytest.mark.parametrize("original", ["partial"], indirect=True)
def test_partial_target_is_published_once_while_full_scope_is_pending(original):
    observer = original["observer"]
    witness = observer.observe().witnesses[0]
    root = observer.root / "reader-output"
    root.mkdir(mode=0o700)
    retained: dict[str, tuple[str, dict[str, str], bytes]] = {}
    base = {
        "requestSha256": "c" * 64,
        "executionAuthorized": False,
        "signalsSent": False,
        "cloudSubmissions": 0,
    }
    reader.retain_available_creation_receipts(
        root, base, observer, {witness.pid: witness}, guest_pty, retained
    )
    paths = list(root.glob("xcsh-target-*.private.json"))
    assert len(paths) == 1
    before = paths[0].stat()
    data = json.loads(paths[0].read_text())
    assert data["kind"] == "original-xcsh-target-creation-evidence"
    assert data["complete"] is False
    assert data["executionAuthorized"] is False
    assert data["cloudSubmissions"] == 0
    assert data["receipt"]["target"]["name"] == "example-token"
    assert reader.ready_creation_receipts(observer, {witness.pid: witness}) is None
    reader.retain_available_creation_receipts(
        root, base, observer, {witness.pid: witness}, guest_pty, retained
    )
    assert list(root.glob("xcsh-target-*.private.json")) == paths
    assert paths[0].stat() == before


@pytest.mark.parametrize("original", ["partial"], indirect=True)
def test_changed_published_partial_target_is_refused(original):
    observer = original["observer"]
    witness = observer.observe().witnesses[0]
    root = observer.root / "reader-output"
    root.mkdir(mode=0o700)
    retained: dict[str, tuple[str, dict[str, str], bytes]] = {}
    reader.retain_available_creation_receipts(
        root, {}, observer, {witness.pid: witness}, guest_pty, retained
    )
    path = next(root.glob("xcsh-target-*.private.json"))
    path.chmod(0o600)
    path.write_text("{}")
    path.chmod(0o400)
    with pytest.raises((ValueError, OSError)):
        reader.retain_available_creation_receipts(
            root, {}, observer, {witness.pid: witness}, guest_pty, retained
        )


@pytest.mark.parametrize("original", ["partial"], indirect=True)
def test_original_capture_window_retains_target_before_full_scope_completion(
    original, monkeypatch
):
    observer = original["observer"]
    root = observer.root / "capture-window"
    root.mkdir(mode=0o700)
    actor = guest_pty.process_identity(original["parent"].pid)
    monkeypatch.setitem(
        sys.modules, "xcsh_original_creation.gcp_provider_reader", gcp_provider_reader
    )
    scope_file = original["scope"]
    parent_identity = reader.identity(scope_file.parent.lstat())
    guard = reader.OriginalCreationInputs(
        {
            "prepared:scope": {
                "path": str(scope_file),
                "sha256": hashlib.sha256(scope_file.read_bytes()).hexdigest(),
                "expectedIdentity": reader.identity(scope_file.lstat()),
                "expectedParentIdentity": {
                    key: parent_identity[key] for key in reader.PARENT_FIELDS
                },
            },
        }
    )
    deadline = time.monotonic_ns() // 1000000 + 300
    data = {"executor": actor, "scope": {"targets": list(observer.targets.values())}}
    base = {"executionAuthorized": False, "signalsSent": False, "cloudSubmissions": 0}
    reader.capture_creation_window(
        root,
        data,
        guard,
        observer,
        guest_pty,
        base,
        deadline,
    )
    paths = list(root.glob("xcsh-target-*.private.json"))
    assert len(paths) == 1
    assert (
        json.loads(paths[0].read_text())["receipt"]["target"]["name"] == "example-token"
    )
    result = json.loads((root / "xcsh-result.private.json").read_text())
    assert result["complete"] is False
    assert result["targetCount"] == 2
    assert result["receipts"] == []
    assert observer.retired is False
