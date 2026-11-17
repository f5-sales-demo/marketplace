"""Actual localhost scan with explicit offline guest identity; no GCP trust proof."""

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "original_ce_keyscan", ROOT / "plugins/terraform/scripts/gcp_observer_ce_keyscan.py"
)
if spec is None or spec.loader is None:
    message = "Original CE keyscan helper unavailable"
    raise RuntimeError(message)
scan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scan)
fixture_spec = importlib.util.spec_from_file_location(
    "original_keyscan_abi_fixture", ROOT / "tests/test_gcp_observer_client_abi.py"
)
if fixture_spec is None or fixture_spec.loader is None:
    message = "Original ABI fixture unavailable"
    raise RuntimeError(message)
fixture = importlib.util.module_from_spec(fixture_spec)
fixture_spec.loader.exec_module(fixture)
ABI_SOURCE = (
    ROOT / "plugins/terraform/scripts/gcp_observer_client_abi.py"
).read_bytes()


def request(proof):
    return {
        "schemaVersion": 1,
        "kind": "original-observer-ce-keyscan",
        "nonce": "1" * 64,
        "observerInstanceId": proof["instanceId"],
        "abiNonce": proof["nonce"],
        "abiReceiptSha256": hashlib.sha256(
            (json.dumps(proof, sort_keys=True) + "\n").encode()
        ).hexdigest(),
        "uid": proof["uid"],
        "bootId": proof["bootId"],
        "pythonPath": proof["pythonPath"],
        "pythonSha256": proof["pythonSha256"],
        "archiveSha256": proof["archiveSha256"],
        "guestDeadlineMs": fixture.abi.monotonic_ms() + 10000,
        "targetInstanceId": "789012",
        "targetAddress": "127.0.0.1",
        "project": "example-project",
        "zone": "us-central1-a",
        "nodeName": "example-ce",
        "network": "projects/example-project/global/networks/example-sli",
        "subnet": "projects/example-project/regions/us-central1/subnetworks/example-sli",
    }


class CeKeyscanGuestTests(unittest.TestCase):
    def test_abi_freshness_begins_at_capture_start_not_completion(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
            patch.object(fixture.abi, "identity", side_effect=fixture.current),
        ):
            proof = fixture.abi.verify_original_clients(fixture.install_delivered())
            now = scan.monotonic_ms()
            path = (
                Path(directory)
                / ".local/share/xcsh/gcp-observer-abi"
                / proof["instanceId"]
                / proof["nonce"]
                / "proof.private.json"
            )
            for change in (
                {"startedMs": now - scan.FRESH_MS - 1, "finishedMs": now - 1},
                {"startedMs": True},
                {"startedMs": now + 1, "finishedMs": now},
            ):
                with self.subTest(change=change):
                    value = {**proof, **change}
                    path.chmod(0o600)
                    path.write_text(json.dumps(value, sort_keys=True) + "\n")
                    path.chmod(0o400)
                    config = request(value)
                    with (
                        patch.object(scan, "monotonic_ms", return_value=now),
                        pytest.raises(ValueError, match="Original"),
                    ):
                        scan.original_proof(fixture.abi, config)

    def test_exact_original_abi_receipt_drives_actual_pinned_keyscan_without_granting_trust(
        self,
    ):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
            patch.object(fixture.abi, "identity", side_effect=fixture.current),
            patch.object(scan, "identity", side_effect=fixture.current),
        ):
            proof = fixture.abi.verify_original_clients(fixture.install_delivered())
            config = request(proof)
            original_load = scan.load_abi

            def loaded(source, path):
                module = original_load(source, path)
                module.identity = fixture.current
                return module

            with patch.object(scan, "load_abi", side_effect=loaded):
                result = scan.run_ce_keyscan(config, ABI_SOURCE)
            assert result["targetInstanceId"] == "789012"
            assert result["observerInstanceId"] == "123456"
            assert result["abiReceiptSha256"] == config["abiReceiptSha256"]
            assert result["sshTrustQualified"] is False
            assert result["guestAccessQualified"] is False
            assert result["process"]["args"] == [
                "-q",
                "-T",
                "15",
                "-t",
                "rsa",
                "-p",
                "22",
                "127.0.0.1",
            ]
            assert result["process"]["originalGroupClosed"] is True
            assert result["process"]["identity"]["clientSeals"] == 15
            with pytest.raises(ValueError, match="single-use"):
                scan.run_ce_keyscan(config, ABI_SOURCE)

    def test_foreign_source_and_injected_or_unknown_scope_refuse_before_journal_creation(
        self,
    ):
        config = request(
            {
                "instanceId": "123456",
                "nonce": "a" * 64,
                **fixture.current(),
                "archiveSha256": fixture.PINS["archiveSha256"],
            }
        )
        for change in (
            {"targetAddress": "127.0.0.1; foreign"},
            {"targetInstanceId": "123456"},
            {"uid": True},
            {"schemaVersion": True},
            {"guestDeadlineMs": 0},
            {"project": "foreign/escape"},
            {"zone": "us-central1-a; foreign"},
            {"remoteCommand": "foreign"},
        ):
            with (
                self.subTest(change=change),
                tempfile.TemporaryDirectory() as directory,
                patch.object(Path, "home", return_value=Path(directory)),
                patch.object(scan, "identity", side_effect=fixture.current),
            ):
                with pytest.raises(ValueError, match="Original"):
                    scan.run_ce_keyscan({**config, **change}, ABI_SOURCE)
                assert not (Path(directory) / ".local").exists()
        with (
            patch.object(scan, "identity", side_effect=fixture.current),
            pytest.raises(ValueError, match="Original"),
        ):
            scan.run_ce_keyscan(config, b"foreign source")
