/* eslint-disable @typescript-eslint/no-explicit-any */
import { camelCase } from "change-case"
import { type ApiClientFactory, type Req } from "effect-app/client"
import type { ExtractModuleName, HandlerInput, RequestHandlers, RequestHandlerWithInput, RequestsAny, RequestStreamHandlerWithInput } from "effect-app/client/clientFor"
import type { CauseException } from "effect-app/client/errors"
import type { InvalidationCallback } from "effect-app/client/makeClient"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import * as S from "effect-app/Schema"
import * as Exit from "effect/Exit"
import { type Fiber } from "effect/Fiber"
import * as Hash from "effect/Hash"
import type * as ManagedRuntime from "effect/ManagedRuntime"
import type * as Stream from "effect/Stream"
import * as Struct from "effect/Struct"
import type * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { computed, type ComputedRef, effectScope, onBeforeUnmount, onScopeDispose, ref, type WatchSource } from "vue"
import { type AtomClientRuntime, invalidateAndAwait, makeAtomClientRuntime } from "./atomQuery.ts"
import { type Commander, CommanderStatic, type Progress } from "./commander.ts"
import { type I18n } from "./intl.ts"
import { type CommanderResolved, makeUseCommand } from "./makeUseCommand.ts"
import { atomQueryInvalidator, type InvalidationEntry, makeMutation, makeStreamMutation2, type MutationOptionsBase, type QueryInvalidator, useMakeMutation } from "./mutate.ts"
import { atomQueryCacheUpdater, type AtomQueryNewOptions, type CustomUndefinedInitialQueryOptions, makeQuery, makeQueryAtom, makeQueryFamily, makeQueryNew, makeStreamQuery, makeStreamQueryAtom, makeStreamQueryFamily, makeStreamQueryNew, type QueryObserverResult, type RefetchOptions, setQueryCacheUpdater, type StreamQueryAtomFamily, type SuspenseQueryView, type UseQueryReturnType } from "./query.ts"
import { makeRunPromise } from "./runtime.ts"
import { type Toast } from "./toast.ts"

export type { Progress }

const useScopedSuspenseSetup = <A>(setup: () => A) => {
  const scope = effectScope()
  const controller = new AbortController()
  const value = scope.run(setup)
  if (value === undefined) {
    throw new Error("Internal Error: suspense setup scope did not initialize")
  }

  const isMounted = ref(true)
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    isMounted.value = false
    controller.abort()
    scope.stop()
  }
  onBeforeUnmount(stop)
  onScopeDispose(stop)

  return [value, isMounted, controller.signal] as const
}

// TODO: optimize - work from encoded shape directly
const projectHandler = <
  I,
  A,
  E,
  R,
  SuccessSchema extends S.Top & { readonly "EncodingServices": R },
  ProjSchema extends S.Top & { readonly "DecodingServices": R }
>(
  handler: (i: I) => Effect.Effect<A, E, R>,
  successSchema: SuccessSchema,
  projectionSchema: ProjSchema
) => {
  const encode = S.encodeUnknownEffect(successSchema)
  const decode = S.decodeUnknownEffect(projectionSchema)
  return (i: I) => handler(i).pipe(Effect.flatMap(encode), Effect.flatMap(decode))
}

const projectionSchemaHash = (schema: S.Top) => String(Hash.hash(schema.ast))

export interface CommandRequestExtensions<RT, Id extends string, I, A, E, R> {
  /** Defines a Command based on this call, taking the `id` of the call as the `id` of the Command.
   * The Request function will be taken as the first member of the Command, the Command required input will be the Request input.
   * see Command.wrap for details */
  wrap: <I18nKey extends string = Id, State extends Commander.IntlRecord | undefined = undefined>(
    options?: Commander.FnOptions<Id, I18nKey, State>
  ) => Commander.CommanderWrap<RT, Id, I18nKey, State, I, A, E, R>
  /** Defines a Command based on this call, taking the `id` of the call as the `id` of the Command.
   * see Command.fn for details */
  fn: <I18nKey extends string = Id, State extends Commander.IntlRecord | undefined = undefined>(
    options?: Commander.FnOptions<Id, I18nKey, State>
  ) => Commander.CommanderFn<RT, Id, I18nKey, State>
}

/** my other doc */
export interface RequestExt<
  RT,
  Id extends string,
  I,
  A,
  E,
  R
> extends
  Commander.CommandContextLocal<Id, Id>,
  Commander.CommanderWrap<RT, Id, Id, undefined, I, A, E, R>,
  CommandRequestExtensions<RT, Id, I, A, E, R>
{
  /**
   * Send the request to the endpoint and return the raw Effect response.
   * This does not perform query cache invalidation.
   */
  request: (i: I) => Effect.Effect<A, E, R>
}

export type CommandRequestWithExtensions<RT, Req> = Req extends
  RequestHandlerWithInput<infer I, infer A, infer E, infer R, infer _Request, infer Id> ? RequestExt<RT, Id, I, A, E, R>
  : never

export interface QueryExtensions<I, A, E, R> {
  /**
   * Send the request to the endpoint and return the raw Effect response.
   * This does not set up query state tracking.
   */
  request: (i: I) => Effect.Effect<A, E, R>
}

export type QueryRequestWithExtensions<Req> = Req extends
  RequestHandlerWithInput<infer I, infer A, infer E, infer R, infer _Request, infer _Id> ? QueryExtensions<I, A, E, R>
  : never

type QueryHandler<Req> = Req extends
  RequestHandlerWithInput<infer I, infer A, infer E, infer R, infer Request, infer Id>
  ? Request["type"] extends "query" ? RequestHandlerWithInput<I, A, E, R, Request, Id> : never
  : never

type CommandHandler<Req> = Req extends
  RequestHandlerWithInput<infer I, infer A, infer E, infer R, infer Request, infer Id>
  ? Request["type"] extends "command" ? RequestHandlerWithInput<I, A, E, R, Request, Id> : never
  : never

type QueryStreamHandler<Req> = Req extends
  RequestStreamHandlerWithInput<infer I, infer A, infer E, infer R, infer Request, infer Id, infer Final>
  ? [Request["stream"], Request["type"]] extends [true, "query"]
    ? RequestStreamHandlerWithInput<I, A, E, R, Request, Id, Final>
  : never
  : never

type CommandStreamHandler<Req> = Req extends
  RequestStreamHandlerWithInput<infer I, infer A, infer E, infer R, infer Request, infer Id, infer Final>
  ? [Request["stream"], Request["type"]] extends [true, "command"]
    ? RequestStreamHandlerWithInput<I, A, E, R, Request, Id, Final>
  : never
  : never

export interface MutationExtensions<RT, Id extends string, I, A, E, R> {
  /** Defines a Command based on this mutation, taking the `id` of the mutation as the `id` of the Command.
   * The Mutation function will be taken as the first member of the Command, the Command required input will be the Mutation input.
   * see Command.wrap for details */
  wrap: <I18nKey extends string = Id, State extends Commander.IntlRecord | undefined = undefined>(
    options?: Commander.FnOptions<Id, I18nKey, State>
  ) => Commander.CommanderWrap<RT, Id, I18nKey, State, I, A, E, R>
  /** Defines a Command based on this call, taking the `id` of the mutation as the `id` of the Command.
   * see Command.fn for details */
  fn: <I18nKey extends string = Id, State extends Commander.IntlRecord | undefined = undefined>(
    options?: Commander.FnOptions<Id, I18nKey, State>
  ) => Commander.CommanderFn<RT, Id, I18nKey, State>
}

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
 *
 * When `I = void` the input argument may be omitted.
 */
export interface MutationExt<
  RT,
  Id extends string,
  I,
  A,
  E,
  R,
  EA = unknown
> extends MutationExtensions<RT, Id, I, A, E, R> {
  <B = A, E2 = never, R2 = never>(
    input: I,
    options?: MutationOptionsBase<A, B, E2, R2>
  ): Effect.Effect<B, E | E2, R | R2>

  project: <ProjSchema extends S.Top>(
    schema: EA extends ProjSchema["Encoded"] ? ProjSchema : never
  ) => MutationExt<
    RT,
    Id,
    I,
    ProjSchema["Type"],
    E | S.SchemaError,
    R | ProjSchema["DecodingServices"],
    ProjSchema["Encoded"]
  >
}

export type MutationWithExtensions<RT, Req> = Req extends
  RequestHandlerWithInput<infer I, infer A, infer E, infer R, infer Request, infer Id>
  ? MutationExt<RT, Id, I, A, E, R, Request["success"]["Encoded"]>
  : never

/**
 * The `streamFn` builder for a stream-type request handler, using the stream-specific overloads.
 */
export type StreamFnStreamExtension<RT, Req> = Req extends
  RequestStreamHandlerWithInput<infer _I, infer _A, infer _E, infer _R, infer _Request, infer Id, infer _Final>
  ? <I18nKey extends string = Id, State extends Commander.IntlRecord | undefined = undefined>(
    options?: Commander.FnOptions<Id, I18nKey, State>
  ) => Commander.StreamGen<RT, Id, I18nKey, State> & Commander.NonGenStream<RT, Id, I18nKey, State>
  : never

/**
 * `mutate` factory — wraps per-invocation invalidation scaffolding
 * into the stream itself (via `Stream.unwrap`) for use with `streamFn` combinators.
 */
export type StreamMutation2WithExtensions<RT, Req> = Req extends
  RequestStreamHandlerWithInput<infer I, infer A, infer E, infer R, infer _Request, infer Id, infer _Final> ?
    & ((input: I) => Stream.Stream<A, E, R>)
    & {
      readonly id: Id
      readonly wrap: <I18nKey extends string = Id, State extends Commander.IntlRecord | undefined = undefined>(
        options?: Commander.FnOptions<Id, I18nKey, State>
      ) => Commander.StreamerWrap<RT, Id, I18nKey, State, I, A, E, R>
    }
  : never

// we don't really care about the RT, as we are in charge of ensuring runtime safety anyway
// eslint-disable-next-line unused-imports/no-unused-vars
declare const useQuery_: QueryImpl<any>["useQuery"]
// eslint-disable-next-line unused-imports/no-unused-vars
declare const useQueryNew_: QueryImpl<any>["useQueryNew"]
// eslint-disable-next-line unused-imports/no-unused-vars
declare const useQueryAtom_: QueryImpl<any>["useQueryAtom"]
// eslint-disable-next-line unused-imports/no-unused-vars
declare const useQueryFamily_: QueryImpl<any>["useQueryFamily"]
// eslint-disable-next-line unused-imports/no-unused-vars
declare const useSuspenseQueryNew_: QueryImpl<any>["useSuspenseQueryNew"]
// eslint-disable-next-line unused-imports/no-unused-vars
declare const useSuspenseQuery_: QueryImpl<any>["useSuspenseQuery"]
// eslint-disable-next-line unused-imports/no-unused-vars
declare const useStreamQuery_: QueryImpl<any>["useStreamQuery"]
// eslint-disable-next-line unused-imports/no-unused-vars
declare const useStreamQueryFamily_: QueryImpl<any>["useStreamQueryFamily"]
// eslint-disable-next-line unused-imports/no-unused-vars
declare const useStreamQueryAtom_: QueryImpl<any>["useStreamQueryAtom"]
// eslint-disable-next-line unused-imports/no-unused-vars
declare const useStreamQueryNew_: QueryImpl<any>["useStreamQueryNew"]

export interface ProjectResult<RT, I, B, E, R, Request extends Req, Id extends string> {
  request: (i: I) => Effect.Effect<B, E, R>
  family: Exclude<R, RT> extends never ? ReturnType<typeof useQueryFamily_<I, E, B, Request, Id>>
    : MissingDependencies<RT, R> & {}
  query: Exclude<R, RT> extends never ? ReturnType<typeof useQuery_<I, E, B, Request, Id>>
    : MissingDependencies<RT, R> & {}
  queryNew: Exclude<R, RT> extends never ? ReturnType<typeof useQueryNew_<I, E, B, Request, Id>>
    : MissingDependencies<RT, R> & {}
  suspense: Exclude<R, RT> extends never ? ReturnType<typeof useSuspenseQuery_<I, E, B, Request, Id>>
    : MissingDependencies<RT, R> & {}
  suspenseNew: Exclude<R, RT> extends never ? ReturnType<typeof useSuspenseQueryNew_<I, E, B, Request, Id>>
    : MissingDependencies<RT, R> & {}
  atom: Exclude<R, RT> extends never ? ReturnType<typeof useQueryAtom_<I, E, B, Request, Id>>
    : MissingDependencies<RT, R> & {}
}

export type QueryProjection<RT, HandlerReq> = HandlerReq extends
  RequestHandlerWithInput<infer I, infer _A, infer E, infer R, infer Request, infer Id>
  ? Request["type"] extends "query" ? {
      project: <ProjSchema extends S.Top>(
        schema: Request["success"]["Encoded"] extends ProjSchema["Encoded"] ? ProjSchema : never
      ) => ProjectResult<
        RT,
        I,
        ProjSchema["Type"],
        E | S.SchemaError,
        R | ProjSchema["DecodingServices"],
        Request,
        Id
      >
    }
  : {}
  : {}

export interface QueryResultExtensions<Request extends Req, Id extends string, I, A, E> {
  /**
   * Read helper for query requests.
   * Runs as a tracked Vue Query and returns reactive state.
   * Queries read state and should not be used to mutate it.
   * When `I = void` the input argument may be omitted.
   */
  query: ReturnType<typeof useQuery_<I, E, A, Request, Id>>
  /**
   * Atom-native query helper with object return shape.
   * Additive migration surface; `.query()` remains the compatibility tuple API.
   */
  queryNew: ReturnType<typeof useQueryNew_<I, E, A, Request, Id>>
  // TODO or suspense as Option?
  /**
   * Like `.query`, but returns a Promise for setup-time awaiting.
   * Use this when integrating with Vue Suspense / error boundaries.
   */
  suspense: ReturnType<typeof useSuspenseQuery_<I, E, A, Request, Id>>
  /**
   * Promise-based setup helper with object return shape.
   * Additive migration surface; `.suspense()` remains the compatibility tuple API.
   */
  suspenseNew: ReturnType<typeof useSuspenseQueryNew_<I, E, A, Request, Id>>
  /**
   * Raw query atom for composition outside Vue refs.
   */
  atom: ReturnType<typeof useQueryAtom_<I, E, A, Request, Id>>
  /**
   * Raw query atom family for composing query graphs before choosing a Vue observer.
   */
  family: ReturnType<typeof useQueryFamily_<I, E, A, Request, Id>>
}

export type MissingDependencies<RT, R> = {
  message: "Dependencies required that are not provided by the runtime"
  dependencies: Exclude<R, RT>
}

export type Queries<RT, Req> = Req extends
  RequestHandlerWithInput<infer I, infer A, infer E, infer R, infer Request, infer Id>
  ? Request["type"] extends "query" ? Exclude<R, RT> extends never ? QueryResultExtensions<Request, Id, I, A, E>
    : {
      atom: MissingDependencies<RT, R> & {}
      family: MissingDependencies<RT, R> & {}
      query: MissingDependencies<RT, R> & {}
      queryNew: MissingDependencies<RT, R> & {}
      suspense: MissingDependencies<RT, R> & {}
      suspenseNew: MissingDependencies<RT, R> & {}
    }
  : never
  : never

export interface StreamQueryExtensions<Request extends Req, Id extends string, I, A, E> {
  atom: ReturnType<typeof useStreamQueryAtom_<I, E, A, Request, Id>>
  family: StreamQueryAtomFamily<I, A, E>
  /**
   * Stream helper for query-stream requests.
   * Legacy compatibility helper. Collects the whole stream into an array before
   * publishing data.
   * When `I = void` the input argument may be omitted.
   */
  query: ReturnType<typeof useStreamQuery_<I, E, A, Request, Id>>
  /**
   * Atom-native stream query helper. Exposes incremental pull state and a `pull`
   * command instead of collecting the whole stream first.
   */
  queryNew: ReturnType<typeof useStreamQueryNew_<I, E, A, Request, Id>>
}
export type StreamQueries<RT, HandlerReq> = HandlerReq extends
  RequestStreamHandlerWithInput<infer I, infer A, infer E, infer R, infer Request, infer Id, infer _Final>
  ? Exclude<R, RT> extends never ? StreamQueryExtensions<Request, Id, I, A, E>
  : {
    atom: MissingDependencies<RT, R> & {}
    family: MissingDependencies<RT, R> & {}
    query: MissingDependencies<RT, R> & {}
    queryNew: MissingDependencies<RT, R> & {}
  }
  : never

const _useMutation = makeMutation(atomQueryInvalidator)

const wrapWithSpan = (self: { id: string }, mut: any) => {
  const span = (eff: Effect.Effect<any, any, any>) =>
    Effect.withSpan(`mutation ${self.id}`, {}, { captureStackTrace: false })(eff)
  return (input: any, options?: MutationOptionsBase) => span(mut(input, options))
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
  self: RequestHandlerWithInput<I, A, E, R, Request, Name>
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
export const useMutationInt = (queryInvalidator: QueryInvalidator): typeof _useMutation => {
  const _useMutation = useMakeMutation(queryInvalidator)
  return (<
    I,
    E,
    A,
    R,
    Request extends Req,
    Name extends string
  >(
    self: RequestHandlerWithInput<I, A, E, R, Request, Name>
  ) =>
    Object.assign(
      wrapWithSpan(self, _useMutation(self as any)),
      { id: self.id }
    )) as any
}

export type ClientFrom<M extends RequestsAny> = RequestHandlers<never, never, M, ExtractModuleName<M>>

export class QueryImpl<R> {
  readonly getRuntime: () => Context.Context<R>

  constructor(
    getRuntime: () => Context.Context<R>,
    getAtomRt: () => AtomClientRuntime
  ) {
    this.getRuntime = getRuntime
    this.useQuery = makeQuery(this.getRuntime, getAtomRt)
    this.useQueryNew = makeQueryNew(this.getRuntime, getAtomRt)
    this.useQueryAtom = makeQueryAtom(this.getRuntime, getAtomRt)
    this.useQueryFamily = makeQueryFamily(this.getRuntime, getAtomRt)
    this.useStreamQuery = makeStreamQuery(this.getRuntime, getAtomRt)
    this.useStreamQueryFamily = makeStreamQueryFamily(this.getRuntime, getAtomRt)
    this.useStreamQueryAtom = makeStreamQueryAtom(this.getRuntime, getAtomRt)
    this.useStreamQueryNew = makeStreamQueryNew(this.getRuntime, getAtomRt)
  }
  /**
   * Effect results are passed to the caller, including errors.
   * @deprecated use client helpers instead (.query())
   */
  readonly useQuery: ReturnType<typeof makeQuery<R>>

  readonly useQueryNew: ReturnType<typeof makeQueryNew<R>>

  readonly useQueryAtom: ReturnType<typeof makeQueryAtom<R>>

  readonly useQueryFamily: ReturnType<typeof makeQueryFamily<R>>

  /**
   * Stream results are accumulated as an array of chunks and returned as reactive state.
   * @deprecated use client helpers instead (.query())
   */
  readonly useStreamQuery: ReturnType<typeof makeStreamQuery<R>>

  readonly useStreamQueryFamily: ReturnType<typeof makeStreamQueryFamily<R>>

  readonly useStreamQueryAtom: ReturnType<typeof makeStreamQueryAtom<R>>

  readonly useStreamQueryNew: ReturnType<typeof makeStreamQueryNew<R>>

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
     * When `I = void` the input argument may be omitted.
     */
    <
      I,
      E,
      A,
      Request extends Req,
      Name extends string
    >(
      self: RequestHandlerWithInput<I, A, E, R, Request, Name>
    ): {
      <TData = A>(
        arg: I | WatchSource<I>,
        options?: CustomUndefinedInitialQueryOptions<A, CauseException<E>, TData>
      ): Promise<
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
  } = <I, E, A, Request extends Req, Name extends string>(
    self: RequestHandlerWithInput<I, A, E, R, Request, Name>
  ) => {
    const runPromise = makeRunPromise(this.getRuntime())
    const q = this.useQuery(self)
    return <TData = A>(
      argOrOptions: I | WatchSource<I>,
      options?: CustomUndefinedInitialQueryOptions<A, CauseException<E>, TData>
    ) => {
      const [
        [resultRef, latestDefinedRef, fetch, uqrt],
        isMounted,
        signal
      ] = useScopedSuspenseSetup(() => {
        const [resultRef, latestRef, fetch, uqrt] = q<TData>(argOrOptions, options)
        const latestDefinedRef = computed<TData>(() => {
          const latest = latestRef.value
          if (latest === undefined) {
            throw new Error("Internal Error: suspense resolved without a latest value")
          }
          return latest
        })
        return [resultRef, latestDefinedRef, fetch, uqrt] as const
      })

      // @effect-diagnostics effect/missingEffectError:off
      const eff = Effect.gen(function*() {
        const exit = yield* uqrt.awaitResult().pipe(Effect.exit)
        if (!isMounted.value) {
          return yield* Effect.interrupt
        }
        if (Exit.isFailure(exit)) {
          return yield* Exit.failCause(exit.cause)
        }

        return [resultRef, latestDefinedRef, fetch, uqrt] as const
      })

      return runPromise(eff, { signal })
    }
  }

  readonly useSuspenseQueryNew: {
    <
      I,
      E,
      A,
      Request extends Req,
      Name extends string
    >(
      self: RequestHandlerWithInput<I, A, E, R, Request, Name>
    ): {
      <TData = A>(
        arg: I | WatchSource<I>,
        options?: AtomQueryNewOptions<A, TData>
      ): Promise<SuspenseQueryView<TData, E>>
    }
  } = <I, E, A, Request extends Req, Name extends string>(
    self: RequestHandlerWithInput<I, A, E, R, Request, Name>
  ) => {
    const runPromise = makeRunPromise(this.getRuntime())
    const q = this.useQueryNew(self)
    return <TData = A>(
      argOrOptions: I | WatchSource<I>,
      options?: AtomQueryNewOptions<A, TData>
    ) => {
      const [{ view, data }, isMounted, signal] = useScopedSuspenseSetup(() => {
        const view = q<TData>(argOrOptions, options)
        const data = computed<TData>(() => {
          const latest = view.data.value
          if (latest === undefined) {
            throw new Error("Internal Error: suspenseNew resolved without a latest value")
          }
          return latest
        })
        return { view, data }
      })

      // @effect-diagnostics effect/missingEffectError:off
      const eff = Effect.gen(function*() {
        const exit = yield* view.awaitResult().pipe(Effect.exit)
        if (!isMounted.value) {
          return yield* Effect.interrupt
        }
        if (Exit.isFailure(exit)) {
          return yield* Exit.failCause(exit.cause)
        }

        const fetch = (_options?: RefetchOptions) => view.refetch()
        const handle = {
          awaitResult: view.awaitResult,
          refetch: view.refetch,
          refresh: view.refresh,
          registry: view.registry,
          atom: view.atom
        }
        return Object.assign(
          [
            view.result,
            data,
            fetch,
            handle
          ] as const,
          {
            ...view,
            data
          }
        )
      })

      return runPromise(eff, { signal })
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

const makeResolvedAtomQueryInvalidator = <R>(getContext: () => Context.Context<R>): QueryInvalidator => {
  let reactivity: Context.Service.Shape<typeof Reactivity.Reactivity> | undefined
  const getReactivity = () => {
    if (reactivity !== undefined) return reactivity
    const service = Context.getOrUndefined(getContext(), Reactivity.Reactivity)
    if (service === undefined) {
      throw new Error("Reactivity service is missing from the client runtime")
    }
    return reactivity = service
  }

  return {
    invalidateAndAwait: (keys) =>
      invalidateAndAwait(keys).pipe(
        Effect.provideService(Reactivity.Reactivity, getReactivity())
      )
  }
}

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

  // one AtomRuntime for the query engine, built lazily from the live app context;
  // shares the ManagedRuntime memoMap so layers + Reactivity are the same instances.
  let atomRt: AtomClientRuntime | undefined
  const getAtomRt =
    () => (atomRt ??= makeAtomClientRuntime(() => Layer.succeedContext(getBaseRt()), getBaseMrt().memoMap))

  const atomInvalidator = makeResolvedAtomQueryInvalidator(getBaseRt)
  const queryInvalidator = atomInvalidator
  setQueryCacheUpdater(atomQueryCacheUpdater)

  let m: ReturnType<typeof useMutationInt>
  const useMutation = () => m ??= useMutationInt(queryInvalidator)

  let sm2: ReturnType<typeof makeStreamMutation2>
  const useStreamMutation2 = () => sm2 ??= makeStreamMutation2(queryInvalidator)

  const query = new QueryImpl(getBaseRt, getAtomRt)
  const useQuery = query.useQuery
  const useQueryNew = query.useQueryNew
  const useQueryAtom = query.useQueryAtom
  const useQueryFamily = query.useQueryFamily
  const useSuspenseQuery = query.useSuspenseQuery
  const useSuspenseQueryNew = query.useSuspenseQueryNew
  const useStreamQuery = query.useStreamQuery
  const useStreamQueryFamily = query.useStreamQueryFamily
  const useStreamQueryAtom = query.useStreamQueryAtom
  const useStreamQueryNew = query.useStreamQueryNew

  const isQueryHandler = <H extends { readonly Request: Req }>(handler: H): handler is QueryHandler<H> =>
    handler.Request.type === "query" && !handler.Request.stream

  const isStreamQueryHandler = <H extends { readonly Request: Req }>(handler: H): handler is QueryStreamHandler<H> =>
    handler.Request.type === "query" && handler.Request.stream

  const queryHelpersFor = <I, A, E, Request extends Req, Name extends string>(
    handler: RequestHandlerWithInput<I, A, E, RT, Request, Name>
  ) => ({
    family: useQueryFamily(handler),
    atom: useQueryAtom(handler),
    query: useQuery(handler),
    queryNew: useQueryNew(handler),
    suspense: useSuspenseQuery(handler),
    suspenseNew: useSuspenseQueryNew(handler)
  })

  const streamQueryHelpersFor = <I, A, E, Request extends Req, Name extends string>(
    handler: RequestStreamHandlerWithInput<I, A, E, RT, Request, Name>
  ) => ({
    family: useStreamQueryFamily(handler),
    atom: useStreamQueryAtom(handler),
    query: useStreamQuery(handler),
    queryNew: useStreamQueryNew(handler)
  })

  const projectQueryFor = <
    I,
    A,
    E,
    Request extends Req & { readonly success: S.Top & { readonly "EncodingServices": RT } },
    Name extends string
  >(
    handler: RequestHandlerWithInput<I, A, E, RT, Request, Name>
  ) =>
  <ProjSchema extends S.Top & { readonly "DecodingServices": RT }>(projectionSchema: ProjSchema) => {
    const successSchema = handler.Request.success
    const projectionHash = projectionSchemaHash(projectionSchema)
    const projected = projectHandler(handler.handler, successSchema, projectionSchema)
    const projectedHandler = {
      handler: projected,
      id: handler.id,
      Request: handler.Request,
      queryKeyProjectionHash: projectionHash
    }
    if (handler.options) {
      return {
        request: projected,
        ...queryHelpersFor({ ...projectedHandler, options: handler.options })
      }
    }
    return {
      request: projected,
      ...queryHelpersFor(projectedHandler)
    }
  }

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
    defaultInvalidation?: MutationOptionsBase["queryInvalidation"]
  ) => {
    if (!defaultInvalidation) return mut
    const apply = (callerOpts?: MutationOptionsBase) => ({
      ...callerOpts,
      queryInvalidation: callerOpts?.queryInvalidation
        ? mergeInvalidation(defaultInvalidation, callerOpts.queryInvalidation)
        : defaultInvalidation
    })
    return (input: any, callerOpts?: MutationOptionsBase) => mut(input, apply(callerOpts))
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
        const handler = client[key]
        if (isQueryHandler(handler)) {
          Object.assign(acc, {
            [camelCase(key) + "QueryFamily"]: Object.assign(useQueryFamily(handler), {
              id: client[key].id
            })
          })
          ;(acc as any)[camelCase(key) + "Query"] = Object.assign(useQuery(handler), {
            id: client[key].id
          })
          ;(acc as any)[camelCase(key) + "QueryNew"] = Object.assign(useQueryNew(handler), {
            id: client[key].id
          })
          ;(acc as any)[camelCase(key) + "SuspenseQuery"] = Object.assign(useSuspenseQuery(handler), {
            id: client[key].id
          })
          ;(acc as any)[camelCase(key) + "SuspenseQueryNew"] = Object.assign(
            useSuspenseQueryNew(handler),
            {
              id: client[key].id
            }
          )
        } else if (isStreamQueryHandler(handler)) {
          const streamHelpers = streamQueryHelpersFor(handler)
          Object.assign(acc, {
            [camelCase(key) + "QueryFamily"]: Object.assign(streamHelpers.family, {
              id: client[key].id
            }),
            [camelCase(key) + "Query"]: Object.assign(streamHelpers.query, {
              id: client[key].id
            }),
            [camelCase(key) + "QueryNew"]: Object.assign(streamHelpers.queryNew, {
              id: client[key].id
            })
          })
        }
        return acc
      },
      {} as
        & {
          [
            Key in keyof typeof client as QueryHandler<typeof client[Key]> extends never ? never
              : `${ToCamel<string & Key>}QueryFamily`
          ]: Queries<RT, QueryHandler<typeof client[Key]>>["family"]
        }
        & {
          // apparently can't get JSDoc in here..
          [
            Key in keyof typeof client as QueryHandler<typeof client[Key]> extends never ? never
              : `${ToCamel<string & Key>}Query`
          ]: Queries<RT, QueryHandler<typeof client[Key]>>["query"]
        }
        & {
          [
            Key in keyof typeof client as QueryHandler<typeof client[Key]> extends never ? never
              : `${ToCamel<string & Key>}QueryNew`
          ]: Queries<RT, QueryHandler<typeof client[Key]>>["queryNew"]
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
            Key in keyof typeof client as QueryHandler<typeof client[Key]> extends never ? never
              : `${ToCamel<string & Key>}SuspenseQueryNew`
          ]: Queries<
            RT,
            QueryHandler<typeof client[Key]>
          >["suspenseNew"]
        }
        & {
          [
            Key in keyof typeof client as QueryStreamHandler<typeof client[Key]> extends never ? never
              : `${ToCamel<string & Key>}QueryFamily`
          ]: StreamQueries<RT, QueryStreamHandler<typeof client[Key]>>["family"]
        }
        & {
          [
            Key in keyof typeof client as QueryStreamHandler<typeof client[Key]> extends never ? never
              : `${ToCamel<string & Key>}Query`
          ]: StreamQueries<RT, QueryStreamHandler<typeof client[Key]>>["query"]
        }
        & {
          [
            Key in keyof typeof client as QueryStreamHandler<typeof client[Key]> extends never ? never
              : `${ToCamel<string & Key>}QueryNew`
          ]: StreamQueries<RT, QueryStreamHandler<typeof client[Key]>>["queryNew"]
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
        if (!(client[key].Request.type === "command" && !client[key].Request.stream)) {
          return acc
        }
        const mut = client[key].handler
        const request = mut
        const fn = (options?: any) => Command.fn(client[key].id, options)
        const wrap = (options?: any) => Command.wrap({ mutate: request, id: client[key].id }, options)
        ;(acc as any)[camelCase(key) + "Request"] = Object.assign(
          mut,
          Command.fn(client[key].id), // to get the i18n key etc.
          { wrap, fn, request }
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
        if (!(client[key].Request.type === "command" && !client[key].Request.stream)) {
          return acc
        }
        const fromRequestConfig = client[key].Request.config?.["invalidatesQueries"] as
          | InvalidationCallback<InvalidationResourcesFor<M>>
          | undefined
        const fromRequest = fromRequestConfig
          ? ((defaultKey: string[], _name: string, input?: unknown, output?: unknown) =>
            fromRequestConfig(
              defaultKey,
              queryResources as never,
              input as never,
              output as never
            ) as InvalidationEntry[])
          : undefined
        const mergedInvalidation = mergeInvalidation(fromRequest, invalidation?.[key])
        const makeProjectedMutation = (handler: any): any => {
          const mut: any = withDefaultInvalidation(mutation(handler), mergedInvalidation)
          return Object.assign(mut, {
            wrap: (options?: any) => Command.wrap({ mutate: mut, id: client[key].id }, options),
            fn: (options?: any) => Command.fn(client[key].id, options),
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
    const invalidation = queryInvalidation?.(client)
    const queryResources = makeQueryResources(invalidationResources)
    const extended = Struct.keys(client).reduce(
      (acc, key) => {
        const handler = client[key]
        const requestType = handler.Request.type
        const isStream = handler.Request.stream
        const fn = Command.fn(client[key].id)
        const h_ = handler.handler
        const request = h_
        ;(acc as any)[key] = Object.assign(
          isQueryHandler(handler)
            ? {
              ...handler,
              request,
              ...queryHelpersFor(handler),
              project: projectQueryFor(handler)
            }
            : isStreamQueryHandler(handler)
            ? {
              ...client[key],
              request,
              ...streamQueryHelpersFor(handler)
            }
            : requestType === "command" && isStream
            ? (() => {
              const fromRequestConfig = client[key].Request.config?.["invalidatesQueries"] as
                | InvalidationCallback<InvalidationResourcesFor<M>>
                | undefined
              const fromRequest = fromRequestConfig
                ? ((defaultKey: string[], _name: string, input?: unknown, output?: unknown) =>
                  fromRequestConfig(
                    defaultKey,
                    queryResources as never,
                    input as never,
                    output as never
                  ) as InvalidationEntry[])
                : undefined
              const mergedInvalidation = mergeInvalidation(fromRequest, invalidation?.[key])
              const streamCmd = useCommand()
              return {
                ...client[key],
                request,
                query: useStreamQuery(client[key] as any),
                fn: (options?: any) => streamCmd.streamFn(client[key].id as any, options),
                mutate: (() => {
                  const sm2Act = useStreamMutation2()(client[key] as any, mergedInvalidation)
                  const sm2Handler = (input: any, _ctx: any) => (sm2Act as (i: any) => any)(input)
                  return Object.assign(sm2Act, {
                    id: client[key].id,
                    wrap: (options?: any) => streamCmd.streamWrap(sm2Handler, client[key].id as any, options)
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
                    fromRequestConfig(
                      defaultKey,
                      queryResources as never,
                      input as never,
                      output as never
                    ) as InvalidationEntry[])
                  : undefined
                const mergedInvalidation = mergeInvalidation(fromRequest, invalidation?.[key])
                const makeProjectedMutation = (h: any): any => {
                  const mutate = withDefaultInvalidation(mutation(h), mergedInvalidation)
                  return Object.assign(
                    mutate,
                    {
                      wrap: (options?: any) =>
                        Command.wrap({
                          mutate,
                          id: client[key].id
                        }, options),
                      fn: (options?: any) => Command.fn(client[key].id, options),
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
              fn: (options?: any) => Command.fn(client[key].id, options),
              wrap: (options?: any) => Command.wrap({ mutate: h_, id: client[key].id }, options)
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
          & (QueryStreamHandler<typeof client[Key]> extends never ? {}
            : StreamQueries<RT, QueryStreamHandler<typeof client[Key]>>)
          & (CommandHandler<typeof client[Key]> extends never ? {}
            : CommandRequestWithExtensions<RT | RTHooks, CommandHandler<typeof client[Key]>>)
          & (CommandHandler<typeof client[Key]> extends never ? {}
            : { mutate: MutationWithExtensions<RT | RTHooks, CommandHandler<typeof client[Key]>> })
          & (CommandStreamHandler<typeof client[Key]> extends never ? {}
            : {
              fn: StreamFnStreamExtension<RT | RTHooks, CommandStreamHandler<typeof client[Key]>>
              mutate: StreamMutation2WithExtensions<RT | RTHooks, CommandStreamHandler<typeof client[Key]>>
            })
          & {
            Input: typeof client[Key] extends RequestStreamHandlerWithInput<infer I, any, any, any, any, any, any> ? I
              : typeof client[Key] extends RequestHandlerWithInput<infer I, any, any, any, any, any> ? I
              : never
          }
      }
    )
    return Object.assign(extended, {
      helpers: {
        ...mapRequest(client),
        ...mapMutation(client, queryInvalidation, invalidationResources),
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
    output?: Exit.Exit<unknown, unknown>
  ) => InvalidationEntry[]
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
  extends EffectCommand<HandlerInput<I>, A, E>
{}
