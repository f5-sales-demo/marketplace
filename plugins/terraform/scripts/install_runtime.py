"""Prepare the qualified Linux observer interpreter and SDK in private user scope."""

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
import urllib.error
import urllib.request
import uuid
import zipfile
from pathlib import Path
from typing import Any, NoReturn

PYTHON_SHA256 = "aac3ade3f7d90fbf63e3ea0c46120a0cfbd159e1e503dde04721979507a1548b"
WHEEL_SHA256 = "076a2d2f923fd4821644f5ba89f059523da90dc9014e85f8e45a5774ca5bc6f9"
WHEEL_URL = (
    "https://files.pythonhosted.org/packages/b5/70/"
    "5d8df3b09e25bce090399cf48e452d25c935ab72dad19406c77f4e828045/"
    "psutil-7.2.2-cp36-abi3-manylinux2010_x86_64.manylinux_2_12_x86_64.manylinux_2_28_x86_64.whl"
)
MAXIMUM = 64 * 1024 * 1024
MAX_WHEEL_ENTRIES = 512
PROBE_MAXIMUM = 65536
CONFIG_PAIR_SIZE = 2
DOWNLOAD_TIMEOUT = 60
PYTHON_VERSION = (3, 15)
LOADER_KEYS = (
    "PYTHONPATH",
    "PYTHONHOME",
    "PYTHONSTARTUP",
    "PYTHONINSPECT",
    "PYTHONUSERBASE",
    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    "DYLD_INSERT_LIBRARIES",
)
PROBE = """import json,os,sys,time
from pathlib import Path
import psutil
pid=os.getpid()
raw=Path('/proc/self/stat').read_text()
fields=raw[raw.rfind(')')+2:].split()
ticks=os.sysconf('SC_CLK_TCK')
boot=int(next(row.split()[1] for row in Path('/proc/stat').read_text().splitlines() if row.startswith('btime ')))
process=psutil.Process(pid)
if process.pid!=pid or process.ppid()!=int(fields[1]) or process.uids().real!=os.getuid() or abs(process.create_time()-(boot+int(fields[19])/ticks))>1/ticks:
 raise RuntimeError('Independent observer process identity differs')
print(json.dumps({'python':str(Path(sys.executable).resolve()),'pythonVersion':list(sys.version_info[:2]),'sdkVersion':psutil.__version__,'sdkFile':str(Path(psutil.__file__).resolve()),'uid':os.getuid()}))
"""


def _fail(message: str, cause: BaseException | None = None) -> NoReturn:
    """Refuse unsafe runtime preparation without hiding the original cause."""
    raise ValueError(message) from cause


def sha(raw: bytes) -> str:
    """Return an exact original file digest."""
    return hashlib.sha256(raw).hexdigest()


def read_owned(path: Path) -> bytes:
    """Read a bounded single-link file without following a substituted symlink."""
    try:
        before = path.lstat()
    except FileNotFoundError as error:
        _fail("User runtime installation incomplete", error)
    if (
        not stat.S_ISREG(before.st_mode)
        or before.st_uid != os.getuid()
        or before.st_nlink != 1
        or before.st_mode & 0o022
        or not 0 < before.st_size <= MAXIMUM
    ):
        _fail("Owned single-link runtime file required")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        opened = os.fstat(stream.fileno())
        if (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
            _fail("Original runtime file changed during open")
        raw = stream.read(MAXIMUM + 1)
    after = path.lstat()
    keys = [
        "st_dev",
        "st_ino",
        "st_uid",
        "st_nlink",
        "st_mode",
        "st_size",
        "st_mtime_ns",
        "st_ctime_ns",
    ]
    if len(raw) != before.st_size or any(
        getattr(before, key) != getattr(after, key) for key in keys
    ):
        _fail("Original runtime file changed during read")
    return raw


def owned_directory(path: Path) -> None:
    """Require a canonical owned directory before any publication or probing."""
    if not path.is_absolute() or path.resolve() != path:
        _fail("Absolute canonical user runtime directory required")
    try:
        info = path.lstat()
    except FileNotFoundError as error:
        _fail("User runtime installation incomplete", error)
    if (
        not stat.S_ISDIR(info.st_mode)
        or info.st_uid != os.getuid()
        or info.st_mode & 0o022
    ):
        _fail("Owned user runtime directory required")


def wheel_files(raw: bytes) -> dict[str, bytes]:
    """Admit only the immutable published psutil package and its metadata."""
    if not 0 < len(raw) <= MAXIMUM or sha(raw) != WHEEL_SHA256:
        _fail("Pinned psutil wheel checksum differs")
    result: dict[str, bytes] = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        rows = archive.infolist()
        if not rows or len(rows) > MAX_WHEEL_ENTRIES:
            _fail("Bounded psutil wheel inventory required")
        total = 0
        for row in rows:
            parts = Path(row.filename).parts
            if (
                not parts
                or parts[0] not in ["psutil", "psutil-7.2.2.dist-info"]
                or any(part in [".", ".."] for part in parts)
                or row.filename.startswith("/")
                or "\\" in row.filename
            ):
                _fail("Original psutil wheel paths differ")
            if row.is_dir():
                if row.file_size != 0:
                    _fail("Original psutil directory record contains data")
                continue
            if (
                stat.S_ISLNK(row.external_attr >> 16)
                or row.filename in result
                or row.file_size > MAXIMUM
            ):
                _fail("Original psutil wheel paths differ")
            total += row.file_size
            if total > MAXIMUM:
                _fail("Bounded psutil wheel bytes required")
            result[row.filename] = archive.read(row)
    if (
        "psutil/__init__.py" not in result
        or "psutil/_psutil_linux.abi3.so" not in result
    ):
        _fail("Original Linux psutil SDK files required")
    return result


def python_configuration(environment: Path) -> tuple[bytes, Path]:
    """Bind the copied interpreter's standard-library home to its qualified base."""
    raw = read_owned(environment / "pyvenv.cfg")
    pairs = [line.split(" = ", 1) for line in raw.decode("utf8").splitlines() if line]
    if any(len(pair) != CONFIG_PAIR_SIZE for pair in pairs):
        _fail("Canonical isolated Python configuration required")
    configuration = dict(pairs)
    if (
        len(configuration) != len(pairs)
        or set(configuration)
        != {"home", "include-system-site-packages", "version", "executable", "command"}
        or configuration["include-system-site-packages"] != "false"
        or configuration["version"] != "3.15.0"
    ):
        _fail("Canonical isolated Python configuration required")
    base = Path(configuration["executable"])
    if (
        not base.is_absolute()
        or base.resolve() != base
        or configuration["home"] != str(base.parent)
        or sha(read_owned(base)) != PYTHON_SHA256
    ):
        _fail("Original canonical Python base or configuration differs")
    return raw, base


def runtime_files(root: Path) -> dict[str, Any]:
    """Reverify all original wheel files and the copied interpreter."""
    owned_directory(root)
    files = wheel_files(read_owned(root / "archive.whl"))
    environment = root / "environment"
    owned_directory(environment)
    python = environment / "bin/python3"
    if sha(read_owned(python)) != PYTHON_SHA256 or not python.stat().st_mode & 0o111:
        _fail("Qualified copied Python 3.15 executable required")
    configuration, base = python_configuration(environment)
    site = environment / "lib/python3.15/site-packages"
    owned_directory(site)
    expected_names = set(files)
    actual_names = {
        str(path.relative_to(site)) for path in site.rglob("*") if not path.is_dir()
    }
    if actual_names != expected_names:
        _fail("Original runtime SDK inventory differs")
    hashes: dict[str, str] = {}
    for name, raw in files.items():
        path = site / name
        if path.resolve() != path or read_owned(path) != raw:
            _fail("Original runtime SDK bytes or path differ")
        hashes[name] = sha(raw)
    return {
        "schemaVersion": 1,
        "kind": "installed-terraform-observer-runtime",
        "pythonPath": str(python),
        "pythonSha256": PYTHON_SHA256,
        "pythonVersion": "3.15",
        "basePythonPath": str(base),
        "pyvenvConfigurationSha256": sha(configuration),
        "sdkRoot": str(site),
        "sdkVersion": "7.2.2",
        "sdkFilesSha256": hashes,
        "wheelSha256": WHEEL_SHA256,
        "privilegedOperations": False,
    }


def run_python(program: Path, arguments: list[str], root: Path) -> bytes:
    """Execute exact arguments through a verified interpreter and retain private captures."""
    if (
        not program.is_absolute()
        or program.resolve() != program
        or sha(read_owned(program)) != PYTHON_SHA256
    ):
        _fail("Original qualified Python command required")
    argv = [str(program), "-I", "-B", *arguments]
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
        pid = os.posix_spawn(
            str(program),
            argv,
            {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"},
            file_actions=[
                (os.POSIX_SPAWN_DUP2, output.fileno(), 1),
                (os.POSIX_SPAWN_DUP2, errors.fileno(), 2),
            ],
        )
        _, status = os.waitpid(pid, 0)
        output.seek(0)
        raw = output.read(PROBE_MAXIMUM + 1)
        errors.seek(0)
        error_bytes = errors.read(PROBE_MAXIMUM + 1)
    capture = root / "checks" / uuid.uuid4().hex
    capture.parent.mkdir(mode=0o700, exist_ok=True)
    owned_directory(capture.parent)
    capture.mkdir(mode=0o700)
    for name, contents in [("stdout.private", raw), ("stderr.private", error_bytes)]:
        with (capture / name).open("xb") as stream:
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        (capture / name).chmod(0o400)
    result = {
        "schemaVersion": 1,
        "pid": pid,
        "argv": argv,
        "exitCode": os.waitstatus_to_exitcode(status),
        "signalsSent": False,
        "stdoutTruncated": len(raw) > PROBE_MAXIMUM,
        "stderrTruncated": len(error_bytes) > PROBE_MAXIMUM,
    }
    with (capture / "result.private.json").open("x") as stream:
        json.dump(result, stream, sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())
    (capture / "result.private.json").chmod(0o400)
    if result["exitCode"] != 0:
        _fail(
            "Qualified observer interpreter or SDK probe failed; private capture retained"
        )
    if result["stdoutTruncated"] or result["stderrTruncated"]:
        _fail("Bounded original observer probe output required")
    return raw


def probe_runtime(binding: dict[str, Any]) -> None:
    """Use the real SDK and independent kernel clock through the copied interpreter."""
    if any(key in os.environ for key in LOADER_KEYS):
        _fail("Runtime loader substitution refused")
    root = Path(binding["pythonPath"]).parents[2]
    if runtime_files(root) != binding:
        _fail("Original runtime binding changed before SDK probe")
    raw = run_python(Path(binding["pythonPath"]), ["-c", PROBE], root)
    value = json.loads(raw)
    expected = {
        "python": binding["pythonPath"],
        "pythonVersion": [3, 15],
        "sdkVersion": "7.2.2",
        "sdkFile": str(Path(binding["sdkRoot"]) / "psutil/__init__.py"),
        "uid": os.getuid(),
    }
    if value != expected:
        _fail("Original observer interpreter, SDK or ownership differs")


def inspect_runtime(root: Path) -> dict[str, Any]:
    """Verify existing bytes and live process semantics without modifying them."""
    root = Path(root)
    binding = runtime_files(root)
    if read_owned(root / "review.json") != json.dumps(binding, sort_keys=True).encode():
        _fail("Original runtime installation receipt differs")
    probe_runtime(binding)
    if runtime_files(root) != binding:
        _fail("Original runtime changed during inspection")
    return binding


def install_runtime(raw: bytes, root: Path) -> dict[str, Any]:
    """Create a private copied interpreter and verified SDK without pip or elevation."""
    files = wheel_files(raw)
    root = Path(root)
    if not root.is_absolute() or root.resolve() != root:
        _fail("Absolute canonical user runtime directory required")
    if root.exists() or root.is_symlink():
        return inspect_runtime(root)
    base = Path(sys.executable).resolve(strict=True)
    if sys.version_info[:2] != PYTHON_VERSION or sha(read_owned(base)) != PYTHON_SHA256:
        _fail("Run setup with the qualified owned Python 3.15 interpreter")
    if any(key in os.environ for key in LOADER_KEYS):
        _fail("Runtime loader substitution refused")
    root.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    owned_directory(root.parent)
    root.mkdir(mode=0o700)
    # An interrupted exclusive installation remains visible and cannot be overwritten.
    environment = root / "environment"
    run_python(
        base,
        [
            "-m",
            "venv",
            "--copies",
            "--without-pip",
            "--without-scm-ignore-files",
            str(environment),
        ],
        root,
    )
    environment.chmod(0o700)
    site = environment / "lib/python3.15/site-packages"
    for name, contents in files.items():
        target = site / name
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with target.open("xb") as stream:
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        target.chmod(0o400)
    with (root / "archive.whl").open("xb") as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    (root / "archive.whl").chmod(0o400)
    binding = runtime_files(root)
    probe_runtime(binding)
    with (root / "review.json").open("x") as stream:
        json.dump(binding, stream, sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())
    (root / "review.json").chmod(0o400)
    return inspect_runtime(root)


def download_wheel() -> bytes:
    """Download only the pinned public wheel through verified HTTPS."""

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        """Preserve the reviewed vendor endpoint."""

        def redirect_request(self, *_args: object, **_kwargs: object) -> None:
            """Refuse an unreviewed download origin."""
            return

    started = time.monotonic()
    with urllib.request.build_opener(NoRedirect).open(
        WHEEL_URL, timeout=DOWNLOAD_TIMEOUT
    ) as response:
        chunks = []
        size = 0
        while chunk := response.read1(65536):
            size += len(chunk)
            if size > MAXIMUM or time.monotonic() - started >= DOWNLOAD_TIMEOUT:
                _fail("Original runtime download bound exhausted")
            chunks.append(chunk)
    return b"".join(chunks)


def main() -> None:
    """Install or independently inspect the fixed user-scoped runtime."""
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--runtime-dir",
        type=Path,
        default=Path.home() / ".local/share/xcsh/terraform/runtime/python315-psutil722",
    )
    parser.add_argument("--wheel", type=Path)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--binding", action="store_true")
    args = parser.parse_args()
    if platform.system() != "Linux" or platform.machine() not in ["x86_64", "amd64"]:
        _fail("Qualified observer runtime requires Linux AMD64")
    binding = (
        inspect_runtime(args.runtime_dir)
        if args.check
        else install_runtime(
            args.wheel.read_bytes() if args.wheel else download_wheel(),
            args.runtime_dir,
        )
    )
    result = (
        binding
        if args.binding
        else {
            "status": "ready",
            "scope": "user",
            "pythonVersion": binding["pythonVersion"],
            "sdkVersion": binding["sdkVersion"],
            "privilegedOperations": False,
        }
    )
    sys.stdout.write(json.dumps(result, sort_keys=True) + "\n")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, urllib.error.URLError, zipfile.BadZipFile) as error:
        sys.stdout.write(
            json.dumps(
                {"status": "setup-required", "scope": "user", "reason": str(error)}
            )
            + "\n"
        )
        raise SystemExit(1) from error
