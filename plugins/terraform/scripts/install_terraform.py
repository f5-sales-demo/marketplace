"""Install pinned vendor Terraform into user scope without privileged commands."""

import argparse
import hashlib
import io
import json
import os
import platform
import stat
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import NoReturn

VERSION = "1.16.6"
ARCHIVE_SHA256 = "38034b38d03096399a7a1264a14561a8029b2b496fd1f169452656e53968f1b7"
BINARY_SHA256 = "00a240950f88f51a03ad90975f1647737e40ddcd5df30a703fd840aa07dccced"
URL = f"https://releases.hashicorp.com/terraform/{VERSION}/terraform_{VERSION}_linux_amd64.zip"
MAXIMUM = 128 * 1024 * 1024
DOWNLOAD_TIMEOUT = 60
ARCHIVE_ENTRIES = {"terraform", "LICENSE.txt"}


def _fail(message: str) -> NoReturn:
    raise ValueError(message)


def sha(value: bytes) -> str:
    """Return the exact artifact digest."""
    return hashlib.sha256(value).hexdigest()


def download() -> bytes:
    """Download the fixed vendor artifact through verified HTTPS."""

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args: object, **kwargs: object) -> None:
            """Refuse redirection away from the fixed vendor endpoint."""
            return

    started = time.monotonic()
    chunks = []
    size = 0
    with urllib.request.build_opener(NoRedirect).open(
        URL, timeout=DOWNLOAD_TIMEOUT
    ) as response:
        while chunk := response.read1(65536):
            size += len(chunk)
            if size > MAXIMUM or time.monotonic() - started >= DOWNLOAD_TIMEOUT:
                _fail("Vendor archive exceeds original download limit")
            chunks.append(chunk)
    return b"".join(chunks)


def install(raw: bytes, directory: Path) -> dict[str, str | bool]:
    """Publish verified vendor bytes into an owned user directory."""
    if (
        not isinstance(raw, bytes)
        or not 0 < len(raw) <= MAXIMUM
        or sha(raw) != ARCHIVE_SHA256
    ):
        _fail("Pinned vendor archive checksum differs")
    directory = Path(directory)
    if not directory.is_absolute() or directory.resolve() != directory:
        _fail("Canonical absolute user installation directory required")
    directory.mkdir(mode=0o755, parents=True, exist_ok=True)
    info = directory.lstat()
    if (
        not stat.S_ISDIR(info.st_mode)
        or info.st_uid != os.getuid()
        or info.st_mode & 0o022
    ):
        _fail("Owned user installation directory required")
    target = directory / "terraform"
    if target.exists() or target.is_symlink():
        info = target.lstat()
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid()
            or info.st_nlink != 1
            or info.st_mode & 0o022
            or sha(target.read_bytes()) != BINARY_SHA256
        ):
            _fail(
                "Existing Terraform differs; preserve it and review a version upgrade"
            )
        return {
            "version": VERSION,
            "scope": "user",
            "status": "already-installed",
            "binarySha256": BINARY_SHA256,
            "privilegedOperations": False,
        }
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        rows = archive.infolist()
        if len(rows) != len(ARCHIVE_ENTRIES) or {row.filename for row in rows} != {
            "terraform",
            "LICENSE.txt",
        }:
            _fail("Exact vendor archive inventory required")
        if any(
            row.is_dir()
            or row.file_size > MAXIMUM
            or stat.S_ISLNK(row.external_attr >> 16)
            for row in rows
        ):
            _fail("Vendor archive contains an unsupported entry")
        binary = archive.read("terraform")
        if sha(binary) != BINARY_SHA256:
            _fail("Pinned vendor executable checksum differs")
    stage = Path(tempfile.mkdtemp(prefix=".terraform-install-", dir=directory))
    (stage / "archive.zip").write_bytes(raw)
    (stage / "archive.zip").chmod(0o400)
    temporary = stage / "terraform"
    temporary.write_bytes(binary)
    temporary.chmod(0o755)
    receipt = {
        "version": VERSION,
        "scope": "user",
        "status": "installed",
        "archiveSha256": ARCHIVE_SHA256,
        "binarySha256": BINARY_SHA256,
        "privilegedOperations": False,
    }
    with (stage / "review.json").open("x") as stream:
        json.dump(receipt, stream, sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())
    # Exclusive publication cannot replace a concurrent or unrelated installation.
    os.link(temporary, target, follow_symlinks=False)
    temporary.unlink()
    if target.stat().st_nlink != 1 or sha(target.read_bytes()) != BINARY_SHA256:
        _fail("Published user executable identity differs")
    return receipt


def main() -> None:
    """Run the user-scope installer and emit a sanitized receipt."""
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bin-dir", type=Path, default=Path.home() / ".local/bin")
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    if platform.system() != "Linux" or platform.machine() not in ["x86_64", "amd64"]:
        _fail("Pinned user installer requires Linux amd64")
    raw = args.archive.read_bytes() if args.archive else download()
    sys.stdout.write(json.dumps(install(raw, args.bin_dir), sort_keys=True) + "\n")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, urllib.error.URLError, zipfile.BadZipFile) as error:
        sys.stdout.write(
            json.dumps(
                {"status": "setup-required", "reason": str(error), "scope": "user"}
            )
        )
        raise SystemExit(1) from error
