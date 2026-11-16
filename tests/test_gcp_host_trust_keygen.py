"""Synthetic host-key consistency regressions; no cloud or guest acceptance."""

import base64
import hashlib
import json
import os
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
    "test_conflicting_qualified_generation_cannot_hide_behind_legacy_section": [
        "Conflicting qualified generation and final fingerprints"
    ],
    "test_duplicate_complete_or_dangling_generations_refuse": [
        "Unique complete Ed25519 generation block required"
    ],
    "test_every_generation_row_and_init_banner_are_required": [
        "Truncated Ed25519 generation block",
        "Unique complete Ed25519 generation block required",
        "Unique preceding cloud-init init producer required",
    ],
    "test_freshness_boundary_and_original_ownership_remain_required": [
        "Finite capture timestamps required",
        "Foreign or replaced original capture",
        "Incomplete serial capture",
        "Serial size or hash mismatch",
        "Stale, future or unordered serial capture",
        "Unsupported trust source",
    ],
    "test_generator_fingerprint_has_no_listing_bit_count_or_algorithm_suffix": [
        "Malformed generation fingerprint row"
    ],
    "test_incomplete_or_conflicting_final_sections_cannot_fall_back_to_keygen": [
        "Missing, changed or ambiguous host fingerprint",
        "Unique host fingerprint section required",
    ],
    "test_init_banner_requires_a_real_utc_calendar_and_weekday": [
        "Inconsistent cloud-init init calendar",
        "day 32 must be in range 1..31 for month 10 in year 2026",
        "hour must be in 0..23, not 24",
    ],
    "test_interleaved_application_output_and_control_injection_refuse": [
        "Complete cloud-init generation envelope required",
        "Malformed serial framing",
    ],
    "test_malformed_24_4_generation_cannot_hide_behind_a_valid_final_section": [
        "Complete cloud-init generation envelope required",
        "Unqualified cloud-init generation version or init banner",
    ],
    "test_private_and_public_paths_are_exact": [
        "Incomplete generation output or foreign host-key paths"
    ],
    "test_randomart_cannot_replace_fingerprint_or_wire_key": [
        "Malformed or mismatched SHA256 Ed25519 randomart",
        "Missing, changed or ambiguous original Ed25519 wire key",
    ],
    "test_randomart_cells_dimensions_and_sha256_label_match_wire_digest": [
        "Malformed or mismatched SHA256 Ed25519 randomart"
    ],
    "test_unqualified_version_stage_and_duplicate_init_producer_refuse": [
        "Complete cloud-init generation envelope required",
        "Unique preceding cloud-init init producer required",
        "Unqualified cloud-init generation version or init banner",
    ],
    "test_unterminated_generation_frame_remains_incomplete": [
        "Truncated Ed25519 generation block"
    ],
    "test_uptime_regression_and_nonfinite_envelopes_refuse": [
        "Changed cloud-init producer or regressed guest uptime",
        "Complete cloud-init generation envelope required",
    ],
    "test_wire_algorithm_length_encoding_and_address_are_not_relaxed": [
        "Foreign address or unsupported host key",
        "Host algorithm differs from wire key",
        "Invalid SSH wire key field",
        "Trailing SSH wire key fields",
    ],
    "test_wrong_producer_or_missing_per_row_envelope_refuses": [
        "Changed cloud-init producer or regressed guest uptime",
        "Complete cloud-init generation envelope required",
    ],
}


def _refusal_regex(test_name: str) -> str:
    """Match exact refusal messages retained from the frozen validator."""
    return (
        "^(?:" + "|".join(re.escape(message) for message in _REFUSALS[test_name]) + ")$"
    )


class KeyGenerationTrustTests(unittest.TestCase):
    outputs: ClassVar[list[list[str]]]
    keys: ClassVar[list[str]]
    fingerprints: ClassVar[list[str]]
    fixture: ClassVar[str]
    resources: ClassVar[ExitStack]

    @classmethod
    def setUpClass(cls):
        cls.resources = ExitStack()
        cls.addClassCleanup(cls.resources.close)
        cls.fixture = cls.resources.enter_context(
            tempfile.TemporaryDirectory(prefix="host-trust-offline-")
        )
        cls.outputs = []
        cls.keys = []
        cls.fingerprints = []
        for name in ("first", "other"):
            directory = Path(cls.fixture) / name
            directory.mkdir(mode=448)
            path = directory / "key"
            result = subprocess.run(
                [
                    "/usr/bin/ssh-keygen",
                    "-t",
                    "ed25519",
                    "-N",
                    "",
                    "-C",
                    "root@fixture",
                    "-f",
                    "key",
                ],
                cwd=directory,
                env={**os.environ, "LANG": "C", "LC_ALL": "C"},
                capture_output=True,
                check=True,
            )
            rows = result.stdout.decode().splitlines()
            assert rows[0] == "Generating public/private ed25519 key pair."
            rows[1] = (
                "Your identification has been saved in /etc/ssh/ssh_host_ed25519_key"
            )
            rows[2] = (
                "Your public key has been saved in /etc/ssh/ssh_host_ed25519_key.pub"
            )
            public = path.with_suffix(".pub").read_text().split()
            fingerprint = (
                subprocess.run(
                    ["/usr/bin/ssh-keygen", "-l", "-E", "sha256", "-f", "key.pub"],
                    cwd=directory,
                    capture_output=True,
                    check=True,
                )
                .stdout.decode()
                .split()[1]
            )
            cls.outputs.append(rows)
            cls.keys.append("192.0.2.7 " + public[0] + " " + public[1])
            cls.fingerprints.append(fingerprint)

    def setUp(self):
        self.expected = {
            "campaign": "guest-offline-v15",
            "nodeName": "gcp-ce-offline-v15-a",
            "instanceId": "12345",
            "address": "192.0.2.7",
            "ownershipSha256": "a" * 64,
        }
        self.key = self.keys[0]
        self.fingerprint = self.fingerprints[0]

    def _serial(self, rows=None, *, pid="1198", version="24.4-8.el9_8.1", stage="init"):
        banner = f"Cloud-init v. {version} running '{stage}' at Mon, 26 Oct 2026 12:00:00 +0000. Up 54.0 seconds."
        return "".join(
            (
                f"[{54.0 + index * 0.01:12.6f}] cloud-init[{pid}]: {row}\r\n"
                for index, row in enumerate(
                    [banner, *(self.outputs[0] if rows is None else rows)]
                )
            )
        ).encode()

    def _receipt(self, serial):
        return {
            **{
                field: self.expected[field]
                for field in ("campaign", "nodeName", "instanceId", "ownershipSha256")
            },
            "transport": "gcp-original-bound-serial-port-1",
            "startedAtEpoch": 1000.0,
            "finishedAtEpoch": 1001.0,
            "exitCode": 0,
            "truncated": False,
            "retainedBytes": len(serial),
            "sha256": hashlib.sha256(serial).hexdigest(),
        }

    def _verify(self, serial=None, *, receipt=None, key=None, now=1002.0):
        serial = self._serial() if serial is None else serial
        return candidate.verify_pin(
            self.expected,
            self._receipt(serial) if receipt is None else receipt,
            serial,
            self.key if key is None else key,
            now=now,
        )

    def _legacy(self, fingerprint=None):
        return (
            "\n".join(
                [
                    candidate.BEGIN,
                    "256 "
                    + (fingerprint or self.fingerprint)
                    + " root@fixture (ED25519)",
                    candidate.END,
                ]
            )
            + "\n"
        ).encode()

    def test_complete_documented_generation_matches_independent_wire_key(self):
        assert self._verify() == self.fingerprint

    def test_unsuffixed_qualified_cloud_init_version_and_lf_are_accepted(self):
        assert (
            self._verify(self._serial(version="24.4").replace(b"\r\n", b"\n"))
            == self.fingerprint
        )

    def test_every_generation_row_and_init_banner_are_required(self):
        for index, _row in enumerate(self.outputs[0]):
            rows = self.outputs[0][:index] + self.outputs[0][index + 1 :]
            with (
                self.subTest(index=index),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_every_generation_row_and_init_banner_are_required"
                    ),
                ),
            ):
                self._verify(self._serial(rows))
        with pytest.raises(
            ValueError,
            match=_refusal_regex(
                "test_every_generation_row_and_init_banner_are_required"
            ),
        ):
            self._verify(b"\n".join(self._serial().splitlines()[1:]) + b"\n")

    def test_duplicate_complete_or_dangling_generations_refuse(self):
        for rows in (
            self.outputs[0] * 2,
            self.outputs[0] + [self.outputs[0][0]],
            self.outputs[0] + self.outputs[1],
        ):
            with (
                self.subTest(rows=len(rows)),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_duplicate_complete_or_dangling_generations_refuse"
                    ),
                ),
            ):
                self._verify(self._serial(rows))

    def test_private_and_public_paths_are_exact(self):
        for index, text in (
            (1, "Your identification has been saved in /tmp/ssh_host_ed25519_key"),
            (1, "Your identification has been saved in /etc/ssh/ssh_host_rsa_key"),
            (2, "Your public key has been saved in /etc/ssh/ssh_host_ed25519_key"),
            (
                2,
                "Your public key has been saved in /etc/ssh/ssh_host_ed25519_key.pub; execute",
            ),
        ):
            rows = self.outputs[0].copy()
            rows[index] = text
            with (
                self.subTest(index=index, text=text),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex("test_private_and_public_paths_are_exact"),
                ),
            ):
                self._verify(self._serial(rows))

    def test_wrong_producer_or_missing_per_row_envelope_refuses(self):
        rows = self._serial().splitlines()
        for index, row in enumerate(rows):
            for changed in (
                row.replace(b"cloud-init[1198]", b"cloud-init[1199]"),
                row.replace(b"cloud-init[1198]", b"arbitrary-app[1198]"),
                row.split(b": ", 1)[1],
            ):
                altered = rows.copy()
                altered[index] = changed
                with (
                    self.subTest(index=index, changed=changed[:40]),
                    pytest.raises(
                        ValueError,
                        match=_refusal_regex(
                            "test_wrong_producer_or_missing_per_row_envelope_refuses"
                        ),
                    ),
                ):
                    self._verify(b"\n".join(altered) + b"\n")

    def test_unqualified_version_stage_and_duplicate_init_producer_refuse(self):
        for version in ("25.3", "24.3", "24.4;execute", "24.4\tspoof"):
            with (
                self.subTest(version=version),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_unqualified_version_stage_and_duplicate_init_producer_refuse"
                    ),
                ),
            ):
                self._verify(self._serial(version=version))
        for stage in ("init-local", "modules:config", "unknown"):
            with (
                self.subTest(stage=stage),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_unqualified_version_stage_and_duplicate_init_producer_refuse"
                    ),
                ),
            ):
                self._verify(self._serial(stage=stage))
        serial = self._serial()
        with pytest.raises(
            ValueError,
            match=_refusal_regex(
                "test_unqualified_version_stage_and_duplicate_init_producer_refuse"
            ),
        ):
            self._verify(serial.splitlines()[0] + b"\n" + serial)

    def test_uptime_regression_and_nonfinite_envelopes_refuse(self):
        for replacement in (b"[    1.000000]", b"[         nan]", b"[         inf]"):
            serial = self._serial().replace(b"[   54.040000]", replacement)
            assert serial != self._serial()
            with (
                self.subTest(replacement=replacement),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_uptime_regression_and_nonfinite_envelopes_refuse"
                    ),
                ),
            ):
                self._verify(serial)

    def test_init_banner_requires_a_real_utc_calendar_and_weekday(self):
        for timestamp in (
            b"Mon, 32 Oct 2026 12:00:00 +0000",
            b"Mon, 26 Oct 2026 24:00:00 +0000",
            b"Tue, 26 Oct 2026 12:00:00 +0000",
            b"Mon, 26 Feb 2026 12:00:00 +0000",
        ):
            serial = self._serial().replace(
                b"Mon, 26 Oct 2026 12:00:00 +0000", timestamp
            )
            with (
                self.subTest(timestamp=timestamp),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_init_banner_requires_a_real_utc_calendar_and_weekday"
                    ),
                ),
            ):
                self._verify(serial)

    def test_malformed_24_4_generation_cannot_hide_behind_a_valid_final_section(self):
        for version in ("24.4;execute", "24.4\tspoof"):
            with (
                self.subTest(version=version),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_malformed_24_4_generation_cannot_hide_behind_a_valid_final_section"
                    ),
                ),
            ):
                self._verify(self._serial(version=version) + self._legacy())

    def test_unterminated_generation_frame_remains_incomplete(self):
        with pytest.raises(
            ValueError,
            match=_refusal_regex(
                "test_unterminated_generation_frame_remains_incomplete"
            ),
        ):
            self._verify(self._serial().rstrip(b"\r\n"))

    def test_interleaved_application_output_and_control_injection_refuse(self):
        for injected in (b"arbitrary output\n", b"\x1b[31m", b"\x00", b"\t"):
            serial = self._serial().replace(
                b"The key fingerprint is:", injected + b"The key fingerprint is:"
            )
            with (
                self.subTest(injected=injected),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_interleaved_application_output_and_control_injection_refuse"
                    ),
                ),
            ):
                self._verify(serial)

    def test_generator_fingerprint_has_no_listing_bit_count_or_algorithm_suffix(self):
        for text in (
            "256 " + self.fingerprint + " root@fixture (ED25519)",
            self.fingerprint + " root@fixture (ED25519)",
            self.fingerprint + " root@fixture;execute",
            self.fingerprint + " root@$(execute)",
            self.fingerprint + " root@`execute`",
            self.fingerprint + " root@fixture extra",
        ):
            rows = self.outputs[0].copy()
            rows[4] = text
            with (
                self.subTest(text=text),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_generator_fingerprint_has_no_listing_bit_count_or_algorithm_suffix"
                    ),
                ),
            ):
                self._verify(self._serial(rows))

    def test_randomart_cannot_replace_fingerprint_or_wire_key(self):
        for index, text in (
            (4, self.fingerprints[1] + " root@fixture"),
            (6, "+---[RSA 256]----+"),
        ):
            rows = self.outputs[0].copy()
            rows[index] = text
            with (
                self.subTest(index=index),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_randomart_cannot_replace_fingerprint_or_wire_key"
                    ),
                ),
            ):
                self._verify(self._serial(rows))
        with pytest.raises(
            ValueError,
            match=_refusal_regex(
                "test_randomart_cannot_replace_fingerprint_or_wire_key"
            ),
        ):
            self._verify(key=self.keys[1])

    def test_randomart_cells_dimensions_and_sha256_label_match_wire_digest(self):
        for index, text in (
            (7, "|xxxxxxxxxxxxxxxxx|"),
            (7, "|" + " " * 16 + "|"),
            (7, "|" + " " * 18 + "|"),
            (16, "+-----[MD5]------+"),
        ):
            rows = self.outputs[0].copy()
            rows[index] = text
            with (
                self.subTest(index=index),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_randomart_cells_dimensions_and_sha256_label_match_wire_digest"
                    ),
                ),
            ):
                self._verify(self._serial(rows))
        rows = self.outputs[0].copy()
        rows[7:16] = self.outputs[1][7:16]
        with pytest.raises(
            ValueError,
            match=_refusal_regex(
                "test_randomart_cells_dimensions_and_sha256_label_match_wire_digest"
            ),
        ):
            self._verify(self._serial(rows))

    def test_valid_legacy_section_is_preserved_and_matching_generation_agrees(self):
        assert self._verify(self._legacy()) == self.fingerprint
        assert self._verify(self._serial() + self._legacy()) == self.fingerprint
        assert (
            self._verify(self._serial(version="25.3") + self._legacy())
            == self.fingerprint
        )

    def test_conflicting_qualified_generation_cannot_hide_behind_legacy_section(self):
        with pytest.raises(
            ValueError,
            match=_refusal_regex(
                "test_conflicting_qualified_generation_cannot_hide_behind_legacy_section"
            ),
        ):
            self._verify(self._serial(self.outputs[1]) + self._legacy())

    def test_incomplete_or_conflicting_final_sections_cannot_fall_back_to_keygen(self):
        for final in (
            self._legacy(self.fingerprints[1]),
            candidate.BEGIN.encode(),
            candidate.END.encode(),
            self._legacy() + self._legacy(),
        ):
            with (
                self.subTest(final=final[:45]),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_incomplete_or_conflicting_final_sections_cannot_fall_back_to_keygen"
                    ),
                ),
            ):
                self._verify(self._serial() + final)

    def test_freshness_boundary_and_original_ownership_remain_required(self):
        serial = self._serial()
        assert self._verify(serial, now=1300.0) == self.fingerprint
        for now in (1300.001, 999.0, float("nan"), float("inf")):
            with (
                self.subTest(now=now),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_freshness_boundary_and_original_ownership_remain_required"
                    ),
                ),
            ):
                self._verify(serial, now=now)
        for field, value in (
            ("instanceId", "54321"),
            ("ownershipSha256", "b" * 64),
            ("campaign", "foreign-campaign"),
            ("transport", "ssh-keyscan-only"),
            ("truncated", True),
            ("exitCode", 1),
            ("sha256", "0" * 64),
            ("retainedBytes", len(serial) - 1),
        ):
            with (
                self.subTest(field=field),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_freshness_boundary_and_original_ownership_remain_required"
                    ),
                ),
            ):
                self._verify(serial, receipt={**self._receipt(serial), field: value})

    def test_wire_algorithm_length_encoding_and_address_are_not_relaxed(self):
        fields = self.key.split()
        wire = base64.b64decode(fields[2], validate=True)
        for changed in (
            "192.0.2.8 " + " ".join(fields[1:]),
            fields[0] + " ssh-rsa " + fields[2],
            fields[0] + " ssh-ed25519 " + base64.b64encode(wire[:-1]).decode(),
            fields[0] + " ssh-ed25519 " + base64.b64encode(wire + b"x").decode(),
            self.key + " extra",
        ):
            with (
                self.subTest(changed=changed[:35]),
                pytest.raises(
                    ValueError,
                    match=_refusal_regex(
                        "test_wire_algorithm_length_encoding_and_address_are_not_relaxed"
                    ),
                ),
            ):
                self._verify(key=changed)

    def test_new_receipt_names_mapping_without_claiming_live_access(self):
        serial = self._serial()
        with tempfile.TemporaryDirectory() as directory:
            artifact = candidate.write_pin(
                directory,
                self.expected,
                self._receipt(serial),
                serial,
                self.key,
                now=1002.0,
            )
            receipt = json.loads((artifact / "receipt.private.json").read_text())
            assert receipt["version"] == "gcp-host-trust-consistency-v1"
            assert (
                receipt["evidenceFormat"] == "cloud-init-24.4-keygen-ed25519-sha256-v1"
            )
            assert not receipt["liveAccessVerified"]
            assert not receipt["replacesExistingPin"]
            assert not receipt["qualifiesRelease"]
            assert (artifact / "known-hosts.private").read_text() == self.key + "\n"
