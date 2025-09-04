import { Cause, Effect, type Option } from "effect-app"
import { CurrentToastId, Toast } from "./toast.js"

export interface ToastOptions<A, E, Args extends ReadonlyArray<unknown>> {
  timeout?: number
  onWaiting: string | ((...args: Args) => string) | null
  onSuccess: string | ((a: A, ...args: Args) => string) | null
  onFailure:
    | string
    | ((
      error: Option.Option<E>,
      ...args: Args
    ) => string | { level: "warn" | "error"; message: string })
}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
export class WithToast extends Effect.Service<WithToast>()("WithToast", {
  effect: Effect.gen(function*() {
    const toast = yield* Toast
    return <A, E, Args extends ReadonlyArray<unknown>, R>(
      options: ToastOptions<A, E, Args>
    ) =>
      Effect.fnUntraced(function*(self: Effect.Effect<A, E, R>, ...args: Args) {
        const baseTimeout = options.timeout ?? 3_000
        const toastId = options.onWaiting === null ? undefined : yield* toast.info(
          // .loading
          typeof options.onWaiting === "string"
            ? options.onWaiting
            : options.onWaiting(...args)
          // TODO: timeout forever?
        )
        return yield* self.pipe(
          Effect.tap((a) =>
            options.onSuccess === null ? Effect.void : toast.success(
              typeof options.onSuccess === "string"
                ? options.onSuccess
                : options.onSuccess(a, ...args),
              { id: toastId, timeout: baseTimeout }
            )
          ),
          Effect.tapErrorCause(Effect.fnUntraced(function*(cause) {
            if (Cause.isInterruptedOnly(cause)) {
              if (toastId) yield* toast.dismiss(toastId)
              return
            }
            const t = typeof options.onFailure === "string"
              ? options.onFailure
              : options.onFailure(Cause.failureOption(cause), ...args)
            if (typeof t === "object") {
              return t.level === "warn"
                ? yield* toast.warning(t.message, { id: toastId, timeout: baseTimeout * 2 })
                : yield* toast.error(t.message, { id: toastId, timeout: baseTimeout * 2 })
            }
            yield* toast.error(t, { id: toastId, timeout: baseTimeout * 2 })
          })),
          toastId ? Effect.provideService(CurrentToastId, CurrentToastId.of({ toastId })) : (_) => _
        )
      })
  })
}) {}
