---
"effect-app": minor
---

Replace `QueryStream`/`CommandStream` factories with `stream: true` in `Query`/`Command` config. Use `Req.Command<T>()("Tag", {}, { stream: true, success: ... })` instead of `Req.CommandStream<T>()("Tag", {}, { success: ... })`. Request classes now expose `make` (already available via Schema) as the preferred construction method; `stream` is stripped from stored config metadata.
