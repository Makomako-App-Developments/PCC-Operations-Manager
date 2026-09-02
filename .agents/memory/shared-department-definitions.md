---
name: Shared department definitions
description: Keep department values, labels, server validation, and all asset selectors aligned through one cross-platform module.
---

The department options used by asset management are maintained in one cross-platform definition. The API validator and manager/Field Ops consumers must import that definition rather than maintaining local lists or label maps.

**Why:** Department values are part of the OpenAPI contract, but display labels are needed by multiple clients; local copies can silently diverge when a new operation is introduced.

**How to apply:** Update the shared options and the OpenAPI Department enum together when adding a department, then run API code generation and the contract check.