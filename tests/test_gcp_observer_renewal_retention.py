"""Offline retention failures preserve both causes; no guest or cloud execution."""

import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "offline_renewal_retention",
    ROOT / "plugins/terraform/scripts/gcp_observer_client_abi_renewal.py",
)
if SPEC is None or SPEC.loader is None:
    MESSAGE = "Original renewal source unavailable"
    raise RuntimeError(MESSAGE)
renewal = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(renewal)
SOURCE = (ROOT / "plugins/terraform/scripts/gcp_observer_client_abi.py").read_bytes()


class RenewalRetentionTests(unittest.TestCase):
    def test_request_cannot_extend_beyond_its_original_peer_freshness(self):
        now = renewal.monotonic_ms()
        config = {
            "schemaVersion": 2,
            "kind": "original-observer-client-abi-renewal",
            "instanceId": "123456",
            "nonce": "a" * 64,
            "uid": os.getuid(),
            "bootId": "offline-fixture",
            "pythonPath": "offline-fixture",
            "pythonSha256": "b" * 64,
            "archiveSha256": "c" * 64,
            "guestDeadlineMs": now + 60000,
            "installationNonce": "d" * 64,
            "installationReceiptSha256": "e" * 64,
            "installationFinishedMs": now - 400000,
            "peerChallenge": "f" * 64,
            "peerMonotonicMs": now - 299500,
        }
        caught: ValueError | None = None
        with patch.object(renewal, "monotonic_ms", return_value=now):
            try:
                renewal.request(config, SOURCE)
            except ValueError as error:
                caught = error
            clipped = {**config, "guestDeadlineMs": config["peerMonotonicMs"] + 300000}
            admitted = renewal.request(clipped, SOURCE)
            assert admitted["guestDeadlineMs"] == clipped["guestDeadlineMs"]
        assert caught is not None
        assert "peer freshness" in str(caught)

    def test_peer_expiry_inside_probe_refuses_before_further_probe_work(self):
        clock = [1000000]
        config = {
            "instanceId": "123456",
            "archiveSha256": "c" * 64,
            "peerMonotonicMs": clock[0],
            "guestDeadlineMs": clock[0] + 60000,
        }
        legacy = {"guestDeadlineMs": config["guestDeadlineMs"]}
        after_expiry: list[bool] = []
        module = SimpleNamespace(
            FILES={},
            directory=lambda _path: None,
            read_owned=lambda *_args: None,
            persist=lambda *_args: None,
            OriginalGuestScope=lambda *args: args,
            guard=lambda *_args: None,
        )
        original_guard = module.guard

        def probe(*_args):
            clock[0] = 1300001
            module.guard(legacy, {}, None)
            after_expiry.append(True)
            return {}

        module.probe = probe
        caught: ValueError | None = None
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
            patch.object(renewal, "monotonic_ms", side_effect=lambda: clock[0]),
        ):
            try:
                renewal.probe_clients(module, config, legacy, {}, None, Path(directory))
            except ValueError as error:
                caught = error
        assert caught is not None
        assert "peer proof" in str(caught)
        assert not after_expiry
        assert module.guard is original_guard

    def test_retention_failure_keeps_both_original_errors_and_its_own_cause(self):
        now = renewal.monotonic_ms()
        config = {
            "schemaVersion": 2,
            "kind": "original-observer-client-abi-renewal",
            "instanceId": "123456",
            "nonce": "a" * 64,
            "uid": os.getuid(),
            "bootId": "offline-fixture",
            "pythonPath": "offline-fixture",
            "pythonSha256": "b" * 64,
            "archiveSha256": "c" * 64,
            "guestDeadlineMs": now + 60000,
            "installationNonce": "d" * 64,
            "installationReceiptSha256": "e" * 64,
            "installationFinishedMs": now - 400000,
            "peerChallenge": "f" * 64,
            "peerMonotonicMs": now,
        }
        original = ValueError("Offline original source failure")
        retention = RuntimeError("Offline retention failure")
        caught: ExceptionGroup | None = None
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
            patch.object(renewal, "load_abi", side_effect=original),
            patch.object(renewal, "retain_failure", side_effect=retention),
        ):
            try:
                renewal.renew_original_clients(config, SOURCE)
            except ExceptionGroup as error:
                caught = error
        assert caught is not None
        assert caught.exceptions == (original, retention)
        assert caught.__cause__ is retention
