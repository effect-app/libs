import { Effect, type Layer } from "effect-app"
import { Commander, type CommanderImpl, CommanderStatic } from "./commander.js"

type X<X> = X

// helps retain JSDoc
export interface CommanderResolved<RT, RTHooks>
  extends X<typeof CommanderStatic>, Pick<CommanderImpl<RT, RTHooks>, "fn" | "wrap" | "alt" | "alt2">
{
}

export const makeUseCommand = Effect.fnUntraced(
  function*<R = never, RTHooks = never>(rtHooks: Layer.Layer<RTHooks, never, R>) {
    const cmndr = yield* Commander
    const runtime = yield* Effect.runtime<R>()

    const comm = cmndr(runtime, rtHooks)

    const command = {
      ...comm,
      ...CommanderStatic
    }

    return command as CommanderResolved<R, RTHooks>
  }
)
