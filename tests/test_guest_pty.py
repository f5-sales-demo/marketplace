import ast
import hashlib
import shutil
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import pytest

from plugins.terraform.scripts import guest_pty as module

HERE = Path(__file__).resolve().parent

FIXTURE = """import os,select,sys,time,tty
tty.setraw(0)
end=time.monotonic()+3
pending=b''
os.write(1,b'>>> ')
while time.monotonic()<end:
 if not select.select([0],[],[],max(0,end-time.monotonic()))[0]:break
 data=os.read(0,4096)
 if not data:break
 for value in data:
  if value==9:os.write(1,b'\\r\\nexit show\\r\\n>>> ');pending=b''
  elif value==21:pending=b''
  elif value in (10,13):
   if pending==b'exit':sys.exit(0)
   if pending==b'show slow':time.sleep(.15)
   os.write(1,b'\\r\\nresponse:'+pending+b'\\r\\n>>> ');pending=b''
  else:pending+=bytes([value])
"""


class NaturalPtyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="natural-pty-"))
        self.script = self.root / "fixture.py"
        self.script.write_text(FIXTURE)
        self.script.chmod(0o400)
        self.exe = Path(sys.executable).resolve()
        self.exe_hash = hashlib.sha256(self.exe.read_bytes()).hexdigest()
        self.session: module.OriginalPtySession | None = None

    def tearDown(self) -> None:
        if self.session:
            # Only the fixture's own fixed three-second lifetime may end it.
            end = time.monotonic() + 4
            while self.session.child.poll() is None and time.monotonic() < end:
                time.sleep(0.01)
            self.session.close()
        shutil.rmtree(self.root)

    def open(self, close_after_ms=5000, **kwargs):
        self.session = module.OriginalPtySession(
            self.root / "capture",
            [str(self.exe), "-I", "-B", str(self.script)],
            executable_sha256=self.exe_hash,
            assert_inputs=lambda: None,
            assert_owner=lambda: None,
            operation_deadline_ms=module.now_ms() + 5000,
            closure_deadline_ms=module.now_ms() + close_after_ms,
            **kwargs,
        )
        return self.session

    def test_gated_identity_frames_real_bytes_and_closes_naturally(self) -> None:
        session = self.open()
        result = session.exchange(b"show status")
        assert b"response:show status" in result
        assert session.original["pid"] == session.child.pid
        assert session.original["group"] == session.child.pid
        session.discover()
        session.request_logout()
        assert session.close()
        assert session.child.returncode == 0
        assert (session.root / "terminal.private.bin").read_bytes()
        assert not session.receipt()["signalsSent"]
        assert not session.receipt()["guestAcceptanceComplete"]

    def test_command_injection_is_rejected_before_terminal_write(self) -> None:
        session = self.open()
        before = session.total
        for text in (
            b"show;exit",
            b"show\nexit",
            b"$(exit)",
            b"show\r",
            b"show|exit",
            b"~.",
            b"~C",
        ):
            with pytest.raises(ValueError, match="Command injection"):
                session.exchange(text)
        assert session.total == before
        session.discover()
        session.request_logout()

    def test_timeout_retains_partial_output_and_never_accepts_late_prompt(self) -> None:
        session = self.open(command_timeout_ms=30, close_after_ms=250)
        with pytest.raises(TimeoutError):
            session.exchange(b"show slow")
        assert session.failed
        with pytest.raises(ValueError, match="capture is retired"):
            session.exchange(b"exit")
        assert not session.close()
        assert session.fd is not None
        assert (session.root / "unresolved.private.json").exists()

    def test_ownership_change_retires_capture_without_further_commands(self) -> None:
        changed = False

        def guard() -> None:
            if changed:
                msg = "original ownership changed"
                raise ValueError(msg)

        session = self.open()
        session.assert_owner = guard
        changed = True
        with pytest.raises(ValueError, match="ownership changed"):
            session.exchange(b"show status")
        assert session.failed
        assert (session.root / "terminal.private.bin").exists()

    def test_truncation_remains_incomplete(self) -> None:
        session = self.open(max_output_bytes=30)
        with pytest.raises(ValueError, match="Truncated"):
            session.exchange(b"show longer-status-output")
        assert session.truncated
        assert not session.receipt()["guestAcceptanceComplete"]

    def test_gate_rejects_changed_arguments_before_publication(self) -> None:
        original_arguments = module.sys.argv
        target = self.root / "rejected-bootstrap.json"
        module.sys.argv = [
            "natural_pty.py",
            "--gate",
            str(target),
            "0",
            self.exe_hash,
            "0" * 64,
            str(self.exe),
            "-I",
            "-B",
            str(self.script),
        ]
        try:
            with pytest.raises(ValueError, match="Original gated arguments changed"):
                module.gate()
            assert not target.exists()
        finally:
            module.sys.argv = original_arguments

    def test_unverified_executable_is_rejected_before_spawning(self) -> None:
        with pytest.raises(ValueError, match="Reviewed executable differs"):
            module.OriginalPtySession(
                self.root / "rejected-capture",
                [str(self.exe), "-I", "-B", str(self.script)],
                executable_sha256="0" * 64,
                assert_inputs=lambda: None,
                assert_owner=lambda: None,
                operation_deadline_ms=module.now_ms() + 5000,
                closure_deadline_ms=module.now_ms() + 5000,
            )

    def test_source_has_no_signal_or_forced_child_termination_calls(self) -> None:
        tree = ast.parse(
            (HERE.parent / "plugins/terraform/scripts/guest_pty.py").read_text()
        )
        forbidden = {
            "kill",
            "killpg",
            "terminate",
            "send_signal",
            "alarm",
            "raise_signal",
        }
        assert not [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in forbidden
        ]

    def test_fragmented_controls_wait_and_bounded_titles_preserve_prompt(self) -> None:
        assert module.visible(b">>> \x1b[31") is None
        assert module.visible(b"\x1b]0;Site CLI\x07>>> ") == b">>> "
        assert module.visible(b"\x1b[32m>>> \x1b[0m") == b">>> "
        for raw in (b"\x1b]52;c;secret\x07>>> ", b"\x1b]0;" + b"x" * 257 + b"\x07"):
            with pytest.raises(ValueError, match="OSC"):
                module.visible(raw)

    def test_deadlines_cannot_be_reset_on_an_existing_actor(self) -> None:
        session = self.open()
        with pytest.raises(AttributeError):
            session.operation_deadline_ms += 1000
        with pytest.raises(AttributeError):
            session.closure_deadline_ms += 1000
        session.discover()
        session.request_logout()

    def test_unavailable_independent_group_inspection_retains_descriptors(self) -> None:
        session = self.open()
        session.discover()
        session.request_logout()
        end = time.monotonic() + 1
        while session.child.poll() is None and time.monotonic() < end:
            time.sleep(0.01)
        with patch.object(
            module,
            "group_absent",
            side_effect=ValueError("independent identity unavailable"),
        ):
            assert not session.close()
            assert session.fd is not None
            assert (session.root / "unresolved.private.json").exists()
        assert session.close()
        assert (session.root / "unresolved.private.json").exists()

    def test_ownership_work_spends_command_budget_before_terminal_write(self) -> None:
        session = self.open(command_timeout_ms=30)
        session.assert_owner = lambda: time.sleep(0.05)
        actual = module.os.write
        writes = []

        def observed(fd, raw):
            writes.append(raw)
            return actual(fd, raw)

        module.os.write = observed
        try:
            with pytest.raises(TimeoutError):
                session.exchange(b"show status")
            assert writes == []
        finally:
            module.os.write = actual

    def test_late_final_ownership_check_cannot_accept_framed_response(self) -> None:
        session = self.open(command_timeout_ms=180)
        calls = 0

        def owner() -> None:
            nonlocal calls
            calls += 1
            if calls == 2:
                time.sleep(0.15)

        session.assert_owner = owner
        with pytest.raises(TimeoutError):
            session.exchange(b"show status")
        assert session.failed

    def test_ssh_disconnect_cannot_be_sent_to_an_unqualified_terminal(self) -> None:
        session = self.open()
        with pytest.raises(ValueError, match="Verified SSH"):
            session.disconnect()
        session.discover()
        session.request_logout()

    def test_completion_clear_uses_original_budget(self) -> None:
        session = self.open()
        session.exchange(b"show ", b"\t")
        output = session.clear_pending(deadline_ms=module.now_ms() + 1000)
        assert b">>> " in output
        session.discover()
        session.request_logout()

    def test_completion_clear_checks_owner_before_terminal_write(self) -> None:
        session = self.open()
        actual = module.os.write
        writes = []

        def observed(fd, raw):
            writes.append(raw)
            return actual(fd, raw)

        session.assert_owner = lambda: time.sleep(0.05)
        module.os.write = observed
        try:
            with pytest.raises(TimeoutError):
                session.clear_pending(deadline_ms=module.now_ms() + 30)
            assert writes == []
        finally:
            module.os.write = actual


if __name__ == "__main__":
    unittest.main()
