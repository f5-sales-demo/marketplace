#!/usr/bin/env python3
# ruff: noqa: D101, D103, EM101, EM102, PLR2004, PTH101, PTH105, S101, S310, S603, T201, TRY300, TRY301
# pylint: disable=invalid-name
"""Install and configure Ghostty without taking ownership of user settings."""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import platform as platform_module
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from typing import Any, NamedTuple

PLUGIN_VERSION = "1.0.0"
RECEIPT_SCHEMA = 2
MIN_VERSION = (1, 3, 1)
RELEASE_API = "https://api.github.com/repos/mkasberg/ghostty-ubuntu/releases/latest"
BEGIN = "# xcsh ghostty advisory recommendations"
END = "# end xcsh ghostty advisory recommendations"


class SetupError(RuntimeError):
    """A stable, non-sensitive setup failure."""


class Platform(NamedTuple):
    os_id: str
    version_id: str
    machine: str
    package_arch: str


class PackageIdentity(NamedTuple):
    source: str
    kind: str
    name: str
    version: str
    revision: str | None
    digest: str | None


class Installation(NamedTuple):
    version: tuple[int, int, int]
    executable: str
    identity: PackageIdentity | None = None


class ReleaseAsset(NamedTuple):
    name: str
    url: str
    sha256: str


class ConfigAnalysis(NamedTuple):
    identities: frozenset[str]
    files: tuple[pathlib.Path, ...]


class Candidate(NamedTuple):
    content: bytes
    offered_ids: tuple[str, ...]
    historical_ids: tuple[str, ...]
    changed: bool


class Recommendation(NamedTuple):
    recommendation_id: str
    key: str
    value: str


RECOMMENDATIONS = (
    Recommendation("appearance.background", "background", "#15191f"),
    Recommendation("appearance.foreground", "foreground", "#dcdcdc"),
    Recommendation(
        "appearance.selection-background", "selection-background", "#b3d7ff"
    ),
    Recommendation(
        "appearance.selection-foreground", "selection-foreground", "#000000"
    ),
    Recommendation("appearance.cursor-color", "cursor-color", "#ffffff"),
    Recommendation("appearance.cursor-text", "cursor-text", "#000000"),
    Recommendation("appearance.cursor-style", "cursor-style", "block"),
    Recommendation("appearance.cursor-blink", "cursor-style-blink", "false"),
    Recommendation("appearance.bold-color", "bold-color", "#ffffff"),
    Recommendation("palette.0", "palette", "0=#14191e"),
    Recommendation("palette.1", "palette", "1=#b43c2a"),
    Recommendation("palette.2", "palette", "2=#00c200"),
    Recommendation("palette.3", "palette", "3=#c7c400"),
    Recommendation("palette.4", "palette", "4=#2744c7"),
    Recommendation("palette.5", "palette", "5=#c040be"),
    Recommendation("palette.6", "palette", "6=#00c5c7"),
    Recommendation("palette.7", "palette", "7=#c7c7c7"),
    Recommendation("palette.8", "palette", "8=#686868"),
    Recommendation("palette.9", "palette", "9=#dd7975"),
    Recommendation("palette.10", "palette", "10=#58e790"),
    Recommendation("palette.11", "palette", "11=#ece100"),
    Recommendation("palette.12", "palette", "12=#a7abf2"),
    Recommendation("palette.13", "palette", "13=#e17ee1"),
    Recommendation("palette.14", "palette", "14=#60fdff"),
    Recommendation("palette.15", "palette", "15=#ffffff"),
    Recommendation("font.primary", "font-family", '"JetBrainsMono Nerd Font"'),
    Recommendation("font.emoji", "font-family", '"Noto Color Emoji"'),
    Recommendation("font.style", "font-style", "Regular"),
    Recommendation("font.size", "font-size", "9"),
    Recommendation("gtk.single-instance", "gtk-single-instance", "false"),
    Recommendation("terminal.term", "term", "xterm-ghostty"),
    Recommendation("terminal.mouse", "mouse-reporting", "true"),
    Recommendation("terminal.scrollback", "scrollback-limit", "10000000"),
    Recommendation("working-directory.initial", "working-directory", "home"),
    Recommendation(
        "working-directory.window", "window-inherit-working-directory", "true"
    ),
    Recommendation("working-directory.tab", "tab-inherit-working-directory", "true"),
    Recommendation(
        "working-directory.split", "split-inherit-working-directory", "true"
    ),
    Recommendation("shell.integration", "shell-integration", "detect"),
    Recommendation(
        "shell.features",
        "shell-integration-features",
        "cursor,no-sudo,title,ssh-env,ssh-terminfo,path",
    ),
    Recommendation("clipboard.copy-on-select", "copy-on-select", "true"),
    Recommendation("clipboard.write", "clipboard-write", "allow"),
    Recommendation("clipboard.trim", "clipboard-trim-trailing-spaces", "true"),
    Recommendation("clipboard.keep-selection-copy", "selection-clear-on-copy", "false"),
    Recommendation("clipboard.clear-on-typing", "selection-clear-on-typing", "true"),
    Recommendation("links.url", "link-url", "true"),
    Recommendation("links.preview", "link-previews", "true"),
    Recommendation("keybind.ctrl-insert", "keybind", "ctrl+insert=copy_to_clipboard"),
    Recommendation(
        "keybind.shift-insert", "keybind", "shift+insert=paste_from_clipboard"
    ),
    Recommendation("keybind.shift-enter", "keybind", r"shift+enter=text:\x1b[13;2u"),
    Recommendation(
        "keybind.alt-shift-enter", "keybind", r"alt+shift+enter=text:\x1b[13;4u"
    ),
)


def _command(
    argv: list[str], *, check: bool = True
) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(argv, check=False, capture_output=True, text=True)
    if check and result.returncode != 0:
        raise SetupError(f"command_failed:{pathlib.Path(argv[0]).name}")
    return result


def _parse_os_release(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in text.splitlines():
        key, separator, value = line.partition("=")
        if separator:
            values[key.strip()] = value.strip().strip("\"'")
    return values


def parse_platform(os_release: str, machine: str) -> Platform:
    values = _parse_os_release(os_release)
    arch = {"x86_64": "amd64", "aarch64": "arm64"}.get(machine)
    if values.get("ID") != "ubuntu" or values.get("VERSION_ID") != "24.04" or not arch:
        raise SetupError("unsupported_platform:requires_ubuntu_24.04_amd64_or_arm64")
    return Platform("ubuntu", "24.04", machine, arch)


def current_platform() -> Platform:
    try:
        os_release = pathlib.Path("/etc/os-release").read_text(encoding="utf-8")
    except OSError as error:
        raise SetupError("unsupported_platform:os_release_unavailable") from error
    return parse_platform(os_release, platform_module.machine())


def parse_version(value: str) -> tuple[int, int, int] | None:
    match = re.search(r"(?<!\d)(\d+)\.(\d+)\.(\d+)(?!\d)", value)
    if not match:
        return None
    major, minor, patch = match.groups()
    return int(major), int(minor), int(patch)


def _compatible_version(value: str | None) -> bool:
    parsed = parse_version(value or "")
    return parsed is not None and parsed >= MIN_VERSION


def choose_install_source(
    current: Installation | None,
    apt_candidate: str | None,
    github_available: bool,
) -> str:
    if current:
        if current.version < MIN_VERSION:
            raise SetupError("incompatible_existing_installation")
        return "existing"
    if _compatible_version(apt_candidate):
        return "apt"
    if github_available:
        return "github_deb"
    return "snap"


def select_release_asset(release: dict[str, Any], target: Platform) -> ReleaseAsset:
    pattern = re.compile(
        rf"ghostty_[0-9][0-9A-Za-z.+~-]*_{re.escape(target.package_arch)}_"
        rf"{re.escape(target.version_id)}\.deb"
    )
    matches = [
        asset
        for asset in release.get("assets", [])
        if pattern.fullmatch(str(asset.get("name", "")))
    ]
    if not matches:
        raise SetupError("published_asset_unavailable")
    if len(matches) != 1:
        raise SetupError("published_asset_ambiguous")
    asset = matches[0]
    if not _compatible_version(str(asset.get("name", ""))):
        raise SetupError("published_asset_incompatible")
    digest = asset.get("digest")
    if not isinstance(digest, str) or not re.fullmatch(
        r"sha256:[0-9a-fA-F]{64}", digest
    ):
        raise SetupError("published_digest_missing")
    url = asset.get("browser_download_url")
    if not isinstance(url, str) or not url.startswith(
        "https://github.com/mkasberg/ghostty-ubuntu/releases/download/"
    ):
        raise SetupError("published_asset_url_invalid")
    return ReleaseAsset(str(asset["name"]), url, digest.removeprefix("sha256:").lower())


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_sha256(path: pathlib.Path, expected: str) -> None:
    if not re.fullmatch(r"[0-9a-f]{64}", expected) or sha256_file(path) != expected:
        raise SetupError("package_digest_mismatch")


def _fetch_release() -> dict[str, Any]:
    request = urllib.request.Request(
        RELEASE_API,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "xcsh-ghostty-setup",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            value = json.load(response)
    except (OSError, ValueError, urllib.error.URLError) as error:
        raise SetupError("github_release_unavailable") from error
    if not isinstance(value, dict):
        raise SetupError("github_release_invalid")
    return value


def _download_asset(asset: ReleaseAsset, destination: pathlib.Path) -> None:
    request = urllib.request.Request(
        asset.url, headers={"User-Agent": "xcsh-ghostty-setup"}
    )
    try:
        with (
            urllib.request.urlopen(request, timeout=120) as response,
            destination.open("wb") as output,
        ):
            shutil.copyfileobj(response, output)
    except (OSError, urllib.error.URLError) as error:
        raise SetupError("package_download_failed") from error
    verify_sha256(destination, asset.sha256)


def apt_candidate_from_policy(policy: str) -> str | None:
    """Return a compatible candidate only when Ubuntu publishes it."""
    match = re.search(r"^\s*Candidate:\s*(\S+)\s*$", policy, re.MULTILINE)
    ubuntu_hosts = (
        "archive.ubuntu.com/ubuntu",
        "security.ubuntu.com/ubuntu",
        "ports.ubuntu.com/ubuntu-ports",
    )
    if (
        not match
        or match.group(1) == "(none)"
        or not any(host in policy for host in ubuntu_hosts)
    ):
        return None
    return match.group(1)


def _apt_candidate() -> str | None:
    result = _command(["apt-cache", "policy", "ghostty"], check=False)
    return apt_candidate_from_policy(result.stdout) if result.returncode == 0 else None


def _install_apt(package: str) -> None:
    _command(["sudo", "-n", "apt-get", "update"])
    _command(
        [
            "sudo",
            "-n",
            "env",
            "DEBIAN_FRONTEND=noninteractive",
            "apt-get",
            "install",
            "-y",
            "--no-install-recommends",
            package,
        ]
    )


def _find_executable() -> str | None:
    found = shutil.which("ghostty")
    if found:
        return str(pathlib.Path(found).resolve())
    snap = pathlib.Path("/snap/bin/ghostty")
    return str(snap.resolve()) if snap.exists() else None


def _dpkg_identity(
    executable: str, source: str, digest: str | None
) -> PackageIdentity | None:
    owner = _command(["dpkg-query", "-S", executable], check=False)
    if owner.returncode != 0 or ":" not in owner.stdout:
        return None
    package = owner.stdout.partition(":")[0].strip()
    version = _command(
        ["dpkg-query", "-W", "-f=${Version}", package],
        check=False,
    )
    if version.returncode != 0 or not version.stdout.strip():
        return None
    return PackageIdentity(
        source, "dpkg", package, version.stdout.strip(), None, digest
    )


def _snap_identity(source: str) -> PackageIdentity | None:
    result = _command(["snap", "list", "ghostty"], check=False)
    lines = result.stdout.splitlines()
    if result.returncode != 0 or len(lines) < 2:
        return None
    fields = lines[1].split()
    if len(fields) < 3:
        return None
    return PackageIdentity(source, "snap", "ghostty", fields[1], fields[2], None)


def inspect_installation(
    source: str = "existing",
    digest: str | None = None,
) -> Installation | None:
    executable = _find_executable()
    if not executable:
        return None
    version_result = _command([executable, "+version"], check=False)
    version = parse_version(version_result.stdout + "\n" + version_result.stderr)
    if version_result.returncode != 0 or version is None:
        raise SetupError("ghostty_version_unverified")
    identity = _dpkg_identity(executable, source, digest) or _snap_identity(source)
    if identity is None:
        identity = PackageIdentity(
            source, "local", "ghostty", ".".join(map(str, version)), None, digest
        )
    return Installation(version, executable, identity)


def install_ghostty(
    target: Platform,
    preserved_identity: PackageIdentity | None = None,
) -> Installation:
    current = inspect_installation(
        preserved_identity.source if preserved_identity else "existing",
        preserved_identity.digest if preserved_identity else None,
    )
    apt_candidate = _apt_candidate() if current is None else None
    release: dict[str, Any] | None = None
    asset: ReleaseAsset | None = None
    if current is None and not _compatible_version(apt_candidate):
        try:
            release = _fetch_release()
            asset = select_release_asset(release, target)
        except SetupError as error:
            if str(error) not in {
                "github_release_unavailable",
                "published_asset_unavailable",
            }:
                raise
    source = choose_install_source(current, apt_candidate, asset is not None)
    digest: str | None = None
    if source == "apt":
        _install_apt("ghostty")
    elif source == "github_deb":
        assert asset is not None
        with tempfile.TemporaryDirectory(prefix="xcsh-ghostty-") as directory:
            package = pathlib.Path(directory) / asset.name
            _download_asset(asset, package)
            digest = asset.sha256
            _install_apt(str(package))
    elif source == "snap":
        _command(
            ["sudo", "-n", "snap", "install", "ghostty", "--channel=latest/stable"]
        )
    installed = inspect_installation(source, digest)
    if installed is None or installed.version < MIN_VERSION:
        raise SetupError("ghostty_installation_unverified")
    return installed


def setting_identity(key: str, value: str) -> str:
    normalized_key = key.strip().lower()
    if normalized_key == "palette":
        if not value:
            return "palette:*"
        index = value.partition("=")[0].strip()
        return f"palette:{index}"
    if normalized_key == "keybind":
        if not value:
            return "keybind:*"
        trigger = value.partition("=")[0].strip().lower()
        return f"keybind:{trigger}"
    return normalized_key


def _confined(path: pathlib.Path, root: pathlib.Path) -> pathlib.Path:
    resolved_root = root.resolve()
    resolved = path.resolve()
    if not resolved.is_relative_to(resolved_root):
        raise SetupError("config_path_escape")
    return resolved


def _parse_setting(line: str) -> tuple[str, str] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return None
    key, separator, value = stripped.partition("=")
    if not separator or not key.strip():
        return None
    return key.strip().lower(), value.strip()


def analyze_config(config: pathlib.Path, root: pathlib.Path) -> ConfigAnalysis:
    identities: set[str] = set()
    files: list[pathlib.Path] = []
    seen: set[pathlib.Path] = set()

    def visit(path: pathlib.Path, *, optional: bool = False) -> None:
        resolved = _confined(path, root)
        if resolved in seen:
            return
        if not resolved.exists():
            if optional:
                return
            if path == config and not path.is_symlink():
                return
            raise SetupError("required_include_missing")
        seen.add(resolved)
        files.append(resolved)
        try:
            lines = resolved.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeError) as error:
            raise SetupError("config_read_failed") from error
        for line in lines:
            parsed = _parse_setting(line)
            if not parsed:
                continue
            key, value = parsed
            if key in {"config-file", "config-file?"}:
                include_value = value.strip("\"'")
                optional_include = key == "config-file?" or include_value.startswith(
                    "?"
                )
                include_value = include_value.removeprefix("?")
                if not include_value:
                    if optional_include:
                        continue
                    raise SetupError("required_include_missing")
                include = pathlib.Path(include_value).expanduser()
                if not include.is_absolute():
                    include = resolved.parent / include
                visit(include, optional=optional_include)
            else:
                identities.add(setting_identity(key, value))

    visit(config)
    return ConfigAnalysis(frozenset(identities), tuple(files))


def _recommendation_identity(recommendation: Recommendation) -> str:
    return setting_identity(recommendation.key, recommendation.value)


def _identity_is_explicit(identity: str, identities: frozenset[str]) -> bool:
    group = identity.partition(":")[0]
    return identity in identities or f"{group}:*" in identities


def build_candidate(
    config: pathlib.Path,
    root: pathlib.Path,
    historical_ids: set[str],
) -> Candidate:
    analysis = analyze_config(config, root)
    old = config.read_bytes() if config.exists() else b""
    offered = tuple(
        recommendation
        for recommendation in RECOMMENDATIONS
        if recommendation.recommendation_id not in historical_ids
        and not _identity_is_explicit(
            _recommendation_identity(recommendation), analysis.identities
        )
    )
    combined_history = tuple(
        sorted(historical_ids | {item.recommendation_id for item in offered})
    )
    if not offered:
        return Candidate(old, (), combined_history, False)
    lines = [BEGIN]
    lines.extend(f"{item.key} = {item.value}" for item in offered)
    lines.append(END)
    prefix = old
    if prefix and not prefix.endswith(b"\n"):
        prefix += b"\n"
    if prefix and not prefix.endswith(b"\n\n"):
        prefix += b"\n"
    content = prefix + ("\n".join(lines) + "\n").encode()
    return Candidate(
        content,
        tuple(item.recommendation_id for item in offered),
        combined_history,
        content != old,
    )


def validate_config(config: pathlib.Path, executable: str) -> None:
    result = _command(
        [executable, "+validate-config", f"--config-file={config}"],
        check=False,
    )
    if result.returncode != 0:
        raise SetupError("ghostty_config_invalid")


def _atomic_write(path: pathlib.Path, content: bytes, mode: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", dir=path.parent
    )
    temporary = pathlib.Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def replace_config(
    config: pathlib.Path,
    root: pathlib.Path,
    executable: str,
    historical_ids: set[str],
) -> Candidate:
    _confined(config, root)
    existed = config.exists()
    old = config.read_bytes() if existed else b""
    old_mode = stat.S_IMODE(config.stat().st_mode) if existed else 0o600
    if existed:
        validate_config(config, executable)
    candidate = build_candidate(config, root, historical_ids)
    if not candidate.changed:
        return candidate
    config.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, candidate_name = tempfile.mkstemp(
        prefix=".xcsh-candidate.", dir=config.parent
    )
    candidate_path = pathlib.Path(candidate_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(candidate.content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(candidate_path, old_mode)
        validate_config(candidate_path, executable)
        if existed:
            _atomic_write(config.with_name(f"{config.name}.xcsh-backup"), old, 0o600)
        os.replace(candidate_path, config)
        try:
            validate_config(config, executable)
        except Exception:
            if existed:
                _atomic_write(config, old, old_mode)
            else:
                config.unlink(missing_ok=True)
            raise
    finally:
        candidate_path.unlink(missing_ok=True)
    return candidate


def _identity_dict(identity: PackageIdentity) -> dict[str, str | None]:
    return {
        "digest": identity.digest,
        "kind": identity.kind,
        "name": identity.name,
        "revision": identity.revision,
        "source": identity.source,
        "version": identity.version,
    }


def receipt_payload(
    executable: pathlib.Path,
    version: tuple[int, int, int],
    identity: PackageIdentity,
    config: pathlib.Path,
    historical_ids: list[str] | tuple[str, ...],
    target: Platform,
) -> dict[str, Any]:
    return {
        "config": {
            "path": str(config),
            "sha256": sha256_file(config),
        },
        "executable": {
            "path": str(executable),
            "sha256": sha256_file(executable),
            "version": ".".join(map(str, version)),
        },
        "historical_recommendation_ids": sorted(set(historical_ids)),
        "package": _identity_dict(identity),
        "platform": {
            "arch": target.package_arch,
            "id": target.os_id,
            "version": target.version_id,
        },
        "plugin_version": PLUGIN_VERSION,
        "schema_version": RECEIPT_SCHEMA,
        "state": "ready",
    }


def write_receipt(path: pathlib.Path, payload: dict[str, Any]) -> None:
    encoded = (
        json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n"
    ).encode()
    if path.exists() and path.read_bytes() == encoded:
        os.chmod(path, 0o600)
        return
    _atomic_write(path, encoded, 0o600)


def _load_receipt(path: pathlib.Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, UnicodeError) as error:
        raise SetupError("receipt_invalid") from error
    if not isinstance(value, dict) or value.get("schema_version") != RECEIPT_SCHEMA:
        raise SetupError("receipt_schema_invalid")
    return value


def _receipt_history(path: pathlib.Path) -> set[str]:
    if not path.exists():
        return set()
    value = _load_receipt(path)
    history = value.get("historical_recommendation_ids")
    if not isinstance(history, list) or not all(
        isinstance(item, str) for item in history
    ):
        raise SetupError("receipt_history_invalid")
    return set(history)


def _paths() -> tuple[pathlib.Path, pathlib.Path, pathlib.Path]:
    home = pathlib.Path.home()
    config = pathlib.Path(
        os.environ.get("XCSH_GHOSTTY_CONFIG", home / ".config/ghostty/config")
    )
    config_root = config.parent
    state_home = pathlib.Path(os.environ.get("XDG_STATE_HOME", home / ".local/state"))
    receipt = state_home / "xcsh/ghostty/setup-receipt.json"
    return config, config_root, receipt


def _package_from_receipt(value: Any) -> PackageIdentity:
    if not isinstance(value, dict):
        raise SetupError("receipt_package_invalid")
    required = {"source", "kind", "name", "version", "revision", "digest"}
    if set(value) != required:
        raise SetupError("receipt_package_invalid")
    strings = [value[key] for key in ("source", "kind", "name", "version")]
    if not all(isinstance(item, str) and item for item in strings):
        raise SetupError("receipt_package_invalid")
    if value["revision"] is not None and not isinstance(value["revision"], str):
        raise SetupError("receipt_package_invalid")
    if value["digest"] is not None and not re.fullmatch(
        r"[0-9a-f]{64}", value["digest"]
    ):
        raise SetupError("receipt_package_invalid")
    return PackageIdentity(
        value["source"],
        value["kind"],
        value["name"],
        value["version"],
        value["revision"],
        value["digest"],
    )


def verify_ready(config: pathlib.Path, receipt: pathlib.Path) -> dict[str, Any]:
    value = _load_receipt(receipt)
    if value.get("state") != "ready" or value.get("plugin_version") != PLUGIN_VERSION:
        raise SetupError("receipt_version_invalid")
    target = current_platform()
    expected_platform = {
        "arch": target.package_arch,
        "id": target.os_id,
        "version": target.version_id,
    }
    if value.get("platform") != expected_platform:
        raise SetupError("platform_mismatch")
    executable_value = value.get("executable")
    config_value = value.get("config")
    if not isinstance(executable_value, dict) or not isinstance(config_value, dict):
        raise SetupError("receipt_schema_invalid")
    executable = pathlib.Path(str(executable_value.get("path", "")))
    if not executable.is_file() or sha256_file(executable) != executable_value.get(
        "sha256"
    ):
        raise SetupError("executable_hash_mismatch")
    expected_identity = _package_from_receipt(value.get("package"))
    installed = inspect_installation(expected_identity.source, expected_identity.digest)
    if installed is None or installed.identity != expected_identity:
        raise SetupError("package_identity_mismatch")
    if ".".join(map(str, installed.version)) != executable_value.get("version"):
        raise SetupError("executable_version_mismatch")
    if installed.version < MIN_VERSION:
        raise SetupError("incompatible_existing_installation")
    if str(config) != config_value.get("path") or not config.is_file():
        raise SetupError("config_path_mismatch")
    if sha256_file(config) != config_value.get("sha256"):
        raise SetupError("config_hash_mismatch")
    validate_config(config, installed.executable)
    if stat.S_IMODE(receipt.stat().st_mode) != 0o600:
        raise SetupError("receipt_mode_invalid")
    return value


def apply_setup() -> dict[str, Any]:
    target = current_platform()
    config, config_root, receipt = _paths()
    previous = _load_receipt(receipt) if receipt.exists() else None
    preserved_identity = (
        _package_from_receipt(previous.get("package")) if previous else None
    )
    installation = install_ghostty(target, preserved_identity)
    if installation.identity is None:
        raise SetupError("package_identity_unverified")
    history = _receipt_history(receipt)
    existed = config.exists()
    old = config.read_bytes() if existed else b""
    old_mode = stat.S_IMODE(config.stat().st_mode) if existed else 0o600
    candidate = replace_config(config, config_root, installation.executable, history)
    payload = receipt_payload(
        pathlib.Path(installation.executable),
        installation.version,
        installation.identity,
        config,
        candidate.historical_ids,
        target,
    )
    try:
        write_receipt(receipt, payload)
    except Exception:
        if candidate.changed:
            if existed:
                _atomic_write(config, old, old_mode)
            else:
                config.unlink(missing_ok=True)
        raise
    return verify_ready(config, receipt)


def main() -> int:
    action = sys.argv[1] if len(sys.argv) > 1 else "status"
    requested_version = sys.argv[2] if len(sys.argv) > 2 else PLUGIN_VERSION
    try:
        if requested_version != PLUGIN_VERSION:
            raise SetupError("plugin_version_mismatch")
        config, _config_root, receipt = _paths()
        if action == "apply":
            value = apply_setup()
        elif action in {"status", "verify"}:
            value = verify_ready(config, receipt)
        else:
            raise SetupError("unknown_action")
        print(json.dumps(value, sort_keys=True, separators=(",", ":")))
        return 0
    except (OSError, SetupError) as error:
        print(
            json.dumps(
                {"reason": str(error), "state": "setup_required"},
                sort_keys=True,
                separators=(",", ":"),
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
