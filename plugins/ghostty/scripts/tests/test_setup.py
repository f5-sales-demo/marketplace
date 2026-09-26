# ruff: noqa: ANN001, ANN201, D101, D102, PT009, PT027, S108
from __future__ import annotations

import importlib.util
import json
import pathlib
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "ghostty-setup.py"
SPEC = importlib.util.spec_from_file_location("ghostty_setup", SCRIPT)
assert SPEC and SPEC.loader
setup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(setup)


class PlatformAndInstallTests(unittest.TestCase):
    def test_ubuntu_2404_architectures_map_to_published_names(self):
        os_release = 'ID=ubuntu\nVERSION_ID="24.04"\n'
        self.assertEqual(setup.parse_platform(os_release, "x86_64").package_arch, "amd64")
        self.assertEqual(setup.parse_platform(os_release, "aarch64").package_arch, "arm64")

    def test_other_platforms_are_refused(self):
        with self.assertRaisesRegex(setup.SetupError, "unsupported_platform"):
            setup.parse_platform("ID=ubuntu\nVERSION_ID=22.04\n", "x86_64")

    def test_install_precedence_and_incompatible_refusal(self):
        current = setup.Installation(version=(1, 3, 1), executable="/usr/bin/ghostty")
        self.assertEqual(setup.choose_install_source(current, "1.4.0", True), "existing")
        self.assertEqual(setup.choose_install_source(None, "1.4.0", True), "apt")
        self.assertEqual(setup.choose_install_source(None, None, True), "github_deb")
        self.assertEqual(setup.choose_install_source(None, None, False), "snap")
        with self.assertRaisesRegex(setup.SetupError, "incompatible_existing_installation"):
            setup.choose_install_source(
                setup.Installation(version=(1, 2, 9), executable="/usr/bin/ghostty"),
                "1.4.0",
                True,
            )

    def test_release_asset_is_exact_for_platform_and_has_published_digest(self):
        release = {
            "tag_name": "1.3.1-0-ppa2",
            "assets": [
                {
                    "name": "ghostty_1.3.1-0.ppa2_amd64_24.04.deb",
                    "browser_download_url": "https://example.test/amd64.deb",
                    "digest": "sha256:" + "a" * 64,
                },
                {
                    "name": "ghostty_1.3.1-0.ppa2_arm64_24.04.deb",
                    "browser_download_url": "https://example.test/arm64.deb",
                    "digest": "sha256:" + "b" * 64,
                },
            ],
        }
        platform = setup.parse_platform("ID=ubuntu\nVERSION_ID=24.04\n", "aarch64")
        asset = setup.select_release_asset(release, platform)
        self.assertEqual(asset.name, "ghostty_1.3.1-0.ppa2_arm64_24.04.deb")
        self.assertEqual(asset.sha256, "b" * 64)

    def test_missing_or_malformed_published_digest_is_refused(self):
        platform = setup.parse_platform("ID=ubuntu\nVERSION_ID=24.04\n", "x86_64")
        release = {
            "assets": [
                {
                    "name": "ghostty_1.3.1-0.ppa2_amd64_24.04.deb",
                    "browser_download_url": "https://example.test/pkg.deb",
                    "digest": None,
                }
            ]
        }
        with self.assertRaisesRegex(setup.SetupError, "published_digest_missing"):
            setup.select_release_asset(release, platform)

    def test_download_digest_mismatch_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            package = pathlib.Path(directory) / "ghostty.deb"
            package.write_bytes(b"not the published bytes")
            with self.assertRaisesRegex(setup.SetupError, "package_digest_mismatch"):
                setup.verify_sha256(package, "0" * 64)


class ConfigurationTests(unittest.TestCase):
    def test_recursive_optional_and_cyclic_includes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / "config").write_text(
                "config-file = child.conf\nconfig-file? = absent.conf\n",
                encoding="utf-8",
            )
            (root / "child.conf").write_text(
                "config-file = config\nfont-size = 12\n",
                encoding="utf-8",
            )
            analysis = setup.analyze_config(root / "config", root)
            self.assertIn("font-size", analysis.identities)
            self.assertEqual(set(analysis.files), {root / "config", root / "child.conf"})

    def test_required_missing_include_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            config = root / "config"
            config.write_text("config-file = missing.conf\n", encoding="utf-8")
            with self.assertRaisesRegex(setup.SetupError, "required_include_missing"):
                setup.analyze_config(config, root)

    def test_explicit_blank_reset_wins(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            config = root / "config"
            config.write_text("font-size =\n", encoding="utf-8")
            analysis = setup.analyze_config(config, root)
            self.assertIn("font-size", analysis.identities)

    def test_palette_and_keybind_entries_have_independent_identity(self):
        self.assertEqual(setup.setting_identity("palette", "1=#abcdef"), "palette:1")
        self.assertEqual(setup.setting_identity("palette", "2=#abcdef"), "palette:2")
        self.assertEqual(
            setup.setting_identity("keybind", "shift+insert=paste_from_clipboard"),
            "keybind:shift+insert",
        )
        self.assertEqual(
            setup.setting_identity("keybind", "ctrl+insert=copy_to_clipboard"),
            "keybind:ctrl+insert",
        )

    def test_include_symlink_escape_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "ghostty"
            root.mkdir()
            outside = pathlib.Path(directory) / "outside.conf"
            outside.write_text("font-size = 12\n", encoding="utf-8")
            (root / "escaped.conf").symlink_to(outside)
            (root / "config").write_text("config-file = escaped.conf\n", encoding="utf-8")
            with self.assertRaisesRegex(setup.SetupError, "config_path_escape"):
                setup.analyze_config(root / "config", root)

    def test_primary_config_symlink_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "ghostty"
            root.mkdir()
            outside = pathlib.Path(directory) / "outside.conf"
            outside.write_text("", encoding="utf-8")
            (root / "config").symlink_to(outside)
            with self.assertRaisesRegex(setup.SetupError, "config_path_escape"):
                setup.analyze_config(root / "config", root)

    def test_existing_values_and_xorgctl_content_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            config = root / "config"
            original = b"font-size = 12\n# XORGCTL user configuration\n"
            config.write_bytes(original)
            result = setup.build_candidate(config, root, set())
            self.assertTrue(result.changed)
            self.assertTrue(result.content.startswith(original))
            self.assertNotIn("font-size = 9", result.content.decode())
            self.assertIn("XORGCTL", result.content.decode())

    def test_user_deletion_is_not_restored_and_rerun_is_byte_stable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            config = root / "config"
            config.write_text("", encoding="utf-8")
            first = setup.build_candidate(config, root, set())
            config.write_bytes(first.content)
            deleted_id = "clipboard.copy-on-select"
            deleted = b"\n".join(
                line
                for line in config.read_bytes().splitlines()
                if line != b"copy-on-select = true"
            ) + b"\n"
            config.write_bytes(deleted)
            second = setup.build_candidate(config, root, set(first.offered_ids))
            self.assertFalse(second.changed)
            self.assertIn(deleted_id, first.offered_ids)
            self.assertNotIn(b"copy-on-select = true", second.content)
            self.assertEqual(second.content, deleted)

    def test_atomic_replace_preserves_mode_and_rolls_back(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            config = root / "config"
            config.write_text("font-size = 12\n", encoding="utf-8")
            config.chmod(0o640)
            before = config.read_bytes()
            with patch.object(
                setup,
                "validate_config",
                side_effect=[None, None, setup.SetupError("post_replace_invalid")],
            ):
                with self.assertRaisesRegex(setup.SetupError, "post_replace_invalid"):
                    setup.replace_config(config, root, "/usr/bin/ghostty", set())
            self.assertEqual(config.read_bytes(), before)
            self.assertEqual(stat.S_IMODE(config.stat().st_mode), 0o640)
            backup = config.with_name("config.xcsh-backup")
            self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o600)


class ReceiptTests(unittest.TestCase):
    def test_receipt_is_redacted_owner_only_and_stable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            receipt = root / "state" / "setup-receipt.json"
            config = root / "config"
            executable = root / "ghostty"
            config.write_text("font-size = 12\n", encoding="utf-8")
            executable.write_bytes(b"published executable")
            identity = setup.PackageIdentity(
                source="github_deb",
                kind="dpkg",
                name="ghostty",
                version="1.3.1-0.ppa2",
                revision=None,
                digest="a" * 64,
            )
            payload = setup.receipt_payload(
                executable,
                (1, 3, 1),
                identity,
                config,
                ["font.primary", "palette.0"],
                setup.parse_platform("ID=ubuntu\nVERSION_ID=24.04\n", "x86_64"),
            )
            setup.write_receipt(receipt, payload)
            first = receipt.read_bytes()
            setup.write_receipt(receipt, payload)
            self.assertEqual(receipt.read_bytes(), first)
            self.assertEqual(stat.S_IMODE(receipt.stat().st_mode), 0o600)
            serialized = first.decode()
            self.assertNotIn("JetBrainsMono", serialized)
            self.assertNotIn("environment", serialized.lower())
            self.assertNotRegex(serialized.lower(), r"token|secret")

    def test_readiness_revalidates_live_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            receipt = root / "receipt.json"
            config = root / "config"
            executable = root / "ghostty"
            config.write_text("font-size = 12\n", encoding="utf-8")
            executable.write_bytes(b"binary")
            platform = setup.parse_platform("ID=ubuntu\nVERSION_ID=24.04\n", "x86_64")
            identity = setup.PackageIdentity("existing", "local", "ghostty", "1.3.1", None, None)
            payload = setup.receipt_payload(executable, (1, 3, 1), identity, config, [], platform)
            setup.write_receipt(receipt, payload)
            installation = setup.Installation((1, 3, 1), str(executable), identity)
            with (
                patch.object(setup, "current_platform", return_value=platform),
                patch.object(setup, "inspect_installation", return_value=installation),
                patch.object(setup, "validate_config"),
            ):
                self.assertEqual(setup.verify_ready(config, receipt)["state"], "ready")
                executable.write_bytes(b"changed")
                with self.assertRaisesRegex(setup.SetupError, "executable_hash_mismatch"):
                    setup.verify_ready(config, receipt)


class HarnessTests(unittest.TestCase):
    def test_real_pty_transcript_is_sanitized_and_gated(self):
        harness = SCRIPT.with_name("ghostty-uat.py")
        with tempfile.TemporaryDirectory() as directory:
            evidence = pathlib.Path(directory) / "evidence"
            scenario = pathlib.Path(directory) / "scenario.json"
            scenario.write_text(
                json.dumps(
                    {
                        "argv": [
                            "/bin/sh",
                            "-c",
                            "printf 'ready token=unsafe\\n'; read answer; printf 'done:%s\\n' \"$answer\"",
                        ],
                        "steps": [{"wait_for": "ready", "send": "yes\\n"}],
                        "required": ["ready", "done:yes"],
                    }
                ),
                encoding="utf-8",
            )
            result = subprocess.run(
                [
                    "python3",
                    str(harness),
                    "run",
                    "--scenario",
                    str(scenario),
                    "--evidence-dir",
                    str(evidence),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["status"], "PASS")
            transcript = (evidence / "transcript.txt").read_text(encoding="utf-8")
            self.assertIn("token=[REDACTED]", transcript)
            self.assertNotIn("token=unsafe", transcript)
            self.assertEqual(stat.S_IMODE(evidence.stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE((evidence / "result.json").stat().st_mode), 0o600)


if __name__ == "__main__":
    unittest.main()
