---
"@effect-app/infra": patch
---

`removeById` now takes `id | NonEmptyReadonlyArray<id>` instead of a variadic rest, and the extended repo's `removeById` accepts a `batch` option to chunk large deletes — consistent with `save` and `remove`.
