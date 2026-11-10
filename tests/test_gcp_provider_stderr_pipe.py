"""Independent provider stderr FIFO ownership; cooperative fixtures only."""

import hashlib
import importlib.util
import json
import os
import py_compile
import select
import subprocess
import sys
from pathlib import Path
from typing import IO, cast

import pytest

from plugins.terraform.scripts import (
    gcp_provider_process as module,
    gcp_provider_reader as reader,
    guest_pty as pty,
)

BODY = r"""import json,os,subprocess,sys
children=[]
duplicates=[]
def spawn():
 body="import os,sys\nfor command in sys.stdin:\n if command.strip()=='redirect':\n  fd=os.open(os.devnull,os.O_WRONLY);os.dup2(fd,2);os.close(fd)\n print('done',flush=True)\n"
 child=subprocess.Popen([sys.executable,'-I','-B','-c',body],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 children.append(child)
 print(json.dumps({'parent':os.getpid(),'child':child.pid}),flush=True)
spawn()
for line in sys.stdin:
 command=line.strip()
 if command=='redirect':
  children[0].stdin.write(b'redirect\n');children[0].stdin.flush();children[0].stdout.readline()
 elif command=='duplicate':duplicates.append(os.dup(children[0].stderr.fileno()))
 elif command=='close-reader':children[0].stderr.close()
 elif command=='replace':
  children[0].stdin.close();children[0].wait();children[0].stdout.close();children[0].stderr.close();children.pop(0);spawn();continue
 print(json.dumps({'parent':os.getpid(),'child':children[0].pid}),flush=True)
for child in children:
 child.stdin.close();child.wait();child.stdout.close();child.stderr.close()
for fd in duplicates:os.close(fd)
"""


def pipe(value: IO[bytes] | None) -> IO[bytes]:
    """Require an explicitly owned fixture pipe."""
    assert value is not None
    return value


@pytest.fixture
def original(tmp_path: Path):
    """Own one executor and child; close them through cooperative EOF."""
    executable = Path(sys.executable).resolve()
    digest = hashlib.sha256(executable.read_bytes()).hexdigest()
    pty.pinned(executable, digest)
    with subprocess.Popen(  # noqa: S603 - pinned executable and constant fixture only.
        [str(executable), "-I", "-B", "-c", BODY],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    ) as parent:
        try:
            assert select.select([pipe(parent.stdout)], [], [], 15)[0]
            row = json.loads(pipe(parent.stdout).readline())
            identity = pty.process_identity(row["parent"])
            monitor = module.OriginalProviderCandidates(
                tmp_path / "evidence",
                identity,
                executables=module.ProviderExecutables(
                    module.PinnedExecutable(executable, digest),
                    module.PinnedExecutable(executable, digest),
                ),
                assert_inputs=lambda: None,
            )

            def command(value: str):
                pipe(parent.stdin).write((value + "\n").encode())
                pipe(parent.stdin).flush()
                assert select.select([pipe(parent.stdout)], [], [], 15)[0]
                return json.loads(pipe(parent.stdout).readline())

            yield monitor, command, row, tmp_path / "evidence"
        finally:
            pipe(parent.stdin).close()
            assert parent.wait(timeout=15) == 0
            pipe(parent.stdout).close()
            pipe(parent.stderr).close()


def test_original_stderr_fifo_has_exact_provider_writer_and_parent_reader(original):
    """Kernel FIFO identity binds both ends to the admitted original actors."""
    monitor, _, row, root = original
    candidate = monitor.discover()[0]
    witness = monitor.capture_stderr(candidate)
    assert witness.provider is candidate
    assert witness.provider.pid == row["child"]
    assert witness.parent_fd >= 3
    assert witness.inode > 0
    monitor.require_stderr(witness)
    receipts = list(root.glob("stderr-pipe-*.private.json"))
    assert receipts
    receipt = json.loads(receipts[0].read_text())
    assert receipt["provider"]["pid"] == candidate.pid
    assert receipt["executor"]["pid"] == row["parent"]
    assert receipt["providerFd"] == 2
    assert receipt["pipeIdentity"]["ino"] == str(witness.inode)
    assert not receipt["applyPhaseQualified"]
    assert not receipt["signalsSent"]


def test_duplicated_parent_read_descriptors_are_ambiguous(original):
    """Do not choose the first of two equally matching read ends."""
    monitor, command, _, _ = original
    candidate = monitor.discover()[0]
    command("duplicate")
    with pytest.raises(ValueError, match="ambiguous"):
        monitor.capture_stderr(candidate)


def test_provider_stderr_redirection_retires_original_witness(original):
    """An unchanged PID cannot hide replacement of its stderr descriptor."""
    monitor, command, _, root = original
    witness = monitor.capture_stderr(monitor.discover()[0])
    command("redirect")
    with pytest.raises(ValueError, match="stderr"):
        monitor.require_stderr(witness)
    assert list(root.glob("failure-*.private.json"))
    with pytest.raises(ValueError, match="retired"):
        monitor.capture_stderr(witness.provider)


def test_missing_parent_reader_cannot_be_accepted_as_closed_provider(original):
    """Descriptor loss is a failure while the original provider remains live."""
    monitor, command, _, _ = original
    witness = monitor.capture_stderr(monitor.discover()[0])
    command("close-reader")
    with pytest.raises(ValueError, match="stderr"):
        monitor.require_stderr(witness)


def test_replacement_and_cloned_witness_cannot_receive_original_authority(original):
    """Only a source-issued capability can be reinspected, with its original PID."""
    monitor, command, _, _ = original
    witness = monitor.capture_stderr(monitor.discover()[0])
    clone = module.ProviderStderrPipe(
        witness.provider,
        witness.parent_fd,
        witness.device,
        witness.inode,
        witness.provider_flags,
        witness.parent_flags,
    )
    with pytest.raises(ValueError, match="admitted"):
        monitor.require_stderr(clone)
    command("replace")
    with pytest.raises(ValueError, match="Original provider"):
        monitor.require_stderr(witness)


def test_changed_inputs_during_pipe_capture_remain_failed(original):
    """Never excuse changed original inputs with matching pipe metadata."""
    monitor, _, _, root = original
    candidate = monitor.discover()[0]
    monitor.assert_inputs = lambda: (_ for _ in ()).throw(
        ValueError("original input changed")
    )
    with pytest.raises(ValueError, match="input changed"):
        monitor.capture_stderr(candidate)
    assert list(root.glob("failure-*.private.json"))


def test_bounded_window_retains_original_fifo_and_ready_before_sampling(original):
    """A ready observer must retain exact source-issued pipe candidates."""
    monitor, _, row, _ = original
    events: list[dict[str, object]] = []
    tick = [1000]
    result = reader.capture_stderr_window(
        monitor,
        deadline=46000,
        verify=lambda: None,
        emit=events.append,
        clock=lambda: tick[0],
        pause=lambda: tick.__setitem__(0, 46000),
    )
    assert events[0]["kind"] == "ready"
    assert events[0]["windowStartedMs"] == 1000
    assert events[0]["windowDeadlineMs"] == 46000
    assert result["samplingWindowComplete"]
    assert result["executorAvailable"]
    assert not result["executorGroupClosed"]
    assert len(result["observations"]) == 1
    observation = result["observations"][0]
    assert observation["candidate"]["pid"] == row["child"]
    assert observation["stderr"]["providerFd"] == 2
    assert observation["stderr"]["parentFd"] >= 3
    assert observation["firstObservedMs"] == 1000
    assert observation["lastObservedMs"] == 1000
    assert observation["presentAtLastSample"]


def test_window_keeps_both_original_providers_without_latest_pid_selection(original):
    """Natural replacement is another observation, never adoption as original RPC."""
    monitor, command, row, _ = original
    tick = [1000]
    calls = [0]
    replacement = []

    def pause():
        calls[0] += 1
        if calls[0] == 1:
            replacement.append(command("replace")["child"])
            tick[0] = 1100
        else:
            tick[0] = 46000

    result = reader.capture_stderr_window(
        monitor,
        deadline=46000,
        verify=lambda: None,
        emit=lambda _value: None,
        clock=lambda: tick[0],
        pause=pause,
    )
    assert {item["candidate"]["pid"] for item in result["observations"]} == {
        row["child"],
        replacement[0],
    }
    assert not result["observations"][0]["presentAtLastSample"]
    assert result["observations"][1]["presentAtLastSample"]


def test_window_input_change_retains_partial_capture_without_ready_replay(original):
    """Failure retains the completed first observation and cannot become success."""
    monitor, _, _, _ = original
    events: list[dict[str, object]] = []

    def emit(value):
        events.append(value)
        if value["kind"] == "sample":
            message = "source callback changed"
            raise ValueError(message)

    with pytest.raises(ValueError, match="callback changed"):
        reader.capture_stderr_window(
            monitor,
            deadline=46000,
            verify=lambda: None,
            emit=emit,
            clock=lambda: 1000,
            pause=lambda: None,
        )
    assert [value["kind"] for value in events] == ["ready", "sample", "failed"]
    assert (
        len(cast("list[reader.ProviderWindowObservation]", events[-1]["observations"]))
        == 1
    )
    assert not events[-1]["samplingWindowComplete"]


def test_window_refuses_duplicate_reader_after_original_sample(original):
    """A later duplicate read end cannot inherit the original pipe witness."""
    monitor, command, _, _ = original
    tick = [1000]
    events: list[dict[str, object]] = []

    def pause():
        command("duplicate")
        tick[0] = 1100

    with pytest.raises(ValueError, match="ambiguous"):
        reader.capture_stderr_window(
            monitor,
            deadline=46000,
            verify=lambda: None,
            emit=events.append,
            clock=lambda: tick[0],
            pause=pause,
        )
    assert events[-1]["kind"] == "failed"
    assert not events[-1]["samplingWindowComplete"]


def test_window_deadline_exhaustion_cannot_reset_observation_budget(original):
    """No ready event can be emitted after the original deadline."""
    monitor, _, _, _ = original
    events: list[dict[str, object]] = []
    with pytest.raises(ValueError, match="budget"):
        reader.capture_stderr_window(
            monitor,
            deadline=1000,
            verify=lambda: None,
            emit=events.append,
            clock=lambda: 1000,
            pause=lambda: None,
        )
    assert not events


def test_window_profile_requires_fixed_versioned_bounds():
    """Legacy requests retain their shape; window requests cannot extend commands."""
    assert reader.provider_request_profile({"schemaVersion": 1}) == "cohort"
    assert (
        reader.provider_request_profile(
            {
                "schemaVersion": 2,
                "kind": "original-provider-stderr-window",
                "windowMs": 45000,
            }
        )
        == "stderr-window"
    )
    invalid: list[dict[str, object]] = [
        {"schemaVersion": True},
        {"schemaVersion": 1, "windowMs": 45000},
        {
            "schemaVersion": 2,
            "kind": "original-provider-stderr-window",
            "windowMs": 60001,
        },
        {"schemaVersion": 2, "kind": "foreign", "windowMs": 45000},
        {
            "schemaVersion": 2,
            "kind": "original-provider-stderr-window",
            "windowMs": True,
        },
    ]
    for value in invalid:
        with pytest.raises(ValueError, match="Original provider"):
            reader.provider_request_profile(value)


def test_verified_reader_does_not_execute_unadmitted_cached_bytecode(tmp_path: Path):
    """Timestamp-matching cached code cannot replace the admitted source bytes."""
    scripts = tmp_path / "source"
    scripts.mkdir(mode=0o700)
    for name in ["__init__.py", "guest_pty.py", "gcp_provider_process.py"]:
        path = scripts / name
        path.write_text("source_witness = False\n")
        cached = Path(importlib.util.cache_from_source(str(path)))
        cached.parent.mkdir(mode=0o700, exist_ok=True)
        stamp = path.stat()
        py_compile.compile(
            str(path),
            cfile=str(cached),
            doraise=True,
            invalidation_mode=py_compile.PycInvalidationMode.TIMESTAMP,
        )
        path.write_text("source_witness = True \n")
        os.utime(path, ns=(stamp.st_atime_ns, stamp.st_mtime_ns))
    legacy = importlib.util.spec_from_file_location(
        "cached_source_example", scripts / "gcp_provider_process.py"
    )
    assert legacy is not None
    assert legacy.loader is not None
    cached_module = importlib.util.module_from_spec(legacy)
    legacy.loader.exec_module(cached_module)
    assert not cached_module.source_witness
    monitor, transport = reader.load_reader_modules(scripts)
    assert monitor.source_witness
    assert transport.source_witness
