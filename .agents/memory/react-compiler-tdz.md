---
name: React Compiler TDZ bug
description: audits.tsx used assetsData in a useMemo BEFORE declaring it; React Compiler masked this, disabling it exposed the underlying source-code TDZ.
---

## The rule
Always declare hook results before any useMemo/useCallback that references them.

**Why:** `audits.tsx` had `const mapHtml = useMemo(..., [userLocation, assetsData])` at line ~221, but `const { data: assetsData } = useListAssets(...)` wasn't declared until line ~270. `const` is subject to TDZ. The React Compiler was accidentally masking this by reordering the compiled output. Disabling the React Compiler surfaced the underlying TDZ as "Cannot access 're' before initialization" (Terser minified `assetsData` to `re`).

**Fix applied:** Moved the `useListAssets` call to BEFORE the `mapHtml` useMemo in `audits.tsx`. Also kept `'react-compiler': false` in `babel.config.js` so future regressions aren't masked.

**How to apply:** When you see a TDZ crash in field-ops production build (`Cannot access 'X' before initialization`), check `audits.tsx` and other tab screens for const hook results used in useMemo deps before they are declared. The fix is reordering — move the hook call earlier in the component body.

**Cache note:** Changing `babel.config.js` alone does NOT bust Metro's module transform cache at `/tmp/metro-cache`. Always `rm -rf /tmp/metro-cache` before rebuilding to confirm config changes took effect (new bundle hash = content changed).
