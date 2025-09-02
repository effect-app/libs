import { Cause, Effect, type Option } from "effect-app"

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

export type ToastId = string | number
export type ToastOpts = { id?: ToastId; timeout?: number }

export type UseToast = () => {
  error: (message: string, options?: ToastOpts) => ToastId
  warning: (message: string, options?: ToastOpts) => ToastId
  success: (message: string, options?: ToastOpts) => ToastId
  info: (message: string, options?: ToastOpts) => ToastId
  dismiss: (id: ToastId) => void
}

export const makeUseWithToast = (useToast: UseToast) => () => {
  const toast = useToast()
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
}
