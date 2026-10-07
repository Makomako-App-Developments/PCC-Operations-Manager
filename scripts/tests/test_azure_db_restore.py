"""Offline restore safety tests; use dummy bytes, never real Azure or PostgreSQL."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/azure-db-restore-test.yml"


def restore_script():
    lines = WORKFLOW.read_text().splitlines()
    first = next(i for i, line in enumerate(lines) if "# BEGIN RESTORE TEST SCRIPT" in line)
    last = next(i for i, line in enumerate(lines) if "# END RESTORE TEST SCRIPT" in line)
    return textwrap.dedent("\n".join(lines[first + 1:last])) + "\n"


FAKE_TOOL = """#!/usr/bin/env python3
import hashlib, json, os, pathlib, sys
tool = pathlib.Path(sys.argv[0]).name
mode = os.environ.get("TEST_MODE", "success")
args = sys.argv[1:]
with open(os.environ["TEST_CALLS"], "a") as f:
    f.write(json.dumps({"tool": tool, "args": args}) + "\\n")
payload = b"fixture-private-row"
old = "postgresql/pcc-production-20261006T000000Z-1-1.json"
latest = "postgresql/pcc-production-20261007T000000Z-2-1.json"
if tool == "psql":
    assert "--dbname=pcc_restore_validation" in args
    if "--file=" in " ".join(args):
        if mode == "validation_failure":
            print("fixture-private-row")
            print("fixture-private-row", file=sys.stderr)
            sys.exit(1)
        if mode == "table_mismatch":
            print("1|12|1")
        elif mode == "fk_mismatch":
            print("2|12|0")
        elif mode == "invalid_counts":
            print("fixture-private-row|12|1")
        elif mode == "empty_assets":
            print("2|0|1")
        else:
            print("2|12|1")
    elif "current_database()" in " ".join(args):
        print("wrong_database" if mode == "wrong_database" else "pcc_restore_validation")
    else:
        print("2" if mode == "nonempty_target" else "0")
elif tool == "pg_restore":
    if "--list" in args:
        if mode == "invalid_archive":
            print("fixture-private-row", file=sys.stderr)
            sys.exit(1)
        print("1; 1259 100 TABLE public assets owner")
        print("2; 1259 101 TABLE public users owner")
        print("3; 2606 200 FK CONSTRAINT public assets users_fk owner")
        if mode != "missing_assets":
            print("4; 0 100 TABLE DATA public assets owner")
        print("5; 0 101 TABLE DATA public users owner")
    else:
        assert "--dbname=pcc_restore_validation" in args
        assert "--single-transaction" in args and "--exit-on-error" in args
        assert "--no-owner" in args and "--no-acl" in args
        assert "--clean" not in args and "--create" not in args
        if mode == "restore_failure":
            print("fixture-private-row")
            print("fixture-private-row", file=sys.stderr)
            sys.exit(1)
elif tool == "az":
    action = args[2]
    assert action in ("list", "download"), "Azure restore operations must be read-only"
    assert args[args.index("--auth-mode") + 1] == "login"
    if action == "list":
        print(json.dumps([] if mode == "no_manifests" else [latest[:-5]+".dump", old, latest]))
    else:
        name = args[args.index("--name") + 1]
        target = pathlib.Path(args[args.index("--file") + 1])
        if mode == "download_failure":
            sys.exit(1)
        if name.endswith(".json"):
            manifest = {
                "format": "postgresql-custom",
                "postgresql_client_major": 16,
                "azure_readback_verified": mode != "unverified_manifest",
                "blob": name[:-5]+".dump",
                "sha256": hashlib.sha256(payload).hexdigest(),
                "bytes": len(payload),
            }
            if mode == "blob_mismatch":
                manifest["blob"] = "../../arbitrary.dump"
            if mode == "size_mismatch":
                manifest["bytes"] = len(payload)+1
            if mode == "checksum_mismatch":
                manifest["sha256"] = "0"*64
            if mode == "invalid_manifest":
                manifest = ["not-a-manifest"]
            target.write_text(json.dumps(manifest))
        else:
            target.write_bytes(payload)
"""


class AzureRestoreTests(unittest.TestCase):
    def run_restore(self, mode="success", overrides=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binaries, runner = root / "bin", root / "runner"
            binaries.mkdir()
            runner.mkdir()
            for tool in ("az", "psql", "pg_restore"):
                path = binaries / tool
                path.write_text(FAKE_TOOL)
                path.chmod(0o700)
            # Do not inherit a workspace DATABASE_URL or other database credentials.
            env = {
                "PATH": f"{binaries}:{os.environ['PATH']}",
                "PG_BIN": str(binaries),
                "PGHOST": "127.0.0.1",
                "PGPORT": "5432",
                "PGDATABASE": "pcc_restore_validation",
                "PGUSER": "restore_check",
                "PGPASSWORD": "temporary-restore-test-only",
                "RUNNER_TEMP": str(runner),
                "GITHUB_STEP_SUMMARY": str(root / "summary"),
                "AZURE_BACKUP_STORAGE_ACCOUNT": "fakeaccount",
                "AZURE_BACKUP_CONTAINER": "fakecontainer",
                "BACKUP_MANIFEST_INPUT": "",
                "TEST_MODE": mode,
                "TEST_CALLS": str(root / "calls"),
            }
            env.update(overrides or {})
            result = subprocess.run(
                ["bash", "-c", restore_script()], env=env,
                capture_output=True, text=True, timeout=15,
            )
            calls = [
                json.loads(line) for line in (root / "calls").read_text().splitlines()
            ] if (root / "calls").exists() else []
            summary = (root / "summary").read_text() if (root / "summary").exists() else ""
            self.assertEqual(list(runner.iterdir()), [], "Sensitive temporary files must be removed")
            self.assertNotIn("fixture-private-row", result.stdout + result.stderr + summary)
            return result, calls, summary

    def test_success_uses_latest_verified_manifest_and_restores_locally(self):
        result, calls, summary = self.run_restore()
        self.assertEqual(result.returncode, 0, result.stderr)
        downloads = [c for c in calls if c["tool"] == "az" and c["args"][2] == "download"]
        self.assertEqual(len(downloads), 2)
        self.assertIn("postgresql/pcc-production-20261007T000000Z-2-1.json", downloads[0]["args"])
        self.assertIn("Isolated database restore test passed", summary)
        self.assertIn("Asset rows restored: 12", summary)
        self.assertIn("Foreign-key constraints restored: 1", summary)
        self.assertIn("Application-level recovery", summary)

    def test_can_select_an_older_verified_copy(self):
        name = "postgresql/pcc-production-20261006T000000Z-1-1.json"
        result, calls, _ = self.run_restore(overrides={"BACKUP_MANIFEST_INPUT": name})
        self.assertEqual(result.returncode, 0, result.stderr)
        first = next(c for c in calls if c["tool"] == "az" and c["args"][2] == "download")
        self.assertIn(name, first["args"])

    def test_target_guards_prevent_any_database_or_azure_calls(self):
        for override in (
            {"PGHOST": "production.invalid"}, {"PGPORT": "15432"},
            {"PGDATABASE": "production"}, {"PGUSER": "production"},
            {"DATABASE_URL": "postgresql://dummy@production.invalid/db"},
        ):
            with self.subTest(override=override):
                result, calls, summary = self.run_restore(overrides=override)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(calls, [])
                self.assertEqual(summary, "")

    def test_wrong_or_nonempty_local_database_never_downloads(self):
        for mode in ("wrong_database", "nonempty_target"):
            with self.subTest(mode=mode):
                result, calls, summary = self.run_restore(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any(c["tool"] == "az" for c in calls))
                self.assertEqual(summary, "")

    def test_invalid_copies_never_begin_a_restore(self):
        for mode in (
            "no_manifests", "unverified_manifest", "invalid_manifest", "blob_mismatch",
            "size_mismatch", "checksum_mismatch", "download_failure", "invalid_archive",
            "missing_assets",
        ):
            with self.subTest(mode=mode):
                result, calls, summary = self.run_restore(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any(c["tool"] == "pg_restore" and "--list" not in c["args"] for c in calls))
                self.assertEqual(summary, "")

    def test_failed_restores_and_validation_never_report_success(self):
        for mode in ("restore_failure", "validation_failure", "table_mismatch", "fk_mismatch", "invalid_counts", "empty_assets"):
            with self.subTest(mode=mode):
                result, _, summary = self.run_restore(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(summary, "")

    def test_manifest_input_is_not_executed_or_downloaded_arbitrarily(self):
        for name in ("../../arbitrary.json", "$(echo injected)", "postgresql/unknown.json"):
            with self.subTest(name=name):
                result, calls, summary = self.run_restore(overrides={"BACKUP_MANIFEST_INPUT": name})
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any(c["tool"] == "az" and c["args"][2] == "download" for c in calls))
                self.assertEqual(summary, "")

    def test_workflow_never_uses_production_secrets_or_public_artifacts(self):
        workflow = WORKFLOW.read_text()
        self.assertNotIn("${{ secrets.", workflow)
        self.assertNotIn("schedule:", workflow)
        self.assertNotIn("pull_request:", workflow)
        self.assertNotIn("actions/checkout", workflow)
        self.assertNotIn("actions/upload-artifact", workflow)
        self.assertNotIn("restore-db.ts", workflow)
        self.assertIn('PGOPTIONS: "-c log_min_messages=panic', workflow)
        self.assertIn('"127.0.0.1:5432:5432"', workflow)
        self.assertNotIn("AZURE_CORE_OUTPUT", workflow.split("    steps:", 1)[0])


if __name__ == "__main__":
    unittest.main()
