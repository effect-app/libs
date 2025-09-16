import { Effect } from "effect-app"
import { Commander, type CommanderImpl, CommanderStatic } from "./commander.js"

type X<X> = X

// helps retain JSDoc
export interface CommanderResolved<RT> extends X<typeof CommanderStatic>, CommanderImpl<RT> {
}

export const makeUseCommand = Effect.fnUntraced(function*<R = never>() {
  const cmndr = yield* Commander
  const runtime = yield* Effect.runtime<R>()

  const comm = cmndr(runtime)

  const command = {
    ...comm,
    ...CommanderStatic
  }

  return command as CommanderResolved<R>
})
