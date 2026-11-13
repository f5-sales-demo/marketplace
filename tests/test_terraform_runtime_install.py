"""Safety cases for the bundled user-scope runtime installer."""

import hashlib
import importlib.util
import io
import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest

SOURCE = (
    Path(__file__).resolve().parents[1] / "plugins/terraform/scripts/install_runtime.py"
)
SPEC = importlib.util.spec_from_file_location("terraform_runtime_install", SOURCE)
if SPEC is None or SPEC.loader is None:
    MODULE_ERROR = "Bundled runtime installer loader unavailable"
    raise RuntimeError(MODULE_ERROR)
RUNTIME_INSTALL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNTIME_INSTALL)


def test_bad_archive_cannot_create_runtime(tmp_path: Path) -> None:
    """Checksum refusal precedes all installation writes."""
    target = tmp_path / "runtime"
    with pytest.raises(ValueError, match="checksum"):
        RUNTIME_INSTALL.install_runtime(b"foreign archive", target)
    assert not target.exists()


def test_wheel_directory_records_are_not_extracted_as_files() -> None:
    """Published ZIP directory records must not masquerade as SDK file inputs."""
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("psutil/", b"")
        archive.writestr("psutil/__init__.py", b"fixture only")
        archive.writestr("psutil/_psutil_linux.abi3.so", b"not an executable")
    raw = stream.getvalue()
    with patch.object(RUNTIME_INSTALL, "WHEEL_SHA256", hashlib.sha256(raw).hexdigest()):
        files = RUNTIME_INSTALL.wheel_files(raw)
    assert set(files) == {"psutil/__init__.py", "psutil/_psutil_linux.abi3.so"}


def test_partial_runtime_and_unrelated_files_are_preserved(tmp_path: Path) -> None:
    """An incomplete directory cannot become a verified runtime by a retry."""
    target = tmp_path / "runtime"
    target.mkdir(mode=0o700)
    sentinel = target / "unrelated.txt"
    sentinel.write_bytes(b"retain original")
    with pytest.raises(ValueError, match="incomplete"):
        RUNTIME_INSTALL.inspect_runtime(target)
    assert sentinel.read_bytes() == b"retain original"
    assert sorted(path.name for path in target.iterdir()) == ["unrelated.txt"]


def test_system_site_packages_cannot_be_enabled_in_the_owned_runtime(
    tmp_path: Path,
) -> None:
    """A changed interpreter configuration is refused before process execution."""
    raw = (
        b"home = /foreign/bin\ninclude-system-site-packages = true\n"
        b"version = 3.15.0\nexecutable = /foreign/bin/python3\ncommand = original\n"
    )
    config = tmp_path / "pyvenv.cfg"
    config.write_bytes(raw)
    with pytest.raises(ValueError, match="isolated Python configuration"):
        RUNTIME_INSTALL.python_configuration(tmp_path)
    assert config.read_bytes() == raw


def test_aliased_interpreter_home_cannot_replace_the_qualified_base(
    tmp_path: Path,
) -> None:
    """The original canonical executable and standard-library home must join."""
    binary = tmp_path / "python3"
    binary.write_bytes(b"not the qualified interpreter")
    raw = (
        f"home = {tmp_path}/alias\ninclude-system-site-packages = false\n"
        f"version = 3.15.0\nexecutable = {binary}\ncommand = original\n"
    )
    config = tmp_path / "pyvenv.cfg"
    config.write_text(raw)
    with pytest.raises(ValueError, match="canonical Python base"):
        RUNTIME_INSTALL.python_configuration(tmp_path)
    assert binary.read_bytes() == b"not the qualified interpreter"


def test_symlink_runtime_root_is_refused(tmp_path: Path) -> None:
    """Aliased paths cannot substitute a different installation owner."""
    original = tmp_path / "original"
    original.mkdir(mode=0o700)
    alias = tmp_path / "alias"
    alias.symlink_to(original, target_is_directory=True)
    with pytest.raises(ValueError, match="canonical"):
        RUNTIME_INSTALL.inspect_runtime(alias)
    assert not list(original.iterdir())


def test_hardlinked_archive_is_not_owned_runtime_evidence(tmp_path: Path) -> None:
    """A shared file identity is refused before installation provenance reads."""
    target = tmp_path / "runtime"
    target.mkdir(mode=0o700)
    original = tmp_path / "archive.whl"
    original.write_bytes(b"preserved foreign bytes")
    (target / "archive.whl").hardlink_to(original)
    with pytest.raises(ValueError, match="single-link"):
        RUNTIME_INSTALL.inspect_runtime(target)
    assert original.read_bytes() == b"preserved foreign bytes"
    assert original.stat().st_nlink == 2


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__]))
