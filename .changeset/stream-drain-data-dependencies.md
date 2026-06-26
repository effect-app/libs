---
"effect-app": patch
"@effect-app/infra": patch
---

Stream RPC: drain read/write data-dependencies per emitted value chunk instead of sending the
cumulative set on every metadata chunk. Each metadata chunk now carries only the delta recorded
since the last chunk, the bucket is cleared for the next segment, and the terminal "done"/"error"
chunks drain the remainder. The emit condition also broadens to include non-empty reads, so stream
queries forward their read-dependencies mid-stream too. The client already accumulates deltas into
its per-call recorder, so no FE change is required.
