---
name: Auth test JWT secret loading
description: Auth modules capture JWT_SECRET during module initialization, so tests must set it before importing auth middleware or routes.
---

Authentication tests that exercise both token issuance and refresh verification must initialize `process.env.JWT_SECRET` before importing the auth modules. The middleware captures the secret at module load, while the refresh route reads it when handling a request; setting it only in `beforeEach` can make newly issued tokens fail refresh verification.

**Why:** Tests otherwise pass access-token checks (which use the same captured middleware secret) while refresh requests fail with an invalid signature, making the failure look like session validation.

**How to apply:** Set the test JWT secret immediately before dynamic auth-module imports, and keep per-test setup for user/session state only.