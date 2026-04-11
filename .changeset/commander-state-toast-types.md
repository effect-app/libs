---
"@effect-app/vue": patch
---

Fix Commander combinator type inference for void Arg and withDefaultToast callbacks

- Use `ArgForCombinator` helper to properly resolve `void` args to `undefined` in combinator positions, enabling correct type inference for `withDefaultToast` and other curried combinators
- Use explicit positional params in `withDefaultToast` options callbacks instead of rest spread, allowing users to omit trailing parameters
