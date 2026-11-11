"""Verify the real guest control wire independently of guest acceptance."""

from __future__ import annotations

import json
import socket
import struct
import threading
import time

import pytest

from plugins.terraform.scripts.guest_control import (
    GuestControlPort,
    decode_guest_command,
)

NONCE = "a" * 64


def ports():
    left, right = socket.socketpair()
    return (
        left,
        right,
        GuestControlPort(left.fileno(), left.fileno(), NONCE),
        GuestControlPort(right.fileno(), right.fileno(), NONCE),
    )


def deadline():
    return time.monotonic_ns() // 1000000 + 1000


def frame(sequence=1, nonce=NONCE, message=None):
    body = json.dumps(
        {
            "schemaVersion": 1,
            "kind": "original-guest-control",
            "session": nonce,
            "sequence": sequence,
            "message": message or {"type": "command", "id": 1, "operation": "close"},
        }
    ).encode()
    return struct.pack(">I", len(body)) + body


def test_real_socket_roundtrip_preserves_zero_false_and_unicode():
    left, right, a, b = ports()
    try:
        a.send({"value": 0, "complete": False, "text": "é"}, deadline())
        assert b.receive(deadline()) == {"value": 0, "complete": False, "text": "é"}
        b.send({"ok": True}, deadline())
        assert a.receive(deadline()) == {"ok": True}
    finally:
        left.close()
        right.close()


def test_fragmented_original_frame_is_reassembled():
    left, right, a, _b = ports()
    raw = frame()

    def write():
        for byte in raw:
            right.send(bytes([byte]))
            time.sleep(0.0001)

    worker = threading.Thread(target=write)
    try:
        worker.start()
        assert a.receive(deadline())["operation"] == "close"
        worker.join()
    finally:
        left.close()
        right.close()


@pytest.mark.parametrize(
    "raw",
    [
        frame(nonce="b" * 64),
        frame(sequence=2),
        struct.pack(">I", 65537),
        struct.pack(">I", 0),
    ],
)
def test_foreign_sequence_nonce_or_frame_size_permanently_retires_port(raw):
    left, right, a, _b = ports()
    try:
        right.sendall(raw)
        with pytest.raises(
            ValueError, match=r"Original|Supported|Unexpected|Duplicate|Nonfinite"
        ):
            a.receive(deadline())
        with pytest.raises(ValueError, match="retired"):
            a.send({"ok": True}, deadline())
    finally:
        left.close()
        right.close()


def test_duplicate_json_keys_and_partial_eof_refuse():
    for raw in [b'{"schemaVersion":1,"schemaVersion":1}', b'{"incomplete"']:
        left, right, a, _b = ports()
        try:
            right.sendall(struct.pack(">I", len(raw) + 1) + raw)
            right.shutdown(socket.SHUT_WR)
            with pytest.raises((ValueError, EOFError)):
                a.receive(deadline())
        finally:
            left.close()
            right.close()
    left, right, a, _b = ports()
    try:
        raw = (
            b'{"schemaVersion":1,"schemaVersion":1,"kind":"original-guest-control","session":"'
            + NONCE.encode()
            + b'","sequence":1,"message":{}}'
        )
        right.sendall(struct.pack(">I", len(raw)) + raw)
        with pytest.raises(
            ValueError, match=r"Original|Supported|Unexpected|Duplicate|Nonfinite"
        ):
            a.receive(deadline())
    finally:
        left.close()
        right.close()


def test_deadline_does_not_wait_or_renew_a_missing_frame():
    left, right, a, _b = ports()
    try:
        with pytest.raises(TimeoutError):
            a.receive(time.monotonic_ns() // 1000000 + 10)
        with pytest.raises(ValueError, match="retired"):
            a.receive(deadline())
    finally:
        left.close()
        right.close()


def test_commands_allow_only_supported_capture_and_discovery_operations():
    assert (
        decode_guest_command(
            {"type": "command", "id": 1, "operation": "capture", "kind": "vpm"}
        )["kind"]
        == "vpm"
    )
    assert (
        decode_guest_command(
            {"type": "command", "id": 2, "operation": "discover", "scope": "root"}
        )["scope"]
        == "root"
    )
    assert (
        decode_guest_command(
            {
                "type": "command",
                "id": 3,
                "operation": "capture",
                "kind": "cri-logs",
                "containerId": "a" * 12,
            }
        )["containerId"]
        == "a" * 12
    )
    for value in [
        {"type": "command", "id": True, "operation": "close"},
        {"type": "command", "id": 1, "operation": "capture", "kind": "vpm; reboot"},
        {
            "type": "command",
            "id": 1,
            "operation": "capture",
            "kind": "vpm",
            "command": "shell",
        },
        {
            "type": "command",
            "id": 1,
            "operation": "capture",
            "kind": "cri-logs",
            "containerId": "a" * 12 + "; id",
        },
        {
            "type": "command",
            "id": 1,
            "operation": "capture",
            "kind": "vpm",
            "containerId": "a" * 12,
        },
        {"type": "command", "id": 1, "operation": "discover", "scope": "foreign"},
    ]:
        with pytest.raises(
            ValueError, match=r"Original|Supported|Unexpected|Duplicate|Nonfinite"
        ):
            decode_guest_command(value)


@pytest.mark.parametrize(
    ("field", "value"), [("operation", []), ("scope", {}), ("kind", {})]
)
def test_malformed_command_field_types_refuse(field, value):
    command = (
        {"type": "command", "id": 1, "operation": "discover", "scope": "root"}
        if field == "scope"
        else {"type": "command", "id": 1, "operation": "capture", "kind": "vpm"}
    )
    command[field] = value
    with pytest.raises(
        ValueError, match=r"Original|Supported|Unexpected|Duplicate|Nonfinite"
    ):
        decode_guest_command(command)


@pytest.mark.parametrize("schema", [True, 1.0, "1"])
def test_schema_must_be_an_integer_and_malformed_frame_retires_port(schema):
    left, right, a, _b = ports()
    try:
        value = json.loads(frame()[4:])
        value["schemaVersion"] = schema
        raw = json.dumps(value).encode()
        right.sendall(struct.pack(">I", len(raw)) + raw)
        with pytest.raises(ValueError, match="attribution"):
            a.receive(deadline())
        with pytest.raises(ValueError, match="retired"):
            a.send({"ok": True}, deadline())
    finally:
        left.close()
        right.close()
