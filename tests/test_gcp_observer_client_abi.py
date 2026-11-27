"""Actual client process tests with offline guest identity; no cloud/SSH proof."""

import errno
import fcntl
import hashlib
import importlib.util
import io
import json
import os
import tempfile
import unittest
from base64 import b64decode
from functools import partial
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "plugins/terraform/scripts/gcp_observer_client_abi.py"
spec = importlib.util.spec_from_file_location("observer_client_abi", SCRIPT)
if spec is None or spec.loader is None:
    MODULE_ERROR = "Guest ABI source unavailable"
    raise RuntimeError(MODULE_ERROR)
abi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(abi)
installer_spec = importlib.util.spec_from_file_location(
    "original_abi_installer", ROOT / "plugins/terraform/scripts/install_ssh_clients.py"
)
if installer_spec is None or installer_spec.loader is None:
    INSTALLER_ERROR = "Original installer unavailable"
    raise RuntimeError(INSTALLER_ERROR)
installer = importlib.util.module_from_spec(installer_spec)
installer_spec.loader.exec_module(installer)
PINS = json.loads((ROOT / "plugins/terraform/src/gcp-ssh-client-pins.json").read_text())
ARCHIVE = (ROOT / "plugins/terraform/artifacts" / PINS["asset"]).read_bytes()
delivery_spec = importlib.util.spec_from_file_location(
    "original_abi_delivery",
    ROOT / "plugins/terraform/scripts/gcp_observer_client_install.py",
)
if delivery_spec is None or delivery_spec.loader is None:
    DELIVERY_ERROR = "Original delivery helper unavailable"
    raise RuntimeError(DELIVERY_ERROR)
delivery = importlib.util.module_from_spec(delivery_spec)
delivery_spec.loader.exec_module(delivery)


def current():
    return {
        "uid": os.getuid(),
        "user": "ubuntu",
        "bootId": Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
        "pythonPath": str(Path("/proc/self/exe").readlink()),
        "pythonSha256": hashlib.sha256(Path("/proc/self/exe").read_bytes()).hexdigest(),
    }


def config():
    value = {
        "schemaVersion": 1,
        "kind": "original-observer-client-abi",
        "instanceId": "123456",
        "nonce": "d" * 64,
        **current(),
        "guestDeadlineMs": abi.monotonic_ms() + 10000,
        "archiveSha256": PINS["archiveSha256"],
        "deliveryNonce": "e" * 64,
        "deliveryReceiptSha256": "f" * 64,
        "deliveryFinishedMs": abi.monotonic_ms() - 1,
    }
    value.pop("user")
    return value


def install_delivered():
    """Compose the actual receiver and installer using an offline guest identity."""
    request = {
        **config(),
        "kind": "original-observer-client-delivery",
        "nonce": "e" * 64,
        "installerSha256": delivery.INSTALLER_SHA256,
    }
    for key in ("deliveryNonce", "deliveryReceiptSha256", "deliveryFinishedMs"):
        request.pop(key)
    source = (ROOT / "plugins/terraform/scripts/install_ssh_clients.py").read_bytes()
    with (
        tempfile.TemporaryFile() as stream,
        patch.object(delivery, "identity", side_effect=current),
    ):
        stream.write(ARCHIVE)
        stream.seek(0)
        installed = delivery.run_delivery(request, source, stream.fileno())
    raw = (json.dumps(installed, sort_keys=True) + "\n").encode()
    return {
        **config(),
        "deliveryReceiptSha256": hashlib.sha256(raw).hexdigest(),
        "deliveryFinishedMs": installed["finishedMs"],
    }


class GuestAbiTests(unittest.TestCase):
    def test_original_delivery_receipt_and_complete_command_bytes_join_abi_output(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
            patch.object(abi, "identity", side_effect=current),
        ):
            request = install_delivered()
            result = abi.verify_original_clients(request)
            assert result["kind"] == "original-observer-client-abi-proof"
            assert result["deliveryNonce"] == request["deliveryNonce"]
            assert result["deliveryReceiptSha256"] == request["deliveryReceiptSha256"]
            assert result["deliveryFinishedMs"] == request["deliveryFinishedMs"]
            assert result["startedMs"] >= request["deliveryFinishedMs"]
            assert result["finishedMs"] < request["guestDeadlineMs"]
            assert [row["args"] for row in result["processes"]] == [
                ["-V"],
                [],
                ["-l", "-f", "/dev/null"],
            ]
            for row in result["processes"]:
                for channel in ("stdout", "stderr"):
                    raw = b64decode(row[channel + "Base64"], validate=True)
                    assert hashlib.sha256(raw).hexdigest() == row[channel + "Sha256"]
                assert row["originalDeadlineMs"] == request["guestDeadlineMs"]

    def test_foreign_delivery_receipt_unknown_request_fields_and_rotated_receipt_are_refused(
        self,
    ):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
            patch.object(abi, "identity", side_effect=current),
        ):
            request = install_delivered()
            for change in (
                {"deliveryNonce": "a" * 64},
                {"deliveryReceiptSha256": "0" * 64},
                {"deliveryFinishedMs": request["deliveryFinishedMs"] + 1},
                {"deliveryFinishedMs": True},
                {"kind": "foreign"},
                {"remoteCommand": "foreign"},
            ):
                with (
                    self.subTest(change=change),
                    pytest.raises(ValueError, match="Original"),
                ):
                    abi.verify_original_clients({**request, **change})
            path = (
                Path(directory)
                / ".local/share/xcsh/gcp-observer-delivery/123456"
                / request["deliveryNonce"]
                / "installed.private.json"
            )
            original_guard = abi.guard
            changed = False

            def rotate(configuration, identity, receipt=None):
                nonlocal changed
                if not changed:
                    path.chmod(0o600)
                    path.write_bytes(b"foreign")
                    path.chmod(0o400)
                    changed = True
                original_guard(configuration, identity, receipt)

            with (
                patch.object(abi, "guard", side_effect=rotate),
                pytest.raises(ValueError, match="Original"),
            ):
                abi.verify_original_clients(request)
            assert path.read_bytes() == b"foreign"
            journal = (
                Path(directory)
                / ".local/share/xcsh/gcp-observer-abi/123456"
                / request["nonce"]
            )
            assert not (journal / "proof.private.json").exists()

    def test_declared_client_seals_require_independent_kernel_enforcement(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "clients"
            installer.install(ARCHIVE, root)
            client = root / "bin/ssh"
            raw = client.read_bytes()
            for sealed in (False, True):
                with self.subTest(sealed=sealed):
                    descriptor = os.memfd_create(
                        "xcsh-observer-abi-client",
                        os.MFD_ALLOW_SEALING | os.MFD_CLOEXEC,
                    )
                    try:
                        offset = 0
                        while offset < len(raw):
                            offset += os.write(descriptor, raw[offset:])
                        os.fchmod(descriptor, 0o500)
                        if sealed:
                            fcntl.fcntl(descriptor, 1033, 15)
                        meta = os.fstat(descriptor)
                        original = {
                            "clientFd": descriptor,
                            "clientSha256": abi.FILES["ssh"],
                            "clientSeals": 15,
                            "clientBytes": len(raw),
                            "clientDev": str(meta.st_dev),
                            "clientIno": str(meta.st_ino),
                        }
                        child = SimpleNamespace(pid=os.getpid())
                        if not sealed:
                            with pytest.raises(ValueError, match="kernel"):
                                abi.original_client_snapshot(child, original, client)
                        else:
                            for mutate in (
                                partial(os.write, descriptor, b"foreign"),
                                partial(os.ftruncate, descriptor, 0),
                                partial(fcntl.fcntl, descriptor, 1033, 1),
                            ):
                                with pytest.raises(
                                    OSError, match=r"\[Errno 1\]"
                                ) as caught:
                                    mutate()
                                assert caught.value.errno == errno.EPERM
                            abi.original_client_snapshot(child, original, client)
                            with pytest.raises(ValueError, match="kernel"):
                                abi.original_client_snapshot(
                                    child, {**original, "clientIno": "foreign"}, client
                                )
                    finally:
                        os.close(descriptor)

    def test_failure_persistence_cannot_skip_original_child_closure(self):
        child = SimpleNamespace(stdin=io.BytesIO(), poll=Mock(return_value=73))
        original = {"pid": 123, "group": 123, "start": "456", "bootId": "original"}
        request = config()
        failure = ValueError("Original release refused")
        retained = []

        def retain(_root, name, value):
            if name == "failure.private.json":
                message = "Original receipt unavailable"
                raise OSError(message)
            retained.append((name, value))

        with (
            patch.object(abi, "persist", side_effect=retain),
            patch.object(abi, "group_absent", return_value=True) as absent,
            pytest.raises(ExceptionGroup) as caught,
        ):
            abi.retain_failed_probe(
                child, original, request, Path("/offline"), False, failure
            )
        assert failure in caught.value.exceptions
        assert child.stdin.closed
        assert child.poll.call_count > 0
        assert absent.call_count == 2
        assert retained[0][0] == "failed-completion.private.json"
        assert retained[0][1]["originalGroupClosed"] is True
        assert retained[0][1]["signalsSent"] is False

    def test_failed_probe_requires_group_absence_twice_without_resetting_clock(self):
        child = SimpleNamespace(stdin=io.BytesIO(), poll=Mock(return_value=73))
        original = {"pid": 123, "group": 123, "start": "456", "bootId": "original"}
        request = {"guestDeadlineMs": 1000}
        retained = []
        with (
            patch.object(abi, "monotonic_ms", return_value=1200),
            patch.object(abi, "group_absent", side_effect=[True, False]) as absent,
            patch.object(
                abi,
                "persist",
                side_effect=lambda _root, name, value: retained.append((name, value)),
            ),
        ):
            abi.retain_failed_probe(
                child,
                original,
                request,
                Path("/offline"),
                False,
                ValueError("Original failed"),
            )
        assert absent.call_count == 2
        completion = retained[-1][1]
        assert completion["originalGroupClosed"] is False
        assert completion["finalStartedMs"] == 1000
        assert completion["finalDeadlineMs"] == 301000
        assert completion["complete"] is False
        assert completion["signalsSent"] is False

    def test_three_actual_pinned_clients_are_attributed_to_the_original_gated_processes(
        self,
    ):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
            patch.object(abi, "identity", side_effect=current),
        ):
            request = install_delivered()
            result = abi.verify_original_clients(request)
            assert result["abiVerified"] is True
            assert result["guestClientQualified"] is False
            assert len(result["processes"]) == 3
            assert [row["exitCode"] for row in result["processes"]] == [0, 1, 255]
            assert all(row["originalGroupClosed"] for row in result["processes"])
            assert all(row["signalsSent"] is False for row in result["processes"])
            for row in result["processes"]:
                original = row["identity"]
                assert original["clientSha256"] == abi.FILES[row["client"]]
                assert original["clientSeals"] == 15
                assert original["clientFd"] > 2
                assert original["clientBytes"] > 0
            with pytest.raises(ValueError, match="single-use"):
                abi.verify_original_clients(request)

    def test_changed_original_client_is_refused_and_retained(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
            patch.object(abi, "identity", side_effect=current),
        ):
            root = Path(directory) / ".local/share/xcsh/gcp-observer-clients/123456"
            request = install_delivered()
            path = root / "bin/ssh"
            path.chmod(0o700)
            path.write_bytes(b"foreign")
            path.chmod(0o500)
            with pytest.raises(ValueError, match="Original"):
                abi.verify_original_clients(request)
            assert path.read_bytes() == b"foreign"

    def test_original_guest_identity_and_deadline_cannot_be_replaced(self):
        cases: list[dict[str, str | int]] = [
            {"uid": 0},
            {"bootId": "foreign"},
            {"pythonSha256": "e" * 64},
            {"guestDeadlineMs": 0},
        ]
        for change in cases:
            with (
                self.subTest(change=change),
                tempfile.TemporaryDirectory() as directory,
                patch.object(Path, "home", return_value=Path(directory)),
                patch.object(abi, "identity", side_effect=current),
            ):
                with pytest.raises(ValueError, match="Original"):
                    abi.verify_original_clients({**config(), **change})
                assert not (Path(directory) / ".local").exists()

    def test_guest_identity_rotation_after_ready_cannot_release_the_original_client(
        self,
    ):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(Path, "home", return_value=Path(directory)),
        ):
            request = install_delivered()
            count = 0

            def changed():
                nonlocal count
                count += 1
                value = current()
                if count > 2:
                    value["bootId"] = "foreign-boot"
                return value

            with (
                patch.object(abi, "identity", side_effect=changed),
                pytest.raises(ValueError, match="Original"),
            ):
                abi.verify_original_clients(request)
            journal = (
                Path(directory)
                / ".local/share/xcsh/gcp-observer-abi/123456"
                / request["nonce"]
            )
            failure = json.loads((journal / "ssh/failure.private.json").read_text())
            assert failure["released"] is False
            assert not (journal / "ssh/completion.private.json").exists()

    def test_boolean_schema_and_malformed_original_scope_cannot_pass_abi_preflight(
        self,
    ):
        cases: list[dict[str, str | int | bool]] = [
            {"schemaVersion": True},
            {"guestDeadlineMs": True},
            {"instanceId": "0"},
            {"nonce": "../escape"},
        ]
        for change in cases:
            with (
                self.subTest(change=change),
                tempfile.TemporaryDirectory() as directory,
                patch.object(Path, "home", return_value=Path(directory)),
                patch.object(abi, "identity", side_effect=current),
            ):
                with pytest.raises(ValueError, match="Original"):
                    abi.verify_original_clients({**config(), **change})
                assert not (Path(directory) / ".local").exists()
