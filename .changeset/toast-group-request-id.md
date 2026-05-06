---
"@effect-app/vue": minor
---

Add optional `groupId` and `requestId` to toast options.

- `ToastOpts` / `ToastOptsInternal` now accept `groupId?: string` and `requestId?: string`; values pass through the toast wrapper unchanged.
- `WithToast` / `withToast` accept `groupId` and auto-derive `requestId` once per invocation (current Effect span `traceId`, fallback `S.StringId.make()`); both are attached to every emitted toast (waiting/success/warning/error).
- `Command.withDefaultToast` and `Command.withDefaultToastStream` set `groupId: cc.id` automatically; the stream variant also computes `requestId` once and threads it through progress, success, and failure toasts.
