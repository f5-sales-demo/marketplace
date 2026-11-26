"""Verify original-clock readiness and the exact native fixture distribution."""

import hashlib
import importlib.util
import os
from pathlib import Path

import pytest

SOURCE = Path(__file__).resolve().parents[1] / "scripts/ci_gcp_test_prerequisites.py"
spec = importlib.util.spec_from_file_location("ci_gcp_test_prerequisites", SOURCE)
assert spec is not None
assert spec.loader is not None
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_short_lived_runner_waits_until_a_nonnegative_two_hour_history_exists() -> None:
    assert module.remaining_history_ms(1000) == 7199000
    assert module.remaining_history_ms(7200000) == 0
    assert module.remaining_history_ms(7200010) == 0


def test_invalid_and_backwards_clocks_refuse_without_resetting_the_original_wait() -> (
    None
):
    for value in [-1, True, 0.5, float("inf")]:
        with pytest.raises(ValueError, match="nonnegative integer"):
            module.remaining_history_ms(value)
    samples = iter([1000, 1000, 999])
    with pytest.raises(ValueError, match="clock or wait deadline changed"):
        module.wait_for_history(lambda: next(samples), lambda _: None, lambda _: None)


def test_one_wait_preserves_its_origin_and_returns_only_at_the_required_history() -> (
    None
):
    samples = iter([7199900, 7199900, 7200000])
    slept: list[float] = []
    receipt = module.wait_for_history(
        lambda: next(samples), slept.append, lambda _: None
    )
    assert slept == [0.1]
    assert receipt["originalStartMs"] == 7199900
    assert receipt["originalDeadlineMs"] == 14399900
    assert receipt["readyAtMs"] == 7200000
    assert receipt["signalsSent"] is False


@pytest.fixture(scope="module")
def archive_bytes() -> bytes:
    return Path(os.environ["CE_TEST_PYTHON_ARCHIVE"]).read_bytes()


def test_exact_official_distribution_contains_the_source_qualified_interpreter(
    archive_bytes: bytes,
) -> None:
    assert (
        module.verify_distribution(archive_bytes)
        == "aac3ade3f7d90fbf63e3ea0c46120a0cfbd159e1e503dde04721979507a1548b"
    )


def test_changed_or_truncated_distribution_refuses_before_creating_a_destination(
    archive_bytes: bytes, tmp_path: Path
) -> None:
    root = tmp_path / "destination"
    for raw in [archive_bytes[:-1], b"foreign archive"]:
        with pytest.raises(ValueError, match="distribution differs"):
            module.prepare_distribution(root, raw)
        assert not root.exists()


def test_extraction_is_exclusive_and_retains_the_exact_interpreter(
    archive_bytes: bytes, tmp_path: Path
) -> None:
    root = tmp_path / "destination"
    binary = module.prepare_distribution(root, archive_bytes)
    assert hashlib.sha256(binary.read_bytes()).hexdigest() == module.PYTHON_SHA256
    with pytest.raises(FileExistsError):
        module.prepare_distribution(root, archive_bytes)
