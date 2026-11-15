"""Validate signed-bootstrap scope mapping without granting execution."""

import base64
from pathlib import Path
from typing import Any

import pytest

from plugins.terraform.scripts.xcsh_creation_observer import validate_bootstrap_scope


def scope(tmp_path: Path) -> tuple[Path, Path, dict[str, Any]]:
    """Build an original isolated scope with its sibling authorization directory."""
    creation = tmp_path / "creation"
    directory = tmp_path / "authorization"
    creation.mkdir(mode=0o700)
    directory.mkdir(mode=0o700)
    spec = {
        "schema_version": 1,
        "directory": str(directory),
        "public_key": base64.b64encode(b"x" * 32).decode().rstrip("="),
        "original_start_ms": 100,
        "original_deadline_ms": 7200100,
    }
    return creation, directory, {"schema_version": 2, "bootstrap_authorization": spec}


def test_original_scope_v2_mapping(tmp_path: Path) -> None:
    """Join the declared scope without changing historical scope meaning."""
    creation, directory, data = scope(tmp_path)
    actual = validate_bootstrap_scope(data, creation, 7200100, lambda: 200)
    assert actual is not None
    assert actual[0] == directory
    assert (
        validate_bootstrap_scope({"schema_version": 1}, creation, 7200100, lambda: 200)
        is None
    )


@pytest.mark.parametrize(
    "change",
    [
        "schema",
        "boolean",
        "padded",
        "key",
        "budget",
        "deadline",
        "unknown",
        "overlap",
        "wide",
        "expired",
    ],
)
def test_invalid_authorization_mapping(tmp_path: Path, change: str) -> None:
    """Reject unsafe authorization metadata before accepting the source."""
    creation, directory, data = scope(tmp_path)
    spec = data["bootstrap_authorization"]
    now = 200
    if change == "schema":
        spec["schema_version"] = True
    if change == "boolean":
        spec["original_start_ms"] = False
    if change == "padded":
        spec["public_key"] += "="
    if change == "key":
        spec["public_key"] = "invalid"
    if change == "budget":
        spec["original_start_ms"] += 1
    if change == "deadline":
        spec["original_deadline_ms"] += 1
    if change == "unknown":
        spec["foreign"] = 1
    if change == "overlap":
        spec["directory"] = str(creation)
    if change == "wide":
        directory.chmod(0o755)
    if change == "expired":
        now = 7200100
    with pytest.raises(ValueError, match="Original"):
        validate_bootstrap_scope(data, creation, 7200100, lambda: now)


def test_final_capture_retains_metadata_after_authorization_budget(
    tmp_path: Path,
) -> None:
    creation, directory, data = scope(tmp_path)
    with pytest.raises(ValueError, match="Original"):
        validate_bootstrap_scope(data, creation, 7200100, lambda: 7200100)
    original = validate_bootstrap_scope(data, creation, 7200100, lambda: 200)
    assert (
        validate_bootstrap_scope(
            data, creation, 7200100, lambda: 7200100, admission=False
        )
        == original
    )
    directory.chmod(0o755)
    with pytest.raises(ValueError, match="Original"):
        validate_bootstrap_scope(
            data, creation, 7200100, lambda: 7200100, admission=False
        )
