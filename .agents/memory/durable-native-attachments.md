---
name: Durable cross-platform attachments
description: Reliability rules for native and browser byte staging, multipart retries, durable queues, cleanup, and idempotency.
---

Attachments must move from temporary picker state into app-owned durable storage before the UI can report them as safely queued: document storage on native and IndexedDB Blob storage on web. Queue metadata and all parent/dependent records must commit atomically after the bytes are durable. Every network attempt, including an authentication retry, must build a fresh multipart body. A successful upload must be removed from durable queue storage before its managed bytes are deleted. Upload identity must remain stable from the immediate attempt through offline retries.

**Why:** Native picker URIs and browser File/Blob references can expire after backgrounding, reload, or restart. Multipart bodies are not safely replayable, hidden storage failures can falsely report that a file is queued, and partial parent/photo queue writes can claim a record is safe without all of its evidence. Stable identity prevents ambiguous network responses from creating duplicate rows.

**How to apply:** Use the shared attachment transport for every queued upload path. Serialize read-modify-write queue mutations, atomically persist related parent/photo metadata, propagate storage read/write failures, preserve the attachment upload ID during retries, classify legacy metadata-only browser records for selective recovery, and clean managed bytes only after durable queue state has committed.