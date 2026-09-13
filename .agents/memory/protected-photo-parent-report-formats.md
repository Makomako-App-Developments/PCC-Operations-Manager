---
name: Protected photo parents and report formats
description: Safety rules for authorizing parent-linked uploads and ensuring accepted images can appear in generated reports.
---

Protected attachment access must validate that the referenced parent still exists, even for privileged callers, and deny parentless rows by default.

**Why:** Nullable or `ON DELETE SET NULL` relationships can otherwise turn a formerly restricted object into a file readable by any authenticated user who retained its URL.

**How to apply:** In every protected object-serving path, resolve the owning parent before granting role or team access. Treat a missing parent or a row with no ownership relationship as not found.

Any workflow promising that all uploaded images appear in a PDF must accept only formats the PDF renderer embeds, or normalize unsupported formats before persistence/rendering.

**Why:** Downloading an `image/*` object is not enough; PDFKit directly embeds JPEG and PNG, while other accepted formats can fail at render time and be silently omitted.

**How to apply:** Keep upload validation, client picker validation or conversion, stored media type, and report rendering capabilities aligned. Regression tests should assert each attachment reaches the renderer.