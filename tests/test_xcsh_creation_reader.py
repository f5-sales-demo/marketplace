"""Distinct xcsh reader admission and immutable source tests; no cloud calls."""

import copy
import hashlib
import importlib
import os
from types import ModuleType

import pytest


@pytest.fixture
def reader():
    return importlib.import_module("plugins.terraform.scripts.xcsh_creation_reader")


def binding(path, raw=b"source", mode="33152"):
    uid = str(os.getuid())
    return {
        "path": path,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "expectedIdentity": {
            "dev": "1",
            "ino": "1",
            "uid": uid,
            "nlink": "1",
            "mode": mode,
            "size": str(len(raw)),
            "mtimeNs": "1",
            "ctimeNs": "1",
        },
        "expectedParentIdentity": {"dev": "1", "ino": "1", "uid": uid, "mode": "16832"},
    }


@pytest.fixture
def request_data():
    pins = {
        "bootstrap": "aac3ade3f7d90fbf63e3ea0c46120a0cfbd159e1e503dde04721979507a1548b",
        "terraform": "dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e",
        "xcsh": "542d99d1905fe03fadce8a889390751b3ad1531f367ef678cf03d97204ef7cc1",
    }
    inputs = {}
    for role, value in pins.items():
        row = binding("/example/" + role)
        row["sha256"] = value
        inputs[role] = row
    scope = binding("/example/scope.json")
    inputs["prepared:scope"] = scope
    return {
        "schemaVersion": 1,
        "kind": "original-xcsh-creation-window",
        "originalStartMs": 100,
        "deadlineMs": 7200100,
        "windowMs": 45000,
        "startupDeadlineMs": 15100,
        "executor": {
            "pid": 123,
            "group": 123,
            "start": "100",
            "boot": "11111111-1111-1111-1111-111111111111",
        },
        "executables": {
            role: {"path": "/example/" + role, "sha256": value}
            for role, value in pins.items()
        },
        "inputs": inputs,
        "scope": {
            "path": scope["path"],
            "sha256": scope["sha256"],
            "planSha256": "c" * 64,
            "targets": [
                {
                    "type_name": "xcsh_token",
                    "name": "example-token",
                    "namespace": "system",
                }
            ],
        },
    }


def test_declared_xcsh_window_keeps_the_original_budget(reader, request_data):
    assert reader.validate_request(request_data, 200) == 45200
    request_data["startupDeadlineMs"] = 7200100
    assert reader.validate_request(request_data, 7200099) == 7200100


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("schemaVersion", True),
        ("schemaVersion", 2),
        ("kind", "original-provider-cohort"),
        ("originalStartMs", True),
        ("originalStartMs", 201),
        ("deadlineMs", 7200200),
        ("windowMs", 60000),
        ("windowMs", 44999),
        ("windowMs", True),
    ],
)
def test_foreign_profiles_and_budget_changes_refuse(reader, request_data, field, value):
    request_data[field] = value
    with pytest.raises(ValueError, match="Original xcsh"):
        reader.validate_request(request_data, 200)


def test_expired_or_augmented_request_cannot_renew_observation(reader, request_data):
    with pytest.raises(ValueError, match="Original xcsh"):
        reader.validate_request(request_data, 7200100)
    request_data["executionAuthorized"] = True
    with pytest.raises(ValueError, match="Original xcsh"):
        reader.validate_request(request_data, 200)


@pytest.mark.parametrize(
    ("field", "value"),
    [("pid", True), ("pid", 1.0), ("group", 124), ("start", "0"), ("boot", "foreign")],
)
def test_executor_shape_requires_exact_original_identity(
    reader, request_data, field, value
):
    request_data["executor"][field] = value
    with pytest.raises(ValueError, match="Original xcsh"):
        reader.validate_request(request_data, 200)


@pytest.mark.parametrize("role", ["bootstrap", "terraform", "xcsh"])
def test_changed_or_google_executable_never_becomes_xcsh(reader, request_data, role):
    request_data["executables"][role]["sha256"] = (
        "f6c7080ca82f5ecc2f279f9b6edf152ec366890f76ab0a97a1667bdf17331ef5"
    )
    with pytest.raises(ValueError, match="Original xcsh"):
        reader.validate_request(request_data, 200)


def test_pins_require_the_original_admitted_inputs(reader, request_data):
    del request_data["inputs"]["xcsh"]
    with pytest.raises(ValueError, match="Original xcsh"):
        reader.validate_request(request_data, 200)
    request_data["executables"]["provider"] = request_data["executables"].pop("xcsh")
    with pytest.raises(ValueError, match="Original xcsh"):
        reader.validate_request(request_data, 200)


@pytest.mark.parametrize(
    "change", ["duplicate", "foreign-type", "unknown-field", "unsafe-name", "empty"]
)
def test_scope_targets_are_exact_and_bounded(reader, request_data, change):
    targets = request_data["scope"]["targets"]
    if change == "duplicate":
        targets.append(copy.deepcopy(targets[0]))
    elif change == "foreign-type":
        targets[0]["type_name"] = "google_compute_instance"
    elif change == "unknown-field":
        targets[0]["executionAuthorized"] = True
    elif change == "unsafe-name":
        targets[0]["name"] = "example;command"
    else:
        targets.clear()
    with pytest.raises(ValueError, match="Original xcsh"):
        reader.validate_request(request_data, 200)


def actual_binding(path):
    before = path.stat()
    parent = path.parent.stat()
    fields = {
        "dev": before.st_dev,
        "ino": before.st_ino,
        "uid": before.st_uid,
        "nlink": before.st_nlink,
        "mode": before.st_mode,
        "size": before.st_size,
        "mtimeNs": before.st_mtime_ns,
        "ctimeNs": before.st_ctime_ns,
    }
    return {
        "path": str(path),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "expectedIdentity": {key: str(value) for key, value in fields.items()},
        "expectedParentIdentity": {
            "dev": str(parent.st_dev),
            "ino": str(parent.st_ino),
            "uid": str(parent.st_uid),
            "mode": str(parent.st_mode),
        },
    }


@pytest.mark.parametrize("change", ["bytes", "replacement", "parent-mode", "hardlink"])
def test_original_input_guard_rejects_mutation_and_preserves_failure(
    reader, tmp_path, change
):
    path = tmp_path / "source.py"
    path.write_bytes(b"marker = 'original'\n")
    path.chmod(0o400)
    guard = reader.OriginalCreationInputs({"script:source.py": actual_binding(path)})
    guard.verify()
    if change == "bytes":
        path.chmod(0o600)
        path.write_bytes(b"marker = 'foreign'\n")
        path.chmod(0o400)
    elif change == "replacement":
        path.rename(tmp_path / "old.py")
        path.write_bytes(b"marker = 'original'\n")
        path.chmod(0o400)
    elif change == "parent-mode":
        tmp_path.chmod(0o750)
    else:
        os.link(path, tmp_path / "alias.py")
    with pytest.raises(ValueError, match="Original xcsh"):
        guard.verify()
    with pytest.raises(ValueError, match="Original xcsh"):
        guard.verify()


def test_guard_owns_its_snapshot_and_compiles_only_admitted_source(reader, tmp_path):
    path = tmp_path / "source.py"
    raw = b"marker = 'original'\n"
    path.write_bytes(raw)
    path.chmod(0o400)
    rows = {"script:source.py": actual_binding(path)}
    guard = reader.OriginalCreationInputs(rows)
    guard.verify()
    rows["script:source.py"]["sha256"] = "a" * 64
    guard.verify()
    assert guard.source(path) == raw
    loader = reader.AdmittedCreationSourceLoader(
        "fixture", str(path), guard.source(path)
    )
    loaded = ModuleType("fixture")
    loader.exec_module(loaded)
    assert loaded.__dict__["marker"] == "original"
    with pytest.raises(ValueError, match="Original xcsh"):
        loader.get_code("foreign")


@pytest.mark.parametrize(
    "raw", [b'{"a":1,"a":2}', b"{} {}", b"[]", b'{"secret":"private-marker",']
)
def test_json_boundary_rejects_duplicate_trailing_and_malformed_output_without_values(
    reader, raw
):
    with pytest.raises(ValueError, match="Original xcsh") as caught:
        reader.strict_object(raw)
    assert "private-marker" not in str(caught.value)


def test_no_plain_receipt_is_an_observer_witness(reader, request_data):
    assert reader.validate_request(request_data, 200) > 200
    assert "witnesses" not in request_data
    request_data["witnesses"] = [{"pid": request_data["executor"]["pid"]}]
    with pytest.raises(ValueError, match="Original xcsh"):
        reader.validate_request(request_data, 200)


@pytest.mark.parametrize("deadline", [200, 15201, True])
def test_reader_startup_has_its_own_fixed_fifteen_second_bound(
    reader, request_data, deadline
):
    request_data["startupDeadlineMs"] = deadline
    with pytest.raises(ValueError, match="Original xcsh"):
        reader.validate_request(request_data, 200)


def test_utf16_json_cannot_cross_the_declared_utf8_boundary(reader):
    with pytest.raises(ValueError, match="Original xcsh"):
        reader.strict_object("{}".encode("utf-16"))
