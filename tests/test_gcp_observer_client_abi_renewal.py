"""Real sealed client probes with offline identities; no live GCP acceptance."""

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
    "observer_abi_renewal",
    ROOT / "plugins/terraform/scripts/gcp_observer_client_abi_renewal.py",
)
if spec is None or spec.loader is None:
    message = "Renewal helper unavailable"
    raise RuntimeError(message)
renewal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renewal)
fixture_spec = importlib.util.spec_from_file_location(
    "original_renewal_fixture", ROOT / "tests/test_gcp_observer_client_abi.py"
)
if fixture_spec is None or fixture_spec.loader is None:
    message = "Original ABI fixture unavailable"
    raise RuntimeError(message)
fixture = importlib.util.module_from_spec(fixture_spec)
fixture_spec.loader.exec_module(fixture)
SOURCE = (ROOT / "plugins/terraform/scripts/gcp_observer_client_abi.py").read_bytes()


def expired_installation():
    legacy = fixture.install_delivered()
    path = (
        Path.home()
        / ".local/share/xcsh/gcp-observer-delivery"
        / legacy["instanceId"]
        / legacy["deliveryNonce"]
        / "installed.private.json"
    )
    packet = json.loads(path.read_text())
    now = fixture.abi.monotonic_ms()
    packet.update(
        startedMs=now - 400000, finishedMs=now - 350000, originalDeadlineMs=now - 349000
    )
    path.chmod(0o600)
    path.write_text(json.dumps(packet, sort_keys=True) + "\n")
    path.chmod(0o400)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    legacy.update(deliveryFinishedMs=packet["finishedMs"], deliveryReceiptSha256=digest)
    config = {
        **legacy,
        "schemaVersion": 2,
        "kind": "original-observer-client-abi-renewal",
        "nonce": "a" * 64,
        "installationNonce": legacy["deliveryNonce"],
        "installationReceiptSha256": digest,
        "installationFinishedMs": packet["finishedMs"],
        "peerChallenge": "b" * 64,
        "peerMonotonicMs": now,
    }
    for key in ("deliveryNonce", "deliveryReceiptSha256", "deliveryFinishedMs"):
        config.pop(key)
    return config, path, legacy


class GuestAbiRenewalTests(unittest.TestCase):
    def test_peer_expiry_during_probes_keeps_partial_capture_incomplete(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
        ):
            config, receipt, _legacy = expired_installation()
            before = receipt.read_bytes()
            clock = [fixture.abi.monotonic_ms()]
            count = [0]
            load = renewal.load_abi

            def original(source, path):
                module = load(source, path)
                module.identity = fixture.current
                probe = module.probe

                def execute(*args):
                    result = probe(*args)
                    count[0] += 1
                    clock[0] = config["peerMonotonicMs"] + 300001
                    return result

                module.probe = execute
                return module

            with (
                patch.object(renewal, "load_abi", side_effect=original),
                patch.object(renewal, "monotonic_ms", side_effect=lambda: clock[0]),
                pytest.raises(ValueError, match="peer proof"),
            ):
                renewal.renew_original_clients(config, SOURCE)
            assert count[0] == 1
            assert receipt.read_bytes() == before
            journal = (
                Path(directory)
                / ".local/share/xcsh/gcp-observer-abi-renewal"
                / config["instanceId"]
                / config["nonce"]
            )
            assert not (journal / "proof.private.json").exists()
            failure = json.loads((journal / "failure.private.json").read_text())
            assert failure["complete"] is False
            assert failure["installationReplayed"] is False
            assert failure["originalDeadlineMs"] == config["guestDeadlineMs"]
            assert failure["finalStartedMs"] <= config["guestDeadlineMs"]
            assert failure["finalDeadlineMs"] - failure["finalStartedMs"] == 300000

    def test_old_installation_is_immutable_and_three_new_probes_use_fresh_peer_clock(
        self,
    ):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
            patch.object(fixture.abi, "identity", side_effect=fixture.current),
        ):
            config, receipt, legacy = expired_installation()
            before = receipt.read_bytes()
            with pytest.raises(ValueError, match="clock"):
                fixture.abi.verify_original_clients(legacy)
            load = renewal.load_abi

            def original(source, path):
                module = load(source, path)
                module.identity = fixture.current
                return module

            with patch.object(renewal, "load_abi", side_effect=original):
                result = renewal.renew_original_clients(config, SOURCE)
            assert receipt.read_bytes() == before
            assert result["schemaVersion"] == 2
            assert (
                result["installationReceiptSha256"]
                == config["installationReceiptSha256"]
            )
            assert result["installationFinishedMs"] == config["installationFinishedMs"]
            assert result["peerChallenge"] == config["peerChallenge"]
            assert result["startedMs"] >= result["peerMonotonicMs"]
            assert result["finishedMs"] < config["guestDeadlineMs"]
            assert result["guestClientQualified"] is False
            assert result["installationReplayed"] is False
            assert [p["exitCode"] for p in result["processes"]] == [0, 1, 255]
            assert all(
                p["originalGroupClosed"] and p["signalsSent"] is False
                for p in result["processes"]
            )
            assert all(p["identity"]["clientSeals"] == 15 for p in result["processes"])
            with (
                patch.object(renewal, "load_abi", side_effect=original),
                pytest.raises(ValueError, match="single-use"),
            ):
                renewal.renew_original_clients(config, SOURCE)

    def test_foreign_installation_stale_peer_and_expired_deadline_never_replay_installation(
        self,
    ):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
        ):
            config, receipt, _legacy = expired_installation()
            before = receipt.read_bytes()
            cases: list[dict[str, str | int | bool]] = [
                {"schemaVersion": True},
                {"peerChallenge": "foreign"},
                {"peerMonotonicMs": fixture.abi.monotonic_ms() - 300001},
                {"peerMonotonicMs": True},
                {"guestDeadlineMs": 0},
                {"installationReceiptSha256": "0" * 64},
                {"installationFinishedMs": True},
                {"remoteCommand": "foreign"},
            ]
            load = renewal.load_abi

            def original(source, path):
                module = load(source, path)
                module.identity = fixture.current
                return module

            for index, change in enumerate(cases):
                with self.subTest(change=change):
                    candidate = {**config, "nonce": f"{index + 16:064x}", **change}
                    with (
                        patch.object(renewal, "load_abi", side_effect=original),
                        pytest.raises(ValueError, match="Original"),
                    ):
                        renewal.renew_original_clients(candidate, SOURCE)
                    assert receipt.read_bytes() == before
