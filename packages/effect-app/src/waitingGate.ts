import * as Context from "./Context.ts"
import * as Effect from "./Effect.ts"

/**
 * Notified with the suspension depth after each change. `0` means the command
 * is doing work. A positive depth means it is parked on a caller.
 */
export type WaitingGateController = (depth: number) => Effect.Effect<void>

export interface WaitingGateShape {
  /** `false` for the default gate. Suspension then changes nothing. */
  readonly active: boolean
  readonly depth: number
  readonly add: (delta: number) => Effect.Effect<void>
  /** Stack a controller. The returned function restores the previous one. */
  readonly bind: (controller: WaitingGateController) => () => void
}

const inactiveWaitingGate: WaitingGateShape = {
  active: false,
  depth: 0,
  add: () => Effect.void,
  bind: () => () => {}
}

/**
 * Per-command gate for {@link suspendWaiting}. Commands provide an active gate.
 * The default is inactive, so the helper is a no-op outside a command.
 */
export const WaitingGate = Context.Reference<WaitingGateShape>("effect-app/WaitingGate", {
  defaultValue: () => inactiveWaitingGate
})

/** Build the gate one command owns. `onDepth` runs synchronously inside `add`. */
export const makeWaitingGate = (onDepth?: (depth: number) => void): WaitingGateShape => {
  let depth = 0
  let controller: WaitingGateController | undefined
  return {
    active: true,
    get depth() {
      return depth
    },
    add: (delta) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          depth += delta
          if (depth < 0) depth = 0
          const next = depth
          onDepth?.(next)
          if (controller) yield* controller(next)
        })
      ),
    bind: (next) => {
      const previous = controller
      controller = next
      return () => {
        if (controller === next) controller = previous
      }
    }
  }
}

/**
 * Run `self` while command chrome is quiet.
 *
 * The spinner and the waiting toast pause for `self` and resume when it
 * finishes, including when it is interrupted. The command stays blocked for
 * the whole run, so the button cannot start again.
 *
 * Outside a command the default gate is inactive and `self` runs unchanged.
 *
 * ```ts
 * const decision = yield* suspendWaiting(ask(pickupDate))
 * yield* close(orderId)
 * ```
 */
export const suspendWaiting = <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const gate = yield* WaitingGate
      yield* gate.add(1)
      return yield* Effect.ensuring(restore(self), gate.add(-1))
    })
  )
