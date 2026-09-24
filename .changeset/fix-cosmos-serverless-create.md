---
"@effect-app/infra": patch
---

Create missing Cosmos containers without throughput when the account is serverless (offer read/replace returns 400). Provisioned databases still get autoscale when configured.
