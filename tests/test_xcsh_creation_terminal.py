"""Retained creation evidence at a verified original group exit; no replay."""

import copy

import pytest

from plugins.terraform.scripts import guest_pty, xcsh_creation_reader as reader

pytest_plugins = ["tests.test_xcsh_creation_observer"]


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
