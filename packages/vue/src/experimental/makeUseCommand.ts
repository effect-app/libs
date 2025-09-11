import { Effect } from "effect-app"
import { Commander } from "./commander.js"

export const makeUseCommand = Effect.fnUntraced(function*<R = never>() {
  const cmndr = yield* Commander
  const runtime = yield* Effect.runtime<R>()

  return { ...cmndr, alt: cmndr.alt(runtime), fn: cmndr.fn(runtime), wrap: cmndr.wrap(runtime) }
})
