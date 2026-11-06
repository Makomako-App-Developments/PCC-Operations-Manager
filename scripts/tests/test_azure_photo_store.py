"""Version cleanup uses stable OAuth REST and resolves omitted provider flags."""
import copy
import io
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
import urllib.error
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "operations"))
from azure_photo_store import AzurePhotoStore
from photo_backup_diagnostics import AzureStorageFailure, category


class AzurePhotoStoreTests(unittest.TestCase):
    def test_version_delete_uses_storage_oauth_rest_and_encoded_version(self):
        result = SimpleNamespace(returncode=0, stdout="fixture-token", stderr="")
        store = AzurePhotoStore("dummyaccount", "photo-backups")
        with patch("azure_photo_store.subprocess.run", return_value=result) as run, \
             patch.object(store.opener, "open") as opening:
            opening.return_value.__enter__.return_value = SimpleNamespace(status=202)
            store._delete_version(
                "snapshots/source/private file.json", "2026-10-08T01:02:03.1234567Z")
        args = run.call_args.args[0]
        self.assertEqual(args[:3], ["az", "account", "get-access-token"])
        self.assertNotIn("--version-id", args)
        self.assertEqual(args[args.index("--resource") + 1], "https://storage.azure.com/")
        self.assertNotIn("fixture-token", args)
        request = opening.call_args.args[0]
        self.assertEqual(request.get_method(), "DELETE")
        headers = {key.lower(): value for key, value in request.header_items()}
        self.assertEqual(headers["authorization"], "Bearer fixture-token")
        self.assertEqual(headers["x-ms-version"], "2023-11-03")
        self.assertIn("x-ms-date", headers)
        url = urlparse(request.full_url)
        self.assertEqual(url.netloc, "dummyaccount.blob.core.windows.net")
        self.assertEqual(url.path, "/photo-backups/snapshots/source/private%20file.json")
        self.assertEqual(parse_qs(url.query), {"versionid": ["2026-10-08T01:02:03.1234567Z"]})
        self.assertEqual(run.call_args.kwargs["timeout"], 60)
        self.assertEqual(opening.call_args.kwargs["timeout"], 90)

    def test_version_http_failures_expose_only_allowlisted_code_or_status(self):
        for body, expected in (
            (b"<Error><Code>AuthorizationPermissionMismatch</Code><Message>private-path</Message></Error>",
             "AuthorizationPermissionMismatch"),
            (b"<Error><Code>private-secret</Code></Error>", "Http403"),
            (b"private-path invalid XML", "Http403"),
        ):
            with self.subTest(expected=expected):
                store = AzurePhotoStore("dummyaccount", "photo-backups")
                error = urllib.error.HTTPError("https://private-path", 403, "secret", {}, io.BytesIO(body))
                with patch("azure_photo_store.subprocess.run", return_value=SimpleNamespace(
                    returncode=0, stdout="fixture-token", stderr="")), \
                     patch.object(store.opener, "open", side_effect=error):
                    with self.assertRaises(AzureStorageFailure) as caught:
                        store._delete_version("private", "version")
                self.assertEqual(category(caught.exception), "azure-delete-version-" + expected)
                self.assertNotIn("private", str(caught.exception))
                self.assertNotIn("secret", str(caught.exception))

    def test_token_failure_blocks_http_request_and_does_not_emit_token_or_stderr(self):
        store = AzurePhotoStore("dummy", "photo-backups")
        with patch("azure_photo_store.subprocess.run", return_value=SimpleNamespace(
            returncode=1, stdout="fixture-token", stderr="private-secret")), \
             patch.object(store.opener, "open", side_effect=AssertionError("HTTP invoked")):
            with self.assertRaises(AzureStorageFailure) as caught:
                store._delete_version("private", "version")
        self.assertEqual(category(caught.exception), "azure-delete-version-AuthenticationFailed")

    def test_read_only_and_invalid_account_cannot_send_version_deletes(self):
        with patch("azure_photo_store.subprocess.run", side_effect=AssertionError("Azure invoked")):
            for store in (
                AzurePhotoStore("dummy", "photo-backups", read_only=True),
                AzurePhotoStore("bad/account", "photo-backups"),
            ):
                with self.assertRaises(ValueError):
                    store._delete_version("private", "version")

    def test_omitted_historical_flag_is_resolved_against_live_base_version(self):
        rows = [
            {"name": "private", "versionId": "old", "isCurrentVersion": None},
            {"name": "private", "versionId": "current", "isCurrentVersion": True},
        ]
        store = AzurePhotoStore("dummy", "photo-backups")
        with patch.object(store, "_az", return_value=copy.deepcopy(rows)), \
             patch.object(store, "show", return_value={"versionId": "current"}) as show:
            result = store.list("private", versions=True)
        self.assertIs(result[0]["isCurrentVersion"], False)
        self.assertIs(result[1]["isCurrentVersion"], True)
        show.assert_called_once_with("private")

    def test_missing_flag_on_current_version_is_not_assumed_historical(self):
        store = AzurePhotoStore("dummy", "photo-backups")
        with patch.object(store, "_az", return_value=[
            {"name": "private", "versionId": "current"}
        ]), patch.object(store, "show", return_value={"versionId": "current"}):
            rows = store.list("private", versions=True)
        self.assertIs(rows[0]["isCurrentVersion"], True)

    def test_base_deleted_history_is_identified_by_blob_not_found_only(self):
        store = AzurePhotoStore("dummy", "photo-backups")
        for error in (
            AzureStorageFailure("show", "BlobNotFound"),
            AzureStorageFailure("show", "AuthorizationFailure"),
        ):
            with self.subTest(code=error.code), \
                 patch.object(store, "_az", return_value=[{"name": "private", "versionId": "old"}]), \
                 patch.object(store, "show", side_effect=error):
                if error.code == "BlobNotFound":
                    self.assertIs(store.list("private", versions=True)[0]["isCurrentVersion"], False)
                else:
                    with self.assertRaises(AzureStorageFailure):
                        store.list("private", versions=True)

    def test_changed_base_or_unusable_base_response_blocks_resolution(self):
        store = AzurePhotoStore("dummy", "photo-backups")
        for response in ({"versionId": "not-listed"}, {}, {"versionId": None}):
            with self.subTest(response=response), \
                 patch.object(store, "_az", return_value=[{"name": "private", "versionId": "old"}]), \
                 patch.object(store, "show", return_value=response):
                with self.assertRaisesRegex(ValueError, "Blob changed"):
                    store.list("private", versions=True)

    def test_explicit_invalid_flags_are_not_coerced_to_boolean(self):
        store = AzurePhotoStore("dummy", "photo-backups")
        for value in ("false", 0, 1):
            with self.subTest(value=value), patch.object(store, "_az", return_value=[
                {"name": "private", "versionId": "old", "isCurrentVersion": value}
            ]), patch.object(store, "show", side_effect=AssertionError("unexpected show")):
                row = store.list("private", versions=True)[0]
                self.assertIs(row["isCurrentVersion"], value)

    def test_unsupported_cli_argument_gets_fixed_private_safe_category(self):
        result = SimpleNamespace(returncode=2, stdout="", stderr=(
            "unrecognized arguments: --version-id private-secret\nuploads/private.jpg"))
        with patch("azure_photo_store.subprocess.run", return_value=result):
            with self.assertRaises(AzureStorageFailure) as caught:
                AzurePhotoStore("dummy", "photo-backups")._az("delete", [])
        self.assertEqual(category(caught.exception), "azure-delete-CliArgumentError")
        self.assertNotIn("private", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
