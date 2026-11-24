import * as Cause from "effect/Cause"
import * as Fiber from "effect/Fiber"
import * as Context from "./Context.ts"
import * as Effect from "./Effect.ts"
import * as Layer from "./Layer.ts"
import type * as Option from "./Option.ts"
import * as S from "./Schema.ts"
import { CurrentToastId, Toast, type ToastId } from "./toast.ts"
import { wrapEffect } from "./utils.ts"
import { WaitingGate } from "./waitingGate.ts"

export interface ToastOptions<A, E, Args extends ReadonlyArray<unknown>, WaiR, SucR, ErrR> {
  stableToastId?: undefined | string | ((...args: Args) => string | undefined)
  timeout?: number
  showSpanInfo?: false
  groupId?: string
  onWaiting:
    | string
    | ((...args: Args) => string | null)
    | null
    | ((...args: Args) => Effect.Effect<string | null, never, WaiR>)
  onSuccess:
    | string
    | ((a: A, ...args: Args) => string | null)
    | null
    | ((a: A, ...args: Args) => Effect.Effect<string | null, never, SucR>)
  onFailure:
    | string
    | ((error: Option.Option<E>, ...args: Args) => string | { level: "warn" | "error"; message: string })
    | ((
        error: Option.Option<E>,
        ...args: Args
      ) => Effect.Effect<string | { level: "warn" | "error"; message: string }, never, ErrR>)
}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
export class WithToast extends Context.Service<WithToast>()("WithToast", {
  make: Effect.gen(function* () {
    const toast = yield* Toast
    return <A, E, Args extends readonly unknown[], R, WaiR = never, SucR = never, ErrR = never>(
      options: ToastOptions<A, E, Args, WaiR, SucR, ErrR>
    ) =>
      Effect.fnUntraced(function* (self: Effect.Effect<A, E, R>, ...args: Args) {
        const baseTimeout = options.timeout ?? 3_000

        const stableToastId =
          typeof options.stableToastId === "function" ? options.stableToastId(...args) : options.stableToastId

        const requestId: string = yield* Effect.currentSpan.pipe(
          Effect.map((span) => span.traceId),
          Effect.orElseSucceed(() => S.StringId.make())
        )
        const groupId = options.groupId
        const meta = { ...(groupId !== undefined ? { groupId } : {}), requestId }

        const t = yield* wrapEffect(options.onWaiting)(...args)
        const toastId: ToastId | undefined =
          t === null ? stableToastId : (stableToastId ?? `wait-${Math.random().toString(36).slice(2)}`)

        const gate = yield* WaitingGate
        let waitingFiber: Fiber.Fiber<void> | undefined
        let toastShown = false
        let unbind = () => {}

        const armWaiting = () =>
          Effect.gen(function* () {
            if (waitingFiber !== undefined || t === null || toastId === undefined) return
            waitingFiber = yield* Effect.forkChild(
              Effect.sleep("1 seconds").pipe(
                Effect.andThen(
                  Effect.uninterruptible(
                    Effect.gen(function* () {
                      toastShown = true
                      yield* toast.info(t, { id: toastId, timeout: Infinity, ...meta })
                    })
                  )
                ),
                Effect.asVoid
              )
            )
          })

        const disarmWaiting = () =>
          Effect.gen(function* () {
            const fiber = waitingFiber
            waitingFiber = undefined
            if (fiber) yield* Fiber.interrupt(fiber)
            if (toastShown && toastId !== undefined) {
              toastShown = false
              yield* toast.dismiss(toastId)
            }
          })

        // An active gate pauses the toast while `suspendWaiting` is parked and
        // starts a fresh one-second delay when work resumes. The inactive
        // default keeps the original fork.
        if (t !== null && gate.active) {
          unbind = gate.bind((depth) => (depth === 0 ? armWaiting() : disarmWaiting()))
          if (gate.depth === 0) yield* armWaiting()
        } else if (t !== null) {
          waitingFiber = yield* Effect.forkChild(
            Effect.sleep("1 seconds").pipe(
              Effect.andThen(toast.info(t, { id: toastId!, timeout: Infinity, ...meta })),
              Effect.asVoid
            )
          )
        }

        const interruptWaiting = Effect.uninterruptible(
          Effect.gen(function* () {
            unbind()
            const fiber = waitingFiber
            waitingFiber = undefined
            if (fiber) yield* Fiber.interrupt(fiber)
          })
        )

        return yield* self.pipe(
          Effect.tap(
            Effect.fnUntraced(function* (a) {
              yield* interruptWaiting
              const t = yield* wrapEffect(options.onSuccess)(a, ...args)
              if (t === null) {
                return
              }
              yield* toast.success(
                t,
                toastId !== undefined
                  ? { id: toastId, timeout: baseTimeout, ...meta }
                  : { timeout: baseTimeout, ...meta }
              )
            })
          ),
          Effect.tapCause(
            Effect.fnUntraced(function* (cause) {
              yield* interruptWaiting
              yield* Effect.logDebug(
                "WithToast - caught error cause: " + Cause.squash(cause),
                Cause.hasInterruptsOnly(cause),
                cause
              )

              if (Cause.hasInterruptsOnly(cause)) {
                if (toastId) yield* toast.dismiss(toastId)
                return
              }

              const spanInfo =
                options.showSpanInfo !== false
                  ? yield* Effect.currentSpan.pipe(
                      Effect.map((span) => `\nTrace: ${span.traceId}\nSpan: ${span.spanId}`),
                      Effect.orElseSucceed(() => "")
                    )
                  : ""

              const t = yield* wrapEffect(options.onFailure)(Cause.findErrorOption(cause), ...args)
              const opts = { timeout: baseTimeout * 2, ...meta }

              if (typeof t === "object") {
                const message = t.message + spanInfo
                return t.level === "warn"
                  ? yield* toast.warning(message, toastId !== undefined ? { ...opts, id: toastId } : opts)
                  : yield* toast.error(message, toastId !== undefined ? { ...opts, id: toastId } : opts)
              }
              yield* toast.error(t + spanInfo, toastId !== undefined ? { ...opts, id: toastId } : opts)
            }, Effect.uninterruptible)
          ),
          toastId !== undefined ? Effect.provideService(CurrentToastId, CurrentToastId.of({ toastId })) : (_) => _
        )
      })
  })
}) {
  static readonly DefaultWithoutDependencies = Layer.effect(this, this.make)
  static readonly Default = this.DefaultWithoutDependencies

  static readonly handle =
    <A, E, Args extends Array<unknown>, R, WaiR = never, SucR = never, ErrR = never>(
      options: ToastOptions<A, E, Args, WaiR, SucR, ErrR>
    ): ((self: Effect.Effect<A, E, R>, ...args: Args) => Effect.Effect<A, E, R | WaiR | SucR | ErrR | WithToast>) =>
    (self, ...args) =>
      this.use((_) => _<A, E, Args, R, WaiR, SucR, ErrR>(options)(self, ...args))
}
