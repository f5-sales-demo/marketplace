"""Pinned SSH client user installation; offline archive fixtures are never live evidence."""

import contextlib
import hashlib
import importlib.util
import io
import json
import os
import stat
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest

SCRIPT = (
    Path(__file__).resolve().parents[1]
    / "plugins/terraform/scripts/install_ssh_clients.py"
)
spec = importlib.util.spec_from_file_location("user_ssh_clients_install", SCRIPT)
if spec is None or spec.loader is None:
    MODULE_ERROR = "SSH installer test module unavailable"
    raise RuntimeError(MODULE_ERROR)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


def fixture(extra=None, duplicate=False, link=False):
    binary = bytearray(64)
    binary[:6] = b"\x7fELF\x02\x01"
    binary[16:20] = b"\x03\x00>\x00"
    payload = {
        "bin/" + name: bytes(binary) + name.encode()
        for name in ["ssh", "ssh-keyscan", "ssh-keygen"]
    }
    files = {
        name: hashlib.sha256(payload["bin/" + name]).hexdigest()
        for name in ["ssh", "ssh-keyscan", "ssh-keygen"]
    }
    build = {
        "schemaVersion": 1,
        "version": "10.6p2",
        "platform": "linux-amd64",
        "clientOnly": True,
        "privilegedOperations": False,
        "files": files,
    }
    payload["BUILD.json"] = json.dumps(build, sort_keys=True).encode()
    payload["LICENCE"] = b"Offline fixture license"
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in payload.items():
            info = zipfile.ZipInfo(name)
            info.external_attr = (
                stat.S_IFLNK | 511 if link and name == "bin/ssh" else stat.S_IFREG | 320
            ) << 16
            archive.writestr(info, data)
        if extra:
            archive.writestr(extra, b"foreign")
        if duplicate:
            with pytest.warns(UserWarning, match="Duplicate name:"):
                archive.writestr("bin/ssh", payload["bin/ssh"])
    return (out.getvalue(), payload, files)


@contextlib.contextmanager
def admitted_fixture(**kwargs):
    raw, payload, files = fixture(**kwargs)
    with patch.multiple(
        installer,
        ARCHIVE_SHA256=hashlib.sha256(raw).hexdigest(),
        FILES=files,
        LICENSE_SHA256=hashlib.sha256(payload["LICENCE"]).hexdigest(),
        BUILD_SHA256=hashlib.sha256(payload["BUILD.json"]).hexdigest(),
    ):
        yield (raw, payload)


class SshClientInstallTests(unittest.TestCase):
    def test_wrong_archive_creates_no_target(self):
        raw, _, _ = fixture()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "clients"
            with pytest.raises(ValueError, match="archive checksum"):
                installer.install(raw, root)
            assert not root.exists()
            assert not list(Path(directory).iterdir())

    def test_owned_install_is_idempotent_and_inspection_is_read_only(self):
        with (
            admitted_fixture() as (raw, payload),
            tempfile.TemporaryDirectory() as directory,
        ):
            root = Path(directory) / "clients"
            result = installer.install(raw, root)
            assert result["scope"] == "user"
            assert not result["privilegedOperations"]
            for name, data in payload.items():
                assert (root / name).read_bytes() == data
                assert (root / name).stat().st_mode & 511 == (
                    320 if name.startswith("bin/") else 256
                )
                assert (root / name).stat().st_nlink == 1
            before = {str(p): p.stat() for p in root.rglob("*")}
            assert installer.inspect(root)["status"] == "ready"
            assert installer.install(raw, root)["status"] == "already-installed"
            for p in root.rglob("*"):
                prior = before[str(p)]
                current = p.stat()
                assert (prior.st_ino, prior.st_mtime_ns, prior.st_ctime_ns) == (
                    current.st_ino,
                    current.st_mtime_ns,
                    current.st_ctime_ns,
                )

    def test_archive_inventory_injection_duplicate_and_symlink_are_refused(self):
        cases: list[dict[str, str | bool]] = [
            {"extra": "../escape"},
            {"extra": "bin/other"},
            {"duplicate": True},
            {"link": True},
        ]
        for kwargs in cases:
            with (
                self.subTest(kwargs=kwargs),
                admitted_fixture(**kwargs) as (raw, _),
                tempfile.TemporaryDirectory() as directory,
            ):
                root = Path(directory) / "clients"
                with pytest.raises(ValueError, match="archive inventory"):
                    installer.install(raw, root)
                assert not root.exists()

    def test_existing_foreign_or_partial_root_is_preserved(self):
        with admitted_fixture() as (raw, _), tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "clients"
            root.mkdir(mode=448)
            owned = root / "preserve"
            owned.write_bytes(b"unrelated")
            before = owned.stat()
            with pytest.raises(
                ValueError, match="Exact original client installation inventory"
            ):
                installer.install(raw, root)
            assert owned.read_bytes() == b"unrelated"
            assert owned.stat().st_ino == before.st_ino

    def test_changed_bytes_mode_link_and_foreign_inventory_fail_inspection(self):
        for kind in ["bytes", "mode", "hardlink", "symlink", "foreign"]:
            with (
                self.subTest(kind=kind),
                admitted_fixture() as (raw, _),
                tempfile.TemporaryDirectory() as directory,
            ):
                root = Path(directory) / "clients"
                installer.install(raw, root)
                binary = root / "bin/ssh"
                if kind == "bytes":
                    binary.chmod(448)
                    binary.write_bytes(b"changed")
                    binary.chmod(320)
                elif kind == "mode":
                    binary.chmod(448)
                elif kind == "hardlink":
                    os.link(binary, Path(directory) / "other")
                elif kind == "symlink":
                    data = binary.read_bytes()
                    binary.unlink()
                    other = Path(directory) / "other"
                    other.write_bytes(data)
                    binary.symlink_to(other)
                else:
                    (root / "foreign").write_bytes(b"preserve")
                with pytest.raises(
                    ValueError,
                    match={
                        "bytes": "Original installed client bytes differ",
                        "mode": "Owned original client file required",
                        "hardlink": "Owned original client file required",
                        "symlink": "Canonical original client path required",
                        "foreign": "Exact original client installation inventory",
                    }[kind],
                ):
                    installer.inspect(root)

    def test_symlink_parent_is_not_followed(self):
        with admitted_fixture() as (raw, _), tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            real = base / "real"
            real.mkdir(mode=448)
            link = base / "link"
            link.symlink_to(real, target_is_directory=True)
            with pytest.raises(
                ValueError, match="Canonical original client path required"
            ):
                installer.install(raw, link / "clients")
            assert not list(real.iterdir())

    def test_publish_conflict_preserves_foreign_target_and_partial_stage(self):
        with admitted_fixture() as (raw, _), tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "clients"

            def conflict(stage, target):
                target.mkdir(mode=448)
                (target / "foreign").write_bytes(b"preserve")
                message = "Original target appeared"
                raise FileExistsError(message)

            with (
                patch.object(installer, "publish", side_effect=conflict),
                pytest.raises(FileExistsError, match="Original target appeared"),
            ):
                installer.install(raw, root)
            assert (root / "foreign").read_bytes() == b"preserve"
            stages = list(Path(directory).glob(".ssh-install-*"))
            assert len(stages) == 1
            assert (stages[0] / "installation.json").is_file()

    def test_shipped_archive_and_manifest_match_the_compiled_client_pins(self):
        root = SCRIPT.parent.parent
        pins = json.loads((root / "src/gcp-ssh-client-pins.json").read_text())
        assert all(
            isinstance(declaration, dict) and set(declaration) == {"sha256"}
            for declaration in pins["files"].values()
        )
        assert {
            name: declaration["sha256"] for name, declaration in pins["files"].items()
        } == installer.FILES
        assert pins["archiveSha256"] == installer.ARCHIVE_SHA256
        assert (
            pins["installerSha256"] == hashlib.sha256(SCRIPT.read_bytes()).hexdigest()
        )
        raw = (root / "artifacts" / pins["asset"]).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == installer.ARCHIVE_SHA256
        for name, data in installer.unpack(raw).items():
            if name.startswith("bin/"):
                assert b"/mnt/robin-data" not in data

    def test_original_deadline_guard_refuses_before_any_install_mutation(self):
        with admitted_fixture() as (raw, _), tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "clients"

            def guard(_phase):
                message = "original deadline expired"
                raise ValueError(message)

            with pytest.raises(ValueError, match="original deadline expired"):
                installer.install(raw, root, guard=guard)
            assert not root.exists()
            assert not list(Path(directory).iterdir())

    def test_deadline_at_publication_retains_original_stage_without_publishing(self):
        with admitted_fixture() as (raw, _), tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "clients"

            def guard(phase):
                if phase == "publish":
                    message = "original deadline expired"
                    raise ValueError(message)

            with pytest.raises(ValueError, match="original deadline expired"):
                installer.install(raw, root, guard=guard)
            assert not root.exists()
            stages = list(Path(directory).glob(".ssh-install-*"))
            assert len(stages) == 1
            assert (stages[0] / "installation.json").is_file()
