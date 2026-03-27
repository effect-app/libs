---
"@effect-app/vue": patch
---

Fix numeric field type detection in `getMetadataFromSchema` for Effect v4 JSON schema output. `S.Number` now emits `anyOf` instead of a top-level `type: "number"`, causing fields to fall back to `"text"`. Detection now recurses through `anyOf`/`oneOf`/`allOf` to find the underlying numeric type.
