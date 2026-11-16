"""Host-key consistency mapping. No SSH, cloud calls, or existing pin replacement.

The caller must supply a serial receipt from independently verified original-VM
capture. This module checks that receipt's consistency; it cannot authenticate a
caller-invented receipt or establish live guest access.
"""

import base64
import binascii
import datetime
import hashlib
import ipaddress
import json
import math
import os
import re
from pathlib import Path
from typing import cast
from uuid import uuid4

VERSION = "gcp-host-trust-consistency-v1"
UINT64_MAX = 18446744073709551615
FRESHNESS = 300
KNOWN_HOSTS_LINE_LIMIT = 32768
KNOWN_HOSTS_FIELDS = 3
ED25519_PUBLIC_BYTES = 32
ECDSA_POINT_BYTES = 65
ECDSA_UNCOMPRESSED_POINT = 4
SHA256_BYTES = 32
LIMIT = 4 * 1024 * 1024
ALGORITHMS = {
    "ssh-ed25519": "ED25519",
    "ssh-rsa": "RSA",
    "ecdsa-sha2-nistp256": "ECDSA",
}
ANSI = re.compile(rb"\x1b\[[0-?]*[ -/]*[@-~]")
BEGIN = "-----BEGIN SSH HOST KEY FINGERPRINTS-----"
END = "-----END SSH HOST KEY FINGERPRINTS-----"
GENERATION_START = "Generating public/private ed25519 key pair."
GENERATION_FORMAT = "cloud-init-24.4-keygen-ed25519-sha256-v1"
LEGACY_FORMAT = "cloud-init-host-fingerprints-sha256-v1"
GENERATION_ENVELOPE = re.compile(
    r"\[ *(?P<uptime>[0-9]+(?:\.[0-9]+)?)\] cloud-init\["
    r"(?P<pid>[1-9][0-9]{0,9})\]: (?P<payload>[^\x00-\x1f\x7f]*)\r?"
)
INIT_BANNER = re.compile(
    r"Cloud-init v\. (?P<version>[A-Za-z0-9._+-]+) running 'init' at "
    r"(?P<weekday>Mon|Tue|Wed|Thu|Fri|Sat|Sun), (?P<day>[0-9]{2}) "
    r"(?P<month>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (?P<year>[0-9]{4}) "
    r"(?P<hour>[0-9]{2}):(?P<minute>[0-9]{2}):(?P<second>[0-9]{2}) \+0000\. "
    r"Up (?P<uptime>[0-9]+(?:\.[0-9]+)?) seconds\."
)
RANDOMART_SYMBOLS = " .o+=*BOX@%&#/^SE"
SYSLOG_HEADER = re.compile(
    r"<14>(?P<month>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) "
    r"(?P<day> [1-9]|[12][0-9]|3[01]) "
    r"(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9] "
    r"cloud-init: (?P<payload>[^\x00-\x1f\x7f]*)\r?"
)
MONTH_DAYS = {
    "Jan": 31,
    "Feb": 29,
    "Mar": 31,
    "Apr": 30,
    "May": 31,
    "Jun": 30,
    "Jul": 31,
    "Aug": 31,
    "Sep": 30,
    "Oct": 31,
    "Nov": 30,
    "Dec": 31,
}


def digest(data: bytes) -> str:
    """Hash exact retained bytes without normalizing their framing."""
    return hashlib.sha256(data).hexdigest()


def key_fields(line: str, address: str) -> tuple[list[str], str]:
    """Validate a canonical address and complete SSH wire-key encoding."""
    if (
        not isinstance(line, str)
        or len(line) > KNOWN_HOSTS_LINE_LIMIT
        or re.search(r"[\x00-\x1f\x7f]", line)
    ):
        msg = "Malformed known-hosts line"
        raise ValueError(msg)
    fields = line.split()
    if (
        len(fields) != KNOWN_HOSTS_FIELDS
        or line != " ".join(fields)
        or fields[0] != address
        or fields[1] not in ALGORITHMS
    ):
        msg = "Foreign address or unsupported host key"
        raise ValueError(msg)
    try:
        raw = base64.b64decode(fields[2], validate=True)
    except (ValueError, binascii.Error) as exc:
        msg = "Malformed encoded host key"
        raise ValueError(msg) from exc
    if base64.b64encode(raw).decode() != fields[2]:
        msg = "Noncanonical encoded host key"
        raise ValueError(msg)
    offset = 0

    def wire_string() -> bytes:
        nonlocal offset
        if offset + 4 > len(raw):
            msg = "Incomplete SSH wire key"
            raise ValueError(msg)
        size = int.from_bytes(raw[offset : offset + 4], "big")
        offset += 4
        if size < 1 or offset + size > len(raw):
            msg = "Invalid SSH wire key field"
            raise ValueError(msg)
        value = raw[offset : offset + size]
        offset += size
        return value

    if wire_string() != fields[1].encode():
        msg = "Host algorithm differs from wire key"
        raise ValueError(msg)
    if fields[1] == "ssh-ed25519":
        if len(wire_string()) != ED25519_PUBLIC_BYTES:
            msg = "Invalid Ed25519 key size"
            raise ValueError(msg)
    elif fields[1] == "ecdsa-sha2-nistp256":
        if wire_string() != b"nistp256":
            msg = "Wrong ECDSA curve"
            raise ValueError(msg)
        point = wire_string()
        if len(point) != ECDSA_POINT_BYTES or point[0] != ECDSA_UNCOMPRESSED_POINT:
            msg = "Invalid ECDSA point encoding"
            raise ValueError(msg)
    else:
        for number in (wire_string(), wire_string()):
            if number[0] & 0x80 or int.from_bytes(number, "big") == 0:
                msg = "Invalid RSA public integer"
                raise ValueError(msg)
            if len(number) > 1 and number[0] == 0 and not number[1] & 0x80:
                msg = "Noncanonical RSA public integer"
                raise ValueError(msg)
    if offset != len(raw):
        msg = "Trailing SSH wire key fields"
        raise ValueError(msg)
    fingerprint = "SHA256:" + base64.b64encode(
        hashlib.sha256(raw).digest()
    ).decode().rstrip("=")
    return fields, fingerprint


def normalize_syslog_section(text: str) -> str:
    """Normalize only cloud-init's documented user.info fingerprint section.

    The upstream helper uses logger -s -p user.info -t cloud-init. Serial output
    can therefore contain priority 14, a BSD timestamp and the cloud-init tag.
    This envelope is syntax, not independent proof of producer or capture time.
    Original-VM identity, raw bytes and freshness are verified by the caller.
    """
    lines = text.split("\n")
    start = next(index for index, line in enumerate(lines) if BEGIN in line)
    finish = next(index for index, line in enumerate(lines) if END in line)
    first = SYSLOG_HEADER.fullmatch(lines[start])
    if first is None or first["payload"] != BEGIN:
        return text
    if start >= finish:
        msg = "Unordered cloud-init fingerprint section"
        raise ValueError(msg)
    for index in range(start, finish + 1):
        row = SYSLOG_HEADER.fullmatch(lines[index])
        if row is None or int(row["day"]) > MONTH_DAYS[row["month"]]:
            msg = "Unsupported cloud-init fingerprint envelope"
            raise ValueError(msg)
        lines[index] = row["payload"] + ("\r" if lines[index].endswith("\r") else "")
    return "\n".join(lines)


def _randomart(digest_bytes: bytes) -> tuple[str, ...]:
    """OpenSSH V_9_9_P2 randomart for a SHA256 Ed25519 wire-key digest."""
    if len(digest_bytes) != SHA256_BYTES:
        msg = "SHA256 digest required for randomart"
        raise ValueError(msg)
    field = [[0] * 17 for _ in range(9)]
    x, y = 8, 4
    last = len(RANDOMART_SYMBOLS) - 1
    for original_byte in digest_bytes:
        byte = original_byte
        for _ in range(4):
            x = min(16, max(0, x + (1 if byte & 1 else -1)))
            y = min(8, max(0, y + (1 if byte & 2 else -1)))
            field[y][x] = min(last - 2, field[y][x] + 1)
            byte >>= 2
    field[4][8] = last - 1
    field[y][x] = last
    return (
        "+--[ED25519 256]--+",
        *(
            "|" + "".join(RANDOMART_SYMBOLS[cell] for cell in row) + "|"
            for row in field
        ),
        "+----[SHA256]-----+",
    )


def _generation_row(line: str) -> tuple[float, str, str]:
    row = GENERATION_ENVELOPE.fullmatch(line)
    if row is None:
        msg = "Complete cloud-init generation envelope required"
        raise ValueError(msg)
    uptime = float(row["uptime"])
    if not math.isfinite(uptime):
        msg = "Finite guest uptime required"
        raise ValueError(msg)
    return uptime, row["pid"], row["payload"]


def _keygen_block(raw_text: str) -> tuple[str, tuple[str, ...], dict[str, object]]:
    """Parse documented generation evidence without claiming wire-key trust.

    Keep raw producer framing through validation. A fingerprint and its
    randomart are related representations, not independent authentication.
    Only verify_pin joins them to an independently captured original wire key.
    """
    if not isinstance(raw_text, str) or not 0 < len(raw_text) <= LIMIT:
        msg = "Bounded original generation text required"
        raise ValueError(msg)
    rows = raw_text.split("\n")
    starts = [index for index, row in enumerate(rows) if GENERATION_START in row]
    if len(starts) != 1:
        msg = "Unique complete Ed25519 generation block required"
        raise ValueError(msg)
    start = starts[0]
    if start + 17 >= len(rows):
        msg = "Truncated Ed25519 generation block"
        raise ValueError(msg)
    banners = [
        index
        for index, row in enumerate(rows)
        if "Cloud-init v." in row and "running 'init'" in row
    ]
    if len(banners) != 1 or banners[0] >= start:
        msg = "Unique preceding cloud-init init producer required"
        raise ValueError(msg)
    banner_time, producer, payload = _generation_row(rows[banners[0]])
    banner = INIT_BANNER.fullmatch(payload)
    if banner is None or not re.fullmatch(
        r"24\.4(?:-[A-Za-z0-9][A-Za-z0-9._+-]*)?", banner["version"]
    ):
        msg = "Unqualified cloud-init generation version or init banner"
        raise ValueError(msg)
    stamp = datetime.datetime(
        int(banner["year"]),
        tuple(MONTH_DAYS).index(banner["month"]) + 1,
        int(banner["day"]),
        int(banner["hour"]),
        int(banner["minute"]),
        int(banner["second"]),
        tzinfo=datetime.UTC,
    )
    if ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")[stamp.weekday()] != banner[
        "weekday"
    ]:
        msg = "Inconsistent cloud-init init calendar"
        raise ValueError(msg)
    declared_uptime = float(banner["uptime"])
    if not math.isfinite(declared_uptime) or declared_uptime > banner_time:
        msg = "Inconsistent cloud-init init uptime"
        raise ValueError(msg)
    block = []
    times = []
    previous = banner_time
    for raw in rows[start : start + 17]:
        uptime, pid, payload = _generation_row(raw)
        if pid != producer or uptime < previous:
            msg = "Changed cloud-init producer or regressed guest uptime"
            raise ValueError(msg)
        previous = uptime
        times.append(uptime)
        block.append(payload)
    required = {
        0: GENERATION_START,
        1: "Your identification has been saved in /etc/ssh/ssh_host_ed25519_key",
        2: "Your public key has been saved in /etc/ssh/ssh_host_ed25519_key.pub",
        3: "The key fingerprint is:",
        5: "The key's randomart image is:",
    }
    if any(block[index] != value for index, value in required.items()):
        msg = "Incomplete generation output or foreign host-key paths"
        raise ValueError(msg)
    identifying = (GENERATION_START, "ssh_host_ed25519_key", "[ED25519 256]")
    if any(
        any(marker in row for marker in identifying)
        for index, row in enumerate(rows)
        if not start <= index < start + 17
    ):
        msg = "Duplicate or dangling Ed25519 generation evidence"
        raise ValueError(msg)
    fingerprint_row = re.fullmatch(
        r"(?P<fingerprint>SHA256:[A-Za-z0-9+/]{43}) "
        r"[A-Za-z0-9._-]{1,64}@[A-Za-z0-9._-]{1,253}",
        block[4],
    )
    if fingerprint_row is None:
        msg = "Malformed generation fingerprint row"
        raise ValueError(msg)
    fingerprint = fingerprint_row["fingerprint"]
    fingerprint_digest = base64.b64decode(fingerprint[7:] + "=", validate=True)
    if base64.b64encode(fingerprint_digest).decode().rstrip("=") != fingerprint[7:]:
        msg = "Noncanonical generation fingerprint"
        raise ValueError(msg)
    randomart = tuple(block[6:])
    if randomart != _randomart(fingerprint_digest):
        msg = "Malformed or mismatched SHA256 Ed25519 randomart"
        raise ValueError(msg)
    return (
        fingerprint,
        randomart,
        {
            "evidenceFormat": GENERATION_FORMAT,
            "cloudInitVersion": banner["version"],
            "cloudInitProducerPid": producer,
            "generationStartedAtGuestUptime": times[0],
            "generationFinishedAtGuestUptime": times[-1],
            "wireKeyMatched": False,
        },
    )


def _legacy_fingerprints(text: str) -> dict[str, str]:
    # Preserve the legacy final-section mapping and its documented envelopes.
    text = re.sub(r"(?m)^(?:\[\s*[0-9.]+\]\s+)?cloud-init\[[0-9]+\]:\s*", "", text)
    if text.count(BEGIN) != 1 or text.count(END) != 1:
        msg = "Unique host fingerprint section required"
        raise ValueError(msg)
    text = normalize_syslog_section(text)
    section = re.search(
        r"(?m)^" + re.escape(BEGIN) + r"\r?\n(.*?)^" + re.escape(END) + r"\r?$",
        text,
        re.DOTALL,
    )
    if not section:
        msg = "Unframed host fingerprint section"
        raise ValueError(msg)
    fingerprints = {}
    for line in section[1].splitlines():
        if not line.strip():
            continue
        row = re.fullmatch(
            r"\s*[1-9][0-9]{1,4}\s+(SHA256:[A-Za-z0-9+/]{43})\s+[^\x00-\x1f]{1,255}\s+\((ED25519|RSA|ECDSA)\)\s*",
            line,
        )
        if not row:
            msg = "Malformed host fingerprint row"
            raise ValueError(msg)
        if row[2] in fingerprints:
            msg = "Missing, changed or ambiguous host fingerprint"
            raise ValueError(msg)
        fingerprints[row[2]] = row[1]
    return fingerprints


def _finite_timestamp(value: object) -> int | float:
    """Reject nonnumeric, nonfinite and unrepresentable capture clocks."""
    msg = "Finite capture timestamps required"
    if type(value) not in (float, int):
        raise ValueError(msg)
    number = cast("int | float", value)
    try:
        finite = math.isfinite(number)
    except OverflowError as exc:
        raise ValueError(msg) from exc
    if not finite:
        raise ValueError(msg)
    return number


def _verified_pin(
    expected: dict[str, object],
    receipt: dict[str, object],
    serial: bytes,
    key_line: str,
    *,
    now: int | float,
) -> tuple[str, dict[str, object]]:
    if not isinstance(expected, dict) or not isinstance(receipt, dict):
        msg = "Original capture context required"
        raise TypeError(msg)
    for field in ("campaign", "nodeName"):
        value = expected.get(field)
        if not isinstance(value, str) or not re.fullmatch(
            r"[a-z][a-z0-9-]{2,100}", value
        ):
            msg = "Malformed original context"
            raise ValueError(msg)
    instance_id = expected.get("instanceId")
    if (
        not isinstance(instance_id, str)
        or not re.fullmatch(r"[1-9][0-9]{0,19}", instance_id)
        or int(instance_id) > UINT64_MAX
    ):
        msg = "Original numeric VM identity required"
        raise ValueError(msg)
    if not re.fullmatch(r"[0-9a-f]{64}", str(expected.get("ownershipSha256", ""))):
        msg = "Original ownership digest required"
        raise ValueError(msg)
    for field in ("campaign", "nodeName", "instanceId", "ownershipSha256"):
        if receipt.get(field) != expected[field]:
            msg = "Foreign or replaced original capture"
            raise ValueError(msg)
    address = expected.get("address")
    try:
        canonical_address = str(ipaddress.IPv4Address(address))
    except (ValueError, TypeError) as exc:
        msg = "Original IPv4 address required"
        raise ValueError(msg) from exc
    if canonical_address != address:
        msg = "Original IPv4 address required"
        raise ValueError(msg)
    if receipt.get("transport") != "gcp-original-bound-serial-port-1":
        msg = "Unsupported trust source"
        raise ValueError(msg)
    if (
        type(receipt.get("exitCode")) is not int
        or receipt["exitCode"] != 0
        or receipt.get("truncated") is not False
    ):
        msg = "Incomplete serial capture"
        raise ValueError(msg)
    now = _finite_timestamp(now)
    start = _finite_timestamp(receipt.get("startedAtEpoch"))
    finish = _finite_timestamp(receipt.get("finishedAtEpoch"))
    if not start <= finish <= now or not 0 <= now - start <= FRESHNESS:
        msg = "Stale, future or unordered serial capture"
        raise ValueError(msg)
    if not isinstance(serial, bytes) or not 0 < len(serial) <= LIMIT:
        msg = "Bounded original serial bytes required"
        raise ValueError(msg)
    if (
        type(receipt.get("retainedBytes")) is not int
        or receipt["retainedBytes"] != len(serial)
        or receipt.get("sha256") != digest(serial)
    ):
        msg = "Serial size or hash mismatch"
        raise ValueError(msg)
    try:
        raw_text = serial.decode("utf-8", errors="strict")
    except UnicodeError as exc:
        msg = "Malformed serial encoding"
        raise ValueError(msg) from exc
    if "\x00" in raw_text:
        msg = "Malformed serial framing"
        raise ValueError(msg)
    fields, fingerprint = key_fields(key_line, address)
    legacy_text = ANSI.sub(b"", serial).decode("utf-8")
    if BEGIN in legacy_text or END in legacy_text:
        # A present final section is authoritative: malformed, missing or
        # contradictory final rows never fall back to generation output.
        final = _legacy_fingerprints(legacy_text)
        if final.get(ALGORITHMS[fields[1]]) != fingerprint:
            msg = "Missing, changed or ambiguous host fingerprint"
            raise ValueError(msg)
        metadata = {"evidenceFormat": LEGACY_FORMAT, "wireKeyMatched": True}
        qualified_banner = re.search(r"Cloud-init v\. 24\.4(?![0-9.])", raw_text)
        ed25519_output = any(
            marker in raw_text
            for marker in (
                GENERATION_START,
                "ssh_host_ed25519_key",
                "[ED25519 256]",
            )
        )
        if qualified_banner and ed25519_output:
            generated, _, generation = _keygen_block(raw_text)
            if final.get("ED25519") != generated:
                msg = "Conflicting qualified generation and final fingerprints"
                raise ValueError(msg)
            metadata["corroboratingGeneration"] = generation
    else:
        generated, _, metadata = _keygen_block(raw_text)
        if fields[1] != "ssh-ed25519" or generated != fingerprint:
            msg = "Missing, changed or ambiguous original Ed25519 wire key"
            raise ValueError(msg)
        metadata["wireKeyMatched"] = True
    return fingerprint, metadata


def verify_pin(
    expected: dict[str, object],
    receipt: dict[str, object],
    serial: bytes,
    key_line: str,
    *,
    now: int | float,
) -> str:
    """Verify consistency of supplied serial evidence and an untrusted wire key."""
    return _verified_pin(expected, receipt, serial, key_line, now=now)[0]


def write_pin(
    root: str | Path,
    expected: dict[str, object],
    receipt: dict[str, object],
    serial: bytes,
    key_line: str,
    *,
    now: int | float,
) -> Path:
    """Write a new private consistency artifact without replacing saved pins."""
    fingerprint, metadata = _verified_pin(expected, receipt, serial, key_line, now=now)
    root = Path(root)
    if root.is_symlink() or not root.is_dir() or root.stat().st_uid != os.getuid():
        msg = "Owned artifact directory required"
        raise ValueError(msg)
    artifact = root / ("host-pin-" + str(uuid4()))
    artifact.mkdir(mode=0o700)
    result = {
        "version": VERSION,
        "campaign": expected["campaign"],
        "nodeName": expected["nodeName"],
        "originalInstanceId": expected["instanceId"],
        "address": expected["address"],
        "ownershipSha256": expected["ownershipSha256"],
        "serialSha256": digest(serial),
        "serialReceiptSha256": digest(json.dumps(receipt, sort_keys=True).encode()),
        "fingerprint": fingerprint,
        "validatedAtEpoch": now,
        "freshnessSeconds": FRESHNESS,
        "liveAccessVerified": False,
        "replacesExistingPin": False,
        "qualifiesRelease": False,
        **metadata,
    }
    for name, data in (
        ("known-hosts.private", (key_line + "\n").encode()),
        ("receipt.private.json", (json.dumps(result, indent=2) + "\n").encode()),
    ):
        descriptor = os.open(
            artifact / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
        )
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    return artifact
