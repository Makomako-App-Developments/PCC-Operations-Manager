---
name: User access audit policy
description: Defines which user access changes require durable audit history when audit storage is unavailable.
---

Account reactivation must commit with its audit entry in one transaction and fail closed if audit storage is unavailable. Administrator demotion deliberately remains best-effort.

**Why:** Reactivation restores access and must leave mandatory history. Demotion removes privilege, and blocking it during an audit outage could prevent an urgent security response.

**How to apply:** Treat future access-granting or credential-changing user mutations as candidates for mandatory transactional auditing. Preserve the ability to remove administrator privilege even when audit storage is down unless the policy is explicitly revisited.