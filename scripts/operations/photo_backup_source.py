"""Read-only, keyless production source. Tokens and response bodies never enter logs."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import time
import urllib.request

AUDIENCE = "pcc-operations-manager-photo-backup"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward a bearer identity to another host.


class PhotoSource:
    def __init__(self, url):
        if url != "https://porirua-garden-manager.replit.app":
            raise ValueError("Source must be the verified production application URL")
        self.url = url
        self.token = ""
        self.token_at = 0
        self.opener = urllib.request.build_opener(NoRedirect())

    def _identity(self):
        if time.time() - self.token_at > 120:
            url = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
            separator = "&" if "?" in url else "?"
            request = urllib.request.Request(url + separator + "audience=" + AUDIENCE,
                headers={"Authorization": "Bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]})
            with self.opener.open(request, timeout=20) as response:
                self.token = json.load(response)["value"]
            self.token_at = time.time()
        return self.token

    def _request(self, route, body):
        return urllib.request.Request(self.url + "/api/internal/photo-backup/" + route,
            data=json.dumps(body).encode(),
            headers={"Authorization": "Bearer " + self._identity(), "Content-Type": "application/json"})

    def inventory(self):
        objects, seen, cursors, source_id, cursor = [], set(), set(), None, None
        for _ in range(1000):
            with self.opener.open(self._request("inventory", {"pageToken": cursor} if cursor else {}), timeout=45) as response:
                page = json.load(response)
            if not isinstance(page, dict) or not re.fullmatch(r"[0-9a-f]{64}", page.get("sourceId", "")):
                raise ValueError("Invalid source inventory")
            if source_id and source_id != page["sourceId"]:
                raise ValueError("Source changed during inventory")
            source_id = page["sourceId"]
            if not isinstance(page.get("objects"), list):
                raise ValueError("Incomplete source inventory")
            for item in page["objects"]:
                validate_object(item)
                if item["name"] in seen:
                    raise ValueError("Duplicate or changing source object")
                seen.add(item["name"])
                objects.append(item)
            cursor = page.get("nextPageToken")
            if cursor is None:
                return source_id, objects
            if not isinstance(cursor, str) or not cursor or cursor in cursors:
                raise ValueError("Invalid source continuation")
            cursors.add(cursor)
        raise ValueError("Source inventory exceeds safety limit")

    def download(self, item, target):
        total = 0
        with self.opener.open(self._request("download", {
            "name": item["name"], "generation": item["generation"]}), timeout=120) as response:
            with Path(target).open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    total += len(chunk)
                    if total > item["bytes"]:
                        raise ValueError("Source download exceeded its inventory size")
                    output.write(chunk)
        check_file(target, item)


def validate_object(item):
    if not isinstance(item, dict):
        raise ValueError("Invalid source object")
    name = item.get("name")
    if (not isinstance(name, str) or len(name) > 1024 or not name.startswith("uploads/") or
        any(p in ("", ".", "..") for p in name.split("/")) or
        re.search(r"[\x00-\x1f\x7f\\]", name) or
        not isinstance(item.get("generation"), str) or not re.fullmatch(r"\d{1,30}", item["generation"]) or
        type(item.get("bytes")) is not int or not 0 <= item["bytes"] <= 256 * 1024**2 or
        not isinstance(item.get("md5"), str) or not re.fullmatch(r"[A-Za-z0-9+/]{22}==", item["md5"]) or
        not isinstance(item.get("contentType"), str) or len(item["contentType"]) > 255):
        raise ValueError("Unverifiable source object")


def file_hashes(path):
    sha, md5 = hashlib.sha256(), hashlib.md5()
    with Path(path).open("rb") as source:
        while chunk := source.read(1024 * 1024):
            sha.update(chunk)
            md5.update(chunk)
    return sha.hexdigest(), base64.b64encode(md5.digest()).decode()


def check_file(path, item):
    sha, md5 = file_hashes(path)
    if Path(path).stat().st_size != item["bytes"] or md5 != item["md5"]:
        raise ValueError("File does not match source size/checksum")
    if item.get("sha256") and sha != item["sha256"]:
        raise ValueError("File does not match backup SHA-256")
    return sha
