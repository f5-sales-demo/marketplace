"""Real Linux grant publication; filesystem results confer no bootstrap authority."""

import hashlib
import importlib
import os
from concurrent.futures import ThreadPoolExecutor

import pytest


@pytest.fixture
def publication(tmp_path):
    module = importlib.import_module(
        "plugins.terraform.scripts.publish_bootstrap_grant"
    )
    directory = tmp_path / "authorization"
    directory.mkdir(mode=0o700)
    nonce = "a" * 32
    raw = b'{"payload":{"kind":"synthetic-unit-fixture"},"signature":"synthetic"}'
    sha = hashlib.sha256(raw).hexdigest()
    info = directory.stat()
    identity = (info.st_dev, info.st_ino, info.st_uid, info.st_mode)

    def stage(suffix="b"):
        name = ".grant-" + nonce + "-" + suffix * 32 + ".partial"
        path = directory / name
        path.write_bytes(raw)
        path.chmod(0o400)
        return name

    def publish(name, **changed):
        return module.publish_bootstrap_grant(
            directory,
            name,
            nonce,
            changed.get("sha", sha),
            changed.get("identity", identity),
        )

    return module, directory, nonce, raw, sha, identity, stage, publish


def test_complete_single_link_grant_is_published(publication):
    _, directory, nonce, raw, sha, _, stage, publish = publication
    name = stage()
    result = publish(name)
    target = directory / ("grant-" + nonce + ".json")
    assert target.read_bytes() == raw
    assert not (directory / name).exists()
    assert target.stat().st_nlink == 1
    assert target.stat().st_mode & 0o777 == 0o400
    assert result["sha256"] == sha
    assert result["executionAuthorized"] is False


def test_existing_grant_is_never_replaced(publication):
    _, directory, nonce, raw, _, _, stage, publish = publication
    target = directory / ("grant-" + nonce + ".json")
    target.write_bytes(b"retained-original")
    name = stage()
    with pytest.raises(FileExistsError):
        publish(name)
    assert target.read_bytes() == b"retained-original"
    assert (directory / name).read_bytes() == raw


def test_changed_source_hash_refuses_without_publication(publication):
    _, directory, nonce, _, _, _, stage, publish = publication
    name = stage()
    with pytest.raises(ValueError, match="Original"):
        publish(name, sha="0" * 64)
    assert not (directory / ("grant-" + nonce + ".json")).exists()
    assert (directory / name).exists()


def test_original_directory_identity_is_required(publication):
    _, directory, nonce, _, _, identity, stage, publish = publication
    name = stage()
    changed = (identity[0], identity[1] + 1, *identity[2:])
    with pytest.raises(ValueError, match="Original"):
        publish(name, identity=changed)
    assert not (directory / ("grant-" + nonce + ".json")).exists()


@pytest.mark.parametrize("kind", ["symlink", "mode", "hardlink"])
def test_symlink_mode_and_hardlink_sources_refuse(publication, kind):
    _, directory, nonce, _, _, _, stage, publish = publication
    name = stage()
    path = directory / name
    if kind == "symlink":
        retained = directory / "retained"
        path.rename(retained)
        path.symlink_to(retained.name)
    elif kind == "mode":
        path.chmod(0o600)
    else:
        os.link(path, directory / "alias")
    with pytest.raises(ValueError, match="Original"):
        publish(name)
    assert not (directory / ("grant-" + nonce + ".json")).exists()


def test_two_publishers_have_one_winner_and_preserve_loser(publication):
    _, directory, nonce, raw, _, _, stage, publish = publication
    names = [stage("f"), stage("1")]

    def attempt(name):
        try:
            publish(name)
        except FileExistsError:
            return "retained"
        return "published"

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(attempt, names))
    assert sorted(outcomes) == ["published", "retained"]
    assert (directory / ("grant-" + nonce + ".json")).read_bytes() == raw
    assert sum((directory / name).exists() for name in names) == 1


def test_traversal_and_foreign_nonce_refuse(publication):
    _, directory, nonce, _, _, _, stage, publish = publication
    name = stage()
    for supplied in ("../" + name, name.replace(nonce, "0" * 32)):
        with pytest.raises(ValueError, match="Original"):
            publish(supplied)
    assert not (directory / ("grant-" + nonce + ".json")).exists()


def test_unavailable_native_primitive_does_not_fall_back(publication, monkeypatch):
    module, directory, nonce, _, _, _, stage, publish = publication
    name = stage()

    def unsupported(*_args):
        message = "synthetic unsupported primitive"
        raise RuntimeError(message)

    monkeypatch.setattr(module, "rename_without_replacement", unsupported)
    with pytest.raises(RuntimeError):
        publish(name)
    assert not (directory / ("grant-" + nonce + ".json")).exists()
    assert (directory / name).exists()


def test_failed_final_flush_retains_uncertain_publication(publication, monkeypatch):
    module, directory, nonce, raw, _, _, stage, publish = publication
    original = module.os.fsync
    calls = 0

    def flush(fd):
        nonlocal calls
        calls += 1
        if calls == 2:
            message = "synthetic directory flush failure"
            raise OSError(message)
        return original(fd)

    monkeypatch.setattr(module.os, "fsync", flush)
    name = stage()
    with pytest.raises(OSError, match="synthetic"):
        publish(name)
    target = directory / ("grant-" + nonce + ".json")
    assert target.read_bytes() == raw
    assert not (directory / name).exists()
    with pytest.raises(FileExistsError):
        publish(stage("2"))
    assert target.read_bytes() == raw


def test_directory_replacement_during_capture_refuses(publication, monkeypatch):
    module, directory, nonce, _, _, _, stage, publish = publication
    original = module.os.fsync

    def swap(fd):
        original(fd)
        directory.rename(directory.with_name("retained-original"))
        directory.mkdir(mode=0o700)

    monkeypatch.setattr(module.os, "fsync", swap)
    name = stage()
    with pytest.raises(ValueError, match="Original"):
        publish(name)
    assert not (directory / ("grant-" + nonce + ".json")).exists()
    assert (directory.with_name("retained-original") / name).exists()
