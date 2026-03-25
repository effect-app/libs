---
"effect-app": patch
---

Align effect-app tagged union helpers with Effect v4 by delegating to the native tagged union utilities, exposing v4-style `cases` and `guards`, and preserving the local `tags` helper.