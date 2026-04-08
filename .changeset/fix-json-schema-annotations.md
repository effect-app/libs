---
"effect-app": patch
---

Fix JSON schema output for Email, Date, PhoneNumber, and Url schemas. The `jsonSchema` annotation key is not recognized by Effect v4's JSON schema generator — use proper v4 annotations (`format`, `description`) and built-in checks (`isMinLength`, `isMaxLength`) instead.
