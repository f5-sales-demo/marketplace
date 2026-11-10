"""Verify credential scanning and redaction with non-secret fixtures."""

import importlib.util
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "scanner", pathlib.Path(__file__).with_name("_credential_literals.py")
)
if spec is None or spec.loader is None:
    MESSAGE = "Credential scanner module is unavailable"
    raise ImportError(MESSAGE)
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)


class CredentialLiteralTests(unittest.TestCase):
    """Exercise literal detection and reviewed runtime references."""

    def _check(self, files: dict[str, str], expected: list[tuple[str, int]]) -> None:
        """Compare redacted locations and always retire temporary fixture files."""
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            for name, text in files.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding="utf8")
            observed = list(scanner.findings(root))
            if observed != expected:
                self.fail(f"Expected locations {expected!r}; observed {observed!r}")

    def test_runtime_reads_and_object_values_are_not_static_credentials(self) -> None:
        """Keep dynamic reads and object assignments outside literal findings."""
        self._check(
            {
                "src/custody.ts": "let secret = await readOwnedCredential();\n"
                "if (secret === undefined) {}\nsecret = {reference: opaqueRef};\n"
            },
            [],
        )

    def test_assignment_findings_are_redacted(self) -> None:
        """Report a literal location even beside example or placeholder prose."""
        self._check(
            {
                "src/auth.ts": "const secret = 'SYNTHETIC-STATIC-CREDENTIAL'; "
                "// example and placeholder words cannot hide it\n"
            },
            [("src/auth.ts", 1)],
        )

    def test_static_json_credentials_are_detected(self) -> None:
        """Detect quoted JSON credential assignments."""
        self._check(
            {"config.json": '{"client_secret":"SYNTHETIC-STATIC-CREDENTIAL"}'},
            [("config.json", 1)],
        )

    def test_environment_references_remain_runtime_only(self) -> None:
        """Permit complete environment references without credential values."""
        self._check(
            {
                "src/auth.ts": 'const token = "${API_TOKEN}";\nconst secret = "$CLIENT_SECRET";\n'
            },
            [],
        )

    def test_static_concatenation_does_not_hide_credentials(self) -> None:
        """Detect literal values that form one side of a concatenation."""
        self._check(
            {
                "src/auth.ts": "const secret = 'SYNTHETIC-STATIC-CREDENTIAL' + 'suffix';\n"
            },
            [("src/auth.ts", 1)],
        )

    def test_only_exact_reviewed_rejection_markers_are_permitted_in_fixtures(
        self,
    ) -> None:
        """Reject unreviewed literals while permitting exact synthetic markers."""
        self._check(
            {
                "test/ce/rejection.test.ts": "receipt.secret='unreviewed';\n",
                "test/ce/auth.test.ts": "const token='SYNTHETIC-STATIC-CREDENTIAL';\n",
            },
            [("test/ce/auth.test.ts", 1)],
        )

    def test_bearer_token_literal_is_detected_without_echoing_value(self) -> None:
        """Report a bearer token location without returning its value."""
        self._check(
            {"docs/auth.md": "Bearer SYNTHETIC-CREDENTIAL-FIXTURE-VALUE\n"},
            [("docs/auth.md", 1)],
        )


if __name__ == "__main__":
    unittest.main()
