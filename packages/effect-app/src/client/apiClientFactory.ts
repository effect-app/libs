/* eslint-disable @typescript-eslint/no-explicit-any */
import { Rpc, RpcClient, RpcGroup, RpcSerialization } from "@effect/rpc"
import { HttpClient, HttpClientRequest } from "../http.js"
import { Config, Context, Effect, flow, HashMap, Layer, ManagedRuntime, Option, Predicate, S, Struct } from "../internal/lib.js"
import { typedKeysOf, typedValuesOf } from "../utils.js"
import type { Client, Requests } from "./clientFor.js"

export interface ApiConfig {
  url: string
  headers: Option<HashMap<string, string>>
}

export const DefaultApiConfig = Config.all({
  url: Config.string("apiUrl").pipe(Config.withDefault("/api")),
  headers: Config
    .hashMap(
      Config.string(),
      "headers"
    )
    .pipe(Config.option)
})

type Req = S.Schema.All & {
  new(...args: any[]): any
  _tag: string
  fields: S.Struct.Fields
  success: S.Schema.Any
  failure: S.Schema.Any
  config?: Record<string, any>
}

class RequestName extends Context.Reference<RequestName>()("RequestName", {
  defaultValue: () => ({ requestName: "Unspecified", moduleName: "Error" })
}) {}

const makeProtocol = (config: ApiConfig) =>
  Effect
    .gen(function*() {
      const baseClient = yield* HttpClient.HttpClient
      const client = baseClient.pipe(
        HttpClient.mapRequest(HttpClientRequest.prependUrl(config.url + "/rpc")),
        HttpClient.mapRequest(
          HttpClientRequest.setHeaders(config.headers.pipe(Option.getOrElse(() => HashMap.empty())))
        ),
        HttpClient.mapRequestEffect((req) =>
          RequestName.pipe(
            Effect.map((ctx) =>
              flow(
                HttpClientRequest.appendUrlParam("action", ctx.requestName),
                HttpClientRequest.appendUrl("/" + ctx.moduleName)
              )(req)
            )
          )
        )
      )

      return Layer.mergeAll(
        RpcSerialization.layerJson,
        Layer.succeed(HttpClient.HttpClient, client)
      )
    })
    .pipe(Layer.unwrapEffect)

type RpcHandlers<M extends Requests> = {
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
      acc[cur as keyof Filtered] = resource[cur]
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

export const makeRpcGroup = <M extends Requests>(resource: M) => {
  const filtered = getFiltered(resource)
  type newM = typeof filtered

  const rpcs = RpcGroup.make(
    ...typedValuesOf(filtered).map((_) => {
      return Rpc.fromTaggedRequest(_ as any)
    })
  ) as RpcGroup.RpcGroup<RpcHandlers<newM>[keyof newM]>
  return rpcs
}

const makeRpcTag = <M extends Requests>(resource: M) => {
  const rpcs = makeRpcGroup(resource)
  const meta = getMeta(resource)

  return class TheClient extends Context.Tag(`RpcClient.${meta.moduleName}`)<
    TheClient,
    RpcClient.RpcClient<RpcGroup.Rpcs<typeof rpcs>>
  >() {
    static layer = Layer.scoped(TheClient, RpcClient.make(rpcs))
  }
}

const makeApiClientFactory = Effect
  .gen(function*() {
    const ctx = yield* Effect.context<RpcSerialization.RpcSerialization | HttpClient.HttpClient>()
    const makeClientFor = <M extends Requests>(resource: M, requestLevelLayers = Layer.empty) =>
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
                Layer.provideMerge(Layer.succeedContext(ctx))
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
              const Response = h.success

              const requestName = `${meta.moduleName}.${cur as string}`
                .replaceAll(".js", "")

              const requestMeta = {
                Request,
                name: requestName
              }

              const requestNameLayer = Layer.succeed(RequestName, {
                requestName: cur as string,
                moduleName: meta.moduleName
              })

              const fields = Struct.omit(Request.fields, "_tag")
              const requestAttr = h._tag
              // @ts-expect-error doc
              prev[cur] = Object.keys(fields).length === 0
                ? {
                  handler: TheClient.pipe(
                    Effect.flatMap((client) => (client as any)[requestAttr]!(new Request()) as Effect<any, any, never>),
                    Effect.withSpan("client.request " + requestName, {
                      captureStackTrace: false,
                      attributes: { "request.name": requestName }
                    }),
                    Effect.provide(requestLevelLayers),
                    Effect.provide(mr),
                    Effect.provide(requestNameLayer)
                  ),
                  ...requestMeta,
                  raw: {
                    handler: TheClient.pipe(
                      Effect.flatMap((client) =>
                        (client as any)[requestAttr]!(new Request()) as Effect<any, any, never>
                      ),
                      Effect.flatMap((res) => S.encode(Response)(res)), // TODO,
                      Effect.withSpan("client.request " + requestName, {
                        captureStackTrace: false,
                        attributes: { "request.name": requestName }
                      }),
                      Effect.provide(requestLevelLayers),
                      Effect.provide(mr),
                      Effect.provide(requestNameLayer)
                    ),

                    ...requestMeta
                  }
                }
                : {
                  handler: (req: any) =>
                    TheClient.pipe(
                      Effect.flatMap((client) =>
                        (client as any)[requestAttr]!(new Request(req)) as Effect<any, any, never>
                      ),
                      Effect.withSpan("client.request " + requestName, {
                        captureStackTrace: false,
                        attributes: { "request.name": requestName }
                      }),
                      Effect.provide(requestLevelLayers),
                      Effect.provide(mr),
                      Effect.provide(requestNameLayer)
                    ),

                  ...requestMeta,
                  raw: {
                    handler: (req: any) =>
                      TheClient.pipe(
                        Effect.flatMap((client) =>
                          (client as any)[requestAttr]!(new Request(req)) as Effect<any, any, never>
                        ),
                        Effect.flatMap((res) => S.encode(Response)(res)), // TODO,
                        Effect.withSpan("client.request " + requestName, {
                          captureStackTrace: false,
                          attributes: { "request.name": requestName }
                        }),
                        Effect.provide(requestLevelLayers),
                        Effect.provide(mr),
                        Effect.provide(requestNameLayer)
                      ),

                    ...requestMeta
                  }
                }

              return prev
            }, {} as Client<M>))
        }
      })

    const register: ManagedRuntime.ManagedRuntime<any, any>[] = []
    yield* Effect.addFinalizer(() => Effect.forEach(register, (mr) => mr.disposeEffect))

    const cacheL = new Map<any, Map<any, Client<any>>>()

    function makeClientForCached(requestLevelLayers: Layer.Layer<never, never, never>) {
      let cache = cacheL.get(requestLevelLayers)
      if (!cache) {
        cache = new Map<any, Client<any>>()
        cacheL.set(requestLevelLayers, cache)
      }

      return <M extends Requests>(
        models: M
      ): Effect<Client<Omit<M, "meta">>> =>
        Effect.gen(function*() {
          const found = cache.get(models)
          if (found) {
            return found
          }
          const m = yield* makeClientFor(models, requestLevelLayers)
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
    this.toLayerScoped(makeApiClientFactory).pipe(Layer.provide(makeProtocol(config)))
  static readonly layerFromConfig = DefaultApiConfig.pipe(Effect.map(this.layer), Layer.unwrapEffect)

  static readonly makeFor =
    (requestLevelLayers: Layer.Layer<never, never, never>) => <M extends Requests>(resource: M) =>
      this
        .use((apiClientFactory) => apiClientFactory(requestLevelLayers))
        .pipe(Effect.flatMap((f) => f(resource))) // don't rename f to clientFor or integration in vue project linked fucks up
}
