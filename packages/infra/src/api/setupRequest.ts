import { Effect, Layer, Tracer } from "effect-app"
import { NonEmptyString255 } from "effect-app/Schema"
import { LocaleRef, RequestContext, spanAttributes } from "../RequestContext.js"
import { ContextMapContainer } from "../Store/ContextMapContainer.js"
import { storeId } from "../Store/Memory.js"

export const getRequestContext = Effect
  .all({
    span: Effect.currentSpan.pipe(Effect.orDie),
    locale: LocaleRef,
    namespace: storeId
  })
  .pipe(
    Effect.map(({ locale, namespace, span }) =>
      new RequestContext({
        span: Tracer.externalSpan(span),
        locale,
        namespace,
        // TODO: get through span context, or don't care at all.
        name: NonEmptyString255("_root_")
      })
    )
  )

export const getRC = Effect.all({
  locale: LocaleRef,
  namespace: storeId
})

const withRequestSpan = (name = "request", options?: Tracer.SpanOptions) => <R, E, A>(f: Effect<A, E, R>) =>
  Effect.andThen(
    getRC,
    (ctx) =>
      f.pipe(
        Effect.withSpan(name, {
          ...options,
          attributes: { ...spanAttributes({ ...ctx, name: NonEmptyString255(name) }), ...options?.attributes },
          captureStackTrace: false
        }),
        // TODO: false
        // request context info is picked up directly in the logger for annotations.
        Effect.withLogSpan(name)
      )
  )

export const setupRequestContextFromCurrent =
  (name = "request", options?: Tracer.SpanOptions) => <R, E, A>(self: Effect<A, E, R>) =>
    self
      .pipe(
        withRequestSpan(name, options),
        Effect.provide(ContextMapContainer.layer)
      )

// TODO: consider integrating Effect.withParentSpan
export function setupRequestContext<R, E, A>(self: Effect<A, E, R>, requestContext: RequestContext) {
  const layer = ContextMapContainer.layer.pipe(
    Layer.provide([
      Layer.succeed(LocaleRef, requestContext.locale),
      Layer.succeed(storeId, requestContext.namespace)
    ])
  )
  return self
    .pipe(
      withRequestSpan(requestContext.name),
      Effect.provide(layer)
    )
}
