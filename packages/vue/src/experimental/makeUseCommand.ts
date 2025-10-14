import { Effect } from "effect-app"
import { Commander2, type CommanderImpl, CommanderStatic } from "./commander2.js"

type X<X> = X

// helps retain JSDoc
export interface CommanderResolved<RT>
  extends X<typeof CommanderStatic>, Pick<CommanderImpl<RT>, "fn" | "wrap" | "alt" | "alt2">
{
}

export const makeUseCommand = Effect.fnUntraced(function*<R = never>() {
  const cmndr = yield* Commander2
  const runtime = yield* Effect.runtime<R>()

  const comm = cmndr(runtime)

  const command = {
    ...comm,
    ...CommanderStatic
  }

  return command as CommanderResolved<R>
})
