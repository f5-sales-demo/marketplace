"""User-scope installation safety; no network or real cloud commands."""

import hashlib
import importlib.util
import io
import os
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
    def test_normal_setup_selects_authenticated_latest_terraform(self):
        assert installer.VERSION == "1.17.2"
        assert (
            installer.ARCHIVE_SHA256
            == "e6f16b2f0b137ee5729caa8c4e79a3bae4ee261acd198a1fcfa8584a6296605b"
        )
        assert (
            installer.BINARY_SHA256
            == "dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e"
        )
        assert (
            installer.URL
            == "https://releases.hashicorp.com/terraform/1.17.2/terraform_1.17.2_linux_amd64.zip"
        )

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

    def test_upgrade_caches_latest_and_preserves_original_default_identity(self):
        raw = fixture()
        old = b"original-known-terraform"
        latest = b"fixture-only-executable"
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(installer, "ARCHIVE_SHA256", hashlib.sha256(raw).hexdigest()),
            patch.object(
                installer, "BINARY_SHA256", hashlib.sha256(latest).hexdigest()
            ),
            patch.object(
                installer,
                "RETAINED_BINARY_VERSIONS",
                {hashlib.sha256(old).hexdigest(): "1.17.1"},
                create=True,
            ),
        ):
            target = Path(directory) / "bin"
            target.mkdir(mode=0o700)
            original = target / "terraform"
            original.write_bytes(old)
            original.chmod(0o755)
            before = original.stat()
            result = installer.install(raw, target)
            cache = target.parent / "share/xcsh/terraform/versions"
            assert original.read_bytes() == old
            after = original.stat()
            assert (
                before.st_dev,
                before.st_ino,
                before.st_mode,
                before.st_mtime_ns,
                before.st_ctime_ns,
            ) == (
                after.st_dev,
                after.st_ino,
                after.st_mode,
                after.st_mtime_ns,
                after.st_ctime_ns,
            )
            assert (cache / "1.17.1/terraform").read_bytes() == old
            assert (cache / "1.17.2/terraform").read_bytes() == latest
            assert result["executable"] == str(cache / "1.17.2/terraform")
            assert result["retainedDefaultVersion"] == "1.17.1"
            assert (
                installer.inspect_installation(target)["executable"]
                == result["executable"]
            )
            assert installer.install(raw, target)["status"] == "already-installed"

    def test_corrupt_or_linked_cached_latest_is_refused_without_touching_default(self):
        raw = fixture()
        for linked in [False, True]:
            with (
                tempfile.TemporaryDirectory() as directory,
                patch.object(
                    installer, "ARCHIVE_SHA256", hashlib.sha256(raw).hexdigest()
                ),
                patch.object(
                    installer,
                    "BINARY_SHA256",
                    hashlib.sha256(b"fixture-only-executable").hexdigest(),
                ),
            ):
                target = Path(directory) / "bin"
                target.mkdir(mode=0o700)
                latest = target.parent / "share/xcsh/terraform/versions/1.17.2"
                latest.mkdir(mode=0o700, parents=True)
                other = latest / "other"
                other.write_bytes(b"corrupt")
                binary = latest / "terraform"
                if linked:
                    binary.symlink_to(other)
                else:
                    binary.write_bytes(b"corrupt")
                with pytest.raises(ValueError, match="Existing Terraform differs"):
                    installer.install(raw, target)
                assert not (target / "terraform").exists()
                assert binary.read_bytes() == b"corrupt"

    def test_known_default_symlink_is_retained_without_changing_link_or_target(self):
        raw = fixture()
        old = b"original-known-terraform"
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(installer, "ARCHIVE_SHA256", hashlib.sha256(raw).hexdigest()),
            patch.object(
                installer,
                "BINARY_SHA256",
                hashlib.sha256(b"fixture-only-executable").hexdigest(),
            ),
            patch.object(
                installer,
                "RETAINED_BINARY_VERSIONS",
                {hashlib.sha256(old).hexdigest(): "1.17.1"},
            ),
        ):
            target = Path(directory) / "bin"
            target.mkdir(mode=0o700)
            original = Path(directory) / "original-terraform"
            original.write_bytes(old)
            original.chmod(0o755)
            link = target / "terraform"
            link.symlink_to(original)
            target.chmod(0o775)
            before = link.lstat()
            result = installer.install(raw, target)
            assert link.is_symlink()
            assert link.resolve() == original
            assert link.lstat().st_ino == before.st_ino
            assert link.lstat().st_ctime_ns == before.st_ctime_ns
            assert original.read_bytes() == old
            assert result["retainedDefaultVersion"] == "1.17.1"

    def test_latest_cache_without_execute_permission_refuses_install_and_check(self):
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
            cache = installer.versions_directory(target)
            binary = cache / installer.VERSION / "terraform"
            binary.parent.mkdir(mode=0o700, parents=True)
            binary.write_bytes(b"fixture-only-executable")
            binary.chmod(0o644)
            before = binary.stat()
            for action in [
                lambda: installer.install(raw, target),
                lambda: installer.inspect_installation(target),
            ]:
                with pytest.raises(ValueError, match="executable"):
                    action()
            assert binary.stat().st_ino == before.st_ino
            assert binary.stat().st_ctime_ns == before.st_ctime_ns
            assert not (target / "terraform").exists()

    def test_unrecognized_retained_executable_does_not_create_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "terraform"
            source.write_bytes(b"unrecognized")
            source.chmod(0o755)
            cache = Path(directory) / "versions"
            with pytest.raises(ValueError, match="Existing Terraform differs"):
                installer.retain_executable(source, cache)
            assert not cache.exists()
            assert source.read_bytes() == b"unrecognized"

    def test_concurrent_matching_cache_publication_preserves_original_winner(self):
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
            cached = (
                installer.versions_directory(target) / installer.VERSION / "terraform"
            )
            winner = []
            original_link = os.link

            def concurrent(source, destination, **kwargs):
                if Path(destination) == cached:
                    cached.write_bytes(b"fixture-only-executable")
                    cached.chmod(0o755)
                    winner.append(cached.stat())
                    raise FileExistsError
                return original_link(source, destination, **kwargs)

            with patch.object(installer.os, "link", side_effect=concurrent):
                result = installer.install(raw, target)
            assert result["status"] == "already-installed"
            assert cached.stat().st_ino == winner[0].st_ino
            assert cached.stat().st_ctime_ns == winner[0].st_ctime_ns
            assert cached.stat().st_nlink == 1
            assert (target / "terraform").read_bytes() == cached.read_bytes()

    def test_interrupted_cache_publication_preserves_partial_evidence_and_can_recover(
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
            cache_version = installer.versions_directory(target) / installer.VERSION
            with (
                patch.object(
                    installer.os, "link", side_effect=OSError("interrupted publication")
                ),
                pytest.raises(OSError, match="interrupted publication"),
            ):
                installer.install(raw, target)
            partial = list(cache_version.glob(".terraform-install-*"))
            assert len(partial) == 1
            evidence = {path.name: path.read_bytes() for path in partial[0].iterdir()}
            assert "review.json" in evidence
            assert "archive.zip" in evidence
            assert not (cache_version / "terraform").exists()
            assert not (target / "terraform").exists()
            assert installer.install(raw, target)["status"] == "installed"
            assert {
                path.name: path.read_bytes() for path in partial[0].iterdir()
            } == evidence


if __name__ == "__main__":
    unittest.main()
