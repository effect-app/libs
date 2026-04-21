/* eslint-disable @typescript-eslint/no-explicit-any */
import { type InvalidateOptions, type InvalidateQueryFilters, isCancelledError, type QueryObserverResult, type RefetchOptions, type UseQueryReturnType } from "@tanstack/vue-query"
import { camelCase } from "change-case"
import { type Context, Effect, Exit, type Layer, type ManagedRuntime, Struct } from "effect-app"
import { type ApiClientFactory, type Req } from "effect-app/client"
import type { ExtractModuleName, RequestHandler, RequestHandlers, RequestHandlerWithInput, RequestsAny } from "effect-app/client/clientFor"
import { extendM } from "effect-app/utils"
import { type Fiber } from "effect/Fiber"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { type ComputedRef, onBeforeUnmount, ref, type WatchSource } from "vue"
import { type Commander, CommanderStatic } from "./commander.js"
import { type I18n } from "./intl.js"
import { type CommanderResolved, makeUseCommand } from "./makeUseCommand.js"
import { makeMutation, type MutationOptionsBase, useMakeMutation } from "./mutate.js"
import { type CustomUndefinedInitialQueryOptions, makeQuery } from "./query.js"
import { makeRunPromise } from "./runtime.js"
import { type Toast } from "./toast.js"

const mapHandler = <A, E, R, I = void, A2 = A, E2 = E, R2 = R>(
  handler: Effect.Effect<A, E, R> | ((i: I) => Effect.Effect<A, E, R>),
  map: (self: Effect.Effect<A, E, R>, i: I) => Effect.Effect<A2, E2, R2>
) => Effect.isEffect(handler) ? map(handler, undefined as any) : (i: I) => map(handler(i), i)

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
  R
> extends MutationExtensions<RT, Id, I, A, E, R> {
  /**
   * Send the request to the endpoint and return the raw Effect response.
   * Also invalidates query caches using the request namespace by default.
   * Namespace invalidation targets parent namespace keys
   * (for example `$project/$configuration.get` invalidates `$project`).
   * Override invalidation in client options via `queryInvalidation`.
   */
  (i: I): Effect.Effect<A, E, R>
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
  R
> extends MutationExtensions<RT, Id, void, A, E, R>, Effect.Effect<A, E, R> {
}

export type MutationWithExtensions<RT, Req> = Req extends
  RequestHandlerWithInput<infer I, infer A, infer E, infer R, infer _Request, infer Id>
  ? MutationExtWithInput<RT, Id, I, A, E, R>
  : Req extends RequestHandler<infer A, infer E, infer R, infer _Request, infer Id> ? MutationExt<RT, Id, A, E, R>
  : never

// we don't really care about the RT, as we are in charge of ensuring runtime safety anyway
// eslint-disable-next-line unused-imports/no-unused-vars
declare const useQuery_: QueryImpl<any>["useQuery"]
// eslint-disable-next-line unused-imports/no-unused-vars
declare const useSuspenseQuery_: QueryImpl<any>["useSuspenseQuery"]

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

const _useMutation = makeMutation()

/**
 * Pass an Effect or a function that returns an Effect, e.g from a client action
 * Executes query cache invalidation based on default rules or provided option.
 * adds a span with the mutation id
 */
export const useMutation: typeof _useMutation = <
  I,
  E,
  A,
  R,
  Request extends Req,
  Name extends string
>(
  self: RequestHandlerWithInput<I, A, E, R, Request, Name> | RequestHandler<A, E, R, Request, Name>,
  options?: MutationOptionsBase
) =>
  Object.assign(
    mapHandler(
      _useMutation(self as any, options),
      Effect.withSpan(`mutation ${self.id}`, {}, { captureStackTrace: false })
    ) as any,
    { id: self.id }
  )

/**
 * Pass an Effect or a function that returns an Effect, e.g from a client action
 * Executes query cache invalidation based on default rules or provided option.
 * adds a span with the mutation id
 */
export const useMutationInt = (): typeof _useMutation => {
  const _useMutation = useMakeMutation()
  return <
    I,
    E,
    A,
    R,
    Request extends Req,
    Name extends string
  >(
    self: RequestHandlerWithInput<I, A, E, R, Request, Name> | RequestHandler<A, E, R, Request, Name>,
    options?: MutationOptionsBase
  ) =>
    Object.assign(
      mapHandler(
        _useMutation(self as any, options),
        Effect.withSpan(`mutation ${self.id}`, {}, { captureStackTrace: false })
      ) as any,
      { id: self.id }
    )
}

export type ClientFrom<M extends RequestsAny> = RequestHandlers<never, never, M, ExtractModuleName<M>>

export class QueryImpl<R> {
  constructor(readonly getRuntime: () => Context.Context<R>) {
    this.useQuery = makeQuery(this.getRuntime)
  }
  /**
   * Effect results are passed to the caller, including errors.
   * @deprecated use client helpers instead (.query())
   */
  readonly useQuery: ReturnType<typeof makeQuery<R>>

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

  const query = new QueryImpl(getBaseRt)
  const useQuery = query.useQuery
  const useSuspenseQuery = query.useSuspenseQuery

  const mapQuery = <M extends RequestsAny>(
    client: ClientFrom<M>
  ) => {
    const queries = Struct.keys(client).reduce(
      (acc, key) => {
        if (client[key].Request.type !== "query") {
          return acc
        }
        ;(acc as any)[camelCase(key) + "Query"] = Object.assign(useQuery(client[key] as any), {
          id: client[key].id
        })
        ;(acc as any)[camelCase(key) + "SuspenseQuery"] = Object.assign(useSuspenseQuery(client[key] as any), {
          id: client[key].id
        })
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
    client: ClientFrom<M>
  ) => {
    const Command = useCommand()
    const mutation = useMutation()
    const mutations = Struct.keys(client).reduce(
      (acc, key) => {
        if (client[key].Request.type !== "command") {
          return acc
        }
        const mut: any = mutation(client[key] as any)
        const wrap = Command.wrap({ mutate: Effect.isEffect(mut) ? () => mut : mut, id: client[key].id })
        ;(acc as any)[camelCase(key) + "Mutation"] = Object.assign(mut, { wrap })
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
    queryInvalidation?: (client: ClientFrom<M>) => QueryInvalidation<M>
  ) =>
  (
    client: ClientFrom<M>
  ) => {
    const Command = useCommand()
    const mutation = useMutation()
    const invalidation = queryInvalidation?.(client)
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
              suspense: useSuspenseQuery(client[key] as any)
            }
            : {
              mutate: extendM(
                mutation(
                  client[key] as any,
                  invalidation?.[key] ? { queryInvalidation: invalidation[key] } : undefined
                ),
                (mutate) =>
                  Object.assign(
                    mutate,
                    {
                      wrap: Command.wrap({
                        mutate: Effect.isEffect(mutate) ? () => mutate : mutate,
                        id: client[key].id
                      })
                    }
                  )
              ),
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
              & Queries<RT, QueryHandler<typeof client[Key]>>)
          & (CommandHandler<typeof client[Key]> extends never ? {}
            : CommandRequestWithExtensions<RT | RTHooks, CommandHandler<typeof client[Key]>>)
          & (CommandHandler<typeof client[Key]> extends never ? {}
            : { mutate: MutationWithExtensions<RT | RTHooks, CommandHandler<typeof client[Key]>> })
          & { Input: typeof client[Key] extends RequestHandlerWithInput<infer I, any, any, any, any, any> ? I : never }
      }
    )
    return Object.assign(extended, { helpers: { ...mapRequest(client), ...mapMutation(client), ...mapQuery(client) } })
  }

  // TODO: Clean up this delay initialisation messs
  // TODO; invalidateQueries should perhaps be configured in the Request impl themselves?
  const clientFor__ = <M extends RequestsAny>(
    m: M,
    queryInvalidation?: (client: ClientFrom<M>) => QueryInvalidation<M>
  ) => getBaseMrt().runSync(clientFor_(m).pipe(Effect.map(mapClient(queryInvalidation))))

  // delay client creation until first access
  // the idea is that we don't need the useNuxtApp().$runtime (only available at later initialisation stage)
  // until we are at a place where it is available..
  const clientFor = <M extends RequestsAny>(
    m: M,
    queryInvalidation?: (client: ClientFrom<M>) => QueryInvalidation<M>
  ) => {
    type Client = ReturnType<typeof clientFor__<M>>
    let client: Client | undefined = undefined
    const getOrMakeClient = () => (client ??= clientFor__(m, queryInvalidation))

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
  [K in keyof M]?: (defaultKey: string[], name: string) => {
    filters?: InvalidateQueryFilters | undefined
    options?: InvalidateOptions | undefined
  }[]
}

export type ToCamel<S extends string | number | symbol> = S extends string
  ? S extends `${infer Head}_${infer Tail}` ? `${Uncapitalize<Head>}${Capitalize<ToCamel<Tail>>}`
  : Uncapitalize<S>
  : never

export interface CommandBase<I = void, A = void> {
  handle: (input: I) => A
  waiting: boolean
  blocked: boolean
  allowed: boolean
  action: string
  label: string
}

export interface EffectCommand<I = void, A = unknown, E = unknown> extends CommandBase<I, Fiber<A, E>> {}

export interface CommandFromRequest<I extends abstract new(...args: any) => any, A = unknown, E = unknown>
  extends EffectCommand<ConstructorParameters<I>[0], A, E>
{}
