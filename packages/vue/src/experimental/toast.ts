import { Context } from "effect-app"

export type ToastId = string | number
export type ToastOpts = { id?: ToastId; timeout?: number }

export type UseToast = () => {
  error: (message: string, options?: ToastOpts) => ToastId
  warning: (message: string, options?: ToastOpts) => ToastId
  success: (message: string, options?: ToastOpts) => ToastId
  info: (message: string, options?: ToastOpts) => ToastId
  dismiss: (id: ToastId) => void
}

export class Toast extends Context.TagId("Toast")<Toast, ReturnType<UseToast>>() {}
