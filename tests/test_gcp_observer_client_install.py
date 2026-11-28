"""Guest delivery source tests; identity seams are offline and never live proof."""

import hashlib
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "plugins/terraform/scripts/gcp_observer_client_install.py"
spec = importlib.util.spec_from_file_location("observer_client_install", SCRIPT)
if spec is None or spec.loader is None:
    MODULE_ERROR = "Guest installer test module unavailable"
    raise RuntimeError(MODULE_ERROR)
guest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guest)
INSTALLER = (ROOT / "plugins/terraform/scripts/install_ssh_clients.py").read_bytes()
PINS = json.loads((ROOT / "plugins/terraform/src/gcp-ssh-client-pins.json").read_text())
ARCHIVE = (ROOT / "plugins/terraform/artifacts" / PINS["asset"]).read_bytes()
IDENTITY = {
    "user": "ubuntu",
    "uid": os.getuid(),
    "bootId": "11111111-2222-3333-4444-555555555555",
    "pythonPath": "/usr/bin/python3.12",
    "pythonSha256": "a" * 64,
}


def request():
    return {
        "schemaVersion": 1,
        "kind": "original-observer-client-delivery",
        "instanceId": "123456",
        "nonce": "b" * 64,
        "uid": IDENTITY["uid"],
        "bootId": IDENTITY["bootId"],
        "pythonPath": IDENTITY["pythonPath"],
        "pythonSha256": IDENTITY["pythonSha256"],
        "guestDeadlineMs": guest.monotonic_ms() + 2000,
        "archiveSha256": PINS["archiveSha256"],
        "installerSha256": PINS["installerSha256"],
    }


class GuestInstallTests(unittest.TestCase):
    def test_fixed_original_scope_installs_bytes_and_refuses_unchanged_replay(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
            patch.object(guest, "identity", return_value=IDENTITY),
        ):
            path = Path(directory) / "input.zip"
            path.write_bytes(ARCHIVE)
            config = request()
            with path.open("rb") as source:
                result = guest.run_delivery(config, INSTALLER, source.fileno())
            assert result["installedBytesVerified"] is True
            assert result["abiVerified"] is False
            assert result["guestClientQualified"] is False
            assert result["archiveSha256"] == PINS["archiveSha256"]
            clients = Path(result["clientRoot"])
            assert (
                hashlib.sha256((clients / "bin/ssh").read_bytes()).hexdigest()
                == PINS["files"]["ssh"]["sha256"]
            )
            with (
                path.open("rb") as source,
                pytest.raises(ValueError, match="single-use"),
            ):
                guest.run_delivery(config, INSTALLER, source.fileno())

    def test_truncated_archive_retains_partial_without_installation(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
            patch.object(guest, "identity", return_value=IDENTITY),
        ):
            path = Path(directory) / "input"
            path.write_bytes(ARCHIVE[:64])
            config = request()
            with path.open("rb") as source, pytest.raises(ValueError, match="archive"):
                guest.run_delivery(config, INSTALLER, source.fileno())
            journals = list(
                Path(directory).glob(".local/share/xcsh/gcp-observer-delivery/123456/*")
            )
            assert len(journals) == 1
            assert (journals[0] / "archive.partial").read_bytes() == ARCHIVE[:64]
            assert (
                json.loads((journals[0] / "failure.private.json").read_text())[
                    "complete"
                ]
                is False
            )
            assert not list(
                Path(directory).glob(".local/share/xcsh/gcp-observer-clients/*")
            )

    def test_original_identity_and_deadline_refuse_before_file_mutation(self):
        cases: list[dict[str, str | int]] = [
            {"uid": 0},
            {"bootId": "changed"},
            {"pythonSha256": "f" * 64},
            {"guestDeadlineMs": 0},
            {"guestDeadlineMs": guest.monotonic_ms() + guest.COMMAND_LIMIT_MS + 10000},
            {"nonce": "../../escape"},
        ]
        for change in cases:
            with (
                self.subTest(change=change),
                tempfile.TemporaryDirectory() as directory,
                patch.object(Path, "home", return_value=Path(directory)),
                patch.object(guest, "identity", return_value=IDENTITY),
            ):
                path = Path(directory) / "input"
                path.write_bytes(ARCHIVE)
                with (
                    path.open("rb") as source,
                    pytest.raises(ValueError, match="Original"),
                ):
                    guest.run_delivery(
                        {**request(), **change}, INSTALLER, source.fileno()
                    )
                assert not (Path(directory) / ".local").exists()

    def test_stalled_input_observes_original_deadline_and_keeps_partial_bytes(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
            patch.object(guest, "identity", return_value=IDENTITY),
        ):
            read_fd, write_fd = os.pipe()
            try:
                os.write(write_fd, ARCHIVE[:64])
                config = {**request(), "guestDeadlineMs": guest.monotonic_ms() + 100}
                with pytest.raises(ValueError, match="deadline"):
                    guest.run_delivery(config, INSTALLER, read_fd)
                journals = list(
                    Path(directory).glob(
                        ".local/share/xcsh/gcp-observer-delivery/123456/*"
                    )
                )
                assert (journals[0] / "archive.partial").read_bytes() == ARCHIVE[:64]
                assert (
                    json.loads((journals[0] / "failure.private.json").read_text())[
                        "complete"
                    ]
                    is False
                )
            finally:
                os.close(read_fd)
                os.close(write_fd)

    def test_changed_installer_source_is_not_executed(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
            patch.object(guest, "identity", return_value=IDENTITY),
        ):
            path = Path(directory) / "input"
            path.write_bytes(ARCHIVE)
            with (
                path.open("rb") as source,
                pytest.raises(ValueError, match="installer"),
            ):
                guest.run_delivery(
                    request(), b"raise RuntimeError('foreign source')", source.fileno()
                )
            assert not (Path(directory) / ".local").exists()

    def test_installer_load_failure_retains_request_and_independent_failure_receipt(
        self,
    ):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
            patch.object(guest, "identity", return_value=IDENTITY),
        ):
            path = Path(directory) / "input"
            path.write_bytes(ARCHIVE)
            config = request()
            with (
                patch.object(
                    guest,
                    "load_installer",
                    side_effect=ValueError("original source loading failed"),
                ),
                path.open("rb") as source,
                pytest.raises(ValueError, match="original source loading failed"),
            ):
                guest.run_delivery(config, INSTALLER, source.fileno())
            journal = (
                Path(directory)
                / ".local/share/xcsh/gcp-observer-delivery/123456"
                / config["nonce"]
            )
            assert json.loads((journal / "request.private.json").read_text()) == config
            failure = json.loads((journal / "failure.private.json").read_text())
            assert failure["phase"] == "installer-loading"
            assert failure["complete"] is False
            assert not list(
                Path(directory).glob(".local/share/xcsh/gcp-observer-clients/*")
            )

    def test_request_persistence_failure_still_retains_failure_without_replaying(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
            patch.object(guest, "identity", return_value=IDENTITY),
        ):
            path = Path(directory) / "input"
            path.write_bytes(ARCHIVE)
            config = request()
            original_persist = guest.persist

            def persist(root, name, value, *args):
                if name == "request.private.json":
                    message = "original request persistence failed"
                    raise OSError(message)
                return original_persist(root, name, value, *args)

            with (
                patch.object(guest, "persist", side_effect=persist),
                path.open("rb") as source,
                pytest.raises(OSError, match="original request persistence failed"),
            ):
                guest.run_delivery(config, INSTALLER, source.fileno())
            journal = (
                Path(directory)
                / ".local/share/xcsh/gcp-observer-delivery/123456"
                / config["nonce"]
            )
            failure = json.loads((journal / "failure.private.json").read_text())
            assert failure["phase"] == "request-persistence"
            assert failure["complete"] is False
            with (
                path.open("rb") as source,
                pytest.raises(ValueError, match="single-use"),
            ):
                guest.run_delivery(config, INSTALLER, source.fileno())

    def test_loading_failure_and_retention_failure_are_both_preserved(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
            patch.object(guest, "identity", return_value=IDENTITY),
        ):
            path = Path(directory) / "input"
            path.write_bytes(ARCHIVE)
            config = request()
            original_persist = guest.persist

            def persist(root, name, value, *args):
                if name == "failure.private.json":
                    message = "original failure retention failed"
                    raise OSError(message)
                return original_persist(root, name, value, *args)

            with (
                patch.object(guest, "persist", side_effect=persist),
                patch.object(
                    guest,
                    "load_installer",
                    side_effect=ValueError("original source loading failed"),
                ),
                path.open("rb") as source,
                pytest.raises(ExceptionGroup, match="both failed") as caught,
            ):
                guest.run_delivery(config, INSTALLER, source.fileno())
            assert [str(error) for error in caught.value.exceptions] == [
                "original source loading failed",
                "original failure retention failed",
            ]
            journal = (
                Path(directory)
                / ".local/share/xcsh/gcp-observer-delivery/123456"
                / config["nonce"]
            )
            assert (journal / "request.private.json").is_file()
