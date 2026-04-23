---
"@effect-app/infra": patch
---

Apply `toCodecJson` at all repository encoding boundaries (encodeMany, encodeToEncoded, mapped.save) to ensure JSON-safe values before they hit `JSON.stringify` in SQL/Disk stores or HTTP calls in Cosmos.
