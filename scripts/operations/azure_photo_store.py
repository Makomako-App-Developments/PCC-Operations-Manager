"""Azure CLI adapter: private OAuth operations, bounded listings, no raw error logs."""
import json
from pathlib import Path
import re
import subprocess
from photo_backup_source import file_hashes
from photo_backup_diagnostics import AzureStorageFailure


class AzurePhotoStore:
    def __init__(self, account, container):
        if container != "photo-backups":
            raise ValueError("Use the dedicated private photo-backups container")
        self.args = ["--account-name", account, "--container-name", container,
                     "--auth-mode", "login", "--only-show-errors"]

    def _az(self, operation, arguments, json_output=False):
        result = subprocess.run(["az", "storage", "blob", operation, *self.args, *arguments,
            "--output", "json" if json_output else "none"],
            capture_output=True, text=True, timeout=240)
        if result.returncode:
            code = next((code for code in sorted(AzureStorageFailure.CODES - {"unknown"})
                         if re.search(r"\b" + re.escape(code) + r"\b", result.stderr)), "unknown")
            raise AzureStorageFailure(operation, code)
        return json.loads(result.stdout) if json_output else None

    def list(self, prefix, versions=False):
        args = ["--prefix", prefix, "--num-results", "5000"]
        if versions:
            args += ["--include", "mvs"]
        else:
            args += ["--include", "m"]
        result = self._az("list", args, True)
        # A truncated listing must NEVER be treated as the full reference set.
        if not isinstance(result, list) or len(result) >= 5000:
            raise ValueError("Azure listing exceeds safety limit; no cleanup permitted")
        return result

    def exists(self, key):
        result = self._az("exists", ["--name", key], True)
        if type(result.get("exists")) is not bool:
            raise ValueError("Invalid Azure existence response")
        return result["exists"]

    def show(self, key):
        return self._az("show", ["--name", key], True)

    def download(self, key, path):
        self._az("download", ["--name", key, "--file", str(path), "--overwrite", "false"])

    def upload(self, key, path):
        sha, md5 = file_hashes(path)
        self._az("upload", ["--name", key, "--file", str(path), "--overwrite", "false",
            "--content-md5", md5, "--metadata", "sha256=" + sha])

    def delete_group(self, name, entries):
        # Versioning can leave old bytes behind after a base-blob deletion.
        for entry in entries:
            if entry.get("versionId") and entry.get("isCurrentVersion") is False:
                self._az("delete", ["--name", name, "--version-id", entry["versionId"]])
        current = next((e for e in entries if not e.get("snapshot") and
            (not e.get("versionId") or e.get("isCurrentVersion") is True)), None)
        if current:
            arguments = ["--name", name, "--delete-snapshots", "include"]
            etag = current.get("properties", {}).get("etag")
            if etag:
                arguments += ["--if-match", etag]
            self._az("delete", arguments)
            # Deleting a versioned base converts its current version into history.
            if current.get("versionId"):
                remaining = self.list(name, versions=True)
                for entry in remaining:
                    if entry.get("name") == name and entry.get("versionId") == current["versionId"]:
                        if entry.get("isCurrentVersion") is True:
                            raise ValueError("Blob changed during cleanup")
                        self._az("delete", ["--name", name, "--version-id", entry["versionId"]])
