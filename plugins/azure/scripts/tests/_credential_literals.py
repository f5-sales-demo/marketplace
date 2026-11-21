"""Check static credential assignments in plugin runtime, docs and configuration.

Exact non-secret rejection markers are permitted only in development fixtures.
The canonical Gitleaks gate still covers every repository file.
Only locations are printed: a finding must never echo its credential value.
"""

import re
import sys
from collections.abc import Iterator
from pathlib import Path

ASSIGNMENT = re.compile(
    r"""(?i)(?<![\w])(?:["']?(?:password|secret|token|api[_-]?key|"""
    r"""client[_-]?secret|access[_-]?token)["']?)\s*[:=]\s*(["'])([^"'\r\n]*)\1"""
)
FIXTURE_MARKERS = {
    "unreviewed",
    "opaque-ce-private-material",
    "synthetic",
    "must-not-appear",
    "__NODE_1_DATA_PRIVATE_IP__",
    "fixture-secret-value",
    "sentinel-secret",
    "synthetic-secret",
    "owned.jwt.secret",
    "synthetic-private-marker",
    "foreign",
    "claim",
}
BEARER = re.compile(r"\bBearer\s+[A-Za-z0-9._~-]{20,}")
ENVIRONMENT = re.compile(
    r"^\$(?:[A-Z][A-Z0-9_]*|\{[^{}]+\})$|^\{\{[^{}]+\}\}$|^<[A-Z][A-Z0-9_-]*>$"
)


def findings(root: Path | str) -> Iterator[tuple[str, int]]:
    """Yield only file locations containing literal credential values."""
    root = Path(root)
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix not in {".ts", ".json", ".md"}:
            continue
        relative = path.relative_to(root)
        parts = relative.parts
        if "node_modules" in parts or ".xcsh-plugin" in parts:
            continue
        fixture = parts[0] in {"test", "tests"} or parts[:2] == ("scripts", "tests")
        for number, line in enumerate(path.read_text(encoding="utf8").splitlines(), 1):
            matched = bool(BEARER.search(line))
            for match in ASSIGNMENT.finditer(line):
                value = match[2]
                if fixture and value in FIXTURE_MARKERS:
                    continue
                if (
                    value
                    and value not in {"...", "REDACTED", "***"}
                    and not ENVIRONMENT.fullmatch(value)
                ):
                    matched = True
            if matched:
                yield str(relative), number


if __name__ == "__main__":
    found = list(findings(sys.argv[1]))
    for file_name, line_number in found:
        sys.stdout.write(f"{file_name}:{line_number}: static credential assignment\n")
    raise SystemExit(bool(found))
