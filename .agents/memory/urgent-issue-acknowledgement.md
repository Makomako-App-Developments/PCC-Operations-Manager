---
name: Urgent issue acknowledgement
description: Confirmed interaction and audit semantics for desktop Storm Patrol urgent issues.
---

Opening a live Storm Patrol urgent issue in the desktop Command Centre counts as acknowledgement. Do not require a separate acknowledgement button. Show the acknowledgement status, time, and manager clearly.

**Why:** The user confirmed that opening the details is a sufficient signal that the manager has reviewed the issue, and a second action adds unnecessary friction.

**How to apply:** Record acknowledgement only after the modal has rendered successfully. If the write fails, keep the issue visibly unacknowledged and allow another attempt after closing and reopening it. Historical event views never acknowledge issues.