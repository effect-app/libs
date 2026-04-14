---
"@effect-app/infra": patch
---

fix SQL whereEvery double-negation bug causing wrong query when operators like notIn are used (especially with empty arrays)
