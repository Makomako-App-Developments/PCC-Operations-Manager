---
name: Operational alert state transitions
description: Safely derive one operational alert window from health metrics.
---

Operational alerts derived from health checks must mark the incident transition synchronously before asynchronous delivery, and only a successful metric read may clear the incident. Keep the recovered state visible in the health response.

**Why:** Concurrent probes can otherwise emit duplicate notifications, while treating a failed metrics query as zero can falsely announce recovery.

**How to apply:** Keep notification payloads sanitized and route delivery failures away from the health response; preserve active state when the underlying count query is unavailable.