import importlib.util
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "scanner", pathlib.Path(__file__).with_name("_credential_literals.py")
)
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)


class CredentialLiteralTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)

    def write(self, path, text):
        p = self.root / path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)

    def test_runtime_reads_and_object_values_are_not_static_credentials(self):
        self.write(
            "src/custody.ts",
            "let secret = await readOwnedCredential();\n"
            "if (secret === undefined) {}\n"
            "secret = {reference: opaqueRef};\n",
        )
        self.assertEqual(list(scanner.findings(self.root)), [])

    def test_assignment_findings_are_redacted(self):
        self.write(
            "src/auth.ts",
            "const secret = 'SYNTHETIC-STATIC-CREDENTIAL'; "
            "// example and placeholder words cannot hide it\n",
        )
        self.assertEqual(list(scanner.findings(self.root)), [("src/auth.ts", 1)])

    def test_static_json_credentials_are_detected(self):
        self.write("config.json", '{"client_secret":"SYNTHETIC-STATIC-CREDENTIAL"}')
        self.assertEqual(list(scanner.findings(self.root)), [("config.json", 1)])

    def test_environment_references_remain_runtime_only(self):
        self.write(
            "src/auth.ts",
            'const token = "${API_TOKEN}";\nconst secret = "$CLIENT_SECRET";\n',
        )
        self.assertEqual(list(scanner.findings(self.root)), [])

    def test_static_concatenation_does_not_hide_credentials(self):
        self.write(
            "src/auth.ts", "const secret = 'SYNTHETIC-STATIC-CREDENTIAL' + 'suffix';\n"
        )
        self.assertEqual(list(scanner.findings(self.root)), [("src/auth.ts", 1)])

    def test_only_exact_reviewed_rejection_markers_are_permitted_in_fixtures(self):
        self.write("test/ce/rejection.test.ts", "receipt.secret='unreviewed';\n")
        self.write(
            "test/ce/auth.test.ts", "const token='SYNTHETIC-STATIC-CREDENTIAL';\n"
        )
        self.assertEqual(
            list(scanner.findings(self.root)), [("test/ce/auth.test.ts", 1)]
        )

    def test_bearer_token_literal_is_detected_without_echoing_value(self):
        self.write("docs/auth.md", "Bearer SYNTHETIC-CREDENTIAL-FIXTURE-VALUE\n")
        self.assertEqual(list(scanner.findings(self.root)), [("docs/auth.md", 1)])


if __name__ == "__main__":
    unittest.main()
