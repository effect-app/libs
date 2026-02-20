/* eslint-disable @typescript-eslint/no-explicit-any */
import { Rpc, RpcClient, RpcGroup, RpcSerialization } from "effect/unstable/rpc"
import * as Config from "effect/Config"
import { flow } from "effect/Function"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Predicate from "effect/Predicate"
import * as ServiceMap from "effect/ServiceMap"
import * as Struct from "effect/Struct"
import * as Context from "../Context.js"
import * as Effect from "../Effect.js"
import { HttpClient, HttpClientRequest } from "../http.js"
import * as Option from "../Option.js"
import type * as S from "../Schema.js"
import { typedKeysOf, typedValuesOf } from "../utils.js"
import type { Client, ClientForOptions, Requests, RequestsAny } from "./clientFor.js"

export interface ApiConfig {
  url: string
  headers: Option.Option<Record<string, string>>
}

export const DefaultApiConfig = Config.all({
  url: Config.string("apiUrl").pipe(Config.withDefault(() => "/api")),
  headers: Config.option(
    Config.string("headers").pipe(Config.map((s) => JSON.parse(s) as Record<string, string>))
  )
})

export type Req = {
  readonly _tag: string
  readonly fields: S.Struct.Fields
  readonly success: S.Top
  readonly failure: S.Top
  readonly config?: Record<string, any>
}

const RequestName = ServiceMap.Reference<{ requestName: string; moduleName: string }>("RequestName", {
  defaultValue: () => ({ requestName: "Unspecified", moduleName: "Error" })
})

export const HttpClientLayer = (config: ApiConfig) =>
  Layer.effect(
    HttpClient.HttpClient,
    Effect
      .gen(function*() {
        const baseClient = yield* HttpClient.HttpClient
        const client = baseClient.pipe(
          HttpClient.mapRequest(HttpClientRequest.prependUrl(config.url + "/rpc")),
          HttpClient.mapRequest(
            HttpClientRequest.setHeaders(config.headers.pipe(Option.getOrElse(() => ({} as Record<string, string>))))
          ),
          HttpClient.mapRequestEffect((req) =>
            Effect.gen(function*() {
              const ctx = yield* RequestName
              return flow(
                HttpClientRequest.appendUrlParam("action", ctx.requestName),
                HttpClientRequest.appendUrl("/" + ctx.moduleName)
              )(req)
            })
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
    RpcSerialization.layerJson,
    HttpClientLayer(config)
  )

type RpcHandlers<M extends RequestsAny> = {
  [K in keyof M]: Rpc.Rpc<M[K]["_tag"], M[K], M[K]["success"], M[K]["failure"]>
}

const getFiltered = <M extends Requests>(resource: M) => {
  type Filtered = {
    [K in keyof M as M[K] extends Req ? K : never]: M[K] extends Req ? M[K] : never
  }
  // TODO: Record.filter
  const filtered = typedKeysOf(resource).reduce((acc, cur) => {
    if (
      Predicate.isObject(resource[cur])
      && (resource[cur].success)
    ) {
      acc[cur as keyof Filtered] = resource[cur] as unknown as Req
    }
    return acc
  }, {} as Record<keyof Filtered, Req>)

  return filtered as unknown as Filtered
}

export const getMeta = <M extends Requests>(resource: M) => {
  const meta = (resource as any).meta as { moduleName: string }
  if (!meta) throw new Error("No meta defined in Resource!")
  return meta as M["meta"]
}

export const makeRpcGroupFromRequestsAndModuleName = <M extends Requests, const ModuleName extends string>(
  resource: M,
  moduleName: ModuleName
) => {
  const filtered = getFiltered(resource)
  type newM = typeof filtered
  const rpcs = RpcGroup
    .make(
      ...typedValuesOf(filtered).map((_) => {
        return _ as any
      })
    )
    .prefix(`${moduleName}.`) as unknown as RpcGroup.RpcGroup<
      Rpc.Prefixed<RpcHandlers<newM>[keyof newM], `${ModuleName}.`>
    >
  return rpcs
}

export const makeRpcGroup = <
  M extends Requests,
  const ModuleName extends string
>(
  resource: M & { meta: { moduleName: ModuleName } }
) => makeRpcGroupFromRequestsAndModuleName(resource, resource.meta.moduleName)

const makeRpcTag = <M extends Requests>(resource: M) => {
  const meta = getMeta(resource)
  const rpcs = makeRpcGroupFromRequestsAndModuleName(resource, meta.moduleName)

  type ClientType = RpcClient.RpcClient<RpcGroup.Rpcs<typeof rpcs>>
  const TheClient = ServiceMap.Service<ClientType>(`RpcClient.${meta.moduleName}`)

  const layer = Layer.effect(
    TheClient,
    Effect.map(
      RpcClient.make(rpcs, { spanPrefix: "RpcClient." + meta.moduleName }),
      (cl) => (cl as any)[meta.moduleName]
    )
  )

  return Object.assign(TheClient, { layer })
}

const makeApiClientFactory = Effect
  .gen(function*() {
    const ctx = yield* Effect.services<RpcSerialization.RpcSerialization | HttpClient.HttpClient>()
    const makeClientFor = <M extends Requests>(
      resource: M,
      requestLevelLayers = Layer.empty,
      options?: ClientForOptions
    ) =>
      Effect.gen(function*() {
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
              .layerProtocolHttp({
                url: "" // why not here set meta.moduleName as root?
              })
              .pipe(
                Layer.provideMerge(Layer.succeedServices(ctx))
              )
          )
        )
        const mr = ManagedRuntime.make(clientLayer)

        const filtered = getFiltered(resource)
        return {
          mr,
          client: (typedKeysOf(filtered)
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
              const requestAttr = h._tag
              // @ts-expect-error doc
              prev[cur] = Object.keys(fields).length === 0
                ? {
                  handler: Effect.gen(function*() {
                    const client = yield* TheClient
                    return yield* ((client as any)[requestAttr]!({ _tag: requestAttr }) as Effect.Effect<any, any, never>)
                  }).pipe(
                    Effect.provide(layers),
                    Effect.provide(Layer.effectServices(mr.servicesEffect))
                  ),
                  ...requestMeta
                }
                : {
                  handler: (req: any) =>
                    Effect.gen(function*() {
                      const client = yield* TheClient
                      return yield* ((client as any)[requestAttr]!({ _tag: requestAttr, ...req }) as Effect.Effect<any, any, never>)
                    }).pipe(
                      Effect.provide(layers),
                      Effect.provide(Layer.effectServices(mr.servicesEffect))
                    ),

                  ...requestMeta
                }

              return prev
            }, {} as Client<M, M["meta"]["moduleName"]>))
        }
      })

    const register: ManagedRuntime.ManagedRuntime<any, any>[] = []
    yield* Effect.addFinalizer(() => Effect.forEach(register, (mr) => mr.disposeEffect))

    const cacheL = new Map<any, Map<any, Client<any, any>>>()

    function makeClientForCached(requestLevelLayers: Layer.Layer<never, never, never>, options?: ClientForOptions) {
      let cache = cacheL.get(requestLevelLayers)
      if (!cache) {
        cache = new Map<any, Client<any, any>>()
        cacheL.set(requestLevelLayers, cache)
      }

      return <M extends Requests>(
        models: M
      ): Effect.Effect<Client<M, M["meta"]["moduleName"]>> =>
        Effect.gen(function*() {
          const found = cache.get(models)
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
  extends Context.TagId("ApiClientFactory")<ApiClientFactory, Effect.Success<typeof makeApiClientFactory>>()
{
  static readonly layer = (config: ApiConfig) =>
    this.toLayerScoped(makeApiClientFactory).pipe(Layer.provide(RpcSerializationLayer(config)))
  static readonly layerFromConfig = Layer.unwrap(
    Effect.gen(function*() {
      const config = yield* DefaultApiConfig
      return ApiClientFactory.layer(config)
    })
  )

  static readonly makeFor =
    (requestLevelLayers: Layer.Layer<never, never, never>, options?: ClientForOptions) =>
    <M extends Requests>(
      resource: M
    ) =>
      this
        .use((apiClientFactory: any) => (apiClientFactory as any)(requestLevelLayers, options))
        .pipe(
          Effect.flatMap((f) => (f as any)(resource))
        ) // don't rename f to clientFor or integration in vue project linked fucks up
}
