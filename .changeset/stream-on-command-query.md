---
"effect-app": minor
"@effect-app/infra": minor
"@effect-app/vue": minor
---

Add streaming as a `stream: true` config option on `Query` / `Command` instead of a separate request type.

`TaggedRequestFor` now exposes only `Query` and `Command` factories — the standalone `Stream` factory is removed. To produce a Stream of `success` values, pass `stream: true` in the request config. The request `type` field stays `"command" | "query"`; a new `stream: boolean` field carries the streaming flag (stripped from the stored handler config).

```ts
// Query that streams results
Req.Query<T>()("Tag", {}, { stream: true, success: ... })

// Command that streams results
Req.Command<T>()("Tag", {}, { stream: true, success: ... })
```

Vue client mapping (per-handler properties mirror the non-stream API — `.query`, `.fn`, `.mutate`):

- `query` + `stream: true` → exposes `.query` (read-only streaming, tracked Vue Query). Helper map key: `${name}Query`.
- `command` + `stream: true` → exposes `.fn` and `.mutate` (mutating streaming).
- Plain `query` / `command` unchanged.

Server routing dispatches via the new `stream` flag (`makeStreamRpc` for streaming commands/queries, `makeCommandRpc` / `Rpc.make` otherwise).

Also lifts the `Struct` / `TaggedStruct` and `Opaque` definitions in `effect-app/Schema` to use `S.Bottom` / `S.Opaque` directly, exposing `fields`, `mapFields`, and a `MakeIn` that allows `void` when all fields are optional. `TaggedRequestFor` request classes now use `Opaque(TaggedStruct(...))` instead of `TaggedClass`, and decoding/encoding services are derived from `success` / `error` rather than stored on the request.

**Migration**: replace `Req.Stream` with `Req.Query` or `Req.Command` and add `stream: true` to the config — `Query` for read-only streams, `Command` for mutating streams.
