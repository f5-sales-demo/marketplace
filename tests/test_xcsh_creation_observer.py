"""Original xcsh process/sink evidence; real cooperative children, no cloud calls."""

import copy
import hashlib
import json
import os
import select
import stat
import subprocess
import sys
import time
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

import pytest

from plugins.terraform.scripts import guest_pty, xcsh_creation_observer as module
from plugins.terraform.scripts.gcp_provider_process import PinnedExecutable

CHILD = r"""
import hashlib,json,os,pathlib,sys
scope_path=pathlib.Path(sys.argv[1]);raw=scope_path.read_bytes();scope=json.loads(raw)
root=pathlib.Path(scope["directory"]);fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY)
exe=pathlib.Path("/proc/self/exe");st=exe.stat()
fields=pathlib.Path("/proc/self/stat").read_text().split(") ",1)[1].split()
process={"pid":os.getpid(),"parent_pid":os.getppid(),"start_ticks":fields[19],
"boot_id_sha256":hashlib.sha256(pathlib.Path("/proc/sys/kernel/random/boot_id").read_bytes()).hexdigest(),
"executable_sha256":hashlib.sha256(exe.read_bytes()).hexdigest(),
"executable_device":st.st_dev,"executable_inode":st.st_ino}
for target in scope["resources"]:
 target={key:target[key] for key in ("type_name","name","namespace")}
 target_hash=hashlib.sha256(json.dumps(target,separators=(",",":")).encode()).hexdigest()
 claim={"schema_version":1,"scope_sha256":scope["scope_sha256"],
 "scope_file_sha256":hashlib.sha256(raw).hexdigest(),"target":target,"process":process,"nonce":target_hash[:32]}
 receipt={**claim,"creation_identity_sha256":hashlib.sha256(("synthetic-original-uid-"+target["name"]).encode()).hexdigest()}
 claim_name="claim-"+target_hash+".json"
 for name,value in [(claim_name,claim),("identity-"+receipt["creation_identity_sha256"]+".json",receipt),("receipt-"+receipt["nonce"]+".json",receipt)]:
  p=root/name
  if not p.exists():
   with p.open("x") as f:json.dump(value,f)
   p.chmod(0o400)
print("ready",flush=True)
for line in sys.stdin:
 if line.strip()=="closefd" and fd is not None:os.close(fd);fd=None
 print("ready",flush=True)
if fd is not None:os.close(fd)
"""

PARENT = r"""
import json,subprocess,sys
def spawn():
 p=subprocess.Popen([sys.executable,"-I","-B","-c",sys.argv[2],sys.argv[1]],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 assert p.stdout.readline()==b"ready\n"
 print(json.dumps({"parent":p.pid and __import__("os").getpid(),"child":p.pid}),flush=True)
 return p
child=spawn()
for line in sys.stdin:
 if line.strip()=="replace":
  child.stdin.close();assert child.wait(timeout=15)==0;child=spawn()
 else:
  child.stdin.write(line.encode());child.stdin.flush();assert child.stdout.readline()==b"ready\n"
  print(json.dumps({"child":child.pid}),flush=True)
child.stdin.close();assert child.wait(timeout=15)==0
"""


@pytest.fixture
def original(tmp_path, request):
    sink = tmp_path / "sink"
    sink.mkdir(mode=0o700)
    exe = Path(sys.executable).resolve()
    digest = hashlib.sha256(exe.read_bytes()).hexdigest()
    target = {"type_name": "xcsh_token", "name": "example-token", "namespace": "system"}
    targets = [target]
    profile = getattr(request, "param", "single")
    if profile in ("two", "partial"):
        targets.append(
            {
                "type_name": "xcsh_securemesh_site_v2",
                "name": "example-site",
                "namespace": "system",
            }
        )
    body = CHILD
    if profile == "partial":
        body = body.replace(
            'for target in scope["resources"]:', 'for target in scope["resources"][:1]:'
        )
    scope = {
        "schema_version": 1,
        "scope_sha256": "b" * 64,
        "directory": str(sink),
        "provider_executable_sha256": digest,
        "resources": targets,
    }
    path = tmp_path / "scope.json"
    path.write_text(json.dumps(scope))
    path.chmod(0o400)
    parent = subprocess.Popen(  # noqa: S603 - pinned interpreter and fixed cooperative fixture.
        [str(exe), "-I", "-B", "-c", PARENT, str(path), body],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    )
    try:
        assert select.select([parent.stdout], [], [], 15)[0]
        row = json.loads(parent.stdout.readline())
        checks = []
        clock = [time.monotonic_ns() // 1000000]
        observer = module.OriginalXcshCreationObserver(
            tmp_path / "captures",
            guest_pty.process_identity(parent.pid),
            terraform=PinnedExecutable(exe, digest),
            xcsh=PinnedExecutable(exe, digest),
            scope_file=path,
            scope_file_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
            plan_sha256="b" * 64,
            targets=targets,
            assert_inputs=lambda: checks.append(True),
            original_deadline_ms=clock[0] + 7200000,
            clock=lambda: clock[0],
        )
        yield {
            "observer": observer,
            "parent": parent,
            "row": row,
            "sink": sink,
            "scope": path,
            "checks": checks,
            "clock": clock,
        }
    finally:
        parent.stdin.close()
        assert parent.wait(timeout=15) == 0
        parent.stdout.close()
        parent.stderr.close()


def request(original, command):
    parent = original["parent"]
    parent.stdin.write((command + "\n").encode())
    parent.stdin.flush()
    assert select.select([parent.stdout], [], [], 15)[0]
    return json.loads(parent.stdout.readline())


def witness(original):
    result = original["observer"].observe()
    assert not result.incomplete_pids
    assert len(result.witnesses) == 1
    return result.witnesses[0]


def rewrite(path, change):
    value = json.loads(path.read_text())
    change(value)
    path.chmod(0o600)
    path.write_text(json.dumps(value))
    path.chmod(0o400)


def test_real_original_xcsh_process_sink_claim_and_receipt_join(original):
    token = witness(original)
    result = original["observer"].join(token)
    assert len(result) == 1
    assert result[0]["process"]["pid"] == original["row"]["child"]
    assert result[0]["target"]["type_name"] == "xcsh_token"
    assert len(original["checks"]) >= 4
    evidence = list(original["observer"].root.glob("*.private.json"))
    assert evidence


def test_missing_sink_descriptor_is_incomplete_not_an_authenticated_witness(original):
    request(original, "closefd")
    result = original["observer"].observe()
    assert not result.witnesses
    assert result.incomplete_pids == (original["row"]["child"],)


def test_plain_json_and_copied_witness_do_not_grant_original_admission(original):
    token = witness(original)
    for fake in ({"pid": original["row"]["child"]}, copy.copy(token)):
        with pytest.raises(ValueError, match="issued"):
            original["observer"].join(fake)


def test_process_replacement_cannot_adopt_original_claims(original):
    witness(original)
    request(original, "replace")
    with pytest.raises(ValueError, match="Original"):
        original["observer"].observe()
    assert list(original["observer"].root.glob("failure-*.private.json"))


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("scope_sha256", "c" * 64),
        ("scope_file_sha256", "c" * 64),
        ("nonce", "invalid"),
        ("schema_version", 2),
        ("schema_version", True),
    ],
)
def test_changed_claim_or_receipt_cannot_join(original, field, value):
    token = witness(original)
    receipt = next(original["sink"].glob("receipt-*.json"))
    rewrite(receipt, lambda data: data.update({field: value}))
    with pytest.raises(ValueError, match="Original"):
        original["observer"].join(token)


def test_unknown_and_duplicate_json_fields_refuse_capture(original):
    token = witness(original)
    receipt = next(original["sink"].glob("receipt-*.json"))
    receipt.chmod(0o600)
    receipt.write_text(receipt.read_text().replace("{", '{"nonce":"a",', 1))
    receipt.chmod(0o400)
    with pytest.raises(ValueError, match="Original"):
        original["observer"].join(token)


@pytest.mark.parametrize(
    "case",
    ["identity", "nonce", "target", "process", "truncated", "hardlink", "symlink"],
)
def test_foreign_malformed_or_replaced_receipt_is_refused(original, case):
    token = witness(original)
    receipt = next(original["sink"].glob("receipt-*.json"))
    if case == "identity":
        rewrite(receipt, lambda data: data.update(creation_identity_sha256="c" * 64))
    elif case == "nonce":
        rewrite(receipt, lambda data: data.update(nonce="c" * 32))
    elif case == "target":
        rewrite(receipt, lambda data: data["target"].update(name="foreign-token"))
    elif case == "process":
        rewrite(
            receipt, lambda data: data["process"].update(pid=data["process"]["pid"] + 1)
        )
    elif case == "truncated":
        receipt.chmod(0o600)
        receipt.write_text('{"schema_version":')
        receipt.chmod(0o400)
    elif case == "hardlink":
        os.link(receipt, original["sink"].parent / "extra-link")
    else:
        saved = original["sink"].parent / "saved-receipt"
        receipt.rename(saved)
        receipt.symlink_to(saved)
    with pytest.raises(ValueError, match="Original"):
        original["observer"].join(token)


def test_changed_scope_sink_and_guard_remain_refused(original):
    token = witness(original)
    original["scope"].chmod(0o600)
    original["scope"].write_text(original["scope"].read_text() + " ")
    original["scope"].chmod(0o400)
    with pytest.raises(ValueError, match="Original"):
        original["observer"].join(token)
    with pytest.raises(ValueError, match="retired"):
        original["observer"].observe()


def test_stale_witness_and_exhausted_execution_budget_cannot_renew(original):
    token = witness(original)
    original["clock"][0] += 300001
    with pytest.raises(ValueError, match="fresh"):
        original["observer"].join(token)


def test_execution_observation_refuses_original_deadline(original):
    original["clock"][0] += 7200000
    with pytest.raises(ValueError, match="budget"):
        original["observer"].observe()


def test_terminal_read_join_does_not_require_or_restart_exited_provider(original):
    token = witness(original)
    parent = original["parent"]
    parent.stdin.close()
    assert parent.wait(timeout=15) == 0
    assert len(original["observer"].join(token)) == 1


def test_receipt_changed_after_read_cannot_be_accepted(original):
    token = witness(original)
    real_read = module.read_owned
    altered = []

    def replaced(path, *args, **kwargs):
        raw = real_read(path, *args, **kwargs)
        if path.name.startswith("receipt-") and not altered:
            altered.append(True)
            rewrite(path, lambda data: data.update(nonce="c" * 32))
        return raw

    with (
        patch.object(module, "read_owned", side_effect=replaced),
        pytest.raises(ValueError, match="Original"),
    ):
        original["observer"].join(token)


@pytest.mark.parametrize(
    "field", ["pid", "parent_pid", "executable_device", "executable_inode"]
)
def test_process_numeric_fields_cannot_use_equal_float_values(original, field):
    claim = next(original["sink"].glob("claim-*.json"))
    rewrite(
        claim,
        lambda data: data["process"].update({field: float(data["process"][field])}),
    )
    with pytest.raises(ValueError, match="Original"):
        original["observer"].observe()


def test_unknown_receipt_fields_are_not_ignored(original):
    token = witness(original)
    receipt = next(original["sink"].glob("receipt-*.json"))
    rewrite(receipt, lambda data: data.update(extra="unexpected"))
    with pytest.raises(ValueError, match="Original"):
        original["observer"].join(token)


def test_missing_identity_reservation_is_incomplete_capture(original):
    token = witness(original)
    next(original["sink"].glob("identity-*.json")).unlink()
    with pytest.raises(ValueError, match="Original"):
        original["observer"].join(token)


def test_scope_guard_failure_is_retained_and_retires_observer(original):
    token = witness(original)

    def failed():
        message = "Original input changed"
        raise ValueError(message)

    original["observer"].assert_inputs = failed
    with pytest.raises(ValueError, match="Original input changed"):
        original["observer"].join(token)
    assert list(original["observer"].root.glob("failure-*.private.json"))


def test_replaced_sink_directory_cannot_adopt_original_descriptors(original):
    token = witness(original)
    sink = original["sink"]
    sink.rename(sink.with_name("retained-original-sink"))
    sink.mkdir(mode=0o700)
    with pytest.raises(ValueError, match="Original"):
        original["observer"].join(token)


@pytest.mark.parametrize("original", ["two"], indirect=True)
def test_complete_scope_requires_both_original_site_and_token(original):
    result = original["observer"].complete([witness(original)])
    assert {r["target"]["type_name"] for r in result} == {
        "xcsh_token",
        "xcsh_securemesh_site_v2",
    }


@pytest.mark.parametrize("original", ["partial"], indirect=True)
def test_token_only_capture_cannot_qualify_a_site_and_token_plan(original):
    with pytest.raises(ValueError, match="coverage"):
        original["observer"].complete([witness(original)])


def test_empty_capture_cannot_claim_complete_scope(original):
    with pytest.raises(ValueError, match="coverage"):
        original["observer"].complete([])


def test_orphan_identity_reservation_refuses_complete_capture(original):
    token = witness(original)
    reservation = next(original["sink"].glob("identity-*.json"))
    orphan = original["sink"] / ("identity-" + "c" * 64 + ".json")
    orphan.write_bytes(reservation.read_bytes())
    orphan.chmod(0o400)
    with pytest.raises(ValueError, match="inventory"):
        original["observer"].complete([token])


def test_repeated_original_observations_do_not_duplicate_target_evidence(original):
    first = witness(original)
    second = witness(original)
    assert len(original["observer"].complete([first, second])) == 1


def test_complete_scope_still_refuses_a_copied_witness(original):
    token = witness(original)
    with pytest.raises(ValueError, match="issued"):
        original["observer"].complete([copy.copy(token)])


def test_legitimate_directory_timestamp_changes_do_not_replace_original_sink(original):
    real_identity = module.identity
    timestamps = []

    def changing_directory_metadata(value):
        output = real_identity(value)
        if stat.S_ISDIR(value.st_mode):
            timestamps.append(True)
            output["mtimeNs"] = str(len(timestamps))
        return output

    with patch.object(module, "identity", side_effect=changing_directory_metadata):
        assert witness(original)


def test_descriptor_denial_retains_timed_incomplete_diagnostics(original):
    real_iterdir = Path.iterdir
    original_fd_directory = Path("/proc") / str(original["row"]["child"]) / "fd"

    def denied(path):
        if path == original_fd_directory:
            raise PermissionError(13, "fixture denial", str(path))
        return real_iterdir(path)

    with (
        patch.object(Path, "iterdir", denied),
        pytest.raises(PermissionError),
    ):
        original["observer"].observe()
    failed = json.loads(
        next(original["observer"].root.glob("failure-*.private.json")).read_text()
    )
    diagnostic = failed["descriptorAccessFailure"]
    assert diagnostic["errno"] == 13
    assert not diagnostic["identityQualified"]
    assert not diagnostic["samplingComplete"]
    assert diagnostic["stateAtDenial"] == "unknown"
    assert not diagnostic["signalsSent"]


def test_candidate_exit_before_witness_is_retained_and_never_counted(original):
    observer = original["observer"]
    candidate = observer.monitor.discover()[0]
    with (
        patch.object(observer.monitor, "discover", return_value=(candidate,)),
        patch.object(observer.monitor, "capture", side_effect=FileNotFoundError),
    ):
        observation = observer.observe()
    assert observation.witnesses == ()
    assert observation.incomplete_pids == (candidate.pid,)
    assert not observer.retired
    assert not observer.monitor.retired
    retained = list(observer.root.glob("candidate-unavailable-*.private.json"))
    assert len(retained) == 1
    evidence = json.loads(retained[0].read_text())
    assert evidence["pid"] == candidate.pid
    assert evidence["executionAuthorized"] is False
    assert evidence["creationQualified"] is False
    # A fresh original live process/sink/claim join is still required for each target.
    complete = observer.observe()
    assert len(complete.witnesses) == 1
    assert len(observer.complete(complete.witnesses)) == 1


def test_candidate_identity_change_before_witness_still_refuses(original):
    observer = original["observer"]
    candidate = observer.monitor.discover()[0]
    changed = replace(candidate, start=str(int(candidate.start) + 1))
    with (
        patch.object(observer.monitor, "discover", return_value=(candidate,)),
        patch.object(observer.monitor, "capture", return_value=changed),
        pytest.raises(ValueError, match="changed"),
    ):
        observer.observe()
    assert observer.retired
    assert observer.monitor.retired


def test_owned_sink_before_first_claim_remains_incomplete(original):
    observer = original["observer"]
    with patch.object(Path, "glob", return_value=iter(())):
        pending = observer.observe()
    assert pending.witnesses == ()
    assert pending.incomplete_pids == (original["row"]["child"],)
    assert not observer.retired
    assert not observer.witnesses
    retained = list(observer.root.glob("claim-pending-*.private.json"))
    assert len(retained) == 1
    evidence = json.loads(retained[0].read_text())
    assert evidence["creationQualified"] is False
    assert evidence["executionAuthorized"] is False
    fresh = observer.observe()
    assert len(fresh.witnesses) == 1
    assert len(observer.complete(fresh.witnesses)) == 1
