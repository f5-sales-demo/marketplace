"""Scoped immutable Python and original-clock prerequisites for native GCP tests."""

import argparse
import hashlib
import io
import json
import os
import platform
import tarfile
import tempfile
import time
import urllib.request
from collections.abc import Callable
from pathlib import Path

PYTHON_SHA256 = "aac3ade3f7d90fbf63e3ea0c46120a0cfbd159e1e503dde04721979507a1548b"
ARCHIVE_SHA256 = "46edc8f6fccade47dc38001ef2d4094d9cedd21a1863d9b44b2a02c1ee76b94d"
ARCHIVE_BYTES = 37637027
ARCHIVE_URL = (
    "https://github.com/astral-sh/python-build-standalone/releases/download/20261009/"
    "cpython-3.15.0%2B20261009-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz"
)
HISTORY_MS = 7_200_000


def remaining_history_ms(now: object) -> int:
    """A late-entry fixture must retain a nonnegative original two-hour start."""
    if type(now) is not int or now < 0:
        message = "Original nonnegative integer monotonic clock required"
        raise ValueError(message)
    return max(0, HISTORY_MS - now)


def wait_for_history(
    clock: Callable[[], int],
    sleep: Callable[[float], None],
    announce: Callable[[int], None],
) -> dict[str, int | bool]:
    """Wait once on the original clock; never change a native fixture deadline."""
    start = clock()
    remaining_history_ms(start)
    deadline = start + HISTORY_MS
    previous = start
    for _ in range(122):
        now = clock()
        remaining = remaining_history_ms(now)
        if now < previous or now > deadline:
            message = "Original fixture-history clock or wait deadline changed"
            raise ValueError(message)
        previous = now
        if remaining == 0:
            return {
                "originalStartMs": start,
                "originalDeadlineMs": deadline,
                "readyAtMs": now,
                "signalsSent": False,
            }
        announce(remaining)
        sleep(min(60_000, remaining) / 1000)
    message = "Original fixture-history wait did not converge"
    raise ValueError(message)


def verify_distribution(raw: bytes) -> str:
    """Verify the official archive before reading or extracting executable bytes."""
    if len(raw) != ARCHIVE_BYTES or hashlib.sha256(raw).hexdigest() != ARCHIVE_SHA256:
        message = "Original immutable Python distribution differs"
        raise ValueError(message)
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as archive:
        members = archive.getmembers()
        names = [member.name for member in members]
        if len(names) != len(set(names)) or any(
            not name.startswith("python/")
            or Path(name).is_absolute()
            or ".." in Path(name).parts
            for name in names
        ):
            message = "Original bounded Python archive inventory required"
            raise ValueError(message)
        target = archive.getmember("python/bin/python3.15")
        if not target.isfile() or target.size > 64 * 1024 * 1024:
            message = "Original Python executable member required"
            raise ValueError(message)
        stream = archive.extractfile(target)
        if stream is None:
            message = "Original Python executable stream missing"
            raise ValueError(message)
        with stream:
            digest = hashlib.sha256(stream.read()).hexdigest()
        if digest != PYTHON_SHA256:
            message = "Source-qualified Python executable differs"
            raise ValueError(message)
    return digest


def prepare_distribution(root: Path, raw: bytes) -> Path:
    """An interrupted exclusive extraction remains visible and cannot be replaced."""
    verify_distribution(raw)
    root.mkdir(mode=0o700)
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as archive:
        archive.extractall(root, filter="data")
    binary = root / "python/bin/python3.15"
    if (
        binary.stat().st_uid != os.getuid()
        or hashlib.sha256(binary.read_bytes()).hexdigest() != PYTHON_SHA256
    ):
        message = "Extracted original Python executable differs"
        raise ValueError(message)
    return binary


def install_distribution(parent: str | Path) -> tuple[Path, Path]:
    """Install only under the caller's owned job/project temporary directory."""
    parent = Path(parent)
    if (
        not parent.is_absolute()
        or parent.resolve() != parent
        or not parent.is_dir()
        or parent.stat().st_uid != os.getuid()
        or "\n" in str(parent)
    ):
        message = "Canonical owned runner/project temporary root required"
        raise ValueError(message)
    stage = Path(tempfile.mkdtemp(prefix="gcp-fixture-python-", dir=parent))
    with urllib.request.build_opener().open(ARCHIVE_URL, timeout=60) as response:
        if not response.geturl().startswith(
            ("https://release-assets.githubusercontent.com/", "https://github.com/")
        ):
            message = "Official HTTPS Python release origin required"
            raise ValueError(message)
        raw = response.read(ARCHIVE_BYTES + 1)
    verify_distribution(raw)
    archive = stage / "distribution.tar.gz"
    archive.write_bytes(raw)
    binary = prepare_distribution(stage / "runtime", raw)
    return binary, archive


def main() -> None:
    """Install source-qualified prerequisites or wait on the existing boot clock."""
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["install", "wait-clock"])
    parser.add_argument("--runner-root", default=os.environ.get("RUNNER_TEMP"))
    parser.add_argument("--print-archive", action="store_true")
    args = parser.parse_args()
    if platform.system() != "Linux" or platform.machine() != "x86_64":
        message = "Original native GCP fixture prerequisites require Linux x86_64"
        raise ValueError(message)
    if args.operation == "wait-clock":
        boot = Path("/proc/sys/kernel/random/boot_id").read_text()

        def clock() -> int:
            if Path("/proc/sys/kernel/random/boot_id").read_text() != boot:
                message = "Original fixture-history boot identity changed"
                raise ValueError(message)
            return time.monotonic_ns() // 1_000_000

        receipt = wait_for_history(
            clock,
            time.sleep,
            lambda remaining: print(
                f"Waiting for native GCP fixture clock history: {remaining} ms remaining",
                flush=True,
            ),
        )
        print(json.dumps(receipt), flush=True)
        return
    if not args.runner_root:
        message = "Owned runner/project temporary root required"
        raise ValueError(message)
    binary, archive = install_distribution(args.runner_root)
    if args.print_archive:
        print(archive, flush=True)
        return
    env_path = Path(os.environ["GITHUB_ENV"])
    if not env_path.is_absolute() or "\n" in str(env_path):
        message = "Absolute GitHub environment file required"
        raise ValueError(message)
    with env_path.open("a") as stream:
        stream.write(f"CI_PYTHON_BASE={binary}\nCE_TEST_PYTHON_ARCHIVE={archive}\n")
    print(
        "Installed the source-qualified Python distribution in the job temporary directory",
        flush=True,
    )


if __name__ == "__main__":
    main()
