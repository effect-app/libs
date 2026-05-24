import { Console } from "effect"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import * as Option from "effect-app/Option"
import { NonEmptyString255 } from "effect-app/Schema"
import * as Tracer from "effect/Tracer"
import { SqlClient } from "effect/unstable/sql"
import { LocaleRef, RequestContext, spanAttributes } from "../RequestContext.js"
import { ContextMapContainer } from "../Store/ContextMapContainer.js"
import { storeId } from "../Store/Memory.js"

const withSqlTransaction = <R, E, A>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.serviceOption(SqlClient.SqlClient).pipe(
    Effect.flatMap(Option.match({
      onNone: () => self,
      onSome: (sql) => sql.withTransaction(self).pipe(Effect.orDie)
    }))
  )

export const getRequestContext = Effect
  .all({
    span: Effect.currentSpan.pipe(Effect.orDie),
    locale: LocaleRef,
    namespace: storeId
  })
  .pipe(
    Effect.map(({ locale, namespace, span }) =>
      RequestContext.make({
        span: Tracer.externalSpan(span),
        locale,
        namespace,
        name: NonEmptyString255(span.name)
      })
    )
  )

export const getRC = Effect.all({
  locale: LocaleRef,
  namespace: storeId
})

const withRequestSpan = (name = "request", options?: Tracer.SpanOptions) => <R, E, A>(f: Effect.Effect<A, E, R>) =>
  Effect.andThen(
    getRC,
    (ctx) =>
      f.pipe(
        Effect.withSpan(name, {
          ...options,
          attributes: { ...spanAttributes({ ...ctx, name: NonEmptyString255(name) }), ...options?.attributes }
        }, {
          captureStackTrace: options?.captureStackTrace ?? false
        }),
        // TODO: false
        // request context info is picked up directly in the logger for annotations.
        Effect.withLogSpan(name)
      )
  )

export interface SetupRequestOptions {
  readonly withTransaction?: boolean
}

// Build `layer` against the ambient (request) scope rather than a sub-scope of the
// returned Effect. Required when the returned value is a streaming HttpServerResponse:
// the response body keeps producing chunks (and using layer-provided state) after the
// Effect returns, so a sub-scope would close too early and run finalizers mid-stream.
export const provideOnRequestScope =
  <ROut, E2, RIn>(layer: Layer.Layer<ROut, E2, RIn>) => <A, E, R>(self: Effect.Effect<A, E, R>) =>
    Effect.gen(function*() {
      const requestScope = yield* Effect.scope
      // Fresh MemoMap per request: `Layer.buildWithScope` would otherwise reuse
      // the ambient MemoMap living on the HTTP server fiber, sharing the built
      // value (e.g. ContextMap) across every request handled by that server.
      const memoMap = yield* Layer.makeMemoMap
      const ctx = yield* Layer.buildWithMemoMap(layer, memoMap, requestScope)
      yield* Effect.addFinalizer(() => Console.log("request scope finalized"))
      return yield* Effect.provide(self, ctx)
    })

export const setupRequestContextFromCurrent =
  (name = "request", options?: Tracer.SpanOptions & SetupRequestOptions) => <R, E, A>(self: Effect.Effect<A, E, R>) =>
    self
      .pipe(
        options?.withTransaction === true ? withSqlTransaction : (_) => _,
        withRequestSpan(name, options),
        Effect.provide(ContextMapContainer.layer, { local: true })
      )

// Streaming variant: binds ContextMapContainer to the ambient (request) scope so its
// finalizer (clear()) runs only after the response body is fully drained, not when the
// outer Effect returns its HttpServerResponse value. Use for handlers that return a
// streaming HttpServerResponse (e.g. SSE) — see RequestContextMiddleware for context.
export const setupStreamingRequestContextFromCurrent =
  (name = "request", options?: Tracer.SpanOptions & SetupRequestOptions) => <R, E, A>(self: Effect.Effect<A, E, R>) =>
    self.pipe(
      options?.withTransaction === true ? withSqlTransaction : (_) => _,
      withRequestSpan(name, options),
      provideOnRequestScope(ContextMapContainer.layer)
    )

// TODO: consider integrating Effect.withParentSpan
export function setupRequestContext<R, E, A>(
  self: Effect.Effect<A, E, R>,
  requestContext: RequestContext,
  options?: SetupRequestOptions
) {
  const layer = Layer.mergeAll(
    ContextMapContainer.layer,
    Layer.succeed(LocaleRef, requestContext.locale),
    Layer.succeed(storeId, requestContext.namespace)
  )
  return self
    .pipe(
      options?.withTransaction === true ? withSqlTransaction : (_) => _,
      withRequestSpan(requestContext.name),
      Effect.provide(layer, { local: true })
    )
}

export function setupRequestContextWithCustomSpan<R, E, A>(
  self: Effect.Effect<A, E, R>,
  requestContext: RequestContext,
  name: string,
  options?: Tracer.SpanOptions & SetupRequestOptions
) {
  const layer = Layer.mergeAll(
    ContextMapContainer.layer,
    Layer.succeed(LocaleRef, requestContext.locale),
    Layer.succeed(storeId, requestContext.namespace)
  )
  return self
    .pipe(
      options?.withTransaction === true ? withSqlTransaction : (_) => _,
      withRequestSpan(name, options),
      Effect.provide(layer, { local: true })
    )
}
