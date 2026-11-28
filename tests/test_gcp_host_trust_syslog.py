"""Synthetic host-key consistency regressions; no cloud or guest acceptance."""

import base64
import hashlib
import re
import unittest

import pytest

from plugins.terraform.scripts import gcp_host_trust as candidate

_REFUSALS = {
    "test_changed_duplicate_missing_or_malformed_fingerprint_rows_refuse": [
        "Malformed host fingerprint row",
        "Missing, changed or ambiguous host fingerprint",
    ],
    "test_control_bytes_and_injected_multiline_envelopes_refuse": [
        "Malformed serial framing",
        "Unframed host fingerprint section",
    ],
    "test_duplicate_or_out_of_order_sections_refuse": [
        "Unique complete Ed25519 generation block required",
        "Unique host fingerprint section required",
    ],
    "test_every_syslog_section_line_requires_the_same_supported_producer": [
        "Unframed host fingerprint section",
        "Unsupported cloud-init fingerprint envelope",
    ],
    "test_foreign_priorities_tags_and_host_headers_are_not_normalized": [
        "Unframed host fingerprint section"
    ],
    "test_hash_of_raw_serial_remains_required_after_normalization": [
        "Serial size or hash mismatch"
    ],
    "test_malformed_timestamp_and_calendar_values_refuse": [
        "Unframed host fingerprint section",
        "Unsupported cloud-init fingerprint envelope",
    ],
    "test_plain_marker_with_syslog_rows_does_not_acquire_syslog_trust": [
        "Malformed host fingerprint row"
    ],
    "test_supported_framing_keeps_original_ownership_and_capture_refusals": [
        "Finite capture timestamps required",
        "Foreign or replaced original capture",
        "Incomplete serial capture",
        "Serial size or hash mismatch",
        "Stale, future or unordered serial capture",
        "Unsupported trust source",
    ],
}


def _refusal_regex(test_name: str) -> str:
    """Match exact refusal messages retained from the frozen validator."""
    return (
        "^(?:" + "|".join(re.escape(message) for message in _REFUSALS[test_name]) + ")$"
    )


def wire_string(value: bytes) -> bytes:
    """Encode one bounded synthetic SSH wire field."""
    return len(value).to_bytes(4, "big") + value


class SyslogTrustTests(unittest.TestCase):
    def setUp(self):
        wire = wire_string(b"ssh-ed25519") + wire_string(bytes(range(32)))
        self.line = "192.0.2.7 ssh-ed25519 " + base64.b64encode(wire).decode()
        self.fingerprint = "SHA256:" + base64.b64encode(
            hashlib.sha256(wire).digest()
        ).decode().rstrip("=")
        self.expected = {
            "campaign": "guest-offline-v10",
            "nodeName": "gcp-ce-offline-v10-a",
            "instanceId": "12345",
            "address": "192.0.2.7",
            "ownershipSha256": "a" * 64,
        }
        self.payloads = [
            candidate.BEGIN,
            "256 " + self.fingerprint + " root@fixture (ED25519)",
            candidate.END,
        ]

    def serial(self, prefix="<14>Oct 25 20:55:49 cloud-init: "):
        return ("\r\n".join(prefix + row for row in self.payloads) + "\r\n").encode()

    def receipt(self, serial):
        return {
            **{
                k: self.expected[k]
                for k in ("campaign", "nodeName", "instanceId", "ownershipSha256")
            },
            "transport": "gcp-original-bound-serial-port-1",
            "startedAtEpoch": 1000.0,
            "finishedAtEpoch": 1001.0,
            "exitCode": 0,
            "truncated": False,
            "retainedBytes": len(serial),
            "sha256": hashlib.sha256(serial).hexdigest(),
        }

    def verify(self, serial=None, *, line=None, receipt=None, now=1002.0):
        serial = self.serial() if serial is None else serial
        return candidate.verify_pin(
            self.expected,
            self.receipt(serial) if receipt is None else receipt,
            serial,
            self.line if line is None else line,
            now=now,
        )

    def test_documented_cloud_init_syslog_section_matches_original_wire_key(self):
        assert self.verify() == self.fingerprint

    def test_space_padded_day_and_valid_calendar_boundaries(self):
        for timestamp in (
            "Jan  7 00:00:00",
            "Feb 29 23:59:59",
            "Apr 30 12:00:00",
            "Dec 31 23:59:59",
        ):
            with self.subTest(timestamp=timestamp):
                assert (
                    self.verify(self.serial("<14>" + timestamp + " cloud-init: "))
                    == self.fingerprint
                )

    def test_per_line_seconds_may_advance_without_fabricating_capture_time(self):
        serial = "\n".join(
            (
                "<14>Oct 25 20:55:" + str(49 + n) + " cloud-init: " + row
                for n, row in enumerate(self.payloads)
            )
        ).encode()
        assert self.verify(serial) == self.fingerprint

    def test_plain_and_existing_kernel_cloud_init_framing_remain_accepted(self):
        for prefix in ("", "[  12.500000] cloud-init[1234]: "):
            with self.subTest(prefix=prefix):
                assert self.verify(self.serial(prefix)) == self.fingerprint

    def test_foreign_priorities_tags_and_host_headers_are_not_normalized(self):
        for prefix in (
            "<13>Oct 25 20:55:49 cloud-init: ",
            "<15>Oct 25 20:55:49 cloud-init: ",
            "<014>Oct 25 20:55:49 cloud-init: ",
            "<192>Oct 25 20:55:49 cloud-init: ",
            "<14>Oct 25 20:55:49 arbitrary-app: ",
            "<14>Oct 25 20:55:49 cloud-init[1234]: ",
            "<14>Oct 25 20:55:49 foreign-host cloud-init: ",
            "<14>Oct 25 20:55:49 cloud-init: injected ",
            "arbitrary application output: ",
        ):
            with (
                self.subTest(prefix=prefix),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_foreign_priorities_tags_and_host_headers_are_not_normalized"
                    ),
                ),
            ):
                self.verify(self.serial(prefix))

    def test_malformed_timestamp_and_calendar_values_refuse(self):
        for timestamp in (
            "OCT 25 20:55:49",
            "Oct 05 20:55:49",
            "Oct 5 20:55:49",
            "Oct  0 20:55:49",
            "Oct 32 20:55:49",
            "Feb 30 20:55:49",
            "Apr 31 20:55:49",
            "Oct 25 24:55:49",
            "Oct 25 20:60:49",
            "Oct 25 20:55:60",
            "Oct 25 20:55",
            "Oct 25 20:55:49Z",
            "Oct\t25 20:55:49",
        ):
            with (
                self.subTest(timestamp=timestamp),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_malformed_timestamp_and_calendar_values_refuse"
                    ),
                ),
            ):
                self.verify(self.serial("<14>" + timestamp + " cloud-init: "))

    def test_every_syslog_section_line_requires_the_same_supported_producer(self):
        prefix = "<14>Oct 25 20:55:49 cloud-init: "
        for index in range(3):
            for other in ("", "<14>Oct 25 20:55:49 arbitrary-app: "):
                rows = [prefix + row for row in self.payloads]
                rows[index] = other + self.payloads[index]
                with (
                    self.subTest(index=index, other=other),
                    pytest.raises(
                        ValueError,
                        match=_refusal_regex(
                            "test_every_syslog_section_line_requires_the_same_supported_producer"
                        ),
                    ),
                ):
                    self.verify(("\n".join(rows) + "\n").encode())

    def test_plain_marker_with_syslog_rows_does_not_acquire_syslog_trust(self):
        rows = self.payloads.copy()
        rows[1] = "<14>Oct 25 20:55:49 cloud-init: " + rows[1]
        with pytest.raises(
            ValueError,
            match=_refusal_regex(
                "test_plain_marker_with_syslog_rows_does_not_acquire_syslog_trust"
            ),
        ):
            self.verify(("\n".join(rows) + "\n").encode())

    def test_changed_duplicate_missing_or_malformed_fingerprint_rows_refuse(self):
        original = self.payloads.copy()
        for rows in (
            [original[0], original[1], original[1], original[2]],
            [original[0], original[2]],
            [original[0], original[1] + "; run-command", original[2]],
            [original[0], original[1].replace("ED25519", "RSA"), original[2]],
        ):
            self.payloads = rows
            with (
                self.subTest(rows=len(rows)),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_changed_duplicate_missing_or_malformed_fingerprint_rows_refuse"
                    ),
                ),
            ):
                self.verify()
        self.payloads = original
        wire = wire_string(b"ssh-ed25519") + wire_string(bytes(reversed(range(32))))
        foreign = "192.0.2.7 ssh-ed25519 " + base64.b64encode(wire).decode()
        with pytest.raises(
            ValueError,
            match=_refusal_regex(
                "test_changed_duplicate_missing_or_malformed_fingerprint_rows_refuse"
            ),
        ):
            self.verify(line=foreign)

    def test_duplicate_or_out_of_order_sections_refuse(self):
        serial = self.serial()
        for data in (serial + serial, self.serial("") + serial, serial[::-1]):
            with (
                self.subTest(bytes=len(data)),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_duplicate_or_out_of_order_sections_refuse"
                    ),
                ),
            ):
                self.verify(data)

    def test_control_bytes_and_injected_multiline_envelopes_refuse(self):
        for control in ("\x00", "\x08", "\x0b", "\r", "\t", "\n"):
            with (
                self.subTest(control=repr(control)),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_control_bytes_and_injected_multiline_envelopes_refuse"
                    ),
                ),
            ):
                self.verify(
                    self.serial("<14>Oct 25 20:55:49 cloud-init:" + control + " ")
                )

    def test_supported_framing_keeps_original_ownership_and_capture_refusals(self):
        serial = self.serial()
        for key, value in (
            ("campaign", "foreign-campaign"),
            ("nodeName", "foreign-node"),
            ("instanceId", "99999"),
            ("ownershipSha256", "b" * 64),
            ("truncated", True),
            ("exitCode", 1),
            ("retainedBytes", len(serial) - 1),
            ("sha256", "0" * 64),
            ("transport", "ssh-keyscan-only"),
        ):
            with (
                self.subTest(key=key),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_supported_framing_keeps_original_ownership_and_capture_refusals"
                    ),
                ),
            ):
                self.verify(receipt={**self.receipt(serial), key: value})
        for now in (999.0, 1300.001, float("nan"), float("inf")):
            with (
                self.subTest(now=now),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_supported_framing_keeps_original_ownership_and_capture_refusals"
                    ),
                ),
            ):
                self.verify(now=now)

    def test_hash_of_raw_serial_remains_required_after_normalization(self):
        serial = self.serial()
        normalized = self.serial("")
        with pytest.raises(
            ValueError,
            match=_refusal_regex(
                "test_hash_of_raw_serial_remains_required_after_normalization"
            ),
        ):
            self.verify(serial, receipt=self.receipt(normalized))
