"""User-scope installation safety; no network or real cloud commands."""

import hashlib
import importlib.util
import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest

SCRIPT = (
    Path(__file__).resolve().parents[1]
    / "plugins/terraform/scripts/install_terraform.py"
)
spec = importlib.util.spec_from_file_location("user_terraform_install", SCRIPT)
if spec is None or spec.loader is None:
    MODULE_ERROR = "Installer test module is unavailable"
    raise RuntimeError(MODULE_ERROR)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


def fixture(extra=None):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("terraform", b"fixture-only-executable")
        archive.writestr("LICENSE.txt", b"fixture license")
        if extra:
            archive.writestr(extra, b"foreign")
    return stream.getvalue()


class UserInstallTests(unittest.TestCase):
    def test_wrong_archive_refuses_before_creating_target(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "bin"
            with pytest.raises(
                ValueError, match="Pinned vendor archive checksum differs"
            ):
                installer.install(fixture(), target)
            assert not (target / "terraform").exists()

    def test_reviewed_archive_installs_owner_executable_without_overwriting_other_files(
        self,
    ):
        raw = fixture()
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(installer, "ARCHIVE_SHA256", hashlib.sha256(raw).hexdigest()),
            patch.object(
                installer,
                "BINARY_SHA256",
                hashlib.sha256(b"fixture-only-executable").hexdigest(),
            ),
        ):
            target = Path(directory) / "bin"
            target.mkdir(mode=0o700)
            other = target / "other-tool"
            other.write_bytes(b"unchanged")
            result = installer.install(raw, target)
            binary = target / "terraform"
            assert binary.read_bytes() == b"fixture-only-executable"
            assert binary.stat().st_mode & 0o777 == 0o755
            assert binary.stat().st_nlink == 1
            assert other.read_bytes() == b"unchanged"
            assert result["scope"] == "user"
            assert not result["privilegedOperations"]
            assert installer.install(raw, target)["status"] == "already-installed"

    def test_existing_foreign_bytes_and_symlink_are_preserved(self):
        raw = fixture()
        for symlink in [False, True]:
            with (
                tempfile.TemporaryDirectory() as directory,
                patch.object(
                    installer, "ARCHIVE_SHA256", hashlib.sha256(raw).hexdigest()
                ),
            ):
                target = Path(directory) / "bin"
                target.mkdir(mode=0o700)
                foreign = target / "foreign"
                foreign.write_bytes(b"preserve")
                binary = target / "terraform"
                if symlink:
                    binary.symlink_to(foreign)
                else:
                    binary.write_bytes(b"preserve")
                with (
                    self.subTest(symlink=symlink),
                    pytest.raises(ValueError, match="Existing Terraform differs"),
                ):
                    installer.install(raw, target)
                assert foreign.read_bytes() == b"preserve"
                assert binary.read_bytes() == b"preserve"

    def test_extra_or_traversal_archive_entries_are_refused(self):
        for extra in ["../escape", "extra-file"]:
            raw = fixture(extra)
            with (
                tempfile.TemporaryDirectory() as directory,
                patch.object(
                    installer, "ARCHIVE_SHA256", hashlib.sha256(raw).hexdigest()
                ),
                self.subTest(extra=extra),
                pytest.raises(
                    ValueError, match="Exact vendor archive inventory required"
                ),
            ):
                installer.install(raw, Path(directory) / "bin")


if __name__ == "__main__":
    unittest.main()
