---
"@effect-app/client": minor
"@effect-app/infra": minor
"@effect-app/vue": minor
---

Split `Stream` request type into `CommandStream` and `QueryStream`.

`TaggedRequestFor` now exposes `QueryStream` and `CommandStream` factories instead of a single `Stream`.

- **`QueryStream`**: Read-only streaming. Exposes `.streamQuery` on the Vue client. No `.mutate` / `.streamFn`.
- **`CommandStream`**: Mutating streaming. Exposes `.mutate` and `.streamFn` on the Vue client. No `.streamQuery`.

The underlying `type` field changes from `"stream"` to `"queryStream"` / `"commandStream"`. Both still use the stream RPC protocol on the server side.

**Migration**: Replace `Req.Stream` with `Req.CommandStream` or `Req.QueryStream` depending on whether the stream mutates state or is read-only.
