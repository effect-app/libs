---
"effect-app": minor
"@effect-app/infra": minor
---

Store document decode fails as a typed `SchemaError` instead of a defect; repositories keep their public error channels by dying at the boundary; `validateSample` reports documents that fail at the store boundary.
