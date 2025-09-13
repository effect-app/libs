import { Effect } from "effect-app"
import { Commander, CommanderStatic } from "./commander.js"

export const makeUseCommand = Effect.fnUntraced(function*<R = never>() {
  const cmndr = yield* Commander
  const runtime = yield* Effect.runtime<R>()

  return {
    ...cmndr,
    alt: cmndr.alt(runtime),
    fn: cmndr.fn(runtime),
    wrap: cmndr.wrap(runtime),
    alt2: cmndr.alt2(runtime),
    ...CommanderStatic
  }
})
