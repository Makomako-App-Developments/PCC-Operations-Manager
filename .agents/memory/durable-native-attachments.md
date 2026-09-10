---
name: Durable native attachments
description: Reliability rules for native file staging, multipart retries, durable queues, cleanup, and idempotency.
---

Native attachments must be copied from temporary picker URIs into app-owned document storage before the UI can report them as safely queued. Every network attempt, including an authentication retry, must build a fresh multipart body. A successful upload must be removed from durable queue storage before its managed file is deleted. Upload identity must remain stable from the immediate attempt through offline retries.

**Why:** Picker URIs can expire after backgrounding or restart, multipart bodies are not safely replayable, hidden storage failures can falsely report that a file is queued, and deleting before queue persistence can leave a durable record pointing to a missing file. Stable identity prevents ambiguous network responses from creating duplicate rows.

**How to apply:** Use the shared attachment transport for every native upload path. Serialize read-modify-write queue mutations, propagate persistence failures, preserve the attachment upload ID during retries, and treat managed-file cleanup as best-effort work after durable state has committed.