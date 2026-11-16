"""Synthetic host-key consistency regressions; no cloud or guest acceptance."""

import base64
import hashlib
import json
import re
import subprocess
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from typing import ClassVar

import pytest

from plugins.terraform.scripts import gcp_host_trust as candidate

_REFUSALS = {
    "test_address_and_command_injection_rejected": [
        "Foreign address or unsupported host key"
    ],
    "test_ambiguous_sections_rejected": ["Unique host fingerprint section required"],
    "test_capture_time_is_ordered_finite_and_not_future": [
        "Finite capture timestamps required",
        "Stale, future or unordered serial capture",
    ],
    "test_changed_missing_or_wrong_algorithm_pin": [
        "Missing, changed or ambiguous host fingerprint"
    ],
    "test_duplicate_algorithm_rows_rejected": [
        "Missing, changed or ambiguous host fingerprint"
    ],
    "test_foreign_campaign_node_ownership_and_replacement": [
        "Foreign or replaced original capture"
    ],
    "test_incomplete_failed_or_tampered_capture": [
        "Incomplete serial capture",
        "Serial size or hash mismatch",
        "Unsupported trust source",
    ],
    "test_invalid_utf8_or_nul_serial_rejected": [
        "Malformed serial encoding",
        "Malformed serial framing",
    ],
    "test_malformed_encoded_key_rejected": ["Invalid SSH wire key field"],
    "test_stale_serial_rejected": ["Stale, future or unordered serial capture"],
    "test_unframed_fingerprint_is_not_host_evidence": [
        "Unique complete Ed25519 generation block required"
    ],
}


def _refusal_regex(test_name: str) -> str:
    """Match exact refusal messages retained from the frozen validator."""
    return (
        "^(?:" + "|".join(re.escape(message) for message in _REFUSALS[test_name]) + ")$"
    )


class HostTrustTests(unittest.TestCase):
    root: ClassVar[Path]
    lines: ClassVar[list[str]]
    fingerprints: ClassVar[list[str]]
    tmp: ClassVar[str]
    resources: ClassVar[ExitStack]

    @classmethod
    def setUpClass(cls):
        cls.resources = ExitStack()
        cls.addClassCleanup(cls.resources.close)
        cls.tmp = cls.resources.enter_context(tempfile.TemporaryDirectory())
        cls.root = Path(cls.tmp)
        cls.lines = []
        cls.fingerprints = []
        for number in range(2):
            directory = cls.root / str(number)
            directory.mkdir(mode=448)
            path = directory / "key"
            subprocess.run(
                ["/usr/bin/ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", "key"],
                cwd=directory,
                check=True,
                capture_output=True,
            )
            public = path.with_suffix(".pub").read_text().split()
            cls.lines.append("192.0.2.7 " + " ".join(public[:2]))
            cls.fingerprints.append(
                "SHA256:"
                + base64.b64encode(hashlib.sha256(base64.b64decode(public[1])).digest())
                .decode()
                .rstrip("=")
            )

    def setUp(self):
        self.expected = {
            "campaign": "guest-offline-v7",
            "nodeName": "gcp-ce-offline-v7-a",
            "instanceId": "12345",
            "address": "192.0.2.7",
            "ownershipSha256": "a" * 64,
        }
        self.serial = (
            "-----BEGIN SSH HOST KEY FINGERPRINTS-----\n256 "
            + self.fingerprints[0]
            + " root@fixture (ED25519)\n"
            + "-----END SSH HOST KEY FINGERPRINTS-----\n"
        ).encode()
        self.receipt = {
            **{
                key: self.expected[key]
                for key in ("campaign", "nodeName", "instanceId", "ownershipSha256")
            },
            "transport": "gcp-original-bound-serial-port-1",
            "startedAtEpoch": 1000.0,
            "finishedAtEpoch": 1001.0,
            "exitCode": 0,
            "truncated": False,
            "retainedBytes": len(self.serial),
            "sha256": hashlib.sha256(self.serial).hexdigest(),
        }

    def verify(
        self, *, serial=None, receipt=None, line=None, expected=None, now=1002.0
    ):
        serial = self.serial if serial is None else serial
        receipt = self.receipt if receipt is None else receipt
        expected = self.expected if expected is None else expected
        line = self.lines[0] if line is None else line
        return candidate.verify_pin(expected, receipt, serial, line, now=now)

    def altered_serial(self, serial):
        return {
            **self.receipt,
            "sha256": hashlib.sha256(serial).hexdigest(),
            "retainedBytes": len(serial),
        }

    def test_matching_original_section(self):
        assert self.verify() == self.fingerprints[0]

    def test_unframed_fingerprint_is_not_host_evidence(self):
        data = ("arbitrary application output: " + self.fingerprints[0]).encode()
        with pytest.raises(
            ValueError,
            match=_refusal_regex("test_unframed_fingerprint_is_not_host_evidence"),
        ):
            self.verify(serial=data, receipt=self.altered_serial(data))

    def test_ambiguous_sections_rejected(self):
        data = self.serial + self.serial
        with pytest.raises(
            ValueError, match=_refusal_regex("test_ambiguous_sections_rejected")
        ):
            self.verify(serial=data, receipt=self.altered_serial(data))

    def test_stale_serial_rejected(self):
        with pytest.raises(
            ValueError, match=_refusal_regex("test_stale_serial_rejected")
        ):
            self.verify(now=1302.0)

    def test_foreign_campaign_node_ownership_and_replacement(self):
        for key, value in [
            ("campaign", "foreign-campaign"),
            ("nodeName", "foreign-node"),
            ("instanceId", "99999"),
            ("ownershipSha256", "b" * 64),
        ]:
            with (
                self.subTest(key=key),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_foreign_campaign_node_ownership_and_replacement"
                    ),
                ),
            ):
                self.verify(receipt={**self.receipt, key: value})

    def test_incomplete_failed_or_tampered_capture(self):
        for key, value in [
            ("truncated", True),
            ("exitCode", 1),
            ("sha256", "0" * 64),
            ("retainedBytes", len(self.serial) - 1),
            ("transport", "ssh-keyscan-only"),
        ]:
            with (
                self.subTest(key=key),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex("test_incomplete_failed_or_tampered_capture"),
                ),
            ):
                self.verify(receipt={**self.receipt, key: value})

    def test_capture_time_is_ordered_finite_and_not_future(self):
        for key, value in [
            ("finishedAtEpoch", 1003.0),
            ("startedAtEpoch", 1002.0),
            ("finishedAtEpoch", float("nan")),
            ("startedAtEpoch", float("inf")),
        ]:
            with (
                self.subTest(key=key),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_capture_time_is_ordered_finite_and_not_future"
                    ),
                ),
            ):
                self.verify(receipt={**self.receipt, key: value})

    def test_changed_missing_or_wrong_algorithm_pin(self):
        with pytest.raises(
            ValueError,
            match=_refusal_regex("test_changed_missing_or_wrong_algorithm_pin"),
        ):
            self.verify(line=self.lines[1])
        data = self.serial.replace(b"ED25519", b"RSA")
        with pytest.raises(
            ValueError,
            match=_refusal_regex("test_changed_missing_or_wrong_algorithm_pin"),
        ):
            self.verify(serial=data, receipt=self.altered_serial(data))
        data = b"-----BEGIN SSH HOST KEY FINGERPRINTS-----\n-----END SSH HOST KEY FINGERPRINTS-----\n"
        with pytest.raises(
            ValueError,
            match=_refusal_regex("test_changed_missing_or_wrong_algorithm_pin"),
        ):
            self.verify(serial=data, receipt=self.altered_serial(data))

    def test_address_and_command_injection_rejected(self):
        for line in [
            self.lines[0].replace("192.0.2.7", "192.0.2.8"),
            self.lines[0] + "; id",
            "",
        ]:
            with (
                self.subTest(line=line[:12]),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex("test_address_and_command_injection_rejected"),
                ),
            ):
                self.verify(line=line)

    def test_malformed_encoded_key_rejected(self):
        algorithm = b"ssh-ed25519"
        raw = len(algorithm).to_bytes(4, "big") + algorithm + b"not-a-wire-key"
        line = "192.0.2.7 ssh-ed25519 " + base64.b64encode(raw).decode()
        fingerprint = "SHA256:" + base64.b64encode(
            hashlib.sha256(raw).digest()
        ).decode().rstrip("=")
        data = self.serial.replace(self.fingerprints[0].encode(), fingerprint.encode())
        with pytest.raises(
            ValueError, match=_refusal_regex("test_malformed_encoded_key_rejected")
        ):
            self.verify(line=line, serial=data, receipt=self.altered_serial(data))

    def test_duplicate_algorithm_rows_rejected(self):
        row = "256 " + self.fingerprints[0] + " root@fixture (ED25519)\n"
        data = self.serial.replace(row.encode(), (row + row).encode())
        with pytest.raises(
            ValueError, match=_refusal_regex("test_duplicate_algorithm_rows_rejected")
        ):
            self.verify(serial=data, receipt=self.altered_serial(data))

    def test_invalid_utf8_or_nul_serial_rejected(self):
        for prefix in (b"\xff", b"\x00"):
            data = prefix + self.serial
            with (
                self.subTest(prefix=prefix),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex("test_invalid_utf8_or_nul_serial_rejected"),
                ),
            ):
                self.verify(serial=data, receipt=self.altered_serial(data))

    def test_new_pin_is_exclusive_and_preserves_saved_pin(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            saved = root / "saved-known-hosts"
            saved.write_text(self.lines[1] + "\n")
            old = saved.read_bytes()
            artifact = candidate.write_pin(
                root,
                self.expected,
                self.receipt,
                self.serial,
                self.lines[0],
                now=1002.0,
            )
            assert saved.read_bytes() == old
            assert (artifact / "known-hosts.private").read_text().strip() == self.lines[
                0
            ]
            receipt = json.loads((artifact / "receipt.private.json").read_text())
            assert receipt["fingerprint"] == self.fingerprints[0]
            assert not receipt["liveAccessVerified"]
            assert artifact.stat().st_mode & 511 == 448
            for file in artifact.iterdir():
                assert file.stat().st_mode & 511 == 384

    def test_original_identity_requires_a_canonical_uint64_string(self):
        for value in (12345, True, "18446744073709551616", "0", "0012345"):
            with (
                self.subTest(value=value),
                pytest.raises(
                    ValueError, match="Original numeric VM identity required"
                ),
            ):
                self.verify(
                    expected={**self.expected, "instanceId": value},
                    receipt={**self.receipt, "instanceId": value},
                )

    def test_canonical_uint64_boundary_id_is_consistent(self):
        instance_id = "18446744073709551615"
        assert (
            self.verify(
                expected={**self.expected, "instanceId": instance_id},
                receipt={**self.receipt, "instanceId": instance_id},
            )
            == self.fingerprints[0]
        )

    def test_unrepresentable_capture_timestamps_refuse(self):
        for timestamp in (10**1000, True, "1000", None):
            with (
                self.subTest(timestamp_type=type(timestamp).__name__),
                pytest.raises(ValueError, match="Finite capture timestamps required"),
            ):
                self.verify(receipt={**self.receipt, "startedAtEpoch": timestamp})
