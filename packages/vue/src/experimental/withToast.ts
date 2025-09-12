import { Cause, Effect, type Option } from "effect-app"
import { wrapEffect } from "effect-app/utils"
import { CurrentToastId, Toast } from "./toast.js"

export interface ToastOptions<A, E, Args extends ReadonlyArray<unknown>, WaiR, SucR, ErrR> {
  timeout?: number
  onWaiting:
    | string
    | ((...args: Args) => string | null)
    | null
    | ((
      ...args: Args
    ) => Effect.Effect<string | null, never, WaiR>)
  onSuccess:
    | string
    | ((a: A, ...args: Args) => string | null)
    | null
    | ((
      a: A,
      ...args: Args
    ) => Effect.Effect<string | null, never, SucR>)
  onFailure:
    | string
    | ((
      error: Option.Option<E>,
      ...args: Args
    ) => string | { level: "warn" | "error"; message: string })
    | ((
      error: Option.Option<E>,
      ...args: Args
    ) => Effect.Effect<string | { level: "warn" | "error"; message: string }, never, ErrR>)
}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
export class WithToast extends Effect.Service<WithToast>()("WithToast", {
  effect: Effect.gen(function*() {
    const toast = yield* Toast
    return <A, E, Args extends Array<unknown>, R, WaiR = never, SucR = never, ErrR = never>(
      options: ToastOptions<A, E, Args, WaiR, SucR, ErrR>
    ) =>
      Effect.fnUntraced(function*(self: Effect.Effect<A, E, R>, ...args: Args) {
        const baseTimeout = options.timeout ?? 3_000

        const t = yield* wrapEffect(options.onWaiting)(...args)
        const toastId = t === null ? undefined : yield* toast.info(
          t // TODO: timeout forever?
        )
        return yield* self.pipe(
          Effect.tap(Effect.fnUntraced(function*(a) {
            const t = yield* wrapEffect(options.onSuccess)(a, ...args)
            if (t === null) {
              return
            }
            yield* toast.success(
              t,
              toastId !== undefined ? { id: toastId, timeout: baseTimeout } : { timeout: baseTimeout }
            )
          })),
          Effect.tapErrorCause(Effect.fnUntraced(function*(cause) {
            yield* Effect.logDebug(
              "WithToast - caught error cause: " + Cause.squash(cause),
              Cause.isInterruptedOnly(cause),
              cause
            )

            if (Cause.isInterruptedOnly(cause)) {
              if (toastId) yield* toast.dismiss(toastId)
              return
            }

            const t = yield* wrapEffect(options.onFailure)(Cause.failureOption(cause), ...args)
            const opts = { timeout: baseTimeout * 2 }

            if (typeof t === "object") {
              return t.level === "warn"
                ? yield* toast.warning(t.message, toastId !== undefined ? { ...opts, id: toastId } : opts)
                : yield* toast.error(t.message, toastId !== undefined ? { ...opts, id: toastId } : opts)
            }
            yield* toast.error(t, toastId !== undefined ? { ...opts, id: toastId } : opts)
          }, Effect.uninterruptible)),
          toastId !== undefined ? Effect.provideService(CurrentToastId, CurrentToastId.of({ toastId })) : (_) => _
        )
      })
  })
}) {
  static readonly handle = <A, E, Args extends Array<unknown>, R, WaiR = never, SucR = never, ErrR = never>(
    options: ToastOptions<A, E, Args, WaiR, SucR, ErrR>
  ): (self: Effect.Effect<A, E, R>, ...args: Args) => Effect.Effect<A, E, R | WaiR | SucR | ErrR | WithToast> =>
  (self, ...args) => this.use((_) => _<A, E, Args, R, WaiR, SucR, ErrR>(options)(self, ...args))
}
