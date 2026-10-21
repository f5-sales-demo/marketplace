"""Exercise the exact shipped local status collector in harmless directories."""
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

PLUGIN = Path(__file__).resolve().parents[2]


class BrandStatusTests(unittest.TestCase):
    def collect(self, root, shell="bash"):
        command = (PLUGIN / "commands/brand-status.md").read_text()
        match = re.search(r"## Safe Local Reference Collector\n.*?```bash\n(.*?)\n```", command, re.S)
        self.assertIsNotNone(match, "shipped status must have an executable safe collector")
        result = subprocess.run([shell, "-c", match[1]], cwd=root, capture_output=True, text=True, check=True)
        return json.loads(result.stdout)

    def fixture(self, root):
        shutil.copytree(PLUGIN / "skills", root / "skills")
        shutil.copytree(PLUGIN / "commands", root / "commands")

    def test_bash_and_zsh_complete_shipped_references(self):
        for shell in ("bash", "zsh"):
            if shutil.which(shell) is None:
                self.skipTest(f"{shell} unavailable")
            with tempfile.TemporaryDirectory(prefix="brand scope '") as directory:
                root = Path(directory)
                self.fixture(root)
                before = {str(p.relative_to(root)): p.read_bytes() for p in root.rglob("*") if p.is_file()}
                value = self.collect(root, shell)
                self.assertTrue(value["complete"])
                self.assertEqual(value["paletteColorCount"], 45)
                self.assertEqual(value["fontFamilies"], ["Neusa Next Pro Wide", "Proxima Nova"])
                self.assertFalse(value["reviewExecuted"])
                self.assertEqual(value["warnings"], [])
                self.assertEqual(value["scope"], str(root.resolve()))
                self.assertEqual(before, {str(p.relative_to(root)): p.read_bytes() for p in root.rglob("*") if p.is_file()})

    def test_missing_references_are_incomplete_and_unknown(self):
        with tempfile.TemporaryDirectory() as directory:
            value = self.collect(Path(directory))
            self.assertFalse(value["complete"])
            self.assertIsNone(value["paletteColorCount"])
            self.assertIsNone(value["fontFamilies"])
            self.assertFalse(value["reviewExecuted"])
            self.assertEqual(len(value["warnings"]), 5)
            self.assertEqual(value["readableReferenceCount"], 0)

    def test_empty_malformed_and_invalid_utf8_references(self):
        for contents in (b"", b"unrecognized content", b"\xff"):
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                self.fixture(root)
                (root / "skills/guardian/references/color-palette.md").write_bytes(contents)
                value = self.collect(root)
                self.assertFalse(value["complete"])
                self.assertIsNone(value["paletteColorCount"])
                self.assertTrue(value["warnings"])

    def test_partial_typography_and_nonfile_reference(self):
        for relative, as_directory in (("skills/guardian/references/typography-rules.md", False),
                                       ("skills/guardian/references/logo-usage.md", True)):
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                self.fixture(root)
                target = root / relative
                target.unlink()
                if as_directory:
                    target.mkdir()
                else:
                    target.write_text("## Font families\n\n### Proxima Nova\n")
                value = self.collect(root)
                self.assertFalse(value["complete"])
                self.assertTrue(value["warnings"])
                if not as_directory:
                    self.assertIsNone(value["fontFamilies"])

    def test_symlinked_parent_is_not_followed(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as other:
            root = Path(directory)
            (root / "skills").symlink_to(Path(other))
            value = self.collect(root)
            self.assertFalse(value["complete"])
            self.assertTrue(any("symlink" in warning for warning in value["warnings"]))

    def test_review_command_resolves_actual_shipped_skill(self):
        command = (PLUGIN / "commands/review-brand.md").read_text()
        uris = re.findall(r"skill://brand:([a-z-]+)", command)
        self.assertEqual(uris, ["reviewer"])
        for name in uris:
            self.assertTrue((PLUGIN / "skills" / name / "SKILL.md").is_file())


if __name__ == "__main__":
    unittest.main()
