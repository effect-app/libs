---
"@effect-app/vue": patch
---

Keep the previous suspense value across reactive-arg atom switches.

A reactive arg re-points a resolved suspense query at a different family atom; the fresh atom starts `Initial` (no `previousSuccess` carried over), so the always-defined `data` computed found `undefined` and threw `Internal Error: suspense resolved without a latest value` during the next render flush. The always-defined ref now serves the last defined value across that transition (TanStack's keepPreviousData — Vue cannot re-suspend after mount); waiting/failure of the new fetch stays observable on the `result` ref. Applied to `.suspense()`, `.suspenseNew()` and `useAtomSuspense` via a shared `latestDefined` helper. It only throws when there has never been a value, which is unreachable once the suspense await resolved.
