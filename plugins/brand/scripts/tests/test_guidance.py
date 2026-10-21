"""Acceptance regressions for conflicting shipped review instructions."""

# This standalone runner uses unittest assertions without package imports.
# ruff: noqa: INP001, PT009

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class GuidanceConsistency(unittest.TestCase):
    """Keep format-specific examples consistent with the governing rules."""

    def test_visual_background_examples_respect_guardian(self) -> None:
        """Reject decorative red fills while preserving logo variants."""
        for relative in (
            "skills/visual-content/SKILL.md",
            "skills/visual-content/references/presentation-format.md",
        ):
            with self.subTest(file=relative):
                text = (ROOT / relative).read_text()
                backgrounds = [
                    line
                    for line in text.splitlines()
                    if "background" in line.lower() and "variant on" not in line
                ]
                self.assertTrue(backgrounds)
                for line in backgrounds:
                    self.assertNotRegex(line, r"(?i)F5 Red|\bRed\b|#e4002b")

    def test_reviewer_distinguishes_mermaid_from_package_availability(self) -> None:
        """Require format and target evidence before icon findings."""
        text = (ROOT / "skills/reviewer/SKILL.md").read_text()
        section = text.split("## Check 4: Icon compliance", 1)[1].split(
            "## Check 5:", 1
        )[0]
        mermaid = re.search(
            r"\*\*Default Mermaid registrations\*\*:(.*?)(?:\n\n)", section, re.DOTALL
        )
        self.assertIsNotNone(
            mermaid, "reviewer must identify the default Mermaid registrations"
        )
        if mermaid is None:
            return
        self.assertEqual(
            set(re.findall(r"`([^`]+)`", mermaid.group(1))),
            {
                "f5-brand",
                "f5xc",
                "hashicorp-flight",
                "carbon",
                "lucide",
                "mdi",
                "phosphor",
                "tabler",
                "azure",
            },
        )
        for pack in ("aws", "gcp", "simple-icons"):
            self.assertIn(f"`{pack}`", section)
        self.assertIn("Astro", section)
        self.assertIn("target", section)
        self.assertIn("unassessed", section)

    def test_report_example_matches_screenshot_severity(self) -> None:
        """Report a missing variant at the severity declared by its rule."""
        text = (ROOT / "skills/reviewer/SKILL.md").read_text()
        self.assertIn("Screenshot with only one variant → SUGGESTION", text)
        example = text.split("```markdown", 1)[1].split("```", 1)[0]
        severity = None
        found = False
        for line in example.splitlines():
            if line.startswith("### "):
                severity = line.split()[1]
            if "Screenshot missing dark variant" in line:
                found = True
                self.assertEqual(severity, "SUGGESTIONS")
        self.assertTrue(found, "keep the corrective screenshot example")


if __name__ == "__main__":
    unittest.main()
