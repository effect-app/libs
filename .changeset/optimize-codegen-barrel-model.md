---
"@effect-app/eslint-codegen-model": patch
---

Optimize codegen barrel and model plugins:
- Drop `io-ts-extra`, `io-ts`, and `lodash` dependencies; replace with native JS helpers
- Add fast string comparison (skip AST parse) for barrel and model equality checks
- Avoid triple file reads in the CLI path: pass already-read source into `model` via context
- Eliminate double read in `run()`: pass source string into `updateFile`
- Extract shared logic (`blockRe`, helpers, `renderPreset`) into `src/shared/codegen-block.ts`
- Remove dead `fs.existsSync`/`fs.statSync` checks in `model` preset
- Use `Set` for O(1) dedup in `model` preset
- Move `last` helper to module scope in `barrel` preset
- Pre-compile all regex constants at module scope; use fresh `RegExp` copy per oxlint `Program` visit to avoid shared `lastIndex` mutations
