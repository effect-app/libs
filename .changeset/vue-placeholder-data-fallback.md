---
"@effect-app/vue": patch
---

Restore TanStack `placeholderData` / `initialData` as a display-level fallback in query views. While pending with no cached value, `data` now returns the resolved placeholder (with `select` applied when set); neither option is written to the atom cache.
