---
name: Accepted-skip draft lifecycle
description: Safety constraints for regular jobs whose skipped reason has been accepted.
---

Accepted regular-job skips are manager-only drafts rather than worker-schedulable work. They retain their original assignment context, do not consume capacity, and still reserve their recurring cycle so automated generation cannot create duplicate work.

**Why:** An accepted skip needs deliberate managerial placement, while a rejected skip must safely restore the original operational job. Treating accepted skips as ordinary pending work either leaks them to workers or allows duplicate recurring work.

**How to apply:** Keep draft reads limited to managers/administrators and prevent all operational draft mutation outside the dedicated placement transition. Serialize capacity rechecks, any approved route-tail push, and the status update together by target team/date; never split a confirmed push and placement into separate requests or offer over-capacity force placement.