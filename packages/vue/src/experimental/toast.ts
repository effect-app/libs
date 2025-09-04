import { Context, Effect, Option } from "effect-app"

export type ToastId = string | number
export type ToastOpts = { id?: ToastId | undefined | null; timeout?: number }

export type UseToast = () => {
  error: (this: void, message: string, options?: ToastOpts) => ToastId
  warning: (this: void, message: string, options?: ToastOpts) => ToastId
  success: (this: void, message: string, options?: ToastOpts) => ToastId
  info: (this: void, message: string, options?: ToastOpts) => ToastId
  dismiss: (this: void, id: ToastId) => void
}

export class CurrentToastId extends Context.TagId("CurrentToastId")<CurrentToastId, { toastId: ToastId }>() {}

/** fallback to CurrentToastId when available unless id is explicitly set to a value or null */
export const wrap = (toast: ReturnType<UseToast>) => {
  const wrap = (toastHandler: (message: string, options?: ToastOpts) => ToastId) => {
    return (message: string, options?: ToastOpts) =>
      Effect.serviceOption(CurrentToastId).pipe(
        Effect.map((currentToast) =>
          toastHandler(message, {
            ...options,
            id: options?.id !== undefined
              ? options.id
              : Option.getOrUndefined(Option.map(currentToast, (_) => _.toastId))
          })
        )
      )
  }
  return {
    error: wrap(toast.error),
    info: wrap(toast.info),
    success: wrap(toast.success),
    warning: wrap(toast.warning),
    dismiss: (toastId: ToastId) => Effect.sync(() => toast.dismiss(toastId))
  }
}

export class Toast extends Context.TagId("Toast")<Toast, ReturnType<typeof wrap>>() {
}
