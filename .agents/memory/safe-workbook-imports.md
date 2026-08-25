---
name: Safe workbook imports
description: Decision for importing historic operational workbooks without duplicate or partial records.
---

Workbook imports that create operational records must be a two-step, manager-only flow: preview/validate first, then explicitly confirm by uploading the exact same workbook again. Derive a deterministic fingerprint from the file bytes; record it with each imported row and use it as the retry guard.

**Why:** The operational source data can contain hundreds of rows. A timeout, retry, or accidental re-upload must never create duplicate readings or leave readings without their linked manager-review drafts. An explicit commit also makes the material consequence of the upload clear before anything is written.

**How to apply:** Keep commit work atomic, reject a changed fingerprint after preview, return a no-op success for a fully imported fingerprint, and preserve existing manual scheduling rules. Batch imports create review drafts only; they must not assign field teams or publish scheduled work.