<template>
  <div>test</div>
</template>
<script setup lang="ts">
import * as api from "@opentelemetry/api"
import { Effect, Option } from "effect-app"

const spanName = (span: any | undefined) => span?.name

const fn = Effect.fn(
  function*() {
    yield* Effect.promise(() =>
      new Promise<void>((res) =>
        setTimeout(() => {
          const activeSpan = api.trace.getActiveSpan()
          console.log(
            "effect promise",
            spanName(activeSpan),
            spanName(activeSpan) === "Effect Test"
          )
          res()
        }, 10)
      )
    )
  },
  Effect.withSpan("Effect Test")
)

await runtime.runPromise(fn()).catch(console.error)

const tracer = api.trace.getTracer("Magic", "0.0.1")
const fn2 = async () => {
  // const span = tracer.startSpan("Promise Test", {}, api.context.active())
  // const ctx = api.trace.setSpan(api.context.active(), span)

  // const webTracerWithZone = providerWithZone.getTracer("default")
  const span = tracer.startSpan("[promise] foo1")
  const ctx = api.trace.setSpan(api.context.active(), span)

  api
    .context
    .with(ctx, async () => {
      console.log("[promise] active span011", spanName(api.trace.getSpan(ctx)))
      console.log("[promise] active span0", spanName(api.trace.getActiveSpan()))

      await runtime.runPromise(
        Effect
          .gen(function*() {
            console.log(
              "[promise] active span1",
              spanName(api.trace.getActiveSpan())
            )
          })
          .pipe(Effect.flatMap(() =>
            Effect
              .gen(function*() {
                console.log(
                  "[promise] active span2",
                  spanName(api.trace.getActiveSpan())
                )
                const ps = yield* Effect.currentParentSpan.pipe(
                  Effect.option,
                  Effect.map(Option.getOrUndefined)
                )
                // console.log("promise effect, parent", ps)
                const sp = yield* Effect.currentSpan.pipe(
                  Effect.option,
                  Effect.map(Option.getOrUndefined)
                )
                console.log(
                  "[promise] effect, span",
                  sp?.name,
                  !!sp?.parent,
                  sp?.parent.value?.spanId === span.spanContext().spanId
                  // spanName(sp?.parent),
                  // spanName(sp?.parent) === "[promise] foo1"
                )
              })
              .pipe(Effect.withSpan("[promise] Effect Test"))
          ))
      )
    })
    .finally(() => span.end())
}
await fn2().catch(console.error)
</script>
