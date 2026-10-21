"""Execute shipped status guidance against harmless workspace fixtures."""
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

PLUGIN = Path(__file__).resolve().parents[2]
REQUIRED = ["DEMO_READINESS_MATRIX.md", "DEMO_PRODUCT_EXPERTISE.md", "docs/demo/index.mdx"]


class StatusTests(unittest.TestCase):
    def command(self):
        source = (PLUGIN / "commands/sales-engineer-status.md").read_text()
        match = re.search(r"## Safe Local Status Collector\n.*?```bash\n(.*?)\n```", source, re.S)
        self.assertIsNotNone(match, "status must ship a safe executable collector")
        return match[1]

    def collect(self, root, shell="bash"):
        result = subprocess.run([shell, "-c", self.command()], cwd=root, capture_output=True, text=True, check=True)
        return json.loads(result.stdout)

    def populate(self, root):
        for name in REQUIRED:
            p = root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("synthetic fixture\n")

    def test_shell_scope_and_no_false_readiness(self):
        for shell in ("bash", "zsh"):
            if not shutil.which(shell):
                self.skipTest(f"{shell} unavailable")
            with tempfile.TemporaryDirectory(prefix="demo scope '") as directory:
                root = Path(directory)
                self.populate(root)
                before = {str(p.relative_to(root)): p.read_bytes() for p in root.rglob("*") if p.is_file()}
                value = self.collect(root, shell)
                self.assertEqual(value["scope"], str(root.resolve()))
                self.assertTrue(value["complete"])
                self.assertEqual(value["availableRequiredFileCount"], 3)
                self.assertIsNone(value["demoReady"])
                self.assertFalse(value["prepareExecuted"])
                self.assertFalse(value["teardownExecuted"])
                self.assertEqual(value["operationalChecksExecuted"], 0)
                self.assertEqual(before, {str(p.relative_to(root)): p.read_bytes() for p in root.rglob("*") if p.is_file()})

    def test_missing_empty_nonfile_and_indirect_paths(self):
        for kind in ("missing", "empty", "directory", "symlink-parent"):
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                self.populate(root)
                p = root / REQUIRED[2]
                p.unlink()
                if kind == "empty":
                    p.write_text("")
                elif kind == "directory":
                    p.mkdir()
                elif kind == "symlink-parent":
                    (root / "docs").rename(root / "indirect")
                    (root / "docs").symlink_to(root / "indirect", target_is_directory=True)
                value = self.collect(root)
                self.assertFalse(value["complete"])
                self.assertEqual(value["availableRequiredFileCount"], 2)
                self.assertIsNone(value["demoReady"])
                self.assertTrue(value["warnings"])
        with tempfile.TemporaryDirectory() as directory:
            value = self.collect(Path(directory))
            self.assertEqual(value["availableRequiredFileCount"], 0)
            self.assertFalse(value["complete"])

    def test_collector_never_opens_workspace_contents(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.populate(root)
            (root / ".env").write_text("SYNTHETIC_PRIVATE_VALUE\n")
            command = self.command()
            body = re.search(r"python3 - <<'PY'\n(.*?)\nPY", command, re.S)[1]
            audit = "import sys,json,pathlib,stat\ndef guard(event,args):\n if event == 'open': raise RuntimeError('workspace content read forbidden')\nsys.addaudithook(guard)\n"
            result = subprocess.run([sys.executable, "-c", audit + body], cwd=root, capture_output=True, text=True, check=True)
            value = json.loads(result.stdout)
            self.assertNotIn("SYNTHETIC_PRIVATE_VALUE", result.stdout)
            self.assertTrue(value["complete"])


if __name__ == "__main__":
    unittest.main()
