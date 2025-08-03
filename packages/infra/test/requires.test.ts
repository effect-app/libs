import { Effect } from "effect-app"
import { Middleware } from "../src/api/routing.js"
import { SomeService } from "./query.test.js"
import { makeNewMiddleware } from "./requires.js"

export class SomeMiddleware extends Middleware.Tag<SomeMiddleware>()("SomeMiddleware", {
  provides: SomeService,
  wrap: true
})({
  effect: Effect.gen(function*() {
    // yield* Effect.context<"test-dep">()
    return ({ next }) =>
      Effect.gen(function*() {
        // yield* Effect.context<"test-dep2">()
        return yield* next.pipe(Effect.provideService(SomeService, null as any))
      })
  })
}) {
}

export class RequiresSomeMiddleware extends Middleware.Tag<RequiresSomeMiddleware>()("RequiresSomeMiddleware", {
  requires: SomeService,
  wrap: true
})({
  effect: Effect.gen(function*() {
    // yield* Effect.context<"test-dep">()
    return ({ next }) =>
      Effect.gen(function*() {
        yield* SomeService
        // yield* Effect.context<"test-dep2">()
        return yield* next
      })
  })
}) {
}

export const middleware3 = makeNewMiddleware<{}>()()
  .middleware(RequiresSomeMiddleware)
  .middleware(SomeMiddleware)
