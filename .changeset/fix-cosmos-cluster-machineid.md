---
"@effect-app/infra": patch
---

Fix machine-id allocation in the Cosmos cluster `RunnerStorage`. It derived the machine id from a 31-multiplier string hash of the runner address, so two distinct runners could hash to the same value mod 1024 — and since the machine id feeds the Snowflake generator mod 1024, those runners would emit colliding Snowflake ids (corrupting request/reply identity across the cluster).

Machine ids are now allocated from a single counter document via an atomic server-side `incr`, mirroring SQL's auto-increment `machine_id` primary key: unique across distinct runners and stable per address (a re-registering runner reuses its persisted id). Verified against a live Cosmos account.
