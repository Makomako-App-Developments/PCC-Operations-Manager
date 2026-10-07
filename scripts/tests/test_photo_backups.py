"""Offline end-to-end backup/restore/retention tests with dummy file bytes."""
import base64
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "operations"))
from photo_backups import backup, load_snapshots, object_key, prune, verify
from photo_backup_source import check_file, file_hashes, validate_object
from azure_photo_store import AzurePhotoStore

SOURCE = "a" * 64
NOW = datetime.now(timezone.utc).replace(microsecond=0)


def item(name="uploads/photo.jpg", generation="1", data=b"dummy-photo"):
    return {"name": name, "generation": generation, "bytes": len(data),
            "md5": base64.b64encode(hashlib.md5(data).digest()).decode(), "contentType": "image/jpeg"}


class FakeSource:
    def __init__(self, payload=b"dummy-photo"):
        self.payload, self.reads = payload, 0

    def download(self, record, path):
        self.reads += 1
        Path(path).write_bytes(self.payload)
        check_file(path, record)


class FakeStore:
    def __init__(self):
        self.files, self.deleted = {}, []
        self.fail_snapshot = False
        self.broken_listing = False

    def upload(self, key, path):
        if key.startswith("snapshots/") and self.fail_snapshot:
            raise RuntimeError("upload failed")
        if key in self.files:
            raise RuntimeError("no overwrites allowed")
        sha, md5 = file_hashes(path)
        self.files[key] = {"data": Path(path).read_bytes(), "metadata": {"sha256": sha},
            "name": key, "properties": {"contentLength": Path(path).stat().st_size,
                "lastModified": NOW.isoformat(), "contentSettings": {"contentMd5": md5}}}

    def exists(self, key):
        return key in self.files

    def show(self, key):
        return self.files[key]

    def download(self, key, path):
        Path(path).write_bytes(self.files[key]["data"])

    def list(self, prefix, versions=False):
        if versions and self.broken_listing:
            raise RuntimeError("incomplete listing")
        return [v for k, v in self.files.items() if k.startswith(prefix)]

    def delete_group(self, name, entries):
        self.deleted.append(name)
        del self.files[name]


class PhotoBackupTests(unittest.TestCase):
    def test_first_copy_restores_original_paths_and_second_copy_is_incremental(self):
        with tempfile.TemporaryDirectory() as d:
            source, store, directory = FakeSource(), FakeStore(), Path(d)
            name, copied, size = backup(source, store, SOURCE, [item()], directory, NOW, "1", "1")
            self.assertEqual((copied, size), (1, len(source.payload)))
            self.assertEqual(verify(store, SOURCE, directory)[1], 1)
            self.assertEqual((directory / "restored/uploads/photo.jpg").read_bytes(), source.payload)
            _, copied, size = backup(source, store, SOURCE, [item()], directory, NOW + timedelta(seconds=1), "2", "1")
            self.assertEqual((copied, size, source.reads), (0, 0, 1))
            self.assertIn(name, store.files)

    def test_old_live_objects_are_retained_and_deleted_photo_expires_by_references(self):
        with tempfile.TemporaryDirectory() as d:
            source, store, directory = FakeSource(), FakeStore(), Path(d)
            old = NOW - timedelta(days=40)
            removed = item("uploads/deleted.jpg")
            backup(source, store, SOURCE, [item(), removed], directory, old, "1", "1")
            for row in store.files.values():
                row["properties"]["lastModified"] = old.isoformat()
            backup(source, store, SOURCE, [item()], directory, NOW, "2", "1")
            prune(store, SOURCE, directory, NOW)
            self.assertIn(object_key(SOURCE, item()), store.files)
            self.assertNotIn(object_key(SOURCE, removed), store.files)
            self.assertTrue(any(k.startswith("snapshots/") for k in store.deleted))

    def test_a_selected_historical_snapshot_can_restore_deleted_original_paths(self):
        with tempfile.TemporaryDirectory() as d:
            source, store, directory = FakeSource(), FakeStore(), Path(d)
            old_name, _, _ = backup(source, store, SOURCE, [item("uploads/historical.jpg")],
                directory, NOW - timedelta(days=20), "1", "1")
            backup(source, store, SOURCE, [item()], directory, NOW, "2", "1")
            self.assertEqual(verify(store, SOURCE, directory, old_name)[0], old_name)
            self.assertEqual((directory / "restored/uploads/historical.jpg").read_bytes(), source.payload)
            with self.assertRaises(ValueError):
                verify(store, SOURCE, directory, "snapshots/untrusted/file.json")

    def test_deleted_files_within_30_day_history_are_not_removed(self):
        with tempfile.TemporaryDirectory() as d:
            source, store, directory = FakeSource(), FakeStore(), Path(d)
            removed = item("uploads/deleted.jpg")
            old = NOW - timedelta(days=20)
            backup(source, store, SOURCE, [item(), removed], directory, old, "1", "1")
            for row in store.files.values():
                row["properties"]["lastModified"] = (NOW - timedelta(days=60)).isoformat()
            backup(source, store, SOURCE, [item()], directory, NOW, "2", "1")
            prune(store, SOURCE, directory, NOW)
            self.assertIn(object_key(SOURCE, removed), store.files)

    def test_corrupt_archive_or_incomplete_list_blocks_all_cleanup(self):
        for failure in ("corrupt", "listing"):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as d:
                source, store, directory = FakeSource(), FakeStore(), Path(d)
                name, _, _ = backup(source, store, SOURCE, [item()], directory, NOW, "1", "1")
                if failure == "corrupt":
                    store.files[name]["data"] = b"corrupted-private-manifest"
                else:
                    store.broken_listing = True
                with self.assertRaises((ValueError, RuntimeError)):
                    prune(store, SOURCE, directory, NOW)
                self.assertEqual(store.deleted, [])

    def test_stale_last_snapshot_and_unexpected_empty_source_preserve_copies(self):
        with tempfile.TemporaryDirectory() as d:
            source, store, directory = FakeSource(), FakeStore(), Path(d)
            backup(source, store, SOURCE, [item()], directory, NOW - timedelta(days=40), "1", "1")
            with self.assertRaises(ValueError):
                prune(store, SOURCE, directory, NOW)
            with self.assertRaises(ValueError):
                backup(source, store, SOURCE, [], directory, NOW, "2", "1")
            self.assertEqual(store.deleted, [])

    def test_corrupted_source_never_publishes_manifest_and_restore_detects_bad_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            store, directory = FakeStore(), Path(d)
            with self.assertRaises(ValueError):
                backup(FakeSource(b"wrong"), store, SOURCE, [item()], directory, NOW, "1", "1")
            self.assertFalse(any(k.startswith("snapshots/") for k in store.files))
            backup(FakeSource(), store, SOURCE, [item()], directory, NOW, "1", "1")
            store.files[object_key(SOURCE, item())]["data"] = b"corrupt"
            with self.assertRaises(ValueError):
                verify(store, SOURCE, directory)

    def test_unconfirmed_interrupted_copy_is_verified_before_reuse(self):
        with tempfile.TemporaryDirectory() as d:
            source, store, directory = FakeSource(), FakeStore(), Path(d)
            store.fail_snapshot = True
            with self.assertRaises(RuntimeError):
                backup(source, store, SOURCE, [item()], directory, NOW, "1", "1")
            self.assertEqual(store.deleted, [])
            store.fail_snapshot = False
            backup(source, store, SOURCE, [item()], directory, NOW, "2", "1")
            self.assertEqual(source.reads, 1)

    def test_restore_paths_and_azure_container_are_restricted(self):
        for name in ("uploads/../secret", "/etc/shadow", "uploads/a\n.jpg", "uploads//a.jpg"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                validate_object(item(name))
        with self.assertRaises(ValueError):
            AzurePhotoStore("fake-account", "db-backups")

    def test_missing_retained_content_and_unknown_version_flags_block_cleanup(self):
        for mode in ("missing", "version"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as d:
                source, store, directory = FakeSource(), FakeStore(), Path(d)
                backup(source, store, SOURCE, [item()], directory, NOW, "1", "1")
                key = object_key(SOURCE, item())
                if mode == "missing":
                    del store.files[key]
                else:
                    store.files[key]["versionId"] = "dummy-version"
                with self.assertRaises(ValueError):
                    prune(store, SOURCE, directory, NOW)
                self.assertEqual(store.deleted, [])

    def test_adapter_removes_previous_versions_then_base_then_remaining_version(self):
        class Adapter(AzurePhotoStore):
            def __init__(self):
                super().__init__("dummy-account", "photo-backups")
                self.calls = []
            def _az(self, operation, arguments, json_output=False):
                self.calls.append((operation, arguments))
                return None
            def list(self, prefix, versions=False):
                return [{"name": prefix, "versionId": "current", "isCurrentVersion": False}]
        adapter = Adapter()
        adapter.delete_group("objects/dummy", [
            {"versionId": "previous", "isCurrentVersion": False},
            {"versionId": "current", "isCurrentVersion": True, "properties": {"etag": "etag"}},
        ])
        self.assertEqual(len(adapter.calls), 3)
        self.assertIn("previous", adapter.calls[0][1])
        self.assertIn("--if-match", adapter.calls[1][1])
        self.assertIn("current", adapter.calls[2][1])


if __name__ == "__main__":
    unittest.main()
