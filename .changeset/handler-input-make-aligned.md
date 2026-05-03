---
"effect-app": patch
"@effect-app/vue": patch
---

Align request handler input typing with the request's `make` signature. Handlers are now classified as no-input only when the request schema declares no payload fields; any payload (even fully-optional) yields a function handler whose input matches `make`'s first parameter. Adds `HandlerInput<I>` and threads it through `CommandFromRequest`.
