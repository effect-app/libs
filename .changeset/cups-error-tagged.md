---
"@effect-app/infra": patch
---

Wrap `CUPS` exec failures in tagged `CUPSError` instead of `UnknownException`.

Retains `command`, `message`, exit `code`, `signal`, `killed`, `stdout`,
`stderr`, and original `cause` from the underlying `child_process.exec`
rejection so callers can branch on real failure detail.
