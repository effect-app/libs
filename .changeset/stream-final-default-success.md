---
"effect-app": patch
"@effect-app/vue": patch
---

Default the stream `mutateStream` execute resolved value to the request's success type when no `final` schema is declared.

Previously the type defaulted to `void`, but the runtime already resolves with the last emitted value. Types now match runtime behaviour: `execute` returns `Final` if a `final` schema is set, otherwise the success type.
