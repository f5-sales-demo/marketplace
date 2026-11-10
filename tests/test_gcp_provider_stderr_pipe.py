"""Independent provider stderr FIFO ownership; cooperative fixtures only."""

import hashlib
import json
import select
import subprocess
import sys
from pathlib import Path
from typing import IO

import pytest

from plugins.terraform.scripts import gcp_provider_process as module, guest_pty as pty

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
