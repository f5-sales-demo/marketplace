"""Bounded original observer client artifact receiver.

The compiled SSH command supplies this request and the pinned installer source.
This receiver verifies installed bytes only; client ABI and live guest execution
require separate original-process evidence before any CE scan.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import pwd
import re
import select
import stat
import sys
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any, NoReturn, TypeGuard

if TYPE_CHECKING:
    import types

INSTALLER_SHA256 = "21f5cae7e24ee27935c1d004f6fbeec495786ae2af66f633ec1e390d2e2a8de9"
ARCHIVE_SHA256 = "243b9555199a427ca90e939310d03917f380b470aaed14200c28101e797ec318"
MAXIMUM = 16 * 1024 * 1024
COMMAND_LIMIT_MS = 60000
FINAL_LIMIT_MS = 300000
PRIVATE_MODE = 0o700
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
    "installerSha256",
}


def reject(message: str) -> NoReturn:
    """Refuse a failed original delivery invariant."""
    raise ValueError(message)


def monotonic_ms() -> int:
    """Use the guest kernel monotonic clock without renewing any deadline."""
    return time.monotonic_ns() // 1000000


def sha(raw: bytes) -> str:
    """Hash exact original source or artifact bytes."""
    return hashlib.sha256(raw).hexdigest()


def identity() -> dict[str, Any]:
    """Read this guest process's original user, kernel and interpreter."""
    return {
        "uid": os.getuid(),
        "user": pwd.getpwuid(os.getuid()).pw_name,
        "bootId": Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
        "pythonPath": str(Path("/proc/self/exe").readlink()),
        "pythonSha256": sha(Path("/proc/self/exe").read_bytes()),
    }


def integer(value: object) -> TypeGuard[int]:
    """Require a JSON integer while refusing booleans."""
    return isinstance(value, int) and not isinstance(value, bool)


def validate(config: dict[str, Any], source: bytes) -> dict[str, Any]:
    """Join the source-bound deadline, original guest and exact installer bytes."""
    current = identity()
    now = monotonic_ms()
    if (
        set(config) != CONFIG_KEYS
        or not integer(config.get("schemaVersion"))
        or config["schemaVersion"] != 1
        or config.get("kind") != "original-observer-client-delivery"
    ):
        reject("Original guest delivery request schema differs")
    if (
        not isinstance(config.get("instanceId"), str)
        or re.fullmatch(r"[1-9][0-9]{0,19}", config["instanceId"]) is None
        or not isinstance(config.get("nonce"), str)
        or re.fullmatch(r"[a-f0-9]{64}", config["nonce"]) is None
    ):
        reject("Original guest delivery identity or nonce differs")
    if (
        current.get("user") != "ubuntu"
        or not integer(config.get("uid"))
        or config["uid"] <= 0
        or config["uid"] != current.get("uid")
    ):
        reject("Original unprivileged observer user differs")
    if any(
        config.get(key) != current.get(key)
        for key in ("bootId", "pythonPath", "pythonSha256")
    ):
        reject("Original guest kernel or interpreter differs")
    deadline = config.get("guestDeadlineMs")
    if not integer(deadline) or not 0 < deadline - now <= COMMAND_LIMIT_MS:
        reject("Original guest command deadline differs or is exhausted")
    if (
        config.get("installerSha256") != INSTALLER_SHA256
        or sha(source) != INSTALLER_SHA256
    ):
        reject("Original guest installer source differs")
    if config.get("archiveSha256") != ARCHIVE_SHA256:
        reject("Original guest artifact identity differs")
    return current


def private_directory(path: Path) -> None:
    """Admit a canonical owned private journal directory."""
    if not path.is_absolute() or path.resolve() != path:
        reject("Original private guest journal path differs")
    value = path.lstat()
    if (
        not stat.S_ISDIR(value.st_mode)
        or value.st_uid != os.getuid()
        or value.st_mode & 0o777 != PRIVATE_MODE
    ):
        reject("Original private guest journal ownership differs")


def load_installer(source: bytes, path: Path) -> types.ModuleType:
    """Load only the exact owned shipped installation source."""
    if sha(source) != INSTALLER_SHA256:
        reject("Original guest installer source differs")
    private_directory(path.parent)
    descriptor = os.open(
        path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400
    )
    with os.fdopen(descriptor, "wb") as output:
        output.write(source)
        output.flush()
        os.fsync(output.fileno())
    before = path.lstat()
    spec = importlib.util.spec_from_file_location(
        "xcsh_original_observer_client_installer", path
    )
    if spec is None or spec.loader is None:
        reject("Original guest installer loader unavailable")
    module = importlib.util.module_from_spec(spec)
    bytecode = sys.dont_write_bytecode
    try:
        sys.dont_write_bytecode = True
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = bytecode
    after = path.lstat()
    if (before.st_ino, before.st_dev, before.st_mtime_ns, before.st_ctime_ns) != (
        after.st_ino,
        after.st_dev,
        after.st_mtime_ns,
        after.st_ctime_ns,
    ) or sha(path.read_bytes()) != INSTALLER_SHA256:
        reject("Original guest installer changed during loading")
    return module


def persist(
    root: Path,
    name: str,
    value: dict[str, Any],
    _installer: types.ModuleType | None = None,
) -> None:
    """Retain original receipts without depending on installer loading."""
    private_directory(root)
    before = root.lstat()
    descriptor = os.open(
        root / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400
    )
    with os.fdopen(descriptor, "wb") as output:
        output.write((json.dumps(value, sort_keys=True) + "\n").encode())
        output.flush()
        os.fsync(output.fileno())
    directory_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    private_directory(root)
    after = root.lstat()
    if (before.st_dev, before.st_ino, before.st_uid, before.st_mode) != (
        after.st_dev,
        after.st_ino,
        after.st_uid,
        after.st_mode,
    ):
        reject("Original guest receipt directory changed")


def receive(fd: int, path: Path, deadline: int, guard: Any) -> tuple[int, str]:
    """Persist bounded partial ingress while observing the original deadline."""
    poller = select.poll()
    poller.register(fd, select.POLLIN | select.POLLHUP | select.POLLERR)
    original_blocking = os.get_blocking(fd)
    os.set_blocking(fd, False)
    digest = hashlib.sha256()
    total = 0
    descriptor = os.open(
        path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600
    )
    try:
        while True:
            guard("ingress")
            remaining = deadline - monotonic_ms()
            if remaining <= 0:
                reject("Original guest ingress deadline exhausted")
            events = poller.poll(min(remaining, 100))
            if not events:
                continue
            try:
                chunk = os.read(fd, 65536)
            except BlockingIOError:
                continue
            if not chunk:
                return total, digest.hexdigest()
            total += len(chunk)
            if total > MAXIMUM:
                reject("Original guest archive exceeds bound")
            digest.update(chunk)
            offset = 0
            while offset < len(chunk):
                guard("ingress-write")
                offset += os.write(descriptor, chunk[offset:])
            os.fsync(descriptor)
    finally:
        os.fchmod(descriptor, 0o400)
        os.fsync(descriptor)
        os.close(descriptor)
        os.set_blocking(fd, original_blocking)


def retain_failure(journal: Path, phase: str, error: Exception, deadline: int) -> None:
    """Retain the first failure within its unchanged final capture window."""
    final_started = min(monotonic_ms(), deadline)
    if monotonic_ms() >= final_started + FINAL_LIMIT_MS:
        reject("Original guest final capture deadline exhausted")
    try:
        persist(
            journal,
            "failure.private.json",
            {
                "schemaVersion": 1,
                "complete": False,
                "phase": phase,
                "errorType": type(error).__name__,
                "originalDeadlineMs": deadline,
                "finalStartedMs": final_started,
                "finalDeadlineMs": final_started + FINAL_LIMIT_MS,
                "guestClientQualified": False,
            },
        )
    except Exception as retention:
        message = "Original guest failure and final retention both failed"
        raise ExceptionGroup(message, [error, retention]) from error


def run_delivery(config: dict[str, Any], source: bytes, fd: int) -> dict[str, Any]:
    """Receive once, retain partials and install within the original guest budget."""
    config = dict(config)
    original = validate(config, source)
    deadline = config["guestDeadlineMs"]
    started = monotonic_ms()

    def guard(_phase: str) -> None:
        if monotonic_ms() >= deadline:
            reject("Original guest command deadline exhausted")
        if identity() != original:
            reject("Original guest execution identity changed")

    base = (
        Path.home() / ".local/share/xcsh/gcp-observer-delivery" / config["instanceId"]
    )
    journal = base / config["nonce"]
    clients = base.parent.parent / "gcp-observer-clients" / config["instanceId"]
    guard("prepare")
    if not base.is_absolute() or base.resolve() != base:
        reject("Original guest journal parent is not canonical")
    base.mkdir(parents=True, exist_ok=True, mode=PRIVATE_MODE)
    private_directory(base)
    try:
        journal.mkdir(mode=PRIVATE_MODE)
    except FileExistsError as cause:
        message = "Original guest delivery is single-use; prior receipt retained"
        raise ValueError(message) from cause
    phase = "request-persistence"
    try:
        private_directory(journal)
        persist(journal, "request.private.json", config)
        phase = "installer-loading"
        installer = load_installer(source, journal / "installer.py")
        phase = "archive-ingress"
        ingress = receive(fd, journal / "archive.partial", deadline, guard)
        persist(
            journal,
            "ingress.private.json",
            {
                "bytes": ingress[0],
                "sha256": ingress[1],
                "complete": ingress[1] == ARCHIVE_SHA256,
                "finishedMs": monotonic_ms(),
            },
            installer,
        )
        if ingress[1] != ARCHIVE_SHA256:
            reject("Original guest archive is incomplete or changed")
        guard("inspect-ingress")
        raw = installer.read_owned(journal / "archive.partial", 0o400)
        phase = "client-installation"
        installed = installer.install(raw, clients, guard=guard)
        guard("inspect-clients")
        result = {
            "schemaVersion": 1,
            "kind": "original-observer-installed-client-bytes",
            "instanceId": config["instanceId"],
            "nonce": config["nonce"],
            "uid": original["uid"],
            "bootId": original["bootId"],
            "pythonPath": original["pythonPath"],
            "pythonSha256": original["pythonSha256"],
            "archiveSha256": ingress[1],
            "clientRoot": str(clients),
            "startedMs": started,
            "finishedMs": monotonic_ms(),
            "originalDeadlineMs": deadline,
            "installedBytesVerified": installed["status"]
            in ("ready", "already-installed"),
            "abiVerified": False,
            "guestClientQualified": False,
        }
        persist(journal, "installed.private.json", result, installer)
        guard("complete")
    except Exception as error:
        retain_failure(journal, phase, error, deadline)
        raise
    return result
