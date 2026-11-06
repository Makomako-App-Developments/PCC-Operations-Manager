"""Azure CLI adapter: private OAuth operations, bounded listings, no raw error logs."""
import json
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path
import re
import subprocess
from urllib.parse import quote, urlencode
from photo_backup_source import file_hashes
from photo_backup_diagnostics import AzureStorageFailure


class AzurePhotoStore:
    def __init__(self, account, container, read_only=False):
        if container != "photo-backups":
            raise ValueError("Use the dedicated private photo-backups container")
        self.read_only = read_only
        self.account = account
        self.args = ["--account-name", account, "--container-name", container,
                     "--auth-mode", "login", "--only-show-errors"]

    def _az(self, operation, arguments, json_output=False):
        return self._run(["az", "storage", "blob", operation, *self.args, *arguments,
            "--output", "json" if json_output else "none"], operation, json_output)

    def _run(self, command, operation, json_output=False):
        result = subprocess.run(command,
            capture_output=True, text=True, timeout=240)
        if result.returncode:
            code = next((code for code in sorted(AzureStorageFailure.CODES - {"unknown"})
                         if re.search(r"\b" + re.escape(code) + r"\b", result.stderr)), "unknown")
            if code == "unknown" and "unrecognized arguments:" in result.stderr:
                code = "CliArgumentError"
            raise AzureStorageFailure(operation, code)
        return json.loads(result.stdout) if json_output else None

    def _delete_version(self, name, version_id):
        if self.read_only:
            raise ValueError("Restore verification cannot delete Azure backups")
        if not re.fullmatch(r"[a-z0-9]{3,24}", self.account):
            raise ValueError("Invalid Azure storage account")
        # --version-id is not supported by core `az storage blob delete`.
        # Use the stable Blob REST API with the existing login identity instead
        # of installing a preview extension or fetching an account key.
        url = (f"https://{self.account}.blob.core.windows.net/photo-backups/"
               + quote(name, safe="/") + "?" + urlencode({"versionid": version_id}))
        self._run(["az", "rest", "--method", "delete", "--url", url,
                   "--resource", "https://storage.azure.com/",
                   "--headers", "x-ms-version=2023-11-03",
                   "x-ms-date=" + format_datetime(datetime.now(timezone.utc), usegmt=True),
                   "--only-show-errors", "--output", "none"], "delete")

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
        if versions:
            # Azure can omit the current-version flag on historical versions,
            # especially after their base blob was deleted. Resolve ambiguous
            # rows against the base, never by assuming an absent flag is false.
            ambiguous = {row["name"] for row in result
                         if row.get("versionId") and row.get("isCurrentVersion") is None}
            for name in ambiguous:
                try:
                    current = self.show(name)
                except AzureStorageFailure as error:
                    if error.code != "BlobNotFound":
                        raise
                    current = None
                current_id = current.get("versionId") if current is not None else None
                if current is not None and (not isinstance(current_id, str) or
                        not current_id or not any(row.get("name") == name and
                        row.get("versionId") == current_id for row in result)):
                    raise ValueError("Blob changed during cleanup")
                for row in result:
                    if row.get("name") == name and row.get("versionId") and \
                            row.get("isCurrentVersion") is None:
                        row["isCurrentVersion"] = row["versionId"] == current_id
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
        if self.read_only:
            raise ValueError("Restore verification cannot write Azure backups")
        sha, md5 = file_hashes(path)
        self._az("upload", ["--name", key, "--file", str(path), "--overwrite", "false",
            "--content-md5", md5, "--metadata", "sha256=" + sha])

    def delete_group(self, name, entries):
        if self.read_only:
            raise ValueError("Restore verification cannot delete Azure backups")
        # Versioning can leave old bytes behind after a base-blob deletion.
        for entry in entries:
            if entry.get("versionId") and entry.get("isCurrentVersion") is False:
                self._delete_version(name, entry["versionId"])
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
                        self._delete_version(name, entry["versionId"])
