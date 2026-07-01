import { defaultRegistry, registryKey } from "@effect/atom-vue"
import type { RequestHandlerWithInput } from "effect-app/client/clientFor"
import * as Effect from "effect-app/Effect"
import * as Option from "effect-app/Option"
import type * as Cause from "effect/Cause"
import * as Layer from "effect/Layer"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { createApp, nextTick } from "vue"
import { buildQueryFamily, makeAtomClientRuntime } from "../src/atomQuery.js"
import { useAtomQuery } from "../src/query.js"

const fakeHandler = <A, E>(
  id: string,
  run: (input: void) => Effect.Effect<A, E, never>
): RequestHandlerWithInput<void, A, E, never, never, string> => ({
  id,
  handler: run,
  Request: undefined as never
})

const querySpanParentName = Effect.currentSpan.pipe(
  Effect.map((span) =>
    Option.match(span.parent, {
      onNone: () => "none",
      onSome: (parent) => parent._tag === "Span" ? parent.name : "external"
    })
  )
)

it("passes the current parent span through atom query refetch", async () => {
  defaultRegistry.reset()
  const rt = makeAtomClientRuntime(() => Layer.empty, Layer.makeMemoMapUnsafe())
  const family = buildQueryFamily(rt, fakeHandler("Test/AtomSpan", () => querySpanParentName))
  const atom = family(undefined)
  let view!: ReturnType<typeof useAtomQuery<string, Cause.NoSuchElementError>>
  const host = document.createElement("div")
  const app = createApp({
    setup() {
      view = useAtomQuery(() => atom)
      return () => null
    }
  })
  app.provide(registryKey, defaultRegistry)
  app.mount(host)

  await Effect.runPromise(view.awaitResult())
  const parentName = await Effect.runPromise(view.refetch().pipe(Effect.withSpan("trigger")))

  expect(parentName).toBe("trigger")
  expect(AsyncResult.isSuccess(view.result.value)).toBe(true)

  app.unmount()
  await nextTick()
  defaultRegistry.reset()
})
