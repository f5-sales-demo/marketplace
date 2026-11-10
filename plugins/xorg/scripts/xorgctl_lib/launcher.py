"""Durable, content-addressed xorgctl launcher installation."""
# ruff: noqa: S603

from __future__ import annotations

import hashlib
import os
import pathlib
import shlex
import shutil
import subprocess
import tempfile

from .common import VERSION, Fault, private


def _payload_digest(root: pathlib.Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*")):
        if "__pycache__" in path.parts:
            continue
        if path.is_symlink():
            message = "controller payload must not contain symlinks"
            raise Fault(message)
        if path.is_file():
            digest.update(str(path.relative_to(root)).encode() + b"\0")
            digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()


def install(interpreter: pathlib.Path) -> None:
    """Stage and atomically activate the complete durable controller payload."""
    source = pathlib.Path(__file__).resolve().parents[2]
    runtime = private(pathlib.Path.home() / ".local/share/xorgctl/runtime")
    with tempfile.TemporaryDirectory(prefix=".stage-", dir=runtime) as directory:
        staged = pathlib.Path(directory) / "payload"
        shutil.copytree(
            source / "scripts",
            staged / "scripts",
            ignore=shutil.ignore_patterns("tests", "__pycache__", "*.pyc"),
        )
        (staged / ".xcsh-plugin").mkdir()
        shutil.copy2(
            source / ".xcsh-plugin/plugin.json", staged / ".xcsh-plugin/plugin.json"
        )
        digest = _payload_digest(staged)
        verified = subprocess.run(
            [str(interpreter), str(staged / "scripts/xorgctl"), "--version"],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )
        if verified.stdout.strip() != VERSION:
            message = "staged controller version does not match shipped manifest"
            raise Fault(message)
        payload = runtime / digest
        if payload.exists() or payload.is_symlink():
            private(payload)
            if _payload_digest(payload) != digest:
                message = "installed controller payload has changed"
                raise Fault(message)
        else:
            staged.rename(payload)
            private(payload)
    destination = pathlib.Path.home() / ".local/bin/xorgctl"
    destination.parent.mkdir(parents=True, exist_ok=True)
    contents = (
        f"#!/bin/sh\nexec {shlex.quote(str(interpreter))} "
        f'{shlex.quote(str(payload / "scripts/xorgctl"))} "$@"\n'
    )
    if (
        destination.is_file()
        and not destination.is_symlink()
        and destination.read_text() == contents
    ):
        destination.chmod(0o755)
        return
    with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as stream:
        temporary = pathlib.Path(stream.name)
    try:
        temporary.write_text(contents)
        temporary.chmod(0o755)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
