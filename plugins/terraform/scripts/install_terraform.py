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

VERSION = "1.17.2"
ARCHIVE_SHA256 = "e6f16b2f0b137ee5729caa8c4e79a3bae4ee261acd198a1fcfa8584a6296605b"
BINARY_SHA256 = "dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e"
URL = f"https://releases.hashicorp.com/terraform/{VERSION}/terraform_{VERSION}_linux_amd64.zip"
MAXIMUM = 128 * 1024 * 1024
DOWNLOAD_TIMEOUT = 60
ARCHIVE_ENTRIES = {"terraform", "LICENSE.txt"}
RETAINED_BINARY_VERSIONS = {
    "1eaecd79a92a0114d70017b5d5e274c12e5b4561d971ff0b5e24073cddd287dc": "1.17.1",
    "00a240950f88f51a03ad90975f1647737e40ddcd5df30a703fd840aa07dccced": "1.16.6",
}


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


def _install_exact(raw: bytes, directory: Path) -> dict[str, str | bool]:
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
        if sha(read_owned_binary(target)) != BINARY_SHA256:
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
    receipt: dict[str, str | bool] = {
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
    try:
        os.link(temporary, target, follow_symlinks=False)
    except FileExistsError:
        # Keep the concurrent winner and its identity; admit only exact bytes.
        temporary.unlink()
        if sha(read_owned_binary(target)) != BINARY_SHA256:
            _fail("Concurrent cached Terraform publication differs")
        receipt["status"] = "already-installed"
    else:
        temporary.unlink()
        if sha(read_owned_binary(target)) != BINARY_SHA256:
            _fail("Published user executable identity differs")
    return receipt


def versions_directory(directory: Path) -> Path:
    """Keep immutable executables separately from an existing user CLI path."""
    return Path(directory).parent / "share/xcsh/terraform/versions"


def owned_directory(directory: Path, create: bool = False) -> None:
    """Require the original canonical owned publication directory."""
    if not directory.is_absolute() or directory.resolve() != directory:
        _fail("Canonical absolute user installation directory required")
    if create:
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = directory.lstat()
    if (
        not stat.S_ISDIR(info.st_mode)
        or info.st_uid != os.getuid()
        or info.st_mode & 0o022
    ):
        _fail("Owned user installation directory required")


def read_owned_binary(path: Path) -> bytes:
    """Read an original single-link executable without following aliases."""
    before = path.lstat()
    if (
        not stat.S_ISREG(before.st_mode)
        or before.st_uid != os.getuid()
        or before.st_nlink != 1
        or before.st_mode & 0o022
        or not 0 < before.st_size <= MAXIMUM
    ):
        _fail("Existing Terraform differs; preserve it and review a version upgrade")
    if before.st_mode & stat.S_IXUSR == 0:
        _fail("Existing Terraform differs: original is not executable")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        opened = os.fstat(stream.fileno())
        if (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
            _fail("Original Terraform changed during open")
        raw = stream.read(MAXIMUM + 1)
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
    if len(raw) != before.st_size or any(
        getattr(before, key) != getattr(after, key) for key in keys
    ):
        _fail("Original Terraform changed during read")
    return raw


def original_default_path(path: Path) -> Path:
    """Resolve only an original user-owned link to a known single-link vendor file."""
    before = path.lstat()
    if not stat.S_ISLNK(before.st_mode):
        return path
    if before.st_uid != os.getuid() or before.st_nlink != 1:
        _fail("Existing Terraform differs; preserve its original path")
    resolved = path.resolve(strict=True)
    raw = read_owned_binary(resolved)
    if sha(raw) != BINARY_SHA256 and sha(raw) not in RETAINED_BINARY_VERSIONS:
        _fail("Existing Terraform differs; preserve its original path")
    after = path.lstat()
    keys = ("st_dev", "st_ino", "st_uid", "st_nlink", "st_mtime_ns", "st_ctime_ns")
    if (
        any(getattr(before, key) != getattr(after, key) for key in keys)
        or path.resolve(strict=True) != resolved
    ):
        _fail("Original Terraform link changed during inspection")
    return resolved


def publish_copy(raw: bytes, target: Path) -> None:
    """Publish a distinct inode, preserving any original executable and active reader."""
    owned_directory(target.parent, create=True)
    if target.exists() or target.is_symlink():
        if sha(read_owned_binary(target)) != sha(raw):
            _fail("Existing cached Terraform differs; preserve original bytes")
        return
    stage = Path(tempfile.mkdtemp(prefix=".terraform-copy-", dir=target.parent))
    temporary = stage / "terraform"
    with temporary.open("xb") as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.chmod(0o755)
    try:
        os.link(temporary, target, follow_symlinks=False)
    except FileExistsError:
        if sha(read_owned_binary(target)) != sha(raw):
            _fail("Concurrent Terraform publication differs")
    finally:
        temporary.unlink()
    if sha(read_owned_binary(target)) != sha(raw):
        _fail("Published Terraform copy differs")


def retain_executable(source: Path, cache: Path) -> str:
    """Retain only a known vendor executable; never overwrite its original path."""
    if not source.is_absolute() or source.resolve() != source:
        _fail("Canonical retained Terraform executable required")
    raw = read_owned_binary(source)
    digest = sha(raw)
    version = (
        VERSION if digest == BINARY_SHA256 else RETAINED_BINARY_VERSIONS.get(digest)
    )
    if version is None:
        _fail("Existing Terraform differs; preserve it and review a version upgrade")
    owned_directory(cache, create=True)
    publish_copy(raw, cache / version / "terraform")
    return version


def inspect_installation(
    directory: Path, cache: Path | None = None
) -> dict[str, str | bool]:
    """Verify the exact cached version selected by new GCP deployments."""
    cache = versions_directory(directory) if cache is None else cache
    owned_directory(cache)
    owned_directory(cache / VERSION)
    target = cache / VERSION / "terraform"
    if sha(read_owned_binary(target)) != BINARY_SHA256:
        _fail("Qualified cached Terraform executable checksum differs")
    if target.stat().st_mode & stat.S_IXUSR == 0:
        _fail("Qualified cached Terraform is not executable")
    return {
        "version": VERSION,
        "scope": "user",
        "status": "ready",
        "executable": str(target),
        "binarySha256": BINARY_SHA256,
        "privilegedOperations": False,
    }


def install(
    raw: bytes, directory: Path, cache: Path | None = None
) -> dict[str, str | bool]:
    """Install latest verified bytes while retaining an existing known user executable."""
    if (
        not isinstance(raw, bytes)
        or not 0 < len(raw) <= MAXIMUM
        or sha(raw) != ARCHIVE_SHA256
    ):
        _fail("Pinned vendor archive checksum differs")
    directory = Path(directory)
    original = directory / "terraform"
    if original.exists() or original.is_symlink():
        if not directory.is_absolute() or directory.resolve() != directory:
            _fail("Canonical original Terraform source directory required")
        source_info = directory.lstat()
        if not stat.S_ISDIR(source_info.st_mode) or source_info.st_uid != os.getuid():
            _fail("Owned original Terraform source directory required")
    else:
        owned_directory(directory, create=True)
    cache = versions_directory(directory) if cache is None else Path(cache)
    retained = ""
    if original.exists() or original.is_symlink():
        # Validate before creating a cache or touching unrelated user files.
        original_source = original_default_path(original)
        raw_original = read_owned_binary(original_source)
        digest = sha(raw_original)
        retained = (
            VERSION
            if digest == BINARY_SHA256
            else RETAINED_BINARY_VERSIONS.get(digest, "")
        )
        if not retained:
            _fail(
                "Existing Terraform differs; preserve it and review a version upgrade"
            )
        retain_executable(original_source, cache)
    owned_directory(cache, create=True)
    result = _install_exact(raw, cache / VERSION)
    if not retained:
        publish_copy(read_owned_binary(cache / VERSION / "terraform"), original)
    return {
        **result,
        "executable": str(cache / VERSION / "terraform"),
        "retainedDefaultVersion": retained,
        "defaultChanged": not bool(retained),
    }


def main() -> None:
    """Run the user-scope installer and emit a sanitized receipt."""
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bin-dir", type=Path, default=Path.home() / ".local/bin")
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--versions-dir", type=Path)
    parser.add_argument("--retain-executable", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if platform.system() != "Linux" or platform.machine() not in ["x86_64", "amd64"]:
        _fail("Pinned user installer requires Linux amd64")
    if args.check:
        result = inspect_installation(args.bin_dir, args.versions_dir)
    else:
        cache = args.versions_dir or versions_directory(args.bin_dir)
        if args.retain_executable:
            retain_executable(args.retain_executable, cache)
        raw = args.archive.read_bytes() if args.archive else download()
        result = install(raw, args.bin_dir, cache)
    sys.stdout.write(json.dumps(result, sort_keys=True) + "\n")


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
