"""Offline failure-path tests; never connect to a database or Azure."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/azure-db-backup.yml"


def backup_script():
    lines = WORKFLOW.read_text().splitlines()
    first = next(i for i, line in enumerate(lines) if "# BEGIN BACKUP SCRIPT" in line)
    last = next(i for i, line in enumerate(lines) if "# END BACKUP SCRIPT" in line)
    return textwrap.dedent("\n".join(lines[first + 1:last])) + "\n"


FAKE_TOOL = """#!/usr/bin/env python3
import json, os, pathlib, sys
tool = pathlib.Path(sys.argv[0]).name
mode = os.environ.get("TEST_MODE", "success")
args = sys.argv[1:]
if tool == "pg_dump":
    if mode == "dump_failure":
        print(os.environ["DATABASE_URL"], file=sys.stderr)
        sys.exit(1)
    path = next(x.split("=", 1)[1] for x in args if x.startswith("--file="))
    pathlib.Path(path).write_bytes(b"" if mode == "empty" else b"fake-valid-archive")
elif tool == "pg_restore":
    if mode == "invalid_archive":
        sys.exit(1)
    print("; Archive TOC")
    if mode != "wrong_database":
        print("123; 0 999 TABLE DATA public assets owner")
elif tool == "az":
    action = args[2]
    name = args[args.index("--name") + 1]
    path = pathlib.Path(args[args.index("--file") + 1])
    target = pathlib.Path(os.environ["TEST_CLOUD"]) / name.replace("/", "_")
    with open(os.environ["TEST_CALLS"], "a") as f:
        f.write(json.dumps({"action": action, "name": name, "args": args}) + "\\n")
    if action == "upload":
        if mode == "upload_failure":
            sys.exit(1)
        if mode == "manifest_failure" and name.endswith(".json"):
            sys.exit(1)
        if target.exists():
            sys.exit(1)
        target.write_bytes(path.read_bytes())
    elif action == "download":
        if mode == "download_failure":
            sys.exit(1)
        path.write_bytes(b"corrupted" if mode == "checksum_mismatch" else target.read_bytes())
    else:
        sys.exit(2)
"""


class AzureBackupTests(unittest.TestCase):
    def run_backup(self, mode="success", url="postgresql://fake:fake-password@invalid/db"):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binaries = root / "bin"
            cloud = root / "cloud"
            runner = root / "runner"
            for path in (binaries, cloud, runner):
                path.mkdir()
            for tool in ("pg_dump", "pg_restore", "az"):
                path = binaries / tool
                path.write_text(FAKE_TOOL)
                path.chmod(0o700)
            env = {
                **os.environ,
                "PATH": f"{binaries}:{os.environ['PATH']}",
                "PG_BIN": str(binaries),
                "DATABASE_URL": url,
                "RUNNER_TEMP": str(runner),
                "GITHUB_RUN_ID": "1234",
                "GITHUB_RUN_ATTEMPT": "1",
                "GITHUB_STEP_SUMMARY": str(root / "summary"),
                "AZURE_BACKUP_STORAGE_ACCOUNT": "testaccount",
                "AZURE_BACKUP_CONTAINER": "testcontainer",
                "TEST_MODE": mode,
                "TEST_CLOUD": str(cloud),
                "TEST_CALLS": str(root / "calls"),
            }
            result = subprocess.run(
                ["bash", "-c", backup_script()], env=env,
                capture_output=True, text=True, timeout=15,
            )
            calls = [
                json.loads(line) for line in (root / "calls").read_text().splitlines()
            ] if (root / "calls").exists() else []
            manifests = [json.loads(f.read_text()) for f in cloud.glob("*.json")]
            summary = (root / "summary").read_text() if (root / "summary").exists() else ""
            self.assertEqual(list(runner.iterdir()), [], "Temporary sensitive files must be removed")
            self.assertNotIn("fake-password", result.stdout + result.stderr)
            return result, calls, manifests, summary

    def test_success_uploads_archive_downloads_then_publishes_manifest(self):
        result, calls, manifests, summary = self.run_backup()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([c["action"] for c in calls], ["upload", "download", "upload"])
        self.assertTrue(calls[0]["name"].endswith(".dump"))
        self.assertTrue(calls[-1]["name"].endswith(".json"))
        self.assertTrue(manifests[0]["azure_readback_verified"])
        self.assertFalse(manifests[0]["restore_tested"])
        self.assertIn("not yet performed", summary)
        for call in calls:
            args = call["args"]
            self.assertEqual(args[args.index("--auth-mode") + 1], "login")
            self.assertEqual(args[args.index("--overwrite") + 1], "false")
            self.assertNotIn("--connection-string", args)

    def test_pre_upload_failures_never_touch_azure(self):
        for mode in ("dump_failure", "empty", "invalid_archive", "wrong_database"):
            with self.subTest(mode=mode):
                result, calls, manifests, summary = self.run_backup(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(calls, [])
                self.assertEqual(manifests, [])
                self.assertEqual(summary, "")

    def test_upload_verification_failures_do_not_publish_success_manifest(self):
        for mode in ("upload_failure", "download_failure", "checksum_mismatch", "manifest_failure"):
            with self.subTest(mode=mode):
                result, calls, manifests, summary = self.run_backup(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(manifests, [])
                self.assertEqual(summary, "")
                self.assertFalse(any(c["action"] == "delete" for c in calls))

    def test_missing_secret_fails_closed(self):
        result, calls, _, _ = self.run_backup(url="")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])

    def test_command_instead_of_uri_fails_closed(self):
        result, calls, _, _ = self.run_backup(url="psql postgresql://fake/db")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])

    def test_workflow_is_not_a_deployment_or_pull_request_workflow(self):
        workflow = WORKFLOW.read_text()
        self.assertIn("github.ref == 'refs/heads/master'", workflow)
        self.assertIn('cron: "17 14 * * *"', workflow)
        self.assertNotIn("pull_request:", workflow)
        self.assertNotIn("actions/checkout", workflow)
        self.assertNotIn("actions/upload-artifact", workflow)
        self.assertNotIn("restore-db.ts", workflow)
        self.assertNotIn("AZURE_STORAGE_CONNECTION_STRING", workflow)


if __name__ == "__main__":
    unittest.main()
