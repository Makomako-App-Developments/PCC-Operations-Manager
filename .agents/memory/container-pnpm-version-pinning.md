---
name: Container pnpm version pinning
description: Why container builds must use the same pnpm major as CI instead of Corepack's latest release.
---

Pin container builds to the repository's supported pnpm major rather than letting Corepack download the latest pnpm release.

**Why:** Corepack selected pnpm 12 for an otherwise unchanged image build. That release no longer read the repository's package-level pnpm override configuration, so frozen installation failed with a lockfile configuration mismatch even though CI used pnpm 10 successfully.

**How to apply:** Keep Docker and CI pnpm majors aligned. When changing the supported major, update both together and verify a frozen clean install plus the production image build.