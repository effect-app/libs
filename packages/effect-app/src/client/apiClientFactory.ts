/* eslint-disable @typescript-eslint/no-explicit-any */
import { flow } from "effect/Function"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"
import { Rpc, RpcClient, RpcGroup, RpcSerialization } from "effect/unstable/rpc"
import * as Config from "../Config.js"
import * as Context from "../Context.js"
import * as Effect from "../Effect.js"
import { HttpClient, HttpClientRequest } from "../http.js"
import * as Option from "../Option.js"
import type * as S from "../Schema.js"
import { typedKeysOf, typedValuesOf } from "../utils.js"
import type { Client, ClientForOptions, ExtractModuleName, RequestsAny } from "./clientFor.js"

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
  config?: Record<string, any>
  readonly id: string
  readonly moduleName: string
  readonly type: "command" | "query"
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
        return Rpc.make((_ as any)._tag, { payload: _ as any, success: (_ as any).success, error: (_ as any).error })
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
            .layerProtocolHttp({
              url: "" // why not here set meta.moduleName as root?
            })
            .pipe(
              Layer.provideMerge(Layer.succeedContext(ctx))
            )
        )
      )
      const mr = ManagedRuntime.make(clientLayer)

      const filtered = getFiltered(resource)
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
            // @ts-expect-error doc
            prev[cur] = Object.keys(fields).length === 0
              ? {
                handler: mr.contextEffect.pipe(
                  Effect.flatMap((svcs) =>
                    TheClient
                      .use((client) =>
                        (client as any)[requestAttr]!(Request.make({})) as Effect.Effect<any, any>
                      )
                      .pipe(
                        Effect.provide(layers),
                        Effect.provide(svcs)
                      )
                  )
                ),
                ...requestMeta
              }
              : {
                handler: (req: any) =>
                  mr.contextEffect.pipe(
                    Effect.flatMap((svcs) =>
                      TheClient
                        .use((client) =>
                          (client as any)[requestAttr]!(Request.make(req)) as Effect.Effect<any, any>
                        )
                        .pipe(
                          Effect.provide(layers),
                          Effect.provide(svcs)
                        )
                    )
                  ),

                ...requestMeta
              }

            return prev
          }, {} as Client<M, ExtractModuleName<M>>)
      }
    })

    const register: ManagedRuntime.ManagedRuntime<any, any>[] = []
    yield* Effect.addFinalizer(() => Effect.forEach(register, (mr) => mr.disposeEffect))

    const cacheL = new Map<any, Map<any, Client<any, any>>>()

    function makeClientForCached(requestLevelLayers: Layer.Layer<never, never>, options?: ClientForOptions) {
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
    (requestLevelLayers: Layer.Layer<never, never>, options?: ClientForOptions) =>
    <M extends RequestsAny>(
      resource: M
    ) =>
      ApiClientFactory.use((apiClientFactory) => {
        const f = apiClientFactory(requestLevelLayers, options)
        return f(resource)
      })
}
