---
name: React Compiler TDZ bug
description: babel-plugin-react-compiler auto-discovered by babel-preset-expo reorders hooks in minified builds, causing TDZ crashes only in production.
---

## The rule
Never leave `babel-plugin-react-compiler` in devDependencies without explicitly disabling it in babel.config.js.

**Why:** `babel-preset-expo` (Expo SDK 54+) auto-discovers `babel-plugin-react-compiler` if installed, even without it being listed in `babel.config.js`. The compiler reorders hook calls (e.g. puts `useMemo([Q,re])` BEFORE `const {data:re}=useQuery(...)`) and Terser's minifier then surfaces the temporal dead zone as "Cannot access 're' before initialization" — only in production bundles, not dev.

**How to apply:** In `artifacts/field-ops/babel.config.js`, the option is:
```js
presets: [["babel-preset-expo", {
  unstable_transformImportMeta: true,
  'react-compiler': false,   // ← exact key name, hyphen not camelCase
}]]
```

The env variable `api.caller(getReactCompiler)` returns `caller?.supportsReactCompiler`. Even when the package is removed from package.json, it may still be in the pnpm store. Clearing `/tmp/metro-cache` forces a full rebuild to confirm the fix took effect (new bundle hash = new content).

**Confirmed via stack trace:** crash at `entry-6ec022136adcf79afe9f8935954dd4fe.js:1007:7510` in function `v`, inside the audits.tsx component; the memoized HTML map template had `re` as a dependency list item but `re` was bound by a later `useQuery` call.
