---
name: Legacy unclaimed active jobs
description: Compatibility rule for jobs started before individual claiming was introduced.
---

An ordinary job that was already `in_progress` or `paused` when individual job claiming was introduced can have no claimant. Its authenticated team worker may establish the claimant while completing it, using the same atomic null-owner guard used for a claim.

**Why:** Older active jobs otherwise fail the new completion check despite having genuinely been started, trapping completed field work in progress.

**How to apply:** Restrict this exception to ownerless, non-All-Teams jobs that are already active or paused and are transitioning to completed. Do not allow pending work to complete without first taking the standard start-and-claim path.