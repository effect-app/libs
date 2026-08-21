---
"@effect-app/vue-components": patch
---

OmegaForm number fields accept both "." and "," while typing: the wrong separator is translated to the active one (locale or explicit decimal-separator). Int fields no longer silently block decimals (precision null): invalid values go through and the schema error shows.
