"""Fixed original-ABI-bound CE wire scan. No SSH login or cloud trust grant."""

from __future__ import annotations

import hashlib
import importlib.util
import ipaddress
import json
import os
import pwd
import re
import stat
import sys
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any, NoReturn, TypeGuard

if TYPE_CHECKING:
    import types

ABI_SHA256 = "4c577d5b440e95e7745f4def2d39bb33a2cd70d7f698f31c23b7fc4ca449bc03"
ARCHIVE_SHA256 = "243b9555199a427ca90e939310d03917f380b470aaed14200c28101e797ec318"
COMMAND_MS = 60000
FRESH_MS = 300000
RENEWAL_SCHEMA_VERSION = 2
REQUIRED_CLIENT_PROCESSES = 3
PRIVATE_MODE = 0o700
KEYS = {
    "schemaVersion",
    "kind",
    "nonce",
    "observerInstanceId",
    "abiNonce",
    "abiReceiptSha256",
    "uid",
    "bootId",
    "pythonPath",
    "pythonSha256",
    "archiveSha256",
    "guestDeadlineMs",
    "targetInstanceId",
    "targetAddress",
    "project",
    "zone",
    "nodeName",
    "network",
    "subnet",
}


def reject(message: str) -> NoReturn:
    """Refuse changed or unavailable original scope without executing a scan."""
    raise ValueError(message)


def sha(raw: bytes) -> str:
    """Hash exact original source and evidence bytes."""
    return hashlib.sha256(raw).hexdigest()


def monotonic_ms() -> int:
    """Keep the original guest kernel clock for every stage."""
    return time.monotonic_ns() // 1000000


def identity() -> dict[str, Any]:
    """Read the actual original guest user, boot and interpreter."""
    return {
        "uid": os.getuid(),
        "user": pwd.getpwuid(os.getuid()).pw_name,
        "bootId": Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
        "pythonPath": str(Path("/proc/self/exe").readlink()),
        "pythonSha256": sha(Path("/proc/self/exe").read_bytes()),
    }


def integer(value: object) -> TypeGuard[int]:
    """Require integers while explicitly rejecting boolean substitutions."""
    return isinstance(value, int) and not isinstance(value, bool)


def validate_target(config: dict[str, Any]) -> None:
    """Validate the fixed IPv4, project, zone and reviewed network identities."""
    try:
        address = str(ipaddress.IPv4Address(config.get("targetAddress")))
    except ipaddress.AddressValueError as cause:
        message = "Original CE keyscan IPv4 target differs"
        raise ValueError(message) from cause
    if address != config["targetAddress"]:
        reject("Original CE keyscan canonical address differs")
    if (
        not isinstance(config.get("project"), str)
        or re.fullmatch(r"[a-z][a-z0-9-]{4,61}[a-z0-9]", config["project"]) is None
    ):
        reject("Original CE keyscan project differs")
    if (
        not isinstance(config.get("zone"), str)
        or re.fullmatch(r"[a-z][a-z0-9-]*[0-9]+-[a-z]", config["zone"]) is None
    ):
        reject("Original CE keyscan zone differs")
    if (
        not isinstance(config.get("nodeName"), str)
        or re.fullmatch(r"[a-z][a-z0-9-]{0,62}", config["nodeName"]) is None
    ):
        reject("Original CE keyscan node name differs")
    project = re.escape(config["project"])
    region = re.escape(config["zone"].rsplit("-", 1)[0])
    for key, prefix in (
        ("network", rf"projects/{project}/global/networks/"),
        ("subnet", rf"projects/{project}/regions/{region}/subnetworks/"),
    ):
        if (
            not isinstance(config.get(key), str)
            or re.fullmatch(prefix + r"[a-z][a-z0-9-]{0,62}", config[key]) is None
        ):
            reject("Original CE keyscan reviewed network mapping differs")


def validate(config: dict[str, Any], source: bytes) -> dict[str, Any]:
    """Admit only the exact source-selected guest, ABI and CE target mapping."""
    current = identity()
    if (
        set(config) != KEYS
        or not integer(config.get("schemaVersion"))
        or config["schemaVersion"] not in (1, 2)
    ):
        reject("Original CE keyscan schema differs")
    if (
        config.get("kind") != "original-observer-ce-keyscan"
        or current.get("user") != "ubuntu"
    ):
        reject("Original CE keyscan user or kind differs")
    if (
        not integer(config.get("uid"))
        or config["uid"] <= 0
        or config["uid"] != current["uid"]
    ):
        reject("Original CE keyscan numeric user differs")
    if any(
        config.get(key) != current[key]
        for key in ("bootId", "pythonPath", "pythonSha256")
    ):
        reject("Original CE keyscan guest identity differs")
    for key in ("observerInstanceId", "targetInstanceId"):
        if (
            not isinstance(config.get(key), str)
            or re.fullmatch(r"[1-9][0-9]{0,19}", config[key]) is None
        ):
            reject("Original CE keyscan numeric VM identity differs")
    if config["observerInstanceId"] == config["targetInstanceId"]:
        reject("Original observer and CE identities must differ")
    for key in ("nonce", "abiNonce", "abiReceiptSha256"):
        if (
            not isinstance(config.get(key), str)
            or re.fullmatch(r"[a-f0-9]{64}", config[key]) is None
        ):
            reject("Original CE keyscan nonce or ABI receipt differs")
    validate_target(config)
    if (
        not integer(config.get("guestDeadlineMs"))
        or not 0 < config["guestDeadlineMs"] - monotonic_ms() <= COMMAND_MS
    ):
        reject("Original CE keyscan deadline differs")
    if config.get("archiveSha256") != ARCHIVE_SHA256 or sha(source) != ABI_SHA256:
        reject("Original CE keyscan artifact or helper source differs")
    return current


def private_directory(path: Path) -> None:
    """Admit only the owned canonical original guest journal."""
    if not path.is_absolute() or path.resolve() != path:
        reject("Original CE keyscan private path differs")
    value = path.lstat()
    if (
        not stat.S_ISDIR(value.st_mode)
        or value.st_uid != os.getuid()
        or stat.S_IMODE(value.st_mode) != PRIVATE_MODE
    ):
        reject("Original CE keyscan private directory differs")


def persist(root: Path, name: str, value: dict[str, Any]) -> None:
    """Retain exclusive incomplete and complete evidence independently of loading."""
    private_directory(root)
    fd = os.open(
        root / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400
    )
    with os.fdopen(fd, "wb") as stream:
        stream.write((json.dumps(value, sort_keys=True) + "\n").encode())
        stream.flush()
        os.fsync(stream.fileno())


def load_abi(source: bytes, path: Path) -> types.ModuleType:
    """Load the exact owned source used by the independently qualified ABI."""
    if sha(source) != ABI_SHA256:
        reject("Original CE keyscan ABI helper source differs")
    private_directory(path.parent)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
    with os.fdopen(fd, "wb") as stream:
        stream.write(source)
        stream.flush()
        os.fsync(stream.fileno())
    before = path.lstat()
    spec = importlib.util.spec_from_file_location("xcsh_original_ce_keyscan_abi", path)
    if spec is None or spec.loader is None:
        reject("Original CE keyscan ABI loader unavailable")
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
    ) or sha(path.read_bytes()) != ABI_SHA256:
        reject("Original CE keyscan ABI source changed during loading")
    return module


def original_proof(
    module: types.ModuleType, config: dict[str, Any]
) -> tuple[Path, tuple[int, ...]]:
    """Bind the exact original ABI receipt and current guest clock."""
    version = config.get("schemaVersion")
    if not integer(version) or version not in (1, 2):
        reject("Original CE keyscan ABI schema differs")
    path = (
        Path.home()
        / (
            ".local/share/xcsh/gcp-observer-abi"
            if version == 1
            else ".local/share/xcsh/gcp-observer-abi-renewal"
        )
        / config["observerInstanceId"]
        / config["abiNonce"]
        / "proof.private.json"
    )
    original = module.file_identity(path)
    value = module.decode_object(
        module.read_owned(path, config["abiReceiptSha256"], 0o400)
    )
    if module.file_identity(path) != original:
        reject("Original CE keyscan ABI receipt changed")
    if (
        not integer(value.get("schemaVersion"))
        or value["schemaVersion"] != version
        or value.get("kind")
        != (
            "original-observer-client-abi-proof"
            if version == 1
            else "original-observer-client-abi-renewal-proof"
        )
        or value.get("abiVerified") is not True
        or value.get("guestClientQualified") is not False
    ):
        reject("Original CE keyscan ABI proof qualification differs")
    if (
        value.get("instanceId") != config["observerInstanceId"]
        or value.get("nonce") != config["abiNonce"]
    ):
        reject("Original CE keyscan ABI receipt identity differs")
    if any(
        value.get(key) != config[key]
        for key in ("uid", "bootId", "pythonPath", "pythonSha256", "archiveSha256")
    ):
        reject("Original CE keyscan ABI guest binding differs")
    if (
        not integer(value.get("startedMs"))
        or not integer(value.get("finishedMs"))
        or not 0 <= monotonic_ms() - value["startedMs"] <= FRESH_MS
        or not value["startedMs"] <= value["finishedMs"] <= monotonic_ms()
    ):
        reject("Original CE keyscan ABI receipt is stale or future")
    if version == RENEWAL_SCHEMA_VERSION:
        renewal_installation(module, config, value)
    return path, original


def renewal_installation(
    module: types.ModuleType, config: dict[str, Any], proof: dict[str, Any]
) -> tuple[Path, tuple[int, ...]]:
    """Retain the unchanged installation behind an explicitly fresh V2 ABI."""
    for key in ("installationNonce", "installationReceiptSha256", "peerChallenge"):
        if (
            not isinstance(proof.get(key), str)
            or re.fullmatch(r"[a-f0-9]{64}", proof[key]) is None
        ):
            reject("Original CE renewal installation or peer binding differs")
    if (
        set(proof)
        != {
            "schemaVersion",
            "kind",
            "instanceId",
            "nonce",
            "uid",
            "bootId",
            "pythonPath",
            "pythonSha256",
            "archiveSha256",
            "installationNonce",
            "installationReceiptSha256",
            "installationFinishedMs",
            "peerChallenge",
            "peerMonotonicMs",
            "clientRoot",
            "originalDeadlineMs",
            "startedMs",
            "finishedMs",
            "processes",
            "abiVerified",
            "guestClientQualified",
            "installationReplayed",
        }
        or proof.get("installationReplayed") is not False
        or proof.get("clientRoot")
        != str(
            Path.home()
            / ".local/share/xcsh/gcp-observer-clients"
            / config["observerInstanceId"]
        )
    ):
        reject("Original CE renewal installation framing differs")
    if (
        not integer(proof.get("installationFinishedMs"))
        or not integer(proof.get("peerMonotonicMs"))
        or not integer(proof.get("originalDeadlineMs"))
    ):
        reject("Original CE renewal clock types differ")
    if (
        not 0
        < proof["installationFinishedMs"]
        <= proof["peerMonotonicMs"]
        <= proof["startedMs"]
        or not 0 <= monotonic_ms() - proof["peerMonotonicMs"] <= FRESH_MS
        or not proof["startedMs"] <= proof["finishedMs"] < proof["originalDeadlineMs"]
        or proof["finishedMs"] - proof["startedMs"] > COMMAND_MS
    ):
        reject("Original CE renewal peer or installation clocks differ")
    if (
        not isinstance(proof.get("processes"), list)
        or len(proof["processes"]) != REQUIRED_CLIENT_PROCESSES
    ):
        reject("Original CE renewal peer, installation or probe clocks differ")
    path = (
        Path.home()
        / ".local/share/xcsh/gcp-observer-delivery"
        / config["observerInstanceId"]
        / proof["installationNonce"]
        / "installed.private.json"
    )
    original = module.file_identity(path)
    packet = module.decode_object(
        module.read_owned(path, proof["installationReceiptSha256"], 0o400)
    )
    if module.file_identity(path) != original:
        reject("Original CE renewal installation changed during reading")
    if (
        set(packet)
        != {
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
        or not integer(packet.get("schemaVersion"))
        or packet["schemaVersion"] != 1
        or packet.get("kind") != "original-observer-installed-client-bytes"
    ):
        reject("Original CE renewal installation schema differs")
    if (
        packet.get("instanceId") != config["observerInstanceId"]
        or packet.get("nonce") != proof["installationNonce"]
        or packet.get("clientRoot")
        != str(
            Path.home()
            / ".local/share/xcsh/gcp-observer-clients"
            / config["observerInstanceId"]
        )
        or any(
            packet.get(key) != config[key]
            for key in ("uid", "bootId", "pythonPath", "pythonSha256", "archiveSha256")
        )
    ):
        reject("Original CE renewal installation identity differs")
    if (
        packet.get("installedBytesVerified") is not True
        or packet.get("abiVerified") is not False
        or packet.get("guestClientQualified") is not False
    ):
        reject("Original CE renewal installation qualification differs")
    if (
        not all(
            integer(packet.get(key))
            for key in ("startedMs", "finishedMs", "originalDeadlineMs")
        )
        or not 0
        < packet["startedMs"]
        <= packet["finishedMs"]
        < packet["originalDeadlineMs"]
        or packet["finishedMs"] - packet["startedMs"] > COMMAND_MS
        or packet["finishedMs"] != proof["installationFinishedMs"]
    ):
        reject("Original CE renewal installation identity or interval differs")
    return path, original


def bind_original_proof_guard(
    module: types.ModuleType, config: dict[str, Any]
) -> tuple[Path, tuple[int, ...]]:
    """Bind independent installation identity and fresh ABI evidence for every probe stage."""
    receipt = original_proof(module, config)
    installation = (
        renewal_installation(
            module,
            config,
            module.decode_object(
                module.read_owned(receipt[0], config["abiReceiptSha256"], 0o400)
            ),
        )
        if config["schemaVersion"] == RENEWAL_SCHEMA_VERSION
        else None
    )
    original_guard = module.guard

    def retained_guard(
        guard_inputs: dict[str, Any],
        guest: dict[str, Any],
        abi_receipt: tuple[Path, tuple[int, ...]] | None = None,
    ) -> None:
        """Preserve both original receipt identities and freshness throughout execution."""
        original_guard(guard_inputs, guest, abi_receipt)
        if (
            installation is not None
            and module.file_identity(installation[0]) != installation[1]
        ):
            reject("Original CE renewal installation identity changed")
        original_proof(module, config)

    vars(module)["guard"] = retained_guard
    return receipt


def run_ce_keyscan(config: dict[str, Any], source: bytes) -> dict[str, Any]:
    """Execute the original sealed client once against the exact reviewed target."""
    config = dict(config)
    original = validate(config, source)
    started = monotonic_ms()
    base = (
        Path.home() / ".local/share/xcsh/gcp-ce-keyscan" / config["observerInstanceId"]
    )
    if base.resolve() != base:
        reject("Original CE keyscan journal parent differs")
    base.mkdir(parents=True, exist_ok=True, mode=PRIVATE_MODE)
    private_directory(base)
    journal = base / config["nonce"]
    try:
        journal.mkdir(mode=PRIVATE_MODE)
    except FileExistsError as cause:
        message = (
            "Original CE keyscan is single-use; retained journal cannot be replayed"
        )
        raise ValueError(message) from cause
    try:
        persist(journal, "request.private.json", config)
        module = load_abi(source, journal / "abi.py")
        receipt = bind_original_proof_guard(module, config)
        guard_config = {**config, "deliveryReceiptSha256": config["abiReceiptSha256"]}
        module.guard(guard_config, original, receipt)
        clients = (
            Path.home()
            / ".local/share/xcsh/gcp-observer-clients"
            / config["observerInstanceId"]
        )
        module.read_owned(clients / "archive.zip", ARCHIVE_SHA256, 0o400)
        args = ["-q", "-T", "15", "-t", "rsa", "-p", "22", config["targetAddress"]]
        process = module.probe(
            clients / "bin/ssh-keyscan",
            args,
            0,
            b"",
            guard_config,
            journal,
            module.OriginalGuestScope(original, receipt),
        )
        module.guard(guard_config, original, receipt)
        if not process["stdoutBase64"]:
            reject("Original CE keyscan returned no complete wire evidence")
        result = {
            "schemaVersion": config["schemaVersion"],
            "kind": "original-observer-ce-keyscan-proof",
            **{
                key: config[key]
                for key in KEYS
                if key not in ("schemaVersion", "kind", "guestDeadlineMs")
            },
            "interfaceIndex": 1,
            "role": "sli",
            "process": process,
            "startedMs": started,
            "finishedMs": monotonic_ms(),
            "originalDeadlineMs": config["guestDeadlineMs"],
            "sshTrustQualified": False,
            "guestAccessQualified": False,
        }
        persist(journal, "proof.private.json", result)
        module.guard(guard_config, original, receipt)
    except (ValueError, OSError) as error:
        final_started = min(monotonic_ms(), config["guestDeadlineMs"])
        try:
            persist(
                journal,
                "failure.private.json",
                {
                    "errorType": type(error).__name__,
                    "complete": False,
                    "signalsSent": False,
                    "originalDeadlineMs": config["guestDeadlineMs"],
                    "finalStartedMs": final_started,
                    "finalDeadlineMs": final_started + FRESH_MS,
                    "sshTrustQualified": False,
                },
            )
        except (ValueError, OSError) as retention:
            message = "Original CE keyscan failure and retention both failed"
            raise ExceptionGroup(message, [error, retention]) from error
        raise
    return result
