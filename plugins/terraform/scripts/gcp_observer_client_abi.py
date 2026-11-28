"""Original guest client ABI probes with signal-free process attribution.

The SSH consumer must independently bind these receipts to its original peer
and output issuer; this module never grants CE execution or cloud health.
"""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import pwd
import re
import stat
import time
from base64 import b64encode
from pathlib import Path
from typing import IO, TYPE_CHECKING, Any, NamedTuple, NoReturn

if TYPE_CHECKING:
    from collections.abc import Mapping

MAX_OUTPUT = 65536
COMMAND_MS = 60000
STARTUP_MS = 15000
NONCE_LENGTH = 64
FINAL_MS = 300000
PRIVATE_MODE = 0o700
CLIENT_MODE = 0o500
CAPTURE_MODE = 0o600
LAST_STANDARD_FD = 2
# Linux UAPI pins; this Python build lacks the named fcntl sealing constants.
F_GET_SEALS = 1034
CLIENT_SEAL_MASK = 15
FRESH_MS = 300000
CONFIG_KEYS = {
    "schemaVersion",
    "kind",
    "instanceId",
    "nonce",
    "uid",
    "bootId",
    "pythonPath",
    "pythonSha256",
    "guestDeadlineMs",
    "archiveSha256",
    "deliveryNonce",
    "deliveryReceiptSha256",
    "deliveryFinishedMs",
}
FILE_IDENTITY_KEYS = (
    "st_dev",
    "st_ino",
    "st_uid",
    "st_nlink",
    "st_mode",
    "st_size",
    "st_mtime_ns",
    "st_ctime_ns",
)
FILE_DECLARATIONS = {
    "ssh": {
        "sha256": "f425fe4b88def329d36f44e37ab9418f944fbc5ed51e02c6518c844bd580f4c6"
    },
    "ssh-keyscan": {
        "sha256": "85c27d97c78b55dc763d673a68e3187c33fa6c072e0c6c682fe5fe4621b25546"
    },
    "ssh-keygen": {
        "sha256": "f3647cdae087762de51a6dec3446f11348c5168dafbe666a70e7b1d9821cbb0a"
    },
}
FILES = {name: declaration["sha256"] for name, declaration in FILE_DECLARATIONS.items()}
ARCHIVE_SHA256 = "243b9555199a427ca90e939310d03917f380b470aaed14200c28101e797ec318"
GATE = """import fcntl,hashlib,json,os,stat,sys
os.umask(0o077)
os.setsid()
source=os.open(sys.argv[2],os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
try:
 meta=os.fstat(source)
 if not stat.S_ISREG(meta.st_mode) or meta.st_uid!=os.getuid() or meta.st_nlink!=1 or stat.S_IMODE(meta.st_mode)!=0o500 or not 0<meta.st_size<=16*1024*1024:sys.exit(73)
 with os.fdopen(os.dup(source),'rb') as stream:client=stream.read(16*1024*1024+1)
 if len(client)!=meta.st_size or hashlib.sha256(client).hexdigest()!=sys.argv[3]:sys.exit(73)
finally:os.close(source)
snapshot=os.memfd_create('xcsh-observer-abi-client',os.MFD_ALLOW_SEALING|os.MFD_CLOEXEC)
offset=0
while offset<len(client):offset+=os.write(snapshot,client[offset:])
os.fchmod(snapshot,0o500)
fcntl.fcntl(snapshot,1033,15)
if fcntl.fcntl(snapshot,1034)!=15:sys.exit(73)
sealed=os.fstat(snapshot)
raw=open('/proc/self/stat').read()
fields=raw[raw.rfind(')')+2:].split()
value={'pid':os.getpid(),'group':int(fields[2]),'start':fields[19],'bootId':open('/proc/sys/kernel/random/boot_id').read().strip(),'uid':os.getuid(),'pythonPath':os.readlink('/proc/self/exe'),'pythonSha256':hashlib.sha256(open('/proc/self/exe','rb').read()).hexdigest()}
value.update({'clientFd':snapshot,'clientSha256':hashlib.sha256(client).hexdigest(),'clientSeals':fcntl.fcntl(snapshot,1034),'clientBytes':len(client),'clientDev':str(sealed.st_dev),'clientIno':str(sealed.st_ino)})
partial=sys.argv[1]+'.partial'
with open(partial,'x') as out:
 json.dump(value,out);out.flush();os.fsync(out.fileno())
os.chmod(partial,0o400)
os.link(partial,sys.argv[1])
os.unlink(partial)
if sys.stdin.buffer.readline(4)!=b'go\\n' or sys.stdin.buffer.read(1)!=b'':sys.exit(73)
if fcntl.fcntl(snapshot,1034)!=15:sys.exit(73)
os.execve(snapshot,[sys.argv[2],*sys.argv[4:]],{})
"""


def reject(message: str) -> NoReturn:
    """Refuse an original guest verification failure."""
    raise ValueError(message)


def monotonic_ms() -> int:
    """Use the same original guest kernel monotonic clock."""
    return time.monotonic_ns() // 1000000


def sha(raw: bytes) -> str:
    """Hash exact original bytes."""
    return hashlib.sha256(raw).hexdigest()


def identity() -> dict[str, Any]:
    """Read the authenticated guest user, kernel and original interpreter."""
    return {
        "uid": os.getuid(),
        "user": pwd.getpwuid(os.getuid()).pw_name,
        "bootId": Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
        "pythonPath": str(Path("/proc/self/exe").readlink()),
        "pythonSha256": sha(Path("/proc/self/exe").read_bytes()),
    }


def directory(path: Path) -> None:
    """Admit only the canonical private original guest directory."""
    if not path.is_absolute() or path.resolve() != path:
        reject("Original guest ABI directory is not canonical")
    value = path.lstat()
    if (
        not stat.S_ISDIR(value.st_mode)
        or value.st_uid != os.getuid()
        or value.st_mode & 0o777 != PRIVATE_MODE
    ):
        reject("Original guest ABI directory ownership differs")


def read_owned(path: Path, expected: str, mode: int) -> bytes:
    """Join bounded original files without following replaced paths."""
    directory(path.parent)
    before = path.lstat()
    if (
        not stat.S_ISREG(before.st_mode)
        or before.st_uid != os.getuid()
        or before.st_nlink != 1
        or before.st_mode & 0o777 != mode
        or not 0 < before.st_size <= 16 * 1024 * 1024
    ):
        reject("Original guest client file ownership differs")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        raw = stream.read()
    after = path.lstat()
    keys = (
        "st_dev",
        "st_ino",
        "st_uid",
        "st_nlink",
        "st_mode",
        "st_size",
        "st_mtime_ns",
        "st_ctime_ns",
    )
    if sha(raw) != expected or any(
        getattr(before, key) != getattr(after, key) for key in keys
    ):
        reject("Original guest client file bytes or identity differ")
    return raw


def persist(root: Path, name: str, value: dict[str, Any]) -> None:
    """Retain exact exclusive original process metadata."""
    directory(root)
    descriptor = os.open(
        root / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400
    )
    with os.fdopen(descriptor, "wb") as stream:
        stream.write((json.dumps(value, sort_keys=True) + "\n").encode())
        stream.flush()
        os.fsync(stream.fileno())


def proc(pid: int) -> dict[str, Any]:
    """Independently inspect this original Linux process identity."""
    raw = Path(f"/proc/{pid}/stat").read_text()
    fields = raw[raw.rfind(")") + 2 :].split()
    return {
        "pid": pid,
        "state": fields[0],
        "group": int(fields[2]),
        "start": fields[19],
        "bootId": Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
    }


def group_absent(original: dict[str, Any]) -> bool:
    """Independently refuse any live member of the original group."""
    if (
        Path("/proc/sys/kernel/random/boot_id").read_text().strip()
        != original["bootId"]
    ):
        reject("Original guest process kernel changed")
    for path in Path("/proc").iterdir():
        if not path.name.isdigit():
            continue
        try:
            row = proc(int(path.name))
        except FileNotFoundError:
            continue
        if row["group"] == original["group"]:
            return False
    return True


def file_identity(path: Path) -> tuple[int, ...]:
    """Retain original file identity without access-time side effects."""
    value = path.lstat()
    return tuple(getattr(value, key) for key in FILE_IDENTITY_KEYS)


def decode_object(raw: bytes) -> dict[str, Any]:
    """Refuse duplicate keys and non-JSON numbers in the original receipt."""

    def unique(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        value: dict[str, Any] = {}
        for key, item in pairs:
            if key in value:
                reject("Original guest JSON receipt has duplicate fields")
            value[key] = item
        return value

    value = json.loads(
        raw,
        object_pairs_hook=unique,
        parse_constant=lambda _value: reject("Original guest JSON number differs"),
    )
    if not isinstance(value, dict):
        reject("Original guest JSON object required")
    return value


def positive_integer(value: object) -> bool:
    """Require an integer while rejecting boolean schema/clock substitutions."""
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def original_delivery(config: dict[str, Any]) -> tuple[Path, tuple[int, ...]]:
    """Join the exact original SSH-delivered installed receipt before ABI work."""
    path = (
        Path.home()
        / ".local/share/xcsh/gcp-observer-delivery"
        / config["instanceId"]
        / config["deliveryNonce"]
        / "installed.private.json"
    )
    try:
        original = file_identity(path)
        packet = decode_object(read_owned(path, config["deliveryReceiptSha256"], 0o400))
        if file_identity(path) != original:
            reject("Original guest delivery receipt changed during inspection")
    except OSError as cause:
        message = "Original guest delivery receipt unavailable"
        raise ValueError(message) from cause
    fields = {
        "schemaVersion",
        "kind",
        "instanceId",
        "nonce",
        "uid",
        "bootId",
        "pythonPath",
        "pythonSha256",
        "archiveSha256",
        "clientRoot",
        "startedMs",
        "finishedMs",
        "originalDeadlineMs",
        "installedBytesVerified",
        "abiVerified",
        "guestClientQualified",
    }
    if (
        set(packet) != fields
        or not positive_integer(packet.get("schemaVersion"))
        or packet["schemaVersion"] != 1
        or packet.get("kind") != "original-observer-installed-client-bytes"
    ):
        reject("Original guest delivery receipt schema differs")
    if (
        any(
            packet.get(key) != config[key]
            for key in (
                "instanceId",
                "uid",
                "bootId",
                "pythonPath",
                "pythonSha256",
                "archiveSha256",
            )
        )
        or packet.get("nonce") != config["deliveryNonce"]
        or packet.get("clientRoot")
        != str(
            Path.home()
            / ".local/share/xcsh/gcp-observer-clients"
            / config["instanceId"]
        )
    ):
        reject("Original guest delivery receipt identity or client path differs")
    if (
        packet.get("installedBytesVerified") is not True
        or packet.get("abiVerified") is not False
        or packet.get("guestClientQualified") is not False
    ):
        reject("Original guest delivery receipt qualification differs")
    if (
        not all(
            positive_integer(packet.get(key))
            for key in ("startedMs", "finishedMs", "originalDeadlineMs")
        )
        or not packet["startedMs"]
        <= packet["finishedMs"]
        < packet["originalDeadlineMs"]
        or packet["finishedMs"] - packet["startedMs"] > COMMAND_MS
        or packet["finishedMs"] != config["deliveryFinishedMs"]
        or not 0 <= monotonic_ms() - packet["finishedMs"] <= FRESH_MS
    ):
        reject("Original guest delivery receipt clock differs")
    return path, original


def guard(
    config: dict[str, Any],
    original: dict[str, Any],
    receipt: tuple[Path, tuple[int, ...]] | None = None,
) -> None:
    """Keep the original deadline and guest identity fixed."""
    if monotonic_ms() >= config["guestDeadlineMs"]:
        reject("Original guest ABI deadline exhausted")
    if identity() != original:
        reject("Original guest ABI identity changed")
    if receipt is not None:
        path, expected = receipt
        if file_identity(path) != expected:
            reject("Original guest delivery receipt identity changed")
        read_owned(path, config["deliveryReceiptSha256"], 0o400)
        if file_identity(path) != expected:
            reject("Original guest delivery receipt changed during capture")


class OriginalClientProcess:
    """Spawn with exact descriptors; the child establishes its gated session."""

    def __init__(self, args: list[str], stdout: int, stderr: int) -> None:
        """Start one owned gated child with exact standard descriptors."""
        read_fd, write_fd = os.pipe2(os.O_CLOEXEC)
        try:
            self.pid = os.posix_spawn(
                args[0],
                args,
                {},
                file_actions=[
                    (os.POSIX_SPAWN_DUP2, read_fd, 0),
                    (os.POSIX_SPAWN_DUP2, stdout, 1),
                    (os.POSIX_SPAWN_DUP2, stderr, 2),
                    (os.POSIX_SPAWN_CLOSE, write_fd),
                    (os.POSIX_SPAWN_CLOSE, read_fd),
                ],
            )
        except (OSError, NotImplementedError):
            os.close(write_fd)
            raise
        finally:
            os.close(read_fd)
        self.stdin = os.fdopen(write_fd, "wb")
        self.returncode: int | None = None

    def poll(self) -> int | None:
        """Inspect only the original child without sending any signal."""
        if self.returncode is None:
            pid, status = os.waitpid(self.pid, os.WNOHANG)
            if pid:
                self.returncode = os.waitstatus_to_exitcode(status)
        return self.returncode

    def wait(self) -> int:
        """Reap that same original child after natural completion."""
        if self.returncode is None:
            _, status = os.waitpid(self.pid, 0)
            self.returncode = os.waitstatus_to_exitcode(status)
        return self.returncode


def original_client_snapshot(
    child: OriginalClientProcess, original: dict[str, Any], client: Path
) -> None:
    """Independently verify the original child's immutable executable descriptor."""
    selected = original.get("clientFd")
    if (
        not isinstance(selected, int)
        or isinstance(selected, bool)
        or selected <= LAST_STANDARD_FD
        or original.get("clientSeals") != CLIENT_SEAL_MASK
        or original.get("clientSha256") != FILES[client.name]
    ):
        reject("Original guest ABI client snapshot declaration differs")
    path = Path(f"/proc/{child.pid}/fd/{selected}")
    if path.readlink().as_posix() != "/memfd:xcsh-observer-abi-client (deleted)":
        reject("Original guest ABI client snapshot origin differs")
    descriptor = os.open(path, os.O_RDONLY | os.O_CLOEXEC)
    with os.fdopen(descriptor, "rb") as stream:
        before = os.fstat(stream.fileno())
        if (
            not stat.S_ISREG(before.st_mode)
            or before.st_uid != os.getuid()
            or stat.S_IMODE(before.st_mode) != CLIENT_MODE
            or not 0 < before.st_size <= 16 * 1024 * 1024
        ):
            reject("Original guest ABI client snapshot ownership differs")
        if (
            original.get("clientDev") != str(before.st_dev)
            or original.get("clientIno") != str(before.st_ino)
            or original.get("clientBytes") != before.st_size
            or fcntl.fcntl(stream.fileno(), F_GET_SEALS) != CLIENT_SEAL_MASK
        ):
            reject("Original guest ABI client snapshot kernel identity differs")
        raw = stream.read(16 * 1024 * 1024 + 1)
        if len(raw) != before.st_size or sha(raw) != FILES[client.name]:
            reject("Original guest ABI client snapshot bytes differ")
        after = os.fstat(stream.fileno())
        identity_keys = (
            "st_dev",
            "st_ino",
            "st_uid",
            "st_mode",
            "st_size",
            "st_mtime_ns",
            "st_ctime_ns",
        )
        if (
            any(getattr(before, key) != getattr(after, key) for key in identity_keys)
            or fcntl.fcntl(stream.fileno(), F_GET_SEALS) != CLIENT_SEAL_MASK
            or path.readlink().as_posix() != "/memfd:xcsh-observer-abi-client (deleted)"
        ):
            reject("Original guest ABI client snapshot changed during inspection")


def original_ready(
    ready: Path,
    child: OriginalClientProcess,
    config: dict[str, Any],
    started: int,
    client: Path,
) -> dict[str, Any]:
    """Join one complete original ready record to independent kernel identity."""
    while not ready.exists() and child.poll() is None:
        if monotonic_ms() >= min(started + STARTUP_MS, config["guestDeadlineMs"]):
            reject("Original guest ABI startup deadline exhausted")
        time.sleep(0.025)
    if not ready.exists():
        reject("Original guest ABI producer not ready")
    original = json.loads(ready.read_text())
    current = proc(child.pid)
    if (
        original["pid"] != child.pid
        or original["group"] != child.pid
        or any(original[key] != current[key] for key in ("group", "start", "bootId"))
    ):
        reject("Original guest ABI gated identity differs")
    if any(
        original[key] != config[key] for key in ("uid", "pythonPath", "pythonSha256")
    ):
        reject("Original guest ABI gated user/interpreter differs")
    original_client_snapshot(child, original, client)
    return original


def retain_failed_probe(
    child: OriginalClientProcess,
    original: dict[str, Any] | None,
    config: dict[str, Any],
    root: Path,
    released: bool,
    error: Exception,
) -> None:
    """Keep the original failure clock and observe only natural group closure."""
    failures: list[Exception] = []
    try:
        if not released and child.stdin is not None:
            child.stdin.close()
    except (ValueError, OSError) as cause:
        failures.append(cause)
    final_started = min(monotonic_ms(), config["guestDeadlineMs"])
    try:
        persist(
            root,
            "failure.private.json",
            {
                "errorType": type(error).__name__,
                "released": released,
                "identity": original,
                "originalDeadlineMs": config["guestDeadlineMs"],
                "finalStartedMs": final_started,
                "finalDeadlineMs": final_started + FINAL_MS,
                "originalGroupClosed": False,
                "signalsSent": False,
            },
        )
    except (ValueError, OSError) as cause:
        failures.append(cause)
    closed = False
    try:
        while child.poll() is None and monotonic_ms() < final_started + FINAL_MS:
            time.sleep(0.025)
        if child.poll() is not None and original is not None:
            first = group_absent(original)
            time.sleep(0.025)
            second = group_absent(original)
            closed = first and second
    except (ValueError, OSError) as cause:
        failures.append(cause)
    try:
        persist(
            root,
            "failed-completion.private.json",
            {
                "identity": original,
                "exitCode": child.poll(),
                "originalGroupClosed": closed,
                "finalStartedMs": final_started,
                "finalDeadlineMs": final_started + FINAL_MS,
                "signalsSent": False,
                "complete": False,
                "retentionErrors": [type(cause).__name__ for cause in failures],
            },
        )
    except (ValueError, OSError) as cause:
        failures.append(cause)
    if failures:
        message = "Original failure retention or closure unresolved"
        raise ExceptionGroup(message, [error, *failures])


class OriginalGuestScope(NamedTuple):
    """Keep the original guest identity and delivered receipt coupled."""

    identity: dict[str, Any]
    receipt: tuple[Path, tuple[int, ...]]


def probe(
    client: Path,
    args: list[str],
    expected_code: int,
    marker: bytes,
    config: dict[str, Any],
    journal: Path,
    original_scope: OriginalGuestScope,
) -> dict[str, Any]:
    """Release one exact original client only after independent ready identity."""
    root = journal / client.name
    root.mkdir(mode=PRIVATE_MODE)
    gate = root / "gate.py"
    descriptor = os.open(gate, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o400)
    with os.fdopen(descriptor, "wb") as gate_writer:
        gate_writer.write(GATE.encode())
        gate_writer.flush()
        os.fsync(gate_writer.fileno())
    started = monotonic_ms()
    streams = {
        "stdout": (root / "stdout.private").open("xb+"),
        "stderr": (root / "stderr.private").open("xb+"),
    }
    for stream in streams.values():
        os.fchmod(stream.fileno(), 0o600)
    child = OriginalClientProcess(
        [
            config["pythonPath"],
            "-I",
            "-B",
            str(gate),
            str(root / "ready.json"),
            str(client),
            FILES[client.name],
            *args,
        ],
        streams["stdout"].fileno(),
        streams["stderr"].fileno(),
    )
    original: dict[str, Any] | None = None
    released = False
    try:
        original = original_ready(root / "ready.json", child, config, started, client)
        read_owned(client, FILES[client.name], 0o500)
        if gate.read_bytes() != GATE.encode():
            reject("Original guest ABI gate changed")
        persist(
            root,
            "claim.private.json",
            {
                "identity": original,
                "args": args,
                "executableSha256": FILES[client.name],
                "originalDeadlineMs": config["guestDeadlineMs"],
            },
        )
        guard(config, original_scope.identity, original_scope.receipt)
        if child.stdin is None:
            reject("Original guest ABI release stream missing")
        released = True
        child.stdin.write(b"go\n")
        child.stdin.flush()
        child.stdin.close()
        while child.poll() is None:
            guard(config, original_scope.identity, original_scope.receipt)
            if monotonic_ms() >= config["guestDeadlineMs"]:
                reject("Original guest ABI command deadline exhausted")
            if any(
                (root / f"{name}.private").stat().st_size > MAX_OUTPUT
                for name in streams
            ):
                reject("Original guest ABI output exceeds bound")
            time.sleep(0.025)
        child.wait()
        if not group_absent(original):
            reject("Original guest ABI group closure unresolved")
        time.sleep(0.025)
        if not group_absent(original):
            reject("Original guest ABI group closure changed")
        read_owned(client, FILES[client.name], 0o500)
        output = capture_original_streams(root, streams)
        guard(config, original_scope.identity, original_scope.receipt)
        if (
            child.returncode != expected_code
            or marker not in output["stderr"]
            or any(len(raw) > MAX_OUTPUT for raw in output.values())
        ):
            reject("Original guest ABI output or exit behavior differs")
        if monotonic_ms() >= config["guestDeadlineMs"]:
            reject("Original guest ABI completion exceeded deadline")
        result = {
            "client": client.name,
            "args": args,
            "pid": child.pid,
            "identity": original,
            "exitCode": child.returncode,
            "executableSha256": FILES[client.name],
            "stdoutSha256": sha(output["stdout"]),
            "stderrSha256": sha(output["stderr"]),
            "stdoutBase64": b64encode(output["stdout"]).decode("ascii"),
            "stderrBase64": b64encode(output["stderr"]).decode("ascii"),
            "originalDeadlineMs": config["guestDeadlineMs"],
            "originalGroupClosed": True,
            "startedMs": started,
            "finishedMs": monotonic_ms(),
            "signalsSent": False,
        }
        persist(root, "completion.private.json", result)
    except (ValueError, OSError) as error:
        retain_failed_probe(child, original, config, root, released, error)
        raise
    finally:
        for stream in streams.values():
            stream.close()
    return result


def capture_original_streams(
    root: Path, streams: Mapping[str, IO[bytes]]
) -> dict[str, bytes]:
    """Read only the original producer descriptors after independent closure."""
    directory(root)
    result = {}
    for name, stream in streams.items():
        path = root / f"{name}.private"
        opened = os.fstat(stream.fileno())
        current = path.lstat()
        if (
            not stat.S_ISREG(current.st_mode)
            or current.st_uid != os.getuid()
            or current.st_nlink != 1
            or stat.S_IMODE(current.st_mode) != CAPTURE_MODE
            or not 0 <= current.st_size <= MAX_OUTPUT
        ):
            reject("Original guest ABI stream ownership or size differs")
        if any(
            getattr(opened, key) != getattr(current, key) for key in FILE_IDENTITY_KEYS
        ):
            reject("Original guest ABI producer stream identity differs")
        os.fsync(stream.fileno())
        stream.seek(0)
        raw = stream.read(MAX_OUTPUT + 1)
        if len(raw) != opened.st_size or file_identity(path) != tuple(
            getattr(opened, key) for key in FILE_IDENTITY_KEYS
        ):
            reject("Original guest ABI stream changed during capture")
        result[name] = raw
    return result


def validate_request(config: dict[str, Any]) -> dict[str, Any]:
    """Validate the exact source-selected original ABI request before journaling."""
    current = identity()
    if (
        set(config) != CONFIG_KEYS
        or not positive_integer(config.get("schemaVersion"))
        or config.get("schemaVersion") != 1
        or config.get("kind") != "original-observer-client-abi"
        or current.get("user") != "ubuntu"
    ):
        reject("Original guest ABI user or schema differs")
    if (
        not isinstance(config.get("uid"), int)
        or isinstance(config["uid"], bool)
        or config["uid"] <= 0
        or config["uid"] != current["uid"]
    ):
        reject("Original guest ABI numeric user identity differs")
    if any(
        config.get(key) != current[key]
        for key in ("bootId", "pythonPath", "pythonSha256")
    ):
        reject("Original guest ABI kernel or interpreter differs")
    if (
        not isinstance(config.get("instanceId"), str)
        or re.fullmatch(r"[1-9][0-9]{0,19}", config["instanceId"]) is None
        or not isinstance(config.get("nonce"), str)
        or len(config["nonce"]) != NONCE_LENGTH
        or any(letter not in "abcdef0123456789" for letter in config["nonce"])
    ):
        reject("Original guest ABI identity or nonce differs")
    if (
        isinstance(config.get("guestDeadlineMs"), bool)
        or not isinstance(config.get("guestDeadlineMs"), int)
        or not 0 < config["guestDeadlineMs"] - monotonic_ms() <= COMMAND_MS
    ):
        reject("Original guest ABI deadline differs")
    if config.get("archiveSha256") != ARCHIVE_SHA256:
        reject("Original guest ABI artifact differs")
    if (
        not isinstance(config.get("deliveryNonce"), str)
        or re.fullmatch(r"[a-f0-9]{64}", config["deliveryNonce"]) is None
        or not isinstance(config.get("deliveryReceiptSha256"), str)
        or re.fullmatch(r"[a-f0-9]{64}", config["deliveryReceiptSha256"]) is None
        or not positive_integer(config.get("deliveryFinishedMs"))
    ):
        reject("Original guest ABI delivery receipt binding differs")
    return current


def retain_abi_failure(journal: Path, config: dict[str, Any], error: Exception) -> None:
    """Keep the original ABI failure and deadline without replay or signals."""
    final_started = min(monotonic_ms(), config["guestDeadlineMs"])
    try:
        persist(
            journal,
            "failure.private.json",
            {
                "errorType": type(error).__name__,
                "complete": False,
                "originalDeadlineMs": config["guestDeadlineMs"],
                "finalStartedMs": final_started,
                "finalDeadlineMs": final_started + FINAL_MS,
                "guestClientQualified": False,
                "signalsSent": False,
            },
        )
    except (ValueError, OSError) as retention:
        message = "Original ABI failure and final retention both failed"
        raise ExceptionGroup(message, [error, retention]) from error


def verify_original_clients(config: dict[str, Any]) -> dict[str, Any]:
    """Verify the fixed original clients and the original delivered-byte receipt."""
    config = dict(config)
    started = monotonic_ms()
    current = validate_request(config)
    receipt = original_delivery(config)
    original_scope = OriginalGuestScope(current, receipt)
    clients = (
        Path.home() / ".local/share/xcsh/gcp-observer-clients" / config["instanceId"]
    )
    directory(clients)
    read_owned(clients / "archive.zip", ARCHIVE_SHA256, 0o400)
    for name, digest in FILES.items():
        read_owned(clients / "bin" / name, digest, 0o500)
    base = Path.home() / ".local/share/xcsh/gcp-observer-abi" / config["instanceId"]
    if base.resolve() != base:
        reject("Original guest ABI journal path differs")
    base.mkdir(parents=True, exist_ok=True, mode=PRIVATE_MODE)
    directory(base)
    journal = base / config["nonce"]
    try:
        journal.mkdir(mode=PRIVATE_MODE)
    except FileExistsError as cause:
        message = "Original guest ABI verification is single-use"
        raise ValueError(message) from cause
    try:
        persist(journal, "request.private.json", config)
        processes = []
        for name, args, expected, marker in [
            ("ssh", ["-V"], 0, b"OpenSSH_10.6p2,"),
            ("ssh-keyscan", [], 1, b"usage: ssh-keyscan"),
            (
                "ssh-keygen",
                ["-l", "-f", "/dev/null"],
                255,
                b"/dev/null is not a public key file.",
            ),
        ]:
            guard(config, current, receipt)
            processes.append(
                probe(
                    clients / "bin" / name,
                    args,
                    expected,
                    marker,
                    config,
                    journal,
                    original_scope,
                )
            )
        guard(config, current, receipt)
        result = {
            "schemaVersion": 1,
            "kind": "original-observer-client-abi-proof",
            "instanceId": config["instanceId"],
            "nonce": config["nonce"],
            "clientRoot": str(clients),
            "bootId": config["bootId"],
            "uid": config["uid"],
            "pythonPath": config["pythonPath"],
            "pythonSha256": config["pythonSha256"],
            "archiveSha256": ARCHIVE_SHA256,
            "originalDeadlineMs": config["guestDeadlineMs"],
            "deliveryNonce": config["deliveryNonce"],
            "deliveryReceiptSha256": config["deliveryReceiptSha256"],
            "deliveryFinishedMs": config["deliveryFinishedMs"],
            "startedMs": started,
            "finishedMs": monotonic_ms(),
            "processes": processes,
            "abiVerified": True,
            "guestClientQualified": False,
        }
        if len(json.dumps(result).encode()) > MAX_OUTPUT:
            reject("Original guest ABI proof exceeds output bound")
        persist(journal, "proof.private.json", result)
        guard(config, current, receipt)
    except (ValueError, OSError) as error:
        retain_abi_failure(journal, config, error)
        raise
    return result
