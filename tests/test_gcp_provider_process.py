"""Original provider candidate process tests; no cloud calls or process signals."""

import hashlib
import json
import select
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from typing import IO, NoReturn
from unittest.mock import patch

import pytest

from plugins.terraform.scripts import (
    gcp_provider_process as module,
    gcp_provider_reader as reader,
    guest_pty as pty,
)

SCRIPTS = Path(__file__).resolve().parents[1] / "plugins/terraform/scripts"

BODY = "import json,os,subprocess,sys\nchildren=[]\ndef spawn():\n child=subprocess.Popen([sys.executable,'-I','-B','-c','import sys; sys.stdin.buffer.read()'],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)\n children.append(child)\n print(json.dumps({'parent':os.getpid(),'child':child.pid}),flush=True)\nspawn()\nfor line in sys.stdin:\n if line.strip()=='replace':\n  children[0].stdin.close();children[0].wait();children.pop(0);spawn()\n elif line.strip()=='extra':spawn()\n elif line.startswith('reader-main '):\n  import importlib.util,hashlib\n  path,checksum=line.strip().split()[1:]\n  spec=importlib.util.spec_from_file_location('reader_main',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)\n  # Offline fixture pins only; this does not qualify the published Go provider.\n  checksum_exe=hashlib.sha256(open(sys.executable,'rb').read()).hexdigest()\n  module.PINS={key:checksum_exe for key in module.PINS}\n  sys.argv=['gcp_provider_reader.py','--request',path,'--sha256',checksum]\n  module.main()\n  print(json.dumps({'parent':os.getpid(),'child':children[0].pid}),flush=True)\n elif line.strip()=='reader-session':\n  import importlib.util\n  spec=importlib.util.spec_from_file_location('reader_session',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)\n  module.ensure_reader_session()\n  print(json.dumps({'parent':os.getpid(),'session':os.getsid(0),'group':os.getpgrp()}),flush=True)\nfor child in children:\n child.stdin.close();child.wait()\n"


def original_pipe(value: IO[bytes] | None) -> IO[bytes]:
    """Require the original explicitly piped fixture descriptor."""
    if value is None:
        message = "Original fixture process pipe unavailable"
        raise RuntimeError(message)
    return value


class ProviderProcessTests(unittest.TestCase):
    """Exercise real original process ownership with cooperative EOF closure."""

    def setUp(self) -> None:
        """Start a bounded original fixture and admit its real process identity."""
        self.root = Path(tempfile.mkdtemp(prefix="ce-provider-process-"))
        self.exe = Path(sys.executable).resolve()
        self.sha = hashlib.sha256(self.exe.read_bytes()).hexdigest()
        self.parents: list[subprocess.Popen[bytes]] = []
        self.parent, self.row = self.spawn_parent()
        self.original = pty.process_identity(self.row["parent"])
        self.checks = 0
        self.monitor = module.OriginalProviderCandidates(
            self.root / "captures",
            self.original,
            terraform=self.exe,
            terraform_sha256=self.sha,
            provider=self.exe,
            provider_sha256=self.sha,
            assert_inputs=self.guard,
        )

    def guard(self) -> None:
        """Record original input guard calls."""
        self.checks += 1

    def spawn_parent(self) -> tuple[subprocess.Popen[bytes], dict[str, int]]:
        """Start only the pinned original Python fixture and retain its child."""
        pty.pinned(self.exe, self.sha)
        child = subprocess.Popen(  # noqa: S603 - fixed original executable and constant fixture bytes; pinned above.
            [
                str(self.exe),
                "-I",
                "-B",
                "-c",
                BODY,
                str(SCRIPTS / "gcp_provider_reader.py"),
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
        )
        self.parents.append(child)
        if not select.select([original_pipe(child.stdout)], [], [], 15)[0]:
            msg = "Original fixture startup exhausted"
            raise RuntimeError(msg)
        return (child, json.loads(original_pipe(child.stdout).readline()))

    def request(self, command: str) -> dict[str, int]:
        """Send a cooperative fixture command without using process signals."""
        original_pipe(self.parent.stdin).write((command + "\n").encode())
        original_pipe(self.parent.stdin).flush()
        if not select.select([original_pipe(self.parent.stdout)], [], [], 15)[0]:
            msg = "Original fixture command exhausted"
            raise RuntimeError(msg)
        return json.loads(original_pipe(self.parent.stdout).readline())

    def tearDown(self) -> None:
        """Close original stdin and require natural fixture exits."""
        for parent in self.parents:
            original_pipe(parent.stdin).close()
            assert parent.wait(timeout=15) == 0
            original_pipe(parent.stdout).close()
            original_pipe(parent.stderr).close()

    def test_actual_original_child_has_independent_kernel_sdk_and_executable_witnesses(
        self,
    ) -> None:
        """Verify actual original child has independent kernel sdk and executable witnesses."""
        candidates = self.monitor.discover()
        assert len(candidates) == 1
        original = candidates[0]
        assert original.pid == self.row["child"]
        assert original.group == self.original["group"]
        self.monitor.require(original)
        assert self.checks >= 4
        receipts = list((self.root / "captures").glob("*.private.json"))
        assert len(receipts) >= 2
        data = json.loads(receipts[0].read_text())
        assert data["providerSha256"] == self.sha
        assert not data["applyPhaseQualified"]

    def test_multiple_candidates_are_preserved_without_selecting_the_first(
        self,
    ) -> None:
        """Verify multiple candidates are preserved without selecting the first."""
        self.request("extra")
        assert len(self.monitor.discover()) == 2

    def test_replacement_cannot_receive_an_original_candidate(self) -> None:
        """Verify replacement cannot receive an original candidate."""
        original = self.monitor.discover()[0]
        replacement = self.request("replace")
        assert replacement["child"] != original.pid
        with pytest.raises(ValueError, match="Original provider"):
            self.monitor.require(original)

    def test_foreign_group_and_cloned_candidate_cannot_be_adopted(self) -> None:
        """Verify foreign group and cloned candidate cannot be adopted."""
        _, foreign = self.spawn_parent()
        candidate = self.monitor.discover()[0]
        clone = module.ProviderCandidate(
            candidate.pid,
            candidate.group,
            candidate.start,
            candidate.boot,
            candidate.parent,
            candidate.executable_sha256,
        )
        with pytest.raises(ValueError, match="admitted"):
            self.monitor.require(clone)
        assert foreign["child"] not in [value.pid for value in self.monitor.discover()]

    def test_changed_inputs_retire_capture_without_hiding_prior_receipts(self) -> None:
        """Verify changed inputs retire capture without hiding prior receipts."""
        self.monitor.discover()
        self.monitor.assert_inputs = lambda: (_ for _ in ()).throw(
            ValueError("original input changed")
        )
        with pytest.raises(ValueError, match="original input changed"):
            self.monitor.discover()
        assert list((self.root / "captures").glob("failure-*.private.json"))
        with pytest.raises(ValueError, match="retired"):
            self.monitor.discover()

    def test_reader_entrypoint_checks_admitted_inputs_and_retains_typed_result(
        self,
    ) -> None:
        """Exercise one-shot I/O with actual kernel/SDK actors and offline pins."""
        root = self.root / "reader-main"
        root.mkdir(mode=0o700)

        def binding(path: Path) -> dict[str, object]:
            value = path.lstat()
            parent = path.parent.lstat()
            return {
                "path": str(path),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "expectedIdentity": reader.identity(value),
                "expectedParentIdentity": {
                    key: reader.identity(parent)[key] for key in reader.PARENT_FIELDS
                },
            }

        executable = binding(self.exe)
        inputs = {"python": executable}
        for name in (
            "__init__.py",
            "guest_pty.py",
            "gcp_provider_process.py",
            "gcp_provider_reader.py",
        ):
            inputs["script:" + name] = binding(SCRIPTS / name)
        now = time.monotonic_ns() // 1000000
        request = {
            "schemaVersion": 1,
            "inputs": inputs,
            "executables": dict.fromkeys(reader.PINS, executable),
            "originalStartMs": now,
            "deadlineMs": now + 7200000,
            "executor": self.original,
        }
        path = root / "request.private.json"
        raw = json.dumps(request).encode()
        path.write_bytes(raw)
        path.chmod(0o400)
        self.request("reader-main " + str(path) + " " + hashlib.sha256(raw).hexdigest())
        result = json.loads((root / "provider-result.private.json").read_text())
        assert result["executor"] == self.original
        assert result["executorAvailable"]
        assert not result["executorGroupClosed"]
        assert result["candidates"][0]["pid"] == self.row["child"]
        assert not result["applyPhaseQualified"]

    def test_reader_preserves_an_already_original_session(self) -> None:
        """Avoid a second setsid after the signal-free executor's original gate."""
        result = self.request("reader-session")
        assert result["parent"] == result["session"] == result["group"]
        assert pty.process_identity(result["parent"]) == self.original

    def test_reader_independently_observes_original_group_absence_after_natural_exit(
        self,
    ) -> None:
        """Final inspection can prove closure after its original executor exits."""
        original_pipe(self.parent.stdin).close()
        assert self.parent.wait(timeout=15) == 0
        available, closed = reader.inspect_executor(dict(self.original))
        assert not available
        assert closed

    def test_reader_exit_race_keeps_closed_original_group_without_adopting_replacement(
        self,
    ) -> None:
        """A vanished executor after discovery starts still requires group closure."""

        def disappeared() -> NoReturn:
            original_pipe(self.parent.stdin).close()
            if self.parent.wait(timeout=15) != 0:
                message = "Original fixture exit failed"
                raise RuntimeError(message)
            message = "original executor naturally exited"
            raise FileNotFoundError(message)

        available, closed, candidates = reader.collect_cohort(
            dict(self.original), disappeared
        )
        assert not available
        assert closed
        assert not candidates

    def test_reader_final_capture_uses_the_original_separate_reserve(self) -> None:
        """Permit final reads after the operation deadline without resetting it."""
        request: dict[str, object] = {"originalStartMs": 1000, "deadlineMs": 7201000}
        with pytest.raises(ValueError, match="budget"):
            reader.require_capture_budget(request, 7201001)
        final_capture = {
            "finalStartedMs": 7201000,
            "finalDeadlineMs": 7501000,
        }
        request["finalCapture"] = final_capture
        assert reader.require_capture_budget(request, 7201001) == 7501000
        with pytest.raises(ValueError, match="budget"):
            reader.require_capture_budget(request, 7501000)
        final_capture["finalDeadlineMs"] += 1
        with pytest.raises(ValueError, match="budget"):
            reader.require_capture_budget(request, 7201001)

    def test_reader_discovery_error_with_live_original_group_is_not_closure(
        self,
    ) -> None:
        """A missing unrelated file cannot hide the still-live original actor."""

        def failed() -> NoReturn:
            message = "unrelated missing input"
            raise FileNotFoundError(message)

        with pytest.raises(FileNotFoundError, match="unrelated"):
            reader.collect_cohort(dict(self.original), failed, assert_inputs=self.guard)
        assert pty.process_identity(self.original["pid"]) == self.original

    def test_reader_changed_inputs_during_exit_cannot_be_accepted(self) -> None:
        """Independent group absence cannot excuse changed admitted inputs."""

        def disappeared() -> NoReturn:
            original_pipe(self.parent.stdin).close()
            assert self.parent.wait(timeout=15) == 0
            message = "original executor naturally exited"
            raise FileNotFoundError(message)

        checks = 0

        def changed() -> None:
            nonlocal checks
            checks += 1
            if checks > 1:
                message = "original input changed"
                raise ValueError(message)

        with pytest.raises(ValueError, match="input changed"):
            reader.collect_cohort(
                dict(self.original), disappeared, assert_inputs=changed
            )

    def test_reader_replacement_group_and_unrelated_errors_remain_failed(self) -> None:
        """Never turn an identity replacement or an unrelated error into closure."""

        def missing() -> NoReturn:
            message = "discovery failed"
            raise FileNotFoundError(message)

        with (
            patch.object(
                reader, "inspect_executor", side_effect=[(True, False), (False, False)]
            ),
            pytest.raises(FileNotFoundError),
        ):
            reader.collect_cohort(dict(self.original), missing)

        def unrelated() -> NoReturn:
            message = "original identity changed"
            raise ValueError(message)

        with pytest.raises(ValueError, match="identity changed"):
            reader.collect_cohort(dict(self.original), unrelated)

    def test_reader_changed_original_identity_is_not_group_closure(self) -> None:
        """A reused PID cannot be accepted even if the old group is absent."""
        replacement = {**self.original, "start": str(int(self.original["start"]) + 1)}
        with (
            patch.object(pty, "process_identity", return_value=replacement),
            patch.object(pty, "group_absent", return_value=True),
            pytest.raises(ValueError, match="identity changed"),
        ):
            reader.inspect_executor(dict(self.original))

    def test_source_never_sends_signals_or_selects_by_latest_pid(self) -> None:
        """Verify source never sends signals or selects by latest pid."""
        source = (SCRIPTS / "gcp_provider_process.py").read_text()
        for forbidden in (
            "os.kill(",
            "os.killpg(",
            ".send_signal(",
            ".terminate(",
            ".kill(",
        ):
            assert forbidden not in source


if __name__ == "__main__":
    unittest.main(verbosity=2)
