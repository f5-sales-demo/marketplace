"""Read-only ABI renewal over an original installation and a fresh peer proof."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import re
import stat
import sys
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any, NoReturn

if TYPE_CHECKING:
    import types

ABI_SHA256 = "4c577d5b440e95e7745f4def2d39bb33a2cd70d7f698f31c23b7fc4ca449bc03"
SCHEMA_VERSION = 2
PRIVATE_MODE = 0o700
COMMAND_MS = 60000
FRESH_MS = 300000
KEYS = {
    "schemaVersion",
    "kind",
    "instanceId",
    "nonce",
    "uid",
    "bootId",
    "pythonPath",
    "pythonSha256",
    "archiveSha256",
    "guestDeadlineMs",
    "installationNonce",
    "installationReceiptSha256",
    "installationFinishedMs",
    "peerChallenge",
    "peerMonotonicMs",
}
INSTALLATION_FIELDS = {
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


def reject(message: str) -> NoReturn:
    """Refuse unavailable or changed original renewal inputs."""
    raise ValueError(message)


def integer(value: object) -> bool:
    """Reject boolean substitutions for original kernel clock values."""
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def monotonic_ms() -> int:
    """Use the original guest kernel clock without resetting its budget."""
    return time.monotonic_ns() // 1000000


def request(config: dict[str, Any], source: bytes) -> dict[str, Any]:
    """Validate the source-selected v2 request and produce v1 probe guard inputs."""
    if (
        set(config) != KEYS
        or not integer(config.get("schemaVersion"))
        or config["schemaVersion"] != SCHEMA_VERSION
    ):
        reject("Original ABI renewal schema differs")
    if config.get("kind") != "original-observer-client-abi-renewal":
        reject("Original ABI renewal kind differs")
    for key in (
        "nonce",
        "installationNonce",
        "installationReceiptSha256",
        "peerChallenge",
    ):
        if (
            not isinstance(config.get(key), str)
            or re.fullmatch(r"[a-f0-9]{64}", config[key]) is None
        ):
            reject("Original ABI renewal nonce or receipt binding differs")
    if (
        not isinstance(config.get("instanceId"), str)
        or re.fullmatch(r"[1-9][0-9]{0,19}", config["instanceId"]) is None
    ):
        reject("Original ABI renewal numeric VM differs")
    if (
        not integer(config.get("guestDeadlineMs"))
        or not 0 < config["guestDeadlineMs"] - monotonic_ms() <= COMMAND_MS
    ):
        reject("Original ABI renewal deadline differs")
    if (
        not integer(config.get("peerMonotonicMs"))
        or not 0 <= monotonic_ms() - config["peerMonotonicMs"] <= FRESH_MS
    ):
        reject("Original ABI renewal peer proof is stale or future")
    if config["guestDeadlineMs"] > config["peerMonotonicMs"] + FRESH_MS:
        reject("Original ABI renewal deadline exceeds original peer freshness")
    if (
        not integer(config.get("installationFinishedMs"))
        or config["installationFinishedMs"] > config["peerMonotonicMs"]
    ):
        reject("Original ABI renewal installation clock differs")
    if hashlib.sha256(source).hexdigest() != ABI_SHA256:
        reject("Original ABI renewal helper source differs")
    legacy = {
        key: value
        for key, value in config.items()
        if key
        not in (
            "installationNonce",
            "installationReceiptSha256",
            "installationFinishedMs",
            "peerChallenge",
            "peerMonotonicMs",
        )
    }
    legacy.update(
        schemaVersion=1,
        kind="original-observer-client-abi",
        deliveryNonce=config["installationNonce"],
        deliveryReceiptSha256=config["installationReceiptSha256"],
        deliveryFinishedMs=config["installationFinishedMs"],
    )
    return legacy


def private_directory(path: Path) -> None:
    """Require the original canonical owned private renewal journal."""
    value = path.lstat()
    if (
        path.resolve() != path
        or not stat.S_ISDIR(value.st_mode)
        or value.st_uid != os.getuid()
        or stat.S_IMODE(value.st_mode) != PRIVATE_MODE
    ):
        reject("Original ABI renewal journal ownership differs")


def load_abi(source: bytes, path: Path) -> types.ModuleType:
    """Persist and load only the pinned original ABI implementation."""
    if hashlib.sha256(source).hexdigest() != ABI_SHA256:
        reject("Original ABI renewal helper source differs")
    private_directory(path.parent)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
    with os.fdopen(fd, "wb") as stream:
        stream.write(source)
        stream.flush()
        os.fsync(stream.fileno())
    before = path.lstat()
    spec = importlib.util.spec_from_file_location("xcsh_original_abi_renewal", path)
    if spec is None or spec.loader is None:
        reject("Original ABI renewal loader unavailable")
    module = importlib.util.module_from_spec(spec)
    bytecode = sys.dont_write_bytecode
    try:
        sys.dont_write_bytecode = True
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = bytecode
    after = path.lstat()
    if (before.st_dev, before.st_ino, before.st_mtime_ns, before.st_ctime_ns) != (
        after.st_dev,
        after.st_ino,
        after.st_mtime_ns,
        after.st_ctime_ns,
    ) or hashlib.sha256(path.read_bytes()).hexdigest() != ABI_SHA256:
        reject("Original ABI renewal source changed during loading")
    return module


def original_installation(
    module: types.ModuleType, config: dict[str, Any]
) -> tuple[Path, tuple[int, ...]]:
    """Join immutable installation facts without relabeling their old clock fresh."""
    path = (
        Path.home()
        / ".local/share/xcsh/gcp-observer-delivery"
        / config["instanceId"]
        / config["installationNonce"]
        / "installed.private.json"
    )
    original = module.file_identity(path)
    packet = module.decode_object(
        module.read_owned(path, config["installationReceiptSha256"], 0o400)
    )
    if module.file_identity(path) != original:
        reject("Original ABI renewal installation receipt changed")
    if (
        set(packet) != INSTALLATION_FIELDS
        or not integer(packet.get("schemaVersion"))
        or packet["schemaVersion"] != 1
        or packet.get("kind") != "original-observer-installed-client-bytes"
    ):
        reject("Original ABI renewal installation schema differs")
    if any(
        packet.get(key) != config[key]
        for key in (
            "instanceId",
            "uid",
            "bootId",
            "pythonPath",
            "pythonSha256",
            "archiveSha256",
        )
    ):
        reject("Original ABI renewal installation identity differs")
    if packet.get("nonce") != config["installationNonce"] or packet.get(
        "clientRoot"
    ) != str(
        Path.home() / ".local/share/xcsh/gcp-observer-clients" / config["instanceId"]
    ):
        reject("Original ABI renewal installation nonce or path differs")
    if (
        packet.get("installedBytesVerified") is not True
        or packet.get("abiVerified") is not False
        or packet.get("guestClientQualified") is not False
    ):
        reject("Original ABI renewal installation qualification differs")
    if not all(
        integer(packet.get(key))
        for key in ("startedMs", "finishedMs", "originalDeadlineMs")
    ):
        reject("Original ABI renewal installation clocks differ")
    if (
        not packet["startedMs"] <= packet["finishedMs"] < packet["originalDeadlineMs"]
        or packet["finishedMs"] - packet["startedMs"] > COMMAND_MS
        or packet["finishedMs"] != config["installationFinishedMs"]
    ):
        reject("Original ABI renewal original installation interval differs")
    return path, original


def retain_failure(root: Path, config: dict[str, Any], error: Exception) -> None:
    """Reserve separate final evidence on every failed renewal without replay."""
    private_directory(root)
    final_started = min(monotonic_ms(), config["guestDeadlineMs"])
    value = {
        "schemaVersion": 2,
        "kind": "original-observer-abi-renewal-failure",
        "errorType": type(error).__name__,
        "complete": False,
        "originalDeadlineMs": config["guestDeadlineMs"],
        "finalStartedMs": final_started,
        "finalDeadlineMs": final_started + FRESH_MS,
        "installationReceiptSha256": config["installationReceiptSha256"],
        "installationReplayed": False,
        "guestClientQualified": False,
        "signalsSent": False,
    }
    fd = os.open(
        root / "failure.private.json",
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
        0o400,
    )
    with os.fdopen(fd, "wb") as output:
        output.write((json.dumps(value, sort_keys=True) + "\n").encode())
        output.flush()
        os.fsync(output.fileno())


def guard_peer_clock(config: dict[str, Any]) -> None:
    """Keep the original peer freshness and command deadline inside every probe."""
    now = monotonic_ms()
    if not 0 <= now - config["peerMonotonicMs"] <= FRESH_MS:
        reject("Original ABI renewal peer proof is stale or future")
    if now >= config["guestDeadlineMs"]:
        reject("Original ABI renewal deadline exhausted")


def guard_peer(
    module: types.ModuleType,
    config: dict[str, Any],
    legacy: dict[str, Any],
    current: dict[str, Any],
    receipt: tuple[Path, tuple[int, ...]],
) -> None:
    """Join fresh peer clocks to the unchanged original identity/receipt guard."""
    guard_peer_clock(config)
    module.guard(legacy, current, receipt)


def probe_clients(
    module: types.ModuleType,
    config: dict[str, Any],
    legacy: dict[str, Any],
    current: dict[str, Any],
    receipt: tuple[Path, tuple[int, ...]],
    journal: Path,
) -> list[dict[str, Any]]:
    """Probe all original installed clients serially without invoking an installer."""
    scope = module.OriginalGuestScope(current, receipt)
    clients = (
        Path.home() / ".local/share/xcsh/gcp-observer-clients" / config["instanceId"]
    )
    module.directory(clients)
    module.read_owned(clients / "archive.zip", config["archiveSha256"], 0o400)
    for name, digest in module.FILES.items():
        module.read_owned(clients / "bin" / name, digest, 0o500)
    module.persist(journal, "request.private.json", config)
    original_guard = module.guard

    def guarded_probe(
        inputs: dict[str, Any],
        guest: dict[str, Any],
        original_receipt: tuple[Path, tuple[int, ...]] | None = None,
    ) -> None:
        """Add fresh peer clocks to each internal frozen probe guard without replay."""
        guard_peer_clock(config)
        original_guard(inputs, guest, original_receipt)

    vars(module)["guard"] = guarded_probe
    processes = []
    try:
        for name, args, code, marker in [
            ("ssh", ["-V"], 0, b"OpenSSH_10.6p2,"),
            ("ssh-keyscan", [], 1, b"usage: ssh-keyscan"),
            (
                "ssh-keygen",
                ["-l", "-f", "/dev/null"],
                255,
                b"/dev/null is not a public key file.",
            ),
        ]:
            guard_peer(module, config, legacy, current, receipt)
            processes.append(
                module.probe(
                    clients / "bin" / name, args, code, marker, legacy, journal, scope
                )
            )
        guard_peer(module, config, legacy, current, receipt)
    finally:
        vars(module)["guard"] = original_guard
    return processes


def renew_original_clients(config: dict[str, Any], source: bytes) -> dict[str, Any]:
    """Execute fresh sealed client probes over the original installed bytes."""
    config = dict(config)
    legacy = request(config, source)
    started = monotonic_ms()
    base = (
        Path.home()
        / ".local/share/xcsh/gcp-observer-abi-renewal"
        / config["instanceId"]
    )
    if base.resolve() != base:
        reject("Original ABI renewal journal path differs")
    base.mkdir(parents=True, exist_ok=True, mode=PRIVATE_MODE)
    private_directory(base)
    journal = base / config["nonce"]
    try:
        journal.mkdir(mode=PRIVATE_MODE)
    except FileExistsError as cause:
        message = "Original ABI renewal is single-use"
        raise ValueError(message) from cause
    try:
        module = load_abi(source, journal / "abi.py")
        current = module.validate_request(legacy)
        receipt = original_installation(module, config)
        processes = probe_clients(module, config, legacy, current, receipt, journal)
        result = {
            "schemaVersion": 2,
            "kind": "original-observer-client-abi-renewal-proof",
            **{
                key: value
                for key, value in config.items()
                if key not in ("schemaVersion", "kind", "guestDeadlineMs")
            },
            "clientRoot": str(
                Path.home()
                / ".local/share/xcsh/gcp-observer-clients"
                / config["instanceId"]
            ),
            "originalDeadlineMs": config["guestDeadlineMs"],
            "startedMs": started,
            "finishedMs": monotonic_ms(),
            "processes": processes,
            "abiVerified": True,
            "guestClientQualified": False,
            "installationReplayed": False,
        }
        if len(json.dumps(result).encode()) > module.MAX_OUTPUT:
            reject("Original ABI renewal proof exceeds bound")
        module.persist(journal, "proof.private.json", result)
        guard_peer(module, config, legacy, current, receipt)
    except Exception as error:
        try:
            retain_failure(journal, config, error)
        except Exception as retention:
            message = "Original ABI renewal failure retention unavailable"
            raise ExceptionGroup(message, [error, retention]) from retention
        raise
    return result
