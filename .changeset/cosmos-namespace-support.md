---
"@effect-app/infra": minor
---

Add storage namespace support to CosmosDB adapter via partition key prefixing. When `allowNamespace` is configured, the namespace from `storeId` is prepended to partition key values (e.g., `test-ns::primary`), isolating data per namespace within the same container.
