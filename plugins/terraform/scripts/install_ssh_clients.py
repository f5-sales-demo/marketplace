"""Install only the pinned OpenSSH clients in private user scope.

The bundled artifact includes the unmodified OpenSSH redistribution notices.
No server, host key, system configuration, package manager or service is installed.
"""

import argparse
import ctypes
import hashlib
import io
import json
import os
import platform
import stat
import sys
import uuid
import zipfile
from collections.abc import Callable
from pathlib import Path
from typing import Any, NoReturn

VERSION = "10.6p2"
ASSET = "openssh-10.6p2-linux-amd64.zip"
ARCHIVE_SHA256 = "243b9555199a427ca90e939310d03917f380b470aaed14200c28101e797ec318"
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
LICENSE_SHA256 = "5bb5b160726ef5756e4f32fe95b35249c294962419650f48d05134b486d27ccb"
BUILD_SHA256 = "c6e9bb0f5623eb0e3d34a60732fd1d96b896115252099729e29fb2de51863e6a"
MAXIMUM = 16 * 1024 * 1024
EXPECTED = {"bin/" + name for name in FILES} | {"LICENCE", "BUILD.json"}
DIRECTORY_MODE = 448
ELF_HEADER_BYTES = 64


def reject(message: str) -> NoReturn:
    """Refuse a failed installation invariant without weakening the check."""
    raise ValueError(message)


def sha(raw: bytes) -> str:
    """Hash exact retained bytes."""
    return hashlib.sha256(raw).hexdigest()


def canonical(path: Path) -> None:
    """Reject substituted or noncanonical path components."""
    if not path.is_absolute() or path.resolve() != path:
        reject("Canonical original client path required")
    for ancestor in [*reversed(path.parents), path]:
        if ancestor.is_symlink():
            reject("Original client path symlink refused")


def directory(path: Path, private: bool = True) -> tuple[int, int, int, int]:
    """Bind an owned directory without changing existing permissions."""
    canonical(path)
    value = path.lstat()
    if (
        not stat.S_ISDIR(value.st_mode)
        or value.st_uid != os.getuid()
        or value.st_mode & 0o022
        or (private and value.st_mode & 0o777 != DIRECTORY_MODE)
    ):
        reject("Private owned original client directory required")
    return (value.st_dev, value.st_ino, value.st_uid, value.st_mode)


def read_owned(path: Path, mode: int | None = None) -> bytes:
    """Read a bounded original single-link file and its original parent."""
    canonical(path)
    parent = directory(path.parent, private=False)
    before = path.lstat()
    if (
        not stat.S_ISREG(before.st_mode)
        or before.st_uid != os.getuid()
        or before.st_nlink != 1
        or before.st_mode & 0o022
    ):
        reject("Owned original client file required")
    if not 0 < before.st_size <= MAXIMUM or (
        mode is not None and before.st_mode & 0o777 != mode
    ):
        reject("Owned original client file required")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        opened = os.fstat(stream.fileno())
        if (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
            reject("Original client file changed during open")
        raw = stream.read(MAXIMUM + 1)
    after = path.lstat()
    keys = (
        "st_dev",
        "st_ino",
        "st_uid",
        "st_mode",
        "st_nlink",
        "st_size",
        "st_mtime_ns",
        "st_ctime_ns",
    )
    if (
        len(raw) > MAXIMUM
        or any(getattr(before, key) != getattr(after, key) for key in keys)
        or directory(path.parent, private=False) != parent
    ):
        reject("Original client file or parent changed")
    return raw


def unpack(raw: bytes) -> dict[str, bytes]:
    """Require the exact checksum, inventory, ELF platform and license bytes."""
    if len(raw) > MAXIMUM or sha(raw) != ARCHIVE_SHA256:
        reject("Pinned client archive checksum differs")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        if (
            len(entries) != len(EXPECTED)
            or {entry.filename for entry in entries} != EXPECTED
            or any(
                entry.is_dir()
                or entry.flag_bits & 1
                or stat.S_IFMT(entry.external_attr >> 16) not in (0, stat.S_IFREG)
                or (entry.file_size <= 0)
                or (entry.file_size > MAXIMUM)
                for entry in entries
            )
            or (sum(entry.file_size for entry in entries) > MAXIMUM)
        ):
            reject("Exact original client archive inventory required")
        result = {entry.filename: archive.read(entry) for entry in entries}
    for name, expected in FILES.items():
        binary = result["bin/" + name]
        if (
            sha(binary) != expected
            or len(binary) < ELF_HEADER_BYTES
            or binary[:6] != b"\x7fELF\x02\x01"
            or (binary[16:20] != b"\x03\x00>\x00")
        ):
            reject("Pinned Linux AMD64 client executable differs")
    if (
        sha(result["LICENCE"]) != LICENSE_SHA256
        or sha(result["BUILD.json"]) != BUILD_SHA256
    ):
        reject("Original client license or build evidence differs")
    build = json.loads(result["BUILD.json"])
    if (
        build.get("schemaVersion") != 1
        or build.get("version") != VERSION
        or build.get("platform") != "linux-amd64"
        or (build.get("files") != FILES)
    ):
        reject("Original client build scope differs")
    if (
        build.get("clientOnly") is not True
        or build.get("privilegedOperations") is not False
    ):
        reject("Original client build scope differs")
    return result


def declaration() -> dict[str, Any]:
    """Return installation metadata without claiming SSH authentication."""
    return {
        "schemaVersion": 1,
        "scope": "user",
        "version": VERSION,
        "platform": "linux-amd64",
        "archiveSha256": ARCHIVE_SHA256,
        "files": FILES,
        "licenseSha256": LICENSE_SHA256,
        "buildSha256": BUILD_SHA256,
        "privilegedOperations": False,
    }


def inspect(root: Path) -> dict[str, Any]:
    """Inspect the installed archive, exact file inventory and original bytes."""
    original = directory(root)
    if {item.name for item in root.iterdir()} != {
        "bin",
        "LICENCE",
        "BUILD.json",
        "archive.zip",
        "installation.json",
    }:
        reject("Exact original client installation inventory required")
    binary_directory = directory(root / "bin")
    if {item.name for item in (root / "bin").iterdir()} != set(FILES):
        reject("Exact original client executable inventory required")
    payload = unpack(read_owned(root / "archive.zip", 0o400))
    for name, raw in payload.items():
        actual = read_owned(root / name, 0o500 if name.startswith("bin/") else 0o400)
        if actual != raw:
            reject("Original installed client bytes differ")
    if json.loads(read_owned(root / "installation.json", 0o400)) != declaration():
        reject("Original client installation declaration differs")
    if directory(root) != original or directory(root / "bin") != binary_directory:
        reject("Original client installation directory changed")
    return {"status": "ready", **declaration()}


def write_owned(path: Path, raw: bytes, mode: int) -> None:
    """Persist one private file with exclusive creation and durable bytes."""
    descriptor = os.open(
        path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600
    )
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(raw)
        stream.flush()
        os.fchmod(stream.fileno(), mode)
        os.fsync(stream.fileno())


def sync_directory(path: Path) -> None:
    """Make completed directory entries durable."""
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def publish(stage: Path, target: Path) -> None:
    """Atomically publish without replacing any concurrent target.

    renameat2 is an ordinary Linux filesystem operation. No privileged
    operation or fallback that overwrites an existing directory is used.
    """
    library = ctypes.CDLL(None, use_errno=True)
    rename = getattr(library, "renameat2", None)
    if rename is None:
        reject("Atomic no-replace client publication unavailable")
    rename.argtypes = [
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_uint,
    ]
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(stage), -100, os.fsencode(target), 1) != 0:
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code), str(target))


def install(
    raw: bytes, root: Path, *, guard: Callable[[str], None] | None = None
) -> dict[str, Any]:
    """Prepare a staged user installation; every failed stage stays retained."""
    check = guard or (lambda _phase: None)
    check("start")
    payload = unpack(raw)
    check("decoded")
    canonical(root)
    if root.exists() or root.is_symlink():
        result = {**inspect(root), "status": "already-installed"}
        check("inspected-existing")
        return result
    check("prepare-parent")
    root.parent.mkdir(parents=True, exist_ok=True, mode=DIRECTORY_MODE)
    parent = directory(root.parent, private=False)
    stage = root.parent / (".ssh-install-" + uuid.uuid4().hex)
    check("prepare-stage")
    stage.mkdir(mode=DIRECTORY_MODE)
    (stage / "bin").mkdir(mode=DIRECTORY_MODE)
    for name, data in payload.items():
        check("write:" + name)
        write_owned(stage / name, data, 0o500 if name.startswith("bin/") else 0o400)
    check("write-archive")
    write_owned(stage / "archive.zip", raw, 0o400)
    write_owned(
        stage / "installation.json",
        (json.dumps(declaration(), sort_keys=True) + "\n").encode(),
        0o400,
    )
    check("verify-stage")
    inspect(stage)
    sync_directory(stage / "bin")
    sync_directory(stage)
    if directory(root.parent, private=False) != parent:
        reject("Original client installation parent changed; stage retained")
    check("publish")
    publish(stage, root)
    check("published")
    sync_directory(root.parent)
    result = inspect(root)
    check("finished")
    return result


def main() -> None:
    """Use the shipped pinned artifact in the supported user setup flow."""
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--clients-dir",
        type=Path,
        default=Path.home() / ".local/share/xcsh/terraform/ssh-clients" / VERSION,
    )
    parser.add_argument(
        "--archive",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "artifacts" / ASSET,
    )
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if platform.system() != "Linux" or platform.machine() not in ("x86_64", "amd64"):
        reject("Qualified SSH client runtime requires Linux AMD64")
    result = (
        inspect(args.clients_dir)
        if args.check
        else install(read_owned(args.archive), args.clients_dir)
    )
    sys.stdout.write(json.dumps(result, sort_keys=True) + "\n")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, zipfile.BadZipFile, json.JSONDecodeError) as error:
        sys.stdout.write(
            json.dumps(
                {"status": "setup-required", "scope": "user", "reason": str(error)}
            )
            + "\n"
        )
        sys.exit(1)
