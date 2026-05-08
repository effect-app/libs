---
"effect-app": patch
---

Rename `withDefault` schema extensions to `withConstructorDefault` for clarity.

Document that `.withConstructorDefault` is **construction-only** (applied during `.make(...)` when a field is omitted) and is **not** applied during decode — it cannot be used to JIT-migrate database fields. Per-property JSDoc on every `.withConstructorDefault` / `.withDecodingDefaultType` exposed by `Schema/ext.ts`, `Schema/numbers.ts`, `Schema/moreStrings.ts`, and `ids.ts` so the caveat is visible on hover.

Re-export `withConstructorDefault`, `withDecodingDefault`, `withDecodingDefaultKey`, `withDecodingDefaultType`, and `withDecodingDefaultTypeKey` from `effect-app/Schema` with explicit JSDoc. `withDecodingDefault*` is discouraged for persisted data: a missing field may be data corruption rather than an old-shape document, and silently substituting a default hides the problem. Prefer an explicit, preferably versioned migration of database data over decode-time fallbacks.
