/* eslint-disable @typescript-eslint/no-explicit-any */
import { type InvalidateOptions, type InvalidateQueryFilters, isCancelledError, type QueryObserverResult, type RefetchOptions, type UseQueryReturnType } from "@tanstack/vue-query"
import { camelCase } from "change-case"
import { type Context, Effect, Exit, Hash, type Layer, type ManagedRuntime, S, Struct } from "effect-app"
import { type ApiClientFactory, type Req } from "effect-app/client"
import type { ExtractModuleName, RequestHandler, RequestHandlers, RequestHandlerWithInput, RequestInputFromMake, RequestsAny, RequestStreamHandler, RequestStreamHandlerWithInput } from "effect-app/client/clientFor"
import type { InvalidationCallback } from "effect-app/client/makeClient"
import type * as ExitResult from "effect/Exit"
import { type Fiber } from "effect/Fiber"
import * as Stream from "effect/Stream"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { computed, type ComputedRef, onBeforeUnmount, ref, type WatchSource } from "vue"
import { type Commander, CommanderStatic, type Progress } from "./commander.js"
import { type I18n } from "./intl.js"
import { type CommanderResolved, makeUseCommand } from "./makeUseCommand.js"
import { makeMutation, makeStreamMutation, makeStreamMutation2, type MutationOptionsBase, useMakeMutation } from "./mutate.js"
import { type CustomUndefinedInitialQueryOptions, makeQuery, makeStreamQuery } from "./query.js"
import { makeRunPromise } from "./runtime.js"
import { type Toast } from "./toast.js"

export type { Progress }

const mapHandler = <A, E, R, I = void, A2 = A, E2 = E, R2 = R>(
  handler: Effect.Effect<A, E, R> | ((i: I) => Effect.Effect<A, E, R>),
  map: (self: Effect.Effect<A, E, R>, i: I) => Effect.Effect<A2, E2, R2>
) => Effect.isEffect(handler) ? map(handler, undefined as any) : (i: I) => map(handler(i), i)

// TODO: optimize - work from encoded shape directly
const projectHandler = (
  handler: Effect.Effect<any, any, any> | ((i: any) => Effect.Effect<any, any, any>),
  successSchema: S.Top,
  projectionSchema: S.Top
) => {
  const encode = S.encodeEffect(successSchema)
  const decode = S.decodeEffectConcurrently(projectionSchema)
  return mapHandler(handler, (self) =>
    self.pipe(
      Effect.flatMap(encode),
      Effect.flatMap(decode)
    ))
}

const projectionSchemaHash = (schema: S.Top) => String(Hash.hash(schema.ast))

export interface CommandRequestExtensions<RT, Id extends string, I, A, E, R> {
  /** Defines a Command based on this call, taking the `id` of the call as the `id` of the Command.
   * The Request function will be taken as the first member of the Command, the Command required input will be the Request input.
   * see Command.wrap for details */
  wrap: Commander.CommanderWrap<RT, Id, Id, undefined, I, A, E, R>
  /** Defines a Command based on this call, taking the `id` of the call as the `id` of the Command.
   * see Command.fn for details */
  fn: Commander.CommanderFn<RT, Id, Id, undefined>
}

/** my other doc */
export interface RequestExtWithInput<
  RT,
  Id extends string,
  I,
  A,
  E,
  R
> extends Commander.CommandContextLocal<Id, Id>, CommandRequestExtensions<RT, Id, I, A, E, R> {
  /**
   * Send the request to the endpoint and return the raw Effect response.
   * This does not perform query cache invalidation.
   */
  request: (i: I) => Effect.Effect<A, E, R>
}

export interface RequestExt<
  RT,
  Id extends string,
  A,
  E,
  R
> extends
  Commander.CommandContextLocal<Id, Id>,
  Commander.CommanderWrap<RT, Id, Id, undefined, void, A, E, R>,
  CommandRequestExtensions<RT, Id, void, A, E, R>
{
  /**
   * Send the request to the endpoint and return the raw Effect response.
   * This does not perform query cache invalidation.
   */
  request: Effect.Effect<A, E, R>
}

export type CommandRequestWithExtensions<RT, Req> = Req extends
  RequestHandlerWithInput<infer I, infer A, infer E, infer R, infer _Request, infer Id>
  ? RequestExtWithInput<RT, Id, I, A, E, R>
  : Req extends RequestHandler<infer A, infer E, infer R, infer _Request, infer Id> ? RequestExt<RT, Id, A, E, R>
  : never

export interface QueryExtensionsWithInput<I, A, E, R> {
  /**
   * Send the request to the endpoint and return the raw Effect response.
   * This does not set up query state tracking.
   */
  request: (i: I) => Effect.Effect<A, E, R>
}

export interface QueryExtensions<A, E, R> {
  /**
   * Send the request to the endpoint and return the raw Effect response.
   * This does not set up query state tracking.
   */
  request: Effect.Effect<A, E, R>
}

export type QueryRequestWithExtensions<Req> = Req extends
  RequestHandlerWithInput<infer I, infer A, infer E, infer R, infer _Request, infer _Id>
  ? QueryExtensionsWithInput<I, A, E, R>
  : Req extends RequestHandler<infer A, infer E, infer R, infer _Request, infer _Id> ? QueryExtensions<A, E, R>
  : never

type QueryHandler<Req> = Req extends
  RequestHandlerWithInput<infer I, infer A, infer E, infer R, infer Request, infer Id>
  ? Request["type"] extends "query" ? RequestHandlerWithInput<I, A, E, R, Request, Id> : never
  : Req extends RequestHandler<infer A, infer E, infer R, infer Request, infer Id>
    ? Request["type"] extends "query" ? RequestHandler<A, E, R, Request, Id> : never
  : never

type CommandHandler<Req> = Req extends
  RequestHandlerWithInput<infer I, infer A, infer E, infer R, infer Request, infer Id>
  ? Request["type"] extends "command" ? RequestHandlerWithInput<I, A, E, R, Request, Id> : never
  : Req extends RequestHandler<infer A, infer E, infer R, infer Request, infer Id>
    ? Request["type"] extends "command" ? RequestHandler<A, E, R, Request, Id> : never
  : never

type StreamHandler<Req> = Req extends
  RequestStreamHandlerWithInput<infer I, infer A, infer E, infer R, infer Request, infer Id, infer Final>
  ? Request["type"] extends "stream" ? RequestStreamHandlerWithInput<I, A, E, R, Request, Id, Final> : never
  : Req extends RequestStreamHandler<infer A, infer E, infer R, infer Request, infer Id, infer Final>
    ? Request["type"] extends "stream" ? RequestStreamHandler<A, E, R, Request, Id, Final> : never
  : never

export interface MutationExtensions<RT, Id extends string, I, A, E, R> {
  /** Defines a Command based on this mutation, taking the `id` of the mutation as the `id` of the Command.
   * The Mutation function will be taken as the first member of the Command, the Command required input will be the Mutation input.
   * see Command.wrap for details */
  wrap: Commander.CommanderWrap<RT, Id, Id, undefined, I, A, E, R>
}

/** my other doc */
export interface MutationExtWithInput<
  RT,
  Id extends string,
  I,
  A,
  E,
  R,
  EA = unknown
> extends MutationExtensions<RT, Id, I, A, E, R> {
  /**
   * Send the request to the endpoint and return the raw Effect response.
   * Also invalidates query caches using the request namespace by default.
   * Namespace invalidation targets parent namespace keys
   * (for example `$project/$configuration.get` invalidates `$project`).
   * Override invalidation in client options via `queryInvalidation`.
   *
   * Pass `options` to attach a `select` Effect that runs after the mutation
   * succeeds (its output is returned to the caller) and/or override the default
   * `queryInvalidation`.
   */
  <B = A, E2 = never, R2 = never>(
    input: I,
    options?: MutationOptionsBase<A, B, E2, R2>
  ): Effect.Effect<B, E | E2, R | R2>

  project: <ProjSchema extends S.Top>(
    schema: EA extends ProjSchema["Encoded"] ? ProjSchema : never
  ) => MutationExtWithInput<
    RT,
    Id,
    I,
    S.Schema.Type<ProjSchema>,
    E | S.SchemaError,
    R | S.Codec.DecodingServices<ProjSchema>,
    S.Codec.Encoded<ProjSchema>
  >
}

/**
 * Send the request to the endpoint and return the raw Effect response.
 * Also invalidates query caches using the request namespace by default.
 * Namespace invalidation targets parent namespace keys
 * (for example `$project/$configuration.get` invalidates `$project`).
 * Override invalidation in client options via `queryInvalidation`.
 */
export interface MutationExt<
  RT,
  Id extends string,
  A,
  E,
  R,
  EA = unknown
> extends MutationExtensions<RT, Id, void, A, E, R> {
  /**
   * Send the request to the endpoint and return the raw Effect response.
   * Also invalidates query caches using the request namespace by default.
   *
   * Pass `options` to attach a `select` Effect that runs after the mutation
   * succeeds (its output is returned to the caller) and/or override the default
   * `queryInvalidation`.
   */
  <B = A, E2 = never, R2 = never>(
    options?: MutationOptionsBase<A, B, E2, R2>
  ): Effect.Effect<B, E | E2, R | R2>

  project: <ProjSchema extends S.Top>(
    schema: EA extends ProjSchema["Encoded"] ? ProjSchema : never
  ) => MutationExt<
    RT,
    Id,
    S.Schema.Type<ProjSchema>,
    E | S.SchemaError,
    R | S.Codec.DecodingServices<ProjSchema>,
    S.Codec.Encoded<ProjSchema>
  >
}

export type MutationWithExtensions<RT, Req> = Req extends
  RequestHandlerWithInput<infer I, infer A, infer E, infer R, infer Request, infer Id>
  ? MutationExtWithInput<RT, Id, I, A, E, R, S.Codec.Encoded<Request["success"]>>
  : Req extends RequestHandler<infer A, infer E, infer R, infer Request, infer Id>
    ? MutationExt<RT, Id, A, E, R, S.Codec.Encoded<Request["success"]>>
  : never

/**
 * Options for invoking a `mutateStream` factory. Supplying `progress` produces
 * a tuple-with-id that carries `running` (the live AsyncResult ref) and
 * `progress` (a `ComputedRef<Progress | undefined>` formatted from each value),
 * which `Command.fn` / `Command.wrapStream` surface as the command's `running`
 * and `progress`. When omitted, the resulting command exposes neither.
 */
export type MutateStreamCallOptions<A, E> = {
  progress?: (result: AsyncResult.AsyncResult<A, E>) => Progress | undefined
}

/**
 * The `mutateStream` factory for a stream-type request handler. Always invoke
 * (optionally with `{ progress }`) to get a fresh callable `execute` — each call
 * produces a new state + execute pair so independent invocations don't share
 * state. The callable updates its underlying ref live with each emitted value
 * and carries `id`, plus `running` and `progress` when the factory was called
 * with a `progress` formatter. When the request declares a `final` schema,
 * the callable resolves with the last emitted value typed as `Final`; otherwise
 * it resolves with the success type. The factory itself carries the request
 * `id` so it can be passed to `Command.fn` / `Command.wrapStream` directly.
 */
export type StreamMutationWithExtensions<Req> = Req extends
  RequestStreamHandlerWithInput<infer I, infer A, infer E, infer R, infer _Request, infer Id, infer Final> ?
    & ((options?: MutateStreamCallOptions<A, E>) =>
      & ((input: I) => Effect.Effect<Final, E, R>)
      & {
        readonly id: Id
        readonly _streamCallable: true
        readonly running?: ComputedRef<AsyncResult.AsyncResult<A, E>>
        readonly progress?: ComputedRef<Progress | undefined>
      })
    & { readonly id: Id; readonly _streamFactory: true }
  : Req extends RequestStreamHandler<infer A, infer E, infer R, infer _Request, infer Id, infer Final> ?
      & ((options?: MutateStreamCallOptions<A, E>) =>
        & Effect.Effect<Final, E, R>
        & {
          readonly id: Id
          readonly _streamCallable: true
          readonly running?: ComputedRef<AsyncResult.AsyncResult<A, E>>
          readonly progress?: ComputedRef<Progress | undefined>
        })
      & { readonly id: Id; readonly _streamFactory: true }
  : never

/**
 * The pre-built `wrapStream` CommanderWrap for a stream-type request handler.
 * The command's `result` and `running` are the live stream ref.
 * Callable like `wrap`: `client.myExport.wrapStream()` returns the CommandOut.
 */
export type StreamCommandWithExtensions<RT, Req> = Req extends
  RequestStreamHandlerWithInput<infer I, infer A, infer E, infer R, infer _Request, infer Id, infer _Final>
  ? Commander.CommanderWrap<RT, Id, Id, undefined, I, A, E, R>
  : Req extends RequestStreamHandler<infer A, infer E, infer R, infer _Request, infer Id, infer _Final>
    ? Commander.CommanderWrap<RT, Id, Id, undefined, void, A, E, R>
  : never

/**
 * The `fn` builder for a stream-type request handler — identical to calling
 * `Command.fn(id)` where `id` comes from the request.
 */
export type StreamFnExtension<RT, Req> = Req extends
  RequestStreamHandlerWithInput<infer _I, infer _A, infer _E, infer _R, infer _Request, infer Id, infer _Final>
  ? Commander.CommanderFn<RT, Id, Id, undefined>
  : Req extends RequestStreamHandler<infer _A, infer _E, infer _R, infer _Request, infer Id, infer _Final>
    ? Commander.CommanderFn<RT, Id, Id, undefined>
  : never

/**
 * The `streamFn` builder for a stream-type request handler, using the stream-specific overloads.
 */
export type StreamFnStreamExtension<RT, Req> = Req extends
  RequestStreamHandlerWithInput<infer _I, infer _A, infer _E, infer _R, infer _Request, infer Id, infer _Final>
  ? Commander.StreamGen<RT, Id, Id, undefined> & Commander.NonGenStream<RT, Id, Id, undefined>
  : Req extends RequestStreamHandler<infer _A, infer _E, infer _R, infer _Request, infer Id, infer _Final>
    ? Commander.StreamGen<RT, Id, Id, undefined> & Commander.NonGenStream<RT, Id, Id, undefined>
  : never

/**
 * `mutateStream2` factory — like `mutateStream` but wraps per-invocation invalidation scaffolding
 * into the stream itself (via `Stream.unwrap`) for use with `streamFn` combinators.
 */
export type StreamMutation2WithExtensions<RT, Req> = Req extends
  RequestStreamHandlerWithInput<infer I, infer A, infer E, infer R, infer _Request, infer Id, infer _Final> ?
    & ((input: I) => Stream.Stream<A, E, R>)
    & {
      readonly id: Id
      readonly wrapStream: Commander.StreamGen<RT, Id, Id, undefined> & Commander.NonGenStream<RT, Id, Id, undefined>
    }
  : Req extends RequestStreamHandler<infer A, infer E, infer R, infer _Request, infer Id, infer _Final> ?
      & Stream.Stream<A, E, R>
      & {
        readonly id: Id
        readonly wrapStream: Commander.StreamGen<RT, Id, Id, undefined> & Commander.NonGenStream<RT, Id, Id, undefined>
      }
  : never

// we don't really care about the RT, as we are in charge of ensuring runtime safety anyway
// eslint-disable-next-line unused-imports/no-unused-vars
declare const useQuery_: QueryImpl<any>["useQuery"]
// eslint-disable-next-line unused-imports/no-unused-vars
declare const useSuspenseQuery_: QueryImpl<any>["useSuspenseQuery"]
// eslint-disable-next-line unused-imports/no-unused-vars
declare const useStreamQuery_: QueryImpl<any>["useStreamQuery"]

export interface ProjectResult<RT, I, B, E, R, Request extends Req, Id extends string> {
  request: (i: I) => Effect.Effect<B, E, R>
  query: Exclude<R, RT> extends never ? ReturnType<typeof useQuery_<I, E, B, Request, Id>>
    : MissingDependencies<RT, R> & {}
  suspense: Exclude<R, RT> extends never ? ReturnType<typeof useSuspenseQuery_<I, E, B, Request, Id>>
    : MissingDependencies<RT, R> & {}
}

export type QueryProjection<RT, HandlerReq> = HandlerReq extends
  RequestHandlerWithInput<infer I, infer _A, infer E, infer R, infer Request, infer Id>
  ? Request["type"] extends "query" ? {
      project: <ProjSchema extends S.Top>(
        schema: S.Codec.Encoded<Request["success"]> extends ProjSchema["Encoded"] ? ProjSchema : never
      ) => ProjectResult<
        RT,
        I,
        S.Schema.Type<ProjSchema>,
        E | S.SchemaError,
        R | S.Codec.DecodingServices<ProjSchema>,
        Request,
        Id
      >
    }
  : {}
  : HandlerReq extends RequestHandler<infer _A, infer E, infer R, infer Request, infer Id>
    ? Request["type"] extends "query" ? {
        project: <ProjSchema extends S.Top>(
          schema: S.Codec.Encoded<Request["success"]> extends ProjSchema["Encoded"] ? ProjSchema : never
        ) => ProjectResult<
          RT,
          void,
          S.Schema.Type<ProjSchema>,
          E | S.SchemaError,
          R | S.Codec.DecodingServices<ProjSchema>,
          Request,
          Id
        >
      }
    : {}
  : {}

export interface QueriesWithInput<Request extends Req, Id extends string, I, A, E> {
  /**
   * Read helper for query requests.
   * Runs as a tracked Vue Query and returns reactive state.
   * Queries read state and should not be used to mutate it.
   */
  query: ReturnType<typeof useQuery_<I, E, A, Request, Id>>
  // TODO or suspense as Option?
  /**
   * Like `.query`, but returns a Promise for setup-time awaiting.
   * Use this when integrating with Vue Suspense / error boundaries.
   */
  suspense: ReturnType<typeof useSuspenseQuery_<I, E, A, Request, Id>>
}
export interface QueriesWithoutInput<Request extends Req, Id extends string, A, E> {
  /**
   * Read helper for query requests.
   * Runs as a tracked Vue Query and returns reactive state.
   * Queries read state and should not be used to mutate it.
   */
  query: ReturnType<typeof useQuery_<E, A, Request, Id>>
  // TODO or suspense as Option?
  /**
   * Like `.query`, but returns a Promise for setup-time awaiting.
   * Use this when integrating with Vue Suspense / error boundaries.
   */
  suspense: ReturnType<typeof useSuspenseQuery_<E, A, Request, Id>>
}

export type MissingDependencies<RT, R> = {
  message: "Dependencies required that are not provided by the runtime"
  dependencies: Exclude<R, RT>
}

export type Queries<RT, Req> = Req extends
  RequestHandlerWithInput<infer I, infer A, infer E, infer R, infer Request, infer Id>
  ? Request["type"] extends "query" ? Exclude<R, RT> extends never ? QueriesWithInput<Request, Id, I, A, E>
    : {
      query: MissingDependencies<RT, R> & {}
      suspense: MissingDependencies<RT, R> & {}
    }
  : never
  : Req extends RequestHandler<infer A, infer E, infer R, infer Request, infer Id>
    ? Request["type"] extends "query" ? Exclude<R, RT> extends never ? QueriesWithoutInput<Request, Id, A, E>
      : { query: MissingDependencies<RT, R> & {}; suspense: MissingDependencies<RT, R> & {} }
    : never
  : never

export interface StreamQueriesWithInput<Request extends Req, Id extends string, I, A, E> {
  /**
   * Stream helper for stream requests.
   * Runs as a tracked Vue Query and returns reactive state with accumulated chunks.
   * Data is an array of all chunks received so far.
   */
  streamQuery: ReturnType<typeof useStreamQuery_<I, E, A, Request, Id>>
}
export interface StreamQueriesWithoutInput<Request extends Req, Id extends string, A, E> {
  /**
   * Stream helper for stream requests.
   * Runs as a tracked Vue Query and returns reactive state with accumulated chunks.
   * Data is an array of all chunks received so far.
   */
  streamQuery: ReturnType<typeof useStreamQuery_<E, A, Request, Id>>
}

export type StreamQueries<RT, HandlerReq> = HandlerReq extends
  RequestStreamHandlerWithInput<infer I, infer A, infer E, infer R, infer Request, infer Id, infer _Final>
  ? Exclude<R, RT> extends never ? StreamQueriesWithInput<Request, Id, I, A, E>
  : { streamQuery: MissingDependencies<RT, R> & {} }
  : HandlerReq extends RequestStreamHandler<infer A, infer E, infer R, infer Request, infer Id, infer _Final>
    ? Exclude<R, RT> extends never ? StreamQueriesWithoutInput<Request, Id, A, E>
    : { streamQuery: MissingDependencies<RT, R> & {} }
  : never

const _useMutation = makeMutation()

const wrapWithSpan = (self: { id: string; handler: any }, mut: any) => {
  const span = (eff: Effect.Effect<any, any, any>) =>
    Effect.withSpan(`mutation ${self.id}`, {}, { captureStackTrace: false })(eff)
  return Effect.isEffect(self.handler)
    ? (options?: MutationOptionsBase) => span(mut(options))
    : (input: any, options?: MutationOptionsBase) => span(mut(input, options))
}

/**
 * Pass an Effect or a function that returns an Effect, e.g from a client action
 * Executes query cache invalidation based on default rules or provided option.
 * adds a span with the mutation id
 */
export const useMutation: typeof _useMutation = (<
  I,
  E,
  A,
  R,
  Request extends Req,
  Name extends string
>(
  self: RequestHandlerWithInput<I, A, E, R, Request, Name> | RequestHandler<A, E, R, Request, Name>
) =>
  Object.assign(
    wrapWithSpan(self, _useMutation(self as any)),
    { id: self.id }
  )) as any

/**
 * Pass an Effect or a function that returns an Effect, e.g from a client action
 * Executes query cache invalidation based on default rules or provided option.
 * adds a span with the mutation id
 */
export const useMutationInt = (): typeof _useMutation => {
  const _useMutation = useMakeMutation()
  return (<
    I,
    E,
    A,
    R,
    Request extends Req,
    Name extends string
  >(
    self: RequestHandlerWithInput<I, A, E, R, Request, Name> | RequestHandler<A, E, R, Request, Name>
  ) =>
    Object.assign(
      wrapWithSpan(self, _useMutation(self as any)),
      { id: self.id }
    )) as any
}

export type ClientFrom<M extends RequestsAny> = RequestHandlers<never, never, M, ExtractModuleName<M>>

export class QueryImpl<R> {
  constructor(readonly getRuntime: () => Context.Context<R>) {
    this.useQuery = makeQuery(this.getRuntime)
    this.useStreamQuery = makeStreamQuery(this.getRuntime)
  }
  /**
   * Effect results are passed to the caller, including errors.
   * @deprecated use client helpers instead (.query())
   */
  readonly useQuery: ReturnType<typeof makeQuery<R>>

  /**
   * Stream results are accumulated as an array of chunks and returned as reactive state.
   * @deprecated use client helpers instead (.streamQuery())
   */
  readonly useStreamQuery: ReturnType<typeof makeStreamQuery<R>>

  /**
   * The difference with useQuery is that this function will return a Promise you can await in the Setup,
   * which ensures that either there always is a latest value, or an error occurs on load.
   * So that Suspense and error boundaries can be used.
   * @deprecated use client helpers instead (.suspense())
   */
  readonly useSuspenseQuery: {
    /**
     * The difference with useQuery is that this function will return a Promise you can await in the Setup,
     * which ensures that either there always is a latest value, or an error occurs on load.
     * So that Suspense and error boundaries can be used.
     * @deprecated use client helpers instead (.suspense())
     */
    <
      E,
      A,
      Request extends Req,
      Name extends string
    >(
      self: RequestHandler<A, E, R, Request, Name>
    ): {
      /**
       * The difference with useQuery is that this function will return a Promise you can await in the Setup,
       * which ensures that either there always is a latest value, or an error occurs on load.
       * So that Suspense and error boundaries can be used.
       */
      <TData = A>(options?: CustomUndefinedInitialQueryOptions<A, E, TData>): Promise<
        readonly [
          ComputedRef<AsyncResult.AsyncResult<TData, E>>,
          ComputedRef<TData>,
          (
            options?: RefetchOptions
          ) => Effect.Effect<QueryObserverResult<TData, E>>,
          UseQueryReturnType<any, any>
        ]
      >
    }
    /**
     * The difference with useQuery is that this function will return a Promise you can await in the Setup,
     * which ensures that either there always is a latest value, or an error occurs on load.
     * So that Suspense and error boundaries can be used.
     */
    <
      Arg,
      E,
      A,
      Request extends Req,
      Name extends string
    >(
      self: RequestHandlerWithInput<Arg, A, E, R, Request, Name>
    ): {
      /**
       * The difference with useQuery is that this function will return a Promise you can await in the Setup,
       * which ensures that either there always is a latest value, or an error occurs on load.
       * So that Suspense and error boundaries can be used.
       */
      <TData = A>(arg: Arg | WatchSource<Arg>, options?: CustomUndefinedInitialQueryOptions<A, E, TData>): Promise<
        readonly [
          ComputedRef<AsyncResult.AsyncResult<TData, E>>,
          ComputedRef<TData>,
          (
            options?: RefetchOptions
          ) => Effect.Effect<QueryObserverResult<TData, E>>,
          UseQueryReturnType<any, any>
        ]
      >
    }
  } = <Arg, E, A, Request extends Req, Name extends string>(
    self: RequestHandlerWithInput<Arg, A, E, R, Request, Name> | RequestHandler<A, E, R, Request, Name>
  ) => {
    const runPromise = makeRunPromise(this.getRuntime())
    const q = this.useQuery(self as any) as any
    return (argOrOptions?: any, options?: any) => {
      const [resultRef, latestRef, fetch, uqrt] = q(argOrOptions, { ...options, suspense: true } // experimental_prefetchInRender: true }
      )

      const isMounted = ref(true)
      onBeforeUnmount(() => {
        isMounted.value = false
      })

      // @effect-diagnostics effect/missingEffectError:off
      const eff = Effect.gen(function*() {
        // we want to throw on error so that we can catch cancelled error and skip handling it
        // what's the difference with just calling `fetch` ?
        // we will receive a CancelledError which we will have to ignore in our ErrorBoundary, otherwise the user ends up on an error page even if the user e.g cancelled a navigation
        const r = yield* Effect.tryPromise(() => uqrt.suspense()).pipe(
          Effect.catchTag("UnknownError", (err) =>
            isCancelledError(err.cause)
              ? Effect.interrupt
              : Effect.die(err.cause))
        )
        if (!isMounted.value) {
          return yield* Effect.interrupt
        }
        const result = resultRef.value
        if (AsyncResult.isInitial(result)) {
          console.error("Internal Error: Promise should be resolved already", {
            self,
            argOrOptions,
            options,
            r,
            resultRef
          })
          return yield* Effect.die(
            "Internal Error: Promise should be resolved already"
          )
        }
        if (AsyncResult.isFailure(result)) {
          return yield* Exit.failCause(result.cause)
        }

        return [resultRef, latestRef, fetch, uqrt] as const
      })

      return runPromise(eff)
    }
  }
}

// somehow mrt.runtimeEffect doesnt work sync, but this workaround works fine? not sure why though as the layers are generally only sync
const managedRuntimeRt = <A, E>(mrt: ManagedRuntime.ManagedRuntime<A, E>) => mrt.runSync(Effect.context<A>())

type Base = I18n | Toast
type Mix = ApiClientFactory | Commander | Base

type InvalidationResources = Record<string, Record<string, unknown>>
type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends ((arg: infer I) => void) ? I
  : never

type CommandInvalidationResources<Req> = Req extends {
  readonly type: "command"
  readonly "~invalidationResources"?: infer Resources
} ? NonNullable<Resources> extends InvalidationResources ? NonNullable<Resources> : never
  : Req extends {
    readonly type: "command"
    readonly config?: infer Config
  } ? Config extends {
      readonly invalidationResources?: infer LegacyResources
    } ? NonNullable<LegacyResources> extends InvalidationResources ? NonNullable<LegacyResources> : never
    : Config extends {
      readonly invalidatesQueries?: InvalidationCallback<infer LegacyResources, any, any, any>
    } ? NonNullable<LegacyResources> extends InvalidationResources ? NonNullable<LegacyResources> : never
    : never
  : never

type InvalidationResourcesForUnion<M extends RequestsAny> = {
  [K in keyof M]: CommandInvalidationResources<M[K]>
}[keyof M]

type InvalidationResourcesFor<M extends RequestsAny> = [InvalidationResourcesForUnion<M>] extends [never] ? never
  : UnionToIntersection<InvalidationResourcesForUnion<M>> extends infer R ? R extends InvalidationResources ? R
    : never
  : never

type QueryInvalidationFactory<M extends RequestsAny> = (client: ClientFrom<M>) => QueryInvalidation<M>

type StrictResourcesArg<Shape, Actual extends Shape = Shape> =
  & Actual
  & Record<Exclude<keyof Actual, keyof Shape>, never>

type ClientForArgs<
  M extends RequestsAny,
  Resources extends InvalidationResourcesFor<M> = InvalidationResourcesFor<M>
> = [InvalidationResourcesFor<M>] extends [never] ? [
    queryInvalidation?: QueryInvalidationFactory<M>,
    invalidationResources?: StrictResourcesArg<
      InvalidationResourcesFor<M>,
      Resources
    >
  ]
  : [
    queryInvalidation: QueryInvalidationFactory<M> | undefined,
    invalidationResources: StrictResourcesArg<
      InvalidationResourcesFor<M>,
      Resources
    >
  ]

export const makeClient = <RT_, RTHooks>(
  // global, but only accessible after startup has completed
  getBaseMrt: () => ManagedRuntime.ManagedRuntime<RT_ | Mix, never>,
  clientFor_: ReturnType<typeof ApiClientFactory["makeFor"]>,
  rtHooks: Layer.Layer<RTHooks, never, Mix>
) => {
  type RT = RT_ | Mix
  const getBaseRt = () => managedRuntimeRt(getBaseMrt())
  const makeCommand = makeUseCommand<RT, RTHooks>(rtHooks)
  let cmd: Effect.Success<typeof makeCommand>
  const useCommand = () => cmd ??= getBaseMrt().runSync(makeCommand)

  let m: ReturnType<typeof useMutationInt>
  const useMutation = () => m ??= useMutationInt()

  let sm: ReturnType<typeof makeStreamMutation>
  const useStreamMutation = () => sm ??= makeStreamMutation()

  let sm2: ReturnType<typeof makeStreamMutation2>
  const useStreamMutation2 = () => sm2 ??= makeStreamMutation2()

  const query = new QueryImpl(getBaseRt)
  const useQuery = query.useQuery
  const useSuspenseQuery = query.useSuspenseQuery
  const useStreamQuery = query.useStreamQuery

  const mergeInvalidation = (
    a?: MutationOptionsBase["queryInvalidation"],
    b?: MutationOptionsBase["queryInvalidation"]
  ): MutationOptionsBase["queryInvalidation"] | undefined => {
    if (!a && !b) {
      return undefined
    }
    return (defaultKey, name, input, output) => [
      ...(a?.(defaultKey, name, input, output) ?? []),
      ...(b?.(defaultKey, name, input, output) ?? [])
    ]
  }

  const withDefaultInvalidation = (
    mut: any,
    isWithInput: boolean,
    defaultInvalidation?: MutationOptionsBase["queryInvalidation"]
  ) => {
    if (!defaultInvalidation) return mut
    const apply = (callerOpts?: MutationOptionsBase) => ({
      ...callerOpts,
      queryInvalidation: callerOpts?.queryInvalidation
        ? mergeInvalidation(defaultInvalidation, callerOpts.queryInvalidation)
        : defaultInvalidation
    })
    return isWithInput
      ? (input: any, callerOpts?: MutationOptionsBase) => mut(input, apply(callerOpts))
      : (callerOpts?: MutationOptionsBase) => mut(apply(callerOpts))
  }

  const makeQueryResources = <Resources extends InvalidationResources>(resources: Resources | undefined) => {
    if (!resources) {
      return {} as Record<string, Record<string, unknown>>
    }
    return resources as Record<string, Record<string, unknown>>
  }

  const mapQuery = <M extends RequestsAny>(
    client: ClientFrom<M>
  ) => {
    const queries = Struct.keys(client).reduce(
      (acc, key) => {
        const requestType = client[key].Request.type
        if (requestType === "query") {
          ;(acc as any)[camelCase(key) + "Query"] = Object.assign(useQuery(client[key] as any), {
            id: client[key].id
          })
          ;(acc as any)[camelCase(key) + "SuspenseQuery"] = Object.assign(useSuspenseQuery(client[key] as any), {
            id: client[key].id
          })
        } else if (requestType === "stream") {
          ;(acc as any)[camelCase(key) + "StreamQuery"] = Object.assign(useStreamQuery(client[key] as any), {
            id: client[key].id
          })
        }
        return acc
      },
      {} as
        & {
          // apparently can't get JSDoc in here..
          [
            Key in keyof typeof client as QueryHandler<typeof client[Key]> extends never ? never
              : `${ToCamel<string & Key>}Query`
          ]: Queries<RT, QueryHandler<typeof client[Key]>>["query"]
        }
        // todo: or suspense as an Option?
        & {
          // apparently can't get JSDoc in here..
          [
            Key in keyof typeof client as QueryHandler<typeof client[Key]> extends never ? never
              : `${ToCamel<string & Key>}SuspenseQuery`
          ]: Queries<
            RT,
            QueryHandler<typeof client[Key]>
          >["suspense"]
        }
        & {
          [
            Key in keyof typeof client as StreamHandler<typeof client[Key]> extends never ? never
              : `${ToCamel<string & Key>}StreamQuery`
          ]: StreamQueries<RT, StreamHandler<typeof client[Key]>>["streamQuery"]
        }
    )
    return queries
  }

  const mapRequest = <M extends RequestsAny>(
    client: ClientFrom<M>
  ) => {
    const Command = useCommand()
    const mutations = Struct.keys(client).reduce(
      (acc, key) => {
        if (client[key].Request.type !== "command") {
          return acc
        }
        const mut = client[key].handler
        const fn = Command.fn(client[key].id)
        const wrap = Command.wrap({ mutate: Effect.isEffect(mut) ? () => mut : mut, id: client[key].id })
        ;(acc as any)[camelCase(key) + "Request"] = Object.assign(
          mut,
          fn, // to get the i18n key etc.
          { wrap, fn }
        )
        return acc
      },
      {} as {
        [
          Key in keyof typeof client as CommandHandler<typeof client[Key]> extends never ? never
            : `${ToCamel<string & Key>}Request`
        ]: CommandRequestWithExtensions<
          RT | RTHooks,
          CommandHandler<typeof client[Key]>
        >
      }
    )
    return mutations
  }

  const mapMutation = <M extends RequestsAny>(
    client: ClientFrom<M>,
    queryInvalidation?: (client: ClientFrom<M>) => QueryInvalidation<M>,
    invalidationResources?: InvalidationResourcesFor<M>
  ) => {
    const Command = useCommand()
    const mutation = useMutation()
    const invalidation = queryInvalidation?.(client)
    const queryResources = makeQueryResources(invalidationResources)
    const mutations = Struct.keys(client).reduce(
      (acc, key) => {
        if (client[key].Request.type !== "command") {
          return acc
        }
        const fromRequestConfig = client[key].Request.config?.["invalidatesQueries"] as
          | InvalidationCallback<InvalidationResourcesFor<M>>
          | undefined
        const fromRequest = fromRequestConfig
          ? ((defaultKey: string[], _name: string, input?: unknown, output?: unknown) =>
            fromRequestConfig(defaultKey, queryResources as never, input as never, output as never).map((entry) => ({
              filters: entry.filters,
              options: entry.options
            })))
          : undefined
        const mergedInvalidation = mergeInvalidation(fromRequest, invalidation?.[key])
        const makeProjectedMutation = (handler: any): any => {
          const isWithInput = !Effect.isEffect(handler.handler)
          const mut: any = withDefaultInvalidation(mutation(handler), isWithInput, mergedInvalidation)
          const wrap = Command.wrap({ mutate: mut, id: client[key].id })
          return Object.assign(mut, {
            wrap,
            project: (projectionSchema: any) => {
              const projected = {
                ...handler,
                handler: projectHandler(handler.handler, client[key].Request.success, projectionSchema)
              }
              return makeProjectedMutation(projected)
            }
          })
        }
        ;(acc as any)[camelCase(key) + "Mutation"] = makeProjectedMutation(client[key] as any)
        return acc
      },
      {} as {
        [
          Key in keyof typeof client as CommandHandler<typeof client[Key]> extends never ? never
            : `${ToCamel<string & Key>}Mutation`
        ]: MutationWithExtensions<
          RT | RTHooks,
          CommandHandler<typeof client[Key]>
        >
      }
    )
    return mutations
  }

  const mapStreamMutation = <M extends RequestsAny>(
    client: ClientFrom<M>,
    queryInvalidation?: (client: ClientFrom<M>) => QueryInvalidation<M>,
    invalidationResources?: InvalidationResourcesFor<M>
  ) => {
    const Command = useCommand()
    const streamMutation = useStreamMutation()
    const invalidation = queryInvalidation?.(client)
    const queryResources = makeQueryResources(invalidationResources)
    const streams = Struct.keys(client).reduce(
      (acc, key) => {
        if (client[key].Request.type !== "stream") {
          return acc
        }
        const fromRequestConfig = client[key].Request.config?.["invalidatesQueries"] as
          | InvalidationCallback<InvalidationResourcesFor<M>>
          | undefined
        const fromRequest = fromRequestConfig
          ? ((defaultKey: string[], _name: string, input?: unknown, output?: unknown) =>
            fromRequestConfig(defaultKey, queryResources as never, input as never, output as never).map((entry) => ({
              filters: entry.filters,
              options: entry.options
            })))
          : undefined
        const mergedInvalidation = mergeInvalidation(fromRequest, invalidation?.[key])
        const smFactory = Object.assign(
          (opts?: { progress?: (result: AsyncResult.AsyncResult<any, any>) => Progress | undefined }) => {
            const [resultRef, execute] = streamMutation(client[key] as any, mergedInvalidation)
            const extras: {
              id: string
              _streamCallable: true
              running?: ComputedRef<AsyncResult.AsyncResult<any, any>>
              progress?: ComputedRef<Progress | undefined>
            } = { id: client[key].id, _streamCallable: true }
            if (opts?.progress) {
              const fmt = opts.progress
              extras.running = resultRef
              extras.progress = computed(() => fmt(resultRef.value))
            }
            return Object.assign(execute, extras)
          },
          { id: client[key].id, _streamFactory: true as const }
        )
        ;(acc as any)[camelCase(key) + "Stream"] = Object.assign(smFactory, {
          fn: Command.fn(client[key].id)
        })
        return acc
      },
      {} as {
        [
          Key in keyof typeof client as StreamHandler<typeof client[Key]> extends never ? never
            : `${ToCamel<string & Key>}Stream`
        ]:
          & StreamMutationWithExtensions<StreamHandler<typeof client[Key]>>
          & { fn: StreamFnExtension<RT | RTHooks, StreamHandler<typeof client[Key]>> }
      }
    )
    return streams
  }

  // make available .query, .suspense and .mutate for each operation
  // and a .helpers with all mutations and queries
  const mapClient = <M extends RequestsAny>(
    queryInvalidation?: (client: ClientFrom<M>) => QueryInvalidation<M>,
    invalidationResources?: InvalidationResourcesFor<M>
  ) =>
  (
    client: ClientFrom<M>
  ) => {
    const Command = useCommand()
    const mutation = useMutation()
    const streamMutation = useStreamMutation()
    const invalidation = queryInvalidation?.(client)
    const queryResources = makeQueryResources(invalidationResources)
    const extended = Struct.keys(client).reduce(
      (acc, key) => {
        const requestType = client[key].Request.type
        const fn = Command.fn(client[key].id)
        const h_ = client[key].handler
        const wrapInput = Effect.isEffect(h_)
          ? () => h_
          : (...args: [any]) => h_(...args)
        const request = Effect.isEffect(h_) ? h_ : wrapInput
        ;(acc as any)[key] = Object.assign(
          requestType === "query"
            ? {
              ...client[key],
              request,
              query: useQuery(client[key] as any),
              suspense: useSuspenseQuery(client[key] as any),
              project: (projectionSchema: any) => {
                const successSchema = client[key].Request.success
                const projectionHash = projectionSchemaHash(projectionSchema)
                const projected = projectHandler(h_ as any, successSchema, projectionSchema)
                const fakeHandler = {
                  handler: projected,
                  id: client[key].id,
                  Request: client[key].Request,
                  options: client[key].options,
                  queryKeyProjectionHash: projectionHash
                }
                return {
                  request: projected,
                  query: useQuery(fakeHandler as any),
                  suspense: useSuspenseQuery(fakeHandler as any)
                }
              }
            }
            : requestType === "stream"
            ? (() => {
              const fromRequestConfig = client[key].Request.config?.["invalidatesQueries"] as
                | InvalidationCallback<InvalidationResourcesFor<M>>
                | undefined
              const fromRequest = fromRequestConfig
                ? ((defaultKey: string[], _name: string, input?: unknown, output?: unknown) =>
                  fromRequestConfig(defaultKey, queryResources as never, input as never, output as never).map((
                    entry
                  ) => ({
                    filters: entry.filters,
                    options: entry.options
                  })))
                : undefined
              const mergedInvalidation = mergeInvalidation(fromRequest, invalidation?.[key])
              const streamMutFactory = Object.assign(
                (opts?: { progress?: (result: AsyncResult.AsyncResult<any, any>) => Progress | undefined }) => {
                  const [resultRef, execute] = streamMutation(client[key] as any, mergedInvalidation)
                  const extras: {
                    id: string
                    _streamCallable: true
                    running?: ComputedRef<AsyncResult.AsyncResult<any, any>>
                    progress?: ComputedRef<Progress | undefined>
                  } = { id: client[key].id, _streamCallable: true }
                  if (opts?.progress) {
                    const fmt = opts.progress
                    extras.running = resultRef
                    extras.progress = computed(() => fmt(resultRef.value))
                  }
                  return Object.assign(execute, extras)
                },
                { id: client[key].id, _streamFactory: true as const }
              )
              return {
                ...client[key],
                request: h_,
                streamQuery: useStreamQuery(client[key] as any),
                mutateStream: streamMutFactory,
                wrapStream: Command.wrapStream(streamMutFactory),
                fn: Command.fn(client[key].id),
                streamFn: useCommand().streamFn(client[key].id as any) as any,
                mutateStream2: (() => {
                  const sm2Act = useStreamMutation2()(client[key] as any, mergedInvalidation)
                  const originalHandler = (client[key] as any).handler
                  const sm2Handler = Stream.isStream(originalHandler)
                    ? (_input: any, _ctx: any) => sm2Act
                    : (input: any, _ctx: any) => (sm2Act as (i: any) => any)(input)
                  return Object.assign(sm2Act, {
                    id: client[key].id,
                    wrapStream: (...combinators: any[]) => {
                      const sfn = useCommand().streamFn(client[key].id as any) as any
                      return sfn(sm2Handler, ...combinators)
                    }
                  })
                })()
              }
            })()
            : {
              mutate: ((handler: any) => {
                const fromRequestConfig = client[key].Request.config?.["invalidatesQueries"] as
                  | InvalidationCallback<InvalidationResourcesFor<M>>
                  | undefined
                const fromRequest = fromRequestConfig
                  ? ((defaultKey: string[], _name: string, input?: unknown, output?: unknown) =>
                    fromRequestConfig(defaultKey, queryResources as never, input as never, output as never).map((
                      entry
                    ) => ({
                      filters: entry.filters,
                      options: entry.options
                    })))
                  : undefined
                const mergedInvalidation = mergeInvalidation(fromRequest, invalidation?.[key])
                const makeProjectedMutation = (h: any): any => {
                  const isWithInput = !Effect.isEffect(h.handler)
                  const mutate = withDefaultInvalidation(mutation(h), isWithInput, mergedInvalidation)
                  return Object.assign(
                    mutate,
                    {
                      wrap: Command.wrap({
                        mutate,
                        id: client[key].id
                      }),
                      project: (projectionSchema: any) => {
                        const projected = {
                          ...h,
                          handler: projectHandler(h.handler, client[key].Request.success, projectionSchema)
                        }
                        return makeProjectedMutation(projected)
                      }
                    }
                  )
                }
                return makeProjectedMutation(handler)
              })(client[key] as any),
              ...client[key],
              ...fn, // to get the i18n key etc.
              request,
              fn,
              wrap: Command.wrap({ mutate: wrapInput, id: client[key].id })
            }
        )
        return acc
      },
      {} as {
        [Key in keyof typeof client]:
          & typeof client[Key]
          & (QueryHandler<typeof client[Key]> extends never ? {}
            :
              & QueryRequestWithExtensions<QueryHandler<typeof client[Key]>>
              & Queries<RT, QueryHandler<typeof client[Key]>>
              & QueryProjection<RT, QueryHandler<typeof client[Key]>>)
          & (StreamHandler<typeof client[Key]> extends never ? {}
            : StreamQueries<RT, StreamHandler<typeof client[Key]>>)
          & (CommandHandler<typeof client[Key]> extends never ? {}
            : CommandRequestWithExtensions<RT | RTHooks, CommandHandler<typeof client[Key]>>)
          & (CommandHandler<typeof client[Key]> extends never ? {}
            : { mutate: MutationWithExtensions<RT | RTHooks, CommandHandler<typeof client[Key]>> })
          & (StreamHandler<typeof client[Key]> extends never ? {}
            : {
              mutateStream: StreamMutationWithExtensions<StreamHandler<typeof client[Key]>>
              wrapStream: StreamCommandWithExtensions<RT | RTHooks, StreamHandler<typeof client[Key]>>
              fn: StreamFnExtension<RT | RTHooks, StreamHandler<typeof client[Key]>>
              streamFn: StreamFnStreamExtension<RT | RTHooks, StreamHandler<typeof client[Key]>>
              mutateStream2: StreamMutation2WithExtensions<RT | RTHooks, StreamHandler<typeof client[Key]>>
            })
          & { Input: typeof client[Key] extends RequestHandlerWithInput<infer I, any, any, any, any, any> ? I : never }
      }
    )
    return Object.assign(extended, {
      helpers: {
        ...mapRequest(client),
        ...mapMutation(client, queryInvalidation, invalidationResources),
        ...mapStreamMutation(client, queryInvalidation, invalidationResources),
        ...mapQuery(client)
      }
    })
  }

  // TODO: Clean up this delay initialisation messs
  // TODO; invalidateQueries should perhaps be configured in the Request impl themselves?
  const clientFor__ = <M extends RequestsAny>(
    m: M,
    queryInvalidation?: QueryInvalidationFactory<M>,
    invalidationResources?: InvalidationResourcesFor<M>
  ) => getBaseMrt().runSync(clientFor_(m).pipe(Effect.map(mapClient(queryInvalidation, invalidationResources))))

  // delay client creation until first access
  // the idea is that we don't need the useNuxtApp().$runtime (only available at later initialisation stage)
  // until we are at a place where it is available..
  const clientFor = <
    M extends RequestsAny,
    Resources extends InvalidationResourcesFor<M> = InvalidationResourcesFor<M>
  >(
    m: M,
    ...args: ClientForArgs<M, Resources>
  ) => {
    const [queryInvalidation, invalidationResources] = args as [
      QueryInvalidationFactory<M> | undefined,
      InvalidationResourcesFor<M> | undefined
    ]
    type Client = ReturnType<typeof clientFor__<M>>
    let client: Client | undefined = undefined
    const getOrMakeClient = () => (client ??= clientFor__(m, queryInvalidation, invalidationResources))

    // initialize on first use..
    const proxy = Struct.keys(m).concat(["helpers"]).reduce((acc, key) => {
      Object.defineProperty(acc, key, {
        configurable: true,
        get() {
          const v = (getOrMakeClient() as any)[key as any]
          // cache on first use.
          Object.defineProperty(acc, key, { value: v })
          return v
        }
      })
      return acc
    }, {} as Client)
    return proxy
  }

  const Command: CommanderResolved<RT, RTHooks> = {
    ...{
      // delay initialisation until first use...
      fn: (...args: [any]) => useCommand().fn(...args),
      wrap: (...args: [any]) => useCommand().wrap(...args),
      wrapStream: (...args: [any]) => useCommand().wrapStream(...args),
      streamFn: (...args: [any]) => useCommand().streamFn(...args),
      alt: (...args: [any]) => useCommand().alt(...args),
      alt2: (...args: [any]) => useCommand().alt2(...args)
    } as ReturnType<typeof useCommand>,
    ...CommanderStatic
  }

  return {
    Command,
    useCommand,
    clientFor
  }
}

export type QueryInvalidation<M> = {
  [K in keyof M]?: (
    defaultKey: string[],
    name: string,
    input?: unknown,
    output?: ExitResult.Exit<unknown, unknown>
  ) => {
    filters?: InvalidateQueryFilters | undefined
    options?: InvalidateOptions | undefined
  }[]
}

export type ToCamel<S extends string | number | symbol> = S extends string
  ? S extends `${infer Head}_${infer Tail}` ? `${Uncapitalize<Head>}${Capitalize<ToCamel<Tail>>}`
  : Uncapitalize<S>
  : never

export interface CommandBase<I = void, A = void, RA = unknown, RE = unknown> {
  handle: (input: I) => A
  waiting: boolean
  blocked: boolean
  allowed: boolean
  action: string
  label: string
  /** formatted progress info for current `running` state, when `progress` was supplied */
  progress?: Progress | undefined
  /** reactive result state, available on stream-backed commands */
  result?: AsyncResult.AsyncResult<RA, RE>
}

export interface EffectCommand<I = void, A = unknown, E = unknown> extends CommandBase<I, Fiber<A, E>, A, E> {}

export interface CommandFromRequest<I extends { readonly make: (...args: any[]) => any }, A = unknown, E = unknown>
  extends EffectCommand<RequestInputFromMake<I>, A, E>
{}
