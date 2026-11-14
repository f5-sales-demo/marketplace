"""Shared original process fixtures, independent of collected test modules."""

import hashlib
import json
import select
import subprocess
import sys
import time
from pathlib import Path
from types import TracebackType

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


class CooperativeProcess(subprocess.Popen[bytes]):
    """Close cooperative fixture streams and settle once within the existing bound."""

    def __exit__(
        self,
        _kind: type[BaseException] | None,
        _value: BaseException | None,
        _traceback: TracebackType | None,
    ) -> None:
        if self.stdin is not None:
            self.stdin.close()
        try:
            assert self.wait(timeout=15) == 0
        finally:
            for stream in (self.stdout, self.stderr):
                if stream is not None:
                    stream.close()


@pytest.fixture
def original(tmp_path, request):
    profile = getattr(request, "param", "single")
    if profile == "setgid":
        tmp_path.chmod(0o2700)
    sink = tmp_path / "sink"
    sink.mkdir(mode=0o700)
    sink.chmod(0o700)
    exe = Path(sys.executable).resolve()
    digest = hashlib.sha256(exe.read_bytes()).hexdigest()
    target = {"type_name": "xcsh_token", "name": "example-token", "namespace": "system"}
    targets = [target]
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
    with CooperativeProcess(  # Pinned interpreter and fixed cooperative fixture.
        [str(exe), "-I", "-B", "-c", PARENT, str(path), body],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    ) as parent:
        stdin, stdout, stderr = parent.stdin, parent.stdout, parent.stderr
        assert stdin is not None
        assert stdout is not None
        assert stderr is not None
        assert select.select([stdout], [], [], 15)[0]
        row = json.loads(stdout.readline())
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
