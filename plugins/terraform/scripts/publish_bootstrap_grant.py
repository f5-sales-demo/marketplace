"""Publish complete grant bytes atomically; bootstrap authority belongs to the signer."""

from __future__ import annotations

import ctypes
import errno
import hashlib
import json
import os
import re
import stat
import sys
from pathlib import Path
from typing import Any

DirectoryIdentity = tuple[int, int, int, int]
MAX_GRANT_BYTES = 65536
RENAME_NOREPLACE = 1
PRIVATE_DIRECTORY_MODE = 0o700
PRIVATE_FILE_MODE = 0o400
DIRECTORY_FIELDS = 4
ARGUMENT_COUNT = 9


def directory_identity(info: os.stat_result) -> DirectoryIdentity:
    """Retain the original directory object without binding its changing inventory."""
    return (info.st_dev, info.st_ino, info.st_uid, info.st_mode)


def file_identity(info: os.stat_result) -> tuple[int, ...]:
    """Bind the entire immutable staging file before exposing its final name."""
    return (
        info.st_dev,
        info.st_ino,
        info.st_uid,
        info.st_mode,
        info.st_nlink,
        info.st_size,
        info.st_mtime_ns,
        info.st_ctime_ns,
    )


def require_directory(path: Path, expected: DirectoryIdentity) -> None:
    """Reject aliases, replacements, unsafe modes and foreign ownership."""
    if not path.is_absolute() or path.resolve() != path:
        message = "Original canonical grant directory required"
        raise ValueError(message)
    for parent in (path, *path.parents):
        if parent.is_symlink():
            message = "Original canonical grant directory required"
            raise ValueError(message)
    info = path.lstat()
    if (
        not stat.S_ISDIR(info.st_mode)
        or info.st_uid != os.getuid()
        or stat.S_IMODE(info.st_mode) != PRIVATE_DIRECTORY_MODE
        or directory_identity(info) != expected
    ):
        message = "Original private grant directory differs"
        raise ValueError(message)


def rename_without_replacement(directory_fd: int, source: str, target: str) -> None:
    """Use the Linux atomic no-replacement primitive without an overwrite fallback."""
    if sys.platform != "linux":
        message = "Linux atomic grant publication is required"
        raise RuntimeError(message)
    libc = ctypes.CDLL(None, use_errno=True)
    rename = getattr(libc, "renameat2", None)
    if rename is None:
        message = "Linux atomic grant publication is unavailable"
        raise RuntimeError(message)
    rename.argtypes = [
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_uint,
    ]
    rename.restype = ctypes.c_int
    if (
        rename(
            directory_fd,
            source.encode(),
            directory_fd,
            target.encode(),
            RENAME_NOREPLACE,
        )
        != 0
    ):
        error = ctypes.get_errno()
        if error == errno.EEXIST:
            raise FileExistsError(error, "Original grant already exists")
        raise OSError(error, "Atomic grant publication failed")


def publish_bootstrap_grant(
    directory: Path,
    staged_name: str,
    nonce: str,
    expected_sha256: str,
    expected_directory: DirectoryIdentity,
) -> dict[str, Any]:
    """Publish only the admitted immutable bytes and retain uncertain outcomes.

    This filesystem operation grants no review, token or bootstrap authority.
    The original provider must separately verify the signature and owning scope.
    A failed flush after rename can leave the final artifact present; callers
    must retain their durable claim and reconcile without repeating publication.
    """
    directory = Path(directory)
    if (
        re.fullmatch(r"[a-f0-9]{32}", nonce) is None
        or re.fullmatch(r"[a-f0-9]{64}", expected_sha256) is None
        or re.fullmatch(r"\.grant-" + nonce + r"-[a-f0-9]{32}\.partial", staged_name)
        is None
        or not isinstance(expected_directory, tuple)
        or len(expected_directory) != DIRECTORY_FIELDS
        or any(type(value) is not int for value in expected_directory)
    ):
        message = "Original grant publication input differs"
        raise ValueError(message)
    require_directory(directory, expected_directory)
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    directory_fd = os.open(directory, flags)
    file_fd: int | None = None
    try:
        if directory_identity(os.fstat(directory_fd)) != expected_directory:
            message = "Original grant directory descriptor differs"
            raise ValueError(message)
        info = os.stat(staged_name, dir_fd=directory_fd, follow_symlinks=False)
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid()
            or stat.S_IMODE(info.st_mode) != PRIVATE_FILE_MODE
            or info.st_nlink != 1
            or not 0 < info.st_size <= MAX_GRANT_BYTES
        ):
            message = "Original private staged grant required"
            raise ValueError(message)
        file_fd = os.open(staged_name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory_fd)
        original = file_identity(info)
        if file_identity(os.fstat(file_fd)) != original:
            message = "Original staged grant descriptor differs"
            raise ValueError(message)
        chunks = bytearray()
        while len(chunks) <= MAX_GRANT_BYTES:
            chunk = os.read(file_fd, min(8192, MAX_GRANT_BYTES + 1 - len(chunks)))
            if not chunk:
                break
            chunks.extend(chunk)
        observed = hashlib.sha256(chunks).hexdigest()
        if (
            len(chunks) != info.st_size
            or observed != expected_sha256
            or file_identity(os.fstat(file_fd)) != original
            or file_identity(
                os.stat(staged_name, dir_fd=directory_fd, follow_symlinks=False)
            )
            != original
        ):
            message = "Original staged grant bytes changed"
            raise ValueError(message)
        os.fsync(file_fd)
        require_directory(directory, expected_directory)
        target = "grant-" + nonce + ".json"
        rename_without_replacement(directory_fd, staged_name, target)
        # Rename may update ctime; all other original file bindings must agree.
        published = os.stat(target, dir_fd=directory_fd, follow_symlinks=False)
        if file_identity(published)[:-1] != original[:-1]:
            message = "Published grant identity differs"
            raise ValueError(message)
        os.fsync(directory_fd)
        require_directory(directory, expected_directory)
        return {
            "schemaVersion": 1,
            "kind": "original-bootstrap-grant-published",
            "name": target,
            "sha256": observed,
            "executionAuthorized": False,
        }
    finally:
        if file_fd is not None:
            os.close(file_fd)
        os.close(directory_fd)


def main() -> None:
    """Accept bounded exact arguments and return safe publication metadata."""
    if len(sys.argv) != ARGUMENT_COUNT:
        message = "Exact original publication arguments required"
        raise ValueError(message)
    values = sys.argv[5:]
    if any(re.fullmatch(r"[0-9]{1,20}", value) is None for value in values):
        message = "Original directory identity required"
        raise ValueError(message)
    result = publish_bootstrap_grant(
        Path(sys.argv[1]),
        sys.argv[2],
        sys.argv[3],
        sys.argv[4],
        (int(values[0]), int(values[1]), int(values[2]), int(values[3])),
    )
    sys.stdout.write(json.dumps(result, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        sys.stderr.write(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "kind": "original-bootstrap-grant-publication-failed",
                    "errorType": type(error).__name__,
                    "errno": getattr(error, "errno", None),
                    "publicationOutcome": "uncertain",
                    "retryAuthorized": False,
                    "executionAuthorized": False,
                }
            )
            + "\n"
        )
        raise SystemExit(1) from None
