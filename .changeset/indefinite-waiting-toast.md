---
"@effect-app/vue": patch
---

In-progress toasts (`withToast` waiting toast and `withDefaultToastStream` waiting/progress toasts) now persist indefinitely (`timeout: Infinity`) until replaced by the success/failure toast or dismissed. Previously they used the underlying toast adapter's default duration and could disappear before the operation finished.
