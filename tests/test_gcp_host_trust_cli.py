"""Owned parser-request unit regressions; GCP provenance belongs to the consumer."""

import base64
import hashlib
import json
import os
import stat
import tempfile
import time
import unittest
from contextlib import ExitStack
from pathlib import Path
from typing import Any

import pytest

from plugins.terraform.scripts import gcp_host_trust as candidate

PARENT_FIELDS = ("dev", "ino", "uid", "mode")


def identity(path: Path) -> dict[str, str]:
    """Match the original capture binding's nanosecond identity fields."""
    value = path.stat()
    return {
        "dev": str(value.st_dev),
        "ino": str(value.st_ino),
        "uid": str(value.st_uid),
        "nlink": str(value.st_nlink),
        "mode": str(value.st_mode),
        "size": str(value.st_size),
        "mtimeNs": str(value.st_mtime_ns),
        "ctimeNs": str(value.st_ctime_ns),
    }


def binding(path: Path) -> dict[str, object]:
    """Bind actual owned fixture bytes and their parent, never a live source."""
    return {
        "path": str(path),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "expectedIdentity": identity(path),
        "expectedParentIdentity": {
            key: identity(path.parent)[key] for key in PARENT_FIELDS
        },
    }


class HostTrustRequestTests(unittest.TestCase):
    """Test owned material validation independently of process execution authority."""

    def setUp(self):
        self.resources = ExitStack()
        self.addCleanup(self.resources.close)
        self.root = Path(
            self.resources.enter_context(tempfile.TemporaryDirectory())
        ).resolve()
        self.root.chmod(0o700)
        key = bytes.fromhex("0000000b7373682d6564323535313900000020") + bytes([7]) * 32
        self.fingerprint = "SHA256:" + base64.b64encode(
            hashlib.sha256(key).digest()
        ).decode().rstrip("=")
        serial = (
            "-----BEGIN SSH HOST KEY FINGERPRINTS-----\n256 "
            + self.fingerprint
            + " root@fixture (ED25519)\n-----END SSH HOST KEY FINGERPRINTS-----\n"
        ).encode()
        wire = (
            "192.0.2.7 ssh-ed25519 " + base64.b64encode(key).decode() + "\n"
        ).encode()
        for role, contents in (("serial", serial), ("wire", wire)):
            path = self.root / (role + ".private.bin")
            path.write_bytes(contents)
            path.chmod(0o400)
        now = time.time()
        expected = {
            "campaign": "owned-cli-fixture",
            "nodeName": "observer-fixture",
            "instanceId": "18446744073709551615",
            "address": "192.0.2.7",
            "ownershipSha256": "a" * 64,
        }
        start = time.monotonic_ns() // 1000000
        self.request: dict[str, Any] = {
            "schemaVersion": 1,
            "kind": "original-gcp-observer-trust-parser-request",
            "expected": expected,
            "receipt": {
                **expected,
                "transport": "gcp-original-bound-serial-port-1",
                "startedAtEpoch": now - 1,
                "finishedAtEpoch": now,
                "exitCode": 0,
                "truncated": False,
                "retainedBytes": len(serial),
                "sha256": hashlib.sha256(serial).hexdigest(),
            },
            "inputs": {
                role: binding(self.root / (role + ".private.bin"))
                for role in ("serial", "wire")
            },
            "budget": {"originalStartMs": start, "originalDeadlineMs": start + 7200000},
        }

    def invoke(self, raw: bytes | None = None, digest: str | None = None):
        """Call the real owned-request handler; process execution is tested in Bun."""
        if raw is None:
            raw = json.dumps(self.request).encode()
        path = self.root / "request.private.json"
        if path.exists():
            path.chmod(0o600)
        path.write_bytes(raw)
        path.chmod(0o400)
        return candidate.run_owned_request(
            [
                "--request",
                str(path),
                "--sha256",
                digest or hashlib.sha256(raw).hexdigest(),
            ]
        )

    def test_matching_owned_material_is_consistent_without_claiming_gcp_authentication(
        self,
    ):
        """A matching caller context still grants no cloud or SSH authority."""
        value = self.invoke()
        assert value["fingerprint"] == self.fingerprint
        assert value["consistencyVerified"] is True
        assert value["gcpSourceAuthenticated"] is False
        assert value["liveAccessVerified"] is False
        assert (
            value["originalDeadlineMs"] == self.request["budget"]["originalDeadlineMs"]
        )

    def test_changed_owned_input_cannot_reuse_its_original_binding(self):
        """Changed input bytes cannot reuse an older identity or digest."""
        path = self.root / "serial.private.bin"
        path.chmod(0o600)
        path.write_bytes(b"changed")
        path.chmod(0o400)
        with pytest.raises(ValueError, match="identity differs"):
            self.invoke()

    def test_duplicate_request_fields_and_wrong_hash_refuse(self):
        """Duplicate or trailing objects and a foreign digest remain refusals."""
        for raw, digest, error in [
            (json.dumps(self.request).encode(), "b" * 64, "request hash differs"),
            (
                b'{"schemaVersion":1,"schemaVersion":1}',
                None,
                "Duplicate parser request field",
            ),
            (json.dumps(self.request).encode() + b"{}", None, "Extra data"),
        ]:
            with (
                self.subTest(raw_bytes=len(raw)),
                pytest.raises(ValueError, match=error),
            ):
                self.invoke(raw, digest)

    def test_freshness_and_budget_cannot_be_renewed(self):
        """Wrong fixed clocks and stale serial evidence cannot qualify a result."""
        for delta in (7200001, 1):
            with self.subTest(delta=delta):
                start = time.monotonic_ns() // 1000000
                self.request["budget"] = {
                    "originalStartMs": start,
                    "originalDeadlineMs": start + delta,
                }
                with pytest.raises(ValueError, match="operation budget differs"):
                    self.invoke()
        start = time.monotonic_ns() // 1000000
        self.request["budget"] = {
            "originalStartMs": start,
            "originalDeadlineMs": start + 7200000,
        }
        self.request["receipt"]["startedAtEpoch"] = time.time() - 301
        with pytest.raises(ValueError, match="Stale"):
            self.invoke()

    def test_final_window_preserves_the_expired_original_budget(self):
        """The original final window does not renew the expired operation."""
        now = time.monotonic_ns() // 1000000
        self.request["budget"] = {
            "originalStartMs": now - 7200100,
            "originalDeadlineMs": now - 100,
            "finalStartedMs": now - 50,
            "finalDeadlineMs": now - 50 + 300000,
        }
        value = self.invoke()
        assert value["originalDeadlineMs"] == now - 100
        assert value["finalDeadlineMs"] == now - 50 + 300000
        self.request["budget"]["finalDeadlineMs"] += 1
        with pytest.raises(ValueError, match="final window differs"):
            self.invoke()

    def test_linked_inputs_and_wrong_private_modes_refuse(self):
        """Additional links and writable files cannot become original inputs."""
        path = self.root / "wire.private.bin"
        other = self.root / "wire.backup"
        os.link(path, other)
        self.request["inputs"]["wire"] = binding(path)
        with pytest.raises(ValueError, match="bounded private"):
            self.invoke()
        other.unlink()
        path.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IWGRP)
        self.request["inputs"]["wire"] = binding(path)
        with pytest.raises(ValueError, match="bounded private"):
            self.invoke()

    def test_schema_version_requires_an_exact_integer(self):
        """A float or bool cannot impersonate the integer schema version."""
        for value in (1.0, True, "1"):
            with self.subTest(value=value):
                self.request["schemaVersion"] = value
                with pytest.raises(ValueError, match="request schema"):
                    self.invoke()


if __name__ == "__main__":
    unittest.main()
