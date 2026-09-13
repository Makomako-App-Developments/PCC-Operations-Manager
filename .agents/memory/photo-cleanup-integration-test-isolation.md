---
name: Photo cleanup integration test isolation
description: How to interpret intermittent cleanup-worker count failures in the full parallel API test suite.
---

The real-PostgreSQL photo cleanup tests can intermittently miss expected provider-attempt counts when run inside the full parallel API suite, while passing in other full runs and when isolated.

**Why:** Separate full-suite validation runs failed in different cleanup-worker scenarios with partial batch counts, despite an immediately preceding full suite passing and unrelated focused tests remaining stable.

**How to apply:** When a full API run fails only on a cleanup-worker provider-attempt count, inspect the exact scenario and compare an isolated run plus one full rerun before attributing it to unrelated route or schema changes.