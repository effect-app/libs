---
"effect-app": patch
"@effect-app/infra": patch
---

Fix `TaggedRequest` no-config error type inference so requests without a third argument infer the same default error schema as requests with explicit success config.
