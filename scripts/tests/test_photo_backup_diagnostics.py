"""Diagnostics expose only fixed stages, allowlisted codes and numeric aggregates."""
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
import unittest
import urllib.error
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "operations"))
from azure_photo_store import AzurePhotoStore
from photo_backup_diagnostics import AzureStorageFailure, category, failure_line, set_phase


class DiagnosticsTests(unittest.TestCase):
    def test_private_error_text_is_never_emitted(self):
        private = "uploads/private.jpg bearer-secret https://private.example/signed?token=secret"
        errors = [
            RuntimeError(private), ValueError(private), OSError(private),
            urllib.error.URLError(private),
            urllib.error.HTTPError(private, 503, private, {}, None),
            subprocess.TimeoutExpired(["az", private], 240, output=private, stderr=private),
            json.JSONDecodeError(private, private, 0),
        ]
        set_phase("source-download")
        for error in errors:
            with self.subTest(kind=type(error).__name__):
                line = failure_line(error)
                self.assertIn("Stage: source-download", line)
                self.assertIn("raw errors withheld", line)
                for sensitive in ("uploads/", "bearer-secret", "https://", "token=secret"):
                    self.assertNotIn(sensitive, line)
        self.assertEqual(category(errors[4]), "http-503")
        self.assertEqual(category(errors[5]), "timeout")

    def test_untrusted_phase_and_azure_attributes_are_not_emitted(self):
        set_phase("uploads/private.jpg")
        self.assertIn("Stage: startup", failure_line(RuntimeError("secret")))
        self.assertEqual(category(AzureStorageFailure("secret", "secret")), "azure-unknown-unknown")

    def test_azure_provider_code_is_allowlisted_without_raw_stderr(self):
        result = SimpleNamespace(returncode=1, stdout="", stderr=(
            "ERROR: uploads/private.jpg token=secret\nErrorCode: AuthorizationPermissionMismatch"))
        with patch("azure_photo_store.subprocess.run", return_value=result):
            with self.assertRaises(AzureStorageFailure) as caught:
                AzurePhotoStore("dummy", "photo-backups").list("objects/dummy/")
        self.assertEqual(category(caught.exception), "azure-list-AuthorizationPermissionMismatch")
        self.assertNotIn("private", failure_line(caught.exception))
        self.assertNotIn("secret", failure_line(caught.exception))

    def test_unknown_azure_error_stays_generic(self):
        result = SimpleNamespace(returncode=1, stdout="", stderr="uploads/private.jpg secret-provider-code")
        with patch("azure_photo_store.subprocess.run", return_value=result):
            with self.assertRaises(AzureStorageFailure) as caught:
                AzurePhotoStore("dummy", "photo-backups").download("private", Path("/dummy"))
        self.assertEqual(category(caught.exception), "azure-download-unknown")

    def test_known_safety_limit_has_specific_safe_category(self):
        self.assertEqual(category(ValueError("New photo transfer exceeds the 10 GiB run safety limit")),
                         "transfer-limit")


if __name__ == "__main__":
    unittest.main()
