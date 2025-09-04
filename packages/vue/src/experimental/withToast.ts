import { Cause, Effect, type Option } from "effect-app"
import { Toast } from "./toast.js"

export interface ToastOptions<A, E, Args extends ReadonlyArray<unknown>> {
  onWaiting: string | ((...args: Args) => string)
  onSuccess: string | ((a: A, ...args: Args) => string)
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
        const toastId = toast.info(
          // .loading
          typeof options.onWaiting === "string"
            ? options.onWaiting
            : options.onWaiting(...args)
        )
        return yield* self.pipe(
          Effect.tap((a) => {
            toast.success(
              typeof options.onSuccess === "string"
                ? options.onSuccess
                : options.onSuccess(a, ...args),
              { id: toastId, timeout: 3_000 }
            )
          }),
          Effect.tapErrorCause((cause) =>
            Effect.sync(() => {
              if (Cause.isInterruptedOnly(cause)) {
                toast.dismiss(toastId)
                return
              }
              const t = typeof options.onFailure === "string"
                ? options.onFailure
                : options.onFailure(Cause.failureOption(cause), ...args)
              if (typeof t === "object") {
                return t.level === "warn"
                  ? toast.warning(t.message, { id: toastId, timeout: 5_000 })
                  : toast.error(t.message, { id: toastId, timeout: 5_000 })
              }
              toast.error(t, { id: toastId, timeout: 5_000 })
            })
          )
        )
      })
  })
}) {}
