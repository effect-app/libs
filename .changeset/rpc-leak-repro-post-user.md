---
"@effect-app/infra": patch
---

Extend RPC ContextMap streaming coverage with a Post/User leak-repro scenario using `withRequestResolverCache`, 100 posts with relational user references, and 100 repeated requests under a deliberately leaky request context setup.
