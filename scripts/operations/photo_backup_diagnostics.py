"""Allowlisted operational diagnostics; never emit exception text or private paths."""
import json
import subprocess
import urllib.error

PHASES = frozenset((
    "startup", "source-identity", "source-inventory", "snapshot-list",
    "snapshot-download", "snapshot-validation", "object-list", "source-download",
    "source-checksum", "azure-upload", "azure-readback", "azure-checksum",
    "snapshot-publish", "snapshot-readback", "restore", "retention",
    "cleanup-list", "cleanup-validation", "cleanup-delete", "summary",
))
phase = "startup"


def set_phase(value):
    global phase
    phase = value if value in PHASES else "startup"


class AzureStorageFailure(RuntimeError):
    CODES = frozenset((
        "AuthorizationPermissionMismatch", "AuthorizationFailure",
        "AuthenticationFailed", "InvalidAuthenticationInfo", "BlobNotFound",
        "ContainerNotFound", "BlobAlreadyExists", "ConditionNotMet",
        "Md5Mismatch", "InvalidMd5", "ServerBusy", "OperationTimedOut",
        "AccountIsDisabled", "InvalidArgument", "unknown",
    ))
    OPERATIONS = frozenset(("list", "exists", "show", "download", "upload", "delete"))

    def __init__(self, operation, code):
        super().__init__("Azure photo storage operation failed; raw errors withheld")
        self.operation = operation if operation in self.OPERATIONS else "unknown"
        self.code = code if code in self.CODES else "unknown"


def category(error):
    if isinstance(error, AzureStorageFailure):
        return f"azure-{error.operation}-{error.code}"
    if isinstance(error, urllib.error.HTTPError):
        code = error.code
        return f"http-{code}" if type(code) is int and 100 <= code <= 599 else "http-unknown"
    if isinstance(error, (TimeoutError, subprocess.TimeoutExpired)):
        return "timeout"
    if isinstance(error, urllib.error.URLError):
        return "network"
    if isinstance(error, json.JSONDecodeError):
        return "invalid-json"
    if isinstance(error, ValueError):
        known = {
            "New photo transfer exceeds the 10 GiB run safety limit": "transfer-limit",
            "Azure listing exceeds safety limit; no cleanup permitted": "listing-limit",
            "File does not match source size/checksum": "source-checksum-mismatch",
            "File does not match backup SHA-256": "backup-checksum-mismatch",
            "Source download exceeded its inventory size": "source-size-mismatch",
            "Azure object metadata failed integrity verification": "azure-metadata-mismatch",
            "Snapshot checksum failed": "snapshot-checksum-mismatch",
            "Snapshot read-back verification failed": "snapshot-readback-mismatch",
            "Production source has not been confirmed and pinned": "source-pin-mismatch",
            "No completed photo snapshots to restore": "no-complete-snapshot",
        }
        return known.get(str(error), "validation")
    if isinstance(error, OSError):
        return "local-io"
    return "unexpected"


def failure_line(error):
    return (f"::error::Photo backup operation failed. Stage: {phase}; category: {category(error)}. "
            "No complete new recovery point is claimed; raw errors withheld.")
