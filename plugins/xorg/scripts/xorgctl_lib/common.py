from __future__ import annotations

import json
import os
import pathlib
import re
import signal
import socket
import struct
import subprocess

VERSION = "1.0.1"
ROOT = pathlib.Path(
    os.environ.get("XORGCTL_STATE", pathlib.Path.home() / ".local/state/xorgctl")
)
RUNTIME = (
    pathlib.Path(os.environ.get("XDG_RUNTIME_DIR", f"/tmp/xorgctl-{os.getuid()}"))
    / "xorgctl"
)


class Fault(RuntimeError):
    pass


def private(path):
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.is_symlink() or path.stat().st_uid != os.getuid():
        msg = "state directory must be owned by this user and not a symlink"
        raise Fault(msg)
    path.chmod(0o700)
    return path


def session_dir(name):
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,32}", name):
        msg = "session name: 1-32 letters, digits, underscores or hyphens"
        raise Fault(msg)
    return ROOT / name


def socket_path(name):
    session_dir(name)
    return private(RUNTIME) / (name + ".sock")


def config(name):
    try:
        return json.loads((session_dir(name) / "session.json").read_text())
    except FileNotFoundError:
        msg = f"unknown session {name}; use session list or session create"
        raise Fault(msg) from None


def save(path, value) -> None:
    private(path.parent)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, indent=2))
    tmp.chmod(0o600)
    tmp.replace(path)


def run(argv, timeout=15, check=True, **kwargs):
    p = subprocess.run(
        [str(x) for x in argv],
        capture_output=True,
        timeout=timeout,
        check=False,
        **kwargs,
    )
    if check and p.returncode:
        raise Fault(
            f"{argv[0]} exited {p.returncode}: "
            + p.stderr.decode(errors="replace")[-1500:]
        )
    return p


def terminate_process_group(process, timeout=3) -> None:
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()


def ephemeral_artifact(worker, data, suffix, consume):
    artifact = worker.artifact(data, suffix)
    path = worker.folder / "artifacts" / artifact["artifact"]
    try:
        return consume(path)
    finally:
        path.unlink(missing_ok=True)


def receive(sock, size):
    data = bytearray()
    while len(data) < size:
        part = sock.recv(min(1024 * 1024, size - len(data)))
        if not part:
            msg = "worker disconnected"
            raise EOFError(msg)
        data.extend(part)
    return bytes(data)


def send_packet(sock, obj) -> None:
    data = json.dumps(obj, ensure_ascii=False).encode()
    sock.sendall(struct.pack("!I", len(data)) + data)


def recv_packet(sock):
    size = struct.unpack("!I", receive(sock, 4))[0]
    if size > 256 * 1024 * 1024:
        msg = "request exceeds 256 MiB"
        raise Fault(msg)
    return json.loads(receive(sock, size))


def rpc(name, method, params):
    s = socket.socket(socket.AF_UNIX)
    s.settimeout(3700)
    try:
        s.connect(str(socket_path(name)))
        send_packet(s, {"method": method, "params": params})
        r = recv_packet(s)
        if not r.get("ok"):
            raise Fault(r.get("error", "worker failed"))
        return r["result"]
    except (FileNotFoundError, ConnectionRefusedError):
        msg = f"session {name} is stopped; run session start"
        raise Fault(msg) from None
    finally:
        s.close()


def process_identity(pid):
    try:
        return (
            pathlib.Path(f"/proc/{pid}/stat").read_text().split(") ", 1)[1].split()[19]
        )
    except FileNotFoundError:
        return None


def alive(c):
    return bool(c.get("pid") and process_identity(c["pid"]) == c.get("start_ticks"))
