---
"@effect-app/infra": patch
---

Apply `toCodecJson` in `SQLModel.JsonFromString` so SQL JSON string fields use the proper JSON-safe codec at the encode/decode boundary (aligns with queue, event, and gist call sites).
