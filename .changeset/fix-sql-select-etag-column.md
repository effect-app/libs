---
"@effect-app/infra": patch
---

Fix SQL select queries to read `_etag` from column instead of JSON data, preventing INSERT on update.
