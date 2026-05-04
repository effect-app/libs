/* eslint-disable @typescript-eslint/no-explicit-any */
import { constant, flow } from "effect/Function"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Struct from "effect/Struct"
import { Rpc, RpcClient, RpcGroup, RpcSerialization } from "effect/unstable/rpc"
import * as Config from "../Config.js"
import * as Context from "../Context.js"
import * as Effect from "../Effect.js"
import { HttpClient, HttpClientRequest } from "../http.js"
import { Invalidation } from "../rpc.js"
import type * as S from "../Schema.js"
import { typedKeysOf, typedValuesOf } from "../utils.js"
import type { Client, ClientForOptions, ExtractModuleName, RequestsAny } from "./clientFor.js"
import { InvalidationKeysFromServer } from "./InvalidationKeys.js"

export interface ApiConfig {
  url: string
  headers: Option.Option<Record<string, string>>
}

export const DefaultApiConfig = Config.all({
  url: Config.string("apiUrl").pipe(Config.withDefault("/api")),
  headers: Config
    .schema(
      Config.Record(Schema.String, Schema.String),
      "headers"
    )
    .pipe(Config.option)
})

export type Req = S.Top & {
  readonly make: (...args: any[]) => any
  _tag: string
  fields: S.Struct.Fields
  success: S.Top
  error: S.Top
  /** Optional final-value schema for stream requests. When set, the execute effect resolves with the last stream value decoded to this type. */
  final?: S.Top
  config?: Record<string, any>
  readonly id: string
  readonly moduleName: string
  readonly type: "command" | "query" | "stream"
  readonly "~decodingServices"?: unknown
}

class RequestName extends Context.Reference("RequestName", {
  defaultValue: () => ({ requestName: "Unspecified", moduleName: "Error" })
}) {}

export const HttpClientLayer = (config: ApiConfig) =>
  Layer.effect(
    HttpClient.HttpClient,
    Effect
      .gen(function*() {
        const baseClient = yield* HttpClient.HttpClient
        const client = baseClient.pipe(
          HttpClient.mapRequest(HttpClientRequest.prependUrl(config.url + "/rpc")),
          HttpClient.mapRequest(
            HttpClientRequest.setHeaders(config.headers.pipe(Option.getOrElse(() => ({}))))
          ),
          HttpClient.mapRequestEffect((req) =>
            Effect.map(RequestName.asEffect(), (ctx) =>
              flow(
                HttpClientRequest.appendUrlParam("action", ctx.requestName),
                HttpClientRequest.appendUrl("/" + ctx.moduleName)
              )(req))
          )
        )
        return client
      })
  )

export const HttpClientFromConfigLayer = Layer.unwrap(
  Effect.gen(function*() {
    const config = yield* DefaultApiConfig
    return HttpClientLayer(config)
  })
)

export const RpcSerializationLayer = (config: ApiConfig) =>
  Layer.mergeAll(
    RpcSerialization.layerNdjson,
    HttpClientLayer(config)
  )

type RpcHandlers<M extends RequestsAny> = {
  [K in keyof M]: Rpc.Rpc<M[K]["_tag"], M[K], M[K]["success"], M[K]["error"]>
}

const getFiltered = <M extends RequestsAny>(resource: M) => {
  type Filtered = {
    [K in keyof M as M[K] extends Req ? K : never]: M[K] extends Req ? M[K] : never
  }
  // TODO: Record.filter
  const filtered = typedKeysOf(resource).reduce((acc, cur) => {
    if (
      Predicate.isObjectKeyword(resource[cur])
      && (resource[cur].success)
    ) {
      acc[cur as keyof Filtered] = resource[cur] as any
    }
    return acc
  }, {} as Record<keyof Filtered, Req>)

  return filtered as unknown as Filtered
}

export const getMeta = <M extends RequestsAny>(resource: M): { moduleName: ExtractModuleName<M> } => {
  const first = typedValuesOf(getFiltered(resource))[0]
  if (first && "moduleName" in first) return { moduleName: first.moduleName }
  throw new Error("No moduleName on requests!")
}

export const makeRpcGroupFromRequestsAndModuleName = <M extends RequestsAny, const ModuleName extends string>(
  resource: M,
  moduleName: ModuleName
) => {
  const filtered = getFiltered(resource)
  type newM = typeof filtered
  const rpcs = RpcGroup
    .make(
      ...typedValuesOf(filtered).map((_) => {
        const r = _ as any
        const isStream = r.type === "stream"
        const isCommand = r.type === "command"
        return (isCommand
          ? Invalidation.makeCommandRpc(r._tag, { payload: r, success: r.success, error: r.error })
          : isStream
          ? Invalidation.makeStreamRpc(r._tag, {
            payload: r,
            success: r.success,
            error: r.error,
            stream: true as const
          })
          : Rpc.make(r._tag, { payload: r, success: r.success, error: r.error })) as any
      })
    )
    .prefix(`${moduleName}.`) as unknown as RpcGroup.RpcGroup<
      Rpc.Prefixed<RpcHandlers<newM>[keyof newM], `${ModuleName}.`>
    >
  return rpcs
}

const makeRpcTag = <M extends RequestsAny>(resource: M) => {
  const meta = getMeta(resource)
  const rpcs = makeRpcGroupFromRequestsAndModuleName(resource, meta.moduleName)

  // Use Object.assign instead of class extension to avoid TS2509 with complex generic return types.
  // The first type arg is `any` because this is a dynamically created tag — its identity is the string key.
  const TheClient = Context.Opaque<
    any,
    RpcClient.RpcClient<RpcGroup.Rpcs<typeof rpcs>>
  >()(`RpcClient.${meta.moduleName}`)
  // Use Layer.effect directly (not TheClient.toLayer) so TypeScript properly excludes Scope
  const layer = Layer.effect(
    TheClient,
    RpcClient.make(rpcs, { spanPrefix: "RpcClient." + meta.moduleName })
  )
  return Object.assign(TheClient, { layer })
}

const makeApiClientFactory = Effect
  .gen(function*() {
    const ctx = yield* Effect.context<RpcSerialization.RpcSerialization | HttpClient.HttpClient>()
    const makeClientFor = Effect.fnUntraced(function*<M extends RequestsAny>(
      resource: M,
      requestLevelLayers = Layer.empty,
      options?: ClientForOptions
    ) {
      const TheClient = makeRpcTag(resource)

      const meta = getMeta(resource)

      // TODO: somehow we need a protocol per REQUEST kind of it seems ...
      // otherwise it locks up on the client, navigation remains empty...
      const clientLayer = TheClient.layer.pipe(
        // add ApiClientFactory for nested schemas
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        Layer.provide(Layer.succeed(ApiClientFactory, makeClientForCached as any)),
        Layer.provide(
          RpcClient
            .layerProtocolHttp({ url: "" }) // why not here set meta.moduleName as root?
            .pipe(
              Layer.provideMerge(Layer.succeedContext(ctx))
            )
        )
      )
      const mr = ManagedRuntime.make(clientLayer)

      const filtered = getFiltered(resource)

      const unwrapCommand = (eff: Effect.Effect<any, any, any>): Effect.Effect<any, any, any> =>
        eff.pipe(
          Effect.flatMap((result: any) =>
            Effect.gen(function*() {
              const keys: ReadonlyArray<Invalidation.InvalidationKey> = result?.metadata?.invalidateQueries ?? []
              const invalidationKeys = yield* InvalidationKeysFromServer
              yield* Effect.forEach(keys, (key) => invalidationKeys.add(key), { discard: true })
              return result.payload
            })
          ),
          // V2: unwrap CommandFailureWithMetaData failures — forward keys, re-fail with the
          // original error so callers see the unmodified error type.
          Effect.catch((result: any) =>
            result?._tag === "CommandFailureWithMetaData"
              ? Effect.gen(function*() {
                const keys: ReadonlyArray<Invalidation.InvalidationKey> = result.metadata?.invalidateQueries ?? []
                const invalidationKeys = yield* InvalidationKeysFromServer
                yield* Effect.forEach(keys, (key) => invalidationKeys.add(key), { discard: true })
                return yield* Effect.fail(result.error)
              })
              : Effect.fail(result)
          )
        )

      return {
        mr,
        client: typedKeysOf(filtered)
          .reduce((prev, cur) => {
            const h = filtered[cur]!

            const Request = h

            const id = `${meta.moduleName}.${cur as string}`
              .replaceAll(".js", "")

            const requestMeta = {
              Request,
              id,
              options
            }

            const requestNameLayer = Layer.succeed(RequestName, {
              requestName: cur as string,
              moduleName: meta.moduleName
            })

            const layers = requestLevelLayers.pipe(Layer.provideMerge(requestNameLayer))

            const fields = Struct.omit(Request.fields, ["_tag"] as const)
            const requestAttr = `${meta.moduleName}.${h._tag}`
            const isCommand = h.type === "command"
            const isStream = h.type === "stream"

            const buildEffect = (input: any) =>
              mr.contextEffect.pipe(
                Effect.flatMap((svcs) => {
                  const rpcEffect = TheClient
                    .use((client) => (client as any)[requestAttr]!(Request.make(input)) as Effect.Effect<any, any>)
                    .pipe(
                      Effect.provide(layers),
                      Effect.provide(svcs)
                    )
                  return isCommand ? unwrapCommand(rpcEffect) : rpcEffect
                })
              )

            const buildStream = (input: any) =>
              Stream.unwrap(
                mr.contextEffect.pipe(
                  Effect.flatMap((svcs) =>
                    TheClient
                      .useSync((client) => {
                        const rpcStream = (client as any)[requestAttr]!(
                          Request.make(input)
                        ) as Stream.Stream<any, any, any>
                        return rpcStream.pipe(
                          // Collect server invalidation keys from the "done" chunk, then discard it.
                          Stream.tap((item: any) =>
                            item._tag === "done" || item._tag === "metadata"
                              ? InvalidationKeysFromServer.use((svc) =>
                                Effect.forEach(
                                  (item.metadata as Invalidation.CommandMetaData).invalidateQueries,
                                  svc.add,
                                  { discard: true }
                                )
                              )
                              : Effect.void
                          ),
                          Stream.filter((item: any) => item._tag === "value"),
                          Stream.map((item: any) => item.value),
                          // V2: unwrap StreamFailureChunk — forward keys from failures too,
                          // then re-fail with the original error so callers see the unmodified
                          // error type.
                          Stream.catch((err: any) =>
                            err?._tag === "error" && err?.metadata
                              ? Stream.fromEffect(
                                InvalidationKeysFromServer.use((svc) =>
                                  Effect
                                    .forEach(
                                      (err.metadata as Invalidation.CommandMetaData).invalidateQueries,
                                      svc.add,
                                      { discard: true }
                                    )
                                    .pipe(Effect.flatMap(() => Effect.fail(err.error)))
                                )
                              )
                              : Stream.fail(err)
                          ),
                          Stream.provide(layers),
                          Stream.provide(svcs)
                        )
                      })
                      .pipe(Effect.provide(svcs))
                  )
                )
              )

            // @ts-expect-error doc
            prev[cur] = Object.keys(fields).length === 0
              ? {
                handler: isStream ? constant(buildStream({})) : constant(buildEffect({})),
                ...requestMeta
              }
              : {
                handler: isStream
                  ? (req: any) => buildStream(req)
                  : (req: any) => buildEffect(req),
                ...requestMeta
              }

            return prev
          }, {} as Client<M, ExtractModuleName<M>>)
      }
    })

    const register: ManagedRuntime.ManagedRuntime<any, any>[] = []
    yield* Effect.addFinalizer(() => Effect.forEach(register, (mr) => mr.disposeEffect))

    const cacheL = new Map<any, Map<any, Client<any, any>>>()

    function makeClientForCached(requestLevelLayers: Layer.Layer<never>, options?: ClientForOptions) {
      let cache = cacheL.get(requestLevelLayers)
      if (!cache) {
        cache = new Map<any, Client<any, any>>()
        cacheL.set(requestLevelLayers, cache)
      }

      return Effect.fnUntraced(function*<M extends RequestsAny>(models: M) {
        const found = cache.get(models) as Client<M, ExtractModuleName<M>> | undefined
        if (found) {
          return found
        }
        const m = yield* makeClientFor(models, requestLevelLayers, options)
        cache.set(models, m.client)
        register.push(m.mr)
        return m.client
      })
    }

    return makeClientForCached
  })

/**
 * Used to create clients for resource modules.
 */
export class ApiClientFactory
  extends Context.Opaque<ApiClientFactory, Effect.Success<typeof makeApiClientFactory>>()("ApiClientFactory")
{
  static readonly layer = (config: ApiConfig) =>
    ApiClientFactory.toLayer(makeApiClientFactory).pipe(Layer.provide(RpcSerializationLayer(config)))
  static readonly layerFromConfig = Layer.unwrap(
    Effect.gen(function*() {
      const config = yield* DefaultApiConfig
      return ApiClientFactory.layer(config)
    })
  )

  static readonly makeFor =
    (requestLevelLayers: Layer.Layer<never>, options?: ClientForOptions) =>
    <M extends RequestsAny>(
      resource: M
    ) =>
      ApiClientFactory.use((apiClientFactory) => {
        const f = apiClientFactory(requestLevelLayers, options)
        return f(resource)
      })
}
