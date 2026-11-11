"""Pinned original guest entrypoint refuses before opening real SSH."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest

from plugins.terraform.scripts import guest_entrypoint as entry
from plugins.terraform.scripts.gcp_guest_session import GuestBinding
from plugins.terraform.scripts.guest_control import GuestControlPort, clock_ms
from plugins.terraform.scripts.guest_pty import pinned, process_identity


def test_request_parser_rejects_duplicate_keys_nonfinite_numbers_and_boolean_budgets():
    for raw in (b'{"schemaVersion":1,"schemaVersion":1}', b'{"value":1e999}'):
        with pytest.raises(ValueError, match=r"Duplicate|Nonfinite"):
            entry.decode_request(raw)
    with pytest.raises(ValueError, match="budget"):
        entry.validate_budget(
            {
                "originalStartMs": True,
                "deadlines": [7200001, 7500001],
                "startupDeadlineMs": 2,
            },
            1,
        )


def test_private_request_hash_and_identity_are_required_before_source_loading(tmp_path):
    path = tmp_path / "request.private.json"
    path.write_text("{}")
    path.chmod(0o400)
    with pytest.raises(ValueError, match="request"):
        entry.read_request(path, "a" * 64)
    path.chmod(0o644)
    with pytest.raises(ValueError, match=r"private|owned"):
        entry.read_request(path, hashlib.sha256(path.read_bytes()).hexdigest())


def record(path):
    info = path.lstat()
    parent = path.parent.lstat()
    return {
        "path": str(path),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "expectedIdentity": entry.file_identity(info),
        "expectedParentIdentity": {
            key: entry.file_identity(parent)[key]
            for key in ("dev", "ino", "uid", "mode")
        },
    }


def configuration(tmp_path):
    scripts = tmp_path / "scripts"
    scripts.mkdir(mode=0o700)
    source = Path(entry.__file__).parent
    inputs = {}
    for filename in entry.SOURCE_FILES:
        destination = scripts / filename
        shutil.copyfile(source / filename, destination)
        destination.chmod(0o600)
        inputs["script:" + filename] = record(destination)
    python = Path(sys.executable).resolve()
    inputs["python"] = record(python)
    ssh = tmp_path / "ssh"
    shutil.copyfile("/usr/bin/ssh", ssh)
    ssh.chmod(0o700)
    inputs["ssh"] = record(ssh)
    for role in ("observer_key", "ce_key", "observer_hosts", "ce_hosts"):
        path = tmp_path / role
        path.write_text("EXAMPLE_ONLY")
        path.chmod(0o400)
        inputs[role] = record(path)
    node_name, site_name = "example-node", "example-site"
    binding = GuestBinding(
        project="example-project",
        region="us-central1",
        site_name="example-site",
        node_name="example-node",
        zone="us-central1-a",
        instance_id="123",
        observer_name="example-observer",
        observer_id="456",
        observer_address="192.0.2.1",
        address="192.0.2.2",
        original_interfaces=("192.0.2.3", "192.0.2.2"),
        token_node=node_name,
        token_site=site_name,
        token_expires=time.time() + 3600,
        token_sha256="a" * 64,
        ownership_sha256="b" * 64,
        observer_key=Path(inputs["observer_key"]["path"]),
        ce_key=Path(inputs["ce_key"]["path"]),
        observer_hosts=Path(inputs["observer_hosts"]["path"]),
        ce_hosts=Path(inputs["ce_hosts"]["path"]),
        observer_algorithm="ssh-ed25519",
        ce_algorithm="rsa-sha2-512",
    )
    ports = {}
    for role, filename in (("read", "request.fifo"), ("write", "response.fifo")):
        path = tmp_path / filename
        os.mkfifo(path, 0o600)
        info = entry.file_identity(path.lstat())
        ports[role] = {
            "path": str(path),
            "identity": {
                key: info[key] for key in ("dev", "ino", "uid", "mode", "nlink")
            },
        }
    start = clock_ms()
    request = {
        "schemaVersion": 1,
        "kind": "original-gcp-guest-worker",
        "nonce": "a" * 64,
        "inputs": inputs,
        "binding": binding._asdict(),
        "originalStartMs": start,
        "deadlines": [start + 7200000, start + 7500000],
        "startupDeadlineMs": start + 15000,
        "ports": {"root": str(tmp_path), **ports},
    }
    path = tmp_path / "request.private.json"
    path.write_text(json.dumps(request, default=str))
    path.chmod(0o400)
    return scripts / "guest_entrypoint.py", path, request


@pytest.mark.parametrize("approval", [False, 1, "guard-denied"])
def test_actual_isolated_worker_binds_request_and_rejects_false_approval_without_ssh(
    tmp_path,
    approval,
):
    script, path, request = configuration(tmp_path)
    read = os.open(request["ports"]["write"]["path"], os.O_RDWR | os.O_NONBLOCK)
    write = os.open(request["ports"]["read"]["path"], os.O_RDWR | os.O_NONBLOCK)
    interpreter = Path(sys.executable).resolve()
    pinned(interpreter, request["inputs"]["python"]["sha256"])
    pinned(script, request["inputs"]["script:guest_entrypoint.py"]["sha256"])
    with subprocess.Popen(  # noqa: S603 - owned interpreter and copied source pins verified above; fixed isolated argv.
        [
            str(Path(sys.executable).resolve()),
            "-I",
            "-B",
            str(script),
            "--request",
            str(path),
            "--sha256",
            hashlib.sha256(path.read_bytes()).hexdigest(),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ) as child:
        try:
            port = GuestControlPort(read, write, request["nonce"])
            bound = port.receive(clock_ms() + 5000)
            assert bound["type"] == "worker-bound"
            original = process_identity(child.pid)
            retained = json.loads(
                (tmp_path / "worker-identity.private.json").read_bytes()
            )
            assert retained["actor"] == original
            assert original["pid"] == original["group"] == child.pid
            assert retained["signalsSent"] is False
            assert retained["guestAcceptanceComplete"] is False
            assert (
                bound["requestSha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
            )
            port.send(
                {
                    "type": "binding-approved",
                    "requestSha256": bound["requestSha256"],
                    "anchor": bound["anchor"],
                    "approved": True if approval == "guard-denied" else approval,
                },
                clock_ms() + 1000,
            )
            if approval == "guard-denied":
                guard = port.receive(clock_ms() + 5000)
                assert guard["type"] == "guard"
                assert guard["guard"] == "inputs"
                assert guard["instanceId"] == "123"
                port.send(
                    {
                        "type": "guard-result",
                        "id": guard["id"],
                        "guard": guard["guard"],
                        "anchor": guard["anchor"],
                        "approved": False,
                    },
                    clock_ms() + 1000,
                )
            assert child.wait() != 0
            assert not (tmp_path / "guest").exists()
            assert (tmp_path / "worker-identity.private.json").exists()
        finally:
            os.close(read)
            os.close(write)
            child.wait()
            if child.stdout is not None:
                child.stdout.close()
            if child.stderr is not None:
                child.stderr.close()


def test_admitted_source_hash_and_parent_identity_cannot_be_replaced(tmp_path):
    path = tmp_path / "source.py"
    path.write_text("original = 1")
    path.chmod(0o600)
    admitted = record(path)
    wrong = dict(admitted, sha256="0" * 64)
    with pytest.raises(ValueError, match="bytes"):
        entry.verify_inputs({"source": wrong})
    wrong = dict(
        admitted,
        expectedParentIdentity={**admitted["expectedParentIdentity"], "ino": "0"},
    )
    with pytest.raises(ValueError, match="parent"):
        entry.verify_inputs({"source": wrong})


def test_captured_source_loader_uses_admitted_bytes_without_cached_or_disk_substitution(
    tmp_path,
):
    path = tmp_path / "source.py"
    path.write_text("value = 'foreign'")
    loader = entry.CapturedGuestSource(
        "original_fixture", str(path), b"value = 'original'"
    )
    code = loader.get_code("original_fixture")
    assert "original" in code.co_consts
    assert "foreign" not in code.co_consts
    with pytest.raises(ValueError, match="name"):
        loader.get_code("foreign_fixture")


def test_wrong_fifo_identity_refuses_before_descriptor_binding(tmp_path):
    path = tmp_path / "request.fifo"
    os.mkfifo(path, 0o600)
    fields = entry.file_identity(path.lstat())
    identity = {key: fields[key] for key in entry.PORT_FIELDS}
    identity["ino"] = "0"
    binding = {"path": str(path), "identity": identity}
    with pytest.raises(ValueError, match="identity"):
        entry.open_port(binding, path, os.O_RDONLY)
