"""Incremental photo snapshots; 30-day reference-aware retention, not file-age mirroring."""
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from azure_photo_store import AzurePhotoStore
from photo_backup_source import PhotoSource, check_file, file_hashes, validate_object

MAX_RUN_BYTES = 10 * 1024**3
UTC = timezone.utc


def object_key(source_id, item):
    return f"objects/{source_id}/{hashlib.sha256(item['name'].encode()).hexdigest()}/{item['generation']}"


def parse_time(value):
    if not isinstance(value, str):
        raise ValueError("Missing snapshot timestamp")
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Snapshot timestamp must have timezone")
    return result


def validate_snapshot(snapshot, source_id):
    if (not isinstance(snapshot, dict) or snapshot.get("format") != "pcc-photo-snapshot-v1" or
        snapshot.get("sourceId") != source_id or snapshot.get("complete") is not True or
        not isinstance(snapshot.get("objects"), list)):
        raise ValueError("Invalid or incomplete photo snapshot")
    parse_time(snapshot.get("createdUtc"))
    names = set()
    for item in snapshot["objects"]:
        validate_object(item)
        if item["name"] in names or item.get("blob") != object_key(source_id, item) or \
           not re.fullmatch(r"[0-9a-f]{64}", item.get("sha256", "")):
            raise ValueError("Invalid snapshot reference")
        names.add(item["name"])
    if type(snapshot.get("fileCount")) is not int or snapshot["fileCount"] != len(names) or \
       type(snapshot.get("totalBytes")) is not int or snapshot["totalBytes"] != sum(i["bytes"] for i in snapshot["objects"]):
        raise ValueError("Snapshot totals contradict its objects")
    return snapshot


def load_snapshots(store, source_id, directory):
    prefix = f"snapshots/{source_id}/"
    rows = store.list(prefix)
    result = []
    for row in rows:
        name = row.get("name", "")
        if not re.fullmatch(re.escape(prefix) + r"\d{8}T\d{6}Z-\d+-\d+\.json", name):
            raise ValueError("Unexpected snapshot file; cleanup blocked")
        size = row.get("properties", {}).get("contentLength")
        if type(size) is not int or not 0 < size <= 32 * 1024**2:
            raise ValueError("Unverifiable snapshot size")
        path = directory / "snapshot.json"
        store.download(name, path)
        try:
            sha, _ = file_hashes(path)
            if sha != row.get("metadata", {}).get("sha256"):
                raise ValueError("Snapshot checksum failed")
            data = validate_snapshot(json.loads(path.read_text()), source_id)
            created = parse_time(data["createdUtc"])
            if created > datetime.now(UTC) + timedelta(minutes=5) or \
               not name.split("/")[-1].startswith(created.strftime("%Y%m%dT%H%M%SZ") + "-"):
                raise ValueError("Snapshot name/time contradiction")
            result.append((name, data))
        finally:
            path.unlink(missing_ok=True)
    return sorted(result, key=lambda pair: parse_time(pair[1]["createdUtc"]))


def backup(source, store, source_id, objects, directory, now, run_id, attempt):
    previous = load_snapshots(store, source_id, directory)
    if not objects and previous and previous[-1][1]["fileCount"] > 0:
        raise ValueError("Unexpectedly empty photo source; previous snapshots preserved")
    # Prior manifests prove which previously copied files passed read-back verification.
    proven = {item["blob"]: item for _, snapshot in previous for item in snapshot["objects"]}
    inventory = {row["name"]: row for row in store.list(f"objects/{source_id}/")}
    saved, copied_bytes, copied = [], 0, 0
    for item in objects:
        key = object_key(source_id, item)
        original = proven.get(key)
        existing = inventory.get(key)
        valid_old = (original and existing and
            original["bytes"] == item["bytes"] and original["md5"] == item["md5"] and
            existing.get("properties", {}).get("contentLength") == item["bytes"] and
            existing.get("properties", {}).get("contentSettings", {}).get("contentMd5") == item["md5"] and
            existing.get("metadata", {}).get("sha256") == original["sha256"])
        if valid_old:
            sha = original["sha256"]
        else:
            local = directory / "file"
            if existing:
                # Retry an interrupted copy only after verifying its actual bytes.
                store.download(key, local)
                sha = check_file(local, item)
            else:
                copied_bytes += item["bytes"]
                if copied_bytes > MAX_RUN_BYTES:
                    raise ValueError("New photo transfer exceeds the 10 GiB run safety limit")
                source.download(item, local)
                sha = check_file(local, item)
                store.upload(key, local)
                local.unlink()
                store.download(key, local)
                check_file(local, {**item, "sha256": sha})
                copied += 1
            # Existing mismatched metadata cannot silently become a trusted reference.
            if existing and existing.get("metadata", {}).get("sha256") != sha:
                raise ValueError("Azure object metadata failed integrity verification")
            local.unlink(missing_ok=True)
        saved.append({**item, "blob": key, "sha256": sha})
    snapshot = {"format": "pcc-photo-snapshot-v1", "sourceId": source_id,
        "createdUtc": now.isoformat(), "complete": True, "objects": saved,
        "fileCount": len(saved), "totalBytes": sum(i["bytes"] for i in saved)}
    name = f"snapshots/{source_id}/{now.strftime('%Y%m%dT%H%M%SZ')}-{run_id}-{attempt}.json"
    path = directory / "new-snapshot.json"
    path.write_text(json.dumps(snapshot, separators=(",", ":")))
    sha, _ = file_hashes(path)
    store.upload(name, path)  # Publish LAST, only after all photo copies are verified.
    downloaded = directory / "snapshot-readback.json"
    store.download(name, downloaded)
    if file_hashes(downloaded)[0] != sha:
        raise ValueError("Snapshot read-back verification failed")
    return name, copied, copied_bytes


def verify(store, source_id, directory, selected=""):
    snapshots = load_snapshots(store, source_id, directory)
    if not snapshots:
        raise ValueError("No completed photo snapshots to restore")
    if selected:
        matches = [s for s in snapshots if s[0] == selected]
        if len(matches) != 1:
            raise ValueError("Requested snapshot is not in the verified source history")
        name, snapshot = matches[0]
    else:
        name, snapshot = snapshots[-1]
    # Actually recreate every original path in an isolated temporary folder.
    restored = directory / "restored"
    for item in snapshot["objects"]:
        target = restored / item["name"]
        target.parent.mkdir(parents=True, exist_ok=True)
        store.download(item["blob"], target)
        check_file(target, item)
    return name, snapshot["fileCount"], snapshot["totalBytes"]


def prune(store, source_id, directory, now):
    snapshots = load_snapshots(store, source_id, directory)
    if not snapshots or now - parse_time(snapshots[-1][1]["createdUtc"]) > timedelta(days=1):
        raise ValueError("Cleanup requires a successful photo snapshot within the last day")
    cutoff = now - timedelta(days=30)
    retained = [s for s in snapshots if parse_time(s[1]["createdUtc"]) >= cutoff]
    referenced = {o["blob"] for _, s in retained for o in s["objects"]}
    expired = {name for name, s in snapshots if parse_time(s["createdUtc"]) < cutoff}
    # Preflight ALL provider lists and timestamps before performing ANY deletion.
    groups = {}
    for prefix in (f"objects/{source_id}/", f"snapshots/{source_id}/"):
        for row in store.list(prefix, versions=True):
            name = row.get("name", "")
            pattern = (r"objects/" + source_id + r"/[0-9a-f]{64}/\d{1,30}" if prefix.startswith("objects/")
                       else r"snapshots/" + source_id + r"/\d{8}T\d{6}Z-\d+-\d+\.json")
            if not re.fullmatch(pattern, name):
                raise ValueError("Unexpected backup object; cleanup blocked")
            modified = parse_time(row.get("properties", {}).get("lastModified"))
            if modified > now + timedelta(minutes=5):
                raise ValueError("Invalid provider timestamp; cleanup blocked")
            if row.get("versionId") and type(row.get("isCurrentVersion")) is not bool:
                raise ValueError("Unknown provider version state; cleanup blocked")
            groups.setdefault(name, []).append((row, modified))
    if referenced - set(groups):
        raise ValueError("Retained snapshot references missing files; cleanup blocked")
    candidates = []
    for name, entries in groups.items():
        if name in referenced:
            continue  # Live files are referenced by each new daily snapshot, regardless of age.
        if name.startswith("snapshots/") and name not in expired:
            continue
        if any(modified >= cutoff for _, modified in entries):
            continue  # Protect young orphan copies and newer revisions.
        candidates.append((name, [row for row, _ in entries]))
    # Remove expired manifests first; partial failures over-retain, never lose retained references.
    candidates.sort(key=lambda pair: (not pair[0].startswith("snapshots/"), pair[0]))
    for name, entries in candidates:
        store.delete_group(name, entries)
    return len(candidates)


def main():
    operation = sys.argv[1]
    source = PhotoSource(os.environ["PHOTO_BACKUP_SOURCE_URL"])
    store = AzurePhotoStore(os.environ["AZURE_BACKUP_STORAGE_ACCOUNT"],
                            os.environ["AZURE_PHOTO_BACKUP_CONTAINER"])
    with tempfile.TemporaryDirectory(prefix="pcc-photo-backup-", dir=os.environ.get("RUNNER_TEMP")) as temporary:
        os.chmod(temporary, 0o700)
        directory = Path(temporary)
        now = datetime.now(UTC)
        if operation in ("inventory", "backup"):
            source_id, objects = source.inventory()
            total = sum(o["bytes"] for o in objects)
            lines = [f"- Production files: {len(objects)}", f"- Source bytes: {total}",
                     f"- Source fingerprint: `{source_id}`"]
            if operation == "backup":
                if source_id != os.environ.get("PHOTO_BACKUP_SOURCE_ID"):
                    raise ValueError("Production source has not been confirmed and pinned")
                run_id, attempt = os.environ["GITHUB_RUN_ID"], os.environ["GITHUB_RUN_ATTEMPT"]
                if not re.fullmatch(r"\d+", run_id) or not re.fullmatch(r"\d+", attempt):
                    raise ValueError("Invalid runner identity")
                name, copied, size = backup(source, store, source_id, objects, directory, now, run_id, attempt)
                removed = prune(store, source_id, directory, now)
                lines += [f"- Verified snapshot: `{name}`", f"- New files copied: {copied}",
                          f"- New source bytes transferred: {size}", f"- Expired object groups removed: {removed}"]
        elif operation in ("verify", "prune"):
            source_id = os.environ.get("PHOTO_BACKUP_SOURCE_ID", "")
            if not re.fullmatch(r"[0-9a-f]{64}", source_id):
                raise ValueError("Production source fingerprint must be pinned")
            if operation == "verify":
                name, count, size = verify(store, source_id, directory, os.environ.get("PHOTO_BACKUP_MANIFEST", ""))
                lines = [f"- Snapshot restored: `{name}`", f"- Files restored and checksum-verified: {count}",
                         f"- Restored bytes: {size}", "- Original paths recreated in a temporary folder."]
            else:
                lines = [f"- Expired object groups removed: {prune(store, source_id, directory, now)}"]
        else:
            raise ValueError("Unknown photo backup operation")
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
            summary.write(f"## Photo backup {operation} passed\n\n" + "\n".join(lines) +
                          "\n- No production files were modified. Temporary files are discarded.\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Provider exceptions/HTTP bodies can include object names, URLs or credentials.
        print("::error::Photo backup operation failed. No complete new recovery point is claimed; raw errors withheld.")
        sys.exit(1)
